import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EFFECTS } from './audio/effects';
import { engine } from './audio/engine';
import { useStore } from './state/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Debug/testing hook: inspect the engine and store from the console or the smoke test.
(window as unknown as Record<string, unknown>).__webTones = { engine, store: useStore, effects: EFFECTS };
