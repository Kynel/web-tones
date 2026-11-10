import type { NamEngine } from 'neural-amp-modeler-wasm/engine';

export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

export type Category = 'dynamics' | 'drive' | 'capture' | 'cab' | 'eq' | 'mod' | 'delay' | 'reverb';

interface ParamBase {
  id: string;
  label: string;
  /** Hide this control unless predicate passes (e.g. wah rate only in LFO mode). */
  visible?: (p: Params) => boolean;
}
export interface KnobParam extends ParamBase {
  kind: 'knob';
  min: number;
  max: number;
  default: number;
  unit?: string;
  /** 'log' for frequencies and times. */
  scale?: 'lin' | 'log';
  step?: number;
}
export interface SelectParam extends ParamBase {
  kind: 'select';
  options: { value: string; label: string }[];
  default: string;
}
export interface AssetParam extends ParamBase {
  kind: 'asset';
  assetKind: 'nam' | 'ir';
  default: string;
}
export type ParamDef = KnobParam | SelectParam | AssetParam;

export interface BlockStatus {
  loading?: boolean;
  error?: string;
  info?: string;
}

export interface EffectContext {
  ctx: BaseAudioContext;
  nam: NamEngine;
  /** Report async state (model loading, errors) for the UI. */
  report(status: BlockStatus): void;
}

export interface EffectInstance {
  input: AudioNode;
  output: AudioNode;
  set(id: string, value: ParamValue): void;
  dispose(): void;
  /** Optional live meter value (e.g. compressor gain reduction in dB). */
  meter?(): number;
}

export interface EffectDef {
  type: string;
  name: string;
  /** Short label for the chain tile. */
  short: string;
  category: Category;
  description: string;
  params: ParamDef[];
  create(ec: EffectContext, params: Params): Promise<EffectInstance> | EffectInstance;
}

export interface Block {
  id: string;
  type: string;
  enabled: boolean;
  params: Params;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  dynamics: '다이내믹스',
  drive: '드라이브',
  capture: 'NAM 캡처',
  cab: '캐비닛',
  eq: 'EQ',
  mod: '모듈레이션',
  delay: '딜레이',
  reverb: '리버브',
};
