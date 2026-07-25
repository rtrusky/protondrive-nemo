/**
 * Type-checking-only stand-in for `@protontech/crypto/srp`. See
 * ./protontech-crypto.ts for why this exists.
 */

export declare function getSrp(
    info: { Version: number; Modulus: string; ServerEphemeral: string; Salt: string },
    credentials: { password: string },
): Promise<{ expectedServerProof: string; clientProof: string; clientEphemeral: string }>;

export declare function getRandomSrpVerifier(
    modulus: { Modulus: string },
    credentials: { password: string },
): Promise<{ version: number; salt: string; verifier: string }>;

export declare function computeKeyPassword(password: string, salt: string): Promise<string>;

export declare function generateKeySalt(): string;
