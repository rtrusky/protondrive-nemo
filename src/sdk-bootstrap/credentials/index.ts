import { Logger } from '@protontech/drive-sdk';

import { Credentials } from './credentials';
import { SecretsSessionStore } from './secretCredentialsStore';

export type { Credentials } from './credentials';

/**
 * Simplified from ProtonDriveApps/sdk `cli/src/credentials/index.ts`: the CLI
 * supports switchable stores (OS keychain, pass(1), plaintext file); this app
 * only needs the OS keychain (libsecret via keytar). See ../../../VENDOR.md.
 */
export function initCredentials(logger: Logger): Credentials {
    return new Credentials(new SecretsSessionStore(logger), logger);
}
