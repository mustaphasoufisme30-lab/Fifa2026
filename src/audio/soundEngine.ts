import {
  canTriggerSound,
  computeCrowdGainLevels,
  computeEffectiveCrowdIntensity,
  SoundChannelId,
} from './crowdLogic';

export type CrowdReactionType = 'ooh' | 'applause' | 'boo';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private enabled = true;
  private masterVolume = 1;
  private effectsEnabled = true;
  private effectsVolume = 0.75;
  private unlocked = false;

  // Preloaded reusable audio buffers (synthesized once, zero runtime buffer allocations)
  private crowdBedBuffer: AudioBuffer | null = null;
  private roarBuffer: AudioBuffer | null = null;
  private applauseBuffer: AudioBuffer | null = null;
  private shortNoiseBuffer: AudioBuffer | null = null;

  // Continuous stadium spectator ambience nodes
  private crowdStarted = false;
  private baseCrowdIntensity = 0.22;
  private reactionBoostPeak = 0;
  private reactionBoostStartMs = 0;
  private reactionBoostDecaySec = 0;
  private crowdMurmurGain: GainNode | null = null;
  private crowdChatterGain: GainNode | null = null;
  private crowdChatterFilter: BiquadFilterNode | null = null;
  private crowdMasterGain: GainNode | null = null;
  private crowdNodes: AudioNode[] = [];

  // Per-channel cooldown timestamps to prevent duplicate simultaneous triggers
  private readonly lastTriggeredMs: Partial<Record<SoundChannelId, number>> = {};

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlocked = true;
        const ctx = this.ensureContext();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume().catch(() => undefined);
        }
        if (this.enabled && this.baseCrowdIntensity > 0) {
          this.ensureCrowdAmbience();
          this.applyCrowdLevels();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyBusGains();
    if (!enabled) {
      this.muteCrowdNow();
    } else if (this.unlocked && this.baseCrowdIntensity > 0) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }

  public setAudioMix(opts: {
    soundEnabled: boolean;
    soundVolume: number; // 0..100
    effectsEnabled: boolean;
    effectsVolume: number; // 0..100
  }): void {
    this.enabled = opts.soundEnabled;
    this.masterVolume = Math.max(0, Math.min(1, opts.soundVolume / 100));
    this.effectsEnabled = opts.effectsEnabled;
    this.effectsVolume = Math.max(0, Math.min(1, opts.effectsVolume / 100));
    this.applyBusGains();
    if (!this.enabled || this.masterVolume <= 0.001) {
      this.muteCrowdNow();
    } else if (this.unlocked && this.baseCrowdIntensity > 0) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }

  private applyBusGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterBus) {
      const targetMaster = this.enabled ? 0.92 * this.masterVolume : 0;
      this.masterBus.gain.setTargetAtTime(targetMaster, now, 0.04);
    }
    if (this.sfxBus) {
      const targetSfx = this.enabled && this.effectsEnabled ? this.effectsVolume : 0;
      this.sfxBus.gain.setTargetAtTime(targetSfx, now, 0.04);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isCrowdActive(): boolean {
    return this.crowdStarted && this.enabled && this.baseCrowdIntensity > 0.001;
  }

  public getEffectiveCrowdIntensity(): number {
    const elapsedSec = Math.max(0, (performance.now() - this.reactionBoostStartMs) / 1000);
    return computeEffectiveCrowdIntensity(
      this.baseCrowdIntensity,
      this.reactionBoostPeak,
      elapsedSec,
      this.reactionBoostDecaySec,
    );
  }

  public updateCrowdIntensity(intensity: number): void {
    this.baseCrowdIntensity = Math.min(1, Math.max(0, intensity));
    if (!this.enabled || this.baseCrowdIntensity <= 0.001) {
      this.muteCrowdNow();
      return;
    }
    if (this.unlocked) {
      this.ensureCrowdAmbience();
      this.applyCrowdLevels();
    }
  }

  private triggerAmbienceSwell(boostPeak: number, decaySec: number): void {
    const nowMs = performance.now();
    const currentEffective = this.getEffectiveCrowdIntensity();
    const desired = Math.min(1, this.baseCrowdIntensity + boostPeak);
    if (desired >= currentEffective - 0.02) {
      this.reactionBoostPeak = boostPeak;
      this.reactionBoostStartMs = nowMs;
      this.reactionBoostDecaySec = decaySec;
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

      // Lightweight master bus with soft dynamics limiter for clean mobile speaker mixing
      const master = this.ctx.createGain();
      master.gain.value = this.enabled ? 0.92 * this.masterVolume : 0;
      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.008;
        comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(this.ctx.destination);
      } else {
        master.connect(this.ctx.destination);
      }
      this.masterBus = master;

      const sfx = this.ctx.createGain();
      sfx.gain.value = this.enabled && this.effectsEnabled ? this.effectsVolume : 0;
      sfx.connect(master);
      this.sfxBus = sfx;

      this.preloadBuffers(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private getOutputNode(ctx: AudioContext): AudioNode {
    return this.masterBus ?? ctx.destination;
  }

  private getSfxOutputNode(ctx: AudioContext): AudioNode {
    return this.sfxBus ?? this.masterBus ?? ctx.destination;
  }

  /**
   * Pre-synthesizes all reusable noise/applause/roar AudioBuffers once at audio unlock
   * so gameplay triggers never allocate fresh AudioBuffers per frame or per event.
   */
  private preloadBuffers(ctx: AudioContext): void {
    if (this.crowdBedBuffer) return;

    // 1. 4-second seamless stereo pink-shaped noise bed for permanent stadium murmur
    const bedSamples = Math.floor(ctx.sampleRate * 4.0);
    const bedBuf = ctx.createBuffer(2, bedSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = bedBuf.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < bedSamples; i++) {
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
      const fadeSamples = Math.min(2048, Math.floor(bedSamples * 0.05));
      for (let i = 0; i < fadeSamples; i++) {
        const t = i / fadeSamples;
        const tailIdx = bedSamples - fadeSamples + i;
        const blended = data[i] * t + data[tailIdx] * (1 - t);
        data[i] = blended;
        data[tailIdx] = blended;
      }
    }
    this.crowdBedBuffer = bedBuf;

    // 2. 2.8-second rich stereo crowd roar buffer (reused for goals, dangerous shots, boos)
    const roarSamples = Math.floor(ctx.sampleRate * 2.8);
    const roarBuf = ctx.createBuffer(2, roarSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = roarBuf.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < roarSamples; i++) {
        const w = Math.random() * 2 - 1;
        prev = prev * 0.52 + w * 0.48;
        data[i] = prev * 0.55;
      }
    }
    this.roarBuffer = roarBuf;

    // 3. 1.6-second stereo textured stadium applause buffer (modulated micro-clap bursts)
    const appSamples = Math.floor(ctx.sampleRate * 1.6);
    const appBuf = ctx.createBuffer(2, appSamples, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = appBuf.getChannelData(ch);
      for (let i = 0; i < appSamples; i++) {
        const tSec = i / ctx.sampleRate;
        // Layered rapid clap-rate modulation gives organic stadium clapping texture
        const clapMod =
          0.55 +
          0.25 * Math.sin(tSec * 52 + ch * 1.7) +
          0.2 * Math.sin(tSec * 83 + ch * 0.9);
        data[i] = (Math.random() * 2 - 1) * 0.44 * clapMod;
      }
    }
    this.applauseBuffer = appBuf;

    // 4. 0.30-second mono short impact noise buffer (reused for net swish & tackle)
    const shortSamples = Math.floor(ctx.sampleRate * 0.3);
    const shortBuf = ctx.createBuffer(1, shortSamples, ctx.sampleRate);
    const shortData = shortBuf.getChannelData(0);
    for (let i = 0; i < shortSamples; i++) {
      shortData[i] = (Math.random() * 2 - 1) * 0.46;
    }
    this.shortNoiseBuffer = shortBuf;
  }

  private ensureCrowdAmbience(): void {
    if (this.crowdStarted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.crowdBedBuffer) return;

    const source = ctx.createBufferSource();
    source.buffer = this.crowdBedBuffer;
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

    masterGain.connect(this.getOutputNode(ctx));

    source.start();
    lfo.start();

    this.crowdMurmurGain = murmurGain;
    this.crowdChatterGain = chatterGain;
    this.crowdChatterFilter = chatterFilter;
    this.crowdMasterGain = masterGain;
    this.crowdNodes = [
      source,
      lfo,
      murmurFilter,
      chatterFilter,
      murmurGain,
      chatterGain,
      lfoGain,
      masterGain,
    ];
    this.crowdStarted = true;
  }

  private applyCrowdLevels(): void {
    if (
      !this.ctx ||
      !this.crowdStarted ||
      !this.crowdMurmurGain ||
      !this.crowdChatterGain ||
      !this.crowdChatterFilter ||
      !this.crowdMasterGain
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    const effective = this.enabled ? this.getEffectiveCrowdIntensity() : 0;
    const levels = computeCrowdGainLevels(effective);
    this.crowdMasterGain.gain.setTargetAtTime(this.enabled ? 1 : 0, now, 0.15);
    this.crowdMurmurGain.gain.setTargetAtTime(levels.murmurGain, now, 0.28);
    this.crowdChatterGain.gain.setTargetAtTime(levels.chatterGain, now, 0.28);
    this.crowdChatterFilter.frequency.setTargetAtTime(levels.chatterFreqHz, now, 0.35);
  }

  private muteCrowdNow(): void {
    if (!this.ctx || !this.crowdMasterGain) return;
    const now = this.ctx.currentTime;
    this.crowdMasterGain.gain.setTargetAtTime(0, now, 0.08);
  }

  public playKick(power = 1): void {
    if (!this.effectsEnabled || this.effectsVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!canTriggerSound(this.lastTriggeredMs, 'kick', performance.now())) return;

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
    gain.connect(this.getSfxOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playWhistle(pattern: 'short' | 'double' | 'long' = 'short'): void {
    if (!this.effectsEnabled || this.effectsVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!canTriggerSound(this.lastTriggeredMs, 'whistle', performance.now())) return;

    const out = this.getSfxOutputNode(ctx);
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
      gain.connect(out);
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
    if (!this.effectsEnabled || this.effectsVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (!canTriggerSound(this.lastTriggeredMs, 'postHit', performance.now())) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.24);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.getSfxOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.28);
  }

  public playGoalCheer(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.roarBuffer || !this.applauseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, 'goalCheer', performance.now())) return;

    this.triggerAmbienceSwell(0.55, 4.5);

    const now = ctx.currentTime;
    const duration = 2.7;
    const out = this.getOutputNode(ctx);

    // Layer A: Deep stadium goal roar (reuses preloaded stereo roarBuffer)
    const roar = ctx.createBufferSource();
    roar.buffer = this.roarBuffer;
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.setValueAtTime(520, now);
    roarFilter.frequency.linearRampToValueAtTime(880, now + 0.42);
    roarFilter.frequency.exponentialRampToValueAtTime(560, now + duration);
    roarFilter.Q.setValueAtTime(0.85, now);

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.001, now);
    roarGain.gain.linearRampToValueAtTime(0.26, now + 0.14);
    roarGain.gain.setValueAtTime(0.22, now + 1.25);
    roarGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    roar.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(out);
    roar.start(now);
    roar.stop(now + duration);

    // Layer B: Bright cheering & stadium applause shimmer (reuses preloaded applauseBuffer)
    const clap = ctx.createBufferSource();
    clap.buffer = this.applauseBuffer;
    clap.loop = true;
    const clapFilter = ctx.createBiquadFilter();
    clapFilter.type = 'bandpass';
    clapFilter.frequency.setValueAtTime(1650, now);
    clapFilter.Q.setValueAtTime(1.05, now);

    const clapGain = ctx.createGain();
    clapGain.gain.setValueAtTime(0.001, now);
    clapGain.gain.linearRampToValueAtTime(0.13, now + 0.22);
    clapGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    clap.connect(clapFilter);
    clapFilter.connect(clapGain);
    clapGain.connect(out);
    clap.start(now);
    clap.stop(now + duration);
  }

  public playCrowdReaction(type: CrowdReactionType): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.roarBuffer || !this.applauseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, type, performance.now())) return;

    const now = ctx.currentTime;
    const out = this.getOutputNode(ctx);
    const duration = type === 'ooh' ? 1.05 : type === 'applause' ? 1.25 : 0.85;

    const noise = ctx.createBufferSource();
    noise.buffer = type === 'applause' ? this.applauseBuffer : this.roarBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = ctx.createGain();

    if (type === 'ooh') {
      // Dangerous shot / near-miss crowd gasp & swell
      this.triggerAmbienceSwell(0.34, 2.2);
      filter.frequency.setValueAtTime(920, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + duration);
      filter.Q.setValueAtTime(1.6, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    } else if (type === 'applause') {
      // Crisp applause for successful passes, dribbles, or saves
      this.triggerAmbienceSwell(0.2, 1.8);
      filter.frequency.setValueAtTime(1520, now);
      filter.Q.setValueAtTime(0.82, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.14);
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
    gain.connect(out);
    noise.start(now, 0, duration);
    noise.stop(now + duration);
  }

  public playNetSwish(): void {
    if (!this.effectsEnabled || this.effectsVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.shortNoiseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, 'netSwish', performance.now())) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.shortNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getSfxOutputNode(ctx));
    noise.start(now, 0, 0.24);
    noise.stop(now + 0.24);
  }

  public playTackle(): void {
    if (!this.effectsEnabled || this.effectsVolume <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.shortNoiseBuffer) return;
    if (!canTriggerSound(this.lastTriggeredMs, 'tackle', performance.now())) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.shortNoiseBuffer;

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
    gain.connect(this.getSfxOutputNode(ctx));
    noise.start(now, 0, 0.18);
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
