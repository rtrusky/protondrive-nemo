// Distinct from the official CLI's `ch.proton.drive/drive-sdk-cli` service
// name so a stored session here can't collide with the official CLI's.
export const CREDENTIALS_SERVICE = 'ch.proton.drive/protondrive-nemo';
export const CREDENTIALS_NAME_BASE = 'auth-session';

/**
 * The default profile keeps the bare `auth-session` account name so an
 * existing single-account install's keychain entry is reused unchanged —
 * only additional profiles get a suffix.
 */
export function credentialsNameFor(profile: string): string {
    return profile === 'default' ? CREDENTIALS_NAME_BASE : `${CREDENTIALS_NAME_BASE}-${profile}`;
}
