import type { Block, EffectDef, Params } from '../types';
import { cab, nam } from './capture';
import { comp, gate, wah } from './dynamics';
import { boost, distortion, fuzz, overdrive } from './drive';
import { geq, peq } from './eq';
import { chorus, flanger, phaser, tremolo } from './mod';
import { delay, reverb } from './time';

/** Every effect available in the "add" browser, in display order. */
export const EFFECTS: EffectDef[] = [
  gate,
  comp,
  boost,
  overdrive,
  distortion,
  fuzz,
  nam,
  cab,
  peq,
  geq,
  wah,
  chorus,
  flanger,
  phaser,
  tremolo,
  delay,
  reverb,
];

export const EFFECT_BY_TYPE: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map((e) => [e.type, e]));

export function defaultParams(type: string): Params {
  const def = EFFECT_BY_TYPE[type];
  return def ? Object.fromEntries(def.params.map((p) => [p.id, p.default])) : {};
}

let counter = 0;
export function newBlock(type: string, params: Params = {}, enabled = true): Block {
  counter += 1;
  return {
    id: `${type}-${Date.now().toString(36)}-${counter}`,
    type,
    enabled,
    params: { ...defaultParams(type), ...params },
  };
}
