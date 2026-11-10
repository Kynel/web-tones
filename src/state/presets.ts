import type { ToneData } from './serialize';

export interface Preset extends ToneData {
  description: string;
  /** DI track that suits the tone. */
  track: string;
}

export const FACTORY_PRESETS: Preset[] = [
  {
    name: 'Brit Crunch',
    description: 'JCM800 크런치 + 4x12. 클래식 록 리프.',
    track: 'brit',
    blocks: [
      ['gate', { threshold: -58 }],
      ['overdrive', { drive: 2.5, tone: 5.5, level: 6.5 }, false],
      ['nam', { model: 'builtin:jcm', output: 1 }],
      ['cab', { ir: 'builtin:celestion' }],
      ['delay', { time: 340, mix: 14, feedback: 22, mode: 'analog' }, false],
      ['reverb', { space: 'room', decay: 0.9, mix: 14 }],
    ],
  },
  {
    name: 'Deluxe Clean',
    description: 'Deluxe Reverb 클린에 컴프와 스프링 리버브.',
    track: 'mayer',
    blocks: [
      ['comp', { threshold: -26, ratio: 3, makeup: 3 }],
      ['nam', { model: 'builtin:deluxe-a2' }],
      ['cab', { ir: 'builtin:celestion' }],
      ['tremolo', { rate: 4.5, depth: 45 }, false],
      ['reverb', { space: 'spring', mix: 24 }],
    ],
  },
  {
    name: 'Chime & Echo',
    description: 'AC10의 찰랑이는 엣지 + 테이프 에코 + 플레이트.',
    track: 'pluck',
    blocks: [
      ['comp', { threshold: -22, ratio: 2.5, makeup: 2 }],
      ['nam', { model: 'builtin:ac10', output: -2 }],
      ['cab', { ir: 'builtin:celestion', highcut: 10000 }],
      ['delay', { time: 420, feedback: 38, mix: 24, mode: 'tape', tone: 5 }],
      ['reverb', { space: 'emt', mix: 20 }],
    ],
  },
  {
    name: 'Smooth Lead',
    description: 'Dumble ODS에 오버드라이브를 얹은 부드러운 리드.',
    track: 'hammer-lead',
    blocks: [
      ['comp', { threshold: -24, ratio: 3, makeup: 3 }],
      ['overdrive', { drive: 3.5, tone: 4.5, level: 6 }],
      ['nam', { model: 'builtin:dumble' }],
      ['cab', { ir: 'builtin:eminence' }],
      ['peq', { p2Freq: 800, p2Gain: 2.5, highcut: 9000 }],
      ['delay', { time: 460, feedback: 30, mix: 20, mode: 'analog' }],
      ['reverb', { space: 'hall', decay: 2.6, mix: 18 }],
    ],
  },
  {
    name: 'Modern Metal',
    description: '부스트한 5153 + Mesa 4x12. 타이트한 하이게인.',
    track: 'metalcore',
    blocks: [
      ['gate', { threshold: -48, release: 60 }],
      ['boost', { gain: 6, tight: 180, bright: 3 }],
      ['nam', { model: 'builtin:5153', output: -5 }],
      ['cab', { ir: 'builtin:mesa', lowcut: 90, highcut: 9500 }],
      ['peq', { lsFreq: 100, lsGain: 1.5, p1Freq: 450, p1Gain: -2.5, p3Freq: 3500, p3Gain: 1.5 }],
    ],
  },
  {
    name: 'JC Ambient',
    description: 'JC-120 클린 + 스테레오 코러스 + 핑퐁 딜레이 + 긴 홀.',
    track: 'smooth',
    blocks: [
      ['comp', { threshold: -24, ratio: 3, makeup: 3 }],
      ['nam', { model: 'builtin:jc', output: 5 }],
      ['cab', { ir: 'builtin:celestion' }],
      ['chorus', { rate: 0.6, depth: 55, mix: 45 }],
      ['delay', { time: 520, feedback: 45, mix: 28, pingpong: 'on' }],
      ['reverb', { space: 'hall', decay: 5.5, predelay: 35, mix: 34 }],
    ],
  },
  {
    name: 'Fuzz Wall',
    description: '퍼즈를 AC10에 밀어넣은 두꺼운 벽. 페이저는 취향껏.',
    track: 'brit',
    blocks: [
      ['gate', { threshold: -52 }],
      ['fuzz', { drive: 6.5, tone: 4.5, level: 4.5 }],
      ['nam', { model: 'builtin:ac10', input: -6, output: -6 }],
      ['cab', { ir: 'builtin:mesa' }],
      ['phaser', { rate: 0.3, depth: 60, mix: 40 }, false],
      ['reverb', { space: 'plate', decay: 1.8, mix: 16 }],
    ],
  },
  {
    name: 'Funk Wah',
    description: '오토와우 + 컴프 + JC-120. 16비트 커팅용.',
    track: 'mayer',
    blocks: [
      ['comp', { threshold: -28, ratio: 5, attack: 5, makeup: 5 }],
      ['wah', { mode: '1', sensitivity: 70, q: 6 }],
      ['nam', { model: 'builtin:jc', output: -5 }],
      ['cab', { ir: 'builtin:eminence' }],
      ['reverb', { space: 'room', decay: 0.7, mix: 12 }],
    ],
  },
  {
    name: 'Bass Rig',
    description: 'Ampeg V-2 + 8x10 캐비닛.',
    track: 'downtown',
    blocks: [
      ['comp', { threshold: -22, ratio: 4, attack: 20, makeup: 3 }],
      ['nam', { model: 'builtin:ampeg' }],
      ['cab', { ir: 'builtin:ampeg', lowcut: 35, highcut: 7000 }],
    ],
  },
];
