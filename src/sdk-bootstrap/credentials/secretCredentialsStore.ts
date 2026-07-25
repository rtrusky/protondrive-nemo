import keytar from 'keytar';

import { Logger, ValidationError } from '@protontech/drive-sdk';

import { CREDENTIALS_NAME, CREDENTIALS_SERVICE } from './constants';
import type { Credentials, CredentialsStore } from './interface';
import { parseStoredSnapshot } from './parseCredentials';

/**
 * Ported from ProtonDriveApps/sdk `cli/src/credentials/secretCredentialsStore.ts`:
 * same shape, `Bun.secrets` swapped for `keytar` (the Node binding for
 * libsecret/Secret Service on Linux). See ../../../VENDOR.md.
 */
export class SecretsSessionStore implements CredentialsStore {
    constructor(private readonly logger: Logger) {}

    async load(): Promise<Credentials | null> {
        this.logger.debug(`Loading session ${CREDENTIALS_NAME} from secrets`);
        let raw: string | null;
        try {
            raw = await keytar.getPassword(CREDENTIALS_SERVICE, CREDENTIALS_NAME);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ValidationError(
                `Failed to load session from secrets (ensure a Secret Service provider like GNOME Keyring is running): ${message}`,
                undefined,
                { cause: error },
            );
        }
        return parseStoredSnapshot(raw);
    }

    async save(snapshot: Credentials): Promise<void> {
        this.logger.debug(`Saving session ${CREDENTIALS_NAME} to secrets`);
        await keytar.setPassword(CREDENTIALS_SERVICE, CREDENTIALS_NAME, JSON.stringify(snapshot));
    }

    async remove(): Promise<void> {
        this.logger.debug(`Removing session ${CREDENTIALS_NAME} from secrets`);
        await keytar.deletePassword(CREDENTIALS_SERVICE, CREDENTIALS_NAME);
    }
}
