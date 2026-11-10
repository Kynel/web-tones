import type { EffectDef, ParamDef, Params } from '../types';
import { dbToGain, disconnectAll, num, ramp } from '../util';
import { instance, knob } from './helpers';

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  gain: number;
  q: number;
}

const peqParams: ParamDef[] = [
  knob('lowcut', 'Low Cut', 20, 500, 20, 'Hz', 'log'),
  knob('lsFreq', 'Low Freq', 40, 400, 120, 'Hz', 'log'),
  knob('lsGain', 'Low', -15, 15, 0, 'dB'),
  knob('p1Freq', 'LoMid Freq', 100, 1500, 400, 'Hz', 'log'),
  knob('p1Gain', 'LoMid', -15, 15, 0, 'dB'),
  knob('p1Q', 'LoMid Q', 0.3, 8, 1, '', 'log'),
  knob('p2Freq', 'Mid Freq', 300, 4000, 1000, 'Hz', 'log'),
  knob('p2Gain', 'Mid', -15, 15, 0, 'dB'),
  knob('p2Q', 'Mid Q', 0.3, 8, 1, '', 'log'),
  knob('p3Freq', 'HiMid Freq', 1000, 10000, 3000, 'Hz', 'log'),
  knob('p3Gain', 'HiMid', -15, 15, 0, 'dB'),
  knob('p3Q', 'HiMid Q', 0.3, 8, 1, '', 'log'),
  knob('hsFreq', 'High Freq', 2000, 14000, 6000, 'Hz', 'log'),
  knob('hsGain', 'High', -15, 15, 0, 'dB'),
  knob('highcut', 'High Cut', 2000, 20000, 20000, 'Hz', 'log'),
  knob('level', 'Level', -18, 18, 0, 'dB'),
];

const GEQ_BANDS = [100, 200, 400, 800, 1600, 3200, 6400];
const geqLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);
const geqParams: ParamDef[] = [
  ...GEQ_BANDS.map((f) => knob(`b${f}`, geqLabel(f), -15, 15, 0, 'dB')),
  knob('level', 'Level', -18, 18, 0, 'dB'),
];

const val = (p: Params, defs: ParamDef[], id: string) =>
  num(p[id], defs.find((d) => d.id === id)!.default as number);

/** The biquad stack an EQ block represents; shared by the audio graph and the response plot. */
export function eqFilterSpecs(type: string, p: Params): FilterSpec[] {
  if (type === 'geq') {
    return GEQ_BANDS.map((f) => ({ type: 'peaking', freq: f, gain: val(p, geqParams, `b${f}`), q: 1.4 }));
  }
  const v = (id: string) => val(p, peqParams, id);
  return [
    { type: 'highpass', freq: v('lowcut'), gain: 0, q: 0.707 },
    { type: 'lowshelf', freq: v('lsFreq'), gain: v('lsGain'), q: 1 },
    { type: 'peaking', freq: v('p1Freq'), gain: v('p1Gain'), q: v('p1Q') },
    { type: 'peaking', freq: v('p2Freq'), gain: v('p2Gain'), q: v('p2Q') },
    { type: 'peaking', freq: v('p3Freq'), gain: v('p3Gain'), q: v('p3Q') },
    { type: 'highshelf', freq: v('hsFreq'), gain: v('hsGain'), q: 1 },
    { type: 'lowpass', freq: v('highcut'), gain: 0, q: 0.707 },
  ];
}

function makeEq(type: string, name: string, short: string, description: string, params: ParamDef[]): EffectDef {
  return {
    type,
    name,
    short,
    category: 'eq',
    description,
    params,
    create(ec, p) {
      const { ctx } = ec;
      const current: Params = { ...p };
      const filters = eqFilterSpecs(type, current).map((s) => {
        const f = ctx.createBiquadFilter();
        f.type = s.type;
        return f;
      });
      const out = ctx.createGain();
      for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
      filters[filters.length - 1].connect(out);
      const apply = () => {
        eqFilterSpecs(type, current).forEach((s, i) => {
          ramp(filters[i].frequency, s.freq, ctx);
          ramp(filters[i].gain, s.gain, ctx);
          ramp(filters[i].Q, s.q, ctx);
        });
        ramp(out.gain, dbToGain(val(current, params, 'level')), ctx);
      };
      const setters = Object.fromEntries(
        params.map((d) => [
          d.id,
          (v: unknown) => {
            current[d.id] = v as number;
            apply();
          },
        ]),
      );
      return instance(filters[0], out, params, p, setters, () => disconnectAll([...filters, out]));
    },
  };
}

export const peq = makeEq(
  'peq',
  'Parametric EQ',
  'PEQ',
  '로우/하이 컷, 셸프 2개, 피킹 3밴드의 파라메트릭 EQ. 앰프 뒤에서 톤을 다듬는 데 사용합니다.',
  peqParams,
);
export const geq = makeEq(
  'geq',
  'Graphic EQ',
  'GEQ',
  '7밴드 그래픽 EQ. 앰프 앞에서는 게인 질감을, 뒤에서는 최종 톤을 조절합니다.',
  geqParams,
);
