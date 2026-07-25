import { homedir } from 'node:os';
import path from 'node:path';

import { LogLevel } from '@protontech/drive-sdk/dist/telemetry';

const APP_DIR_NAME = 'protondrive-nemo';

export interface InitConfig {
    appVersion: string;
    sdkVersion?: string;
    clientUidPrefix: string;
    enablePersistedEvents?: boolean;
}

export interface Config {
    /** Client UID is auto generated at the first run with a given prefix. */
    clientUidPrefix: string;
    /** Version of this application, sent as x-pm-appversion. */
    appVersion: string;
    /** Client ID used for the browser-based sign-in flow. */
    authClientId: string;
    /** Version of the SDK this app was built against. */
    sdkVersion?: string;
    /** Base URL for the Drive API. */
    baseUrl: string;
    /** Base URL for the account (login) web pages. */
    accountUrl: string;

    /** Cache folder for ephemeral files (cryptographic cache, entities cache). */
    cacheDir: string;
    /** App data folder for persistent files (events cursor, client UID). */
    appDir: string;

    /** Whether to enable persisted events, stored in the app data folder. */
    enablePersistedEvents: boolean;
    /** Level of logging to the console. */
    logLevel: LogLevel;
}

/**
 * Adapted from ProtonDriveApps/sdk `cli/src/config.ts`: same directory
 * conventions and account-URL derivation, trimmed to what this daemon needs
 * (no telemetry/pass-store/unsafe-cache options — see ../../VENDOR.md).
 */
export function getConfig(options: InitConfig): Config {
    const logLevelOption = process.env.PROTONDRIVE_NEMO_LOG_LEVEL?.toUpperCase() ?? 'INFO';
    const logLevel = LogLevel[logLevelOption as keyof typeof LogLevel] ?? LogLevel.INFO;

    const { cacheDir, appDir } = defaultDataDirs();

    const baseUrl = process.env.PROTONDRIVE_NEMO_BASE_URL || 'drive-api.proton.me';

    return {
        clientUidPrefix: options.clientUidPrefix,
        appVersion: options.appVersion,
        authClientId: 'external-drive',
        sdkVersion: options.sdkVersion,
        baseUrl,
        accountUrl: accountUrlFromBaseUrl(baseUrl),
        cacheDir,
        appDir,
        enablePersistedEvents: options.enablePersistedEvents ?? true,
        logLevel,
    };
}

/**
 * Derives the account URL from the API base URL by swapping the `drive-api`
 * host label for `account`, e.g. `drive-api.proton.me` -> `account.proton.me`.
 */
function accountUrlFromBaseUrl(baseUrl: string): string {
    if (baseUrl.startsWith('drive-api.')) {
        return baseUrl.replace(/^drive-api\./, 'account.');
    }
    return baseUrl.endsWith('.black') ? 'account.proton.black' : 'account.proton.me';
}

function defaultDataDirs(): Pick<Config, 'cacheDir' | 'appDir'> {
    const home = homedir();
    const override = process.env.PROTONDRIVE_NEMO_DATA_DIR;
    if (override) {
        return { cacheDir: override, appDir: override };
    }

    const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, '.cache');
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
    return {
        cacheDir: path.join(xdgCache, APP_DIR_NAME),
        appDir: path.join(xdgData, APP_DIR_NAME),
    };
}
