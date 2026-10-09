/*
 * Stadium sound, synthesised with WebAudio (no asset files): a crowd bed that
 * roars on goals, the referee's whistle, kicks, saves and the woodwork.
 */

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must run inside a user gesture (browsers block audio until then). */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.startCrowd();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private makeNoise() {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // brown-ish noise: a crowd is mostly low rumble
      last = (last + (Math.random() * 2 - 1) * 0.08) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  private startCrowd() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = "bandpass";
    this.crowdFilter.frequency.value = 520;
    this.crowdFilter.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.master!);
    src.start();
  }

  /** Crowd bed level: 0 silent (menus), ~0.15 during play. */
  crowd(level: number) {
    if (!this.ctx || !this.crowdGain) return;
    this.crowdGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }

  /** The stadium erupts. */
  roar(strength = 1) {
    if (!this.ctx || !this.crowdGain || !this.crowdFilter) return;
    const t = this.ctx.currentTime;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.55 * strength, t + 0.25);
    g.setTargetAtTime(0.15, t + 1.8, 0.8);
    const f = this.crowdFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(900, t + 0.3);
    f.setTargetAtTime(520, t + 1.8, 0.8);
  }

  /** "Ooooh" — a near miss. */
  groan() {
    if (!this.ctx || !this.crowdFilter || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.32, t, 0.08);
    this.crowdGain.gain.setTargetAtTime(0.15, t + 0.8, 0.5);
    this.crowdFilter.frequency.setTargetAtTime(330, t, 0.1);
    this.crowdFilter.frequency.setTargetAtTime(520, t + 0.8, 0.5);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, glide?: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private thump(vol: number, freq = 140) {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.14);
    this.tone(freq, 0.09, "sine", vol * 0.8, freq * 0.5);
  }

  kick(power: number) {
    this.thump(0.25 + power * 0.35, 120 + power * 60);
  }

  whistle(long = false) {
    const dur = long ? 0.9 : 0.35;
    for (const [f, v] of [
      [2900, 0.07],
      [3120, 0.05],
    ] as const) {
      if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const g = this.ctx.createGain();
      osc.frequency.value = f;
      lfo.frequency.value = 28;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.02);
      g.gain.setValueAtTime(v, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur + 0.02);
      lfo.stop(t + dur + 0.02);
    }
  }

  post() {
    this.tone(1240, 0.5, "triangle", 0.18, 1180);
    this.tone(1860, 0.35, "sine", 0.08);
  }

  save() {
    this.thump(0.35, 90);
  }

  skill(cr7: boolean) {
    if (cr7) this.tone(180, 0.5, "sawtooth", 0.08, 720);
    else this.tone(900, 0.8, "sine", 0.08, 220);
  }

  /** The crowd chant after a CR7 goal: a rising "SIUUU" horn. */
  siuuu() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + 0.9;
    const osc = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.25);
    osc.frequency.setValueAtTime(330, t + 1.1);
    f.type = "bandpass";
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(350, t + 1.2);
    f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.setValueAtTime(0.12, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.35);
  }
}
