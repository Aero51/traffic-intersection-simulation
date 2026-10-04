// "Zvuk" (off by default): the accessible pedestrian signal's ticking - a slow locator tick
// on red, rapid ticks on green - a low hum of engines that follows the traffic, and the
// ambulance's two-tone siren. Synthesised with the Web Audio API, no sound files.

export interface SoundState {
  /** A pedestrian light is green somewhere. */
  walk: boolean;
  /** 0..1: how much traffic is moving. */
  traffic: number;
  siren: boolean;
}

const TICK_RED = 1; // seconds between locator ticks
const TICK_GREEN = 0.14;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private nextTick = 0;
  private enabled = false;

  /** Must first be called from a user gesture (a click or key press) to be allowed to play. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && !this.ctx) this.init();
    if (!this.ctx) return;
    if (on) this.ctx.resume().catch(() => {});
    else this.ctx.suspend().catch(() => {});
  }

  /** Pause (simulation paused or tab hidden) without forgetting the setting. */
  setPaused(paused: boolean): void {
    if (!this.ctx || !this.enabled) return;
    if (paused) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  private init(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

    // Engine hum: looping brown noise through a low-pass filter.
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 220;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    noise.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    noise.start();

    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 440;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  private tick(at: number, green: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = green ? 1900 : 1200;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.09, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.04);
  }

  update(state: SoundState): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    if (this.nextTick < now) this.nextTick = now + 0.02;
    // Schedule a little ahead so ticks stay even regardless of frame timing.
    while (this.nextTick < now + 0.1) {
      this.tick(this.nextTick, state.walk);
      this.nextTick += state.walk ? TICK_GREEN : TICK_RED;
    }

    const load = Math.min(1, Math.max(0, state.traffic));
    this.engineGain!.gain.setTargetAtTime(0.05 + 0.25 * load, now, 0.3);
    this.engineFilter!.frequency.setTargetAtTime(160 + 260 * load, now, 0.3);

    // European two-tone siren: 440 / 587 Hz, alternating twice a second.
    this.sirenGain!.gain.setTargetAtTime(state.siren ? 0.07 : 0, now, 0.15);
    if (state.siren) this.sirenOsc!.frequency.setValueAtTime(Math.floor(now * 2) % 2 ? 587 : 440, now);
  }
}
