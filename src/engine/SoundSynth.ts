export class SoundSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  // Sound nodes
  private masterGain: GainNode | null = null;
  
  // Ambience nodes
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windLFO: OscillatorNode | null = null;
  private pianoInterval: any = null;

  // Pouring sound nodes
  private pourSource: AudioBufferSourceNode | null = null;
  private pourGain: GainNode | null = null;
  private pourFilter: BiquadFilterNode | null = null;

  // Dragging sound nodes
  private dragSource: AudioBufferSourceNode | null = null;
  private dragGain: GainNode | null = null;
  private dragFilter: BiquadFilterNode | null = null;

  // Cached noise buffer
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // Lazy-initialized on first user interaction
  }

  public setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain && this.ctx) {
      const targetVolume = mute ? 0 : 1;
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(targetVolume, this.ctx.currentTime + 0.2);
    }
  }

  public init() {
    if (this.ctx) return; // Already initialized

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.createNoiseBuffer();
      this.startWindAmbience();
      this.startAmbientPiano();
    } catch (e) {
      console.error('Web Audio API not supported or blocked:', e);
    }
  }

  private resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    
    const bufferSize = 2 * this.ctx.sampleRate; // 2 seconds of noise
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    this.noiseBuffer = noiseBuffer;
  }

  private startWindAmbience() {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;

    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = this.noiseBuffer;
    this.windSource.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.setValueAtTime(200, this.ctx.currentTime);
    this.windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.04, this.ctx.currentTime); // very soft

    // Modulate filter frequency with an LFO for natural gusting
    this.windLFO = this.ctx.createOscillator();
    this.windLFO.type = 'sine';
    this.windLFO.frequency.setValueAtTime(0.05, this.ctx.currentTime); // 0.05 Hz (very slow)
    
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(100, this.ctx.currentTime); // Sweep range +/- 100Hz

    this.windLFO.connect(lfoGain);
    lfoGain.connect(this.windFilter.frequency);
    this.windLFO.start();

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    
    this.windSource.start();
  }

  private startAmbientPiano() {
    if (this.pianoInterval) return;

    const playAmbientChord = () => {
      if (this.isMuted || !this.ctx) return;
      
      const chords = [
        [261.63, 329.63, 392.00, 493.88], // Cmaj7 (C4, E4, G4, B4)
        [293.66, 349.23, 440.00, 523.25], // Dm7 (D4, F4, A4, C5)
        [349.23, 440.00, 523.25, 659.25], // Fmaj7 (F4, A4, C5, E5)
        [392.00, 493.88, 587.33, 698.46], // G7 (G4, B4, D5, F5)
        [220.00, 261.63, 329.63, 392.00], // Am7 (A3, C4, E4, G4)
      ];

      // Choose a random chord
      const chordIndex = Math.floor(Math.random() * chords.length);
      const freqs = chords[chordIndex];

      // Delay each note slightly to simulate a strummed piano chord
      freqs.forEach((freq, idx) => {
        const noteDelay = idx * 0.15 + Math.random() * 0.1;
        this.playPianoNote(freq, noteDelay);
      });
    };

    // Play a chord every 12 to 18 seconds
    const scheduleNext = () => {
      const delay = 12000 + Math.random() * 6000;
      this.pianoInterval = setTimeout(() => {
        playAmbientChord();
        scheduleNext();
      }, delay);
    };

    // Start scheduling
    scheduleNext();
  }

  private playPianoNote(freq: number, delaySec: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    
    // Triangle wave has a soft, mellow timbre similar to a felted piano
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, this.ctx.currentTime + delaySec);
    
    // Sine wave adds fundamental warmth
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 0.998, this.ctx.currentTime + delaySec); // tiny detune

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime + delaySec);
    filter.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + delaySec + 4.0);

    gainNode.gain.setValueAtTime(0.0, this.ctx.currentTime + delaySec);
    gainNode.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + delaySec + 0.2); // soft attack
    gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + delaySec + 6.0); // slow decay

    // Delay/Echo for spacey feeling
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.setValueAtTime(0.5, this.ctx.currentTime + delaySec);
    const delayGain = this.ctx.createGain();
    delayGain.gain.setValueAtTime(0.3, this.ctx.currentTime + delaySec);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    
    gainNode.connect(this.masterGain);
    
    // Connect to echo delay feedback
    gainNode.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(delay); // feedback loop
    delayGain.connect(this.masterGain);

    osc1.start(this.ctx.currentTime + delaySec);
    osc2.start(this.ctx.currentTime + delaySec);

    osc1.stop(this.ctx.currentTime + delaySec + 7.0);
    osc2.stop(this.ctx.currentTime + delaySec + 7.0);
  }

  public playLift() {
    this.resumeContext();
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    // Smooth soft "lift" wood friction creak
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  public playDrop() {
    this.resumeContext();
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    // Tactical wood "thud" with short tail
    const osc = this.ctx.createOscillator();
    const noise = this.ctx.createBufferSource();
    const noiseFilter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.1);

    if (this.noiseBuffer) {
      noise.buffer = this.noiseBuffer;
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(180, this.ctx.currentTime);
      noise.connect(noiseFilter);
      noiseFilter.connect(gain);
      noise.start();
      noise.stop(this.ctx.currentTime + 0.15);
    }

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  public startDrag() {
    this.resumeContext();
    if (this.isMuted || !this.ctx || !this.noiseBuffer || !this.masterGain || this.dragSource) return;

    this.dragSource = this.ctx.createBufferSource();
    this.dragSource.buffer = this.noiseBuffer;
    this.dragSource.loop = true;

    this.dragFilter = this.ctx.createBiquadFilter();
    this.dragFilter.type = 'lowpass';
    this.dragFilter.frequency.setValueAtTime(150, this.ctx.currentTime);

    this.dragGain = this.ctx.createGain();
    this.dragGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Start quiet

    this.dragSource.connect(this.dragFilter);
    this.dragFilter.connect(this.dragGain);
    this.dragGain.connect(this.masterGain);

    this.dragSource.start();
  }

  public updateDrag(speed: number) {
    if (!this.ctx || !this.dragGain || !this.dragFilter) return;

    const clampedSpeed = Math.min(speed, 15);
    const targetVolume = (clampedSpeed / 15) * 0.05;
    const targetFreq = 100 + (clampedSpeed / 15) * 120;

    this.dragGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.05);
    this.dragFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
  }

  public stopDrag() {
    if (!this.ctx || !this.dragGain || !this.dragSource) return;

    const currentSource = this.dragSource;
    const currentGain = this.dragGain;

    currentGain.gain.setValueAtTime(currentGain.gain.value, this.ctx.currentTime);
    currentGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);

    setTimeout(() => {
      try {
        currentSource.stop();
      } catch (e) {}
    }, 200);

    this.dragSource = null;
    this.dragGain = null;
    this.dragFilter = null;
  }

  public startPour() {
    this.resumeContext();
    if (this.isMuted || !this.ctx || !this.noiseBuffer || !this.masterGain || this.pourSource) return;

    this.pourSource = this.ctx.createBufferSource();
    this.pourSource.buffer = this.noiseBuffer;
    this.pourSource.loop = true;

    this.pourFilter = this.ctx.createBiquadFilter();
    this.pourFilter.type = 'bandpass';
    this.pourFilter.frequency.setValueAtTime(600, this.ctx.currentTime);
    this.pourFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    this.pourGain = this.ctx.createGain();
    this.pourGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.pourSource.connect(this.pourFilter);
    this.pourFilter.connect(this.pourGain);
    this.pourGain.connect(this.masterGain);

    this.pourSource.start();

    // Fade in
    this.pourGain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.15);
  }

  /**
   * Updates pouring sound dynamic pitch shifting based on fill levels.
   */
  public updatePour(flowRate: number, targetFillPercent: number) {
    if (!this.ctx || !this.pourGain || !this.pourFilter) return;

    // Pitch rises from 600 Hz to 1300 Hz as container fills up (Helmholtz resonance simulation)
    const baseFreq = 500;
    const targetFreq = baseFreq + targetFillPercent * 700;

    // Volume scales with flowRate
    const targetVolume = Math.min(flowRate * 0.15, 0.15);

    this.pourFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    this.pourGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.1);
  }

  public stopPour() {
    if (!this.ctx || !this.pourGain || !this.pourSource) return;

    const currentSource = this.pourSource;
    const currentGain = this.pourGain;

    currentGain.gain.setValueAtTime(currentGain.gain.value, this.ctx.currentTime);
    currentGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.25);

    setTimeout(() => {
      try {
        currentSource.stop();
      } catch (e) {}
    }, 300);

    this.pourSource = null;
    this.pourGain = null;
    this.pourFilter = null;
  }

  public playChime() {
    this.resumeContext();
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    // Soft chime when action completes/stops
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5

    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.7);
  }

  public playSuccess() {
    this.resumeContext();
    if (this.isMuted || !this.ctx || !this.masterGain) return;

    const context = this.ctx;
    const master = this.masterGain;

    // Beautiful upward C-major pentatonic arpeggio (C5, E5, G5, A5, C6)
    const notes = [523.25, 659.25, 783.99, 880.00, 1046.50];
    
    notes.forEach((freq, idx) => {
      const delay = idx * 0.08;
      
      const osc = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, context.currentTime + delay);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, context.currentTime + delay);

      gain.gain.setValueAtTime(0.0, context.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.05, context.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(context.currentTime + delay);
      osc.stop(context.currentTime + delay + 1.5);
    });
  }

  public destroy() {
    if (this.pianoInterval) {
      clearTimeout(this.pianoInterval);
      this.pianoInterval = null;
    }
    
    if (this.windLFO) {
      try { this.windLFO.stop(); } catch (e) {}
      this.windLFO = null;
    }
    
    if (this.windSource) {
      try { this.windSource.stop(); } catch (e) {}
      this.windSource = null;
    }

    if (this.pourSource) {
      try { this.pourSource.stop(); } catch (e) {}
      this.pourSource = null;
    }

    if (this.dragSource) {
      try { this.dragSource.stop(); } catch (e) {}
      this.dragSource = null;
    }

    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
