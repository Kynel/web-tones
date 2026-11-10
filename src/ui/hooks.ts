import { useEffect, useRef } from 'react';

/** Run a callback every animation frame while mounted (meters, tuner). */
export function useRaf(cb: () => void, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let id = requestAnimationFrame(function tick() {
      ref.current();
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [active]);
}

/** Close a popover on outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}
