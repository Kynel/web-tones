import type { NamNode } from 'neural-amp-modeler-wasm/engine';
import { loadAssetBytes, loadIrBuffer } from '../assets';
import type { EffectDef, ParamDef } from '../types';
import { dbToGain, disconnectAll, mixGains, num, ramp, str } from '../util';
import { instance, knob, pct, select } from './helpers';

const namParams: ParamDef[] = [
  { kind: 'asset', id: 'model', label: '캡처', assetKind: 'nam', default: 'builtin:jcm' },
  knob('input', 'Input', -24, 24, 0, 'dB'),
  knob('output', 'Output', -24, 24, 0, 'dB'),
  select('quality', 'Quality', [['full', 'Full'], ['lite', 'Lite (저사양)']], 'full'),
];

/**
 * A Neural Amp Modeler capture: amp, pedal, or full rig. Runs the official
 * NAM core (compiled to wasm) inside an AudioWorklet.
 */
export const nam: EffectDef = {
  type: 'nam',
  name: 'NAM Capture',
  short: 'NAM',
  category: 'capture',
  description:
    '실제 앰프·페달을 신경망으로 캡처한 NAM(A2) 모델. 내장 캡처를 고르거나 .nam 파일을 직접 불러오세요. Input으로 게인 스테이징을 조절합니다.',
  params: namParams,
  async create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const out = ctx.createGain();
    const node: NamNode = await ec.nam.createNode();
    input.connect(node).connect(out);

    let token = 0;
    let disposed = false;
    let quality = str(p.quality, 'full');
    let slimmable = false;
    const slim = () => (quality === 'lite' ? 0.25 : undefined);

    async function load(id: string) {
      const mine = ++token;
      ec.report({ loading: true });
      try {
        const json = new TextDecoder().decode(await loadAssetBytes('nam', id));
        if (mine !== token || disposed) return;
        const info = await node.loadModel(json, { slimSize: slim() });
        if (mine !== token || disposed) return;
        slimmable = info.slimmable;
        const sr = info.expectedSampleRate;
        ec.report({
          info: [
            info.slimmable ? 'NAM A2' : 'NAM (legacy)',
            sr > 0 ? `${sr / 1000} kHz` : '',
            info.hasLoudness ? `${info.loudness.toFixed(1)} dB` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        });
      } catch (e) {
        if (mine !== token || disposed) return;
        await node.unloadModel().catch(() => {});
        ec.report({ error: `모델 로드 실패: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    return instance(
      input,
      out,
      namParams,
      p,
      {
        model: (v) => void load(str(v)),
        input: (v) => ramp(input.gain, dbToGain(num(v)), ctx),
        output: (v) => ramp(out.gain, dbToGain(num(v)), ctx),
        quality: (v) => {
          const next = str(v, 'full');
          if (next === quality) return;
          quality = next;
          if (slimmable) node.setSlimSize(slim() ?? 1).catch(() => {});
        },
      },
      () => {
        disposed = true;
        disconnectAll([input, out]);
        node.dispose().catch(() => {});
      },
    );
  },
};

const cabParams: ParamDef[] = [
  { kind: 'asset', id: 'ir', label: 'IR', assetKind: 'ir', default: 'builtin:celestion' },
  knob('lowcut', 'Low Cut', 20, 400, 70, 'Hz', 'log'),
  knob('highcut', 'High Cut', 2000, 20000, 12000, 'Hz', 'log'),
  pct('mix', 'Mix', 100),
  knob('level', 'Level', -24, 12, 0, 'dB'),
];

export const cab: EffectDef = {
  type: 'cab',
  name: 'Cabinet IR',
  short: 'CAB',
  category: 'cab',
  description:
    '실제 스피커 캐비닛+마이크의 임펄스 응답(IR)을 컨볼루션합니다. 앰프 캡처 뒤에 두세요. WAV IR 파일을 불러올 수 있습니다.',
  params: cabParams,
  create(ec, p) {
    const { ctx } = ec;
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.Q.value = 0.707;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.707;
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const out = ctx.createGain();
    input.connect(conv).connect(hp).connect(lp).connect(wet).connect(out);
    input.connect(dry).connect(out);

    let mix = 1;
    let loaded = false;
    let token = 0;
    let disposed = false;
    const applyMix = () => {
      // Until an IR is in place the convolver is silent: pass the dry signal.
      const [d, w] = loaded ? mixGains(mix) : [1, 0];
      ramp(dry.gain, d, ctx);
      ramp(wet.gain, w, ctx);
    };

    async function load(id: string) {
      const mine = ++token;
      ec.report({ loading: true });
      try {
        const buf = await loadIrBuffer(ctx, id);
        if (mine !== token || disposed) return;
        conv.buffer = buf;
        loaded = true;
        applyMix();
        ec.report({ info: `${(buf.duration * 1000).toFixed(0)} ms · ${buf.sampleRate / 1000} kHz` });
      } catch (e) {
        if (mine !== token || disposed) return;
        loaded = false;
        applyMix();
        ec.report({ error: `IR 로드 실패: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    return instance(
      input,
      out,
      cabParams,
      p,
      {
        ir: (v) => void load(str(v)),
        lowcut: (v) => ramp(hp.frequency, num(v), ctx),
        highcut: (v) => ramp(lp.frequency, num(v), ctx),
        mix: (v) => {
          mix = num(v) / 100;
          applyMix();
        },
        level: (v) => ramp(out.gain, dbToGain(num(v)), ctx),
      },
      () => {
        disposed = true;
        disconnectAll([input, conv, hp, lp, wet, dry, out]);
      },
    );
  },
};
