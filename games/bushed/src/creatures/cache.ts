// Built creature models cached in IndexedDB (after ODDWORLD's titans/async.ts): the skinned geometry's attributes and
// the two texture pages, keyed by the model's version string. A cached model loads in a few milliseconds instead of
// being rebuilt (seconds). Bump a model's *_MODEL_VERSION whenever its builder changes.
import * as THREE from 'three';
import { pixelTexture, surfaceTextureFrom } from './anatomy';

export interface Packed {
  attrs: { name: string; a: Float32Array | Uint16Array | Uint32Array; n: number }[];
  index: Uint16Array | Uint32Array; tex: Uint8Array; sd: Uint8Array; W: number; H: number; meta: Record<string, unknown>;
}
export interface Built { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture }

export function pack(m: Built, meta: Record<string, unknown> = {}): Packed {
  const attrs: Packed['attrs'] = [];
  for (const [name, at] of Object.entries(m.geo.attributes)) {
    const a = (at as THREE.BufferAttribute).array as Float32Array | Uint16Array | Uint32Array;
    attrs.push({ name, a: a.slice(), n: (at as THREE.BufferAttribute).itemSize });
  }
  const img = (t: THREE.DataTexture) => (t.image as { data: Uint8Array; width: number; height: number });
  return { attrs, index: (m.geo.index!.array as Uint16Array | Uint32Array).slice(), tex: img(m.tex).data.slice(), sd: img(m.sd).data.slice(), W: img(m.tex).width, H: img(m.tex).height, meta };
}
export function unpack(p: Packed): Built {
  const geo = new THREE.BufferGeometry();
  for (const a of p.attrs) geo.setAttribute(a.name, new THREE.BufferAttribute(a.a, a.n));
  geo.setIndex(new THREE.BufferAttribute(p.index, 1));
  geo.computeBoundingSphere();
  return { geo, tex: pixelTexture(p.tex, p.W, p.H), sd: surfaceTextureFrom(p.sd, p.W, p.H) };
}

const DB = 'bushed-creatures', STORE = 'models';
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
export async function cacheGet(key: string): Promise<Packed | null> {
  const d = await db(); if (!d) return null;
  return new Promise((res) => {
    try { const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key); r.onsuccess = () => res((r.result as Packed) ?? null); r.onerror = () => res(null); } catch { res(null); }
  });
}
export async function cachePut(key: string, p: Packed): Promise<void> {
  const d = await db(); if (!d) return;
  await new Promise<void>((res) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      // drop older versions of the same model
      const st = tx.objectStore(STORE), base = key.split('@')[0];
      const keys = st.getAllKeys();
      keys.onsuccess = () => { for (const k of keys.result) if (String(k).split('@')[0] === base && k !== key) st.delete(k); st.put(p, key); };
      tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res();
    } catch { res(); }
  });
}
/** a shared model: from memory, else from the cache, else built in slices (and cached for next time) */
export function loader<M extends Built>(key: string, build: () => Promise<M>, revive: (b: Built, meta: Record<string, unknown>) => M, meta: (m: M) => Record<string, unknown>) {
  let mem: M | null = null, pending: Promise<M> | null = null;
  return {
    get: () => mem,
    set: (m: M) => { mem = m; },
    load(o: { cache?: boolean } = {}): Promise<M> {
      if (mem) return Promise.resolve(mem);
      if (pending) return pending;
      pending = (async () => {
        if (o.cache !== false) { const c = await cacheGet(key); if (c) { mem = revive(unpack(c), c.meta); return mem; } }
        const m = await build();
        mem = mem ?? m;
        if (o.cache !== false) cachePut(key, pack(m, meta(m))).catch(() => undefined);
        return mem;
      })();
      return pending;
    },
  };
}
