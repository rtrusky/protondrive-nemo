// core-js polyfills for the Uint8Array base64/hex methods @protontech/crypto
// relies on (see src/types/uint8array-polyfill.d.ts for the matching types).
import '@protontech/crypto/polyfill';

// openpgp's Node build assumes WebCrypto availability implies a browser
// environment (and thus a `navigator` global): its AES-GCM path reads
// `navigator.userAgent` unconditionally once `util.getWebCrypto()` is
// truthy — true on Node 19+, which ships `crypto.webcrypto` natively but
// has no `navigator`. Elsewhere in the same package this exact read is
// correctly guarded (`typeof navigator !== 'undefined'`); this one spot
// just isn't, so any file whose content happens to be GCM-encrypted
// throws `navigator is not defined` on download. An empty `userAgent`
// makes both of its Safari-version regexes fail to match, which is the
// correct outcome outside Safari anyway.
if (typeof navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '' } });
}

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
