import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './state/store';
import { AddMenu } from './ui/AddMenu';
import { Chain } from './ui/Chain';
import { Editor } from './ui/Editor';
import { Header } from './ui/Header';
import { Transport } from './ui/Transport';

export function App() {
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    void useStore.getState().refreshUserAssets();
    // A shared link has been applied to the store; keep the URL clean afterwards.
    if (location.hash.startsWith('#tone=')) history.replaceState(null, '', location.pathname + location.search);
  }, []);

  // Space toggles playback unless a control has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== 'Space' || t.closest('button, input, select, textarea, [role="slider"], [role="button"], dialog')) return;
      e.preventDefault();
      const s = useStore.getState();
      if (s.source === 'di') void s.togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Header toast={showToast} />
      <main>
        <Transport />
        <Chain onAdd={() => setAdding(true)} />
        <Editor />
      </main>
      <footer className="app-footer">
        앰프 캡처는 <a href="https://www.neuralampmodeler.com/" target="_blank" rel="noreferrer">Neural Amp Modeler</a> (A2) ·
        데모 캡처/IR/DI 트랙은 <a href="https://www.tone3000.com" target="_blank" rel="noreferrer">TONE3000</a> 제공
      </footer>
      {adding && <AddMenu onClose={() => setAdding(false)} />}
      <div className="toast" role="status" data-show={toast ? true : undefined}>
        {toast}
      </div>
    </div>
  );
}
