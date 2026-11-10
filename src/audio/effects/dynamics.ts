import type { EffectDef, ParamDef } from '../types';
import { disconnectAll, num } from '../util';
import { instance, knob, pct, select } from './helpers';

function workletEffect(
  processor: string,
  defs: ParamDef[],
  /** Map UI value -> worklet AudioParam value. */
  map: Record<string, (v: number) => number> = {},
  withMeter = false,
): EffectDef['create'] {
  return (ec, params) => {
    const node = new AudioWorkletNode(ec.ctx, processor, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: 'max',
    });
    let meterValue = 0;
    if (withMeter) node.port.onmessage = (e) => (meterValue = e.data as number);
    const setters = Object.fromEntries(
      defs.map((d) => [
        d.id,
        (v: unknown) => {
          const p = node.parameters.get(d.id);
          const n = d.kind === 'select' ? Number(v) : num(v as number);
          p?.setTargetAtTime(map[d.id] ? map[d.id](n) : n, ec.ctx.currentTime, 0.01);
        },
      ]),
    );
    return instance(node, node, defs, params, setters, () => disconnectAll([node]), withMeter ? () => meterValue : undefined);
  };
}

const gateParams: ParamDef[] = [
  knob('threshold', 'Threshold', -80, -10, -52, 'dB'),
  knob('attack', 'Attack', 0.1, 50, 1, 'ms', 'log'),
  knob('hold', 'Hold', 0, 500, 60, 'ms'),
  knob('release', 'Release', 5, 1000, 120, 'ms', 'log'),
  knob('range', 'Range', -90, 0, -80, 'dB'),
];
export const gate: EffectDef = {
  type: 'gate',
  name: 'Noise Gate',
  short: 'GATE',
  category: 'dynamics',
  description: '연주하지 않을 때 험/히스 노이즈를 차단합니다. 하이게인 앰프 앞에 두세요.',
  params: gateParams,
  create: workletEffect('wt-gate', gateParams),
};

const compParams: ParamDef[] = [
  knob('threshold', 'Threshold', -60, 0, -24, 'dB'),
  knob('ratio', 'Ratio', 1, 20, 4, ':1', 'log'),
  knob('attack', 'Attack', 0.1, 200, 12, 'ms', 'log'),
  knob('release', 'Release', 10, 2000, 180, 'ms', 'log'),
  knob('knee', 'Knee', 0, 24, 6, 'dB'),
  knob('makeup', 'Makeup', -12, 24, 4, 'dB'),
  pct('mix', 'Mix', 100),
];
export const comp: EffectDef = {
  type: 'comp',
  name: 'Compressor',
  short: 'COMP',
  category: 'dynamics',
  description: '피킹 다이내믹을 눌러 서스테인과 균일한 음량을 만듭니다. Mix를 내리면 패럴렐 컴프레션.',
  params: compParams,
  create: workletEffect('wt-comp', compParams, { mix: (v) => v / 100 }, true),
};

const wahParams: ParamDef[] = [
  select('mode', 'Mode', [['1', 'Auto (엔벨로프)'], ['0', 'Manual (페달)'], ['2', 'LFO']], '1'),
  pct('position', 'Pedal', 50),
  pct('sensitivity', 'Sens', 60),
  knob('rate', 'Rate', 0.05, 12, 1.5, 'Hz', 'log'),
  knob('q', 'Q', 0.7, 14, 5, '', 'log'),
  pct('mix', 'Mix', 100),
];
wahParams[1].visible = (p) => p.mode === '0';
wahParams[2].visible = (p) => (p.mode ?? '1') === '1';
wahParams[3].visible = (p) => p.mode === '2';
export const wah: EffectDef = {
  type: 'wah',
  name: 'Wah',
  short: 'WAH',
  category: 'mod',
  description: '공진 필터 와우. 피킹 세기에 반응하는 오토와우, 고정 페달, LFO 모드를 지원합니다.',
  params: wahParams,
  create: workletEffect('wt-wah', wahParams, {
    position: (v) => v / 100,
    sensitivity: (v) => v / 100,
    mix: (v) => v / 100,
  }),
};
