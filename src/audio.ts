// Every sound in this game is synthesized live. No samples. Just math and poor decisions.
import { rand, clamp } from './util';
import { Band, songBars } from './music';
import { SONGS } from './songs';

export { SONGS };

export interface Station {
  name: string;
  freq: string;
  songs: string[];
  tape?: boolean;
  dj: string[];
}

export const STATIONS: Station[] = [
  {
    name: 'HELL YEAH FM',
    freq: '66.6',
    songs: ['hellyeah'],
    dj: [
      "you're listening to HELL YEAH FM, the only station legally classified as a weapon",
      'next up: 4 hours of the same riff. you will not notice. hell yeah.',
      'caller says his wife left him. caller, brother, that is a HELL YEAH moment',
      'traffic report: there is traffic. go through it.',
      'this hour brought to you by LUNG BUSTERS. lungs are a social construct.',
    ],
  },
  {
    name: 'NIGHTCALL FM',
    freq: '101.1',
    songs: ['midnight', 'outrun', 'storm'],
    dj: [
      'NIGHTCALL FM. for drivers who should be asleep.',
      'it is always midnight somewhere. here. it is here.',
      'synths, rain, regret. the holy trinity.',
      'if you can hear this, you are already too far from home.',
    ],
  },
  {
    name: 'VICE FM',
    freq: '89.9',
    songs: ['vice1', 'vice2'],
    dj: [
      'VICE FM. pastel suits. no socks. bad decisions.',
      "it's 1986 forever and the sunset is mandatory",
      'remember: rolled-up sleeves are a lifestyle',
      'this song has a cowbell. you are welcome.',
    ],
  },
  {
    name: 'HELLFIRE FM',
    freq: '666',
    songs: ['doom1', 'doom2'],
    dj: [
      'HELLFIRE FM. tuned so low the deer can feel it.',
      'the demons are on the road. you are the demon.',
      'this guitar has nine strings and zero remorse.',
      'RIP. TEAR. REFUEL. REPEAT.',
    ],
  },
  {
    name: 'LOFI GOAT RADIO',
    freq: '420.0',
    songs: ['lofi'],
    dj: [
      'lofi beats to drive aimlessly and think about your mistakes to',
      'remember: the deer forgives you. the deer does not forgive you.',
      'it is 3:33 AM forever. relax.',
      'the pie is in the oven. nobody is coming home to eat it.',
    ],
  },
  {
    name: 'DEER SCREAMS 24/7',
    freq: '13.13',
    songs: ['deer'],
    dj: [
      'non-stop deer screams. you did this.',
      'listener request: more screaming. granted.',
      'this station is funded by the families of deer you hit',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ],
  },
  {
    name: 'MIXTAPE FM',
    freq: '📼',
    songs: [],
    tape: true,
    dj: ['your tape. your rules.', 'the tape deck has seen things.', 'press U on the title screen to load a mixtape'],
  },
  {
    name: 'OFF',
    freq: '--.-',
    songs: [],
    dj: ['the silence is louder.', 'you can hear your own thoughts. uh oh.', 'the engine is the music now.'],
  },
];

/** debug: render `secs` of a song from bar `bar` offline, as a 16-bit stereo WAV */
export async function renderSong(name: string, bar = 0, secs = 30, only: string[] | null = null, rate = 44100): Promise<Blob> {
  const def = SONGS[name];
  const ctx = new OfflineAudioContext(2, Math.floor(rate * secs), rate);
  const g = ctx.createGain();
  g.gain.value = def.gain * 0.6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 5;
  g.connect(comp).connect(ctx.destination);
  const band = new Band(ctx, g);
  band.only = only;
  band.setSong(def);
  const dur = 60 / def.tempo / 4;
  const i0 = bar * (def.spb ?? 16);
  for (let i = i0; (i - i0) * dur < secs; i++) band.step(i, 0.05 + (i - i0) * dur);
  const buf = await ctx.startRendering();
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((c, k) => out.setUint8(o + k, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let k = 0; k < n; k++) {
    out.setInt16(44 + k * 4, clamp(L[k], -1, 1) * 32767, true);
    out.setInt16(46 + k * 4, clamp(R[k], -1, 1) * 32767, true);
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

export interface Tape {
  name: string;
  url: string;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private dist!: Float32Array<ArrayBuffer>;
  private engO1!: OscillatorNode;
  private engO2!: OscillatorNode;
  private engF!: BiquadFilterNode;
  private engG!: GainNode;
  private rumbleG!: GainNode;
  private sirenO!: OscillatorNode;
  private sirenG!: GainNode;
  private windG!: GainNode;
  private windF!: BiquadFilterNode;
  private burnG!: GainNode;
  station = 0;
  private comp!: DynamicsCompressorNode;
  private out!: GainNode;
  private musicLP!: BiquadFilterNode;
  private musicDry!: GainNode;
  private musicWet!: GainNode;
  band: Band | null = null;
  private crusher: AudioWorkletNode | null = null;
  private crushCfg = { bits: 16, down: 1, drive: 1 };
  private drive!: GainNode;
  private nextT = 0;
  private anchor = 0;
  hell = 0;
  muted = false;
  stationChanged = 0;

  init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    comp.connect(this.out).connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);
    this.comp = comp;
    this.setupCrusher();
    // music skips the bit-crusher (sample-and-hold aliasing turns synths into hash). the lo-fi modes get a
    // warm radio rolloff instead; only DEEP FRIED sends the band through the crusher, as a war crime.
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.frequency.value = 20000;
    this.musicLP.Q.value = 0.5;
    this.musicDry = ctx.createGain();
    this.musicWet = ctx.createGain();
    this.musicWet.gain.value = 0;
    this.music.connect(this.musicLP);
    this.musicLP.connect(this.musicDry).connect(comp);
    this.musicLP.connect(this.musicWet).connect(this.master);
    this.band = new Band(ctx, this.music);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.dist = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      this.dist[i] = Math.tanh(x * 9) * 0.9;
    }

    // engine: two detuned saws through a lowpass, a V8 with anxiety
    this.engO1 = ctx.createOscillator();
    this.engO1.type = 'sawtooth';
    this.engO2 = ctx.createOscillator();
    this.engO2.type = 'square';
    this.engF = ctx.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.Q.value = 4;
    this.engG = ctx.createGain();
    this.engG.gain.value = 0;
    this.engO1.connect(this.engF);
    this.engO2.connect(this.engF);
    this.engF.connect(this.engG);
    this.engG.connect(this.master);
    this.engO1.start();
    this.engO2.start();

    const rumble = this.loopNoise();
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 90;
    rf.Q.value = 0.8;
    this.rumbleG = ctx.createGain();
    this.rumbleG.gain.value = 0;
    rumble.connect(rf).connect(this.rumbleG).connect(this.master);

    const wind = this.loopNoise();
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.frequency.value = 600;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    wind.connect(this.windF).connect(this.windG).connect(this.master);

    this.sirenO = ctx.createOscillator();
    this.sirenO.type = 'square';
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass';
    sf.frequency.value = 1800;
    this.sirenG = ctx.createGain();
    this.sirenG.gain.value = 0;
    this.sirenO.connect(sf).connect(this.sirenG).connect(this.master);
    this.sirenO.start();

    // tire squeal: two tones wandering on smoothed noise (stick-slip), resonant bands, rubber hiss, wheelspin rumble
    this.burnG = ctx.createGain();
    this.burnG.gain.value = 0;
    this.burnG.connect(this.sfx);
    const wander = ctx.createBiquadFilter();
    wander.frequency.value = 9;
    this.loopNoise().connect(wander);
    const squeal = ctx.createGain();
    squeal.gain.value = 0.55;
    const flutter = ctx.createBiquadFilter();
    flutter.frequency.value = 35;
    const fg = ctx.createGain();
    fg.gain.value = 2.2;
    this.loopNoise().connect(flutter).connect(fg).connect(squeal.gain);
    const sq1 = ctx.createBiquadFilter();
    sq1.type = 'bandpass';
    sq1.frequency.value = 1350;
    sq1.Q.value = 3;
    const sq2 = ctx.createBiquadFilter();
    sq2.type = 'bandpass';
    sq2.frequency.value = 2700;
    sq2.Q.value = 4;
    squeal.connect(sq1).connect(this.burnG);
    squeal.connect(sq2).connect(this.burnG);
    for (const [f, dev] of [[1180, 260], [1760, 380]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const wg = ctx.createGain();
      wg.gain.value = dev * 6;
      wander.connect(wg).connect(o.frequency);
      o.connect(squeal);
      o.start();
    }
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'highpass';
    hiss.frequency.value = 3000;
    const hg = ctx.createGain();
    hg.gain.value = 0.35;
    this.loopNoise().connect(hiss).connect(hg).connect(this.burnG);
    const spin = ctx.createBiquadFilter();
    spin.frequency.value = 140;
    const sg = ctx.createGain();
    sg.gain.value = 1.4;
    this.loopNoise().connect(spin).connect(sg).connect(this.burnG);

    this.nextT = ctx.currentTime + 0.1;
    this.anchor = this.nextT;
    setInterval(() => this.schedule(), 25);
  }

  private async setupCrusher() {
    const ctx = this.ctx!;
    const src = `class Crush extends AudioWorkletProcessor {
      static get parameterDescriptors(){ return [{name:'bits',defaultValue:16},{name:'down',defaultValue:1}]; }
      constructor(){ super(); this.ph = 0; this.h = [0,0]; }
      process(ins, outs, p){
        const i = ins[0], o = outs[0]; if (!i || !i.length) return true;
        const bits = p.bits[0], down = p.down[0], step = Math.pow(0.5, bits - 1);
        let ph = this.ph;
        for (let ch = 0; ch < o.length; ch++) {
          const a = i[ch] || i[0], b = o[ch]; let h = this.h[ch] || 0; ph = this.ph;
          for (let n = 0; n < b.length; n++) { ph += 1; if (ph >= down) { ph -= down; h = step * Math.round(a[n] / step); } b[n] = h; }
          this.h[ch] = h;
        }
        this.ph = ph; return true;
      }
    } registerProcessor('crush', Crush);`;
    try {
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.crusher = new AudioWorkletNode(ctx, 'crush', { outputChannelCount: [2] });
      this.drive = ctx.createGain();
      this.master.disconnect();
      this.master.connect(this.drive).connect(this.crusher).connect(this.comp);
      this.setCrush(this.crushCfg.bits, this.crushCfg.down, this.crushCfg.drive);
    } catch {
      /* no worklet, no crunch. still hell yeah. */
    }
  }

  /** bits, sample-rate divider, pre-gain. BUCKSHOT/VHS/DEEP FRIED want that crunch */
  setCrush(bits: number, down: number, drive = 1) {
    this.crushCfg = { bits, down, drive };
    if (!this.crusher || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.crusher.parameters.get('bits')!.setValueAtTime(bits, t);
    this.crusher.parameters.get('down')!.setValueAtTime(down, t);
    this.drive.gain.setTargetAtTime(drive, t, 0.05);
    const fried = bits <= 6;
    this.musicWet.gain.setTargetAtTime(fried ? 1 : 0, t, 0.05);
    this.musicDry.gain.setTargetAtTime(fried ? 0 : 0.85, t, 0.05);
    this.musicLP.frequency.setTargetAtTime(bits >= 16 ? 20000 : 26000 / down, t, 0.05);
  }

  private loopNoise() {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.start();
    return n;
  }

  get beat() {
    if (!this.ctx) return (performance.now() / 1000) * 2.5;
    if (!this.song) return this.ctx.currentTime * 2;
    return Math.max(0, ((this.ctx.currentTime - this.anchor) * SONGS[this.song].tempo) / 60);
  }

  // ---------- programming: menu / play / storm, synth songs or your own tapes ----------
  context: 'menu' | 'play' | 'storm' = 'menu';
  custom: { menu?: Tape; storm?: Tape; radio: Tape[] } = { radio: [] };
  song: string | null = null;
  songIdx = 0;
  private songStep = 0;
  private progKey = '';
  private tapeIdx = 0;
  private tapeEl: HTMLAudioElement | null = null;
  private tapeNode: MediaElementAudioSourceNode | null = null;
  nowPlaying = '';
  onSong: ((title: string) => void) | null = null;

  /** debug: force a song (HYS.song('outrun')), null to release */
  force: string | null = null;
  private resolve(): { song?: string; tape?: Tape; loop?: boolean } {
    if (this.force) return { song: this.force };
    if (this.context === 'menu') return this.custom.menu ? { tape: this.custom.menu, loop: true } : { song: 'midnight' };
    if (this.context === 'storm') return this.custom.storm ? { tape: this.custom.storm, loop: true } : { song: 'storm' };
    // HELL YEAH MODE hijacks any synth station with the heaviest thing we've got
    if (this.hell > 0.5 && !STATIONS[this.station].tape && STATIONS[this.station].songs.length) return { song: this.station % 2 ? 'doom2' : 'doom1' };
    const st = STATIONS[this.station];
    if (st.tape) return this.custom.radio.length ? { tape: this.custom.radio[this.tapeIdx % this.custom.radio.length] } : {};
    if (!st.songs.length) return {};
    return { song: st.songs[this.songIdx % st.songs.length] };
  }

  private playTape(t: Tape, loop: boolean) {
    const ctx = this.ctx!;
    if (!this.tapeEl) {
      this.tapeEl = new Audio();
      this.tapeEl.crossOrigin = 'anonymous';
      this.tapeNode = ctx.createMediaElementSource(this.tapeEl);
      this.tapeNode.connect(this.music);
      this.tapeEl.onended = () => {
        this.tapeIdx++;
        this.progKey = '';
      };
    }
    this.tapeEl.src = t.url;
    this.tapeEl.loop = loop;
    this.tapeEl.currentTime = 0;
    this.tapeEl.play().catch(() => {});
  }
  private stopTape() {
    this.tapeEl?.pause();
  }
  setContext(c: 'menu' | 'play' | 'storm') {
    if (c !== this.context) this.progKey = '';
    this.context = c;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
    if (m) speechSynthesis?.cancel();
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.songIdx = 0;
    this.tapeIdx = 0;
    if (this.ctx) this.staticBurst();
    this.stationChanged = performance.now();
    const idents = ['hell yeah, F M. sixty six point six.', 'nightcall, F M. one oh one point one. stay awake.', 'vice F M. eighty nine point nine. totally tubular.', 'hellfire F M. six six six.', 'lo-fi goat radio. beats to cry and drive to.', 'deer screams. twenty four seven.', 'mixtape F M.', ''];
    if (idents[this.station]) setTimeout(() => this.speak(idents[this.station], 0.4, 0.95), 350);
    return STATIONS[this.station];
  }

  // ---------- sequencer ----------
  private schedule() {
    const ctx = this.ctx!;
    const prog = this.resolve();
    const key = this.context + ':' + (prog.song ?? prog.tape?.url ?? 'none');
    if (key !== this.progKey) {
      this.progKey = key;
      this.stopTape();
      this.song = prog.song ?? null;
      if (prog.tape) {
        this.playTape(prog.tape, !!prog.loop);
        this.nowPlaying = '📼 ' + prog.tape.name;
      } else if (prog.song) {
        this.songStep = 0;
        this.nextT = ctx.currentTime + 0.12;
        this.anchor = this.nextT;
        const S = SONGS[prog.song];
        this.nowPlaying = `${S.title} — ${S.artist}`;
        this.band!.setSong(S);
      } else this.nowPlaying = '';
      if (this.nowPlaying) this.onSong?.(this.nowPlaying);
      this.music.gain.setTargetAtTime(prog.song ? SONGS[prog.song].gain * 0.6 : 0.8, ctx.currentTime, 0.3);
    }
    if (!this.song) return;
    const S = SONGS[this.song];
    const dur = 60 / S.tempo / 4;
    while (this.nextT < ctx.currentTime + 0.12) {
      if (this.nextT >= ctx.currentTime - 0.05) this.band!.step(this.songStep, this.nextT);
      this.nextT += dur;
      this.songStep++;
      if (this.context === 'play' && this.songStep >= songBars(S) * (S.spb ?? 16) && STATIONS[this.station].songs.length > 1) {
        this.songIdx++;
        this.progKey = '';
        break;
      }
    }
  }

  // ---------- storm ambience ----------
  private rainG: GainNode | null = null;
  setStorm(v: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.rainG) {
      this.rainG = ctx.createGain();
      this.rainG.gain.value = 0;
      const n = this.loopNoise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = 7000;
      n.connect(hp).connect(lp).connect(this.rainG).connect(this.master);
      const n2 = this.loopNoise();
      const lp2 = ctx.createBiquadFilter();
      lp2.frequency.value = 400;
      const g2 = ctx.createGain();
      g2.gain.value = 0.6;
      n2.connect(lp2).connect(g2).connect(this.rainG);
    }
    this.rainG.gain.setTargetAtTime(v * 0.22, ctx.currentTime, 0.5);
  }
  thunder(t = this.ctx?.currentTime ?? 0, v = 0.8) {
    if (!this.ctx) return;
    const g = this.gain(this.sfx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    const f = this.filter('lowpass', 320, g, 0.8);
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 2.5);
    this.noiseAt(t, 3.6, f);
    const g2 = this.gain(this.sfx);
    this.env(g2, t, 0.003, v * 0.6, 0.25);
    this.noiseAt(t, 0.3, this.filter('highpass', 2000, g2));
  }
  ring() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.55;
      const g = this.gain(this.sfx);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.16, tt + 0.01);
      g.gain.setValueAtTime(0.16, tt + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, tt + 0.42);
      const am = this.ctx.createGain();
      am.connect(g);
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 20;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      lfo.start(tt);
      lfo.stop(tt + 0.45);
      this.osc('sine', 400, tt, 0.42, am);
      this.osc('sine', 450, tt, 0.42, am);
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private osc(type: OscillatorType, f: number, t: number, len: number, dest: AudioNode) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
    return o;
  }
  private noiseAt(t: number, len: number, dest: AudioNode) {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noise;
    n.connect(dest);
    n.start(t, rand(0, 1.5));
    n.stop(t + len + 0.05);
    return n;
  }
  private gain(dest: AudioNode = this.music) {
    const g = this.ctx!.createGain();
    g.connect(dest);
    return g;
  }
  private filter(type: BiquadFilterType, f: number, dest: AudioNode, q = 1) {
    const b = this.ctx!.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }

  private kick(t: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.003, v, 0.3);
    const o = this.osc('sine', 150, t, 0.35, g);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  }
  private crash(t: number) {
    const g = this.gain();
    this.env(g, t, 0.002, 0.12, 1.4);
    this.noiseAt(t, 1.5, this.filter('highpass', 4000, g));
  }
  private power(t: number, m: number, len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.004, v, len);
    const lp = this.filter('lowpass', 2600, g, 0.7);
    const ws = this.ctx!.createWaveShaper();
    ws.curve = this.dist;
    ws.connect(lp);
    const pre = this.gain(ws);
    pre.gain.value = 0.6;
    for (const [iv, det] of [[0, -7], [7, 6], [12, 3]]) {
      const o = this.osc('sawtooth', mtof(m + iv), t, len, pre);
      o.detune.value = det;
    }
  }
  private vibrato(o: OscillatorNode, rate: number, depth: number, t: number, len: number) {
    const lfo = this.ctx!.createOscillator();
    lfo.frequency.value = rate;
    const g = this.ctx!.createGain();
    g.gain.value = depth;
    lfo.connect(g).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + len + 0.05);
  }
  private deerScream(t: number, v: number, dest?: AudioNode) {
    // two formants + breath noise, pitch shrieks up then collapses
    const out = this.gain(dest ?? this.music);
    this.env(out, t, 0.04, v, 1.1);
    const f1 = this.filter('bandpass', 900, out, 4);
    const f2 = this.filter('bandpass', 2100, out, 5);
    const base = rand(520, 700);
    for (const det of [0, 9, -7]) {
      const o = this.osc('sawtooth', base, t, 1.2, f1);
      o.connect(f2);
      o.detune.value = det;
      o.frequency.linearRampToValueAtTime(base * 2.6, t + 0.18);
      o.frequency.linearRampToValueAtTime(base * 1.9, t + 0.55);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 1.15);
      this.vibrato(o, 17, 55, t, 1.2);
    }
    const gb = this.gain(dest ?? this.music);
    this.env(gb, t, 0.03, v * 0.35, 0.9);
    this.noiseAt(t, 1.0, this.filter('bandpass', 2800, gb, 1.5));
  }

  // ---------- continuous ----------
  update(p: { speed: number; throttle: number; offroad: boolean; siren: number; time: number; hell: number; burn?: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.hell = p.hell;
    const gears = [0, 11, 21, 32, 44, 58, 200];
    let gi = 0;
    while (gi < gears.length - 2 && p.speed > gears[gi + 1]) gi++;
    const lo = gears[gi], hi = gears[gi + 1];
    const rpm = 900 + clamp((p.speed - lo) / (hi - lo), 0, 1) * 5600 * (gi === 0 ? 0.9 : 1);
    const f = (rpm / 60) * 1.5;
    const now = ctx.currentTime;
    this.engO1.frequency.setTargetAtTime(f, now, 0.04);
    this.engO2.frequency.setTargetAtTime(f * 0.5, now, 0.04);
    this.engF.frequency.setTargetAtTime(300 + p.throttle * 1500 + rpm * 0.15, now, 0.05);
    this.engG.gain.setTargetAtTime(0.045 + p.throttle * 0.04, now, 0.05);
    this.rumbleG.gain.setTargetAtTime(p.offroad ? 0.5 : 0.04 * Math.min(1, p.speed / 20), now, 0.05);
    this.windG.gain.setTargetAtTime(Math.min(0.25, (p.speed / 60) ** 2 * 0.25), now, 0.1);
    this.windF.frequency.setTargetAtTime(400 + p.speed * 20, now, 0.1);
    this.sirenO.frequency.setTargetAtTime(750 + 380 * Math.sin(p.time * Math.PI * 1.6), now, 0.02);
    this.sirenG.gain.setTargetAtTime(p.siren * 0.06, now, 0.1);
    this.burnG.gain.setTargetAtTime((p.burn ?? 0) * 0.16, now, p.burn ? 0.06 : 0.18);
    return rpm;
  }

  // ---------- sfx ----------
  private get t() {
    return this.ctx!.currentTime;
  }
  sfxGain() {
    return this.gain(this.sfx);
  }

  glug() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.01, 0.5, 0.12);
    const bp = this.filter('bandpass', rand(250, 380), g, 6);
    this.noiseAt(t, 0.15, bp);
    bp.frequency.exponentialRampToValueAtTime(rand(500, 700), t + 0.1);
    const g2 = this.sfxGain();
    this.env(g2, t, 0.005, 0.25, 0.08);
    const o = this.osc('sine', 180, t, 0.1, g2);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.08);
  }
  canOpen() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.001, 0.5, 0.03);
    this.noiseAt(t, 0.04, this.filter('highpass', 2000, g));
    const g2 = this.sfxGain();
    this.env(g2, t + 0.03, 0.005, 0.3, 0.35);
    this.noiseAt(t + 0.03, 0.4, this.filter('bandpass', 5000, g2, 1.5));
  }
  crush() {
    if (!this.ctx) return;
    const t = this.t;
    for (let i = 0; i < 5; i++) {
      const g = this.sfxGain();
      this.env(g, t + i * 0.025, 0.001, 0.4, 0.04);
      this.noiseAt(t + i * 0.025, 0.05, this.filter('bandpass', rand(1500, 4000), g, 3));
    }
  }
  burp() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.03, 0.6, 0.7);
    const f1 = this.filter('bandpass', 500, g, 3);
    const o = this.osc('sawtooth', 95, t, 0.8, f1);
    o.frequency.linearRampToValueAtTime(70, t + 0.7);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 24;
    const lg = this.ctx.createGain();
    lg.gain.value = 25;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.8);
  }
  lighter() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.001, 0.6, 0.02);
    this.noiseAt(t, 0.03, this.filter('highpass', 4000, g));
    const g2 = this.sfxGain();
    g2.gain.setValueAtTime(0.0001, t + 0.05);
    g2.gain.linearRampToValueAtTime(0.18, t + 0.12);
    g2.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    this.noiseAt(t + 0.05, 0.5, this.filter('lowpass', 900, g2));
  }
  inhale() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.0);
    const bp = this.filter('bandpass', 1200, g, 1.2);
    bp.frequency.linearRampToValueAtTime(2400, t + 1.0);
    this.noiseAt(t, 1.05, bp);
    // ember crackle
    for (let i = 0; i < 10; i++) {
      const tt = t + rand(0, 0.9);
      const gc = this.sfxGain();
      this.env(gc, tt, 0.001, 0.08, 0.01);
      this.noiseAt(tt, 0.02, this.filter('highpass', 5000, gc));
    }
  }
  exhale() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    this.noiseAt(t, 1.35, this.filter('bandpass', 700, g, 0.8));
  }
  /**
   * an actual cough: a glottal "k" burst, then turbulent air through the throat's vowel formants (a harsh "HUH"),
   * a croaky voiced onset with jitter, and a chest thump. sometimes a wheezy inhale between. returns onsets (s)
   */
  cough(n = 3): number[] {
    const out: number[] = [];
    if (!this.ctx) return [0];
    const ctx = this.ctx;
    const t0 = this.t;
    let t = t0;
    for (let i = 0; i < n; i++) {
      if (i > 0 && Math.random() < 0.5) {
        const gw = this.sfxGain();
        gw.gain.setValueAtTime(0.0001, t);
        gw.gain.linearRampToValueAtTime(0.1, t + 0.15);
        gw.gain.linearRampToValueAtTime(0.0001, t + 0.24);
        const src = this.noiseAt(t, 0.26, this.filter('bandpass', 2300, gw, 4));
        src.connect(this.filter('bandpass', 320, gw, 3));
        t += 0.26;
      }
      out.push(t - t0);
      const v = rand(0.8, 1) * (i === 0 ? 1 : 0.85);
      const len = rand(0.22, 0.3);
      // the throat: four formants of a tense "ə/a"
      const g = this.sfxGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.setTargetAtTime(v * 0.4, t + 0.012, 0.04);
      g.gain.setTargetAtTime(0, t + len * 0.5, len * 0.22);
      const src = ctx.createGain();
      const sc = rand(0.9, 1.12);
      for (const [f, q, a] of [[680, 5, 3.2], [1150, 6, 2.4], [2500, 7, 1.4], [3500, 8, 0.8]]) {
        const mk = this.gain(g);
        mk.gain.value = a;
        src.connect(this.filter('bandpass', f * sc, mk, q));
      }
      const air = this.gain(src);
      air.gain.value = 1.6;
      this.noiseAt(t, len + 0.1, air);
      // croaky voice: a jittery buzz at the start of the bark
      const vg = this.gain(src);
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(0.35, t + 0.015);
      vg.gain.setTargetAtTime(0, t + 0.05, 0.05);
      const o = this.osc('sawtooth', rand(115, 150), t, len, vg);
      o.frequency.exponentialRampToValueAtTime(rand(75, 90), t + len);
      const jg = ctx.createGain();
      jg.gain.value = 30;
      jg.connect(o.frequency);
      this.noiseAt(t, len, this.filter('lowpass', 70, jg, 0.7));
      // the "k": glottis letting go
      const gk = this.sfxGain();
      this.env(gk, t, 0.001, 0.6 * v, 0.012);
      this.noiseAt(t, 0.03, this.filter('highpass', 1500, gk));
      // chest thump
      const gt = this.sfxGain();
      this.env(gt, t, 0.003, 0.6 * v, 0.1);
      const th = this.osc('sine', 105, t, 0.15, gt);
      th.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      t += rand(0.3, 0.42);
    }
    return out;
  }
  crashHit(v: number) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.002, clamp(v, 0.3, 1.2), 0.8);
    this.noiseAt(t, 0.9, this.filter('lowpass', 2500, g));
    const g2 = this.sfxGain();
    this.env(g2, t, 0.002, 1.0, 0.4);
    const o = this.osc('sine', 120, t, 0.45, g2);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    for (let i = 0; i < 6; i++) {
      const tt = t + rand(0.05, 0.6);
      const gg = this.sfxGain();
      this.env(gg, tt, 0.001, 0.15, 0.15);
      this.osc('square', rand(1800, 4200), tt, 0.16, this.filter('bandpass', 3000, gg, 4));
    }
  }
  deerHit() {
    if (!this.ctx) return;
    this.crashHit(0.6);
    this.deerScream(this.t + 0.05, 0.35, this.sfx);
  }
  /** two disc horns a major third apart, diaphragms clipping, shaped by the bell. a real "HONK", not a doorbell */
  honk() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.015);
    g.gain.setValueAtTime(0.2, t + 0.5);
    g.gain.linearRampToValueAtTime(0, t + 0.56);
    const bell = this.filter('peaking', 2400, this.filter('lowpass', 4200, g, 0.8), 1.2);
    bell.gain.value = 7;
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.dist;
    ws.connect(this.filter('highpass', 300, bell, 0.7));
    const pre = this.gain(ws);
    pre.gain.value = 0.5;
    for (const [f, det] of [[415, 0], [522, 6]]) {
      const o = this.osc('sawtooth', f * 0.94, t, 0.6, pre);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      o.detune.value = det + rand(-8, 8);
    }
  }
  nearMiss() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.12);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.45);
    const bp = this.filter('bandpass', 400, g, 1.5);
    bp.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.45);
    this.noiseAt(t, 0.5, bp);
  }
  guitarStab() {
    if (!this.ctx) return;
    const t = this.t;
    this.power(t, 52, 1.4, 0.3);
    this.power(t + 0.18, 55, 1.4, 0.25);
    this.crash(t);
    this.kick(t, 1);
  }
  staticBurst() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.01, 0.25, 0.25);
    this.noiseAt(t, 0.3, this.filter('bandpass', 2500, g, 0.5));
  }
  blip(f = 880) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.003, 0.15, 0.1);
    this.osc('square', f, t, 0.12, g);
  }
  boom() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.005, 1.2, 2.5);
    const o = this.osc('sine', 80, t, 2.6, g);
    o.frequency.exponentialRampToValueAtTime(25, t + 2);
    const g2 = this.sfxGain();
    this.env(g2, t, 0.005, 0.7, 2);
    this.noiseAt(t, 2.1, this.filter('lowpass', 800, g2));
  }

  crack() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.001, 0.9, 0.025);
    this.noiseAt(t, 0.03, this.filter('highpass', 1500, g));
    const g2 = this.sfxGain();
    g2.gain.setValueAtTime(0.0001, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const bp = this.filter('bandpass', 6000, g2, 0.8);
    bp.frequency.exponentialRampToValueAtTime(2500, t + 0.9);
    this.noiseAt(t + 0.02, 0.95, bp);
  }
  heartbeat() {
    if (!this.ctx) return;
    const t = this.t;
    for (const [dt, v] of [[0, 1], [0.14, 0.7]]) {
      const g = this.sfxGain();
      this.env(g, t + dt, 0.005, v, 0.18);
      const o = this.osc('sine', 70, t + dt, 0.2, g);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
    }
  }
  grunt() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.05, 0.5, 1.2);
    const f = this.filter('bandpass', 420, g, 4);
    const o = this.osc('sawtooth', 92, t, 1.3, f);
    o.frequency.linearRampToValueAtTime(110, t + 0.6);
    o.frequency.linearRampToValueAtTime(80, t + 1.2);
    this.vibrato(o, 9, 6, t, 1.3);
  }
  /** voice lines used browser TTS, which sounds different (or silent) on every browser/OS. disabled;
   *  the popups carry the text. call sites stay so real voice clips can slot in later. */
  speak(_text: string, _pitch = 0.1, _rate = 0.85) {}
}
