const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Fundamental frequency by autocorrelation with parabolic interpolation.
 * Returns null when the signal is too quiet or not periodic enough.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.008) return null;

  const minLag = Math.floor(sampleRate / 1200);
  const maxLag = Math.min(Math.floor(sampleRate / 28), n >> 1);
  const acf = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += buf[i] * buf[i + lag];
    acf[lag] = sum;
  }
  // Skip the zero-lag lobe, then take the first strong peak (not just the highest: avoids octave errors).
  let lag = minLag;
  while (lag < maxLag && acf[lag] > acf[lag + 1]) lag++;
  let best = -1;
  let bestVal = 0;
  for (let i = lag; i <= maxLag; i++) if (acf[i] > bestVal) [bestVal, best] = [acf[i], i];
  if (best < 0 || bestVal / acf[0] < 0.5) return null;
  for (let i = lag; i < best; i++) {
    if (acf[i] > 0.9 * bestVal && acf[i] >= acf[i - 1] && acf[i] >= acf[i + 1]) {
      best = i;
      break;
    }
  }
  const a = acf[best - 1];
  const b = acf[best];
  const c = acf[best + 1];
  const shift = a + c - 2 * b !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  return sampleRate / (best + shift);
}

export function toNote(freq: number): { name: string; octave: number; cents: number } {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  return {
    name: NOTES[((nearest % 12) + 12) % 12],
    octave: Math.floor(nearest / 12) - 1,
    cents: Math.round((midi - nearest) * 100),
  };
}
