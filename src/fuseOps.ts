import { constants as fsConstants } from 'node:fs';
import { open as fsOpen, stat as fsStat, truncate as fsTruncate, type FileHandle } from 'node:fs/promises';

import Fuse from '@cocalc/fuse-native';
import { MemberRole, NodeType } from '@protontech/drive-sdk';
import type { Logger, NodeEntity, ProtonDriveClient } from '@protontech/drive-sdk';

import { ContentStore } from './contentStore';
import { DriveTree, NodeNotFoundError } from './driveTree';

interface OpenFile {
    path: string;
    node: NodeEntity;
    localPath: string;
    handle: FileHandle;
    dirty: boolean;
    isNewFile: boolean;
    parentUid: string;
    name: string;
}

function statFor(node: NodeEntity): Fuse.Stats {
    const isFolder = node.type === NodeType.Folder;
    const size = isFolder ? 4096 : node.activeRevision?.ok ? (node.activeRevision.value.claimedSize ?? 0) : 0;
    const mtime = node.modificationTime ?? new Date();
    const uid = process.getuid ? process.getuid() : 0;
    const gid = process.getgid ? process.getgid() : 0;
    return {
        mtime,
        atime: mtime,
        ctime: mtime,
        nlink: 1,
        size,
        mode: isFolder ? fsConstants.S_IFDIR | 0o755 : fsConstants.S_IFREG | 0o644,
        uid,
        gid,
    } as Fuse.Stats;
}

async function statForOpenFile(file: OpenFile): Promise<Fuse.Stats> {
    const local = await fsStat(file.localPath);
    const uid = process.getuid ? process.getuid() : 0;
    const gid = process.getgid ? process.getgid() : 0;
    return {
        mtime: local.mtime,
        atime: local.atime,
        ctime: local.ctime,
        nlink: 1,
        size: local.size,
        mode: fsConstants.S_IFREG | 0o644,
        uid,
        gid,
    } as Fuse.Stats;
}

function placeholderNode(path: string, name: string): NodeEntity {
    return {
        uid: `pending:${path}`,
        name: { ok: true, value: name },
        type: NodeType.File,
        keyAuthor: {} as NodeEntity['keyAuthor'],
        nameAuthor: {} as NodeEntity['nameAuthor'],
        directRole: MemberRole.Editor,
        ownedBy: {},
        isShared: false,
        isSharedPublicly: false,
        creationTime: new Date(),
        modificationTime: new Date(),
        treeEventScopeId: '',
    };
}

/**
 * FUSE operation handlers backing the `~/ProtonDrive` mount. Only "My
 * Files" is exposed (no Trash/Devices/Shared/Photos in v1). Content is
 * fully materialized locally on open and uploaded on release — see
 * contentStore.ts.
 */
export interface FuseOperationsHandle {
    ops: Fuse.OPERATIONS;
    /** True if the path has a locally open handle with changes not yet uploaded (dirty write or brand-new file). */
    hasUnsavedChanges: (path: string) => boolean;
}

export function createFuseOperations(
    sdk: ProtonDriveClient,
    tree: DriveTree,
    content: ContentStore,
    logger: Logger,
): FuseOperationsHandle {
    const openFiles = new Map<number, OpenFile>();
    // Mirrors openFiles, keyed by path: a file that was just create()'d
    // doesn't exist as a Drive node yet (it's uploaded on release), but the
    // kernel calls getattr() on it immediately as part of completing the
    // create — this is how getattr answers for it in the meantime.
    const openFilesByPath = new Map<string, OpenFile>();
    let nextFd = 1000;

    async function openLocal(
        path: string,
        node: NodeEntity,
        localPath: string,
        extra: Omit<OpenFile, 'path' | 'node' | 'localPath' | 'handle'>,
    ): Promise<number> {
        const handle = await fsOpen(localPath, 'r+');
        const fd = nextFd++;
        const file: OpenFile = { path, node, localPath, handle, ...extra };
        openFiles.set(fd, file);
        openFilesByPath.set(path, file);
        return fd;
    }

    const ops: Fuse.OPERATIONS = {
        getattr(path, cb) {
            if (path === '/') {
                cb(0, {
                    mtime: new Date(),
                    atime: new Date(),
                    ctime: new Date(),
                    nlink: 1,
                    size: 4096,
                    mode: fsConstants.S_IFDIR | 0o755,
                    uid: process.getuid ? process.getuid() : 0,
                    gid: process.getgid ? process.getgid() : 0,
                } as Fuse.Stats);
                return;
            }
            const openFile = openFilesByPath.get(path);
            if (openFile) {
                statForOpenFile(openFile)
                    .then((stat) => cb(0, stat))
                    .catch((err) => cb(errnoFor(err)));
                return;
            }
            tree
                .resolve(path)
                .then((node) => cb(0, statFor(node)))
                .catch((err) => cb(errnoFor(err)));
        },

        readdir(path, cb) {
            (path === '/' ? tree.getRootUid() : tree.resolve(path).then((n) => n.uid))
                .then((parentUid) => tree.listChildren(parentUid))
                .then((children) => cb(0, [...children.keys()]))
                .catch((err) => cb(errnoFor(err)));
        },

        open(path, _flags, cb) {
            // A file created moments ago may still be uploading in the
            // background (release() doesn't block the writer's close()) —
            // reopening it while that's in flight should read/write the
            // same local copy, not fail because it's not a Drive node yet.
            // isNewFile:false/dirty:false means this handle's own release()
            // won't itself trigger another upload; the original creator's
            // release() remains the sole uploader.
            const pending = openFilesByPath.get(path);
            if (pending) {
                openLocal(path, pending.node, pending.localPath, {
                    dirty: false,
                    isNewFile: false,
                    parentUid: pending.parentUid,
                    name: pending.name,
                })
                    .then((fd) => cb(0, fd))
                    .catch((err) => cb(errnoFor(err)));
                return;
            }
            tree
                .resolve(path)
                .then(async (node) => {
                    const localPath = await content.ensureDownloaded(node);
                    const { parent, name } = await tree.resolveParent(path);
                    const fd = await openLocal(path, node, localPath, {
                        dirty: false,
                        isNewFile: false,
                        parentUid: parent.uid,
                        name,
                    });
                    cb(0, fd);
                })
                .catch((err) => cb(errnoFor(err)));
        },

        create(path, _mode, cb) {
            tree
                .resolveParent(path)
                .then(async ({ parent, name }) => {
                    const node = placeholderNode(path, name);
                    const localPath = await content.createEmptyLocal(node.uid);
                    const fd = await openLocal(path, node, localPath, {
                        dirty: false,
                        isNewFile: true,
                        parentUid: parent.uid,
                        name,
                    });
                    cb(0, fd);
                })
                .catch((err) => cb(errnoFor(err)));
        },

        read(_path, fd, buffer, length, position, cb) {
            const file = openFiles.get(fd);
            if (!file) {
                cb(Fuse.EBADF);
                return;
            }
            file.handle
                .read(buffer, 0, length, position)
                .then((res) => cb(res.bytesRead))
                .catch(() => cb(0));
        },

        write(_path, fd, buffer, length, position, cb) {
            const file = openFiles.get(fd);
            if (!file) {
                cb(Fuse.EBADF);
                return;
            }
            file.handle
                .write(buffer, 0, length, position)
                .then((res) => {
                    file.dirty = true;
                    cb(res.bytesWritten);
                })
                .catch(() => cb(0));
        },

        ftruncate(_path, fd, size, cb) {
            const file = openFiles.get(fd);
            if (!file) {
                cb(Fuse.EBADF);
                return;
            }
            file.handle
                .truncate(size)
                .then(() => {
                    file.dirty = true;
                    cb(0);
                })
                .catch((err) => cb(errnoFor(err)));
        },

        truncate(path, size, cb) {
            tree
                .resolve(path)
                .then((node) => content.ensureDownloaded(node))
                .then((localPath) => fsTruncate(localPath, size))
                .then(() => cb(0))
                .catch((err) => cb(errnoFor(err)));
        },

        release(_path, fd, cb) {
            const file = openFiles.get(fd);
            if (!file) {
                cb(0);
                return;
            }
            openFiles.delete(fd);
            file.handle
                .close()
                .catch(() => {})
                .then(async () => {
                    // A brand-new file must be uploaded even if it was
                    // never written to (e.g. `touch`) — it doesn't exist on
                    // Drive at all yet. An existing file only needs a new
                    // revision if it was actually modified.
                    if (!file.isNewFile && !file.dirty) {
                        return;
                    }
                    if (file.isNewFile) {
                        const created = await content.uploadNewFile(file.parentUid, file.name, file.localPath);
                        tree.rememberNode(created);
                        await content.forget(file.node.uid);
                    } else {
                        await content.uploadRevision(file.node, file.localPath);
                    }
                    tree.invalidate(file.parentUid);
                })
                .then(() => {
                    if (openFilesByPath.get(file.path) === file) {
                        openFilesByPath.delete(file.path);
                    }
                    cb(0);
                })
                .catch((err) => {
                    if (openFilesByPath.get(file.path) === file) {
                        openFilesByPath.delete(file.path);
                    }
                    logger.error(`Failed to upload ${file.name} on release`, err);
                    cb(errnoFor(err));
                });
        },

        mkdir(path, _mode, cb) {
            tree
                .resolveParent(path)
                .then(async ({ parent, name }) => {
                    await sdk.createFolder(parent.uid, name);
                    tree.invalidate(parent.uid);
                    cb(0);
                })
                .catch((err) => cb(errnoFor(err)));
        },

        unlink(path, cb) {
            Promise.all([tree.resolve(path), tree.resolveParent(path)])
                .then(async ([node, { parent }]) => {
                    await drain(sdk.trashNodes([node.uid]));
                    tree.forgetNode(node.uid);
                    tree.invalidate(parent.uid);
                    await content.forget(node.uid);
                    cb(0);
                })
                .catch((err) => cb(errnoFor(err)));
        },

        rmdir(path, cb) {
            Promise.all([tree.resolve(path), tree.resolveParent(path)])
                .then(async ([node, { parent }]) => {
                    await drain(sdk.trashNodes([node.uid]));
                    tree.forgetNode(node.uid);
                    tree.invalidate(parent.uid);
                    cb(0);
                })
                .catch((err) => cb(errnoFor(err)));
        },

        rename(src, dest, cb) {
            Promise.all([tree.resolve(src), tree.resolveParent(src), tree.resolveParent(dest)])
                .then(async ([node, srcCtx, destCtx]) => {
                    if (srcCtx.parent.uid !== destCtx.parent.uid) {
                        await drain(sdk.moveNodes([node.uid], destCtx.parent.uid));
                    }
                    if (srcCtx.name !== destCtx.name) {
                        await sdk.renameNode(node.uid, destCtx.name);
                    }
                    tree.invalidate(srcCtx.parent.uid, destCtx.parent.uid);
                    cb(0);
                })
                .catch((err) => cb(errnoFor(err)));
        },
    };

    function hasUnsavedChanges(path: string): boolean {
        const file = openFilesByPath.get(path);
        return !!file && (file.dirty || file.isNewFile);
    }

    return { ops, hasUnsavedChanges };
}

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
    for await (const _item of iterable) {
        // Consume the async generator so the operation actually executes.
    }
}

function errnoFor(err: unknown): number {
    if (err instanceof NodeNotFoundError) {
        return Fuse.ENOENT;
    }
    return Fuse.EIO;
}
