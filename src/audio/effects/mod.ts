import type { EffectDef, ParamDef } from '../types';
import { disconnectAll, mixGains, num, ramp, stopAll, str } from '../util';
import { instance, knob, pct, select } from './helpers';

const chorusParams: ParamDef[] = [
  knob('rate', 'Rate', 0.1, 8, 0.8, 'Hz', 'log'),
  pct('depth', 'Depth', 50),
  pct('mix', 'Mix', 50),
  pct('width', 'Stereo', 80),
];
export const chorus: EffectDef = {
  type: 'chorus',
  name: 'Chorus',
  short: 'CHOR',
  category: 'mod',
  description: '미세하게 흔들리는 딜레이 2보이스를 좌우로 펼친 스테레오 코러스. Mix 100%면 비브라토에 가깝습니다.',
  params: chorusParams,
  create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const lfo = ctx.createOscillator();
    const voices = [1, -1].map((sign) => {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = sign > 0 ? 0.009 : 0.012;
      const depth = ctx.createGain();
      const pan = ctx.createStereoPanner();
      lfo.connect(depth).connect(delay.delayTime);
      input.connect(delay).connect(pan).connect(wet);
      return { delay, depth, pan, sign };
    });
    input.connect(dry).connect(out);
    wet.connect(out);
    lfo.start();
    return instance(
      input,
      out,
      chorusParams,
      p,
      {
        rate: (v) => ramp(lfo.frequency, num(v), ctx),
        depth: (v) => voices.forEach((x) => ramp(x.depth.gain, x.sign * (num(v) / 100) * 0.004, ctx)),
        mix: (v) => {
          const [d, w] = mixGains(num(v) / 100);
          ramp(dry.gain, d, ctx);
          ramp(wet.gain, w * 0.8, ctx);
        },
        width: (v) => voices.forEach((x) => ramp(x.pan.pan, x.sign * (num(v) / 100), ctx)),
      },
      () => {
        stopAll([lfo]);
        disconnectAll([input, out, dry, wet, lfo, ...voices.flatMap((x) => [x.delay, x.depth, x.pan])]);
      },
    );
  },
};

const flangerParams: ParamDef[] = [
  knob('rate', 'Rate', 0.05, 5, 0.3, 'Hz', 'log'),
  pct('depth', 'Depth', 70),
  knob('manual', 'Manual', 0.3, 8, 2.5, 'ms', 'log'),
  knob('feedback', 'Feedback', -95, 95, 60, '%'),
  pct('mix', 'Mix', 50),
];
export const flanger: EffectDef = {
  type: 'flanger',
  name: 'Flanger',
  short: 'FLNG',
  category: 'mod',
  description: '아주 짧은 딜레이를 스윕해 제트기 같은 콤 필터 효과를 만듭니다. Feedback을 음수로 돌리면 다른 배음 구조.',
  params: flangerParams,
  create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delay = ctx.createDelay(0.05);
    const fb = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.connect(depth).connect(delay.delayTime);
    input.connect(delay).connect(wet).connect(out);
    delay.connect(fb).connect(delay);
    input.connect(dry).connect(out);
    lfo.start();
    let manual = 0.0025;
    let depthPct = 0.7;
    const apply = () => {
      ramp(delay.delayTime, manual, ctx);
      ramp(depth.gain, manual * 0.95 * depthPct, ctx);
    };
    return instance(
      input,
      out,
      flangerParams,
      p,
      {
        rate: (v) => ramp(lfo.frequency, num(v), ctx),
        depth: (v) => {
          depthPct = num(v) / 100;
          apply();
        },
        manual: (v) => {
          manual = num(v) / 1000;
          apply();
        },
        feedback: (v) => ramp(fb.gain, num(v) / 100, ctx),
        mix: (v) => {
          const [d, w] = mixGains(num(v) / 100);
          ramp(dry.gain, d, ctx);
          ramp(wet.gain, w, ctx);
        },
      },
      () => {
        stopAll([lfo]);
        disconnectAll([input, out, dry, wet, delay, fb, lfo, depth]);
      },
    );
  },
};

const phaserParams: ParamDef[] = [
  knob('rate', 'Rate', 0.05, 8, 0.5, 'Hz', 'log'),
  pct('depth', 'Depth', 70),
  knob('center', 'Center', 200, 2500, 800, 'Hz', 'log'),
  pct('feedback', 'Feedback', 40),
  pct('mix', 'Mix', 50),
];
export const phaser: EffectDef = {
  type: 'phaser',
  name: 'Phaser',
  short: 'PHSR',
  category: 'mod',
  description: '올패스 필터 6단을 스윕하는 페이저. Phase 90 스타일부터 깊은 공진까지.',
  params: phaserParams,
  create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const fb = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.connect(depth);
    const stages = Array.from({ length: 6 }, () => {
      const f = ctx.createBiquadFilter();
      f.type = 'allpass';
      f.Q.value = 0.5;
      depth.connect(f.frequency);
      return f;
    });
    input.connect(stages[0]);
    for (let i = 1; i < stages.length; i++) stages[i - 1].connect(stages[i]);
    const last = stages[stages.length - 1];
    last.connect(wet).connect(out);
    // Web Audio needs a delay inside any feedback cycle.
    const loopDelay = ctx.createDelay(0.01);
    loopDelay.delayTime.value = 128 / ctx.sampleRate;
    last.connect(fb).connect(loopDelay).connect(stages[0]);
    input.connect(dry).connect(out);
    lfo.start();
    let center = 800;
    let depthPct = 0.7;
    const apply = () => {
      stages.forEach((f) => ramp(f.frequency, center, ctx));
      ramp(depth.gain, center * 0.85 * depthPct, ctx);
    };
    return instance(
      input,
      out,
      phaserParams,
      p,
      {
        rate: (v) => ramp(lfo.frequency, num(v), ctx),
        depth: (v) => {
          depthPct = num(v) / 100;
          apply();
        },
        center: (v) => {
          center = num(v);
          apply();
        },
        feedback: (v) => ramp(fb.gain, (num(v) / 100) * 0.9, ctx),
        mix: (v) => {
          const [d, w] = mixGains(num(v) / 100);
          ramp(dry.gain, d, ctx);
          ramp(wet.gain, w, ctx);
        },
      },
      () => {
        stopAll([lfo]);
        disconnectAll([input, out, dry, wet, fb, lfo, depth, loopDelay, ...stages]);
      },
    );
  },
};

const tremParams: ParamDef[] = [
  knob('rate', 'Rate', 0.5, 16, 5, 'Hz', 'log'),
  pct('depth', 'Depth', 60),
  select('shape', 'Shape', [['sine', 'Sine'], ['triangle', 'Triangle'], ['square', 'Square (초퍼)']], 'sine'),
];
export const tremolo: EffectDef = {
  type: 'tremolo',
  name: 'Tremolo',
  short: 'TREM',
  category: 'mod',
  description: '음량을 주기적으로 흔드는 빈티지 앰프 트레몰로. Square는 초퍼 효과.',
  params: tremParams,
  create(ec, p) {
    const { ctx } = ec;
    const amp = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    // Soften the square edges so it doesn't click.
    const smooth = ctx.createBiquadFilter();
    smooth.type = 'lowpass';
    smooth.frequency.value = 120;
    lfo.connect(smooth).connect(depth).connect(amp.gain);
    lfo.start();
    return instance(
      amp,
      amp,
      tremParams,
      p,
      {
        rate: (v) => ramp(lfo.frequency, num(v), ctx),
        depth: (v) => {
          const d = num(v) / 100;
          ramp(amp.gain, 1 - d / 2, ctx);
          ramp(depth.gain, d / 2, ctx);
        },
        shape: (v) => {
          lfo.type = str(v, 'sine') as OscillatorType;
        },
      },
      () => {
        stopAll([lfo]);
        disconnectAll([amp, lfo, depth, smooth]);
      },
    );
  },
};
