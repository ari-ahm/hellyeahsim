// 📼 MIXTAPE: play your own music files in-game. They live in this browser (IndexedDB), never uploaded anywhere.
import type { Tape } from './audio';

export type Slot = 'menu' | 'storm' | 'radio';
interface Rec { id: string; slot: Slot; name: string; blob: Blob }

const DB = 'hys-mixtape';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tapes', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const req = fn(d.transaction('tapes', mode).objectStore('tapes'));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export interface Mixtape { menu?: Tape; storm?: Tape; radio: Tape[] }

export async function loadMixtape(): Promise<Mixtape> {
  const out: Mixtape = { radio: [] };
  try {
    const all = (await tx('readonly', (s) => s.getAll())) as Rec[];
    for (const r of all.sort((a, b) => a.id.localeCompare(b.id))) {
      const t = { name: r.name, url: URL.createObjectURL(r.blob) };
      if (r.slot === 'radio') out.radio.push(t);
      else out[r.slot] = t;
    }
  } catch {
    /* private mode or no IDB: mixtape just won't persist */
  }
  return out;
}

export async function saveFiles(slot: Slot, files: File[]) {
  if (slot !== 'radio') await clearSlot(slot);
  let i = 0;
  for (const f of files) {
    const rec: Rec = { id: `${slot}-${Date.now()}-${i++}`, slot, name: f.name.replace(/\.[^.]+$/, ''), blob: f };
    try {
      await tx('readwrite', (s) => s.put(rec));
    } catch {
      /* ignore */
    }
  }
}

export async function clearSlot(slot: Slot) {
  try {
    const all = (await tx('readonly', (s) => s.getAll())) as Rec[];
    for (const r of all) if (r.slot === slot) await tx('readwrite', (s) => s.delete(r.id));
  } catch {
    /* ignore */
  }
}
