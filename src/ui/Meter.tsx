import { useRef } from 'react';
import { engine } from '../audio/engine';
import { useRaf } from './hooks';

const FLOOR = -60;
const toPos = (lin: number) => Math.min(1, Math.max(0, (20 * Math.log10(Math.max(lin, 1e-6)) - FLOOR) / -FLOOR));

/** Peak meter with hold; draws straight to the DOM so React doesn't re-render at 60 fps. */
export function Meter({ which, label }: { which: 'input' | 'output'; label: string }) {
  const fill = useRef<HTMLDivElement>(null);
  const hold = useRef<HTMLDivElement>(null);
  const state = useRef({ level: 0, peak: 0, peakAt: 0 });
  useRaf(() => {
    const s = state.current;
    const now = performance.now();
    const v = engine.levels()[which];
    s.level = v > s.level ? v : s.level * 0.9;
    if (v >= s.peak || now - s.peakAt > 1200) {
      s.peak = v;
      s.peakAt = now;
    }
    if (fill.current) {
      fill.current.style.transform = `scaleX(${toPos(s.level)})`;
      fill.current.dataset.hot = s.level > 0.9 ? '1' : '';
    }
    if (hold.current) hold.current.style.left = `${toPos(s.peak) * 100}%`;
  });
  return (
    <div className="meter" role="img" aria-label={`${label} 레벨`}>
      <div className="meter-fill" ref={fill} />
      <div className="meter-hold" ref={hold} />
    </div>
  );
}
