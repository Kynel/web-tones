import { NamEngine } from 'neural-amp-modeler-wasm/engine';
import { EFFECT_BY_TYPE } from './effects';
import type { Block, BlockStatus, EffectInstance, ParamValue } from './types';
import { dbToGain, disconnectAll } from './util';

const base = import.meta.env?.BASE_URL ?? './';

interface Slot {
  type: string;
  inst?: EffectInstance;
  disposed: boolean;
}

export type InputChannel = 'mix' | 'left' | 'right';

/**
 * Owns the AudioContext and the signal path:
 *
 *   source (DI loop | live input) -> input gain -> [effect chain] -> master -> limiter -> speakers
 *
 * The UI state (zustand store) is the source of truth for the chain; the
 * engine mirrors it through sync() / setParam().
 */
export class AudioEngine {
  ctx?: AudioContext;
  private nam?: NamEngine;
  private input!: GainNode;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private inAnalyser!: AnalyserNode;
  private outAnalyser!: AnalyserNode;
  private slots = new Map<string, Slot>();
  private order: Block[] = [];
  private links: AudioNode[] = [];
  private starting?: Promise<void>;
  private meterBuf = new Float32Array(2048);

  private track?: AudioBufferSourceNode;
  private trackCache = new Map<string, Promise<AudioBuffer>>();
  private trackToken = 0;
  private stream?: MediaStream;
  private liveNodes: AudioNode[] = [];

  onStatus: (blockId: string, status: BlockStatus) => void = () => {};
  onTrackEnded: () => void = () => {};

  /** Boots the graph once (idempotent). Must first be called from a user gesture (autoplay policy). */
  start(): Promise<void> {
    this.starting ??= this.boot();
    return this.starting.then(() => this.ctx!.resume());
  }

  private async boot() {
    // NAM captures are trained at 48 kHz; run the whole graph there.
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    try {
      await ctx.audioWorklet.addModule(`${base}worklets/dsp.js`);
      this.nam = await NamEngine.attach(ctx, { assetBaseUrl: new URL(`${base}engine/`, location.href) });
    } catch (e) {
      void ctx.close();
      this.starting = undefined; // allow a retry
      throw e;
    }
    this.input = ctx.createGain();
    this.master = ctx.createGain();
    // Safety limiter: a mis-set gain should never blast the listener.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.inAnalyser = ctx.createAnalyser();
    this.outAnalyser = ctx.createAnalyser();
    this.inAnalyser.fftSize = this.outAnalyser.fftSize = 2048;
    this.input.connect(this.inAnalyser);
    this.master.connect(this.limiter).connect(this.outAnalyser);
    this.limiter.connect(ctx.destination);
    this.ctx = ctx;
    this.sync(this.order);
  }

  // ------------------------------------------------------------------ chain

  /** Reconcile running effect instances with the chain in the store. */
  sync(blocks: Block[]) {
    this.order = blocks;
    if (!this.ctx || !this.nam) return;
    const alive = new Set(blocks.map((b) => b.id));
    for (const [id, slot] of this.slots) {
      if (!alive.has(id)) {
        slot.disposed = true;
        slot.inst?.dispose();
        this.slots.delete(id);
      }
    }
    for (const b of blocks) {
      if (this.slots.has(b.id)) continue;
      const def = EFFECT_BY_TYPE[b.type];
      if (!def) continue;
      const slot: Slot = { type: b.type, disposed: false };
      this.slots.set(b.id, slot);
      const ec = {
        ctx: this.ctx,
        nam: this.nam,
        report: (s: BlockStatus) => !slot.disposed && this.onStatus(b.id, s),
      };
      Promise.resolve()
        .then(() => def.create(ec, b.params))
        .then(
          (inst) => {
            if (slot.disposed) return inst.dispose();
            slot.inst = inst;
            // Params may have moved while an async create() was in flight.
            const latest = this.order.find((x) => x.id === b.id);
            if (latest && latest.params !== b.params) {
              for (const [k, v] of Object.entries(latest.params)) if (v !== b.params[k]) inst.set(k, v);
            }
            this.rewire();
          },
          (e) => this.onStatus(b.id, { error: `이펙트 생성 실패: ${e instanceof Error ? e.message : e}` }),
        );
    }
    this.rewire();
  }

  private rewire() {
    if (!this.ctx) return;
    // Drop only the links we made; internal effect wiring stays intact.
    try {
      this.input.disconnect();
    } catch { /* nothing connected */ }
    this.input.connect(this.inAnalyser);
    for (const n of this.links) {
      try {
        n.disconnect();
      } catch { /* nothing connected */ }
    }
    this.links = [];
    let prev: AudioNode = this.input;
    for (const b of this.order) {
      const inst = this.slots.get(b.id)?.inst;
      if (!inst || !b.enabled) continue;
      prev.connect(inst.input);
      this.links.push(inst.output);
      prev = inst.output;
    }
    prev.connect(this.master);
  }

  /** Apply a param change. `blocks` is the updated chain, kept so late-created instances catch up. */
  setParam(blocks: Block[], blockId: string, key: string, value: ParamValue) {
    this.order = blocks;
    this.slots.get(blockId)?.inst?.set(key, value);
  }

  blockMeter(blockId: string): number | undefined {
    return this.slots.get(blockId)?.inst?.meter?.();
  }

  // ----------------------------------------------------------------- levels

  setInputGain(db: number) {
    if (this.ctx) this.input.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02);
  }
  setMaster(db: number) {
    if (this.ctx) this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02);
  }

  private peak(an: AnalyserNode): number {
    an.getFloatTimeDomainData(this.meterBuf);
    let p = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const a = Math.abs(this.meterBuf[i]);
      if (a > p) p = a;
    }
    return p;
  }
  /** Peak levels (linear) of the dry input and the final output. */
  levels(): { input: number; output: number } {
    if (!this.ctx) return { input: 0, output: 0 };
    return { input: this.peak(this.inAnalyser), output: this.peak(this.outAnalyser) };
  }
  /** Raw input samples for the tuner. */
  inputSamples(buf: Float32Array<ArrayBuffer>): boolean {
    if (!this.ctx) return false;
    this.inAnalyser.getFloatTimeDomainData(buf);
    return true;
  }
  latencyMs(): number {
    if (!this.ctx) return 0;
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }

  // ---------------------------------------------------------------- sources

  private decode(key: string, load: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
    let p = this.trackCache.get(key);
    if (!p) {
      p = load().then((b) => this.ctx!.decodeAudioData(b));
      p.catch(() => this.trackCache.delete(key));
      this.trackCache.set(key, p);
    }
    return p;
  }

  /** Loop a DI recording through the chain. */
  async playTrack(key: string, load: () => Promise<ArrayBuffer>) {
    await this.start();
    const mine = ++this.trackToken;
    const buf = await this.decode(key, load);
    if (mine !== this.trackToken) return;
    this.stopTrack(false);
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.input);
    src.start();
    this.track = src;
  }

  stopTrack(invalidate = true) {
    if (invalidate) this.trackToken++;
    if (!this.track) return;
    try {
      this.track.stop();
    } catch { /* already stopped */ }
    this.track.disconnect();
    this.track = undefined;
  }

  /** Route an audio interface / mic into the chain with all browser processing off. */
  async startLive(deviceId?: string, channel: InputChannel = 'mix') {
    await this.start();
    this.stopLive();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.stream = stream;
    const src = this.ctx!.createMediaStreamSource(stream);
    const mono = this.ctx!.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    if (channel === 'mix' || src.channelCount < 2) {
      src.connect(mono);
      this.liveNodes = [src, mono];
    } else {
      // Interfaces usually put the guitar on one side of a stereo pair.
      const split = this.ctx!.createChannelSplitter(2);
      src.connect(split);
      split.connect(mono, channel === 'left' ? 0 : 1);
      this.liveNodes = [src, split, mono];
    }
    mono.connect(this.input);
  }

  stopLive() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    disconnectAll(this.liveNodes);
    this.liveNodes = [];
  }
}

export const engine = new AudioEngine();
