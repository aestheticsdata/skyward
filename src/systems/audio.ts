// Procedural 8-bit-style SFX. Everything is synthesized at play-time from
// oscillators and a single noise buffer — same primitives a NES sound chip
// has (square/triangle/noise channels), no samples, no external assets.
//
// The AudioContext is created lazily on the first sound. Browsers refuse to
// start audio before a user gesture, but every SFX in this game is triggered
// by a key press, so the first blip() call always lands inside a valid
// gesture window. If the context ends up suspended later (e.g. tab refocus),
// we try to resume it before each play.

interface BlipOptions {
  freq: number;
  freqEnd?: number; // omit for a constant pitch
  duration: number; // seconds
  type?: OscillatorType; // 'square' (default) | 'triangle' | 'sawtooth' | 'sine'
  volume?: number; // peak gain, 0..1
  delay?: number; // seconds, relative to "now"
}

interface NoiseOptions {
  duration: number;
  volume?: number;
  delay?: number;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Lazy context creation. Browsers auto-suspend audio until first user
  // gesture, so we wait until something actually wants to play.
  private ensureContext(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        // Fire-and-forget; if it fails (no gesture yet), the upcoming
        // schedule will just be silent, no exception.
        void this.ctx.resume();
      }
      return this.ctx;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.35; // overall headroom — many sounds layer
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  private get masterNode(): GainNode {
    // ensureContext() always sets `master` alongside `ctx`, so by the time a
    // caller has a context, master exists. Non-null assertion is safe.
    return this.master as GainNode;
  }

  // One-shot oscillator with an exponential pitch sweep and fade-out envelope.
  // exponentialRampToValueAtTime needs strictly positive values, so the fade
  // ramps to 0.0001 (effectively silent) rather than 0.
  private blip(opts: BlipOptions): void {
    const ctx = this.ensureContext();
    const start = ctx.currentTime + (opts.delay ?? 0);
    const end = start + opts.duration;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.freqEnd !== undefined && opts.freqEnd !== opts.freq) {
      osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, end);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.volume ?? 0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(this.masterNode);
    osc.start(start);
    osc.stop(end);
  }

  // Short white-noise burst. The 1-second buffer is generated once and reused
  // for every burst — picking a different start offset would give a slight
  // variation each time, but a fixed buffer reads fine for these UI/SFX uses.
  private noise(opts: NoiseOptions): void {
    const ctx = this.ensureContext();
    if (!this.noiseBuffer) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    const start = ctx.currentTime + (opts.delay ?? 0);
    const end = start + opts.duration;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.volume ?? 0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    src.connect(gain).connect(this.masterNode);
    src.start(start);
    src.stop(end);
  }

  // --------------------------------------------------------------------------
  // Public SFX. Each is tuned by feel; tweak the numbers in here directly to
  // adjust character. Volume values cluster low (0.05–0.25) because layering
  // is common and the master gain (0.35) compresses everything further.
  // --------------------------------------------------------------------------

  // Classic upward chirp. Quick exponential pitch rise — reads as "lift-off."
  jump(): void {
    this.blip({ freq: 220, freqEnd: 660, duration: 0.15, volume: 0.2 });
  }

  // Low triangle thud + tiny noise tick. Triangle (not square) keeps it
  // mellow; the noise adds an impact crunch without making it loud.
  land(): void {
    this.blip({ freq: 180, freqEnd: 80, duration: 0.08, volume: 0.25, type: 'triangle' });
    this.noise({ duration: 0.04, volume: 0.08 });
  }

  // Tiny noise click. Played per stride — gets stacked many times a second
  // so volume stays very low on purpose.
  footstep(): void {
    this.noise({ duration: 0.03, volume: 0.06 });
  }

  // C-E-G-C ascending arpeggio on a square wave — the "you found something"
  // sting. Each note is 120ms with 80ms spacing so they overlap slightly,
  // which reads as one phrase instead of four separate beeps.
  discover(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      this.blip({ freq, duration: 0.12, volume: 0.18, delay: i * 0.08 });
    });
  }

  // Descending triangle blip with a noise dust tail — papery, opens the book.
  openBook(): void {
    this.blip({ freq: 660, freqEnd: 330, duration: 0.12, volume: 0.15, type: 'triangle' });
    this.noise({ duration: 0.05, volume: 0.04, delay: 0.03 });
  }

  // Ascending triangle blip — closes the book. Inverse direction of openBook
  // so the pair reads as "in" / "out" without needing extra ornamentation.
  closeBook(): void {
    this.blip({ freq: 330, freqEnd: 220, duration: 0.1, volume: 0.15, type: 'triangle' });
  }

  // "Floc" — short low blip with a noise tail. Played when the player wades
  // into a water tile. Two layers: a low triangle thump for the splash body,
  // a brief noise burst for the spray.
  splash(): void {
    this.blip({ freq: 200, freqEnd: 80, duration: 0.12, volume: 0.2, type: 'triangle' });
    this.noise({ duration: 0.06, volume: 0.08, delay: 0.02 });
  }

  // Per-step splash while wading. Two layered noise sources, both filtered
  // and pitch-modulated, to imitate a real wet splash:
  //   - "Body" layer: band-pass that sweeps DOWN (1200 → 350 Hz), mimicking
  //     a real splash's mid-frequency content collapsing as the water
  //     swallows whatever entered it. Random playback-rate per call so two
  //     consecutive steps aren't identical.
  //   - "Spray" layer: a brief, brighter burst (high-pass 2500 Hz) for the
  //     droplet-flicking-back tail at the start of the splash.
  // Together these read as "floc" — broadband noise with character — rather
  // than a single muffled hiss.
  wadeStep(): void {
    const ctx = this.ensureContext();
    if (!this.noiseBuffer) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }

    const start = ctx.currentTime;
    const master = this.masterNode;
    const noise = this.noiseBuffer;

    // ---- Layer 1: body of the splash --------------------------------------
    const bodyEnd = start + 0.16;
    const body = ctx.createBufferSource();
    body.buffer = noise;
    // Per-step pitch jitter — breaks the "same sample again and again" feel.
    body.playbackRate.value = 0.7 + Math.random() * 0.4;

    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.setValueAtTime(1200, start);
    bodyFilter.frequency.exponentialRampToValueAtTime(350, bodyEnd);
    bodyFilter.Q.setValueAtTime(0.9, start);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0, start);
    bodyGain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, bodyEnd);

    body.connect(bodyFilter).connect(bodyGain).connect(master);
    body.start(start);
    body.stop(bodyEnd);

    // ---- Layer 2: bright spray tick ---------------------------------------
    const sprayEnd = start + 0.05;
    const spray = ctx.createBufferSource();
    spray.buffer = noise;
    spray.playbackRate.value = 1.1 + Math.random() * 0.3;

    const sprayFilter = ctx.createBiquadFilter();
    sprayFilter.type = 'highpass';
    sprayFilter.frequency.setValueAtTime(2500, start);

    const sprayGain = ctx.createGain();
    sprayGain.gain.setValueAtTime(0, start);
    sprayGain.gain.linearRampToValueAtTime(0.07, start + 0.005);
    sprayGain.gain.exponentialRampToValueAtTime(0.0001, sprayEnd);

    spray.connect(sprayFilter).connect(sprayGain).connect(master);
    spray.start(start);
    spray.stop(sprayEnd);
  }
}
