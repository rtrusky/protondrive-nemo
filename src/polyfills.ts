// core-js polyfills for the Uint8Array base64/hex methods @protontech/crypto
// relies on (see src/types/uint8array-polyfill.d.ts for the matching types).
import '@protontech/crypto/polyfill';

// `Promise.withResolvers` (used by the vendored account module and by our
// ported events manager) landed in V8 11.9 / Node 21+; polyfill it so this
// still runs on Node 20 LTS.
if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function withResolvers<T>(): PromiseWithResolvers<T> {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
