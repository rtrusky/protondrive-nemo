import keytar from 'keytar';

import { Logger, ValidationError } from '@protontech/drive-sdk';

import { credentialsNameFor, CREDENTIALS_SERVICE } from './constants';
import type { Credentials, CredentialsStore } from './interface';
import { parseStoredSnapshot } from './parseCredentials';

/**
 * Ported from ProtonDriveApps/sdk `cli/src/credentials/secretCredentialsStore.ts`:
 * same shape, `Bun.secrets` swapped for `keytar` (the Node binding for
 * libsecret/Secret Service on Linux). See ../../../VENDOR.md.
 */
export class SecretsSessionStore implements CredentialsStore {
    private readonly credentialsName: string;

    constructor(
        profile: string,
        private readonly logger: Logger,
    ) {
        this.credentialsName = credentialsNameFor(profile);
    }

    async load(): Promise<Credentials | null> {
        this.logger.debug(`Loading session ${this.credentialsName} from secrets`);
        let raw: string | null;
        try {
            raw = await keytar.getPassword(CREDENTIALS_SERVICE, this.credentialsName);
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
        this.logger.debug(`Saving session ${this.credentialsName} to secrets`);
        await keytar.setPassword(CREDENTIALS_SERVICE, this.credentialsName, JSON.stringify(snapshot));
    }

    async remove(): Promise<void> {
        this.logger.debug(`Removing session ${this.credentialsName} from secrets`);
        await keytar.deletePassword(CREDENTIALS_SERVICE, this.credentialsName);
    }
}
