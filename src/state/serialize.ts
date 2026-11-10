import { EFFECT_BY_TYPE, newBlock } from '../audio/effects';
import type { Block, Params } from '../audio/types';

/** Compact, id-less form of a chain used for presets, localStorage and share links. */
export interface ToneData {
  name: string;
  /** [type, params that differ from defaults, enabled (omitted = true)] */
  blocks: [type: string, params: Params, enabled?: boolean][];
}

export function toToneData(name: string, blocks: Block[]): ToneData {
  return {
    name,
    blocks: blocks.map((b) => {
      const def = EFFECT_BY_TYPE[b.type];
      const diff: Params = {};
      for (const p of def?.params ?? []) if (b.params[p.id] !== undefined && b.params[p.id] !== p.default) diff[p.id] = b.params[p.id];
      return b.enabled ? [b.type, diff] : [b.type, diff, false];
    }),
  };
}

/** Rebuild blocks from tone data; unknown effects and malformed params are dropped. */
export function fromToneData(data: ToneData): Block[] {
  const out: Block[] = [];
  for (const entry of Array.isArray(data?.blocks) ? data.blocks : []) {
    if (!Array.isArray(entry)) continue;
    const [type, params, enabled] = entry;
    const def = EFFECT_BY_TYPE[type];
    if (!def) continue;
    const clean: Params = {};
    for (const p of def.params) {
      const v = params?.[p.id];
      if (p.kind === 'knob') {
        if (typeof v === 'number' && Number.isFinite(v)) clean[p.id] = Math.min(p.max, Math.max(p.min, v));
      } else if (p.kind === 'select') {
        if (typeof v === 'string' && p.options.some((o) => o.value === v)) clean[p.id] = v;
      } else if (typeof v === 'string') clean[p.id] = v;
    }
    out.push(newBlock(type, clean, enabled !== false));
  }
  return out;
}

const b64url = {
  enc: (s: string) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (s: string) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

export function encodeShare(data: ToneData): string {
  return b64url.enc(JSON.stringify(data));
}

export function decodeShare(hash: string): ToneData | null {
  try {
    const data = JSON.parse(b64url.dec(hash));
    if (!data || typeof data !== 'object' || !Array.isArray(data.blocks)) return null;
    return { name: typeof data.name === 'string' ? data.name.slice(0, 60) : '공유된 톤', blocks: data.blocks };
  } catch {
    return null;
  }
}
