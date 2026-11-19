import { computeCrowdGainLevels } from './crowdLogic';

export type CrowdReactionType = 'ooh' | 'applause' | 'boo';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private unlocked = false;

  // Continuous stadium spectator ambience nodes
  private crowdStarted = false;
  private crowdIntensity = 0.22;
  private crowdMurmurGain: GainNode | null = null;
  private crowdChatterGain: GainNode | null = null;
  private crowdChatterFilter: BiquadFilterNode | null = null;
  private crowdMasterGain: GainNode | null = null;
  private crowdNodes: AudioNode[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume().catch(() => undefined);
        }
        if (this.enabled && this.crowdIntensity > 0) {
          this.ensureCrowdAmbience();
          this.applyCrowdLevels();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.muteCrowdNow();
    } else if (this.unlocked && this.crowdIntensity > 0) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isCrowdActive(): boolean {
    return this.crowdStarted && this.enabled && this.crowdIntensity > 0.001;
  }

  public updateCrowdIntensity(intensity: number): void {
    this.crowdIntensity = Math.min(1, Math.max(0, intensity));
    if (!this.enabled || this.crowdIntensity <= 0.001) {
      this.muteCrowdNow();
      return;
    }
    if (this.unlocked) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || !this.unlocked || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private ensureCrowdAmbience(): void {
    if (this.crowdStarted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    // 4-second seamless pink-shaped noise loop for rich stadium spectator bed
    const durationSec = 4;
    const bufferSize = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.085;
        b6 = white * 0.115926;
      }
      // Crossfade edges for click-free looping
      const fadeSamples = Math.min(2048, Math.floor(bufferSize * 0.05));
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        const tailIdx = bufferSize - fadeSamples + i;
        const blended = data[i] * t + data[tailIdx] * (1 - t);
        data[i] = blended;
        data[tailIdx] = blended;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Layer 1: Warm low stadium murmur
    const murmurFilter = ctx.createBiquadFilter();
    murmurFilter.type = 'bandpass';
    murmurFilter.frequency.value = 270;
    murmurFilter.Q.value = 0.7;

    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0;

    // Layer 2: Mid spectator chatter & chants with gentle LFO breathing
    const chatterFilter = ctx.createBiquadFilter();
    chatterFilter.type = 'bandpass';
    chatterFilter.frequency.value = 720;
    chatterFilter.Q.value = 1.05;

    const chatterGain = ctx.createGain();
    chatterGain.gain.value = 0;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.19;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 95;
    lfo.connect(lfoGain);
    lfoGain.connect(chatterFilter.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;

    source.connect(murmurFilter);
    murmurFilter.connect(murmurGain);
    murmurGain.connect(masterGain);

    source.connect(chatterFilter);
    chatterFilter.connect(chatterGain);
    chatterGain.connect(masterGain);

    masterGain.connect(ctx.destination);

    source.start();
    lfo.start();

    this.crowdMurmurGain = murmurGain;
    this.crowdChatterGain = chatterGain;
    this.crowdChatterFilter = chatterFilter;
    this.crowdMasterGain = masterGain;
    this.crowdNodes = [source, lfo, murmurFilter, chatterFilter, murmurGain, chatterGain, lfoGain, masterGain];
    this.crowdStarted = true;
  }

  private applyCrowdLevels(): void {
    if (!this.ctx || !this.crowdStarted || !this.crowdMurmurGain || !this.crowdChatterGain || !this.crowdChatterFilter || !this.crowdMasterGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const levels = computeCrowdGainLevels(this.enabled ? this.crowdIntensity : 0);
    this.crowdMasterGain.gain.setTargetAtTime(this.enabled ? 1 : 0, now, 0.15);
    this.crowdMurmurGain.gain.setTargetAtTime(levels.murmurGain, now, 0.25);
    this.crowdChatterGain.gain.setTargetAtTime(levels.chatterGain, now, 0.25);
    this.crowdChatterFilter.frequency.setTargetAtTime(levels.chatterFreqHz, now, 0.35);
  }

  private muteCrowdNow(): void {
    if (!this.ctx || !this.crowdMasterGain) return;
    const now = this.ctx.currentTime;
    this.crowdMasterGain.gain.setTargetAtTime(0, now, 0.08);
  }

  public playKick(power = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const pitchJitter = 0.92 + Math.random() * 0.16;
    osc.frequency.setValueAtTime((135 + power * 35) * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);

    gain.gain.setValueAtTime(Math.min(0.32, 0.16 * power), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playWhistle(pattern: 'short' | 'double' | 'long' = 'short'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const triggerBlast = (offset: number, duration: number) => {
      const now = ctx.currentTime + offset;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(2880, now);
      osc2.frequency.setValueAtTime(2945, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
      gain.gain.setValueAtTime(0.085, now + duration - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.stop(now + duration + 0.01);
    };

    if (pattern === 'short') {
      triggerBlast(0, 0.22);
    } else if (pattern === 'double') {
      triggerBlast(0, 0.16);
      triggerBlast(0.24, 0.28);
    } else {
      triggerBlast(0, 0.55);
    }
  }

  public playPostHit(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.24);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  public playGoalCheer(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 2.6;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.55;
      }
    }

    // Layer A: Deep stadium roar
    const roar = ctx.createBufferSource();
    roar.buffer = buffer;
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.setValueAtTime(520, now);
    roarFilter.frequency.linearRampToValueAtTime(840, now + 0.45);
    roarFilter.frequency.exponentialRampToValueAtTime(580, now + duration);
    roarFilter.Q.setValueAtTime(0.9, now);

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.001, now);
    roarGain.gain.linearRampToValueAtTime(0.24, now + 0.14);
    roarGain.gain.setValueAtTime(0.21, now + 1.1);
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    roar.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(ctx.destination);
    roar.start(now);
    roar.stop(now + duration);

    // Layer B: Bright cheering & applause shimmer
    const clap = ctx.createBufferSource();
    clap.buffer = buffer;
    const clapFilter = ctx.createBiquadFilter();
    clapFilter.type = 'bandpass';
    clapFilter.frequency.setValueAtTime(1650, now);
    clapFilter.Q.setValueAtTime(1.2, now);

    const clapGain = ctx.createGain();
    clapGain.gain.setValueAtTime(0.001, now);
    clapGain.gain.linearRampToValueAtTime(0.11, now + 0.25);
    clapGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    clap.connect(clapFilter);
    clapFilter.connect(clapGain);
    clapGain.connect(ctx.destination);
    clap.start(now);
    clap.stop(now + duration);
  }

  public playCrowdReaction(type: CrowdReactionType): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = type === 'ooh' ? 0.95 : type === 'applause' ? 1.15 : 0.85;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.48;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = ctx.createGain();

    if (type === 'ooh') {
      filter.frequency.setValueAtTime(880, now);
      filter.frequency.exponentialRampToValueAtTime(430, now + duration);
      filter.Q.setValueAtTime(1.7, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } else if (type === 'applause') {
      filter.frequency.setValueAtTime(1450, now);
      filter.Q.setValueAtTime(0.85, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } else {
      filter.frequency.setValueAtTime(340, now);
      filter.frequency.linearRampToValueAtTime(280, now + duration);
      filter.Q.setValueAtTime(2.0, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.13, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    }

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  }

  public playNetSwish(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.24);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.45;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.24);
  }

  public playTackle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.Q.setValueAtTime(0.9, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.18);
  }

  public dispose(): void {
    for (const node of this.crowdNodes) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.crowdNodes = [];
    this.crowdStarted = false;
  }
}

export const soundEngine = new SoundEngine();
