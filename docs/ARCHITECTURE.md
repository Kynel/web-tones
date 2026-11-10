# 아키텍처

## 기술 스택

- **Vite + React 18 + TypeScript** — UI
- **Zustand** — 상태 관리 (체인이 단일 진실 공급원)
- **Web Audio API** — 오디오 그래프. 네이티브 노드 + AudioWorklet
- **neural-amp-modeler-wasm** (`/engine`) — NAM 코어를 WASM으로 컴파일한 엔진. `NamNode`는 일반 `AudioWorkletNode`이므로 그래프 어디에나 연결 가능
- **@dnd-kit** — 체인 드래그 정렬
- 백엔드 없음. 모든 처리는 브라우저에서 이루어집니다.

## 디렉터리

```
public/
  models/   내장 NAM A2 캡처 (.nam)
  irs/      내장 캐비닛/리버브 IR (.wav)
  inputs/   DI 트랙 (.flac)
  worklets/dsp.js   자체 AudioWorklet 프로세서 (gate, comp, wah)
  engine/   NAM 워크릿+wasm (npm 패키지에서 복사, git 제외)
scripts/
  copy-engine.mjs   node_modules → public/engine 복사 (predev/prebuild)
  smoke.mjs         E2E 스모크 테스트
src/
  audio/
    engine.ts       AudioContext, 소스, 체인 동기화, 미터
    types.ts        EffectDef / ParamDef / Block 타입
    assets.ts       내장 에셋 카탈로그 + 사용자 파일(IndexedDB)
    util.ts         dB 변환, 믹스, IR 게인 보정 등 순수 함수
    effects/        이펙터 구현 (파일당 한 계열) + 레지스트리(index.ts)
  t3k/              TONE3000 연동: OAuth(PKCE), API 클라이언트 (docs/TONE3000.md)
  state/
    store.ts        Zustand 스토어, 엔진과의 연결, 세션 저장
    serialize.ts    톤 ⇄ 압축 JSON ⇄ 공유 링크
    presets.ts      팩토리 프리셋
  ui/               React 컴포넌트 (Chain, Editor, Knob, Transport …)
```

## 신호 흐름

```
DI 루프(AudioBufferSource) ─┐
                            ├─▶ input gain ─▶ [블록 1] ─▶ [블록 2] ─▶ … ─▶ master ─▶ limiter ─▶ 출력
라이브 입력(MediaStream) ───┘        │                                              │
                                 inAnalyser (미터·튜너)                        outAnalyser (미터)
```

- AudioContext는 **48 kHz**로 고정합니다. NAM 캡처가 48 kHz로 학습되기 때문입니다.
- 마지막의 리미터(DynamicsCompressor, −3 dB / 20:1)는 게인 설정 실수로부터 귀를 보호하는 안전장치입니다.
- 라이브 입력은 `echoCancellation / noiseSuppression / autoGainControl`을 모두 끄고 모노로 합칩니다(또는 L/R 한쪽 선택).

## 이펙터 모델

모든 이펙터는 `EffectDef`(선언)와 `EffectInstance`(실행 중인 노드 묶음)로 나뉩니다.

```ts
interface EffectDef {
  type: string;            // 'delay'
  name: string; short: string; category: Category; description: string;
  params: ParamDef[];      // knob | select | asset — UI가 이 선언만 보고 컨트롤을 그림
  create(ec, params): EffectInstance | Promise<EffectInstance>;
}
interface EffectInstance {
  input: AudioNode; output: AudioNode;
  set(id, value): void;    // 파라미터 실시간 반영 (ramp로 지퍼 노이즈 방지)
  dispose(): void;
  meter?(): number;        // 예: 컴프 게인 리덕션
}
```

UI는 이펙터별 코드를 갖지 않습니다. `params` 선언에서 노브·셀렉트·에셋 선택기를 자동 생성합니다(EQ 곡선, GR 미터만 예외적으로 카테고리/타입을 봅니다).

구현 수단은 세 가지입니다.

| 수단 | 이펙터 |
| --- | --- |
| NAM WASM 워크릿 | NAM Capture |
| ConvolverNode | Cabinet IR, Reverb |
| 네이티브 노드 조합 | Boost/Overdrive/Distortion/Fuzz (WaveShaper 4x 오버샘플링), EQ (Biquad), Chorus/Flanger/Phaser/Tremolo (Delay/Biquad + LFO), Delay |
| 자체 AudioWorklet (`public/worklets/dsp.js`) | Noise Gate, Compressor, Wah — 엔벨로프 검출이 필요한 것들 |

## 상태 → 오디오 동기화

스토어의 `blocks: Block[]`(id, type, enabled, params)가 체인의 유일한 원본입니다.

- **구조 변경**(추가/삭제/이동/바이패스/프리셋 로드) → `engine.sync(blocks)`
  - 사라진 id의 인스턴스를 dispose, 새 id는 `create()`(비동기 가능)
  - 준비된 인스턴스만 순서대로 다시 연결(`rewire`). 바이패스된 블록은 연결에서 빠집니다.
- **파라미터 변경** → `engine.setParam()` → `instance.set()`. 그래프를 다시 연결하지 않으므로 노브를 돌려도 끊김이 없습니다.
- 모델/IR 로딩 같은 비동기 상태는 `EffectContext.report()` → 스토어의 `status[blockId]`로 올라와 타일과 편집기에 표시됩니다. 로딩 경합은 토큰으로 막습니다(마지막 선택만 반영).

AudioContext는 첫 사용자 제스처(재생/입력 켜기)에서 만들어집니다. 그 전에도 체인 편집은 가능하며, 엔진이 켜질 때 현재 체인으로 동기화됩니다.

## 레벨 정책

- NAM 엔진은 `loudness` 메타데이터가 있는 모델을 −18 dB로 정규화합니다.
- 캐비닛 IR은 100 Hz–5 kHz 평균 파워가 0 dB가 되도록 보정합니다(`irUnityGain`). 캐비닛을 켜거나 바꿔도 음량이 튀지 않습니다.
- Dry/Wet 믹스는 등전력(equal-power) 커브를 씁니다.

## 저장

| 무엇 | 어디에 |
| --- | --- |
| 작업 중인 톤, 입출력 게인, 선택한 DI 트랙 | `localStorage` `web-tones:session:v1` |
| 내 프리셋 | `localStorage` `web-tones:presets:v1` |
| 불러온 `.nam` / IR 파일 | IndexedDB `web-tones` / `assets` |
| TONE3000 토큰 / 직접 입력한 키 | `sessionStorage` `web-tones:t3k-tokens` / `localStorage` `web-tones:t3k-key` |
| 공유 링크 | URL 해시 `#tone=<base64url(JSON)>` |

톤은 기본값과 다른 파라미터만 담는 압축 형식(`ToneData`)으로 직렬화됩니다. 역직렬화 시 알 수 없는 이펙터는 버리고 값은 범위로 클램프하므로, 조작된 공유 링크가 비정상 값을 주입할 수 없습니다.

## 테스트

- `npm test` — 순수 함수 단위 테스트: 직렬화/공유 링크, 프리셋 유효성, 노브 매핑, 튜너 피치 검출, IR 게인 보정
- `npm run smoke` — 빌드 결과를 헤드리스 Chromium에서 실행해 모든 팩토리 프리셋과 모든 이펙터에 DI 트랙을 통과시키고, 실제 출력 레벨·모델 로딩 오류·콘솔 오류·모바일 가로 넘침을 검사합니다. `--screenshots`를 붙이면 `scripts/out/`에 스크린샷을 남깁니다.

`window.__webTones`(`engine`, `store`, `effects`)로 콘솔에서 내부 상태를 살펴볼 수 있습니다.
