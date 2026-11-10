// Web Tones DSP worklets: noise gate, compressor, wah.
// Plain JS on purpose: loaded with audioWorklet.addModule() as a static file.

const dbToGain = (db) => Math.pow(10, db / 20);
const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-9));
const coef = (ms) => Math.exp(-1 / (Math.max(ms, 0.01) * 0.001 * sampleRate));

/** Peak across all channels for sample i. */
function linkedPeak(input, i) {
  let p = 0;
  for (let c = 0; c < input.length; c++) {
    const a = Math.abs(input[c][i]);
    if (a > p) p = a;
  }
  return p;
}

class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -50, minValue: -90, maxValue: 0, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 1, minValue: 0.1, maxValue: 100, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 60, minValue: 0, maxValue: 1000, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 120, minValue: 1, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'range', defaultValue: -80, minValue: -90, maxValue: 0, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0;
    this.gain = 0;
    this.holdLeft = 0;
    this.open = false;
  }
  process(inputs, outputs, p) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;
    const openThr = dbToGain(p.threshold[0]);
    const closeThr = openThr * 0.63; // 4 dB hysteresis
    const floor = dbToGain(p.range[0]);
    const att = coef(p.attack[0]);
    const rel = coef(p.release[0]);
    const envRel = coef(8);
    const holdSamples = p.hold[0] * 0.001 * sampleRate;
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      const peak = linkedPeak(input, i);
      this.env = peak > this.env ? peak : peak + envRel * (this.env - peak);
      if (this.env >= openThr) {
        this.open = true;
        this.holdLeft = holdSamples;
      } else if (this.env < closeThr && this.open) {
        if (this.holdLeft > 0) this.holdLeft--;
        else this.open = false;
      }
      const target = this.open ? 1 : floor;
      const c = target > this.gain ? att : rel;
      this.gain = target + c * (this.gain - target);
      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = (input[ch] || input[0])[i] * this.gain;
      }
    }
    return true;
  }
}

class CompressorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -24, minValue: -60, maxValue: 0, automationRate: 'k-rate' },
      { name: 'ratio', defaultValue: 4, minValue: 1, maxValue: 20, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 10, minValue: 0.1, maxValue: 200, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 150, minValue: 5, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'knee', defaultValue: 6, minValue: 0, maxValue: 24, automationRate: 'k-rate' },
      { name: 'makeup', defaultValue: 0, minValue: -12, maxValue: 30, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.gr = 0; // smoothed gain reduction in dB (>= 0)
    this.maxGr = 0;
    this.count = 0;
  }
  process(inputs, outputs, p) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;
    const thr = p.threshold[0];
    const slope = 1 - 1 / p.ratio[0];
    const knee = p.knee[0];
    const att = coef(p.attack[0]);
    const rel = coef(p.release[0]);
    const makeup = dbToGain(p.makeup[0]);
    const mix = p.mix[0];
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      const level = gainToDb(linkedPeak(input, i));
      const over = level - thr;
      let target;
      if (knee > 0 && Math.abs(over) < knee / 2) {
        const x = over + knee / 2;
        target = (slope * x * x) / (2 * knee);
      } else {
        target = over > 0 ? slope * over : 0;
      }
      const c = target > this.gr ? att : rel;
      this.gr = target + c * (this.gr - target);
      if (this.gr > this.maxGr) this.maxGr = this.gr;
      const g = dbToGain(-this.gr) * makeup;
      for (let ch = 0; ch < output.length; ch++) {
        const x = (input[ch] || input[0])[i];
        output[ch][i] = x * (1 - mix) + x * g * mix;
      }
    }
    this.count += n;
    if (this.count >= 1600) {
      this.port.postMessage(this.maxGr);
      this.count = 0;
      this.maxGr = 0;
    }
    return true;
  }
}

class WahProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // 0 = manual pedal, 1 = envelope (auto-wah), 2 = LFO
      { name: 'mode', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'position', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'sensitivity', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rate', defaultValue: 1.5, minValue: 0.05, maxValue: 12, automationRate: 'k-rate' },
      { name: 'q', defaultValue: 5, minValue: 0.7, maxValue: 14, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0;
    this.pos = 0.5;
    this.phase = 0;
    this.ic1 = [0, 0];
    this.ic2 = [0, 0];
  }
  process(inputs, outputs, p) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;
    const mode = Math.round(p.mode[0]);
    const sens = p.sensitivity[0];
    const k = 1 / p.q[0];
    const mix = p.mix[0];
    const envAtt = coef(4);
    const envRel = coef(140);
    const posSmooth = coef(12);
    const lfoInc = (2 * Math.PI * p.rate[0]) / sampleRate;
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      const peak = linkedPeak(input, i);
      this.env = peak + (peak > this.env ? envAtt : envRel) * (this.env - peak);
      let target;
      if (mode === 0) target = p.position[0];
      else if (mode === 1) target = Math.min(1, this.env * (1 + sens * 24));
      else {
        this.phase += lfoInc;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
        target = 0.5 - 0.5 * Math.cos(this.phase);
      }
      this.pos = target + posSmooth * (this.pos - target);
      const fc = 380 * Math.pow(2300 / 380, this.pos);
      const g = Math.tan((Math.PI * fc) / sampleRate);
      const a1 = 1 / (1 + g * (g + k));
      const a2 = g * a1;
      const a3 = g * a2;
      for (let ch = 0; ch < output.length; ch++) {
        const x = (input[ch] || input[0])[i];
        const v3 = x - this.ic2[ch];
        const v1 = a1 * this.ic1[ch] + a2 * v3;
        const v2 = this.ic2[ch] + a2 * this.ic1[ch] + a3 * v3;
        this.ic1[ch] = 2 * v1 - this.ic1[ch];
        this.ic2[ch] = 2 * v2 - this.ic2[ch];
        // Band-pass with a little low-pass body, like an inductor wah. The
        // band-pass peaks at Q, so scale by sqrt(k) to keep sharp settings from blasting.
        const wet = v1 * 2.2 * Math.sqrt(k) + v2 * 0.35;
        output[ch][i] = x * (1 - mix) + wet * mix;
      }
    }
    return true;
  }
}

registerProcessor('wt-gate', GateProcessor);
registerProcessor('wt-comp', CompressorProcessor);
registerProcessor('wt-wah', WahProcessor);
