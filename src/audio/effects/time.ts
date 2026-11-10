import { loadIrBuffer } from '../assets';
import type { EffectDef, ParamDef } from '../types';
import { disconnectAll, expMap, mixGains, num, ramp, stopAll, str } from '../util';
import { instance, knob, pct, pedal, select } from './helpers';

const delayParams: ParamDef[] = [
  knob('time', 'Time', 20, 1500, 380, 'ms', 'log'),
  pct('feedback', 'Feedback', 35),
  pct('mix', 'Mix', 25),
  pedal('tone', 'Tone', 6),
  select('mode', 'Type', [['digital', 'Digital'], ['analog', 'Analog (BBD)'], ['tape', 'Tape Echo']], 'digital'),
  select('pingpong', 'Stereo', [['off', 'Mono'], ['on', 'Ping-Pong']], 'off'),
];

const TONE_RANGE: Record<string, [number, number]> = {
  digital: [2000, 18000],
  analog: [700, 3800],
  tape: [1200, 6500],
};
const tapeCurve = (() => {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(((i / (c.length - 1)) * 2 - 1) * 1.6) / Math.tanh(1.6);
  return c;
})();

export const delay: EffectDef = {
  type: 'delay',
  name: 'Delay',
  short: 'DLY',
  category: 'delay',
  description: '디지털/아날로그(BBD)/테이프 에코 3가지 캐릭터의 딜레이. 핑퐁으로 좌우를 오가는 스테레오 반복.',
  params: delayParams,
  create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const dA = ctx.createDelay(2);
    const dB = ctx.createDelay(2);
    const panA = ctx.createStereoPanner();
    const panB = ctx.createStereoPanner();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const sat = ctx.createWaveShaper();
    const fb = ctx.createGain();
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.7;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 0;
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(dA.delayTime);
    wobbleDepth.connect(dB.delayTime);
    wobble.start();

    input.connect(dry).connect(out);
    input.connect(dA);
    dA.connect(panA).connect(wet).connect(out);
    dB.connect(panB).connect(wet);
    lp.connect(hp).connect(sat).connect(fb).connect(dA);

    let mode = 'digital';
    let tone = 6;
    const applyTone = () => {
      const [lo, hi] = TONE_RANGE[mode] ?? TONE_RANGE.digital;
      ramp(lp.frequency, expMap(tone, lo, hi), ctx);
    };
    /** Mono: A feeds back into itself. Ping-pong: A -> B -> back to A, panned apart. */
    const wire = (pingpong: boolean) => {
      disconnectAll([dB]);
      try {
        dA.disconnect(lp);
      } catch { /* not connected */ }
      try {
        dA.disconnect(dB);
      } catch { /* not connected */ }
      if (pingpong) {
        dA.connect(dB);
        dB.connect(panB).connect(wet);
        dB.connect(lp);
      } else dA.connect(lp);
      ramp(panA.pan, pingpong ? -0.85 : 0, ctx);
      ramp(panB.pan, pingpong ? 0.85 : 0, ctx);
    };

    return instance(
      input,
      out,
      delayParams,
      p,
      {
        time: (v) => {
          dA.delayTime.setTargetAtTime(num(v) / 1000, ctx.currentTime, 0.06);
          dB.delayTime.setTargetAtTime(num(v) / 1000, ctx.currentTime, 0.06);
        },
        feedback: (v) => ramp(fb.gain, (num(v) / 100) * 0.95, ctx),
        mix: (v) => {
          const [d, w] = mixGains(num(v) / 100);
          ramp(dry.gain, d, ctx);
          ramp(wet.gain, w, ctx);
        },
        tone: (v) => {
          tone = num(v);
          applyTone();
        },
        mode: (v) => {
          mode = str(v, 'digital');
          sat.curve = mode === 'tape' ? tapeCurve : null;
          ramp(wobbleDepth.gain, mode === 'tape' ? 0.0004 : mode === 'analog' ? 0.00008 : 0, ctx);
          ramp(hp.frequency, mode === 'digital' ? 40 : 140, ctx);
          applyTone();
        },
        pingpong: (v) => wire(v === 'on'),
      },
      () => {
        stopAll([wobble]);
        disconnectAll([input, out, dry, wet, dA, dB, panA, panB, lp, hp, sat, fb, wobble, wobbleDepth]);
      },
    );
  },
};

// --------------------------------------------------------------------- reverb

interface Space {
  bright: number;
  damping: number;
  onset: number;
  earlyTaps: number;
}
const SPACES: Record<string, Space> = {
  room: { bright: 9000, damping: 2.6, onset: 0.002, earlyTaps: 10 },
  hall: { bright: 7500, damping: 1.7, onset: 0.03, earlyTaps: 6 },
  plate: { bright: 15000, damping: 0.8, onset: 0.001, earlyTaps: 0 },
};
const IR_SPACES: Record<string, string> = { emt: 'builtin:plate', spring: 'builtin:spring' };

/** Synthesize a stereo reverb tail: exponentially decaying noise whose highs die faster. */
export function generateReverbIR(ctx: BaseAudioContext, type: string, decay: number): AudioBuffer {
  const s = SPACES[type] ?? SPACES.hall;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(Math.min(decay * 1.25 + 0.1, 14) * sr));
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp((-6.9078 * t) / decay) * (1 - Math.exp(-t / s.onset));
      const fc = Math.max(600, s.bright * Math.exp((-s.damping * t) / decay));
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      y = (1 - a) * (Math.random() * 2 - 1) + a * y;
      data[i] = y * env;
    }
    for (let k = 0; k < s.earlyTaps; k++) {
      const at = Math.floor((0.004 + Math.random() * 0.045) * sr);
      if (at < len) data[at] += (Math.random() > 0.5 ? 1 : -1) * 0.35 * (1 - k / (s.earlyTaps + 2));
    }
  }
  return buf;
}

const reverbParams: ParamDef[] = [
  select(
    'space',
    'Type',
    [
      ['room', 'Room'],
      ['hall', 'Hall'],
      ['plate', 'Plate'],
      ['emt', 'EMT 140 Plate (IR)'],
      ['spring', 'Fender Spring (IR)'],
    ],
    'hall',
  ),
  knob('decay', 'Decay', 0.2, 12, 2.2, 's', 'log', { visible: (p) => !(String(p.space) in IR_SPACES) }),
  knob('predelay', 'Pre-Delay', 0, 150, 15, 'ms'),
  pedal('tone', 'Tone', 6),
  pct('mix', 'Mix', 25),
];

export const reverb: EffectDef = {
  type: 'reverb',
  name: 'Reverb',
  short: 'REV',
  category: 'reverb',
  description:
    '컨볼루션 리버브. Room/Hall/Plate는 Decay에 맞춰 잔향을 합성하고, EMT 140 플레이트와 Fender 스프링은 실제 기기의 IR입니다.',
  params: reverbParams,
  create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const pre = ctx.createDelay(0.5);
    const conv = ctx.createConvolver();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    input.connect(dry).connect(out);
    input.connect(pre).connect(conv).connect(hp).connect(lp).connect(wet).connect(out);

    let space = 'hall';
    let decay = 2.2;
    let token = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let first = true;

    const rebuild = () => {
      const mine = ++token;
      const irId = IR_SPACES[space];
      if (irId) {
        ec.report({ loading: true });
        loadIrBuffer(ctx, irId).then(
          (buf) => {
            if (mine !== token || disposed) return;
            conv.buffer = buf;
            ec.report({});
          },
          (e) => mine === token && !disposed && ec.report({ error: `IR 로드 실패: ${e?.message ?? e}` }),
        );
      } else {
        conv.buffer = generateReverbIR(ctx, space, decay);
        ec.report({});
      }
    };
    /** Regenerating the tail is cheap but not free: debounce knob drags. */
    const schedule = () => {
      clearTimeout(timer);
      if (first) return;
      timer = setTimeout(rebuild, 120);
    };

    const inst = instance(
      input,
      out,
      reverbParams,
      p,
      {
        space: (v) => {
          space = str(v, 'hall');
          schedule();
        },
        decay: (v) => {
          decay = num(v, 2.2);
          schedule();
        },
        predelay: (v) => ramp(pre.delayTime, num(v) / 1000, ctx),
        tone: (v) => ramp(lp.frequency, expMap(num(v), 1500, 16000), ctx),
        mix: (v) => {
          const [d, w] = mixGains(num(v) / 100);
          ramp(dry.gain, d, ctx);
          ramp(wet.gain, w, ctx);
        },
      },
      () => {
        disposed = true;
        clearTimeout(timer);
        disconnectAll([input, out, dry, wet, pre, conv, lp, hp]);
      },
    );
    first = false;
    rebuild();
    return inst;
  },
};
