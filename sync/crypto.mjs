// AES-256-GCM via WebCrypto – samma format som webbsidan dekrypterar.
// Nyckeln är 32 slumpade bytes, base64url-kodade (se tools/new-key.mjs).
import { webcrypto as crypto } from 'node:crypto';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlToBytes(s) {
  return new Uint8Array(Buffer.from(s.trim(), 'base64url'));
}
export function bytesToB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}
function b64ToBytes(s) {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

async function importKey(keyB64url) {
  const raw = b64urlToBytes(keyB64url);
  if (raw.length !== 32) throw new Error('FAMILY_KEY måste vara 32 bytes (base64url). Kör: npm run key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(obj, keyB64url) {
  const key = await importKey(keyB64url);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, alg: 'A256GCM', iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function decryptJson(payload, keyB64url) {
  const key = await importKey(keyB64url);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.iv) },
    key,
    b64ToBytes(payload.ct),
  );
  return JSON.parse(dec.decode(pt));
}
