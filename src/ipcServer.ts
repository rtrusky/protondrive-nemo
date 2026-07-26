import { createServer, type Server, type Socket } from 'node:net';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { NodeType } from '@protontech/drive-sdk';
import type { Logger } from '@protontech/drive-sdk';

import type { ContentStore } from './contentStore';
import { DriveTree, NodeNotFoundError } from './driveTree';

interface EvictRequest {
    op: 'evict';
    path: string;
}

interface EvictResponse {
    ok: boolean;
    error?: string;
}

/** Where the running mount daemon's IPC socket lives, given its cache dir. Shared by mount.ts (server) and cli.ts (client). */
export function socketPathFor(cacheDir: string): string {
    return path.join(cacheDir, 'daemon.sock');
}

/**
 * Small Unix-socket control channel so a one-shot CLI invocation (bound to a
 * Nemo right-click action) can ask the long-running mount daemon to evict a
 * single file's local cache entry — without duplicating the daemon's SDK
 * session, auth, and DriveTree/ContentStore state in a throwaway process.
 * Newline-delimited JSON, one request/response per connection.
 */
export class IpcServer {
    private server?: Server;

    constructor(
        private readonly socketPath: string,
        private readonly tree: DriveTree,
        private readonly content: ContentStore,
        private readonly hasUnsavedChanges: (path: string) => boolean,
        private readonly logger: Logger,
    ) {}

    async start(): Promise<void> {
        await unlink(this.socketPath).catch(() => {});
        const server = createServer((socket) => this.handleConnection(socket));
        this.server = server;
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(this.socketPath, resolve);
        });
    }

    async stop(): Promise<void> {
        const server = this.server;
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        await unlink(this.socketPath).catch(() => {});
    }

    private handleConnection(socket: Socket): void {
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                this.handleLine(socket, line);
            }
        });
        socket.on('error', (err) => this.logger.debug(`IPC connection error: ${err}`));
    }

    private handleLine(socket: Socket, line: string): void {
        if (!line.trim()) {
            return;
        }
        this.handleRequest(line)
            .catch((err): EvictResponse => ({
                ok: false,
                error: err instanceof NodeNotFoundError ? 'not-found' : err instanceof Error ? err.message : String(err),
            }))
            .then((res) => {
                socket.write(`${JSON.stringify(res)}\n`);
            });
    }

    private async handleRequest(line: string): Promise<EvictResponse> {
        const req = JSON.parse(line) as EvictRequest;
        if (req.op !== 'evict') {
            throw new Error(`Unknown op: ${(req as { op: string }).op}`);
        }
        if (this.hasUnsavedChanges(req.path)) {
            return { ok: false, error: 'open-with-unsaved-changes' };
        }
        const node = await this.tree.resolve(req.path);
        if (node.type !== NodeType.File) {
            return { ok: false, error: 'not-a-file' };
        }
        await this.content.forget(node.uid);
        return { ok: true };
    }
}
