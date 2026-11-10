import { useCallback, useEffect, useRef, useState } from 'react';
import { importAssetBytes } from '../audio/assets';
import { saveSessionNow, useStore } from '../state/store';
import {
  clearTokens,
  fetchModelFile,
  getKey,
  getTone,
  isSignedIn,
  keyIsBuiltIn,
  listModels,
  listTones,
  redirectUri,
  selectTone,
  setKey,
} from '../t3k/client';
import type { T3kList, T3kModel, T3kTone } from '../t3k/types';

/** What survives a full-page OAuth redirect (block ids do not: they are regenerated on load). */
export interface T3kPending {
  kind: 'nam' | 'ir';
  blockIndex: number;
}

const GEAR: Record<string, string> = {
  amp: '앰프',
  'amp-cab': '앰프+캐비닛',
  pedal: '페달',
  outboard: '아웃보드',
  cab: '캐비닛',
  space: '공간/리버브',
  experimental: '실험적',
};
const LISTS: [T3kList, string][] = [
  ['trending', '인기'],
  ['latest', '최신'],
  ['favorited', '내 즐겨찾기'],
  ['downloaded', '내 다운로드'],
];
const creator = (t: T3kTone) => t.user.display_name || t.user.username;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ToneRow({ tone, onPick }: { tone: T3kTone; onPick(): void }) {
  return (
    <button className="t3k-tone" onClick={onPick}>
      {tone.user.avatar_url ? <img src={tone.user.avatar_url} alt="" width={32} height={32} loading="lazy" /> : <span className="t3k-avatar" aria-hidden />}
      <span className="t3k-tone-main">
        <strong>{tone.title}</strong>
        <span>
          @{tone.user.username} · {GEAR[tone.gear] ?? tone.gear} · {tone.format.toUpperCase()}
        </span>
      </span>
    </button>
  );
}

export function T3kDialog() {
  const req = useStore((s) => s.t3k)!;
  const close = useStore((s) => s.closeT3k);
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKeyState] = useState(getKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [signedIn, setSignedIn] = useState(isSignedIn);
  const [arch, setArch] = useState<'2' | '1'>('2');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(req.error ?? null);
  const [list, setList] = useState<T3kList>('trending');
  const [tones, setTones] = useState<T3kTone[] | null>(null);
  const [tone, setTone] = useState<T3kTone | null>(null);
  const [models, setModels] = useState<T3kModel[] | null>(null);
  const isNam = req.kind === 'nam';

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(msg(e));
      setSignedIn(isSignedIn());
    } finally {
      setBusy(null);
    }
  }, []);

  const openTone = useCallback(
    (id: string | number) =>
      run('톤 정보를 불러오는 중…', async () => {
        const t = await getTone(id);
        setTone(t);
        setModels(await listModels(t));
      }),
    [run],
  );

  // Arrived from the picker (popup or redirect) with a tone already chosen.
  useEffect(() => {
    if (req.toneId) void openTone(req.toneId);
  }, [req.toneId, openTone]);

  useEffect(() => {
    if (!signedIn || tone) return;
    let stale = false;
    setTones(null);
    void run('목록을 불러오는 중…', () => listTones(list)).then((t) => !stale && setTones(t ?? []));
    return () => {
      stale = true;
    };
  }, [signedIn, list, tone, run]);

  const browse = async () => {
    const s = useStore.getState();
    const pending: T3kPending = { kind: req.kind, blockIndex: s.blocks.findIndex((b) => b.id === req.blockId) };
    setError(null);
    const result = await selectTone({ format: req.kind, architecture: arch }, pending, saveSessionNow);
    setSignedIn(isSignedIn());
    if (result.status === 'error') setError(`TONE3000 연결 실패: ${result.error}`);
    else if (result.status === 'ok' && result.toneId) void openTone(result.toneId);
  };

  const load = (m: T3kModel) =>
    run(`"${m.name}" 다운로드 중…`, async () => {
      if (!tone) return;
      const data = await fetchModelFile(m);
      const entry = await importAssetBytes(`${tone.title} — ${m.name}`, req.kind, data, {
        tag: `TONE3000 · @${tone.user.username}`,
        href: tone.url,
        key: `t3k-${m.id}`,
      });
      const s = useStore.getState();
      await s.refreshUserAssets();
      const block = s.blocks.find((b) => b.id === req.blockId);
      if (block) s.setParam(block.id, isNam ? 'model' : 'ir', entry.id);
      close();
    });

  // Only files the requesting block can load.
  const usable = (t: T3kTone) => t.format === req.kind;
  const shown = tones?.filter(usable) ?? null;

  return (
    <dialog ref={ref} className="add-menu t3k" aria-label="TONE3000에서 찾기" onClose={close} onClick={(e) => e.target === ref.current && close()}>
      <header>
        <h2>
          <a href="https://www.tone3000.com" target="_blank" rel="noreferrer" className="t3k-brand">
            TONE3000
          </a>
          <span className="muted"> · {isNam ? 'NAM 캡처' : '임펄스 응답(IR)'} 찾기</span>
        </h2>
        <button className="icon-btn" onClick={close} aria-label="닫기">
          ✕
        </button>
      </header>

      <div className="t3k-body">
        {!key ? (
          <form
            className="t3k-setup"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^t3k_pub_\S+$/.test(keyDraft.trim())) return setError('publishable key는 t3k_pub_ 로 시작합니다. secret key(t3k_cs_)는 넣지 마세요.');
              setKey(keyDraft);
              setKeyState(getKey());
              setError(null);
            }}
          >
            <p>
              TONE3000 연동에는 <strong>publishable key</strong>가 필요합니다.{' '}
              <a href="https://www.tone3000.com/api" target="_blank" rel="noreferrer">
                tone3000.com/api
              </a>
              에서 키를 발급하고, 아래 주소를 Redirect URI로 등록하세요.
            </p>
            <code className="t3k-uri">{redirectUri()}</code>
            <label htmlFor="t3k-key">Publishable key</label>
            <input id="t3k-key" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="t3k_pub_…" autoComplete="off" spellCheck={false} />
            <button className="btn primary" type="submit" disabled={!keyDraft.trim()}>
              이 브라우저에 저장
            </button>
          </form>
        ) : tone ? (
          <div className="t3k-detail">
            <button className="btn small" onClick={() => (setTone(null), setModels(null))}>
              ← 목록으로
            </button>
            <div className="t3k-tone-head">
              {tone.images?.[0] && <img src={tone.images[0]} alt="" loading="lazy" />}
              <div>
                <h3>{tone.title}</h3>
                <p className="t3k-creator">
                  {tone.user.avatar_url && <img src={tone.user.avatar_url} alt="" width={20} height={20} />}
                  <a href={tone.user.url} target="_blank" rel="noreferrer">
                    {creator(tone)} (@{tone.user.username})
                  </a>
                </p>
                <p className="muted">
                  {GEAR[tone.gear] ?? tone.gear} · {tone.format.toUpperCase()} · 라이선스 {tone.license} ·{' '}
                  <a href={tone.url} target="_blank" rel="noreferrer">
                    TONE3000에서 보기
                  </a>
                </p>
              </div>
            </div>
            {!usable(tone) ? (
              <p className="note" data-error>
                이 톤은 {tone.format.toUpperCase()} 형식이라 이 블록({isNam ? 'NAM 캡처' : '캐비닛 IR'})에 불러올 수 없습니다.
              </p>
            ) : models && models.length === 0 ? (
              <p className="note">불러올 수 있는 파일이 없습니다.</p>
            ) : (
              <div className="t3k-models" aria-label="모델 선택">
                {models?.map((m) => (
                  <button key={m.id} className="asset-main t3k-model" disabled={!!busy} onClick={() => void load(m)}>
                    <span className="asset-name">{m.name}</span>
                    <span className="asset-tag">
                      {[isNam && m.architecture_version ? (m.architecture_version === 'custom' ? 'Custom' : `A${m.architecture_version}`) : '', m.size].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="t3k-browse">
              <button className="btn primary" onClick={() => void browse()} disabled={!!busy}>
                TONE3000 전체 카탈로그에서 고르기
              </button>
              {isNam && (
                <label className="select-control">
                  <span>아키텍처</span>
                  <select value={arch} onChange={(e) => setArch(e.target.value as '1' | '2')}>
                    <option value="2">NAM A2 (권장)</option>
                    <option value="1">NAM A1 (기존)</option>
                  </select>
                </label>
              )}
              <p className="muted">새 창에서 TONE3000에 로그인하고 톤을 검색·미리듣기한 뒤 선택하면 여기로 돌아옵니다.</p>
            </div>
            {signedIn && (
              <>
                <div className="seg" role="tablist" aria-label="TONE3000 목록">
                  {LISTS.map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={list === id} onClick={() => setList(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="t3k-list">
                  {shown?.map((t) => <ToneRow key={t.id} tone={t} onPick={() => void openTone(t.id)} />)}
                  {shown && shown.length === 0 && !busy && <p className="note">이 목록에는 {isNam ? 'NAM 캡처' : 'IR'}가 없습니다. 위 버튼으로 전체 카탈로그를 찾아보세요.</p>}
                </div>
              </>
            )}
          </>
        )}
        <p className="t3k-status" role="status" data-error={error ? true : undefined}>
          {error ?? busy ?? ' '}
        </p>
      </div>

      {key && (
        <footer className="t3k-foot">
          <span>톤 제공: TONE3000 · 각 톤의 저작권과 라이선스는 제작자에게 있습니다.</span>
          <span className="t3k-foot-actions">
            {signedIn && (
              <button
                className="btn small"
                onClick={() => {
                  clearTokens();
                  setSignedIn(false);
                  setTones(null);
                  setTone(null);
                }}
              >
                로그아웃
              </button>
            )}
            {!keyIsBuiltIn() && (
              <button
                className="btn small"
                onClick={() => {
                  setKey('');
                  setKeyState('');
                  setSignedIn(false);
                  setTone(null);
                }}
              >
                키 변경
              </button>
            )}
          </span>
        </footer>
      )}
    </dialog>
  );
}
