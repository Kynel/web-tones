import type { EffectInstance, ParamDef, Params, ParamValue } from '../types';

type Setters = Record<string, (v: ParamValue) => void>;

/** Assemble an EffectInstance: applies defaults + current params through the setters. */
export function instance(
  input: AudioNode,
  output: AudioNode,
  defs: ParamDef[],
  params: Params,
  setters: Setters,
  dispose: () => void,
  meter?: () => number,
): EffectInstance {
  for (const d of defs) setters[d.id]?.(params[d.id] ?? d.default);
  return {
    input,
    output,
    set: (id, v) => setters[id]?.(v),
    dispose,
    meter,
  };
}

export const knob = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  unit = '',
  scale: 'lin' | 'log' = 'lin',
  extra: Partial<Extract<ParamDef, { kind: 'knob' }>> = {},
): ParamDef => ({ kind: 'knob', id, label, min, max, default: def, unit, scale, ...extra });

export const select = (
  id: string,
  label: string,
  options: [value: string, label: string][],
  def: string,
  extra: Partial<Extract<ParamDef, { kind: 'select' }>> = {},
): ParamDef => ({
  kind: 'select',
  id,
  label,
  options: options.map(([value, l]) => ({ value, label: l })),
  default: def,
  ...extra,
});

export const pct = (id: string, label: string, def: number): ParamDef => knob(id, label, 0, 100, def, '%');
export const pedal = (id: string, label: string, def: number): ParamDef => knob(id, label, 0, 10, def, '', 'lin', { step: 0.1 });
