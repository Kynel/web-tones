import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EFFECTS } from './audio/effects';
import { engine } from './audio/engine';
import { useStore } from './state/store';
import { relayPopupCallback } from './t3k/client';
import './styles.css';

// When this page is the TONE3000 OAuth popup landing on redirect_uri, hand the
// callback to the opener and close instead of booting a second copy of the app.
if (relayPopupCallback()) {
  document.getElementById('root')!.textContent = 'TONE3000 연결 완료. 이 창은 자동으로 닫힙니다.';
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Debug/testing hook: inspect the engine and store from the console or the smoke test.
(window as unknown as Record<string, unknown>).__webTones = { engine, store: useStore, effects: EFFECTS };
