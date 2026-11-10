import { useRef } from 'react';
import { formatValue, fromNorm, toNorm, type Range } from './knobMath';

interface Props extends Range {
  label: string;
  value: number;
  defaultValue: number;
  unit?: string;
  size?: number;
  onChange(v: number): void;
}

const START = -135;
const SWEEP = 270;

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [lo, hi] = a0 <= a1 ? [a0, a1] : [a1, a0];
  const [x0, y0] = pt(lo);
  const [x1, y1] = pt(hi);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${hi - lo > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Rotary control: drag vertically, scroll, arrow keys; double-click resets. Shift = fine. */
export function Knob({ label, value, defaultValue, unit, size = 52, onChange, ...range }: Props) {
  const drag = useRef<{ y: number; norm: number } | null>(null);
  const norm = toNorm(value, range);
  const angle = START + norm * SWEEP;
  // Bipolar controls (EQ gain, flanger feedback) fill from zero instead of from the minimum.
  const origin = range.min < 0 && range.max > 0 ? START + toNorm(0, range) * SWEEP : START;
  const c = size / 2;
  const r = c - 4;
  const nudge = (d: number) => onChange(fromNorm(norm + d, range));

  return (
    <div className="knob">
      <div
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={value}
        aria-valuetext={formatValue(value, unit, range)}
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, norm };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dy = drag.current.y - e.clientY;
          onChange(fromNorm(drag.current.norm + dy / (e.shiftKey ? 900 : 180), range));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onChange(defaultValue)}
        onWheel={(e) => nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.02))}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.005 : 0.02;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nudge(step);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nudge(-step);
          else if (e.key === 'Home') onChange(range.min);
          else if (e.key === 'End') onChange(range.max);
          else if (e.key === 'Delete' || e.key === 'Backspace') onChange(defaultValue);
          else return;
          e.preventDefault();
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <path className="knob-track" d={arc(c, c, r, START, START + SWEEP)} />
          {Math.abs(angle - origin) > 0.5 && <path className="knob-fill" d={arc(c, c, r, origin, angle)} />}
          <circle className="knob-cap" cx={c} cy={c} r={r - 5} />
          <line
            className="knob-pointer"
            x1={c}
            y1={c - (r - 5) * 0.35}
            x2={c}
            y2={c - (r - 5) + 2}
            transform={`rotate(${angle} ${c} ${c})`}
          />
        </svg>
      </div>
      <div className="knob-value">{formatValue(value, unit, range)}</div>
      <div className="knob-label">{label}</div>
    </div>
  );
}
