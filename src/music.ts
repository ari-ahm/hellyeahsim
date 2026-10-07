// The band. A mixing desk, every instrument on the radio, and enough music theory to be dangerous.
// Songs (songs.ts) are written as chord charts + melody notation and performed live through this.
import { rand } from './util';

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ================================================================ theory
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (s: string) => (PC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12) % 12;

/** 'C4' → 60, 'F#2' → 42, 'Bb-1' works too */
export function nn(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return pcOf(m[1] + m[2]) + (Number(m[3]) + 1) * 12;
}

const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7, 12], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], mmaj7: [0, 3, 7, 11],
  '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
  '11': [0, 7, 10, 14, 17], m11: [0, 3, 7, 10, 14, 17], '13': [0, 4, 10, 14, 21], m13: [0, 3, 10, 14, 21],
  sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], '9sus4': [0, 5, 7, 10, 14],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
  '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], '7b13': [0, 4, 10, 20], '7#11': [0, 4, 7, 10, 18], maj7s11: [0, 4, 7, 11, 18],
  '6/9': [0, 4, 7, 9, 14], '69': [0, 4, 7, 9, 14],
};

export interface Chord { name: string; root: number; iv: number[]; bass: number }
const chordCache = new Map<string, Chord>();
export function chord(name: string): Chord {
  let c = chordCache.get(name);
  if (c) return c;
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(name);
  if (!m || !(m[2] in QUAL)) throw new Error('bad chord ' + name);
  const root = pcOf(m[1]);
  c = { name, root, iv: QUAL[m[2]], bass: m[3] ? pcOf(m[3]) : root };
  chordCache.set(name, c);
  return c;
}
export const transpose = (c: Chord, k: number): Chord => (k ? { ...c, root: (c.root + k + 120) % 12, bass: (c.bass + k + 120) % 12 } : c);
export const isMinor = (c: Chord) => c.iv.includes(3) && !c.iv.includes(4);
export const isDom = (c: Chord) => c.iv.includes(4) && c.iv.includes(10);

/** 'Am | F | C G | E' → chords per bar (several in a bar split it evenly) */
export function prog(s: string): Chord[][] {
  return s.split('|').map((b) => b.trim().split(/\s+/).map(chord));
}

/**
 * Voice leading: pick the inversion of `c` (n voices, within lo..hi) that moves the least from the previous
 * voicing. This is the difference between "a chord changed" and "a keyboard player changed chords".
 */
export function voiceLead(c: Chord, prev: number[] | null, lo: number, hi: number, n: number): number[] {
  const iv = c.iv.map((i) => i % 12).filter((v, i, a) => a.indexOf(v) === i);
  while (iv.length > n) {
    const f = iv.indexOf(7); // the fifth is the least important note in any chord. the bass has the root.
    iv.splice(f > 0 ? f : 0, 1);
  }
  const pcs = iv.map((i) => (c.root + i) % 12);
  while (pcs.length < n) pcs.push(pcs[pcs.length % iv.length]);
  let best: number[] = [];
  let bestCost = Infinity;
  const center = (lo + hi) / 2;
  for (let r = 0; r < pcs.length; r++) {
    for (let oct = 0; oct < 2; oct++) {
      const out: number[] = [];
      let m = lo + ((pcs[r] - lo) % 12 + 12) % 12 + oct * 12;
      for (let k = 0; k < pcs.length; k++) {
        const pc = pcs[(r + k) % pcs.length];
        if (k > 0) {
          m = out[k - 1] + 1;
          m += ((pc - m) % 12 + 12) % 12;
        }
        out.push(m);
      }
      if (out[out.length - 1] > hi) continue;
      const mean = out.reduce((a, b) => a + b, 0) / out.length;
      const cost = prev && prev.length === out.length ? out.reduce((a, v, i) => a + Math.abs(v - prev[i]), 0) + Math.abs(mean - center) * 0.3 : Math.abs(mean - center) * n;
      if (cost < bestCost) {
        bestCost = cost;
        best = out;
      }
    }
  }
  if (!best.length) best = pcs.map((pc) => lo + ((pc - lo) % 12 + 12) % 12);
  return best;
}

/** the highest chord tone at least `gap` semitones below m — instant horn-section harmony */
export function under(c: Chord, m: number, gap = 3): number {
  for (let k = m - gap; k > m - 13; k--) if (c.iv.some((i) => (c.root + i) % 12 === ((k % 12) + 12) % 12)) return k;
  return m - 12;
}

// ================================================================ notation
/**
 * Melody notation. Tokens: `E4:4` (note : length in steps, sticky), `r:2` rest, `7:2` an interval (relative to a
 * base passed at play time), `C4+E4+G4` chords. Prefixes: `>` accent, `.` muted/staccato, `^` bend up into it, `~` slide.
 * `|` is a bar line and is checked, because composers can't count.
 */
export interface Ev { at: number; m: number[]; len: number; acc: number; fl: string; rel: boolean; idx: number }
export interface Phrase { len: number; at: Map<number, Ev[]>; evs: Ev[] }
export function mel(src: string, spb = 16, name = ''): Phrase {
  const at = new Map<number, Ev[]>();
  const evs: Ev[] = [];
  let pos = 0;
  let len = 2;
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') {
      if (pos % spb) console.warn(`[music] ${name}: bar line at step ${pos} (off by ${pos % spb})`);
      continue;
    }
    const m = /^([>.^~]*)([^:]+)(?::(\d+))?$/.exec(tok);
    if (!m) throw new Error('bad token ' + tok);
    if (m[3]) len = Number(m[3]);
    if (m[2] !== 'r') {
      const rel = /^-?\d+/.test(m[2]);
      const ms = m[2].split('+').map((s) => (rel ? Number(s) : nn(s)));
      const e: Ev = { at: pos, m: ms, len, acc: m[1].includes('>') ? 1 : m[1].includes('.') ? 0.55 : 0.8, fl: m[1], rel, idx: evs.length };
      evs.push(e);
      if (!at.has(pos)) at.set(pos, []);
      at.get(pos)!.push(e);
    }
    pos += len;
  }
  if (pos % spb) console.warn(`[music] ${name}: phrase is ${pos} steps (not whole bars)`);
  return { len: pos, at, evs };
}

const patCache = new Map<string, number[]>();
/** drum pattern: `X` accent, `x` hit, `o` medium, `.` ghost, `-` nothing. spaces/bars ignored. */
export function pat(p: string): number[] {
  let v = patCache.get(p);
  if (!v) {
    v = [...p.replace(/[\s|]/g, '')].map((c) => ({ X: 1, x: 0.75, o: 0.55, '.': 0.3 })[c] ?? 0);
    patCache.set(p, v);
  }
  return v;
}

// ================================================================ songs
export interface Sec { name: string; bars: number; ch: string; tr?: number }
export interface SongDef {
  title: string;
  artist: string;
  tempo: number;
  gain: number;
  /** steps per bar (16 = 4/4 in 16ths, 12 = 3/4 or 6/8) */
  spb?: number;
  swing?: number;
  key?: number;
  /** echo time in steps (3 = dotted 8th, the most 80s number) */
  echo?: number;
  echoFb?: number;
  /** sidechain depth when the kick hits */
  pump?: number;
  /** tape wow in cents */
  wow?: number;
  verb?: number;
  /** reverb size (s) */
  room?: number;
  form: Sec[];
  /** bar to jump back to after the last one */
  loop?: number;
  mix?: Record<string, Mix>;
  play(x: X): void;
}

export interface X {
  b: Band;
  t: number;
  d: number;
  i: number;
  st: number;
  bar: number;
  sb: number;
  pass: number;
  sec: Sec;
  sn: string;
  next: string;
  k: number;
  ch: Chord;
  /** chord on the previous step; chord starts on this step / its length in steps / the next chord */
  pv: Chord;
  chOn: boolean;
  chLen: number;
  nx: Chord;
  first: boolean;
  last: boolean;
  spb: number;
  hit(p: string): number;
  play(P: Phrase, fn: (m: number, len: number, e: Ev) => void, opt?: { base?: number; bar?: number; tr?: number }): void;
  vc(key: string, lo: number, hi: number, n: number): number[];
  root(oct: number): number;
  bass(oct: number): number;
}

interface Compiled { def: SongDef; secs: { sec: Sec; at: number; bars: Chord[][] }[]; total: number }
const compiled = new Map<SongDef, Compiled>();
function compile(def: SongDef): Compiled {
  let c = compiled.get(def);
  if (c) return c;
  let at = 0;
  const secs = def.form.map((sec) => {
    const s = { sec, at, bars: prog(sec.ch) };
    at += sec.bars;
    return s;
  });
  c = { def, secs, total: at };
  compiled.set(def, c);
  return c;
}
export const songBars = (def: SongDef) => compile(def).total;

// ================================================================ the band
export interface Mix { vol?: number; pan?: number; verb?: number; echo?: number; duck?: number; drive?: number; trem?: number; lp?: number }
const DEF_MIX: Record<string, Mix> = {
  kick: { vol: 0.95, verb: 0.02 },
  snare: { vol: 1.1, verb: 0.2 },
  clap: { vol: 0.6, pan: 0.05, verb: 0.3 },
  hat: { vol: 0.45, pan: 0.28, verb: 0.03 },
  ride: { vol: 0.26, pan: -0.3, verb: 0.1 },
  cym: { vol: 0.3, pan: -0.2, verb: 0.12 },
  tom: { vol: 0.62, verb: 0.2 },
  perc: { vol: 0.42, pan: -0.38, verb: 0.18 },
  perc2: { vol: 0.38, pan: 0.42, verb: 0.18 },
  bass: { vol: 0.45, duck: 0.65 },
  keys: { vol: 0.5, pan: -0.18, verb: 0.3, duck: 0.5, trem: 0.22 },
  clav: { vol: 0.4, pan: 0.3, verb: 0.08, duck: 0.3 },
  organ: { vol: 0.4, pan: 0.22, verb: 0.3, duck: 0.4 },
  pad: { vol: 0.2, verb: 0.5, duck: 0.85 },
  arp: { vol: 0.32, pan: 0.25, verb: 0.2, echo: 0.35, duck: 0.75 },
  lead: { vol: 0.42, verb: 0.22, echo: 0.2, duck: 0.3 },
  lead2: { vol: 0.36, pan: -0.25, verb: 0.3, echo: 0.2, duck: 0.3 },
  vox: { vol: 0.55, verb: 0.35, echo: 0.15, duck: 0.25 },
  voxL: { vol: 0.42, pan: -0.45, verb: 0.35, duck: 0.2 },
  voxR: { vol: 0.42, pan: 0.45, verb: 0.35, duck: 0.2 },
  choir: { vol: 0.3, verb: 0.6, duck: 0.4 },
  gtrL: { vol: 0.42, pan: -0.8, verb: 0.06, drive: 1, duck: 0.2 },
  gtrR: { vol: 0.42, pan: 0.8, verb: 0.06, drive: 1, duck: 0.2 },
  gtrC: { vol: 0.34, pan: 0.35, verb: 0.15, duck: 0.3 },
  solo: { vol: 0.32, pan: 0.08, verb: 0.28, echo: 0.18, drive: 1 },
  solo2: { vol: 0.26, pan: -0.3, verb: 0.28, echo: 0.18, drive: 1 },
  sub: { vol: 0.8, duck: 0 },
  fx: { vol: 0.42, verb: 0.5 },
};
const AMPED = new Set(['gtrL', 'gtrR', 'solo', 'solo2']);
const TREM = new Set(['keys', 'organ']);
// vowel formants (F1, F2, F3)
const VOW: Record<string, number[]> = {
  a: [780, 1180, 2700], e: [540, 1800, 2550], i: [300, 2250, 3000], o: [480, 820, 2500], u: [320, 720, 2400],
  l: [360, 1000, 2600], ae: [690, 1660, 2500], uh: [600, 1200, 2550], m: [280, 900, 2200],
};
interface Chan { inp: GainNode; vol: GainNode; pan: StereoPannerNode; dry: GainNode; dk: GainNode; sv: GainNode; se: GainNode; drive?: GainNode; tremD?: GainNode; lp: BiquadFilterNode }

export class Band {
  ctx: BaseAudioContext;
  def: SongDef | null = null;
  /** debug: solo these channels (stem renders) */
  only: string[] | null = null;
  private noise: AudioBuffer;
  private out: GainNode;
  private sweepF: BiquadFilterNode;
  private dry: GainNode;
  private duckBus: GainNode;
  private verbIn: GainNode;
  private verbRet: GainNode;
  private verb: ConvolverNode;
  private echoIn: GainNode;
  private dl: DelayNode;
  private dr: DelayNode;
  private efb: GainNode;
  private chans = new Map<string, Chan>();
  private hatVCA!: GainNode;
  private rideVCA!: GainNode;
  private crashVCA!: GainNode;
  private curves: Record<string, Float32Array<ArrayBuffer>> = {};
  private voicings = new Map<string, number[]>();
  private dt = 0.1;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    for (const [k, drive] of [['soft', 1.6], ['amp', 7], ['fuzz', 22]] as const) {
      const c = new Float32Array(2048);
      for (let i = 0; i < c.length; i++) {
        const x = (i / (c.length - 1)) * 2 - 1;
        // asymmetric tanh: even harmonics, like a tube that's had a few
        c[i] = Math.tanh(x * drive + (k === 'soft' ? 0 : 0.18)) - Math.tanh(k === 'soft' ? 0 : 0.18);
      }
      this.curves[k] = c;
    }
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.sweepF = ctx.createBiquadFilter();
    this.sweepF.frequency.value = 20000;
    this.sweepF.Q.value = 0.9;
    this.sweepF.connect(this.out);
    this.dry = ctx.createGain();
    this.dry.connect(this.sweepF);
    this.duckBus = ctx.createGain();
    this.duckBus.connect(this.sweepF);
    // reverb: a generated hall with damped tail and early reflections
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeIR(2.8);
    this.verbIn = ctx.createGain();
    const vhp = ctx.createBiquadFilter();
    vhp.type = 'highpass';
    vhp.frequency.value = 220;
    this.verbRet = ctx.createGain();
    this.verbIn.connect(vhp).connect(this.verb).connect(this.verbRet);
    this.verbRet.connect(this.duckBus);
    // ping-pong echo
    this.echoIn = ctx.createGain();
    this.dl = ctx.createDelay(2);
    this.dr = ctx.createDelay(2);
    this.efb = ctx.createGain();
    this.efb.gain.value = 0.42;
    const ehp = ctx.createBiquadFilter();
    ehp.type = 'highpass';
    ehp.frequency.value = 300;
    const elp = ctx.createBiquadFilter();
    elp.frequency.value = 3200;
    const merge = ctx.createChannelMerger(2);
    const eret = ctx.createGain();
    eret.gain.value = 0.8;
    this.echoIn.connect(ehp).connect(elp).connect(this.dl);
    this.dl.connect(merge, 0, 0);
    this.dl.connect(this.dr);
    this.dr.connect(merge, 0, 1);
    this.dr.connect(this.efb).connect(this.dl);
    merge.connect(eret);
    eret.connect(this.duckBus);
    const ev = ctx.createGain();
    ev.gain.value = 0.25;
    eret.connect(ev).connect(this.verbIn);
    this.cymbals();
  }

  private makeIR(secs: number) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * secs);
    const b = ctx.createBuffer(2, len, sr);
    const pre = Math.floor(sr * 0.018);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const p = (i - pre) / (len - pre);
        const k = 0.08 + 0.85 * Math.pow(1 - p, 2); // highs die first, like a real room
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.pow(1 - p, 2.6) * (1.6 - k * 0.6);
      }
      for (let r = 0; r < 9; r++) {
        const at = pre + Math.floor(sr * rand(0.004, 0.07));
        d[at] += rand(-0.6, 0.6);
      }
    }
    return b;
  }

  /** persistent metal: six detuned squares (808 hat ratios) + noise, gated per hit like a real choke group */
  private cymbals() {
    const ctx = this.ctx;
    const bank = ctx.createGain();
    bank.gain.value = 0.12;
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f * 1.7;
      o.connect(bank);
      o.start();
    }
    const nz = ctx.createBufferSource();
    nz.buffer = this.noise;
    nz.loop = true;
    nz.start();
    const nzg = ctx.createGain();
    nzg.gain.value = 0.55;
    nz.connect(nzg);
    const mk = (name: string, hp: number, bp: number, q: number) => {
      const vca = ctx.createGain();
      vca.gain.value = 0;
      bank.connect(vca);
      nzg.connect(vca);
      const b = this.F('bandpass', bp, q, this.F('highpass', hp, 0.7, this.chan(name)));
      vca.connect(b);
      return vca;
    };
    this.hatVCA = mk('hat', 7000, 10500, 0.5);
    this.rideVCA = mk('ride', 3800, 6500, 0.6);
    this.crashVCA = mk('cym', 3200, 7000, 0.3);
  }

  // ---------------------------------------------------------------- mixer
  chan(name: string): GainNode {
    let c = this.chans.get(name);
    if (!c) {
      const ctx = this.ctx;
      const inp = ctx.createGain();
      let node: AudioNode = inp;
      let tremD: GainNode | undefined;
      let drive: GainNode | undefined;
      if (TREM.has(name)) {
        const trem = ctx.createGain();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4.6;
        tremD = ctx.createGain();
        tremD.gain.value = 0;
        lfo.connect(tremD).connect(trem.gain);
        lfo.start();
        node.connect(trem);
        node = trem;
      }
      if (AMPED.has(name)) {
        // amp + cab: drive → asymmetric clip → highpass, mid push, speaker rolloff
        drive = ctx.createGain();
        const ws = ctx.createWaveShaper();
        ws.curve = this.curves.amp;
        ws.oversample = '2x';
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 95;
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1300;
        mid.Q.value = 0.9;
        mid.gain.value = 4;
        const scoop = ctx.createBiquadFilter();
        scoop.type = 'peaking';
        scoop.frequency.value = 420;
        scoop.Q.value = 1;
        scoop.gain.value = -3;
        const cab = ctx.createBiquadFilter();
        cab.frequency.value = 4800;
        cab.Q.value = 1.1;
        const cab2 = ctx.createBiquadFilter();
        cab2.frequency.value = 7000;
        const post = ctx.createGain();
        post.gain.value = 0.32;
        node.connect(drive).connect(ws).connect(hp).connect(scoop).connect(mid).connect(cab).connect(cab2).connect(post);
        node = post;
      }
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = 20000;
      const vol = ctx.createGain();
      const pan = ctx.createStereoPanner();
      node.connect(lp).connect(vol).connect(pan);
      const dry = ctx.createGain();
      const dk = ctx.createGain();
      const sv = ctx.createGain();
      const se = ctx.createGain();
      pan.connect(dry).connect(this.dry);
      pan.connect(dk).connect(this.duckBus);
      pan.connect(sv).connect(this.verbIn);
      pan.connect(se).connect(this.echoIn);
      c = { inp, vol, pan, dry, dk, sv, se, drive, tremD, lp };
      this.chans.set(name, c);
      this.applyMix(name, c, true);
    }
    return c.inp;
  }
  /** names of every channel the current song has used so far */
  get channels() {
    return [...this.chans.keys()];
  }
  private applyMix(name: string, c: Chan, now = false) {
    const m = { vol: 0.5, ...DEF_MIX[name], ...this.def?.mix?.[name] };
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => (now ? (p.value = v) : p.setTargetAtTime(v, t, 0.05));
    const verb = this.def?.verb ?? 1;
    set(c.vol.gain, this.only && !this.only.includes(name) ? 0 : m.vol ?? 0.5);
    set(c.pan.pan, m.pan ?? 0);
    set(c.dry.gain, 1 - (m.duck ?? 0));
    set(c.dk.gain, m.duck ?? 0);
    set(c.sv.gain, (m.verb ?? 0) * verb);
    set(c.se.gain, m.echo ?? 0);
    set(c.lp.frequency, m.lp ?? 20000);
    if (c.drive) set(c.drive.gain, m.drive ?? 1);
    if (c.tremD) set(c.tremD.gain, m.trem ?? 0);
  }

  /** a new song walks on stage: reset the desk to its mix */
  setSong(def: SongDef) {
    this.def = def;
    compile(def);
    this.dt = 60 / def.tempo / 4;
    const t = this.ctx.currentTime;
    this.dl.delayTime.setValueAtTime(this.dt * (def.echo ?? 3), t);
    this.dr.delayTime.setValueAtTime(this.dt * (def.echo ?? 3), t);
    this.efb.gain.setValueAtTime(def.echoFb ?? 0.42, t);
    this.verb.buffer = this.makeIR(def.room ?? 2.8);
    this.duckBus.gain.cancelScheduledValues(t);
    this.duckBus.gain.setValueAtTime(1, t);
    this.sweepF.frequency.cancelScheduledValues(t);
    this.sweepF.frequency.setValueAtTime(20000, t);
    this.voicings.clear();
    for (const [n, c] of this.chans) this.applyMix(n, c);
  }

  private locate(C: Compiled, bar: number, st: number) {
    const def = C.def;
    let si = C.secs.length - 1;
    while (si > 0 && C.secs[si].at > bar) si--;
    const S = C.secs[si];
    const k = (def.key ?? 0) + (S.sec.tr ?? 0);
    const cb = S.bars[(bar - S.at) % S.bars.length];
    const per = (def.spb ?? 16) / cb.length;
    const ci = Math.floor(st / per);
    return { S, si, k, ci, per, ch: transpose(cb[ci], k) };
  }

  /** perform step i of the current song at time t */
  step(i: number, t: number) {
    const def = this.def;
    if (!def) return;
    const C = compile(def);
    const spb = def.spb ?? 16;
    const loop = def.loop ?? 0;
    let bar = Math.floor(i / spb);
    const pass = bar >= C.total ? 1 + Math.floor((bar - C.total) / (C.total - loop)) : 0;
    if (bar >= C.total) bar = loop + ((bar - C.total) % (C.total - loop));
    const st = i % spb;
    const at = this.locate(C, bar, st);
    const { S, si, k, ch, ci, per } = at;
    const sb = bar - S.at;
    const cb = S.bars[sb % S.bars.length];
    // the next chord change (looks into the next section)
    let nx: Chord;
    if (ci + 1 < cb.length) nx = transpose(cb[ci + 1], k);
    else if (sb + 1 < S.sec.bars) nx = transpose(S.bars[(sb + 1) % S.bars.length][0], k);
    else {
      const N = C.secs[si + 1] ?? C.secs.find((s) => s.at === loop) ?? C.secs[0];
      nx = transpose(N.bars[0][0], (def.key ?? 0) + (N.sec.tr ?? 0));
    }
    const pv = i > 0 ? this.locate(C, st ? bar : bar ? bar - 1 : C.total - 1, (st || spb) - 1).ch : ch;
    const dt = this.dt;
    const sw = st % 2 ? (def.swing ?? 0) * dt : 0;
    const pos = sb * spb + st;
    const x: X = {
      b: this, t: t + sw, d: dt, i, st, bar, sb, pass, sec: S.sec, sn: S.sec.name,
      next: (C.secs[si + 1] ?? C.secs.find((s) => s.at === loop) ?? C.secs[0]).sec.name,
      k, ch, pv, chOn: st % per === 0, chLen: per, nx, first: sb === 0, last: sb === S.sec.bars - 1, spb,
      hit: (p) => {
        const v = pat(p);
        return v[pos % v.length];
      },
      play: (P, fn, opt) => {
        const p = pos - (opt?.bar ?? 0) * spb;
        if (p < 0) return;
        const evs = P.at.get(p % P.len);
        if (!evs) return;
        for (const e of evs) for (const m of e.m) fn(e.rel ? (opt?.base ?? 0) + m : m + k + (opt?.tr ?? 0), e.len, e);
      },
      vc: (key, lo, hi, n) => {
        const v = voiceLead(ch, this.voicings.get(key) ?? null, lo, hi, n);
        this.voicings.set(key, v);
        return v;
      },
      root: (oct) => (oct + 1) * 12 + ch.root,
      bass: (oct) => (oct + 1) * 12 + ch.bass,
    };
    def.play(x);
  }

  // ---------------------------------------------------------------- plumbing
  private G(dest: AudioNode | AudioParam, v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest instanceof AudioParam) g.connect(dest);
    else g.connect(dest);
    return g;
  }
  private F(type: BiquadFilterType, f: number, q: number, dest: AudioNode) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }
  private O(type: OscillatorType, f: number, t: number, end: number, dest: AudioNode, det = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (det) o.detune.setValueAtTime(det, t);
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }
  private N(t: number, end: number, dest: AudioNode, rate = 1) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.playbackRate.value = rate;
    n.connect(dest);
    n.start(t, rand(0, 1.5));
    n.stop(end);
    return n;
  }
  private WS(curve: string, dest: AudioNode) {
    const w = this.ctx.createWaveShaper();
    w.curve = this.curves[curve];
    w.connect(dest);
    return w;
  }
  /** ADSR on a gain param. a: attack, d: decay time-constant, s: sustain level, r: release. returns when it's silent */
  private adsr(p: AudioParam, t: number, len: number, peak: number, a = 0.005, d = 0.1, s = 1, r = 0.05) {
    const rel = t + Math.max(len, a + 0.001);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (s < 1) p.setTargetAtTime(peak * s, t + a, d);
    p.setTargetAtTime(0, rel, r / 3);
    return rel + r * 1.6;
  }
  /** percussive: instant attack, exponential decay with time-constant tau */
  private perc(p: AudioParam, t: number, peak: number, tau: number, a = 0.002) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(0, t + a, tau);
    return t + a + tau * 6;
  }
  private vib(p: AudioParam, t: number, end: number, rate: number, cents: number, onset = 0.2) {
    const l = this.ctx.createOscillator();
    l.frequency.value = rate * rand(0.94, 1.06);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(cents, t + onset + 0.15);
    l.connect(g).connect(p);
    l.start(t);
    l.stop(end);
  }
  /** tape wow & flutter for the dusty songs */
  private wow(t: number) {
    const w = this.def?.wow ?? 0;
    return w ? Math.sin(t * 2 * Math.PI * 0.53) * w + Math.sin(t * 2 * Math.PI * 4.9) * w * 0.25 : 0;
  }
  private hum() {
    return rand(-0.004, 0.004);
  }

  /** sidechain: everything on the duck bus bows to the kick */
  pump(t: number, depth: number, rel = 0.07) {
    const g = this.duckBus.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - depth, t, 0.004);
    g.setTargetAtTime(1, t + 0.035, rel);
  }
  /** master filter sweep (builds, breakdowns, dying radios) */
  sweep(t: number, f: number, tau = 0.5) {
    this.sweepF.frequency.setTargetAtTime(f, t, tau);
  }
  /** exponential master filter ramp — the build-up that opens like a garage door */
  ramp(t: number, f0: number, f1: number, len: number) {
    const p = this.sweepF.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(f0, t);
    p.exponentialRampToValueAtTime(f1, t + len);
  }

  // ================================================================ drums
  kick(t: number, v: number, kind: 'punch' | 'deep' | 'dusty' | 'metal' | '808' | 'rock' = 'punch') {
    t += this.hum() * 0.5;
    const [f0, f1, sweep, tau, click, drive] = {
      punch: [200, 50, 0.05, 0.09, 0.45, 1], deep: [160, 43, 0.07, 0.15, 0.3, 1], dusty: [140, 52, 0.05, 0.1, 0.12, 0.6],
      metal: [260, 55, 0.03, 0.055, 0.9, 1.8], '808': [120, 46, 0.09, 0.4, 0.15, 0.8], rock: [180, 58, 0.04, 0.085, 0.7, 1.2],
    }[kind];
    const c = this.chan('kick');
    const out = kind === 'dusty' ? this.F('lowpass', 1100, 0.7, c) : c;
    const g = this.G(out);
    const end = this.perc(g.gain, t, v, tau);
    const sat = this.G(this.WS('soft', g), drive);
    const o = this.O('sine', f0, t, end, sat);
    o.frequency.exponentialRampToValueAtTime(f1, t + sweep * 2.2);
    if (click) {
      const gc = this.G(out);
      this.perc(gc.gain, t, v * click * 0.5, 0.004, 0.0005);
      this.N(t, t + 0.03, this.F('highpass', kind === 'metal' ? 1800 : 3200, 0.7, gc));
    }
    if (this.def?.pump) this.pump(t, this.def.pump * Math.min(1, v + 0.2));
  }
  snare(t: number, v: number, kind: 'tight' | 'gated' | 'lofi' | 'rim' | 'brush' | 'metal' | 'fat' = 'tight') {
    t += this.hum();
    const c = this.chan('snare');
    if (kind === 'brush') {
      const g = this.G(c);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.5, t + 0.018);
      g.gain.setTargetAtTime(0, t + 0.02, 0.07);
      this.N(t, t + 0.4, this.F('bandpass', 3800, 0.6, g));
      return;
    }
    if (kind === 'rim') {
      const g = this.G(c);
      const end = this.perc(g.gain, t, v * 0.5, 0.012);
      this.O('triangle', 1650, t, end, this.F('bandpass', 1700, 3, g));
      this.N(t, end, this.F('highpass', 4000, 1, g));
      return;
    }
    const out = kind === 'lofi' ? this.F('lowpass', 3000, 0.7, c) : c;
    const body = this.G(out);
    const tau = kind === 'fat' ? 0.07 : 0.045;
    const end = this.perc(body.gain, t, v * 0.75, tau);
    const o1 = this.O('triangle', 205, t, end, body);
    o1.frequency.exponentialRampToValueAtTime(165, t + 0.04);
    this.O('sine', 335, t, end, body);
    const nz = this.G(out);
    const nend = this.perc(nz.gain, t, v * 0.9, kind === 'fat' ? 0.08 : 0.055);
    this.N(t, nend, this.F('highpass', 1300, 0.7, this.F('peaking', 5000, 1, nz)));
    if (kind === 'gated') {
      // the 1984 special: a room mic slammed through a gate. loud. then not.
      const gg = this.G(out);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(v * 0.55, t + 0.008);
      gg.gain.setValueAtTime(v * 0.5, t + 0.17);
      gg.gain.linearRampToValueAtTime(0, t + 0.2);
      this.N(t, t + 0.22, this.F('bandpass', 1700, 0.5, gg));
    }
    if (kind === 'metal') {
      const gm = this.G(out);
      const e = this.perc(gm.gain, t, v * 0.5, 0.06);
      const ws = this.WS('fuzz', this.F('bandpass', 2400, 1.2, gm));
      this.N(t, e, ws);
      const r = this.F('bandpass', 1100, 9, gm);
      this.O('square', 920, t, e, r);
      this.O('square', 1370, t, e, r);
    }
  }
  clap(t: number, v: number) {
    const c = this.chan('clap');
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.009 + this.hum() * 0.3;
      const g = this.G(c);
      const end = this.perc(g.gain, tt, v * (i === 3 ? 0.9 : 0.6), i === 3 ? 0.06 : 0.008);
      this.N(tt, end, this.F('bandpass', 1250, 1.6, g));
    }
  }
  hat(t: number, v: number, open = false) {
    t += this.hum() * 0.6;
    const g = this.hatVCA.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(v * rand(0.85, 1.05), t, 0.0006);
    g.setTargetAtTime(0, t + 0.003, open ? 0.12 : 0.016);
  }
  ride(t: number, v: number, bell = false) {
    t += this.hum() * 0.6;
    const g = this.rideVCA.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(v * 0.8, t, 0.0008);
    g.setTargetAtTime(0, t + 0.004, 0.32);
    const gb = this.G(this.chan('ride'));
    const end = this.perc(gb.gain, t, v * (bell ? 0.35 : 0.12), bell ? 0.4 : 0.2);
    for (const f of [2950, 4410]) this.O('sine', f, t, end, gb);
  }
  crash(t: number, v = 1) {
    const g = this.crashVCA.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(v, t, 0.001);
    g.setTargetAtTime(0, t + 0.01, 0.55);
    const gn = this.G(this.chan('cym'));
    const end = this.perc(gn.gain, t, v * 0.5, 0.7);
    this.N(t, end, this.F('highpass', 5000, 0.5, gn));
  }
  tom(t: number, m: number, v: number) {
    t += this.hum();
    const g = this.G(this.chan('tom'));
    const end = this.perc(g.gain, t, v, 0.13);
    const f = mtof(m);
    const o = this.O('sine', f * 1.7, t, end, this.G(this.WS('soft', g), 1.2));
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const gn = this.G(g);
    this.perc(gn.gain, t, 0.25, 0.02);
    this.N(t, t + 0.06, this.F('bandpass', f * 6, 1, gn));
  }
  /** a drum fill over the last steps of a bar: snare into descending toms */
  fill(x: X, from = 8, v = 0.8) {
    const k = x.st - from;
    if (k < 0) return;
    const n = x.spb - from;
    const toms = [52, 50, 47, 45, 43, 41, 40, 38];
    if (k < n / 2 && k % 2 === 0) this.snare(x.t, v * (0.7 + (k / n) * 0.3), 'tight');
    else this.tom(x.t, toms[Math.min(7, Math.floor((k / n) * 8))], v);
  }
  shaker(t: number, v: number) {
    const g = this.G(this.chan('perc2'));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.4, t + 0.012);
    g.gain.setTargetAtTime(0, t + 0.014, 0.02);
    this.N(t, t + 0.15, this.F('bandpass', 7000, 1.2, g));
  }
  tamb(t: number, v: number) {
    const g = this.G(this.chan('perc2'));
    const end = this.perc(g.gain, t, v * 0.4, 0.05);
    const b = this.F('bandpass', 7500, 2, g);
    this.N(t, end, b);
    this.O('square', 5400, t, end, b);
    this.O('square', 7100, t, end, b);
  }
  cowbell(t: number, v: number) {
    const g = this.G(this.chan('perc'));
    const end = this.perc(g.gain, t, v * 0.3, 0.07);
    const f = this.F('bandpass', 1100, 2.5, g);
    this.O('square', 562, t, end, f);
    this.O('square', 845, t, end, f);
  }
  conga(t: number, v: number, hi = 0) {
    t += this.hum();
    const g = this.G(this.chan(hi > 1 ? 'perc2' : 'perc'));
    const f = [196, 262, 330, 440][hi] ?? 262;
    const end = this.perc(g.gain, t, v * 0.6, hi === 1 ? 0.04 : 0.11);
    const o = this.O('sine', f * 1.35, t, end, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const gs = this.G(g);
    this.perc(gs.gain, t, 0.3, 0.008);
    this.N(t, t + 0.03, this.F('bandpass', 2600, 1.4, gs));
  }
  sticks(t: number, v: number) {
    const g = this.G(this.chan('perc'));
    const end = this.perc(g.gain, t, v * 0.5, 0.025);
    this.O('sine', 2100, t, end, g);
    this.O('triangle', 3300, t, end, g);
  }
  crackle(t: number, v = 0.05) {
    const g = this.G(this.chan('fx'));
    const end = this.perc(g.gain, t, v * rand(0.3, 1), 0.002, 0.0003);
    this.N(t, end + 0.01, this.F('highpass', 2500, 0.7, g));
  }
  hiss(t: number, len: number, v = 0.015) {
    const g = this.G(this.chan('fx'));
    g.gain.setValueAtTime(v, t);
    g.gain.setValueAtTime(v, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    this.N(t, t + len + 0.06, this.F('bandpass', 5500, 0.35, g));
  }

  // ================================================================ bass
  bass(t: number, m: number, len: number, v: number, kind: 'saw' | 'sub' | 'slap' | 'pop' | 'ghost' | 'finger' | 'pick' | 'reese' | 'fm' = 'saw', from?: number) {
    t += this.hum() * 0.5;
    const c = this.chan('bass');
    const f = mtof(m);
    const glide = (o: OscillatorNode, mult = 1) => {
      if (from === undefined) return;
      o.frequency.setValueAtTime(mtof(from) * mult, t);
      o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.07);
    };
    if (kind === 'ghost') {
      const g = this.G(c);
      const end = this.perc(g.gain, t, v * 0.5, 0.025);
      this.O('triangle', f, t, end, this.F('lowpass', 500, 1, g));
      this.N(t, t + 0.03, this.F('bandpass', 1500, 2, this.G(g, 0.3)));
      return;
    }
    const g = this.G(c);
    if (kind === 'saw') {
      const end = this.adsr(g.gain, t, len, v, 0.004, 0.15, 0.7, 0.05);
      const lp = this.F('lowpass', 2000, 4, g);
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.setTargetAtTime(380, t + 0.01, 0.07);
      glide(this.O('sawtooth', f, t, end, lp, -6));
      glide(this.O('sawtooth', f, t, end, lp, 7));
      const sub = this.G(g, 0.7);
      glide(this.O('sine', f / 2 > 30 ? f / 2 : f, t, end, sub), f / 2 > 30 ? 0.5 : 1);
    } else if (kind === 'sub') {
      const end = this.adsr(g.gain, t, len, v, 0.012, 0.3, 0.85, 0.09);
      const sat = this.WS('soft', g);
      const o = this.O('sine', f, t, end, sat, this.wow(t));
      glide(o);
      const h = this.G(this.F('lowpass', 700, 0.7, g), 0.25);
      glide(this.O('triangle', f * 2, t, end, h), 2);
    } else if (kind === 'slap' || kind === 'pop') {
      const pop = kind === 'pop';
      const end = this.adsr(g.gain, t, len, v, 0.002, 0.12, 0.45, 0.04);
      const lp = this.F('lowpass', 3000, 3, g);
      lp.frequency.setValueAtTime(pop ? 6500 : 4200, t);
      lp.frequency.setTargetAtTime(pop ? 1300 : 600, t + 0.003, 0.05);
      glide(this.O('sawtooth', f, t, end, lp));
      glide(this.O('triangle', f, t, end, g));
      const gc = this.G(g);
      this.perc(gc.gain, t, pop ? 0.8 : 0.45, 0.01);
      this.N(t, t + 0.05, this.F('bandpass', pop ? 3200 : 1800, 1.5, gc));
    } else if (kind === 'finger') {
      const end = this.adsr(g.gain, t, len, v, 0.008, 0.35, 0.55, 0.07);
      const lp = this.F('lowpass', 750, 1, g);
      glide(this.O('triangle', f, t, end, lp));
      glide(this.O('sawtooth', f, t, end, this.G(lp, 0.35)));
      glide(this.O('sine', f, t, end, g));
    } else if (kind === 'pick') {
      const end = this.adsr(g.gain, t, len, v, 0.002, 0.2, 0.7, 0.04);
      const lp = this.F('lowpass', 1600, 1.5, this.G(this.WS('soft', g), 0.8));
      lp.frequency.setTargetAtTime(900, t + 0.01, 0.1);
      glide(this.O('sawtooth', f, t, end, lp));
      glide(this.O('square', f, t, end, lp, 4));
    } else if (kind === 'reese') {
      const end = this.adsr(g.gain, t, len, v, 0.003, 0.2, 0.9, 0.05);
      const lp = this.F('lowpass', 480, 2.5, g);
      const ws = this.G(this.WS('amp', lp), 0.5);
      for (const det of [-18, 0, 17]) glide(this.O('sawtooth', f, t, end, ws, det));
      glide(this.O('sine', f / 2, t, end, this.G(g, 0.9)), 0.5);
    } else if (kind === 'fm') {
      // DX7 bass: a sine with a sine screaming into its frequency, and a decaying index
      const end = this.adsr(g.gain, t, len, v, 0.002, 0.15, 0.55, 0.05);
      const car = this.O('sine', f, t, end, g);
      glide(car);
      const idx = this.G(car.frequency);
      idx.gain.setValueAtTime(f * 3.2, t);
      idx.gain.setTargetAtTime(f * 0.6, t, 0.08);
      glide(this.O('sine', f, t, end, idx));
      glide(this.O('sine', f / 2, t, end, this.G(g, 0.5)), 0.5);
    }
  }

  // ================================================================ keys & pads
  /** Rhodes: FM with ratio 1 for the bark, ratio 14 for the tine. tremolo comes from the channel. */
  rhodes(t: number, ms: number[], len: number, v: number, bright = 1, ch = 'keys') {
    const c = this.chan(ch);
    ms.forEach((m, i) => {
      const tt = t + i * 0.007 + this.hum();
      const f = mtof(m);
      const g = this.G(c);
      const vv = v * rand(0.85, 1) * (m > 72 ? 0.8 : 1);
      const end = this.adsr(g.gain, tt, len, vv, 0.003, 0.7, 0.35, 0.18);
      const car = this.O('sine', f, tt, end, g, this.wow(tt));
      const idx = this.G(car.frequency);
      idx.gain.setValueAtTime(f * 1.4 * bright, tt);
      idx.gain.setTargetAtTime(f * 0.18, tt, 0.25);
      this.O('sine', f, tt, end, idx, this.wow(tt));
      const tg = this.G(g);
      this.perc(tg.gain, tt, 0.18 * bright, 0.03);
      this.O('sine', f * 14.03, tt, tt + 0.25, tg);
    });
  }
  /** the DX7 "E.PIANO 1": every 80s ballad you half remember */
  dx(t: number, ms: number[], len: number, v: number, ch = 'keys') {
    const c = this.chan(ch);
    ms.forEach((m, i) => {
      const tt = t + i * 0.004 + this.hum();
      const f = mtof(m);
      const g = this.G(c);
      const end = this.adsr(g.gain, tt, len, v * rand(0.85, 1), 0.002, 0.5, 0.3, 0.2);
      const car = this.O('sine', f, tt, end, g);
      const idx = this.G(car.frequency);
      idx.gain.setValueAtTime(f * 2.4, tt);
      idx.gain.setTargetAtTime(f * 0.5, tt, 0.3);
      this.O('sine', f, tt, end, idx);
      const bg = this.G(g);
      const be = this.perc(bg.gain, tt, 0.4, 0.09);
      const bell = this.O('sine', f * 2, tt, be, bg);
      const bi = this.G(bell.frequency);
      bi.gain.setValueAtTime(f * 3, tt);
      bi.gain.setTargetAtTime(0, tt, 0.05);
      this.O('sine', f * 14, tt, be, bi);
    });
  }
  /** felt piano, slightly out of tune, recorded on a cassette in a closet */
  piano(t: number, ms: number[], len: number, v: number, ch = 'keys') {
    const c = this.chan(ch);
    ms.forEach((m, i) => {
      const tt = t + i * 0.012 + this.hum() * 2;
      const f = mtof(m);
      const g = this.G(this.F('lowpass', 2600, 0.7, c));
      const vv = v * rand(0.8, 1);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(vv, tt + 0.006);
      g.gain.setTargetAtTime(vv * 0.4, tt + 0.006, 0.18);
      g.gain.setTargetAtTime(0, tt + 0.3, 1.1);
      g.gain.setTargetAtTime(0, tt + len, 0.12);
      const end = tt + len + 0.5;
      const w = this.wow(tt);
      this.O('sine', f, tt, end, g, w);
      this.O('sine', f * 2, tt, end, this.G(g, 0.35), w + 3);
      this.O('triangle', f * 3, tt, end, this.G(g, 0.08), w - 2);
      const hg = this.G(g);
      this.perc(hg.gain, tt, 0.12, 0.01);
      this.N(tt, tt + 0.05, this.F('bandpass', f * 4, 2, hg));
    });
  }
  organ(t: number, ms: number[], len: number, v: number, kind: 'combo' | 'church' = 'combo', ch = 'organ') {
    const c = this.chan(ch);
    const g = this.G(this.F('lowpass', kind === 'combo' ? 3600 : 2600, 0.7, c));
    const end = this.adsr(g.gain, t, len, v, kind === 'church' ? 0.06 : 0.006, 0.1, 1, kind === 'church' ? 0.4 : 0.05);
    const bars = kind === 'combo' ? [[1, 1, 'square'], [2, 0.45, 'sine'], [3, 0.3, 'sine'], [4, 0.2, 'sine']] : [[0.5, 0.7, 'sine'], [1, 1, 'sine'], [2, 0.7, 'sine'], [3, 0.35, 'sine'], [4, 0.4, 'sine'], [8, 0.15, 'sine']];
    const vg = this.G(g, 1 / Math.sqrt(ms.length));
    for (const m of ms) {
      const f = mtof(m);
      for (const [mult, amp, type] of bars as [number, number, OscillatorType][]) {
        const o = this.O(type, f * mult, t, end, this.G(vg, amp * (type === 'square' ? 0.35 : 1)), rand(-4, 4));
        this.vib(o.detune, t, end, 6.4, 7, 0.05);
      }
    }
    if (kind === 'combo') {
      const kc = this.G(c);
      this.perc(kc.gain, t, v * 0.25, 0.004);
      this.N(t, t + 0.02, this.F('bandpass', 2500, 1, kc));
    }
  }
  pad(t: number, ms: number[], len: number, v: number, kind: 'super' | 'warm' | 'string' | 'glass' | 'dark' = 'super', ch = 'pad') {
    const c = this.chan(ch);
    const a = Math.min(len * 0.3, kind === 'string' ? 0.45 : kind === 'glass' ? 0.25 : 0.7);
    const cut = { super: 2200, warm: 950, string: 2600, glass: 4000, dark: 700 }[kind];
    const lp = this.F('lowpass', cut, kind === 'dark' ? 3 : 0.8, c);
    lp.frequency.setValueAtTime(cut * 0.4, t);
    lp.frequency.linearRampToValueAtTime(cut, t + Math.min(len * 0.5, 2.5));
    const g = this.G(kind === 'string' ? this.F('highpass', 280, 0.7, lp) : lp);
    const end = this.adsr(g.gain, t, len, v / Math.sqrt(ms.length), a, 0.5, 0.85, kind === 'glass' ? 1.2 : 0.7);
    for (const m of ms) {
      const f = mtof(m);
      const w = this.wow(t);
      if (kind === 'glass') {
        this.O('sine', f, t, end, g, w);
        this.O('triangle', f * 2, t, end, this.G(g, 0.25), w + 5);
        continue;
      }
      const dets = kind === 'super' ? [-14, -5, 5, 14] : kind === 'string' ? [-9, 0, 9] : [-7, 7];
      for (const det of dets) {
        const o = this.O(kind === 'warm' ? 'triangle' : 'sawtooth', f, t, end, g, det + w);
        if (kind === 'string') this.vib(o.detune, t, end, 5.2, 9, 0.3);
      }
      if (kind === 'warm' || kind === 'dark') this.O('sawtooth', f, t, end, this.G(g, 0.4), 3);
    }
  }
  choir(t: number, ms: number[], len: number, v: number, vowel = 'a', ch = 'choir') {
    const c = this.chan(ch);
    const g = this.G(c);
    const end = this.adsr(g.gain, t, len, v, Math.min(0.6, len * 0.3), 0.5, 1, 0.9);
    const F = VOW[vowel];
    const bank = [this.F('bandpass', F[0], 6, g), this.F('bandpass', F[1], 9, this.G(g, 0.55)), this.F('bandpass', F[2], 12, this.G(g, 0.3))];
    const src = this.ctx.createGain();
    src.gain.value = 2.4 / Math.sqrt(ms.length);
    for (const b of bank) src.connect(b);
    for (const m of ms) {
      for (const det of [-11, 4, 13]) {
        const o = this.O('sawtooth', mtof(m), t + rand(0, 0.05), end, src, det);
        this.vib(o.detune, t, end, 5.1, 14, 0.4);
      }
    }
    const br = this.G(src, 0.06);
    this.N(t, end, br);
  }

  // ================================================================ leads
  lead(t: number, m: number, len: number, v: number, kind: 'super' | 'square' | 'saw' | 'gtr' | 'sax' | 'brass' | 'scream' | 'bell' | 'pluck' | 'arp' | 'flute', o: { bend?: number; from?: number; vib?: number; ch?: string } = {}) {
    t += this.hum() * 0.5;
    const f = mtof(m);
    const chDef = { gtr: 'solo', bell: 'arp', pluck: 'arp', arp: 'arp' }[kind as string] ?? 'lead';
    const c = this.chan(o.ch ?? chDef);
    const g = this.G(c);
    const w = this.wow(t);
    const pitch = (osc: OscillatorNode, mult = 1) => {
      if (o.bend) {
        osc.frequency.setValueAtTime(f * mult * Math.pow(2, -o.bend / 12), t);
        osc.frequency.setValueAtTime(f * mult * Math.pow(2, -o.bend / 12), t + 0.03);
        osc.frequency.exponentialRampToValueAtTime(f * mult, t + 0.15);
      } else if (o.from !== undefined) {
        osc.frequency.setValueAtTime(mtof(o.from) * mult, t);
        osc.frequency.exponentialRampToValueAtTime(f * mult, t + 0.06);
      }
      return osc;
    };
    const vib = (osc: OscillatorNode, end: number, cents: number, rate = 5.6, onset = 0.22) => {
      if (len > 0.18) this.vib(osc.detune, t, end, rate, (o.vib ?? 1) * cents, onset);
    };
    switch (kind) {
      case 'super': {
        const end = this.adsr(g.gain, t, len, v, 0.012, 0.3, 0.8, 0.14);
        const lp = this.F('lowpass', 5200, 0.7, g);
        for (const det of [-24, -10, 0, 10, 24]) vib(pitch(this.O('sawtooth', f, t, end, this.G(lp, 0.4), det + w)), end, 14);
        pitch(this.O('sawtooth', f * 2, t, end, this.G(lp, 0.12), 3), 2);
        break;
      }
      case 'square': {
        const end = this.adsr(g.gain, t, len, v, 0.006, 0.2, 0.75, 0.08);
        const lp = this.F('lowpass', 3000, 1, g);
        for (const det of [-6, 6]) vib(pitch(this.O('square', f, t, end, this.G(lp, 0.5), det + w)), end, 16);
        break;
      }
      case 'saw': {
        const end = this.adsr(g.gain, t, len, v, 0.008, 0.25, 0.8, 0.1);
        const lp = this.F('lowpass', 2600, 2.5, g);
        lp.frequency.setValueAtTime(5200, t);
        lp.frequency.setTargetAtTime(2200, t, 0.12);
        for (const det of [-7, 7]) vib(pitch(this.O('sawtooth', f, t, end, this.G(lp, 0.5), det + w)), end, 14);
        break;
      }
      case 'gtr': {
        // through the amp on the solo channel. bends, vibrato, and the feedback that blooms on held notes.
        const end = this.adsr(g.gain, t, len, v, 0.003, 0.4, 0.75, 0.07);
        vib(pitch(this.O('sawtooth', f, t, end, g)), end, 28, 6.2, 0.18);
        vib(pitch(this.O('square', f, t, end, this.G(g, 0.5), 5)), end, 28, 6.2, 0.18);
        if (len > 0.5) {
          const fb = this.G(g);
          fb.gain.setValueAtTime(0, t + 0.25);
          fb.gain.linearRampToValueAtTime(0.4, t + len);
          fb.gain.setTargetAtTime(0, t + len, 0.03);
          vib(pitch(this.O('sine', f * 2, t, end, fb), 2), end, 20, 6.2, 0.1);
        }
        break;
      }
      case 'sax': {
        const end = this.adsr(g.gain, t, len, v, 0.03, 0.3, 0.85, 0.07);
        const body = this.G(g, 1);
        const f1 = this.F('bandpass', 800, 1.4, body);
        const f2 = this.F('bandpass', 2300, 3, this.G(body, 0.6));
        const lp = this.F('lowpass', 4200, 0.7, f1);
        lp.connect(f2);
        const src = this.WS('soft', lp);
        const osc = this.O('sawtooth', f, t, end, this.G(src, 1.2));
        osc.frequency.setValueAtTime(f * 0.96, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        pitch(osc);
        vib(osc, end, 20, 5.1, 0.25);
        const br = this.G(g);
        br.gain.setValueAtTime(0, t);
        br.gain.linearRampToValueAtTime(v * 0.18, t + 0.03);
        br.gain.setTargetAtTime(v * 0.05, t + 0.04, 0.1);
        br.gain.setTargetAtTime(0, t + len, 0.03);
        this.N(t, end, this.F('bandpass', 2900, 1, br));
        break;
      }
      case 'brass': {
        const end = this.adsr(g.gain, t, len, v, 0.025, 0.25, 0.75, 0.09);
        const lp = this.F('lowpass', 600, 1.5, g);
        lp.frequency.setValueAtTime(500, t);
        lp.frequency.linearRampToValueAtTime(3600, t + 0.04);
        lp.frequency.setTargetAtTime(1800, t + 0.05, 0.15);
        for (const det of [-8, 0, 8]) vib(pitch(this.O('sawtooth', f, t, end, this.G(lp, 0.35), det)), end, 10, 5.5, 0.3);
        break;
      }
      case 'scream': {
        // the demon synth: saws through fuzz, diving in from above, a filter that wails
        const end = this.adsr(g.gain, t, len, v, 0.01, 0.3, 0.85, 0.1);
        const bp = this.F('bandpass', 1400, 1.6, this.F('lowpass', 5200, 0.7, g));
        bp.frequency.setValueAtTime(700, t);
        bp.frequency.exponentialRampToValueAtTime(2600, t + Math.min(0.5, len));
        bp.frequency.setTargetAtTime(1300, t + Math.min(0.5, len), 0.4);
        const ws = this.G(this.WS('fuzz', bp), 0.6);
        for (const det of [-15, 15]) {
          const osc = this.O('sawtooth', f, t, end, ws, det);
          if (!o.bend && o.from === undefined) {
            osc.frequency.setValueAtTime(f * 1.5, t);
            osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
          } else pitch(osc);
          vib(osc, end, 38, 6.8, 0.15);
        }
        pitch(this.O('square', f / 2, t, end, this.G(ws, 0.6)), 0.5);
        break;
      }
      case 'bell': {
        const end = this.perc(g.gain, t, v, Math.max(0.12, len * 0.5));
        const car = this.O('sine', f, t, end, g, w);
        const idx = this.G(car.frequency);
        idx.gain.setValueAtTime(f * 2.6, t);
        idx.gain.setTargetAtTime(f * 0.1, t, 0.15);
        this.O('sine', f * 3.5, t, end, idx);
        break;
      }
      case 'pluck': {
        const end = this.perc(g.gain, t, v, Math.max(0.08, len * 0.4));
        const lp = this.F('lowpass', 4000, 2, g);
        lp.frequency.setValueAtTime(5000, t);
        lp.frequency.setTargetAtTime(400, t, 0.06);
        this.O('sawtooth', f, t, end, lp, w - 5);
        this.O('sawtooth', f, t, end, lp, w + 5);
        break;
      }
      case 'arp': {
        const end = this.adsr(g.gain, t, len, v, 0.002, 0.08, 0.5, 0.04);
        const lp = this.F('lowpass', 3400, 3, g);
        lp.frequency.setValueAtTime(6000, t);
        lp.frequency.setTargetAtTime(1600, t, 0.05);
        this.O('square', f, t, end, lp, w);
        this.O('sawtooth', f, t, end, this.G(lp, 0.5), w + 8);
        break;
      }
      case 'flute': {
        const end = this.adsr(g.gain, t, len, v, 0.05, 0.3, 0.9, 0.12);
        vib(pitch(this.O('sine', f, t, end, g, w)), end, 12, 5, 0.3);
        pitch(this.O('triangle', f * 2, t, end, this.G(g, 0.12), w), 2);
        const br = this.G(g, v * 0.15);
        this.N(t, end, this.F('bandpass', f * 2, 3, br));
        break;
      }
    }
  }

  /**
   * Formant voice: a buzz through three vowel resonances. `vowels` is a list of [time-fraction, vowel]
   * keyframes. robot = vocoder buzz, fem = shorter vocal tract + breath, shout = gang-vocal grit.
   */
  voice(t: number, m: number, len: number, v: number, vowels: [number, string][] | string, o: { robot?: boolean; fem?: boolean; breath?: number; h?: number; ch?: string; from?: number; fall?: number; vib?: number } = {}) {
    const kf: [number, string][] = typeof vowels === 'string' ? [[0, vowels]] : vowels;
    const c = this.chan(o.ch ?? 'vox');
    const f = mtof(m);
    const g = this.G(c);
    const end = this.adsr(g.gain, t, len, v, o.h ? 0.04 : 0.025, 0.3, 0.9, 0.09);
    const scale = o.fem ? 1.17 : 1;
    const amps = [1, 0.6, 0.32];
    const bank = [0, 1, 2].map((k) => {
      const bp = this.F('bandpass', VOW[kf[0][1]][k] * scale, [5, 9, 12][k], this.G(g, amps[k] * 3));
      for (const [p, vw] of kf) bp.frequency.linearRampToValueAtTime(VOW[vw][k] * scale, t + p * len);
      return bp;
    });
    const src = this.ctx.createGain();
    for (const b of bank) src.connect(b);
    const osc = this.O('sawtooth', f, t, end, src, this.wow(t));
    if (o.from !== undefined) {
      osc.frequency.setValueAtTime(mtof(o.from), t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    }
    if (o.fall) osc.frequency.setTargetAtTime(f * Math.pow(2, -o.fall / 12), t + len * 0.55, len * 0.25);
    if (len > 0.25 && !o.robot) this.vib(osc.detune, t, end, 5.4, (o.vib ?? 1) * 22, 0.25);
    if (o.robot) this.O('square', f, t, end, this.G(src, 0.4), 5);
    const breath = o.breath ?? (o.fem ? 0.22 : 0.06);
    if (breath) {
      const bg = this.G(src, breath);
      this.N(t, end, this.F('highpass', 1200, 0.7, bg));
    }
    if (o.h) {
      // the "h": aspiration through the vowel before the voice comes in
      const hg = this.G(src);
      hg.gain.setValueAtTime(0, t - o.h);
      hg.gain.linearRampToValueAtTime(1.2, t - o.h * 0.4);
      hg.gain.linearRampToValueAtTime(0, t + 0.02);
      this.N(Math.max(0, t - o.h), t + 0.03, hg);
    }
  }

  /** gang vocals. the whole bar is in the car and they all mean it. */
  shout(t: number, word: 'HELL' | 'YEAH' | 'HEY' | 'OW' | 'GO', m: number, v: number) {
    const W: Record<string, { len: number; kf: [number, string][]; h?: number; fall?: number; from?: number }> = {
      HELL: { len: 0.24, kf: [[0, 'e'], [0.55, 'e'], [1, 'l']], h: 0.05, fall: 1 },
      YEAH: { len: 0.5, kf: [[0, 'i'], [0.18, 'e'], [0.45, 'ae'], [1, 'ae']], fall: 4, from: m - 3 },
      HEY: { len: 0.3, kf: [[0, 'e'], [0.6, 'e'], [1, 'i']], h: 0.05, fall: 2 },
      OW: { len: 0.45, kf: [[0, 'a'], [0.55, 'a'], [1, 'u']], from: m - 7, fall: 5 },
      GO: { len: 0.35, kf: [[0, 'uh'], [0.5, 'o'], [1, 'u']], fall: 3 },
    };
    const w = W[word];
    const parts: [number, string][] = [[0, 'vox'], [-12, 'voxL'], [-5, 'voxR'], [0, 'voxL'], [-12, 'voxR']];
    for (const [iv, ch] of parts) {
      this.voice(t + rand(0, 0.025), m + iv + rand(-0.15, 0.15), w.len * rand(0.9, 1.1), v * 0.5, w.kf, { ch, h: w.h, fall: w.fall, from: w.from !== undefined ? w.from + iv : undefined, breath: 0.35, vib: 0.3 });
    }
  }

  // ================================================================ guitars
  /** power chord, double-tracked hard left/right through the amps. mute = palm mute. */
  gtr(t: number, m: number, len: number, v: number, o: { mute?: boolean; iv?: number[]; one?: 'L' | 'R' } = {}) {
    const iv = o.iv ?? [0, 7, 12];
    for (const side of o.one ? [o.one] : ['L', 'R']) {
      const tt = t + (side === 'R' ? rand(0.003, 0.011) : rand(0, 0.004));
      const c = this.chan('gtr' + side);
      const g = this.G(c);
      const end = o.mute ? this.perc(g.gain, tt, v, Math.min(0.06, len * 0.5)) + 0.02 : this.adsr(g.gain, tt, len, v, 0.002, 0.6, 0.7, 0.05);
      const dest = o.mute ? this.F('lowpass', 900, 1.2, g) : g;
      for (const i of iv) this.O('sawtooth', mtof(m + i), tt, end, dest, rand(-7, 7) + (side === 'R' ? 4 : -4));
    }
  }
  /** clean funk guitar: wah'd chord stabs and muted chicken-scratch */
  funk(t: number, ms: number[], len: number, v: number, mute = false) {
    t += this.hum();
    const c = this.chan('gtrC');
    const g = this.G(this.F('highpass', 250, 0.7, c));
    const end = this.perc(g.gain, t, v, mute ? 0.012 : Math.max(0.04, len * 0.35));
    const bp = this.F('bandpass', 700, 3.5, g);
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(mute ? 1500 : 2600, t + 0.06);
    for (const m of ms) this.O('sawtooth', mtof(m), t + rand(0, 0.006), end, bp, rand(-5, 5));
    if (mute) {
      const gn = this.G(g, 0.6);
      this.N(t, end, this.F('bandpass', 2200, 2, gn));
    }
  }
  clav(t: number, m: number, len: number, v: number) {
    t += this.hum();
    const c = this.chan('clav');
    const g = this.G(c);
    const end = this.adsr(g.gain, t, len, v, 0.001, 0.1, 0.4, 0.03);
    const lp = this.F('lowpass', 5000, 3, this.F('highpass', 350, 0.8, g));
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.setTargetAtTime(1500, t, 0.06);
    const f = mtof(m);
    this.O('square', f, t, end, lp);
    this.O('sawtooth', f * 2, t, end, this.G(lp, 0.3), 4);
  }

  // ================================================================ fx
  riser(t: number, len: number, v: number) {
    const g = this.G(this.chan('fx'));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + len);
    g.gain.setTargetAtTime(0, t + len, 0.02);
    const bp = this.F('bandpass', 300, 2.5, g);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + len);
    this.N(t, t + len + 0.1, bp);
    const o = this.O('sawtooth', 110, t, t + len + 0.1, this.G(this.F('lowpass', 2500, 1, g), 0.08));
    o.frequency.exponentialRampToValueAtTime(880, t + len);
  }
  revCym(t: number, len: number, v: number) {
    const g = this.G(this.chan('cym'));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + len);
    g.gain.setValueAtTime(0, t + len + 0.005);
    this.N(t, t + len + 0.01, this.F('highpass', 4500, 0.6, g));
  }
  impact(t: number, v: number) {
    const g = this.G(this.chan('sub'));
    const end = this.perc(g.gain, t, v, 0.35);
    const o = this.O('sine', 75, t, end, this.G(this.WS('soft', g), 1.5));
    o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    const gn = this.G(this.chan('fx'));
    const e2 = this.perc(gn.gain, t, v * 0.6, 0.3);
    this.N(t, e2, this.F('lowpass', 900, 0.7, gn));
  }
  /** sub drop: the floor gives up */
  drop(t: number, m: number, len: number, v: number) {
    const g = this.G(this.chan('sub'));
    const end = this.adsr(g.gain, t, len, v, 0.005, 0.5, 0.8, 0.2);
    const o = this.O('sine', mtof(m + 12), t, end, this.G(this.WS('soft', g), 1.3));
    o.frequency.exponentialRampToValueAtTime(mtof(m), t + len * 0.7);
  }
  thunder(t: number, v: number) {
    const g = this.G(this.chan('fx'));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.06);
    g.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    const f = this.F('lowpass', 320, 0.8, g);
    f.frequency.setValueAtTime(1300, t);
    f.frequency.exponentialRampToValueAtTime(130, t + 2.6);
    this.N(t, t + 4, f, 0.7);
  }
  /** church bell: inharmonic partials (hum, prime, minor tierce, quint, nominal) all decaying differently */
  churchBell(t: number, m: number, v: number) {
    const c = this.chan('fx');
    const f = mtof(m);
    for (const [r, a, tau] of [[0.5, 0.5, 2.5], [1, 0.7, 1.6], [1.19, 0.5, 1.2], [1.5, 0.3, 0.9], [2, 0.45, 0.8], [2.52, 0.2, 0.5], [3.01, 0.15, 0.35]]) {
      const g = this.G(c);
      const end = this.perc(g.gain, t, v * a * 0.5, tau);
      this.O('sine', f * r, t, end, g, rand(-3, 3));
    }
  }
  /**
   * A deer, screaming, in tune. The shriek goes up an octave, lands on the note, then gives up.
   */
  deer(t: number, m: number, len: number, v: number, ch = 'vox') {
    const c = this.chan(ch);
    const g = this.G(c);
    const end = this.adsr(g.gain, t, len, v, 0.04, 0.4, 0.8, 0.25);
    const f = mtof(m);
    const fa = this.F('bandpass', 950, 4, g);
    const fb = this.F('bandpass', 2150, 5, this.G(g, 0.7));
    const src = this.ctx.createGain();
    src.connect(fa);
    src.connect(fb);
    for (const det of [0, 11, -9]) {
      const o = this.O('sawtooth', f, t, end, src, det);
      o.frequency.setValueAtTime(f * 0.75, t);
      o.frequency.exponentialRampToValueAtTime(f * 2, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.32);
      o.frequency.setValueAtTime(f, t + Math.max(0.33, len * 0.8));
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + len + 0.3);
      this.vib(o.detune, t, end, 9, 45, 0.25);
    }
    const br = this.G(g);
    this.perc(br.gain, t, v * 0.25, 0.25, 0.03);
    this.N(t, end, this.F('bandpass', 2900, 1.4, br));
  }
  bleat(t: number, m: number, v: number) {
    const g = this.G(this.chan('vox'));
    const end = this.adsr(g.gain, t, 0.55, v, 0.03, 0.2, 0.8, 0.15);
    const am = this.G(this.F('bandpass', 1100, 2, g), 1);
    const l = this.ctx.createOscillator();
    l.frequency.value = 23;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.6;
    l.connect(lg).connect(am.gain);
    l.start(t);
    l.stop(end);
    const o = this.O('sawtooth', mtof(m), t, end, am);
    o.frequency.linearRampToValueAtTime(mtof(m - 2), t + 0.55);
  }
}
