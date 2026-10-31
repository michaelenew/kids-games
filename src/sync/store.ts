/**
 * The public place the locked saves are kept: jsonblob.com, a free site that
 * stores a piece of JSON under a random ID, with no accounts. Anyone with an
 * ID can read or replace that blob, which is why everything is encrypted
 * first. Kept behind a small interface so it can be swapped (and faked in
 * tests).
 */

export interface BlobStore {
  /** Store a new blob; returns its ID. */
  create(body: unknown): Promise<string>;
  /** The blob, or null if it no longer exists. */
  read(id: string): Promise<unknown | null>;
  write(id: string, body: unknown, opts?: { keepalive?: boolean }): Promise<void>;
}

/** The blob was deleted (or expired). Other failures mean we're offline. */
export class MissingBlob extends Error {}

const API = 'https://jsonblob.com/api/jsonBlob';
const HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export const jsonBlob: BlobStore = {
  async create(body) {
    const res = await fetch(API, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`jsonblob create: ${res.status}`);
    const loc = res.headers.get('x-jsonblob-id') ?? res.headers.get('x-jsonblob') ?? res.headers.get('location');
    const id = loc?.split('/').pop();
    if (!id) throw new Error("jsonblob didn't say where it stored the save");
    return id;
  },
  async read(id) {
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`jsonblob read: ${res.status}`);
    return res.json();
  },
  async write(id, body, opts) {
    const text = JSON.stringify(body);
    const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: HEADERS,
      body: text,
      // Lets the upload finish as the page closes (browsers cap these at 64 KB).
      keepalive: !!opts?.keepalive && text.length < 60000,
    });
    if (res.status === 404) throw new MissingBlob('gone');
    if (!res.ok) throw new Error(`jsonblob write: ${res.status}`);
  },
};

let current: BlobStore = jsonBlob;

export function store(): BlobStore {
  return current;
}

/** For tests. */
export function setStore(s: BlobStore): void {
  current = s;
}
