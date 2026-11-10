export interface Range {
  min: number;
  max: number;
  scale?: 'lin' | 'log';
  step?: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Value -> 0..1 knob position. */
export function toNorm(v: number, r: Range): number {
  if (r.scale === 'log' && r.min > 0) return clamp01(Math.log(v / r.min) / Math.log(r.max / r.min));
  return clamp01((v - r.min) / (r.max - r.min));
}

/** 0..1 knob position -> value, snapped to a sensible precision. */
export function fromNorm(n: number, r: Range): number {
  const x = clamp01(n);
  const raw = r.scale === 'log' && r.min > 0 ? r.min * Math.pow(r.max / r.min, x) : r.min + x * (r.max - r.min);
  return snap(raw, r);
}

export function snap(v: number, r: Range): number {
  const clamped = Math.min(r.max, Math.max(r.min, v));
  if (r.step) return Math.round(clamped / r.step) * r.step;
  // ~3 significant digits keeps log-scaled values tidy without visible stepping.
  const mag = Math.abs(clamped);
  if (mag === 0) return 0;
  const digits = Math.max(0, 2 - Math.floor(Math.log10(mag)));
  const f = Math.pow(10, Math.min(digits, 3));
  return Math.round(clamped * f) / f;
}

export function formatValue(v: number, unit = '', r?: Range): string {
  if (unit === 'Hz' && Math.abs(v) >= 1000) return `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz`;
  const span = r ? r.max - r.min : 100;
  const decimals = r?.step ? (r.step < 1 ? 1 : 0) : Math.abs(v) >= 100 || span >= 150 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  const text = `${+v.toFixed(decimals)}`;
  const signed = unit === 'dB' && v > 0 ? `+${text}` : text;
  return unit ? `${signed}${unit === '%' || unit === ':1' ? '' : ' '}${unit}` : signed;
}
