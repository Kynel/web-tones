// Catalog of bundled captures / IRs / DI tracks, plus user-imported files
// (kept in IndexedDB so a tone built on your own captures survives a reload).

export interface AssetEntry {
  /** 'builtin:<slug>' or 'user:<uuid>' */
  id: string;
  name: string;
  kind: 'nam' | 'ir';
  tag?: string;
  url?: string;
  /** Page to credit / link back to (TONE3000 tones). */
  href?: string;
}

const base = import.meta.env?.BASE_URL ?? './';

const nam = (slug: string, name: string, tag: string): AssetEntry => ({
  id: `builtin:${slug}`,
  name,
  kind: 'nam',
  tag,
  url: `${base}models/${slug}.nam`,
});
const ir = (slug: string, name: string, tag: string): AssetEntry => ({
  id: `builtin:${slug}`,
  name,
  kind: 'ir',
  tag,
  url: `${base}irs/${slug}.wav`,
});

export const BUILTIN_MODELS: AssetEntry[] = [
  nam('deluxe-a2', 'Fender Deluxe Reverb', 'Clean'),
  nam('jc', 'Roland JC-120', 'Clean'),
  nam('ac10', 'Vox AC10', 'Chime'),
  nam('dumble', 'Dumble Overdrive Special', 'Smooth'),
  nam('jcm', 'Marshall JCM800', 'Crunch'),
  nam('5153', 'EVH 5153 (Boosted)', 'High Gain'),
  nam('ampeg', 'Ampeg V-2', 'Bass'),
];

export const BUILTIN_CAB_IRS: AssetEntry[] = [
  ir('celestion', 'Celestion G12 Vintage', 'Cab'),
  ir('mesa', 'Mesa 4x12 Oversized', 'Cab'),
  ir('eminence', 'Eminence Governor', 'Cab'),
  ir('ampeg', 'Ampeg 8x10', 'Bass Cab'),
];

export const BUILTIN_REVERB_IRS: AssetEntry[] = [
  ir('plate', 'EMT 140 Plate', 'Reverb'),
  ir('spring', 'Fender Spring', 'Reverb'),
];

export interface DiTrack {
  id: string;
  name: string;
  kind: 'guitar' | 'bass';
  url: string;
}
const di = (slug: string, name: string, kind: DiTrack['kind']): DiTrack => ({ id: slug, name, kind, url: `${base}inputs/${slug}.flac` });
/** Dry (DI) recordings to audition tones with: every input shipped with tone-3000/neural-amp-modeler-wasm. */
export const DI_TRACKS: DiTrack[] = [
  di('brit', "Brit", 'guitar'),
  di('celestial', "Celestial", 'guitar'),
  di('cream', "Cream", 'guitar'),
  di('decapitated', "Decapitated", 'guitar'),
  di('fast-thrash', "Fast Thrash", 'guitar'),
  di('fear', "Fear", 'guitar'),
  di('groove-thrash', "Groove Thrash", 'guitar'),
  di('hammer-lead', "Hammer Lead", 'guitar'),
  di('harmonics', "Harmonics", 'guitar'),
  di('honky', "Honky", 'guitar'),
  di('hotrod', "Hotrod", 'guitar'),
  di('jazz-hop', "Jazz Hop", 'guitar'),
  di('jazz-trot', "Jazz Trot", 'guitar'),
  di('john', "John", 'guitar'),
  di('lunar', "Lunar", 'guitar'),
  di('mayer', "Mayer", 'guitar'),
  di('metalcore', "Metalcore", 'guitar'),
  di('pluck', "Pluck", 'guitar'),
  di('pop-punk', "Pop Punk", 'guitar'),
  di('power', "Power", 'guitar'),
  di('power-thrash', "Power Thrash", 'guitar'),
  di('progression', "Progression", 'guitar'),
  di('raid', "Raid", 'guitar'),
  di('rotary', "Rotary", 'guitar'),
  di('slide-lead', "Slide Lead", 'guitar'),
  di('smooth', "Smooth", 'guitar'),
  di('stroke', "Stroke", 'guitar'),
  di('tomb', "Tomb", 'guitar'),
  di('downtown', "Downtown", 'bass'),
  di('drivin', "Drivin'", 'bass'),
  di('frogger', "Frogger", 'bass'),
  di('garden', "Garden", 'bass'),
  di('rollin', "Rollin'", 'bass'),
  di('smokin', "Smokin'", 'bass'),
];

// ---------------------------------------------------------------- user files

interface StoredAsset {
  id: string;
  name: string;
  kind: 'nam' | 'ir';
  data: ArrayBuffer;
  tag?: string;
  href?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('web-tones', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('assets', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction('assets', mode).objectStore('assets'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listUserAssets(): Promise<AssetEntry[]> {
  try {
    const all = await tx<StoredAsset[]>('readonly', (s) => s.getAll());
    return all.map(({ id, name, kind, tag, href }) => ({ id, name, kind, tag: tag ?? '내 파일', href }));
  } catch {
    return [];
  }
}

/** Store bytes as a user asset. `meta.key` makes the import idempotent (same TONE3000 model -> same entry). */
export async function importAssetBytes(
  name: string,
  kind: 'nam' | 'ir',
  data: ArrayBuffer,
  meta: { tag?: string; href?: string; key?: string } = {},
): Promise<AssetEntry> {
  if (kind === 'nam') {
    // Fail early on files that are not NAM JSON at all.
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(data));
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || !('architecture' in parsed)) throw new Error('NAM 모델 파일이 아닙니다');
  }
  const id = `user:${meta.key ?? crypto.randomUUID()}`;
  const tag = meta.tag ?? '내 파일';
  await tx('readwrite', (s) => s.put({ id, name, kind, data, tag, href: meta.href } satisfies StoredAsset));
  return { id, name, kind, tag, href: meta.href };
}

export const importUserAsset = (file: File, kind: 'nam' | 'ir') =>
  file.arrayBuffer().then((data) => importAssetBytes(file.name.replace(/\.(nam|wav|flac|aiff?)$/i, ''), kind, data));

export async function deleteUserAsset(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

const builtinById = new Map(
  [...BUILTIN_MODELS, ...BUILTIN_CAB_IRS, ...BUILTIN_REVERB_IRS].map((a) => [`${a.kind}:${a.id}`, a]),
);

/** Fetch the raw bytes behind an asset reference. */
export async function loadAssetBytes(kind: 'nam' | 'ir', id: string): Promise<ArrayBuffer> {
  if (id.startsWith('user:')) {
    const rec = await tx<StoredAsset | undefined>('readonly', (s) => s.get(id));
    if (!rec) throw new Error('가져온 파일을 찾을 수 없습니다 (이 브라우저에 저장된 파일이 아님)');
    return rec.data;
  }
  const entry = builtinById.get(`${kind}:${id}`);
  if (!entry?.url) throw new Error(`알 수 없는 에셋: ${id}`);
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`에셋 로드 실패 (${res.status})`);
  return res.arrayBuffer();
}

const irCache = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>();
export function loadIrBuffer(ctx: BaseAudioContext, id: string): Promise<AudioBuffer> {
  let m = irCache.get(ctx);
  if (!m) irCache.set(ctx, (m = new Map()));
  let p = m.get(id);
  if (!p) {
    p = loadAssetBytes('ir', id).then((b) => ctx.decodeAudioData(b));
    p.catch(() => m.delete(id));
    m.set(id, p);
  }
  return p;
}
