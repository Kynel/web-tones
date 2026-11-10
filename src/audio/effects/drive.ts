import type { EffectDef, ParamDef } from '../types';
import { dbToGain, disconnectAll, expMap, num, pedalLevel, ramp } from '../util';
import { instance, knob, pedal } from './helpers';

const CURVE_SIZE = 8192;
/** The shaper sees x in [-1,1]; curves are evaluated at K*x so a pre-gain <= 1 spans clean..saturated. */
const K = 120;

function curve(shape: (x: number) => number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(CURVE_SIZE);
  for (let i = 0; i < CURVE_SIZE; i++) c[i] = shape(((i / (CURVE_SIZE - 1)) * 2 - 1) * K);
  return c;
}

interface Voicing {
  type: string;
  name: string;
  short: string;
  description: string;
  shape: (x: number) => number;
  /** Effective gain range into the clipper for drive 0..10. */
  gain: [number, number];
  inputHp: number;
  midHump?: { freq: number; gain: number };
  tone: [number, number];
  /** Fuzz-style tilt tone (low-pass/high-pass crossfade) instead of a plain low-pass. */
  tilt?: boolean;
  trim: number;
  defaults: [drive: number, tone: number, level: number];
}

const VOICINGS: Voicing[] = [
  {
    type: 'overdrive',
    name: 'Overdrive',
    short: 'OD',
    description: '미드가 솟는 튜브 스크리머 계열 소프트 클리핑. 앰프를 밀어주는 부스터로도 좋습니다.',
    shape: (x) => (x >= 0 ? Math.tanh(x) : 0.88 * Math.tanh(1.25 * x)),
    gain: [1.5, 70],
    inputHp: 220,
    midHump: { freq: 720, gain: 7 },
    tone: [900, 6500],
    trim: 0.28,
    defaults: [4, 5, 5],
  },
  {
    type: 'distortion',
    name: 'Distortion',
    short: 'DIST',
    description: '하드 클리핑 디스토션. RAT/DS-1 계열의 거친 질감.',
    shape: (x) => {
      const y = x / Math.pow(1 + Math.pow(Math.abs(x), 5), 0.2);
      return x >= 0 ? y : 0.94 * y;
    },
    gain: [3, 400],
    inputHp: 90,
    tone: [1100, 9000],
    trim: 0.24,
    defaults: [6, 5, 5],
  },
  {
    type: 'fuzz',
    name: 'Fuzz',
    short: 'FUZZ',
    description: '비대칭 클리핑의 두꺼운 퍼즈. Tone으로 미드 스쿱의 저역/고역 밸런스를 조절합니다.',
    shape: (x) => (x >= 0 ? Math.tanh(2.2 * x) : -0.62 * Math.tanh(3.5 * -x) - 0.1 * Math.tanh(0.2 * -x)),
    gain: [8, 1200],
    inputHp: 45,
    tone: [600, 1400],
    tilt: true,
    trim: 0.2,
    defaults: [7, 5, 5],
  },
];

function makeDrive(v: Voicing): EffectDef {
  const params: ParamDef[] = [
    pedal('drive', v.type === 'fuzz' ? 'Fuzz' : v.type === 'distortion' ? 'Dist' : 'Drive', v.defaults[0]),
    pedal('tone', 'Tone', v.defaults[1]),
    pedal('level', 'Level', v.defaults[2]),
  ];
  const shaperCurve = curve(v.shape);
  return {
    type: v.type,
    name: v.name,
    short: v.short,
    category: 'drive',
    description: v.description,
    params,
    create(ec, p) {
      const { ctx } = ec;
      const input = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = v.inputHp;
      hp.Q.value = 0.6;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = v.midHump?.freq ?? 1000;
      mid.gain.value = v.midHump?.gain ?? 0;
      mid.Q.value = 0.7;
      const pre = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.curve = shaperCurve;
      shaper.oversample = '4x';
      const dcBlock = ctx.createBiquadFilter();
      dcBlock.type = 'highpass';
      dcBlock.frequency.value = 25;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6;
      const out = ctx.createGain();
      input.connect(hp).connect(mid).connect(pre).connect(shaper).connect(dcBlock);

      // Tilt tone: crossfade a dark low-pass branch against a bright high-pass branch.
      const lpGain = ctx.createGain();
      const hpBranch = ctx.createBiquadFilter();
      hpBranch.type = 'highpass';
      const hpGain = ctx.createGain();
      if (v.tilt) {
        lp.frequency.value = v.tone[0];
        hpBranch.frequency.value = v.tone[1];
        dcBlock.connect(lp).connect(lpGain).connect(out);
        dcBlock.connect(hpBranch).connect(hpGain).connect(out);
      } else {
        dcBlock.connect(lp).connect(out);
      }

      return instance(
        input,
        out,
        params,
        p,
        {
          drive: (x) => ramp(pre.gain, expMap(num(x), v.gain[0], v.gain[1]) / K, ctx),
          tone: (x) => {
            if (v.tilt) {
              const t = num(x) / 10;
              ramp(lpGain.gain, Math.cos((t * Math.PI) / 2) * 1.3, ctx);
              ramp(hpGain.gain, Math.sin((t * Math.PI) / 2) * 1.3, ctx);
            } else ramp(lp.frequency, expMap(num(x), v.tone[0], v.tone[1]), ctx);
          },
          level: (x) => ramp(out.gain, pedalLevel(num(x)) * v.trim, ctx),
        },
        () => disconnectAll([input, hp, mid, pre, shaper, dcBlock, lp, lpGain, hpBranch, hpGain, out]),
      );
    },
  };
}

export const [overdrive, distortion, fuzz] = VOICINGS.map(makeDrive);

const boostParams: ParamDef[] = [
  knob('gain', 'Gain', 0, 24, 10, 'dB'),
  knob('tight', 'Tight', 20, 800, 20, 'Hz', 'log'),
  knob('bright', 'Bright', 0, 12, 0, 'dB'),
];
export const boost: EffectDef = {
  type: 'boost',
  name: 'Clean Boost',
  short: 'BOOST',
  category: 'drive',
  description: '클린 부스트. Tight로 저역을 깎으면 하이게인 앰프 앞 트레블 부스터가 됩니다.',
  params: boostParams,
  create(ec, p) {
    const { ctx } = ec;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 0.6;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 2500;
    const out = ctx.createGain();
    hp.connect(shelf).connect(out);
    return instance(
      hp,
      out,
      boostParams,
      p,
      {
        gain: (x) => ramp(out.gain, dbToGain(num(x)), ctx),
        tight: (x) => ramp(hp.frequency, num(x), ctx),
        bright: (x) => ramp(shelf.gain, num(x), ctx),
      },
      () => disconnectAll([hp, shelf, out]),
    );
  },
};
