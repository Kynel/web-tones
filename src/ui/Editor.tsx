import { useRef, useState } from 'react';
import { BUILTIN_CAB_IRS, BUILTIN_MODELS, BUILTIN_REVERB_IRS, type AssetEntry } from '../audio/assets';
import { EFFECT_BY_TYPE } from '../audio/effects';
import { engine } from '../audio/engine';
import { CATEGORY_LABEL, type AssetParam, type Block, type ParamDef } from '../audio/types';
import { useStore } from '../state/store';
import { EqCurve } from './EqCurve';
import { useRaf } from './hooks';
import { Knob } from './Knob';

function AssetPicker({ block, def }: { block: Block; def: AssetParam }) {
  const setParam = useStore((s) => s.setParam);
  const importAsset = useStore((s) => s.importAsset);
  const removeAsset = useStore((s) => s.removeAsset);
  const userAssets = useStore((s) => s.userAssets);
  const status = useStore((s) => s.status[block.id]);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const builtin = def.assetKind === 'nam' ? BUILTIN_MODELS : [...BUILTIN_CAB_IRS, ...BUILTIN_REVERB_IRS];
  const mine = userAssets.filter((a) => a.kind === def.assetKind);
  const current = block.params[def.id];
  const isNam = def.assetKind === 'nam';

  const item = (a: AssetEntry) => (
    <div className="asset" key={a.id} data-active={a.id === current || undefined}>
      <button className="asset-main" aria-pressed={a.id === current} onClick={() => setParam(block.id, def.id, a.id)}>
        <span className="asset-name">{a.name}</span>
        <span className="asset-tag">{a.tag}</span>
      </button>
      {a.id.startsWith('user:') && (
        <button
          className="icon-btn"
          aria-label={`${a.name} 삭제`}
          onClick={() => {
            if (a.id === current) setParam(block.id, def.id, def.default);
            void removeAsset(a.id);
          }}
        >
          ✕
        </button>
      )}
    </div>
  );

  return (
    <div className="asset-picker">
      <div className="asset-head">
        <span>{isNam ? '캡처 선택' : 'IR 선택'}</span>
        <button className="btn small" onClick={() => file.current?.click()}>
          {isNam ? '.nam 파일 불러오기' : 'IR(.wav) 불러오기'}
        </button>
        <input
          ref={file}
          type="file"
          hidden
          accept={isNam ? '.nam,application/json' : '.wav,.flac,audio/*'}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setError(null);
              const entry = await importAsset(f, def.assetKind);
              setParam(block.id, def.id, entry.id);
            } catch (err) {
              setError(`불러오기 실패: ${err instanceof Error ? err.message : err}`);
            }
          }}
        />
      </div>
      <div className="asset-list">
        {builtin.map(item)}
        {mine.map(item)}
      </div>
      <div className="asset-status" role="status" data-error={status?.error || error ? true : undefined}>
        {error ?? status?.error ?? (status?.loading ? '로딩 중…' : status?.info) ?? ' '}
      </div>
    </div>
  );
}

function GainReduction({ blockId }: { blockId: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useRaf(() => {
    const gr = engine.blockMeter(blockId) ?? 0;
    shown.current = gr > shown.current ? gr : shown.current * 0.85 + gr * 0.15;
    if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, shown.current / 24)})`;
    if (text.current) text.current.textContent = `-${shown.current.toFixed(1)} dB`;
  });
  return (
    <div className="gr" role="img" aria-label="게인 리덕션">
      <span className="gr-label">Gain Reduction</span>
      <div className="gr-track">
        <div className="gr-bar" ref={bar} />
      </div>
      <span className="gr-value" ref={text}>
        -0.0 dB
      </span>
    </div>
  );
}

function Control({ block, def }: { block: Block; def: ParamDef }) {
  const setParam = useStore((s) => s.setParam);
  const v = block.params[def.id] ?? def.default;
  if (def.kind === 'knob') {
    return (
      <Knob
        label={def.label}
        value={typeof v === 'number' ? v : def.default}
        defaultValue={def.default}
        min={def.min}
        max={def.max}
        scale={def.scale}
        step={def.step}
        unit={def.unit}
        onChange={(x) => setParam(block.id, def.id, x)}
      />
    );
  }
  if (def.kind === 'select') {
    return (
      <label className="select-control">
        <span>{def.label}</span>
        <select value={String(v)} onChange={(e) => setParam(block.id, def.id, e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return null;
}

export function Editor() {
  const block = useStore((s) => s.blocks.find((b) => b.id === s.selectedId));
  const index = useStore((s) => s.blocks.findIndex((b) => b.id === s.selectedId));
  const count = useStore((s) => s.blocks.length);
  const { toggleBlock, removeBlock, moveBlock, resetBlock } = useStore.getState();

  if (!block) {
    return (
      <section className="editor empty" aria-label="이펙트 편집">
        <p>체인에서 이펙트를 선택하면 여기에서 노브를 조절할 수 있습니다.</p>
        <p className="muted">노브: 위아래로 드래그 · 스크롤 · 방향키 / Shift = 미세 조절 / 더블클릭 = 기본값</p>
      </section>
    );
  }
  const def = EFFECT_BY_TYPE[block.type];
  const visible = def.params.filter((p) => !p.visible || p.visible(block.params));
  const assets = visible.filter((p): p is AssetParam => p.kind === 'asset');
  const selects = visible.filter((p) => p.kind === 'select');
  const knobs = visible.filter((p) => p.kind === 'knob');

  return (
    <section className="editor" data-cat={def.category} data-off={!block.enabled || undefined} aria-label={`${def.name} 편집`}>
      <header className="editor-head">
        <button
          className="power"
          aria-pressed={block.enabled}
          aria-label={block.enabled ? '바이패스' : '켜기'}
          onClick={() => toggleBlock(block.id)}
        >
          <span className="led" />
          {block.enabled ? 'ON' : 'OFF'}
        </button>
        <div className="editor-title">
          <h2>
            {def.name} <span className="chip">{CATEGORY_LABEL[def.category]}</span>
          </h2>
          <p>{def.description}</p>
        </div>
        <div className="editor-actions">
          <button className="icon-btn" aria-label="앞으로 이동" disabled={index <= 0} onClick={() => moveBlock(index, index - 1)}>
            ←
          </button>
          <button className="icon-btn" aria-label="뒤로 이동" disabled={index >= count - 1} onClick={() => moveBlock(index, index + 1)}>
            →
          </button>
          <button className="btn small" onClick={() => resetBlock(block.id)}>
            초기화
          </button>
          <button className="btn small danger" onClick={() => removeBlock(block.id)}>
            삭제
          </button>
        </div>
      </header>
      <div className="editor-body">
        {assets.map((a) => (
          <AssetPicker key={a.id} block={block} def={a} />
        ))}
        <div className="editor-controls">
          {def.category === 'eq' && <EqCurve type={block.type} params={block.params} />}
          {block.type === 'comp' && <GainReduction blockId={block.id} />}
          {selects.length > 0 && (
            <div className="selects">
              {selects.map((p) => (
                <Control key={p.id} block={block} def={p} />
              ))}
            </div>
          )}
          <div className="knobs">
            {knobs.map((p) => (
              <Control key={p.id} block={block} def={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
