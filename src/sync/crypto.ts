/**
 * Locking a save before it goes online. AES-GCM is the standard cipher built
 * into every browser: a 256-bit random key scrambles the text, a fresh random
 * number (the IV) goes in each time, and a tampered box fails to open.
 */

export interface Sealed {
  kg: 1;
  iv: string;
  ct: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomId(bytes = 9): string {
  return toB64(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** A new random key, as text (43 characters). */
export function newKey(): string {
  return randomId(32);
}

/** Browsers only offer encryption on secure (https or localhost) pages. */
export function canEncrypt(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(key: string, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), enc.encode(JSON.stringify(value)));
  return { kg: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Throws if the key is wrong or the box was changed by anyone without the key. */
export async function open(key: string, box: unknown): Promise<unknown> {
  const b = box as Partial<Sealed> | null;
  if (!b || b.kg !== 1 || typeof b.iv !== 'string' || typeof b.ct !== 'string') throw new Error('not a sealed save');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(b.iv) }, await importKey(key), fromB64(b.ct));
  return JSON.parse(dec.decode(plain));
}
