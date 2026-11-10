import { describe, expect, it } from 'vitest';
import { formatValue, fromNorm, snap, toNorm } from './knobMath';
import { detectPitch, toNote } from './tunerMath';

describe('knob mapping', () => {
  const lin = { min: -12, max: 12 };
  const log = { min: 20, max: 20000, scale: 'log' as const };
  it('round-trips linear and log ranges', () => {
    expect(toNorm(0, lin)).toBe(0.5);
    expect(fromNorm(0.5, lin)).toBe(0);
    expect(fromNorm(toNorm(632, log), log)).toBeCloseTo(632, 0);
    expect(toNorm(632.45, log)).toBeCloseTo(0.5, 3);
  });
  it('clamps out-of-range input', () => {
    expect(fromNorm(2, lin)).toBe(12);
    expect(fromNorm(-1, log)).toBe(20);
    expect(snap(99, lin)).toBe(12);
  });
  it('honours explicit steps', () => {
    expect(snap(4.26, { min: 0, max: 10, step: 0.1 })).toBeCloseTo(4.3);
  });
  it('formats values with units', () => {
    expect(formatValue(1200, 'Hz')).toBe('1.2 kHz');
    expect(formatValue(3, 'dB', lin)).toBe('+3 dB');
    expect(formatValue(50, '%')).toBe('50%');
    expect(formatValue(4, ':1')).toBe('4:1');
  });
});

describe('tuner', () => {
  const tone = (f: number, sr = 48000, n = 2048) => Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin((2 * Math.PI * f * i) / sr) + 0.2 * Math.sin((4 * Math.PI * f * i) / sr));
  it('finds guitar string fundamentals', () => {
    for (const f of [82.41, 110, 196, 329.63, 440]) expect(detectPitch(tone(f), 48000)).toBeCloseTo(f, 0);
  });
  it('ignores silence', () => {
    expect(detectPitch(new Float32Array(2048), 48000)).toBeNull();
  });
  it('names notes with cents', () => {
    expect(toNote(440)).toEqual({ name: 'A', octave: 4, cents: 0 });
    expect(toNote(82.41)).toMatchObject({ name: 'E', octave: 2 });
    expect(toNote(445).cents).toBeGreaterThan(15);
  });
});
