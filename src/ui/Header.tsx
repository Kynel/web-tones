import { useCallback, useState } from 'react';
import { FACTORY_PRESETS } from '../state/presets';
import { useStore } from '../state/store';
import { useDismiss } from './hooks';

export function Header({ toast }: { toast(msg: string): void }) {
  const toneName = useStore((s) => s.toneName);
  const dirty = useStore((s) => s.dirty);
  const userPresets = useStore((s) => s.userPresets);
  const { loadTone, saveUserPreset, deleteUserPreset, shareUrl } = useStore.getState();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const closeSave = useCallback(() => setSaving(false), []);
  const menuRef = useDismiss(open, close);
  const saveRef = useDismiss(saving, closeSave);

  const share = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('톤 링크를 클립보드에 복사했습니다');
    } catch {
      history.replaceState(null, '', url);
      toast('주소창의 링크를 복사해 공유하세요');
    }
  };

  return (
    <header className="app-header">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="7" fill="var(--panel-2)" />
          <path d="M5 16c3-9 5-9 8 0s5 9 8 0 4-6 6-2" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <span>Web Tones</span>
      </div>

      <div className="preset" ref={menuRef}>
        <button className="preset-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="preset-label">톤</span>
          <span className="preset-name">
            {toneName}
            {dirty && <em title="수정됨"> •</em>}
          </span>
          <span aria-hidden>▾</span>
        </button>
        {open && (
          <div className="popover preset-menu" role="listbox" aria-label="프리셋">
            <h3>팩토리 프리셋</h3>
            {FACTORY_PRESETS.map((p) => (
              <button
                key={p.name}
                role="option"
                aria-selected={p.name === toneName}
                className="preset-item"
                onClick={() => {
                  loadTone(p, { track: p.track });
                  close();
                }}
              >
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </button>
            ))}
            {userPresets.length > 0 && <h3>내 프리셋</h3>}
            {userPresets.map((p) => (
              <div className="preset-user" key={p.name}>
                <button
                  role="option"
                  aria-selected={p.name === toneName}
                  className="preset-item"
                  onClick={() => {
                    loadTone(p);
                    close();
                  }}
                >
                  <strong>{p.name}</strong>
                </button>
                <button className="icon-btn" aria-label={`${p.name} 삭제`} onClick={() => deleteUserPreset(p.name)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="header-actions">
        <div className="save" ref={saveRef}>
          <button
            className="btn"
            onClick={() => {
              setName(FACTORY_PRESETS.some((p) => p.name === toneName) ? `${toneName} (내 버전)` : toneName);
              setSaving(!saving);
            }}
          >
            저장
          </button>
          {saving && (
            <form
              className="popover save-pop"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                saveUserPreset(name);
                setSaving(false);
                toast(`"${name.trim()}" 저장됨`);
              }}
            >
              <label htmlFor="preset-name">프리셋 이름</label>
              <input id="preset-name" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <button className="btn primary" type="submit" disabled={!name.trim()}>
                이 브라우저에 저장
              </button>
            </form>
          )}
        </div>
        <button className="btn" onClick={share}>
          링크 공유
        </button>
      </div>
    </header>
  );
}
