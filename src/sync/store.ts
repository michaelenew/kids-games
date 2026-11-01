/**
 * The place the locked saves are kept: JSONBin.io, which stores a piece of
 * JSON (a "bin") under an ID. It needs an API key from a free account; the
 * grown-up pastes one when starting a sync group, and it travels to other
 * devices inside the group's QR code (it is never in the site's code). Bins
 * are made private, and everything is encrypted first anyway. Kept behind a
 * small interface so it can be swapped (and faked in tests).
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

const API = 'https://api.jsonbin.io/v3/b';

/** JSONBin's own words for what went wrong, when it says. */
async function failure(what: string, res: Response): Promise<Error> {
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    // No explanation in the reply.
  }
  return new Error(`JSONBin ${what} failed (${res.status}${detail ? `: ${detail}` : ''})`);
}

/** Network errors (no reply at all) say only "Load failed" in Safari. */
async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("couldn't reach jsonbin.io");
  }
}

/**
 * JSONBin has two kinds of key that look alike: an access key (made under
 * API Keys, and can be limited to create, read and update) and the account's
 * master key. They go in different headers.
 */
export type KeyKind = 'access' | 'master';

export function jsonBin(apiKey: string, kind: KeyKind): BlobStore {
  const auth = { [kind === 'master' ? 'X-Master-Key' : 'X-Access-Key']: apiKey };
  return {
    async create(body) {
      const res = await call(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bin-Private': 'true', 'X-Bin-Name': 'kids-games-save', ...auth },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await failure('create', res);
      const id = ((await res.json()) as { metadata?: { id?: string } }).metadata?.id;
      if (!id) throw new Error("JSONBin didn't say where it stored the save");
      return id;
    },
    async read(id) {
      const res = await call(`${API}/${encodeURIComponent(id)}/latest`, { headers: { 'X-Bin-Meta': 'false', ...auth }, cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw await failure('read', res);
      return res.json();
    },
    async write(id, body, opts) {
      const text = JSON.stringify(body);
      const res = await call(`${API}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: text,
        // Lets the upload finish as the page closes (browsers cap these at 64 KB).
        keepalive: !!opts?.keepalive && text.length < 60000,
      });
      if (res.status === 404) throw new MissingBlob('gone');
      if (!res.ok) throw await failure('save', res);
    },
  };
}

/** Which header a pasted key needs: try it as an access key, then as a master key. */
export async function createWithKey(apiKey: string, body: unknown): Promise<{ id: string; kind: KeyKind }> {
  if (testStore) return { id: await testStore.create(body), kind: 'access' };
  try {
    return { id: await jsonBin(apiKey, 'access').create(body), kind: 'access' };
  } catch (e) {
    if (!/\((401|403)/.test((e as Error).message)) throw e;
    return { id: await jsonBin(apiKey, 'master').create(body), kind: 'master' };
  }
}

let testStore: BlobStore | null = null;

export function storeFor(apiKey: string, kind: KeyKind): BlobStore {
  return testStore ?? jsonBin(apiKey, kind);
}

/** For tests. */
export function setStore(s: BlobStore | null): void {
  testStore = s;
}
