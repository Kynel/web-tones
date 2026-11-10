import { create } from 'zustand';
import { deleteUserAsset, DI_TRACKS, importUserAsset, listUserAssets, type AssetEntry } from '../audio/assets';
import { EFFECT_BY_TYPE, newBlock } from '../audio/effects';
import { engine, type InputChannel } from '../audio/engine';
import type { Block, BlockStatus, ParamValue } from '../audio/types';
import { FACTORY_PRESETS } from './presets';
import { decodeShare, encodeShare, fromToneData, toToneData, type ToneData } from './serialize';

const SESSION_KEY = 'web-tones:session:v1';
const PRESETS_KEY = 'web-tones:presets:v1';
const base = import.meta.env?.BASE_URL ?? './';

type AudioState = 'off' | 'starting' | 'on' | 'error';

interface State {
  blocks: Block[];
  selectedId: string | null;
  status: Record<string, BlockStatus>;
  toneName: string;
  /** True once the chain differs from the preset it was loaded from. */
  dirty: boolean;
  userPresets: ToneData[];
  userAssets: AssetEntry[];

  audio: AudioState;
  audioError: string | null;
  source: 'di' | 'live';
  trackId: string;
  playing: boolean;
  live: boolean;
  liveError: string | null;
  deviceId: string;
  inputChannel: InputChannel;
  inputGain: number;
  master: number;

  startAudio(): Promise<boolean>;
  addBlock(type: string, index?: number): void;
  removeBlock(id: string): void;
  moveBlock(from: number, to: number): void;
  toggleBlock(id: string): void;
  select(id: string | null): void;
  setParam(id: string, key: string, value: ParamValue): void;
  resetBlock(id: string): void;

  loadTone(data: ToneData, opts?: { track?: string }): void;
  saveUserPreset(name: string): void;
  deleteUserPreset(name: string): void;
  shareUrl(): string;

  setTrack(id: string): void;
  togglePlay(): Promise<void>;
  setSource(s: 'di' | 'live'): void;
  toggleLive(): Promise<void>;
  setDevice(id: string): void;
  setInputChannel(c: InputChannel): void;
  setInputGain(db: number): void;
  setMaster(db: number): void;

  /** TONE3000 browser: which block asked, and (after the picker) which tone was chosen. */
  t3k: { kind: 'nam' | 'ir'; blockId: string | null; toneId?: string | null; error?: string } | null;
  openT3k(kind: 'nam' | 'ir', blockId: string | null, extra?: { toneId?: string | null; error?: string }): void;
  closeT3k(): void;

  refreshUserAssets(): Promise<void>;
  importAsset(file: File, kind: 'nam' | 'ir'): Promise<AssetEntry>;
  removeAsset(id: string): Promise<void>;
}

interface Session {
  tone: ToneData;
  trackId: string;
  inputGain: number;
  master: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function initial(): Pick<State, 'blocks' | 'toneName' | 'trackId' | 'inputGain' | 'master' | 'dirty'> {
  const shared = typeof location !== 'undefined' && location.hash.startsWith('#tone=') ? decodeShare(location.hash.slice(6)) : null;
  const session = typeof localStorage !== 'undefined' ? readJson<Session>(SESSION_KEY) : null;
  const first = FACTORY_PRESETS[0];
  const tone = shared ?? session?.tone ?? first;
  const blocks = fromToneData(tone);
  return {
    blocks: blocks.length ? blocks : fromToneData(first),
    toneName: tone.name,
    dirty: false,
    trackId: DI_TRACKS.some((t) => t.id === session?.trackId) ? session!.trackId : first.track,
    inputGain: typeof session?.inputGain === 'number' ? session.inputGain : 0,
    master: typeof session?.master === 'number' ? session.master : -6,
  };
}

export const useStore = create<State>((set, get) => {
  const structural = (blocks: Block[], extra: Partial<State> = {}) => {
    set({ blocks, dirty: true, ...extra });
    engine.sync(blocks);
  };
  const play = async () => {
    const track = DI_TRACKS.find((t) => t.id === get().trackId) ?? DI_TRACKS[0];
    await engine.playTrack(track.id, async () => {
      const res = await fetch(track.url);
      if (!res.ok) throw new Error(`DI 트랙 로드 실패 (${res.status})`);
      return res.arrayBuffer();
    });
  };

  return {
    ...initial(),
    selectedId: null,
    status: {},
    userPresets: (typeof localStorage !== 'undefined' && readJson<ToneData[]>(PRESETS_KEY)) || [],
    userAssets: [],
    audio: 'off',
    audioError: null,
    source: 'di',
    playing: false,
    live: false,
    liveError: null,
    deviceId: '',
    inputChannel: 'mix',

    async startAudio() {
      if (get().audio === 'on') return true;
      set({ audio: 'starting', audioError: null });
      try {
        await engine.start();
        engine.setInputGain(get().inputGain);
        engine.setMaster(get().master);
        set({ audio: 'on' });
        return true;
      } catch (e) {
        set({ audio: 'error', audioError: e instanceof Error ? e.message : String(e) });
        return false;
      }
    },

    addBlock(type, index) {
      if (!EFFECT_BY_TYPE[type]) return;
      const block = newBlock(type);
      const blocks = [...get().blocks];
      blocks.splice(index ?? blocks.length, 0, block);
      structural(blocks, { selectedId: block.id });
    },
    removeBlock(id) {
      const { blocks, selectedId, status } = get();
      const idx = blocks.findIndex((b) => b.id === id);
      const next = blocks.filter((b) => b.id !== id);
      const { [id]: _gone, ...rest } = status;
      void _gone;
      structural(next, {
        status: rest,
        selectedId: selectedId === id ? (next[Math.min(idx, next.length - 1)]?.id ?? null) : selectedId,
      });
    },
    moveBlock(from, to) {
      const blocks = [...get().blocks];
      if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return;
      const [b] = blocks.splice(from, 1);
      blocks.splice(to, 0, b);
      structural(blocks);
    },
    toggleBlock(id) {
      structural(get().blocks.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)));
    },
    select: (id) => set({ selectedId: id }),
    setParam(id, key, value) {
      set({
        blocks: get().blocks.map((b) => (b.id === id ? { ...b, params: { ...b.params, [key]: value } } : b)),
        dirty: true,
      });
      engine.setParam(get().blocks, id, key, value);
    },
    resetBlock(id) {
      const b = get().blocks.find((x) => x.id === id);
      const def = b && EFFECT_BY_TYPE[b.type];
      if (!b || !def) return;
      for (const p of def.params) if (p.kind !== 'asset') get().setParam(id, p.id, p.default);
    },

    loadTone(data, opts) {
      const blocks = fromToneData(data);
      set({ blocks, toneName: data.name, dirty: false, status: {}, selectedId: null });
      engine.sync(blocks);
      if (opts?.track && opts.track !== get().trackId) get().setTrack(opts.track);
    },
    saveUserPreset(name) {
      const clean = name.trim().slice(0, 60);
      if (!clean) return;
      const tone = toToneData(clean, get().blocks);
      const userPresets = [...get().userPresets.filter((p) => p.name !== clean), tone];
      localStorage.setItem(PRESETS_KEY, JSON.stringify(userPresets));
      set({ userPresets, toneName: clean, dirty: false });
    },
    deleteUserPreset(name) {
      const userPresets = get().userPresets.filter((p) => p.name !== name);
      localStorage.setItem(PRESETS_KEY, JSON.stringify(userPresets));
      set({ userPresets });
    },
    shareUrl() {
      const url = new URL(location.href);
      url.hash = `tone=${encodeShare(toToneData(get().toneName, get().blocks))}`;
      return url.toString();
    },

    setTrack(id) {
      set({ trackId: id });
      if (get().playing) void play().catch((e) => set({ playing: false, audioError: String(e?.message ?? e) }));
    },
    async togglePlay() {
      if (get().playing) {
        engine.stopTrack();
        set({ playing: false });
        return;
      }
      if (!(await get().startAudio())) return;
      set({ playing: true });
      try {
        await play();
      } catch (e) {
        set({ playing: false, audioError: e instanceof Error ? e.message : String(e) });
      }
    },
    setSource(source) {
      if (source === get().source) return;
      if (source === 'live') {
        engine.stopTrack();
        set({ source, playing: false });
      } else {
        engine.stopLive();
        set({ source, live: false });
      }
    },
    async toggleLive() {
      if (get().live) {
        engine.stopLive();
        set({ live: false });
        return;
      }
      if (!(await get().startAudio())) return;
      try {
        await engine.startLive(get().deviceId || undefined, get().inputChannel);
        set({ live: true, liveError: null });
      } catch (e) {
        const denied = e instanceof DOMException && e.name === 'NotAllowedError';
        set({
          live: false,
          liveError: denied ? '마이크 권한이 거부되었습니다. 브라우저 주소창에서 권한을 허용하세요.' : `입력 장치를 열 수 없습니다: ${e instanceof Error ? e.message : e}`,
        });
      }
    },
    setDevice(deviceId) {
      set({ deviceId });
      if (get().live) void engine.startLive(deviceId || undefined, get().inputChannel).catch(() => set({ live: false }));
    },
    setInputChannel(inputChannel) {
      set({ inputChannel });
      if (get().live) void engine.startLive(get().deviceId || undefined, inputChannel).catch(() => set({ live: false }));
    },
    setInputGain(db) {
      set({ inputGain: db });
      engine.setInputGain(db);
    },
    setMaster(db) {
      set({ master: db });
      engine.setMaster(db);
    },

    t3k: null,
    openT3k: (kind, blockId, extra) => set({ t3k: { kind, blockId, ...extra } }),
    closeT3k: () => set({ t3k: null }),

    async refreshUserAssets() {
      set({ userAssets: await listUserAssets() });
    },
    async importAsset(file, kind) {
      const entry = await importUserAsset(file, kind);
      await get().refreshUserAssets();
      return entry;
    },
    async removeAsset(id) {
      await deleteUserAsset(id);
      await get().refreshUserAssets();
    },
  };
});

engine.onStatus = (id, status) => useStore.setState((s) => ({ status: { ...s.status, [id]: status } }));
engine.sync(useStore.getState().blocks);

// Persist the working tone so a reload picks up where you left off.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Write the session immediately (also used right before leaving the page). */
export function saveSessionNow() {
  clearTimeout(saveTimer);
  const s = useStore.getState();
  const session: Session = {
    tone: toToneData(s.toneName, s.blocks),
    trackId: s.trackId,
    inputGain: s.inputGain,
    master: s.master,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* storage full or blocked */ }
}
useStore.subscribe((s, prev) => {
  if (s.blocks === prev.blocks && s.trackId === prev.trackId && s.inputGain === prev.inputGain && s.master === prev.master && s.toneName === prev.toneName) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSessionNow, 300);
});

export { base };
