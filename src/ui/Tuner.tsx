import { useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { useRaf } from './hooks';
import { detectPitch, toNote } from './tunerMath';

export function Tuner() {
  const buf = useRef(new Float32Array(2048));
  const frame = useRef(0);
  const smooth = useRef<number | null>(null);
  const [note, setNote] = useState<ReturnType<typeof toNote> | null>(null);

  useRaf(() => {
    if (frame.current++ % 4) return; // ~15 Hz is plenty and keeps the ACF cheap
    if (!engine.inputSamples(buf.current) || !engine.ctx) return;
    const f = detectPitch(buf.current, engine.ctx.sampleRate);
    if (f === null) {
      smooth.current = null;
      setNote(null);
      return;
    }
    const prev = smooth.current;
    smooth.current = prev && Math.abs(Math.log2(f / prev)) < 0.03 ? prev * 0.7 + f * 0.3 : f;
    setNote(toNote(smooth.current));
  });

  const inTune = note !== null && Math.abs(note.cents) <= 4;
  return (
    <div className="tuner" data-in-tune={inTune || undefined} aria-live="off">
      <div className="tuner-note">
        {note ? (
          <>
            {note.name}
            <sub>{note.octave}</sub>
          </>
        ) : (
          '—'
        )}
      </div>
      <div className="tuner-scale">
        <div className="tuner-center" />
        {note && <div className="tuner-needle" style={{ left: `${50 + Math.max(-50, Math.min(50, note.cents))}%` }} />}
      </div>
      <div className="tuner-cents">{note ? `${note.cents > 0 ? '+' : ''}${note.cents} cent` : '입력 대기'}</div>
    </div>
  );
}
