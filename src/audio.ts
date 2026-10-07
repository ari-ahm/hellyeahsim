// Every sound in this game is synthesized live. No samples. Just math and poor decisions.
import { pick, rand, clamp } from './util';

export interface Station {
  name: string;
  freq: string;
  songs: string[];
  tape?: boolean;
  dj: string[];
}

/** every song here is an original composition. no lawyers were summoned. */
export const SONGS: Record<string, { title: string; artist: string; tempo: number; bars: number; gain: number; verb: number }> = {
  hellyeah: { title: 'HELL YEAH (EXTENDED)', artist: 'THE FOREARMS', tempo: 152, bars: 32, gain: 0.5, verb: 0.18 },
  midnight: { title: 'MIDNIGHT CALL', artist: 'NIGHT DRIVER', tempo: 96, bars: 32, gain: 0.85, verb: 0.45 },
  outrun: { title: 'NEON OVERDRIVE', artist: 'LASER WOLF 1986', tempo: 118, bars: 32, gain: 0.7, verb: 0.3 },
  storm: { title: 'KILLER WEATHER', artist: 'THE LIZARD KINGS OF HIGHWAY 666', tempo: 86, bars: 32, gain: 0.85, verb: 0.5 },
  vice1: { title: 'PASTEL SUITS', artist: 'SUNBURN & THE TAN LINES', tempo: 112, bars: 32, gain: 0.75, verb: 0.4 },
  vice2: { title: 'OCEAN AVENUE', artist: 'MALIBU COWBELL ORCHESTRA', tempo: 104, bars: 32, gain: 0.75, verb: 0.3 },
  doom1: { title: 'GUTS ON THE GRILLE', artist: 'SLAYER OF DEER (MIDNIGHT MIX)', tempo: 135, bars: 32, gain: 0.55, verb: 0.15 },
  doom2: { title: 'THEY FEAR THE FOREARM', artist: 'INFERNAL CHASSIS', tempo: 166, bars: 32, gain: 0.55, verb: 0.12 },
  lofi: { title: 'BEATS TO CRY & DRIVE TO', artist: 'LOFI GOAT', tempo: 78, bars: 64, gain: 0.95, verb: 0.35 },
  deer: { title: 'ETERNAL BLEAT', artist: 'THE DEER YOU HIT', tempo: 70, bars: 64, gain: 0.85, verb: 0.6 },
};

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
  station = 0;
  step = 0;
  private comp!: DynamicsCompressorNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private nextScream = 0;
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
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);
    this.comp = comp;
    this.setupCrusher();
    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);
    // generated hall reverb so the radio sounds like a real place (a bad place)
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.25;
    this.music.connect(this.verbSend).connect(this.verb).connect(this.master);
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

  private resolve(): { song?: string; tape?: Tape; loop?: boolean } {
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
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
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
      } else this.nowPlaying = '';
      if (this.nowPlaying) this.onSong?.(this.nowPlaying);
      const g = prog.song ? SONGS[prog.song] : { gain: 0.8, verb: 0.05 };
      this.music.gain.setTargetAtTime(g.gain, ctx.currentTime, 0.3);
      this.verbSend.gain.setTargetAtTime(g.verb, ctx.currentTime, 0.3);
    }
    if (!this.song) return;
    const S = SONGS[this.song];
    const dur = 60 / S.tempo / 4;
    while (this.nextT < ctx.currentTime + 0.12) {
      if (this.nextT >= ctx.currentTime - 0.05) this.playStep(this.song, this.songStep, this.nextT, dur);
      this.nextT += dur;
      this.songStep++;
      this.step++;
      if (this.context === 'play' && this.songStep >= S.bars * 16 && STATIONS[this.station].songs.length > 1) {
        this.songIdx++;
        this.progKey = '';
        break;
      }
    }
  }

  private playStep(song: string, i: number, t: number, dur: number) {
    const st = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const bar16 = Math.floor(i / 16) % 16;
    if (song === 'midnight') return this.songMidnight(st, bar16, t, dur);
    if (song === 'outrun') return this.songOutrun(st, bar16, t, dur);
    if (song === 'storm') return this.songStorm(st, bar16, t, dur);
    if (song === 'vice1') return this.songVice1(st, bar16, t, dur);
    if (song === 'vice2') return this.songVice2(st, bar16, t, dur);
    if (song === 'doom1') return this.songDoom1(i, st, bar16, t, dur);
    if (song === 'doom2') return this.songDoom2(i, st, bar16, t, dur);
    if (song === 'hellyeah') {
      const roots = [40, 40, 36, 38];
      const r = roots[bar];
      const hell = this.hell > 0.5;
      if ([0, 3, 8, 11].includes(st) || (hell && st % 2 === 0)) this.kick(t, 0.9);
      if (st === 4 || st === 12 || (bar === 3 && st >= 13)) this.snare(t, bar === 3 && st >= 13 ? 0.35 : 0.5);
      if (st % 2 === 0) this.hat(t, st % 4 === 2 ? 0.07 : 0.04);
      if (st === 0 && bar === 0) this.crash(t);
      const chug = [0, 2, 3, 6, 8, 10, 11, 14];
      if (chug.includes(st)) {
        const accent = st === 0 || st === 8;
        this.power(t, r + 12, accent ? dur * 3.5 : dur * 0.9, accent ? 0.2 : 0.14);
        this.bass(t, r, dur * 1.5, 0.22);
      }
      if (hell && st % 2 === 0) this.lead(t, pick([64, 67, 69, 71, 74, 76, 79]), dur * 1.8);
    } else if (song === 'lofi') {
      // LOFI GOAT RADIO: dusty boom-bap, rhodes, a bass that has seen things
      const swing = st % 2 === 1 ? dur * 0.38 : 0;
      const tt = t + swing;
      const chords = [[53, 57, 60, 64, 67], [52, 55, 59, 62, 66], [50, 53, 57, 60, 64], [48, 52, 55, 59, 62]];
      const roots = [41, 40, 38, 36];
      const ch = chords[bar];
      if (st === 0) this.rhodes(tt, ch, dur * 9, 0.11);
      if (st === 10) this.rhodes(tt, ch.slice(1, 4).map((m) => m + 12), dur * 5, 0.06);
      if (st === 0 || st === 7 || st === 10) this.kick(tt, st === 7 ? 0.45 : 0.85);
      if (st === 4 || st === 12) this.snare(tt, 0.42, 1100);
      if (st === 15 && Math.random() < 0.5) this.snare(tt, 0.12, 1100);
      if (st % 2 === 0) this.hat(tt, st % 4 === 2 ? 0.07 : 0.045);
      if (st === 0) this.lofiBass(tt, roots[bar], dur * 6, 0.32);
      if (st === 10) this.lofiBass(tt, roots[bar] + 7, dur * 3, 0.22);
      if (st === 14 && Math.random() < 0.6) this.lofiBass(tt, roots[bar] + 12, dur * 1.5, 0.16);
      if (Math.random() < 0.22) this.pluck(tt, pick([72, 74, 76, 79, 81]), 0.07);
      this.crackle(t);
      if (Math.random() < 0.5) this.crackle(t + dur * 0.5);
      if (st === 0) this.hiss(t, dur * 16);
    } else if (song === 'deer') {
      // DEER SCREAMS 24/7: funeral doom for every deer you've ever hit
      if (st === 0) {
        this.power(t, 28, dur * 15, 0.13);
        this.pad(t, [40, 41, 47], dur * 16, 0.07);
      }
      if (st === 0 || st === 6 || st === 10) this.kick(t, 1.0);
      if (st === 8) this.snare(t, 0.5);
      if (st % 4 === 2) this.hat(t, 0.05);
      if (this.step >= this.nextScream) {
        this.nextScream = this.step + Math.floor(rand(5, 12));
        if (Math.random() < 0.3) this.bleat(t, 0.4);
        else this.deerScream(t, 0.45);
        if (Math.random() < 0.35) this.deerScream(t + rand(0.1, 0.4), 0.3);
      }
    }
  }

  // ================= original songs =================
  /** MIDNIGHT CALL — Night Driver. 96bpm, A minor. lonely, wet asphalt, a phone that won't ring. */
  private songMidnight(st: number, bar: number, t: number, dur: number) {
    const prog = [[57, 60, 64], [53, 57, 60, 64], [50, 53, 57], [52, 56, 59]];
    const roots = [33, 29, 26, 28];
    const c = Math.floor(bar / 2) % 4;
    const intro = bar < 2;
    if (!intro && st % 4 === 0) this.kick(t, 0.85);
    if (!intro && (st === 4 || st === 12)) this.gatedSnare(t, 0.5);
    if (st % 2 === 1 && bar >= 4) this.hat(t, 0.04);
    if (st % 2 === 0 && !intro) this.synthBass(t, roots[c] + 12 + (st % 4 === 2 ? 12 : 0), dur * 1.7, 0.24);
    if (st === 0 && bar % 2 === 0) this.darkPad(t, prog[c], dur * 32, 0.07);
    if (st === 0 && bar % 2 === 0 && bar >= 6) this.choir(t, prog[c].map((m) => m + 12), dur * 32, 0.045);
    const MEL = [76, 0, 0, 0, 74, 0, 72, 0, 69, 0, 0, 0, 0, 0, 67, 69, 72, 0, 0, 0, 71, 0, 69, 0, 64, 0, 0, 0, 0, 0, 0, 0];
    const MEL2 = [69, 0, 72, 0, 76, 0, 0, 0, 77, 0, 76, 0, 74, 0, 0, 0, 72, 0, 0, 0, 74, 0, 71, 0, 68, 0, 0, 0, 0, 0, 0, 0];
    if (bar >= 8 && bar < 24) {
      const m = (bar >= 16 ? MEL2 : MEL)[(bar % 2) * 16 + st];
      if (m) this.synLead(t, m, dur * 3.2, 0.075);
    }
    if (bar >= 20) this.arp(t, prog[c][st % prog[c].length] + 24, dur * 0.8, 0.028);
    if (st === 0 && bar % 8 === 0) this.crash(t);
  }

  /** NEON OVERDRIVE — Laser Wolf 1986. 118bpm, D minor, 16th-note arps at illegal speeds. */
  private songOutrun(st: number, bar: number, t: number, dur: number) {
    const prog = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 60, 64]];
    const roots = [38, 34, 36, 33];
    const c = bar % 4;
    if (st % 4 === 0) this.kick(t, 0.95);
    if (st === 4 || st === 12) this.gatedSnare(t, 0.55);
    this.hat(t, st % 2 ? 0.025 : 0.05);
    this.synthBass(t, roots[c] + (st % 2 ? 24 : 12), dur * 0.85, 0.2);
    if (bar >= 2) this.arp(t, prog[c][st % 3] + (st % 6 < 3 ? 12 : 24), dur * 0.7, 0.032);
    if (st === 0) this.darkPad(t, prog[c], dur * 16, 0.05);
    if (bar >= 8 && bar < 16 || bar >= 20) {
      const L = [[74, 77], [74, 70], [72, 76], [69, 72]][c];
      if (st === 0) this.synLead(t, L[0] + 12, dur * 7.5, 0.07);
      if (st === 8) this.synLead(t, L[1] + 12, dur * 7.5, 0.07);
    }
    if (st === 0 && bar % 4 === 0) this.crash(t);
  }

  /** KILLER WEATHER — The Lizard Kings of Highway 666. 86bpm, E dorian, rain on the electric piano. */
  private songStorm(st: number, bar: number, t: number, dur: number) {
    const sw = st % 2 === 1 ? dur * 0.3 : 0;
    const tt = t + sw;
    const form = [0, 0, 5, 5, 0, 0, 5, 5, -4, -4, -5, -5, 0, 0, 5, 5];
    const chordsBy: Record<number, number[]> = { 0: [52, 55, 59, 62], 5: [57, 61, 64, 67], [-4]: [48, 52, 55, 59], [-5]: [47, 51, 54, 57] };
    const tr = form[bar % 16];
    const riff: Record<number, number> = { 0: 40, 3: 40, 6: 35, 7: 38, 8: 40, 11: 43, 12: 45, 14: 43 };
    if (riff[st] !== undefined) this.synthBass(tt, riff[st] + tr, dur * 1.4, 0.26, 700);
    if (st === 0) this.rhodes(tt, chordsBy[tr], dur * 10, 0.1);
    if (st === 10) this.rhodes(tt, chordsBy[tr].slice(1).map((m) => m + 12), dur * 4, 0.055);
    if (st === 0 || st === 7 || st === 10) this.kick(tt, 0.7);
    if (st === 4 || st === 12) this.brush(tt, 0.4);
    if (st % 2 === 0) this.ride(tt, st === 14 ? 0.09 : 0.05);
    const lick = tr === -5 ? [78, 75, 71, 69, 66, 64, 63, 59] : [79, 76, 74, 71, 69, 67, 64, 62];
    if ((bar % 8 >= 4) && st >= 8) this.organ(tt, lick[st - 8] + (tr === 5 ? 5 : 0), dur * 0.95, 0.05);
    if ((bar % 8 < 4) && bar >= 4 && st === 0) this.organ(tt, 64 + tr, dur * 14, 0.035);
    if (st === 0 && bar % 8 === 3 && Math.random() < 0.7) this.thunder(t + rand(0, 1), 0.5);
  }

  /** PASTEL SUITS — Sunburn & The Tan Lines. 112bpm, C major, gated drums, FM piano, regret-free. */
  private songVice1(st: number, bar: number, t: number, dur: number) {
    const prog = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
    const roots = [36, 33, 29, 31];
    const c = bar % 4;
    if (st === 0 || st === 8 || (st === 6 && bar % 2)) this.kick(t, 0.9);
    if (st === 4 || st === 12) { this.gatedSnare(t, 0.6); this.clap(t, 0.25); }
    if (st % 2 === 0) this.hat(t, st % 4 === 2 ? 0.07 : 0.035);
    if ([0, 3, 6, 10].includes(st)) this.fmKeys(t, prog[c], dur * (st === 0 ? 3 : 2), 0.05);
    if ([0, 3, 6, 8, 10, 13, 14].includes(st)) this.slap(t, roots[c] + (st === 6 || st === 14 ? 24 : 12), dur * 0.9, 0.26);
    if (bar >= 8 && (st === 2 || st === 10)) this.cowbell(t, 0.07);
    if (bar >= 8 && bar < 24) {
      const MEL = [76, 0, 79, 0, 81, 0, 79, 76, 74, 0, 72, 0, 74, 0, 76, 0];
      const m = MEL[st];
      if (m && bar % 2 === 0) this.fmBell(t, m + (c === 2 ? -3 : 0), dur * 2, 0.05);
    }
    if (st === 0 && bar % 4 === 0) this.crash(t);
  }

  /** OCEAN AVENUE — Malibu Cowbell Orchestra. 104bpm, E minor funk, congas, a guitar that owns a yacht. */
  private songVice2(st: number, bar: number, t: number, dur: number) {
    const minor = Math.floor(bar / 2) % 2 === 0;
    const root = minor ? 40 : 45;
    const ch = minor ? [55, 59, 62, 66] : [57, 61, 64, 67];
    if (st === 0 || st === 10) this.kick(t, 0.9);
    if (st === 4 || st === 12) this.snare(t, 0.45, 1400);
    this.hat(t, st % 4 === 2 ? 0.06 : 0.025);
    if ([1, 4, 7, 10, 13].includes(st)) this.funkGtr(t, ch, dur * 0.6, 0.06);
    const bassL: Record<number, number> = { 0: 0, 3: 12, 5: 0, 7: 10, 8: 12, 11: 7, 14: 0 };
    if (bassL[st] !== undefined) this.slap(t, root + bassL[st], dur * 0.8, 0.28);
    if (Math.random() < 0.35 && st % 2 === 1) this.conga(t, pick([180, 240, 320]), 0.12);
    if (st === 12 && bar % 2 === 1) this.cowbell(t, 0.06);
    if (bar >= 8 && st === 0 && bar % 2 === 0) this.fmKeys(t, ch.map((m) => m + 12), dur * 14, 0.035);
  }

  /** GUTS ON THE GRILLE — 135bpm, drop-D-minus-a-lot. 7-against-16 chugs, synth bass that eats metal. */
  private songDoom1(i: number, st: number, bar: number, t: number, dur: number) {
    const R = [26, 26, 27, 24][bar % 4]; // D1, D1, Eb1, C1
    const breakdown = bar >= 12 && bar < 16;
    const poly = i % 7;
    const hit = breakdown ? [0, 3, 6, 8, 11].includes(st) : poly === 0 || poly === 2 || poly === 3;
    if (hit) {
      this.chug(t, R, dur * (poly === 3 ? 1.8 : 0.8), 0.24);
      this.kick(t, 1.0);
    } else if (st % 2 === 0) this.kick(t, 0.55);
    if (st === 4 || st === 12) this.indSnare(t, 0.6);
    if (st % 2 === 0) this.hat(t, 0.05);
    if (st === 0) this.growl(t, R + 12, dur * 16, 0.2);
    if (bar % 4 === 3 && st >= 12) this.chug(t, R, dur * 0.3, 0.2); // stutter fill
    if (bar >= 4 && bar < 12 && st === 8 && bar % 2) this.lead(t, R + 39 + pick([0, 1, 3]), dur * 6);
    if (st === 0 && bar % 4 === 0) { this.crash(t); this.metalHit(t, 0.4); }
  }

  /** THEY FEAR THE FOREARM — 166bpm, blast beats, tremolo riffs, a choir of the damned (deer). */
  private songDoom2(i: number, st: number, bar: number, t: number, dur: number) {
    const R = [28, 31, 29, 27][bar % 4];
    const blast = bar >= 4 && bar < 12;
    if (blast) {
      if (st % 2 === 0) this.kick(t, 0.9);
      if (st % 2 === 1) this.indSnare(t, 0.35);
      this.chug(t, R + (st % 4 === 3 ? 1 : 0), dur * 0.7, 0.18);
    } else {
      if ([0, 3, 6, 10].includes(st)) { this.kick(t, 1); this.chug(t, R, dur * 1.5, 0.24); }
      if (st === 8) this.indSnare(t, 0.65);
      if (st === 14) this.chug(t, R + 6, dur, 0.22); // the tritone. obviously.
    }
    if (st % 4 === 0) this.ride(t, 0.05);
    if (st === 0 && bar % 2 === 0) { this.growl(t, R + 12, dur * 32, 0.18); this.choir(t, [R + 36, R + 39, R + 42], dur * 32, 0.04); }
    if (st === 0 && bar % 4 === 0) { this.crash(t); this.metalHit(t, 0.5); }
    void i;
  }

  // ================= instruments =================
  private chug(t: number, m: number, len: number, v: number) {
    // nine-string palm mute: stacked saws, savage distortion, then a lowpass "palm"
    const g = this.gain();
    this.env(g, t, 0.002, v, len);
    const palm = this.filter('lowpass', 1400, g, 1.2);
    palm.frequency.setValueAtTime(2600, t);
    palm.frequency.exponentialRampToValueAtTime(700, t + 0.06);
    const ws = this.ctx!.createWaveShaper();
    ws.curve = this.dist;
    ws.oversample = '2x';
    ws.connect(this.filter('peaking', 120, palm, 1));
    const pre = this.gain(ws);
    pre.gain.value = 1.4;
    for (const [iv, det] of [[0, -9], [0, 9], [7, 0], [12, 4]]) this.osc('sawtooth', mtof(m + 12 + iv), t, len, pre).detune.value = det;
  }
  private growl(t: number, m: number, len: number, v: number) {
    const ctx = this.ctx!;
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.05);
    g.gain.setValueAtTime(v, t + len - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    const f = this.filter('lowpass', 500, g, 9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = SONGS[this.song ?? 'doom1'].tempo / 60 * 2;
    const lg = ctx.createGain();
    lg.gain.value = 420;
    lfo.connect(lg).connect(f.frequency);
    lfo.start(t);
    lfo.stop(t + len);
    const ws = ctx.createWaveShaper();
    ws.curve = this.dist;
    ws.connect(f);
    this.osc('sawtooth', mtof(m), t, len, ws);
    this.osc('square', mtof(m - 12), t, len, ws).detune.value = 7;
  }
  private indSnare(t: number, v: number) {
    this.snare(t, v, 1200);
    const g = this.gain();
    this.env(g, t, 0.001, v * 0.5, 0.09);
    const ws = this.ctx!.createWaveShaper();
    ws.curve = this.dist;
    ws.connect(this.filter('bandpass', 2400, g, 1.5));
    this.noiseAt(t, 0.1, ws);
  }
  private metalHit(t: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.001, v, 1.2);
    const f = this.filter('bandpass', 1800, g, 12);
    for (const fr of [233, 377, 610, 987]) this.osc('square', fr, t, 1.2, f);
  }

  private echoIn: GainNode | null = null;
  private echoBus() {
    if (this.echoIn) return this.echoIn;
    const ctx = this.ctx!;
    const inp = ctx.createGain();
    const d = ctx.createDelay(1.5);
    d.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 2400;
    inp.connect(d).connect(lp).connect(fb).connect(d);
    lp.connect(this.music);
    this.echoIn = inp;
    return inp;
  }
  private synthBass(t: number, m: number, len: number, v: number, cut = 1600) {
    const g = this.gain();
    this.env(g, t, 0.004, v, len);
    const f = this.filter('lowpass', cut, g, 6);
    f.frequency.setValueAtTime(cut, t);
    f.frequency.exponentialRampToValueAtTime(cut * 0.18 + 60, t + len);
    const o = this.osc('sawtooth', mtof(m), t, len, f);
    const o2 = this.osc('square', mtof(m - 12), t, len, f);
    o.detune.value = -6;
    o2.detune.value = 4;
  }
  private darkPad(t: number, ms: number[], len: number, v: number) {
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + len * 0.2);
    g.gain.linearRampToValueAtTime(v * 0.8, t + len * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    const f = this.filter('lowpass', 850, g, 1.5);
    for (const m of ms) for (const det of [-11, 0, 12]) {
      const o = this.osc('sawtooth', mtof(m), t, len, f);
      o.detune.value = det;
    }
  }
  private choir(t: number, ms: number[], len: number, v: number) {
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + len * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    const f1 = this.filter('bandpass', 620, g, 7);
    const f2 = this.filter('bandpass', 1180, g, 9);
    for (const m of ms) {
      const o = this.osc('sawtooth', mtof(m), t, len, f1);
      o.connect(f2);
      this.vibrato(o, 5, 5, t, len);
    }
  }
  private synLead(t: number, m: number, len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.02, v, len);
    g.connect(this.echoBus());
    const f = this.filter('lowpass', 2600, g, 2);
    const o = this.osc('sawtooth', mtof(m), t, len, f);
    const o2 = this.osc('square', mtof(m), t, len, f);
    o2.detune.value = 8;
    this.vibrato(o, 5.5, 9, t + 0.15, len);
  }
  private arp(t: number, m: number, len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.002, v, len);
    g.connect(this.echoBus());
    this.osc('square', mtof(m), t, len, this.filter('lowpass', 3200, g));
  }
  private gatedSnare(t: number, v: number) {
    this.snare(t, v);
    // big 80s gated room: loud for 180ms, then it simply stops existing
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.01);
    g.gain.setValueAtTime(v * 0.42, t + 0.17);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.2);
    this.noiseAt(t, 0.22, this.filter('bandpass', 1900, g, 0.6));
  }
  private clap(t: number, v: number) {
    for (let i = 0; i < 3; i++) {
      const g = this.gain();
      this.env(g, t + i * 0.011, 0.001, v, 0.05 + (i === 2 ? 0.08 : 0));
      this.noiseAt(t + i * 0.011, 0.15, this.filter('bandpass', 1300, g, 2));
    }
  }
  private brush(t: number, v: number) {
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    this.noiseAt(t, 0.27, this.filter('bandpass', 2600, g, 0.8));
  }
  private ride(t: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.001, v, 0.45);
    this.noiseAt(t, 0.5, this.filter('bandpass', 8500, g, 2.5));
    const g2 = this.gain();
    this.env(g2, t, 0.001, v * 0.4, 0.35);
    for (const f of [3300, 4720, 5880]) this.osc('square', f, t, 0.4, this.filter('highpass', 6000, g2));
  }
  private organ(t: number, m: number, len: number, v: number) {
    // a cheap combo organ, slightly out of tune, played by someone in leather pants
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.setValueAtTime(v, t + len);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.05);
    const trem = this.ctx!.createGain();
    trem.connect(this.filter('lowpass', 3400, g, 0.8));
    const lfo = this.ctx!.createOscillator();
    lfo.frequency.value = 6.8;
    const lg = this.ctx!.createGain();
    lg.gain.value = 0.3;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + len + 0.1);
    this.osc('square', mtof(m), t, len + 0.05, trem).detune.value = 5;
    this.osc('sawtooth', mtof(m + 12), t, len + 0.05, trem).detune.value = -7;
    this.osc('sine', mtof(m + 19), t, len + 0.05, trem);
  }
  private fmBell(t: number, m: number, len: number, v: number, ratio = 3.5, index = 3) {
    const ctx = this.ctx!;
    const g = this.gain();
    this.env(g, t, 0.003, v, len);
    g.connect(this.echoBus());
    const f = mtof(m);
    const car = this.osc('sine', f, t, len, g);
    const mod = ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.2, t + len);
    mod.connect(mg).connect(car.frequency);
    mod.start(t);
    mod.stop(t + len + 0.05);
  }
  private fmKeys(t: number, ms: number[], len: number, v: number) {
    for (const m of ms) this.fmBell(t, m, len, v, 1, 2.2);
  }
  private slap(t: number, m: number, len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.002, v, len);
    const f = this.filter('lowpass', 3000, g, 4);
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.12);
    this.osc('square', mtof(m), t, len, f);
  }
  private funkGtr(t: number, ms: number[], len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.002, v, len);
    const f = this.filter('bandpass', 900, g, 3);
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + len * 0.6);
    for (const m of ms) this.osc('sawtooth', mtof(m), t, len, f);
  }
  private conga(t: number, f: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.002, v, 0.22);
    const o = this.osc('sine', f * 1.2, t, 0.25, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  }
  private cowbell(t: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.001, v, 0.3);
    const f = this.filter('bandpass', 800, g, 3);
    this.osc('square', 540, t, 0.32, f);
    this.osc('square', 800, t, 0.32, f);
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

  private rhodes(t: number, ms: number[], len: number, v: number) {
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const trem = this.ctx!.createGain();
    trem.connect(this.filter('lowpass', 2200, g));
    const lfo = this.osc('sine', 4.6, t, len, this.ctx!.createGain());
    const lg = this.ctx!.createGain();
    lg.gain.value = 0.25;
    lfo.disconnect();
    lfo.connect(lg).connect(trem.gain);
    for (const m of ms) {
      const o = this.osc('sine', mtof(m), t + rand(0, 0.025), len, trem);
      o.detune.value = Math.sin(this.ctx!.currentTime * 0.7) * 9;
      const o2 = this.osc('triangle', mtof(m + 12), t, len * 0.4, trem);
      o2.detune.value = 4;
    }
  }
  private lofiBass(t: number, m: number, len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.01, v, len);
    this.osc('sine', mtof(m), t, len, g);
    const g2 = this.gain();
    this.env(g2, t, 0.005, v * 0.3, len * 0.5);
    this.osc('triangle', mtof(m + 12), t, len * 0.5, this.filter('lowpass', 600, g2));
  }
  private hiss(t: number, len: number) {
    const g = this.gain();
    g.gain.setValueAtTime(0.018, t);
    g.gain.setValueAtTime(0.018, t + len);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.05);
    this.noiseAt(t, len + 0.05, this.filter('bandpass', 5000, g, 0.4));
  }
  private bleat(t: number, v: number) {
    // a deer's "meh". deer do not actually sound like this. this is worse.
    const g = this.gain();
    this.env(g, t, 0.03, v, 0.7);
    const am = this.ctx!.createGain();
    am.connect(this.filter('bandpass', 1100, g, 2));
    const lfo = this.ctx!.createOscillator();
    lfo.frequency.value = 22;
    const lg = this.ctx!.createGain();
    lg.gain.value = 0.6;
    lfo.connect(lg).connect(am.gain);
    lfo.start(t);
    lfo.stop(t + 0.8);
    const o = this.osc('sawtooth', 380, t, 0.75, am);
    o.frequency.linearRampToValueAtTime(330, t + 0.7);
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
  private snare(t: number, v: number, hp = 1600) {
    const g = this.gain();
    this.env(g, t, 0.002, v, 0.17);
    this.noiseAt(t, 0.2, this.filter('highpass', hp, g));
    const g2 = this.gain();
    this.env(g2, t, 0.002, v * 0.5, 0.08);
    this.osc('triangle', 210, t, 0.1, g2);
  }
  private hat(t: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.001, v, 0.04);
    this.noiseAt(t, 0.06, this.filter('highpass', 7500, g));
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
  private bass(t: number, m: number, len: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.004, v, len);
    this.osc('square', mtof(m), t, len, this.filter('lowpass', 500, g));
  }
  private lead(t: number, m: number, len: number) {
    const g = this.gain();
    this.env(g, t, 0.01, 0.07, len);
    const ws = this.ctx!.createWaveShaper();
    ws.curve = this.dist;
    ws.connect(this.filter('bandpass', 1800, g, 0.7));
    const o = this.osc('sawtooth', mtof(m), t, len, ws);
    this.vibrato(o, 6, 8, t, len);
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
  private pad(t: number, ms: number[], len: number, v: number) {
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + len * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    const lp = this.filter('lowpass', 1100, g);
    for (const m of ms) {
      const o = this.osc('triangle', mtof(m), t, len, lp);
      o.detune.value = rand(-10, 10);
    }
  }
  private pluck(t: number, m: number, v: number) {
    const g = this.gain();
    this.env(g, t, 0.003, v, 0.5);
    this.osc('sine', mtof(m), t, 0.55, g);
  }
  private crackle(t: number) {
    const g = this.gain();
    this.env(g, t, 0.001, 0.05, 0.01);
    this.noiseAt(t, 0.02, this.filter('highpass', 3000, g));
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
  update(p: { speed: number; throttle: number; offroad: boolean; siren: number; time: number; hell: number }) {
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
    void now;
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
  /** an actual cough: glottal burst, voiced bark, chest thump, wheezy inhale between. returns cough onsets (s) */
  cough(n = 3): number[] {
    const out: number[] = [];
    if (!this.ctx) return [0];
    const t0 = this.t;
    let t = t0;
    for (let i = 0; i < n; i++) {
      if (i > 0 && Math.random() < 0.5) {
        // wheeze: short desperate inhale
        const gw = this.sfxGain();
        gw.gain.setValueAtTime(0.0001, t);
        gw.gain.linearRampToValueAtTime(0.12, t + 0.16);
        gw.gain.linearRampToValueAtTime(0.0001, t + 0.24);
        const bw = this.filter('bandpass', 2600, gw, 6);
        bw.frequency.linearRampToValueAtTime(3400, t + 0.22);
        this.noiseAt(t, 0.26, bw);
        t += 0.26;
      }
      out.push(t - t0);
      const v = rand(0.75, 1.0) * (i === 0 ? 1 : 0.85);
      // 1) glottal burst: hard attack noise through two formants
      const gb = this.sfxGain();
      gb.gain.setValueAtTime(0.0001, t);
      gb.gain.exponentialRampToValueAtTime(1.1 * v, t + 0.004);
      gb.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.06);
      gb.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      const f1 = this.filter('bandpass', rand(650, 850), gb, 2.2);
      const f2 = this.filter('bandpass', rand(1500, 1900), gb, 3);
      const f3 = this.filter('highpass', 3000, gb, 0.7);
      const src = this.noiseAt(t, 0.34, f1);
      src.connect(f2);
      src.connect(f3);
      // 2) voiced bark: falling pitch "HUH"
      const gv = this.sfxGain();
      this.env(gv, t + 0.008, 0.012, 0.32 * v, 0.17);
      const fv1 = this.filter('bandpass', 720, gv, 5);
      const fv2 = this.filter('bandpass', 1150, gv, 6);
      const o = this.osc('sawtooth', rand(135, 165), t + 0.008, 0.22, fv1);
      o.connect(fv2);
      o.frequency.exponentialRampToValueAtTime(rand(80, 95), t + 0.2);
      // 3) chest thump
      const gt = this.sfxGain();
      this.env(gt, t, 0.003, 0.7 * v, 0.12);
      const th = this.osc('sine', 110, t, 0.15, gt);
      th.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      // 4) phlegmy rattle tail
      const gr = this.sfxGain();
      this.env(gr, t + 0.05, 0.02, 0.1 * v, 0.2);
      const rf = this.filter('bandpass', 380, gr, 3);
      const ro = this.osc('square', 32, t + 0.05, 0.25, rf);
      ro.detune.value = rand(-50, 50);
      this.noiseAt(t + 0.05, 0.25, rf);
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
  honk() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.01, 0.22, 0.45);
    const lp = this.filter('lowpass', 1600, g);
    this.osc('square', 349, t, 0.5, lp);
    this.osc('square', 440, t, 0.5, lp);
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
  screech(v: number) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.sfxGain();
    this.env(g, t, 0.01, 0.12 * v, 0.25);
    this.noiseAt(t, 0.3, this.filter('bandpass', rand(1800, 2600), g, 6));
  }

  speak(text: string, pitch = 0.1, rate = 0.85) {
    if (this.muted || typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = pitch;
      u.rate = rate;
      u.volume = 1;
      const v = speechSynthesis.getVoices().find((v) => /en[-_](US|GB)/i.test(v.lang) && /male|david|daniel|fred|alex/i.test(v.name));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {
      /* the goat is speechless */
    }
  }
}
