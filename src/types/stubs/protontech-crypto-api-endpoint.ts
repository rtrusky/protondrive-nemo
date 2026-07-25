/**
 * Type-checking-only stand-in for `@protontech/crypto/proxy/endpoint/api.ts`.
 * See ./protontech-crypto.ts for why this exists — same reasoning, this is
 * the one other runtime import from `@protontech/crypto` this project makes.
 */
export declare class Api {
    static init(options: Record<string, unknown>): void;
    clearKeyStore(): void;
}
