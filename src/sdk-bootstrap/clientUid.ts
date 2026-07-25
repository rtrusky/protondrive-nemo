import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Logger } from '@protontech/drive-sdk';

import type { Config } from './config';

const CLIENT_UID_FILE = 'clientUid.json';

interface ClientUidFile {
    clientUid: string;
}

/**
 * Returns a persistent client UID for this machine, stored as plain JSON in
 * the app data directory. Ported from ProtonDriveApps/sdk `cli/src/clientUid.ts`
 * (`Bun.file`/`Bun.write` swapped for `node:fs/promises`). See ../../VENDOR.md.
 */
export async function getOrGenerateClientUid(config: Config, logger: Logger): Promise<string> {
    const path = join(config.appDir, CLIENT_UID_FILE);

    try {
        const data = JSON.parse(await readFile(path, 'utf8')) as ClientUidFile;
        if (typeof data.clientUid === 'string' && data.clientUid.startsWith(expectedUidPrefix(config.clientUidPrefix))) {
            logger.debug(`Using client UID: ${data.clientUid}`);
            return data.clientUid;
        }
    } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') {
            logger.error(`Failed to load client UID`, error);
        }
    }

    const clientUid = `${config.clientUidPrefix}-${randomUUID()}`;
    await mkdir(config.appDir, { recursive: true });
    const payload: ClientUidFile = { clientUid };
    await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    logger.info(`Generated new client UID: ${clientUid}`);
    return clientUid;
}

function expectedUidPrefix(prefix: string): string {
    return `${prefix}-`;
}
