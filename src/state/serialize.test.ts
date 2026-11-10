import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../audio/effects';
import { FACTORY_PRESETS } from './presets';
import { decodeShare, encodeShare, fromToneData, toToneData } from './serialize';

describe('tone serialization', () => {
  it('round-trips a chain through the compact form', () => {
    const blocks = fromToneData(FACTORY_PRESETS[0]);
    const again = fromToneData(toToneData('x', blocks));
    expect(again.map((b) => [b.type, b.enabled, b.params])).toEqual(blocks.map((b) => [b.type, b.enabled, b.params]));
  });
  it('stores only params that differ from defaults', () => {
    const data = toToneData('x', fromToneData({ name: 'x', blocks: [['delay', { time: 500 }]] }));
    expect(data.blocks).toEqual([['delay', { time: 500 }]]);
  });
  it('survives a share-link round trip, including non-ASCII names', () => {
    const tone = { ...toToneData('내 톤 🎸', fromToneData(FACTORY_PRESETS[3])) };
    expect(decodeShare(encodeShare(tone))).toEqual(tone);
  });
  it('rejects garbage and sanitises hostile input', () => {
    expect(decodeShare('%%%')).toBeNull();
    expect(decodeShare(encodeShare({ name: 'x' } as never))).toBeNull();
    const blocks = fromToneData({
      name: 'x',
      blocks: [['nope', {}], ['delay', { time: 1e9, mode: 'bogus', feedback: 'NaN' as never }], 'junk' as never],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].params).toMatchObject({ time: 1500, mode: 'digital', feedback: 35 });
  });
});

describe('factory presets', () => {
  it('reference only known effects, params and bundled assets', () => {
    for (const preset of FACTORY_PRESETS) {
      for (const [type, params] of preset.blocks) {
        const def = EFFECTS.find((e) => e.type === type);
        expect(def, `${preset.name}: ${type}`).toBeDefined();
        for (const key of Object.keys(params)) expect(def!.params.some((p) => p.id === key), `${preset.name}: ${type}.${key}`).toBe(true);
      }
      // every param survives sanitising unchanged, i.e. is in range
      const rebuilt = fromToneData(preset);
      preset.blocks.forEach(([, params], i) => expect(rebuilt[i].params).toMatchObject(params));
    }
  });
  it('gives every effect unique param ids and in-range defaults', () => {
    for (const e of EFFECTS) {
      expect(new Set(e.params.map((p) => p.id)).size).toBe(e.params.length);
      for (const p of e.params) if (p.kind === 'knob') expect(p.default >= p.min && p.default <= p.max, `${e.type}.${p.id}`).toBe(true);
    }
  });
});
