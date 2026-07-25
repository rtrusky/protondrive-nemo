import type { CryptoApiInterface } from '@protontech/crypto';
import { Logger } from '@protontech/drive-sdk';

import { ApiClient, initAccount } from 'proton-drive-sdk-account';

import type { Config } from '../config';
import type { Credentials } from '../credentials';
import { createDriveRequirementAfterResponseHook } from './driveRequirementHook';
import { DriveAccountAdapter } from './driveAccountAdapter';
import { HTTPClient } from './httpClient';

export type { ApiClient } from 'proton-drive-sdk-account';
export { Auth, Srp } from 'proton-drive-sdk-account';

/**
 * Ported unchanged from ProtonDriveApps/sdk `cli/src/api/index.ts` — wires
 * `proton-drive-sdk-account` with Drive SDK-specific HTTP and requirement
 * header handling. See ../../../VENDOR.md.
 */
export async function initApi(config: Config, credentials: Credentials, logger: Logger, cryptoProxy: CryptoApiInterface) {
    const apiClient = new ApiClient({
        baseUrl: config.baseUrl,
        appVersion: config.appVersion,
        credentials,
        logger,
        headers: {
            'x-pm-drive-sdk-version': config.sdkVersion,
        },
        afterResponseHooks: [createDriveRequirementAfterResponseHook(config, logger)],
    });
    const {
        auth,
        srp,
        addresses: accountAddresses,
    } = await initAccount({
        authClientId: config.authClientId,
        apiClient,
        credentials,
        cryptoProxy,
        logger,
        accountUrl: config.accountUrl,
    });
    const addresses = new DriveAccountAdapter(accountAddresses);
    const httpClient = new HTTPClient(apiClient);

    return {
        credentials,
        addresses,
        auth,
        srp,
        apiClient,
        httpClient,
    };
}
