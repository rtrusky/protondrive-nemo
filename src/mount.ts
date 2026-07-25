import { mkdir } from 'node:fs/promises';

import Fuse from '@cocalc/fuse-native';

import { ContentStore } from './contentStore';
import { DriveTree } from './driveTree';
import { createFuseOperations } from './fuseOps';
import type { initDrive } from './sdk-bootstrap/init';

export async function mount(drive: Awaited<ReturnType<typeof initDrive>>, mountPoint: string): Promise<Fuse> {
    if (!drive.auth.isLoggedIn()) {
        throw new Error('Not logged in. Run `protondrive-nemo login` first.');
    }

    await mkdir(mountPoint, { recursive: true });

    const tree = new DriveTree(drive.sdk, drive.logger);
    const contentCacheDir = `${drive.config.cacheDir}/blobs`;
    const content = new ContentStore(drive.sdk, contentCacheDir, drive.logger);
    const ops = createFuseOperations(drive.sdk, tree, content, drive.logger);

    const fuse = new Fuse(mountPoint, ops, {
        force: true,
        mkdir: true,
        fsname: 'protondrive-nemo',
        displayFolder: 'Proton Drive',
        debug: process.env.PROTONDRIVE_NEMO_FUSE_DEBUG === '1',
    });

    await new Promise<void>((resolve, reject) => {
        fuse.mount((err) => (err ? reject(err) : resolve()));
    });

    return fuse;
}

export async function unmount(mountPoint: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        Fuse.unmount(mountPoint, (err) => (err ? reject(err) : resolve()));
    });
}
