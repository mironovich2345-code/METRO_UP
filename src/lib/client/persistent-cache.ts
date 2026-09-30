"use client";

import { CACHE_SCHEMA_VERSION, MAX_ENTRIES, MAX_ENTRY_BYTES, isEntryUsable, type PersistedEntry } from "./persistent-cache-core";

/**
 * Sprint: mini-app-persistent-cache — L2 storage. IndexedDB (preferred per
 * the brief, and a better fit than localStorage here: async — never blocks
 * the main thread on a mobile WebView — and its indexes let owner-bulk-
 * delete and oldest-eviction be real queries instead of "read everything,
 * JSON.parse, filter in JS" against a single localStorage blob). No wrapper
 * library — the operations this cache needs (get one, put one, delete by
 * key/prefix/owner, clear) are a small, fixed set, and hand-writing them
 * keeps this at zero new dependencies (unlike swr, this genuinely didn't
 * need one).
 *
 * Feature-detected: every exported function no-ops safely (resolves/returns
 * empty) when `indexedDB` is unavailable, so the rest of the app — L1 SWR
 * caching included — keeps working exactly as before on a WebView that
 * somehow lacks it. Never throws to its caller; a storage failure degrades
 * to "nothing was cached," never a crash.
 */

const DB_NAME = "metro_up_cache";
const DB_VERSION = 1;
const STORE = "entries";

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("by_owner", "ownerKey", { unique: false });
        store.createIndex("by_savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T | undefined;
    const req = fn(store);
    if (req) {
      req.onsuccess = () => {
        result = req.result;
      };
      req.onerror = () => reject(req.error);
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Bootstrap step 1-2 (section 1) — read every USABLE (right schema version,
 * not expired) entry for this owner into a plain Map, ready to seed SWR's
 * cache. Also performs the store's only maintenance pass (section 15):
 * while the cursor is already open, opportunistically deletes any expired
 * or version-mismatched row it encounters (any owner, not just this one —
 * cheap, and the only place this cache ever does a full-ish scan), then
 * enforces the entry-count cap by evicting the oldest surviving rows.
 * Never throws — a storage error yields an empty Map, matching "no cache
 * exists" (section 8's fallback path).
 */
export async function hydrateOwnerEntries(ownerKey: string): Promise<Map<string, unknown>> {
  if (!available()) return new Map();
  const now = Date.now();
  const result = new Map<string, unknown>();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const cursorReq = store.openCursor();
      let total = 0;
      const survivors: { key: string; savedAt: number }[] = [];
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          // Section 15 — oldest-entry eviction once the full scan is done.
          if (survivors.length > MAX_ENTRIES) {
            survivors
              .sort((a, b) => a.savedAt - b.savedAt)
              .slice(0, survivors.length - MAX_ENTRIES)
              .forEach((s) => store.delete(s.key));
          }
          return;
        }
        const entry = cursor.value as PersistedEntry;
        total += 1;
        if (!isEntryUsable(entry, now)) {
          cursor.delete();
        } else {
          survivors.push({ key: entry.key, savedAt: entry.savedAt });
          if (entry.ownerKey === ownerKey) result.set(entry.key, entry.data);
        }
        void total;
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return new Map();
  }
  return result;
}

/**
 * Sprint: mini-app-cold-start — single-key read, used by AppUserProvider to
 * fetch the identity snapshot directly (it runs OUTSIDE PersistentCacheProvider's
 * SWR cache Map entirely — see the provider tree reordering in the cold-start
 * report — so it needs its own tiny, independent read, not the bulk
 * per-owner scan hydrateOwnerEntries does for the SWR layer). Same
 * usability check (version + expiry), same silent-empty-on-failure contract.
 */
export async function getEntry<T>(key: string): Promise<T | null> {
  if (!available()) return null;
  try {
    const entry = (await withStore("readonly", (store) => store.get(key))) as PersistedEntry | undefined;
    if (!entry || !isEntryUsable(entry, Date.now())) return null;
    return entry.data as T;
  } catch {
    return null;
  }
}

/** Fire-and-forget upsert — never awaited by a screen, never throws.
 * Section 15 — a single oversized response is simply not persisted (L1 SWR
 * still holds it in memory for this session; only the L2 write is skipped). */
export function persistEntry(key: string, ownerKey: string, data: unknown, ttlMs: number): void {
  if (!available()) return;
  let size = 0;
  try {
    size = JSON.stringify(data)?.length ?? 0;
  } catch {
    return; // not JSON-serializable — never persist it
  }
  if (size > MAX_ENTRY_BYTES) return;
  const now = Date.now();
  const entry: PersistedEntry = { key, ownerKey, data, savedAt: now, expiresAt: now + ttlMs, cacheVersion: CACHE_SCHEMA_VERSION };
  withStore("readwrite", (store) => store.put(entry)).catch(() => {});
}

export function deleteEntry(key: string): void {
  if (!available()) return;
  withStore("readwrite", (store) => store.delete(key)).catch(() => {});
}

/** No prefix index exists (the store is keyed for exact-key/owner/savedAt
 * lookups only) — a full cursor scan is fine here given this cache's small
 * total volume, and this path only runs on a mutation, never on a hot
 * render loop. */
export function deleteEntriesByPrefix(prefix: string): void {
  if (!available()) return;
  withStore("readwrite", (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if ((cursor.value as PersistedEntry).key.startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
    return undefined;
  }).catch(() => {});
}

/** Section 10 — a real owner change (or sign-out) must not rely on TTL
 * expiry alone to remove the prior owner's data. */
export function deleteAllForOwner(ownerKey: string): Promise<void> {
  if (!available()) return Promise.resolve();
  return withStore("readwrite", (store) => {
    const idx = store.index("by_owner");
    const req = idx.openCursor(IDBKeyRange.only(ownerKey));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    return undefined;
  })
    .then(() => undefined)
    .catch(() => undefined);
}

export function clearAllEntries(): void {
  if (!available()) return;
  withStore("readwrite", (store) => store.clear()).catch(() => {});
}
