// TC39 Uint8Array base64/hex methods (Stage 4, landed in V8 for browsers
// this SDK targets, but not yet in this project's TypeScript lib defs and
// not natively available on Node 20). Runtime support comes from
// `@protontech/crypto/polyfill` (core-js), imported first in src/cli.ts;
// this just gives tsc the matching types.
export {};

declare global {
    interface Uint8ArrayBase64Options {
        alphabet?: 'base64' | 'base64url';
        omitPadding?: boolean;
    }

    interface Uint8ArraySetFromResult {
        read: number;
        written: number;
    }

    interface Uint8Array {
        toBase64(options?: Uint8ArrayBase64Options): string;
        toHex(): string;
        setFromBase64(base64: string, options?: Uint8ArrayBase64Options): Uint8ArraySetFromResult;
        setFromHex(hex: string): Uint8ArraySetFromResult;
    }

    interface Uint8ArrayConstructor {
        fromBase64(base64: string, options?: Uint8ArrayBase64Options): Uint8Array;
        fromHex(hex: string): Uint8Array;
    }
}
