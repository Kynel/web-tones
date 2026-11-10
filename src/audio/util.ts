import type { ParamValue } from './types';

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const num = (v: ParamValue | undefined, fallback = 0) => (typeof v === 'number' ? v : fallback);
export const str = (v: ParamValue | undefined, fallback = '') => (typeof v === 'string' ? v : fallback);

/** Smoothly move an AudioParam (avoids zipper noise on knob drags). */
export function ramp(param: AudioParam, value: number, ctx: BaseAudioContext, tc = 0.015) {
  param.setTargetAtTime(value, ctx.currentTime, tc);
}

/** Equal-power dry/wet gains for a 0..1 mix. */
export function mixGains(mix: number): [dry: number, wet: number] {
  const m = Math.min(1, Math.max(0, mix));
  return [Math.cos((m * Math.PI) / 2), Math.sin((m * Math.PI) / 2)];
}

/** 0..10 pedal-style level knob: 5 = unity, 10 = +12 dB, 0 = silent. */
export const pedalLevel = (v: number) => Math.pow(v / 5, 2);

/** Map 0..10 knob to an exponential range. */
export const expMap = (v: number, lo: number, hi: number) => lo * Math.pow(hi / lo, Math.min(10, Math.max(0, v)) / 10);

export function disconnectAll(nodes: (AudioNode | undefined | null)[]) {
  for (const n of nodes) {
    try {
      n?.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
export function stopAll(oscs: (AudioScheduledSourceNode | undefined)[]) {
  for (const o of oscs) {
    try {
      o?.stop();
    } catch {
      /* not started */
    }
  }
}

/**
 * Gain that brings an impulse response to unity in-band level: the mean power
 * of its frequency response over 100 Hz - 5 kHz becomes 0 dB. Cabinet IRs come
 * at arbitrary levels; with this a cab neither boosts nor cuts the amp in front
 * of it and swapping cabs does not jump in volume (same convention as the NAM
 * plugin / TONE3000 player).
 */
export function irUnityGain(data: Float32Array, sampleRate: number): number {
  const n = Math.min(data.length, sampleRate); // the first second is plenty for a cab
  const POINTS = 48;
  let power = 0;
  for (let k = 0; k < POINTS; k++) {
    const f = 100 * Math.pow(50, k / (POINTS - 1));
    const w = (2 * Math.PI * f) / sampleRate;
    // Goertzel: |H(f)|^2 without a full FFT
    const c = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const s0 = data[i] + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    power += s1 * s1 + s2 * s2 - c * s1 * s2;
  }
  const mean = power / POINTS;
  return mean > 1e-12 ? 1 / Math.sqrt(mean) : 1;
}
