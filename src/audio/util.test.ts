import { describe, expect, it } from 'vitest';
import { dbToGain, expMap, irUnityGain, mixGains, pedalLevel } from './util';

describe('irUnityGain', () => {
  it('is 1 for a unit impulse (flat 0 dB response)', () => {
    const ir = new Float32Array(512);
    ir[0] = 1;
    expect(irUnityGain(ir, 48000)).toBeCloseTo(1, 5);
  });
  it('undoes the level of a scaled impulse', () => {
    const ir = new Float32Array(512);
    ir[10] = 0.25;
    expect(irUnityGain(ir, 48000)).toBeCloseTo(4, 4);
  });
  it('falls back to 1 for silence', () => {
    expect(irUnityGain(new Float32Array(128), 48000)).toBe(1);
  });
});

describe('level helpers', () => {
  it('converts dB to gain', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });
  it('keeps equal power across the dry/wet mix', () => {
    for (const m of [0, 0.25, 0.5, 1]) {
      const [d, w] = mixGains(m);
      expect(d * d + w * w).toBeCloseTo(1, 6);
    }
    expect(mixGains(2)).toEqual(mixGains(1));
  });
  it('maps pedal knobs', () => {
    expect(pedalLevel(5)).toBe(1);
    expect(pedalLevel(0)).toBe(0);
    expect(expMap(0, 100, 1000)).toBeCloseTo(100);
    expect(expMap(10, 100, 1000)).toBeCloseTo(1000);
    expect(expMap(5, 100, 10000)).toBeCloseTo(1000);
  });
});
