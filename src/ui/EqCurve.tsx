import { useMemo } from 'react';
import { eqFilterSpecs } from '../audio/effects/eq';
import type { Params } from '../audio/types';

const N = 160;
const F_MIN = 20;
const F_MAX = 20000;
const DB = 18;
const W = 640;
const H = 150;

const freqs = Float32Array.from({ length: N }, (_, i) => F_MIN * Math.pow(F_MAX / F_MIN, i / (N - 1)));
const fx = (f: number) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * W;
const dy = (db: number) => H / 2 - (Math.max(-DB, Math.min(DB, db)) / DB) * (H / 2 - 6);

let scratch: OfflineAudioContext | undefined;

/** Combined magnitude response in dB, using real BiquadFilterNodes so the plot matches the audio. */
export function eqResponseDb(type: string, params: Params): Float32Array {
  scratch ??= new OfflineAudioContext(1, 1, 48000);
  const total = new Float32Array(N);
  const mag = new Float32Array(N);
  const phase = new Float32Array(N);
  for (const s of eqFilterSpecs(type, params)) {
    const f = scratch.createBiquadFilter();
    f.type = s.type;
    f.frequency.value = s.freq;
    f.gain.value = s.gain;
    f.Q.value = s.q;
    f.getFrequencyResponse(freqs, mag, phase);
    for (let i = 0; i < N; i++) total[i] += 20 * Math.log10(Math.max(mag[i], 1e-6));
  }
  const level = typeof params.level === 'number' ? params.level : 0;
  for (let i = 0; i < N; i++) total[i] += level;
  return total;
}

export function EqCurve({ type, params }: { type: string; params: Params }) {
  const { line, area } = useMemo(() => {
    const db = eqResponseDb(type, params);
    const pts = Array.from(db, (d, i) => `${fx(freqs[i]).toFixed(1)},${dy(d).toFixed(1)}`);
    return { line: `M${pts.join('L')}`, area: `M0,${H / 2}L${pts.join('L')}L${W},${H / 2}Z` };
  }, [type, params]);
  return (
    <svg className="eq-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="EQ 주파수 응답">
      {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map((f) => (
        <line key={f} className="eq-grid" x1={fx(f)} x2={fx(f)} y1={0} y2={H} />
      ))}
      {[-12, -6, 6, 12].map((d) => (
        <line key={d} className="eq-grid" x1={0} x2={W} y1={dy(d)} y2={dy(d)} />
      ))}
      <line className="eq-zero" x1={0} x2={W} y1={H / 2} y2={H / 2} />
      <path className="eq-area" d={area} />
      <path className="eq-line" d={line} vectorEffect="non-scaling-stroke" />
      {[100, 1000, 10000].map((f) => (
        <text key={f} className="eq-label" x={fx(f) + 4} y={H - 5}>
          {f >= 1000 ? `${f / 1000}k` : f}
        </text>
      ))}
    </svg>
  );
}
