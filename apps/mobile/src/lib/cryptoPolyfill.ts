import * as ExpoCrypto from 'expo-crypto';

/**
 * React Native has no WebCrypto `crypto.subtle`, so supabase-js silently falls back to the
 * `plain` PKCE challenge method. Provide a minimal SHA-256-only `subtle.digest` backed by
 * expo-crypto so PKCE uses S256.
 */
type DigestInput = ArrayBuffer | ArrayBufferView;

const cryptoGlobal = (globalThis as unknown as { crypto?: Record<string, unknown> }).crypto;

if (cryptoGlobal && typeof cryptoGlobal.subtle === 'undefined') {
  cryptoGlobal.subtle = {
    digest(algorithm: string | { name: string }, data: DigestInput): Promise<ArrayBuffer> {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') {
        return Promise.reject(new Error(`crypto.subtle.digest: unsupported algorithm ${name}`));
      }
      // Copy into a fresh ArrayBuffer-backed view (expo-crypto rejects SharedArrayBuffer views).
      const bytes = new Uint8Array(
        ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data),
      );
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, bytes);
    },
  };
}
