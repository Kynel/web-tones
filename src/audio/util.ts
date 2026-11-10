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
