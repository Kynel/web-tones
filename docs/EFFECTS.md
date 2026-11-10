# 이펙터 레퍼런스

체인에 넣을 수 있는 이펙터 17종입니다. 권장 순서는 일반적인 페달보드와 같습니다.

```
Gate → Comp → Wah → Boost/Drive → NAM Capture(앰프) → Cabinet IR → EQ → Modulation → Delay → Reverb
```

물론 순서는 자유입니다. 예를 들어 EQ를 앰프 **앞**에 두면 게인 질감이 바뀌고, **뒤**에 두면 최종 톤만 바뀝니다.

### Noise Gate (`gate`) — 다이내믹스

연주하지 않을 때 험/히스 노이즈를 차단합니다. 하이게인 앰프 앞에 두세요.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Threshold | -80 – -10 dB | -52 |
| Attack | 0.1 – 50 ms (로그) | 1 |
| Hold | 0 – 500 ms | 60 |
| Release | 5 – 1000 ms (로그) | 120 |
| Range | -90 – 0 dB | -80 |

### Compressor (`comp`) — 다이내믹스

피킹 다이내믹을 눌러 서스테인과 균일한 음량을 만듭니다. Mix를 내리면 패럴렐 컴프레션.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Threshold | -60 – 0 dB | -24 |
| Ratio | 1 – 20 :1 (로그) | 4 |
| Attack | 0.1 – 200 ms (로그) | 12 |
| Release | 10 – 2000 ms (로그) | 180 |
| Knee | 0 – 24 dB | 6 |
| Makeup | -12 – 24 dB | 4 |
| Mix | 0 – 100 % | 100 |

### Clean Boost (`boost`) — 드라이브

클린 부스트. Tight로 저역을 깎으면 하이게인 앰프 앞 트레블 부스터가 됩니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Gain | 0 – 24 dB | 10 |
| Tight | 20 – 800 Hz (로그) | 20 |
| Bright | 0 – 12 dB | 0 |

### Overdrive (`overdrive`) — 드라이브

미드가 솟는 튜브 스크리머 계열 소프트 클리핑. 앰프를 밀어주는 부스터로도 좋습니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Drive | 0 – 10 | 4 |
| Tone | 0 – 10 | 5 |
| Level | 0 – 10 | 5 |

### Distortion (`distortion`) — 드라이브

하드 클리핑 디스토션. RAT/DS-1 계열의 거친 질감.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Dist | 0 – 10 | 6 |
| Tone | 0 – 10 | 5 |
| Level | 0 – 10 | 5 |

### Fuzz (`fuzz`) — 드라이브

비대칭 클리핑의 두꺼운 퍼즈. Tone으로 미드 스쿱의 저역/고역 밸런스를 조절합니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Fuzz | 0 – 10 | 7 |
| Tone | 0 – 10 | 5 |
| Level | 0 – 10 | 5 |

### NAM Capture (`nam`) — NAM 캡처

실제 앰프·페달을 신경망으로 캡처한 NAM(A2) 모델. 내장 캡처를 고르거나 .nam 파일을 직접 불러오세요. Input으로 게인 스테이징을 조절합니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| 캡처 | 내장 목록 또는 내 파일 (.nam) | jcm |
| Input | -24 – 24 dB | 0 |
| Output | -24 – 24 dB | 0 |
| Quality | Full / Lite (저사양) | Full |

### Cabinet IR (`cab`) — 캐비닛

실제 스피커 캐비닛+마이크의 임펄스 응답(IR)을 컨볼루션합니다. 앰프 캡처 뒤에 두세요. WAV IR 파일을 불러올 수 있습니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| IR | 내장 목록 또는 내 파일 (.wav) | celestion |
| Low Cut | 20 – 400 Hz (로그) | 70 |
| High Cut | 2000 – 20000 Hz (로그) | 12000 |
| Mix | 0 – 100 % | 100 |
| Level | -24 – 12 dB | 0 |

### Parametric EQ (`peq`) — EQ

로우/하이 컷, 셸프 2개, 피킹 3밴드의 파라메트릭 EQ. 앰프 뒤에서 톤을 다듬는 데 사용합니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Low Cut | 20 – 500 Hz (로그) | 20 |
| Low Freq | 40 – 400 Hz (로그) | 120 |
| Low | -15 – 15 dB | 0 |
| LoMid Freq | 100 – 1500 Hz (로그) | 400 |
| LoMid | -15 – 15 dB | 0 |
| LoMid Q | 0.3 – 8 (로그) | 1 |
| Mid Freq | 300 – 4000 Hz (로그) | 1000 |
| Mid | -15 – 15 dB | 0 |
| Mid Q | 0.3 – 8 (로그) | 1 |
| HiMid Freq | 1000 – 10000 Hz (로그) | 3000 |
| HiMid | -15 – 15 dB | 0 |
| HiMid Q | 0.3 – 8 (로그) | 1 |
| High Freq | 2000 – 14000 Hz (로그) | 6000 |
| High | -15 – 15 dB | 0 |
| High Cut | 2000 – 20000 Hz (로그) | 20000 |
| Level | -18 – 18 dB | 0 |

### Graphic EQ (`geq`) — EQ

7밴드 그래픽 EQ. 앰프 앞에서는 게인 질감을, 뒤에서는 최종 톤을 조절합니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| 100 | -15 – 15 dB | 0 |
| 200 | -15 – 15 dB | 0 |
| 400 | -15 – 15 dB | 0 |
| 800 | -15 – 15 dB | 0 |
| 1.6k | -15 – 15 dB | 0 |
| 3.2k | -15 – 15 dB | 0 |
| 6.4k | -15 – 15 dB | 0 |
| Level | -18 – 18 dB | 0 |

### Wah (`wah`) — 모듈레이션

공진 필터 와우. 피킹 세기에 반응하는 오토와우, 고정 페달, LFO 모드를 지원합니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Mode | Auto (엔벨로프) / Manual (페달) / LFO | Auto (엔벨로프) |
| Pedal | 0 – 100 % | 50 |
| Sens | 0 – 100 % | 60 |
| Rate | 0.05 – 12 Hz (로그) | 1.5 |
| Q | 0.7 – 14 (로그) | 5 |
| Mix | 0 – 100 % | 100 |

### Chorus (`chorus`) — 모듈레이션

미세하게 흔들리는 딜레이 2보이스를 좌우로 펼친 스테레오 코러스. Mix 100%면 비브라토에 가깝습니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Rate | 0.1 – 8 Hz (로그) | 0.8 |
| Depth | 0 – 100 % | 50 |
| Mix | 0 – 100 % | 50 |
| Stereo | 0 – 100 % | 80 |

### Flanger (`flanger`) — 모듈레이션

아주 짧은 딜레이를 스윕해 제트기 같은 콤 필터 효과를 만듭니다. Feedback을 음수로 돌리면 다른 배음 구조.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Rate | 0.05 – 5 Hz (로그) | 0.3 |
| Depth | 0 – 100 % | 70 |
| Manual | 0.3 – 8 ms (로그) | 2.5 |
| Feedback | -95 – 95 % | 60 |
| Mix | 0 – 100 % | 50 |

### Phaser (`phaser`) — 모듈레이션

올패스 필터 6단을 스윕하는 페이저. Phase 90 스타일부터 깊은 공진까지.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Rate | 0.05 – 8 Hz (로그) | 0.5 |
| Depth | 0 – 100 % | 70 |
| Center | 200 – 2500 Hz (로그) | 800 |
| Feedback | 0 – 100 % | 40 |
| Mix | 0 – 100 % | 50 |

### Tremolo (`tremolo`) — 모듈레이션

음량을 주기적으로 흔드는 빈티지 앰프 트레몰로. Square는 초퍼 효과.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Rate | 0.5 – 16 Hz (로그) | 5 |
| Depth | 0 – 100 % | 60 |
| Shape | Sine / Triangle / Square (초퍼) | Sine |

### Delay (`delay`) — 딜레이

디지털/아날로그(BBD)/테이프 에코 3가지 캐릭터의 딜레이. 핑퐁으로 좌우를 오가는 스테레오 반복.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Time | 20 – 1500 ms (로그) | 380 |
| Feedback | 0 – 100 % | 35 |
| Mix | 0 – 100 % | 25 |
| Tone | 0 – 10 | 6 |
| Type | Digital / Analog (BBD) / Tape Echo | Digital |
| Stereo | Mono / Ping-Pong | Mono |

### Reverb (`reverb`) — 리버브

컨볼루션 리버브. Room/Hall/Plate는 Decay에 맞춰 잔향을 합성하고, EMT 140 플레이트와 Fender 스프링은 실제 기기의 IR입니다.

| 파라미터 | 범위 | 기본값 |
| --- | --- | --- |
| Type | Room / Hall / Plate / EMT 140 Plate (IR) / Fender Spring (IR) | Hall |
| Decay | 0.2 – 12 s (로그) | 2.2 |
| Pre-Delay | 0 – 150 ms | 15 |
| Tone | 0 – 10 | 6 |
| Mix | 0 – 100 % | 25 |

## 새 이펙터 추가하기

이펙터는 `EffectDef` 하나로 완결됩니다. UI는 `params` 선언만 보고 컨트롤을 그리므로 React 코드를 건드릴 필요가 없습니다.

1. `src/audio/effects/`의 알맞은 파일(또는 새 파일)에 정의를 작성합니다.

```ts
import type { EffectDef, ParamDef } from '../types';
import { dbToGain, disconnectAll, num, ramp } from '../util';
import { instance, knob } from './helpers';

const params: ParamDef[] = [knob('gain', 'Gain', -24, 24, 0, 'dB')];

export const volume: EffectDef = {
  type: 'volume',           // 고유 id — 프리셋/공유 링크에 저장되므로 바꾸지 말 것
  name: 'Volume',
  short: 'VOL',             // 체인 타일에 표시
  category: 'dynamics',     // 색상과 추가 메뉴의 그룹
  description: '단순 볼륨.',
  params,
  create(ec, p) {
    const g = ec.ctx.createGain();
    return instance(
      g,                    // input 노드
      g,                    // output 노드
      params,
      p,
      { gain: (v) => ramp(g.gain, dbToGain(num(v)), ec.ctx) },   // 파라미터 id → setter
      () => disconnectAll([g]),                                   // dispose
    );
  },
};
```

2. `src/audio/effects/index.ts`의 `EFFECTS` 배열에 추가합니다. 추가 메뉴·프리셋·공유 링크·스모크 테스트가 자동으로 인식합니다.

지켜야 할 것:

- `set()`에서는 `ramp()`(=`setTargetAtTime`)로 값을 부드럽게 옮겨 지퍼 노이즈를 막습니다.
- `dispose()`에서 만든 노드를 모두 disconnect하고 오실레이터를 stop합니다.
- 피드백 루프에는 반드시 `DelayNode`가 있어야 합니다(Web Audio 제약).
- 파일을 읽는 등 비동기 작업은 `ec.report({ loading | error | info })`로 상태를 알리고, 토큰으로 경합을 막습니다(`capture.ts` 참고).
- 샘플 단위 상태가 필요한 처리(엔벨로프 검출 등)는 `public/worklets/dsp.js`에 프로세서를 추가하고 `dynamics.ts`의 `workletEffect()`로 감쌉니다.
- 특정 조건에서만 보이는 컨트롤은 `visible: (params) => boolean`을 씁니다.
