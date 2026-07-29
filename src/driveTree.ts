import type { Logger, NodeEntity, ProtonDriveClient } from '@protontech/drive-sdk';

// Directory listings are cheap to re-fetch (the SDK's own entities cache
// already avoids re-hitting the network for unchanged data) but FUSE issues
// a getattr/readdir per visible file, so we still keep a short-lived local
// index to avoid re-iterating a folder's children on every single call.
const LISTING_TTL_MS = 10_000;

export class NodeNotFoundError extends Error {
    constructor(path: string) {
        super(`No such file or directory: ${path}`);
        this.name = 'NodeNotFoundError';
    }
}

interface CachedListing {
    byName: Map<string, NodeEntity>;
    fetchedAt: number;
}

/**
 * Resolves POSIX paths under the FUSE mount root to Proton Drive node UIDs,
 * scoped to "My Files" (the only section this v1 exposes). The SDK's own
 * API is UID/parent-child graph based, not path based — this is the
 * adapter FUSE needs, following the same walk-and-match-by-name pattern as
 * ProtonDriveApps/sdk's own CLI (`cli/src/cli/paths.ts`).
 */
export class DriveTree {
    private rootUidPromise?: Promise<string>;
    private readonly listingsByParentUid = new Map<string, CachedListing>();
    private readonly nodesByUid = new Map<string, NodeEntity>();

    constructor(
        private readonly sdk: ProtonDriveClient,
        private readonly logger: Logger,
    ) {}

    async getRootUid(): Promise<string> {
        if (!this.rootUidPromise) {
            this.rootUidPromise = this.sdk
                .getMyFilesRootFolder()
                .then((node) => {
                    this.nodesByUid.set(node.uid, node);
                    return node.uid;
                })
                .catch((err) => {
                    // Don't let a transient failure (e.g. no network yet at
                    // mount startup) permanently poison every future lookup
                    // with the same rejected promise — let the next caller retry.
                    this.rootUidPromise = undefined;
                    throw err;
                });
        }
        return this.rootUidPromise;
    }

    /** Splits a FUSE path like "/Documents/report.pdf" into ["Documents", "report.pdf"]. */
    static splitPath(fusePath: string): string[] {
        return fusePath.split('/').filter((segment) => segment.length > 0);
    }

    async resolve(fusePath: string): Promise<NodeEntity> {
        const rootUid = await this.getRootUid();
        let node = this.mustGetNode(rootUid);
        for (const segment of DriveTree.splitPath(fusePath)) {
            const children = await this.listChildren(node.uid);
            const child = children.get(segment);
            if (!child) {
                throw new NodeNotFoundError(fusePath);
            }
            node = child;
        }
        return node;
    }

    async resolveParent(fusePath: string): Promise<{ parent: NodeEntity; name: string }> {
        const segments = DriveTree.splitPath(fusePath);
        const name = segments.pop();
        if (!name) {
            throw new Error('Root has no parent');
        }
        const parent = await this.resolve('/' + segments.join('/'));
        return { parent, name };
    }

    async listChildren(parentUid: string, opts: { forceRefresh?: boolean } = {}): Promise<Map<string, NodeEntity>> {
        const cached = this.listingsByParentUid.get(parentUid);
        const isFresh = cached && Date.now() - cached.fetchedAt < LISTING_TTL_MS;
        if (cached && isFresh && !opts.forceRefresh) {
            return cached.byName;
        }

        const byName = new Map<string, NodeEntity>();
        const uids: string[] = [];
        for await (const uid of this.sdk.iterateFolderChildrenNodeUids(parentUid)) {
            uids.push(uid);
        }
        for await (const maybeNode of this.sdk.iterateNodes(uids)) {
            if ('missingUid' in maybeNode) {
                continue;
            }
            const name = maybeNode.name.ok ? maybeNode.name.value : undefined;
            if (!name) {
                continue;
            }
            byName.set(name, maybeNode);
            this.nodesByUid.set(maybeNode.uid, maybeNode);
        }

        this.listingsByParentUid.set(parentUid, { byName, fetchedAt: Date.now() });
        return byName;
    }

    /** Call after a local mutation (create/rename/move/delete) so the change is visible immediately. */
    invalidate(...parentUids: string[]): void {
        for (const uid of parentUids) {
            this.listingsByParentUid.delete(uid);
        }
    }

    rememberNode(node: NodeEntity): void {
        this.nodesByUid.set(node.uid, node);
    }

    forgetNode(uid: string): void {
        this.nodesByUid.delete(uid);
    }

    private mustGetNode(uid: string): NodeEntity {
        const node = this.nodesByUid.get(uid);
        if (!node) {
            this.logger.error(`DriveTree: node ${uid} not in local cache`);
            throw new NodeNotFoundError(uid);
        }
        return node;
    }
}
