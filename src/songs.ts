// The radio. Every song is an original composition, written as a chord chart + melodies and performed live by
// the band in music.ts. No samples, no transcriptions, no lawyers.
//
// What makes a song stick (and what the old radio forgot):
//  - A HOOK: a short motif with a recognisable rhythm (tresillo 3+3+2, a pickup into a held note, a leap then a
//    stepwise fall). Stated, repeated, sequenced a step away, then pushed to the song's highest note, then resolved.
//  - Harmony that MOVES with voice leading (each chord's notes slide to the nearest notes of the next), chord tones on
//    strong beats, tension notes (9ths, suspensions, the harmonic-minor leading tone) resolving on weak ones.
//  - Contrast: verses low and sparse, choruses high, wide and loud. Bridges borrow a chord from somewhere else.
//  - Transitions: fills, reverse cymbals, risers, a beat of silence, a key change for the last chorus.
//  - Groove: kick & bass locked, ghost notes, swing, sidechain pump, humanised timing. Machines, but sweaty.
import { mel, under, isMinor, isDom, type SongDef, type X, type Phrase } from './music';

const sec = (name: string, bars: number, ch: string, tr?: number) => ({ name, bars, ch, tr });
/** pitch class → the MIDI note in [lo, lo+11] */
const fit = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);
const has = (sn: string, ...ns: string[]) => ns.some((n) => sn.startsWith(n));

// ============================================================================================ MIDNIGHT CALL
// Night Driver. 92bpm, F minor (written in A minor). The menu theme. A robot sings the verse about a phone that
// won't ring; a woman answers in the chorus from very far away. Half-lit pads, octave-pulse bass, a gated snare
// the size of a parking garage. The last chorus jumps up a whole step through a deceptive cadence (V → VI). Because 1986.
const MID_V = mel(`
  r:6 E4:2 E4 D4 E4:4 | C4:6 r:2 D4 E4 G4 A4 | A4:6 G4:2 E4:4 r:4 | r:4 C4:2 D4 E4 D4 C4:4 |
  r:6 F4:2 F4 E4 F4:4 | D4:6 r:2 E4 F4 A4 B4 | C5:4 B4 A4:2 G#4:6 | r:16`, 16, 'midnight verse');
// the hook: pickup → a held note on the chord's 7th/9th → a sigh back down. sequenced down, then up to the peak.
const MID_H = mel(`
  r:2 A4:2 C5 E5:10 | D5:2 C5 D5 E5:6 r:4 | r:2 G4:2 B4 D5:10 | C5:2 B4 C5 A4:6 r:4 |
  r:2 A4:2 C5 F5:10 | E5:2 D5 E5 G5:6 r:4 | r:2 A4:2 B4 E5:10 | D5:2 C5 B4 G#4:6 r:4`, 16, 'midnight hook');
const MID_B = mel(`F5:6 E5:2 D5:4 A4 | D5:6 C5:2 A4:4 F4 | Bb4:6 A4:2 G4:4 D5 | C#5:8 A#4:4 C#5`, 16, 'midnight bridge');
const MID_VERSE = 'Am9 | Am9 | Fmaj7 | Fmaj7 | Dm9 | Dm9 | Esus4 E | E';
const MID_CHORUS = 'Fmaj7 | G | Em7 | Am | Fmaj7 | G | Esus4 | E';
const ARP8 = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
const VW = ['a', 'o', 'a', 'u', 'e', 'o'];

const midnight: SongDef = {
  title: 'MIDNIGHT CALL', artist: 'NIGHT DRIVER', tempo: 92, gain: 0.74, key: -4, pump: 0.4, echo: 3, room: 3.4,
  form: [
    sec('intro', 4, 'Am9 | Am9 | Fmaj7 | Fmaj7'),
    sec('verse', 8, MID_VERSE), sec('chorus', 8, MID_CHORUS),
    sec('verse2', 8, MID_VERSE), sec('chorus2', 8, MID_CHORUS),
    sec('bridge', 4, 'Dm9 | Bbmaj7 | Gm7 | F#7sus4 F#7'),
    sec('chorus3', 8, MID_CHORUS, 2), sec('outro', 4, 'Am9 | Am9 | Fmaj7 | Fmaj7', 2),
  ],
  loop: 4,
  mix: { snare: { vol: 1, verb: 0.55 }, vox: { vol: 0.8, verb: 0.3, echo: 0.28 }, lead2: { vol: 0.85, pan: 0, verb: 0.45, echo: 0.3 }, arp: { vol: 0.24, echo: 0.42 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const verse = has(sn, 'verse');
    const chorus = has(sn, 'chorus');
    const fillNow = x.last && st >= 12 && (verse || chorus);
    // ---- drums
    if ((verse || chorus) && !fillNow) {
      const kv = x.hit(chorus ? 'X-------X-----x-' : 'X-------X-x-----');
      if (kv) b.kick(t, kv * 0.95, 'deep');
      if (st === 4 || st === 12) {
        b.snare(t, 0.85, 'gated');
        if (chorus) b.clap(t, 0.45);
      }
      const hv = x.hit(chorus ? 'x.x.x.x.x.x.x.x.' : '--x---x---x---x-');
      if (hv) b.hat(t, hv * 0.7, chorus && st === 14);
      if (chorus && st % 4 === 2) b.tamb(t, 0.3);
    }
    if (fillNow) b.fill(x, 12, 0.7);
    if ((verse || chorus) && x.first && st === 0) b.crash(t, chorus ? 1 : 0.6);
    if (sn === 'intro' && sb >= 2) {
      if (st === 0) b.kick(t, 0.75, 'deep');
      if (st % 4 === 2) b.hat(t, 0.35);
      if (sb === 3 && st === 8) b.revCym(t, d * 8, 0.5);
    }
    if (sn === 'outro' && sb < 2 && st % 8 === 0) b.kick(t, 0.7, 'deep');
    if (sn === 'bridge') {
      if (st === 0) b.kick(t, 0.6, 'deep');
      if (x.last && st >= 8) b.snare(t, 0.2 + (st - 8) * 0.08, 'tight');
      if (sb === 2 && st === 0) b.riser(t, d * 32, 0.35);
    }
    if (verse && x.last && st === 8) b.revCym(t, d * 8, 0.45);
    // ---- bass: the octave pulse. 8ths, root, chromatic approach into every chord change
    if (verse || chorus || (sn === 'intro' && sb >= 2) || sn === 'outro') {
      if (st % 2 === 0) {
        let m = fit(x.ch.bass, 28);
        if (st === 14 && x.nx.root !== x.ch.root) {
          const tg = fit(x.nx.bass, 28);
          m = tg + (tg >= m ? -1 : 1);
        } else if (chorus && st % 4 === 2) m += 12;
        b.bass(t, m, d * 1.7, st % 4 === 0 ? 0.85 : 0.62, 'saw');
      }
    } else if (sn === 'bridge' && st === 0) b.bass(t, fit(x.ch.bass, 28), d * 15, 0.7, 'sub');
    // ---- pads
    if (x.chOn) {
      b.pad(t, x.vc('pad', 55, 74, 4), d * x.chLen, chorus ? 0.5 : 0.42, chorus ? 'super' : sn === 'bridge' ? 'string' : 'dark');
      if (sn === 'chorus3' || sn === 'bridge') b.choir(t, x.vc('choir', 60, 76, 3), d * x.chLen, 0.3, 'a');
    }
    // ---- arp (and the phone that won't stop ringing)
    if (chorus || sn === 'verse2' || sn === 'outro' || sn === 'intro') {
      const tones = x.vc('arp', 64, 79, 3);
      const ext = [...tones, tones[0] + 12];
      b.lead(t, ext[ARP8[st]], d * 0.9, sn === 'intro' ? 0.2 + sb * 0.08 : sn === 'outro' ? 0.4 - sb * 0.08 : 0.45, 'arp');
    }
    if (sn === 'intro' && sb < 2 && st < 6) b.lead(t, (st % 2 ? 88 : 84) + x.k, d * 0.6, 0.12, 'bell');
    // ---- voices
    if (verse || sn === 'outro') {
      x.play(MID_V, (m, len, e) => {
        b.voice(t, m, d * len * 0.92, sn === 'outro' ? 0.4 : 0.6, [[0, VW[e.idx % 4]], [1, VW[(e.idx + 1) % 4]]], { robot: true });
        b.lead(t, m, d * len * 0.92, 0.08, 'saw');
      });
    }
    if (chorus) {
      x.play(MID_H, (m, len) => {
        b.voice(t, m, d * len * 0.95, 0.55, [[0, 'a'], [0.7, 'o']], { fem: true, ch: 'lead2' });
        if (sn !== 'chorus') b.lead(t, m - 12, d * len * 0.95, 0.2, 'super');
        if (sn === 'chorus3') b.lead(t, m + 12, d * len * 0.95, 0.12, 'bell');
      });
    }
    if (sn === 'bridge') x.play(MID_B, (m, len) => b.voice(t, m, d * len * 0.95, 0.55, [[0, 'o'], [1, 'a']], { fem: true, ch: 'lead2' }));
    // ---- the room
    if (sn === 'intro' && sb === 0 && st === 0) b.ramp(t, 700, 20000, d * 48);
    if (sn === 'outro' && sb === 2 && st === 0) b.sweep(t, 500, 2.5);
    if (sn === 'verse' && sb === 0 && st === 0) b.sweep(t, 20000, 0.05);
  },
};

// ============================================================================================ NEON OVERDRIVE
// Laser Wolf 1986. 118bpm, D minor. Four on the floor, galloping 16th octave bass, the whole mix pumping on the
// kick. The chorus hook is a tresillo (3+3+2): the rhythm of every song your body agreed to before your brain did.
const OUT_V = mel(`
  E4:2 A4 B4 C5:4 B4:2 A4:4 | r:8 C5:2 B4 A4 G4 | G4:2 C5 D5 E5:4 D5:2 C5:4 | r:8 D5:2 C5 B4 G4 |
  E4:2 A4 B4 C5:4 B4:2 A4:4 | r:8 C5:2 D5 E5 F5 | F5:4 E5 D5 C5 | B4:6 G#4:2 B4:4 E5`, 16, 'outrun verse');
const OUT_H = mel(`
  A4:3 A4 C5:2 B4 A4 G4:4 | G4:3 G4 B4:2 A4 G4 E4:4 | E4:3 A4 C5:2 B4 C5 E5:4 | D5:3 C5 B4:2 G4:8 |
  A4:3 A4 C5:2 B4 A4 G4:4 | G4:3 G4 B4:2 A4 G4 D5:4 | C5:3 B4 G#4:2 B4 E5:6 | D5:2 C5 B4 G#4 A4:8`, 16, 'outrun hook');
const OUT_VERSE = 'Am | F | C | G | Am | F | Dm | E';
const OUT_CHORUS = 'F | G | Am | C | F | G | E | E';

const outrun: SongDef = {
  title: 'NEON OVERDRIVE', artist: 'LASER WOLF 1986', tempo: 118, gain: 0.86, key: 5, pump: 0.6, echo: 3,
  form: [
    sec('intro', 8, 'Am | F | C | G'), sec('verse', 8, OUT_VERSE), sec('chorus', 8, OUT_CHORUS),
    sec('verse2', 8, OUT_VERSE), sec('chorus2', 8, OUT_CHORUS), sec('break', 8, 'Dm | Am | Dm | E7'),
    sec('chorus3', 8, OUT_CHORUS), sec('outro', 4, 'Am | F | C | G'),
  ],
  loop: 8,
  mix: { lead: { vol: 0.85, echo: 0.25, verb: 0.25 }, lead2: { vol: 0.4 }, arp: { vol: 0.22 }, bass: { vol: 0.38 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const verse = has(sn, 'verse');
    const chorus = has(sn, 'chorus');
    const brk = sn === 'break';
    const full = verse || chorus || (sn === 'intro' && sb >= 4) || (sn === 'outro' && sb < 2);
    const fillNow = x.last && st >= 12 && (verse || chorus || sn === 'intro');
    // ---- drums
    if (full && !fillNow) {
      if (st % 4 === 0) b.kick(t, 0.95, 'punch');
      if ((st === 4 || st === 12) && sn !== 'intro') {
        b.snare(t, 0.8, 'gated');
        if (chorus) b.clap(t, 0.4);
      }
      if (st % 4 === 2) b.hat(t, 0.6, true);
      else if (chorus) b.hat(t, x.hit('x.x.x.x.x.x.x.x.') * 0.5);
    }
    if (fillNow) b.fill(x, 12, 0.75);
    if (brk) {
      if (st === 0 || (sb >= 4 && st === 8)) b.kick(t, 0.85, 'punch');
      if (st === 8 && sb < 4) b.snare(t, 0.7, 'gated');
      if (sb === 4 && st === 0) b.riser(t, d * 64, 0.45);
      if (sb >= 6) {
        const every = sb === 6 ? 4 : st < 8 ? 2 : 1;
        if (st % every === 0) b.snare(t, 0.3 + ((sb - 6) * 16 + st) * 0.018, 'tight');
      }
      if (sb === 0 && st === 0) b.sweep(t, 900, 0.3);
      if (sb === 4 && st === 0) b.ramp(t, 900, 20000, d * 64);
    }
    if (x.first && st === 0 && (chorus || verse)) b.crash(t, chorus ? 1 : 0.7);
    if (x.last && x.next.startsWith('chorus') && st === 8) b.revCym(t, d * 8, 0.5);
    // ---- bass: rolling 16th octaves
    if (full || brk) {
      const lo = fit(x.ch.bass, 33);
      const half = brk && sb < 4;
      if (!half || st % 4 === 0) b.bass(t, lo + (st % 2 && !half ? 12 : 0), d * (half ? 3.5 : 0.8), st % 4 === 0 ? 0.85 : 0.55, 'saw');
    }
    // ---- pads & arps
    if (x.chOn) b.pad(t, x.vc('pad', 55, 72, 4), d * x.chLen, chorus ? 0.48 : 0.38, chorus || brk ? 'super' : 'warm');
    if (sn === 'intro' || sn === 'verse2' || brk || sn === 'chorus3' || sn === 'outro') {
      const tones = x.vc('arp', 64, 81, 3);
      const ext = [...tones, tones[0] + 12, tones[1] + 12];
      b.lead(t, ext[[0, 1, 2, 3, 4, 3, 2, 1][st % 8]], d * 0.85, 0.42, 'arp');
    }
    if (sn === 'intro' && sb === 0 && st === 0) b.ramp(t, 500, 20000, d * 64);
    // ---- leads
    if (verse) x.play(OUT_V, (m, len) => b.lead(t, m, d * len * 0.9, 0.42, 'square'));
    if (chorus) {
      x.play(OUT_H, (m, len) => {
        b.lead(t, m, d * len * 0.92, 0.5, 'super');
        if (sn === 'chorus3') b.lead(t, m + 12, d * len * 0.92, 0.22, 'super', { ch: 'lead2' });
      });
    }
    if (brk && sb >= 4) x.play(OUT_H, (m, len) => b.lead(t, m + 12, d * len * 0.9, 0.16 + (sb - 4) * 0.05, 'bell'));
  },
};

// ============================================================================================ KILLER WEATHER
// The Lizard Kings of Highway 666. 92bpm, D dorian (written in E). Rain on the windshield, a finger bass that
// prowls in a two-beat loop, a Rhodes that drips descending licks, a combo organ singing the melody of a man
// who is definitely not okay. 12-bar dorian form with a Cmaj7 → B7#9 turnaround. Then a Rhodes solo.
const STORM_HEAD = mel(`
  B4:8 A4:4 G4 | E4:12 r:4 | G4:4 A4 B4 D5 | B4:16 |
  C#5:8 B4:4 A4 | G4:12 r:4 | B4:8 A4:4 G4 | E4:16 |
  E5:8 D5:4 C5 | B4:8 A4:4 D#4 | E4:16 | r:16`, 16, 'storm head');
const STORM_RIFF = mel(`r:8 B4:1 D5 E5:2 G5 E5 | D5:1 E5 D5 B4 A4:2 G4 E4:8`, 16, 'storm riff');
const SB_M = mel('0:3 0:1 7:2 10 12:3 10:1 7:2 5', 16, 'storm bass m');
const SB_D = mel('0:3 0:1 7:2 10 12:3 10:1 7:2 4', 16, 'storm bass 7');
const SB_J = mel('0:3 0:1 7:2 11 12:3 11:1 7:2 4', 16, 'storm bass maj');
const LICKS = [
  '12:1 15 17 19 22:2 19 17:1 15 12:2 10:4',
  'r:2 19:2 19:1 17 19:2 22:3 24:1 22:2 19',
  '24:1 22 19 17 15 17 15 12 10:2 7 9:4',
  '15:1 16 19:2 12 15:3 12:1 10:2 12:4',
].map((s, i) => mel(s, 16, 'lick ' + i));
const STORM_12 = 'Em7 | Em7 | Em7 | Em7 | A7 | A7 | Em7 | Em7 | Cmaj7 | B7#9 | Em7 | Em7';

const storm: SongDef = {
  title: 'KILLER WEATHER', artist: 'THE LIZARD KINGS OF HIGHWAY 666', tempo: 92, gain: 0.9, key: -2, room: 3,
  form: [
    sec('intro', 4, 'Em7'), sec('head', 12, STORM_12), sec('inter', 4, 'Em7'),
    sec('solo', 12, STORM_12), sec('head2', 12, STORM_12), sec('outro', 4, 'Em7'),
  ],
  loop: 4,
  mix: { keys: { vol: 0.5, trem: 0.3, verb: 0.35 }, organ: { vol: 0.75, verb: 0.4 }, lead: { vol: 0.75, echo: 0.22, verb: 0.35, pan: 0.15 }, bass: { vol: 0.28, duck: 0 }, kick: { vol: 1.4 }, snare: { vol: 2.4, verb: 0.3 }, ride: { vol: 0.6 }, hat: { vol: 0.6 }, fx: { vol: 0.5, verb: 0.3 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const head = has(sn, 'head');
    const solo = sn === 'solo';
    // rain on the windshield. thunder at the turnarounds.
    if (Math.random() < 0.7) b.crackle(t + Math.random() * d, 0.035);
    if (st === 0 && ((sn === 'intro' && sb === 0) || (head && sb === 8) || (sn === 'outro' && sb === 1))) b.thunder(t + d * 3, 0.5);
    // ---- bass: the prowl
    const shape = isMinor(x.ch) ? SB_M : isDom(x.ch) ? SB_D : SB_J;
    if (!(sn === 'outro' && sb === 3)) x.play(shape, (m, len) => b.bass(t, m, d * len * 0.88, st % 4 === 0 ? 0.85 : 0.6, 'finger'), { base: fit(x.ch.root, 31) });
    else if (st === 0) b.bass(t, fit(x.ch.root, 31), d * 14, 0.8, 'finger');
    // ---- drums: brushes, ride with the jazz skip, a kick that barely admits it's there
    const drums = !(sn === 'intro' && sb < 2) && !(sn === 'outro' && sb >= 2);
    if (drums) {
      if (st % 4 === 0) b.ride(t, st % 8 === 0 ? 0.5 : 0.42);
      if ((st === 7 || st === 15) && sn !== 'inter') b.ride(t - d * 0.33, 0.28);
      if (sn !== 'inter') {
        if (st === 0 || st === 10) b.kick(t, st ? 0.4 : 0.6, 'dusty');
        if (st === 4 || st === 12) b.snare(t, 0.5, 'brush');
        if (st === 14 && sb % 2) b.snare(t, 0.3, 'rim');
      }
      if (st === 4 || st === 12) b.hat(t, 0.22);
      if (x.last && st >= 12 && (head || solo)) b.tom(t, [47, 45, 43, 40][st - 12], 0.4);
    }
    // ---- Rhodes comping & riffs
    const comp = x.hit('X-----x---x-----');
    if ((head || solo) && comp) b.rhodes(t, x.vc('rh', 52, 67, 4), d * (st === 0 ? 5 : 3), 0.3 * comp);
    const riffBar = (sn === 'intro' && sb >= 2) || sn === 'inter' || sn === 'outro' || (sn === 'head2' && [2, 3, 6, 7].includes(sb % 12));
    if (riffBar) x.play(STORM_RIFF, (m, len) => b.rhodes(t, [m], d * len * 1.15, 0.42, 1.25), { bar: sb - (sb % 2) });
    // ---- organ sings the head
    if (head) x.play(STORM_HEAD, (m, len) => b.organ(t, [m], d * len * 0.95, 0.5, 'combo'));
    if (sn === 'head2' && x.chOn && sb >= 8) b.organ(t, x.vc('org', 55, 70, 3), d * x.chLen * 0.95, 0.18, 'combo');
    // ---- the solo: four licks, developed and bent to fit each chord
    if (solo) {
      const L = LICKS[[0, 1, 2, 3, 1, 0, 2, 3, 0, 2, 1, 3][sb % 12]];
      const c = x.ch;
      x.play(L, (iv, len) => {
        if (isDom(c) && !c.iv.includes(15) && iv % 12 === 3) iv += 1;
        if (!isMinor(c) && !isDom(c) && (iv % 12 === 3 || iv % 12 === 10)) iv += 1;
        b.rhodes(t, [fit(c.root, 48) + iv], d * len * 0.95, 0.5, 1.4, 'lead');
      });
    }
    if (sn === 'outro' && sb === 2 && st === 0) b.sweep(t, 700, 2);
    if (sn === 'head' && sb === 0 && st === 0) b.sweep(t, 20000, 0.05);
  },
};

// ============================================================================================ PASTEL SUITS
// Sunburn & The Tan Lines. 112bpm, D major (written in C). An 80s radio hit: minor-key verse that keeps a secret,
// a pre-chorus that climbs one step a bar, and a chorus on the "royal road" (IV–V–iii–vi's sunnier cousin) with a
// tresillo hook that leaps an octave the second time. Gated drums, DX7 bass and piano, a cowbell. And a SAX SOLO.
const V1_V = mel(`
  r:2 E4:2 G4:1 A4:3 G4:2 E4 D4 E4 | r:4 C4:2 D4 E4:3 D4:1 C4:2 A3 |
  r:2 F4:2 A4:1 C5:3 A4:2 G4 F4 G4 | r:4 F4:2 E4 D4:3 C4:1 D4:4 |
  r:2 E4:2 G4:1 A4:3 G4:2 E4 D4 E4 | r:4 C4:2 D4 E4:3 G4:1 A4:4 |
  C5:3 B4:1 A4:2 G4 A4:6 r:2 | B4:2 C5 D5:4 G4:8`, 16, 'vice verse');
const V1_P = mel(`A4:2 A4 A4 G4 A4:4 C5 | B4:2 B4 B4 A4 B4:4 D5 | C5:2 C5 C5 B4 C5:4 F5 | E5:4 D5 C5:2 D5:6`, 16, 'vice pre');
const V1_H = mel(`
  E5:3 D5 C5:2 D5:4 E5 | D5:3 C5 B4:2 G4:8 | C5:3 B4 A4:2 B4:4 C5 | A4:3 G4 F4:2 E4:8 |
  E5:3 D5 C5:2 D5:4 E5 | D5:3 C5 B4:2 G5:8 | A5:4 G5 F5 E5 | D5:4 C5:2 D5:10`, 16, 'vice hook');
const V1_SAX = mel(`
  G4:2 C5 E5 G5:4 E5:2 D5 C5 | D5:6 B4:2 G4:4 r:4 | A4:2 C5 E5 A5:4 G5:2 E5 D5 | E5:6 C5:2 A4:4 r:4 |
  G5:1 A5 G5:2 E5 C5 D5 E5 G5:4 | A5:2 B5 D6:8 B5:2 A5 | C6:4 A5 F5 A5 | G5:12 r:4`, 16, 'vice sax');
const V1B_M = mel('0:2 12:1 0 7:2 10 0 3 5 7', 16, 'vice bass m');
const V1B_J = mel('0:2 12:1 0 7:2 11 0 4 5 7', 16, 'vice bass maj7');
const V1B_D = mel('0:2 12:1 0 7:2 10 0 4 5 7', 16, 'vice bass dom');
const V1B_C = mel('0:3 0:1 12:2 0 0 7 12 7', 16, 'vice bass chorus');
const V1_VERSE = 'Am7 | Am7 | Dm7 | Dm7 | Am7 | Am7 | Fmaj7 | G';
const V1_PRE = 'Fmaj7 | Em7 | Dm7 | Gsus4 G';
const V1_CHORUS = 'C | G/B | Am7 | Fmaj7 | C | G/B | Fmaj7 Dm7 | Gsus4 G';

const vice1: SongDef = {
  title: 'PASTEL SUITS', artist: 'SUNBURN & THE TAN LINES', tempo: 112, gain: 0.91, key: 2, room: 2.2,
  form: [
    sec('intro', 4, 'C | G/B | Am7 | Fmaj7'), sec('verse', 8, V1_VERSE), sec('pre', 4, V1_PRE), sec('chorus', 8, V1_CHORUS),
    sec('verse2', 8, V1_VERSE), sec('pre2', 4, V1_PRE), sec('chorus2', 8, V1_CHORUS), sec('solo', 8, V1_CHORUS),
    sec('chorus3', 8, V1_CHORUS), sec('outro', 4, 'C | G/B | Am7 | Fmaj7'),
  ],
  loop: 4,
  mix: { snare: { vol: 0.9, verb: 0.4 }, vox: { vol: 0.6, verb: 0.3, echo: 0.2 }, lead: { vol: 0.5, verb: 0.3, echo: 0.15 }, keys: { vol: 0.42, trem: 0 }, arp: { vol: 0.32, echo: 0.3 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const verse = has(sn, 'verse');
    const pre = has(sn, 'pre');
    const chorus = has(sn, 'chorus');
    const solo = sn === 'solo';
    const big = chorus || solo;
    const fillNow = x.last && st >= 8 && sn !== 'outro';
    // ---- drums: LinnDrum, gated, a cowbell
    if (!fillNow && !(sn === 'outro' && sb === 3)) {
      const kv = x.hit(big ? 'X-----x-X-x---x-' : pre ? 'X---X---X---X---' : 'X-----x-X-------');
      if (kv) b.kick(t, kv * 0.9, 'punch');
      if (st === 4 || st === 12) {
        b.snare(t, 0.8, 'gated');
        if (big || pre) b.clap(t, 0.38);
      }
      const hv = x.hit('x.x.x.x.x.x.x.x.');
      if (hv) b.hat(t, hv * 0.6, big && st === 14);
      if (big && st % 4 === 2) b.cowbell(t, 0.35);
      if (big && (st === 4 || st === 12)) b.tamb(t, 0.45);
    }
    if (fillNow) {
      if (st === 8) b.kick(t, 0.9);
      b.fill(x, 8, 0.75);
    }
    if (x.first && st === 0 && sn !== 'intro') b.crash(t, big ? 1 : 0.6);
    if (x.last && x.next.startsWith('chorus') && st === 8) b.revCym(t, d * 8, 0.45);
    // ---- bass (DX7)
    const bl = fit(x.ch.bass, 33);
    if (pre) {
      if (st % 2 === 0) b.bass(t, bl + (st % 4 === 2 ? 12 : 0), d * 1.6, 0.75, 'fm');
    } else if (!(sn === 'outro' && sb === 3)) {
      const shape = big || sn === 'intro' || sn === 'outro' ? V1B_C : isMinor(x.ch) ? V1B_M : x.ch.iv.includes(11) ? V1B_J : V1B_D;
      x.play(shape, (m, len) => b.bass(t, m, d * len * 0.85, st % 4 === 0 ? 0.8 : 0.6, 'fm'), { base: bl });
    } else if (st === 0) b.bass(t, bl, d * 14, 0.8, 'fm');
    // ---- keys & pads
    const kv = x.hit(big ? '--x--x--x--x-x--' : 'x--x--x---x-----');
    if (kv && !(sn === 'outro' && sb === 3)) b.dx(t, x.vc('ep', 60, 76, 4), d * 2, 0.2);
    if (sn === 'outro' && sb === 3 && st === 0) b.dx(t, x.vc('ep', 60, 76, 4), d * 14, 0.3);
    if ((big || pre) && x.chOn) b.pad(t, x.vc('pad', 55, 72, 4), d * x.chLen, 0.32, 'string');
    // ---- the singer (and a square wave holding her hand)
    const sing = (P: Phrase) =>
      x.play(P, (m, len, e) => {
        b.voice(t, m, d * len * 0.92, 0.55, [[0, VW[e.idx % 6]], [1, VW[(e.idx + 2) % 6]]], { fem: true });
        b.lead(t, m, d * len * 0.92, 0.16, 'square');
      });
    if (verse) sing(V1_V);
    if (pre) sing(V1_P);
    if (chorus) {
      sing(V1_H);
      x.play(V1_H, (m, len) => b.lead(t, m + 12, d * len, 0.2, 'bell'));
    }
    if (sn === 'intro' || sn === 'outro') x.play(V1_H, (m, len) => b.lead(t, m + 12, d * len, 0.3, 'bell'));
    if (solo) x.play(V1_SAX, (m, len) => b.lead(t, m - 12, d * len * 0.95, 0.6, 'sax'));
  },
};

// ============================================================================================ OCEAN AVENUE
// Malibu Cowbell Orchestra. 104bpm, E dorian funk. One chord for a long time (that's the point) — Em9 to A13, the
// dorian IV — slap bass that thumbs the root and pops the octave, a clav, chicken-scratch guitar, congas, and a
// talkbox answering itself. The chorus walks down VI–v–iv–V(#9) under a horn section voiced in close harmony.
const V2_TALK = mel(`
  r:4 B4:2 D5 E5:4 D5:1 B4 G4:2 | A4:2 B4:6 r:8 |
  r:4 C#5:2 E5 F#5:4 E5:1 C#5 A4:2 | B4:2 C#5:6 r:8`, 16, 'funk talkbox');
const V2_HORN = mel(`
  r:2 >G5:1 >G5 r:2 E5:1 G5 r:1 B5:3 A5:2 G5 | F#5:4 D5:2 B4 r:2 D5:1 E5 F#5:2 A5 |
  G5:3 E5:1 C5:2 A4 r:2 >C5:1 >E5 G5:4 | >B4:1 >D5 r:2 >D#5:1 >F#5 r:2 >A5:4 r:4 |
  r:2 >G5:1 >G5 r:2 E5:1 G5 r:1 B5:3 A5:2 G5 | F#5:4 D5:2 B4 r:2 D5:1 E5 F#5:2 A5 |
  G5:3 E5:1 C5:2 A4 r:2 >C5:1 >E5 G5:4 | B5:2 A5 F#5 D#5 B4:4 r:4`, 16, 'funk horns');
const V2_CLAV = mel('0:1 r 0 3 r 0 5 3 r:2 0:1 -2 r -5 -2 0', 16, 'clav');
const V2_CLAVD = mel('0:1 r 0 4 r 0 5 4 r:2 0:1 -2 r -5 -2 0', 16, 'clav7');
const V2B_M = mel('0:2 .0:1 >12 r:2 >10:1 >12 0:3 7:1 .0 >12 3 5', 16, 'slap m');
const V2B_D = mel('0:2 .0:1 >12 r:2 >10:1 >12 0:3 7:1 .0 >12 4 5', 16, 'slap 7');
const V2B_C = mel('0:2 >12 .0:1 0 >12:2 0 7 >12 10', 16, 'slap chorus');
const V2_VERSE = 'Em9 | Em9 | A13 | A13';
const V2_CHORUS = 'Cmaj7 | Bm7 | Am7 | B7#9';

const vice2: SongDef = {
  title: 'OCEAN AVENUE', artist: 'MALIBU COWBELL ORCHESTRA', tempo: 104, gain: 0.73, swing: 0.12, room: 1.8,
  form: [
    sec('intro', 4, 'Em9'), sec('verse', 8, V2_VERSE), sec('chorus', 8, V2_CHORUS), sec('verse2', 8, V2_VERSE),
    sec('chorus2', 8, V2_CHORUS), sec('break', 8, 'Em9'), sec('chorus3', 8, V2_CHORUS), sec('outro', 4, 'Em9'),
  ],
  loop: 4,
  mix: { bass: { vol: 0.36, duck: 0 }, lead: { vol: 1.25, verb: 0.2, echo: 0.1 }, lead2: { vol: 0.6, pan: 0.3, verb: 0.2 }, keys: { vol: 0.36, trem: 0.15 }, gtrC: { vol: 2.2, pan: 0.35, verb: 0.15 }, snare: { vol: 1.3 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const verse = has(sn, 'verse');
    const chorus = has(sn, 'chorus');
    const brk = sn === 'break';
    const fillNow = x.last && st >= 12 && sn !== 'outro' && sn !== 'intro';
    const end = sn === 'outro' && sb === 3;
    // ---- drums
    if (!fillNow && !end) {
      const kv = x.hit('X------x--X-----');
      if (kv) b.kick(t, kv * 0.9, 'punch');
      if (st === 4 || st === 12) b.snare(t, 0.72, 'tight');
      else if (x.hit('-------.-.----.-')) b.snare(t, 0.16, 'tight');
      const hv = x.hit('x.x.x.x.x.x.x.x.');
      if (hv) b.hat(t, hv * 0.55, st === 6 || (chorus && st === 14));
    }
    if (fillNow) b.fill(x, 12, 0.7);
    if (end && st === 0) {
      b.kick(t, 1);
      b.crash(t, 1);
    }
    if (!end) {
      const cv = x.hit('x-.x-.x-x-.x--x.');
      if (cv && (verse || chorus || brk || sn === 'intro')) b.conga(t, cv * 0.7, st % 3);
      if ((chorus || brk) && st % 4 === 2) b.cowbell(t, 0.3);
    }
    if (x.first && st === 0 && sn !== 'intro') b.crash(t, 0.7);
    // ---- slap bass
    if ((sn !== 'intro' || sb >= 2) && !end) {
      const P = chorus ? V2B_C : isDom(x.ch) ? V2B_D : V2B_M;
      x.play(P, (m, len, e) => b.bass(t, m, d * len * 0.8, e.fl.includes('.') ? 0.5 : 0.85, e.fl.includes('>') ? 'pop' : e.fl.includes('.') ? 'ghost' : 'slap'), { base: fit(x.ch.bass, 28) });
    } else if (end && st === 0) b.bass(t, fit(x.ch.bass, 28), d * 12, 0.9, 'slap');
    // ---- clav & chicken-scratch
    if ((verse || brk || sn === 'intro' || sn === 'outro') && !end) x.play(isDom(x.ch) ? V2_CLAVD : V2_CLAV, (m, len) => b.clav(t, m, d * len * 0.7, 0.45), { base: fit(x.ch.root, 60) });
    const gp = x.hit('-x-xX-xx-x-xX-x-');
    if ((verse || chorus) && gp) b.funk(t, x.vc('fg', 62, 76, 3), d * (gp === 1 ? 1.5 : 0.5), gp === 1 ? 0.45 : 0.28, gp < 1);
    if (chorus && x.chOn) b.rhodes(t, x.vc('ep', 55, 70, 4), d * x.chLen * 0.9, 0.28);
    // ---- talkbox & horns
    if (verse) x.play(V2_TALK, (m, len) => b.voice(t, m, d * len * 0.92, 0.6, [[0, 'u'], [0.25, 'a'], [1, 'o']], { robot: true, ch: 'lead' }));
    if (chorus) {
      x.play(V2_HORN, (m, len, e) => {
        const L = d * len * (e.fl.includes('>') ? 0.6 : 0.95);
        b.lead(t, m, L, 0.42, 'brass');
        b.lead(t, under(x.ch, m), L, 0.3, 'brass', { ch: 'lead2' });
        b.lead(t, m - 12, L, 0.22, 'brass', { ch: 'lead2' });
      });
    }
    if (verse && sb % 4 === 3 && (st === 12 || st === 14)) {
      const v = x.vc('stab', 64, 79, 3);
      for (const m of v) b.lead(t, m, d * 0.8, 0.25, 'brass', { ch: 'lead2' });
    }
    // ---- the hype man
    if ((sn === 'intro' && sb === 3 && st === 12) || (brk && sb === 0 && st === 0)) b.shout(t, 'OW', 64, 0.7);
    if (brk && sb % 2 === 1 && st === 12) b.shout(t, 'HEY', 62, 0.65);
    if (brk && sb === 7 && st === 8) b.shout(t, 'GO', 64, 0.6);
  },
};

// ============================================================================================ GUTS ON THE GRILLE
// Slayer of Deer (midnight mix). 135bpm, D Phrygian, nine strings. The riff is four dotted-8th chugs against the
// 4/4 grid (3+3+3+3+2+2) — the ear loses the downbeat and the kick drags it back. The second bar falls down the
// tritone to the flat-two. Synth scream on top, half-time breakdown with sub drops and a choir of the damned.
const D1_RIFF = mel('0:3 0 0 0 1:2 0 | 0:3 0 0:2 6 5 3 1', 16, 'doom1 riff');
const D1_BRK = mel('>0:6 .0:2 >1:6 .0:2 | >0:3 .0:1 .0:2 >6:6 r:4', 16, 'doom1 breakdown');
const D1_LEAD = mel('E5:4 F5 E5:2 Bb4:6 | G4:4 F4 E4:8 | E5:4 F5 G5:2 Bb5:6 | A5:2 G5 F5:4 E5:8', 16, 'doom1 lead');

const doom1: SongDef = {
  title: 'GUTS ON THE GRILLE', artist: 'SLAYER OF DEER (MIDNIGHT MIX)', tempo: 135, gain: 0.79, key: -2, room: 2.4,
  form: [
    sec('intro', 4, 'Em'), sec('riff', 8, 'Em'), sec('riff2', 8, 'Em | Em | C | C | Em | Em | Bb | B'),
    sec('break', 8, 'Em | C | Em | B'), sec('build', 4, 'Em'), sec('final', 8, 'Em | Em | C | C | Em | Em | Bb | B'), sec('outro', 4, 'Em'),
  ],
  loop: 4,
  mix: { gtrL: { vol: 0.42, drive: 3.5 }, gtrR: { vol: 0.42, drive: 3.5 }, lead: { vol: 0.65, echo: 0.15, verb: 0.3 }, lead2: { vol: 0.4 }, bass: { vol: 0.42, duck: 0 }, choir: { vol: 0.38 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const E = 28 + x.k;
    const riff = has(sn, 'riff') || sn === 'final';
    // ---- guitars + kick in unison
    if (riff) {
      if (sb % 4 === 3 && st >= 12) {
        // gatling stutter: Mick would approve
        b.gtr(t, E + (st % 2 ? 12 : 0), d * 0.5, 0.8, { mute: true });
        b.kick(t, 0.75, 'metal');
      } else {
        x.play(D1_RIFF, (m, len) => {
          const open = m !== E || x.st === 0;
          b.gtr(t, m, d * len * 0.9, open ? 0.9 : 0.72, { mute: !open });
          b.kick(t, open ? 1 : 0.8, 'metal');
        }, { base: E });
      }
      if (st === 8 || (sn === 'final' && st === 4)) b.snare(t, 0.85, 'metal');
      if (sn === 'final' && st === 12) b.snare(t, 0.85, 'metal');
      if (st % 4 === 2) b.hat(t, 0.4);
      if (st === 0 && sb % 2 === 0) b.crash(t, 0.9);
      if (st === 0) b.bass(t, E + 12, d * 15.5, 0.5, 'reese');
    }
    if (sn === 'break') {
      x.play(D1_BRK, (m, len, e) => {
        const open = e.fl.includes('>');
        b.gtr(t, m, d * len * 0.95, open ? 1 : 0.7, { mute: !open });
        b.kick(t, 1, 'metal');
      }, { base: E });
      if (st === 8) b.snare(t, 0.95, 'metal');
      if (st % 4 === 0) b.ride(t, 0.5, true);
      if (st === 0 && sb % 2 === 0) b.drop(t, E, d * 30, 0.8);
    }
    if (sn === 'build') {
      const every = [4, 2, 2, 1][sb];
      if (st % every === 0) {
        b.gtr(t, E, d * 0.8, 0.55 + sb * 0.1, { mute: true });
        b.kick(t, 0.8, 'metal');
        b.snare(t, 0.25 + (sb * 16 + st) * 0.011, 'metal');
      }
      if (sb === 0 && st === 0) {
        b.riser(t, d * 64, 0.5);
        b.ramp(t, 400, 20000, d * 64);
      }
    }
    // ---- choir & synths
    if (x.chOn && (sn === 'break' || sn === 'final' || sn === 'intro' || sn === 'riff2')) b.choir(t, x.vc('choir', 52, 67, 3), d * x.chLen, sn === 'riff2' ? 0.25 : 0.4, sn === 'break' ? 'o' : 'a');
    if (sn === 'riff2' || sn === 'final') {
      x.play(D1_LEAD, (m, len) => {
        b.lead(t, m, d * len * 0.95, 0.5, 'scream');
        if (sn === 'final') b.lead(t, m - 12, d * len * 0.95, 0.3, 'scream', { ch: 'lead2' });
      });
    }
    // ---- intro & outro
    if (sn === 'intro') {
      if (sb === 0 && st === 0) {
        b.impact(t, 0.9);
        b.bass(t, E + 12, d * 64, 0.35, 'reese');
      }
      if ((sb === 1 || sb === 2) && st === 0) {
        b.snare(t, 0.8, 'metal');
        b.gtr(t, E, d * 12, 0.7);
      }
      if (sb === 3 && st >= 4 && (st >= 12 || st % 2 === 0)) {
        b.gtr(t, E, d * 0.5, 0.5 + st * 0.03, { mute: true });
        b.kick(t, 0.7, 'metal');
      }
      if (sb === 2 && st === 0) b.riser(t, d * 32, 0.45);
    }
    if (sn === 'outro' && sb === 0 && st === 0) {
      b.gtr(t, E, d * 40, 1);
      b.crash(t, 1);
      b.impact(t, 1);
      b.kick(t, 1, 'metal');
      b.drop(t, E, d * 40, 0.8);
      b.choir(t, [E + 24, E + 31, E + 36], d * 40, 0.4, 'o');
    }
  },
};

// ============================================================================================ THEY FEAR THE FOREARM
// Infernal Chassis. 166bpm, Eb. Tremolo-picked melody in the low strings over double kicks, a gallop riff on
// E–F–C–B (that B major is the harmonic minor's evil grin), twin lead guitars in harmony, BFG arpeggios.
const D2_TREM = mel('0:1 0 0 0 1 1 1 1 0 0 0 0 3 3 1 1 | 0 0 0 0 6 6 6 6 5 5 5 5 3 3 1 1', 16, 'doom2 trem');
const D2_BRK = mel('>0:4 .0:2 .0 >0:3 .0:1 >1:4 | >0:4 .0:2 .0 >6:3 .5:1 >3:4', 16, 'doom2 breakdown');
const D2_LEAD = mel('B4:2 E5 G5 E5 B5:4 A5:2 G5 | A5:4 G5:2 F5 E5:4 C5 | G5:2 E5 C5 E5 G5:4 A5:2 B5 | ^D#6:8 C6:2 B5:6', 16, 'doom2 lead');
const D2_GAL = 'E | F | C | B';

const doom2: SongDef = {
  title: 'THEY FEAR THE FOREARM', artist: 'INFERNAL CHASSIS', tempo: 166, gain: 0.7, key: -1, room: 2.2, echo: 3,
  form: [
    sec('intro', 4, D2_GAL), sec('riffA', 8, 'Em'), sec('riffB', 8, D2_GAL), sec('lead', 8, D2_GAL),
    sec('break', 8, D2_GAL), sec('riffA2', 8, 'Em'), sec('final', 8, D2_GAL), sec('outro', 2, 'Em'),
  ],
  loop: 4,
  mix: { gtrL: { vol: 0.48, drive: 3.5 }, gtrR: { vol: 0.48, drive: 3.5 }, solo: { vol: 0.3, drive: 2.5 }, solo2: { vol: 0.24, drive: 2.5 }, bass: { vol: 0.4, duck: 0 }, arp: { vol: 0.2 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const E = 28 + x.k;
    const trem = has(sn, 'riffA');
    const gal = sn === 'riffB' || sn === 'lead' || sn === 'final';
    if (trem) {
      x.play(D2_TREM, (m) => b.gtr(t, m, d * 0.9, 0.7, { mute: true }), { base: E });
      b.kick(t, st % 2 ? 0.5 : 0.7, 'metal');
      const blast = sb >= 4;
      if (blast ? st % 2 === 0 : st === 4 || st === 12) b.snare(t, blast ? 0.5 : 0.85, 'metal');
      if (st % 4 === 0) b.crash(t, blast ? 0.5 : 0.35);
      if (st === 0 && sb % 2 === 0) b.bass(t, E + 12, d * 31, 0.45, 'reese');
    }
    if (gal) {
      const R = fit(x.ch.root, 22);
      const gv = x.hit('X-xxX-xxX-xxX-xx');
      if (gv) {
        b.gtr(t, R, d * (gv === 1 ? 1.6 : 0.8), gv, { mute: gv < 1 });
        b.kick(t, 0.9 * gv, 'metal');
      }
      if (st === 4 || st === 12) b.snare(t, 0.85, 'metal');
      if (st === 0) {
        b.crash(t, sn === 'final' ? 1 : 0.6);
        b.bass(t, R + 12, d * 15.5, 0.5, 'reese');
      }
      if (st % 2 === 0 && st % 4) b.hat(t, 0.4);
    }
    if (sn === 'break') {
      x.play(D2_BRK, (m, len, e) => {
        const open = e.fl.includes('>');
        b.gtr(t, m, d * len * 0.95, open ? 1 : 0.7, { mute: !open });
        b.kick(t, 1, 'metal');
      }, { base: E });
      if (st === 8) b.snare(t, 1, 'metal');
      if (st % 4 === 0) b.ride(t, 0.5, true);
      if (st === 0 && sb % 2 === 0) b.drop(t, E, d * 30, 0.7);
    }
    if (x.chOn && (sn === 'break' || sn === 'intro' || sn === 'final')) b.choir(t, x.vc('choir', 52, 67, 3), d * x.chLen, 0.4, 'a');
    if (sn === 'lead' || sn === 'final') {
      x.play(D2_LEAD, (m, len, e) => {
        const bend = e.fl.includes('^') ? 2 : 0;
        b.lead(t, m, d * len * 0.95, 0.5, 'gtr', { bend });
        b.lead(t, under(x.ch, m), d * len * 0.95, 0.42, 'gtr', { bend, ch: 'solo2' });
      });
    }
    if (sn === 'final' || sn === 'riffA2') {
      const tones = x.vc('arp', 64, 79, 3);
      const ext = [...tones, tones[0] + 12, tones[1] + 12];
      b.lead(t, ext[[0, 1, 2, 3, 4, 3, 2, 1][st % 8]], d * 0.8, 0.35, 'arp');
    }
    if (sn === 'intro') {
      if (sb === 0 && st === 0) {
        b.impact(t, 1);
        b.ramp(t, 300, 20000, d * 64);
      }
      if (sb >= 2) x.play(D2_TREM, (m) => b.gtr(t, m, d * 0.9, 0.3 + (sb - 2) * 0.25 + st * 0.01, { mute: true }), { base: E });
      if (sb === 3 && st >= 8 && st % 2 === 0) b.snare(t, 0.4 + st * 0.03, 'metal');
    }
    if (sn === 'outro' && sb === 0 && st === 0) {
      b.gtr(t, E, d * 28, 1);
      b.crash(t, 1);
      b.impact(t, 1);
      b.drop(t, E, d * 28, 0.8);
    }
  },
};

// ============================================================================================ HELL YEAH (EXTENDED)
// The Forearms. 152bpm, E. Arena rock. The riff answers itself: chord stab, two muted chugs, a lift to G–A, and the
// second time around a chromatic climb A–Bb–B that slams back home. Chorus moves to A (IV) for the sing-along,
// the gang yells HELL YEAH, the guitar answers with a bent-note lick. Solo with twin harmony leads. A stop-time
// breakdown. A big dumb rock ending. Then the drummer counts it in again, because the drummer never stops.
const HY_RIFF = mel(`>E2:3 r:1 .E2:1 .E2 >G2:2 >A2:3 r:1 .E2:1 .E2 >D3:2 | >E2:3 r:1 .E2:1 .E2 >G2:2 >A2 >Bb2:1 >B2:5`, 16, 'hy riff');
const HY_ANS = mel(`
  r:16 | r:4 B4:1 D5 E5:2 ^G5 E5 D5 B4 | r:16 | r:4 E5:1 G5 A5:2 ^B5 A5 G5 E5 |
  r:16 | r:4 B4:1 D5 E5:2 ^G5 E5 D5 B4 | r:16 | r:4 F#5:2 A5 ^B5:6 A5:1 F#5`, 16, 'hy answer');
const HY_SOLO = mel(`
  ^E5:4 D5:2 B4 E5:4 r:2 G5:1 A5 | ^B5:8 A5:1 G5 E5 D5 E5:4 |
  C#5:2 E5 A5 C#6 B5:1 A5 F#5 E5 C#5:4 | E5:1 G5 A5 B5 D6 E6 D6 B5 A5 G5 E5 D5 E5:4 |
  F#5:2 A5 ^B5:4 A5:1 F#5 D#5:2 B4:4 | A5:2 C#6 ^E6:8 C#6:2 B5 |
  G5:2 A5 B5 D6 E6:4 D6:2 B5 | D#6:2 C#6 B5 A5 F#5:4 D#5`, 16, 'hy solo');
const HY_TWIN = mel(`r:96 | E5:2 F#5 G5 B5 B5:4 B5:2 G5 | B5:2 A5 F#5 F#5 D#5:4 B4`, 16, 'hy twin');
const HY_CHORUS = 'A5 | E5 | D5 | A5 | A5 | E5 | D5 | B5';

const hellyeah: SongDef = {
  title: 'HELL YEAH (EXTENDED)', artist: 'THE FOREARMS', tempo: 152, gain: 0.66, room: 2,
  form: [
    sec('intro', 4, 'E5'), sec('verse', 8, 'E5'), sec('pre', 4, 'C5 | D5 | C5 | D5'), sec('chorus', 8, HY_CHORUS),
    sec('verse2', 8, 'E5'), sec('pre2', 4, 'C5 | D5 | C5 | D5'), sec('chorus2', 8, HY_CHORUS),
    sec('solo', 8, 'E5 | E5 | A5 | E5 | B5 | A5 | E5 | B5'), sec('break', 4, 'E5 | E5 | E5 | B5'),
    sec('chorus3', 8, HY_CHORUS), sec('outro', 4, 'E5'),
  ],
  loop: 0,
  mix: { gtrL: { vol: 0.4, drive: 2.2 }, gtrR: { vol: 0.4, drive: 2.2 }, solo: { vol: 0.45, drive: 2.2, echo: 0.15 }, solo2: { vol: 0.34, drive: 2.2 }, bass: { vol: 0.5, duck: 0 }, snare: { vol: 1.2, verb: 0.25 }, vox: { vol: 0.95, verb: 0.3 }, voxL: { vol: 0.75, pan: -0.45, verb: 0.35 }, voxR: { vol: 0.75, pan: 0.45, verb: 0.35 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const verse = has(sn, 'verse');
    const pre = has(sn, 'pre');
    const chorus = has(sn, 'chorus');
    const solo = sn === 'solo';
    const brk = sn === 'break';
    const intro = sn === 'intro';
    const outro = sn === 'outro';
    // one, two, one two three four
    if (intro && sb === 0) {
      if (st % 4 === 0) b.sticks(t, 0.9);
      return;
    }
    // ---- rhythm guitars & bass
    if (verse || intro) {
      const alone = intro && sb < 3;
      x.play(HY_RIFF, (m, len, e) => {
        const mute = e.fl.includes('.');
        b.gtr(t, m, d * len * (mute ? 0.6 : 0.92), mute ? 0.6 : 0.85, { mute, one: alone ? 'L' : undefined });
        if (!alone) b.bass(t, m - 12, d * len * 0.9, mute ? 0.55 : 0.8, 'pick');
      }, { bar: intro ? 1 : 0 });
    }
    if (pre || solo || chorus) {
      const R = fit(x.ch.root, 38);
      const ring = st === 0 || (chorus && x.chOn);
      if (ring) b.gtr(t, R, d * (chorus ? 7.5 : 5.5), 0.85);
      else if (st % 2 === 0 && !(chorus && st < 8)) b.gtr(t, R, d * 0.9, 0.6, { mute: true });
      if (st % 2 === 0) b.bass(t, R - 12, d * 1.8, st % 4 ? 0.6 : 0.8, 'pick');
    }
    if (brk) {
      const R = fit(x.ch.root, 38);
      if (st === 0 && sb < 3) {
        b.gtr(t, R, d * 3, 1);
        b.bass(t, R - 12, d * 3, 0.9, 'pick');
        b.kick(t, 1, 'rock');
        b.crash(t, 1);
      }
      if (sb === 3) {
        b.gtr(t, R, d * 0.6, 0.5 + st * 0.03, { mute: true });
        b.snare(t, 0.35 + st * 0.04, 'fat');
        if (st === 0) b.riser(t, d * 16, 0.4);
      }
      if (sb < 3 && st === 4) b.shout(t, 'HELL', 64, 0.8);
      if (sb < 3 && st === 8) b.shout(t, 'YEAH', 64, 0.8);
    }
    // ---- drums
    const fillNow = x.last && st >= 12 && !outro && !brk && !(intro && sb < 3);
    if ((verse || chorus || solo || pre || (intro && sb === 3)) && !fillNow) {
      const kv = x.hit(chorus ? 'X---X-x-X---X-x-' : pre ? 'X-x-X-x-X-x-X-x-' : 'X-------X-x-----');
      if (kv) b.kick(t, kv, 'rock');
      if (st === 4 || st === 12) b.snare(t, 0.95, 'fat');
      if (pre && sb === 3 && st % 2 === 0 && st !== 4 && st !== 12) b.snare(t, 0.4 + st / 40, 'fat');
      if (chorus || solo) {
        if (st % 2 === 0) b.ride(t, 0.45);
      } else {
        const hv = x.hit('x-x-x-x-x-x-x-x-');
        if (hv) b.hat(t, hv * 0.7, st === 14 && verse);
      }
    }
    if (fillNow) b.fill(x, 12, 0.9);
    if (x.first && st === 0 && (chorus || solo || verse)) b.crash(t, 1);
    if (pre && sb === 0 && st === 0) b.riser(t, d * 64, 0.3);
    // ---- the gang
    if (chorus) {
      const m = fit(x.ch.root + 7, 57);
      if (sb % 2 === 0 && st === 0) b.shout(t, 'HELL', m, 0.85);
      if (sb % 2 === 0 && st === 4) b.shout(t, 'YEAH', m, 0.85);
      if (sb === 7 && st < 12 && st % 4 === 0) b.shout(t, 'HEY', m, 0.8);
      x.play(HY_ANS, (n, len, e) => b.lead(t, n, d * len * 0.95, 0.55, 'gtr', { bend: e.fl.includes('^') ? 2 : 0 }));
    }
    if (verse && sb % 4 === 3 && st === 12) b.shout(t, 'HEY', 59, 0.75);
    if (pre && sb === 3 && st < 12 && st % 4 === 0) b.shout(t, 'HEY', 62, 0.8);
    // ---- the solo
    if (solo) {
      x.play(HY_SOLO, (n, len, e) => b.lead(t, n, d * len * 0.95, 0.6, 'gtr', { bend: e.fl.includes('^') ? 2 : 0 }));
      x.play(HY_TWIN, (n, len) => b.lead(t, n, d * len * 0.95, 0.45, 'gtr', { ch: 'solo2' }));
    }
    // ---- the big dumb rock ending
    if (outro) {
      if (sb === 0 && st === 0) {
        b.gtr(t, 40, d * 44, 1);
        b.bass(t, 28, d * 44, 0.9, 'pick');
        b.crash(t, 1);
        b.kick(t, 1, 'rock');
      }
      if (sb < 3) {
        if (st % 4 === 0) b.crash(t, 0.6);
        b.tom(t, [52, 50, 47, 45, 43, 40][(st + sb * 3) % 6], 0.35 + (sb * 16 + st) * 0.01);
        if (st % 2) b.kick(t, 0.6, 'rock');
      }
      if (sb === 3 && st === 0) {
        b.gtr(t, 40, d * 14, 1);
        b.bass(t, 28, d * 14, 1, 'pick');
        b.crash(t, 1);
        b.kick(t, 1, 'rock');
        b.snare(t, 1, 'fat');
        b.shout(t, 'YEAH', 64, 0.9);
      }
    }
  },
};

// ============================================================================================ BEATS TO CRY & DRIVE TO
// Lofi Goat. 76bpm, Db (written in C). ii–V–I–VI with rootless voicings, then a bridge with the saddest chord in
// pop (the minor iv: Fmaj9 → Fm9, the melody repeats with every note flattened) and a tritone substitution.
// Swung 16ths, tape wow, vinyl crackle, a bass that anticipates every chord by a 16th like it's afraid of them.
const LO_A = mel(`
  r:4 E5:2 F5 A5:4 G5:2 E5 | F5:3 E5:1 D5:4 r:4 B4:2 D5 | E5:8 D5:2 B4 G4:4 | Bb4:4 C#5 E5:2 G5 F5:4 |
  r:4 E5:2 F5 A5:4 C6:2 A5 | B5:3 A5:1 G5:4 r:2 F5 E5 D5 | E5:12 r:4 | r:8 C#5:2 E5 G5 Bb5`, 16, 'lofi A');
const LO_B = mel(`
  A5:6 G5:2 E5:4 C5 | Ab5:6 G5:2 Eb5:4 C5 | G5:4 F#5:2 E5 D5:4 B4 | C#5:4 Bb4 G4 E4 |
  F5:2 E5 F5 A5 C6:8 | B5:4 Ab5 F5:2 Eb5 Db5:4 | D5:2 E5:14 | r:16`, 16, 'lofi B');
const LO_AC = 'Dm9 | G13 | Cmaj9 | A7b9';
const LO_BC = 'Fmaj9 | Fm9 | Em7 | A7b9 | Dm9 | Db9 | Cmaj9 | Cmaj9';

const lofi: SongDef = {
  title: 'BEATS TO CRY & DRIVE TO', artist: 'LOFI GOAT', tempo: 76, gain: 1.37, key: 1, swing: 0.2, wow: 9, room: 2.4,
  form: [
    sec('intro', 4, LO_AC), sec('A', 8, LO_AC), sec('A2', 8, LO_AC), sec('B', 8, LO_BC),
    sec('A3', 8, LO_AC), sec('A4', 8, LO_AC), sec('outro', 4, LO_AC),
  ],
  loop: 4,
  mix: { keys: { vol: 0.5, trem: 0.08, verb: 0.25 }, lead2: { vol: 0.8, pan: 0.1, verb: 0.35, echo: 0.25 }, bass: { vol: 0.3, duck: 0.3 }, snare: { vol: 1, verb: 0.12 }, hat: { vol: 0.26 }, fx: { vol: 0.5, verb: 0.05 }, vox: { vol: 0.4, verb: 0.55, echo: 0.3 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    // the record
    if (Math.random() < 0.55) b.crackle(t + Math.random() * d, 0.04);
    if (st === 0) b.hiss(t, d * 16, 0.012);
    const drums = sn === 'A' || sn === 'A2' || sn === 'B' || sn === 'A4' || (sn === 'intro' && sb === 3 && st >= 8);
    if (drums && !(sn === 'intro')) {
      const kv = x.hit('X------x--X-----');
      if (kv) b.kick(t, kv * 0.85, 'dusty');
      if (st === 4 || st === 12) b.snare(t, 0.7, 'lofi');
      if (st === 15 && sb % 4 === 3) b.snare(t, 0.3, 'rim');
      const hv = x.hit('x-x.x-x.x-x.x-xx');
      if (hv) b.hat(t, hv * 0.5);
    }
    if (sn === 'intro' && sb === 3 && st >= 8 && st % 2 === 0) b.snare(t, 0.2 + (st - 8) * 0.03, 'lofi');
    // ---- bass: anticipates the next chord on the last 16th
    if (!(sn === 'intro' && sb < 2) && !(sn === 'outro' && sb === 3)) {
      const lo = fit(x.ch.bass, 36);
      if (st === 15 && x.nx.root !== x.ch.root) b.bass(t, fit(x.nx.bass, 36), d * 8, 0.8, 'sub');
      if (st === 0 && x.pv.root === x.ch.root) b.bass(t, lo, d * 7, 0.8, 'sub');
      if (st === 10) b.bass(t, lo + 7, d * 2.5, 0.55, 'sub');
      if (st === 13) b.bass(t, lo + 12, d * 1.5, 0.4, 'sub');
    }
    // ---- piano chords
    if (x.chOn) {
      const v = x.vc('pn', 55, 72, 4);
      b.piano(t, v, d * 9, sn === 'A3' ? 0.22 : 0.28);
    }
    if (st === 10 && sn !== 'intro') b.piano(t, x.vc('pn', 55, 72, 4).slice(1), d * 5, 0.16);
    // ---- melody
    if (sn === 'A2' || sn === 'A4') x.play(LO_A, (m, len) => b.rhodes(t, [m], d * len * 1.05, 0.38, 0.8, 'lead2'));
    if (sn === 'B') x.play(LO_B, (m, len) => b.rhodes(t, [m], d * len * 1.05, 0.38, 0.8, 'lead2'));
    if (sn === 'A3') x.play(LO_A, (m, len) => b.piano(t, [m + 12], d * len, 0.15, 'lead2'));
    // ---- a voice somewhere in the next apartment
    if ((sn === 'A4' || sn === 'B') && sb % 2 === 1 && st === 8) b.voice(t, fit(x.ch.root + 2, 72), d * 7, 0.32, [[0, 'u'], [1, 'o']], { fem: true, breath: 0.3 });
    // ---- the room
    if (sn === 'intro' && sb === 0 && st === 0) b.sweep(t, 800, 0.01);
    if (sn === 'intro' && sb === 3 && st === 8) b.sweep(t, 20000, 0.4);
    if (sn === 'A3' && sb === 0 && st === 0) b.sweep(t, 1500, 0.6);
    if (sn === 'A3' && sb === 7 && st === 8) b.sweep(t, 20000, 0.3);
    if (sn === 'outro' && sb === 1 && st === 0) b.sweep(t, 500, 3);
    if (sn === 'A' && sb === 0 && st === 0) b.sweep(t, 20000, 0.05);
  },
};

// ============================================================================================ ETERNAL BLEAT
// The Deer You Hit. 66bpm in 6/8, D minor. A funeral waltz. Church organ, bells, nine-string doom, and the lead
// vocal is a deer, screaming, in tune. i–VI–iv–V, harmonic minor, and at the very end a Picardy third:
// the deer has forgiven you. (the deer has not forgiven you.)
const DEER_M = mel('E5:6 D5:2 C5 B4 | A4:6 C5:6 | F5:6 E5:2 D5 C5 | B4:12 | E5:6 D5:2 C5 B4 | A4:6 F5:6 | G#4:6 B4:4 D5:2 | C5:6 A4:6', 12, 'deer');
const DEER_C = 'Am | F | Dm | E | Am | F | E | Am';

const deer: SongDef = {
  title: 'ETERNAL BLEAT', artist: 'THE DEER YOU HIT', tempo: 66, gain: 0.91, key: -7, spb: 12, room: 4,
  form: [
    sec('intro', 4, 'Am | Am | F | E'), sec('verse', 8, DEER_C), sec('deer', 8, DEER_C),
    sec('break', 4, 'Dm | Dm | E | E'), sec('deer2', 8, DEER_C), sec('outro', 4, 'Am | F | E | A'),
  ],
  loop: 4,
  mix: { gtrL: { vol: 0.32, drive: 3 }, gtrR: { vol: 0.32, drive: 3 }, organ: { vol: 0.26, verb: 0.5 }, vox: { vol: 1.1, verb: 0.55, echo: 0.1 }, lead2: { vol: 0.7, verb: 0.55 }, snare: { vol: 1.1, verb: 0.6 }, fx: { vol: 0.5, verb: 0.6 } },
  play(x) {
    const { b, t, st, sn, sb, d } = x;
    const lam = sn === 'verse' || sn === 'deer' || sn === 'deer2';
    const outro = sn === 'outro';
    if ((sn === 'intro' || sn === 'break') && st === 0) b.hiss(t, d * 12, 0.03);
    if (st === 0 && (sn === 'intro' || sn === 'break' || (outro && sb === 3) || (lam && sb % 2 === 0))) b.churchBell(t, 62, 0.7);
    if (x.chOn) b.organ(t, x.vc('org', 50, 67, 4), d * 12, sn === 'intro' ? 0.3 : 0.38, 'church');
    if ((lam || outro) && st === 0) {
      const R = fit(x.ch.root, 26);
      b.gtr(t, R, d * (outro && sb === 3 ? 30 : 8.5), 0.8);
      b.bass(t, R + 12, d * (outro && sb === 3 ? 30 : 11.5), 0.5, 'reese');
    }
    if (lam && st === 9) b.gtr(t, fit(x.ch.root, 26), d * 2, 0.6, { mute: true });
    if (lam || (outro && sb < 3)) {
      if (st === 0) b.kick(t, 1, 'deep');
      if (st === 6) b.snare(t, 0.85, 'fat');
      if (sn === 'deer2' && st >= 9) b.kick(t, 0.6, 'deep');
      if (st % 3 === 0) b.ride(t, 0.25);
      if (st === 0 && sb % 4 === 0) b.crash(t, 0.8);
    }
    if (outro && sb === 3 && st === 0) {
      b.kick(t, 1, 'deep');
      b.crash(t, 1);
      b.choir(t, x.vc('choir', 57, 72, 3), d * 30, 0.5, 'o');
    }
    if (x.last && st >= 8 && lam) b.tom(t, [45, 43, 40, 38][st - 8], 0.6);
    // ---- the soloist
    if (sn === 'deer' || sn === 'deer2') {
      x.play(DEER_M, (m, len) => {
        b.deer(t, m, d * len * 0.95, 0.42);
        if (sn === 'deer2') b.deer(t, under(x.ch, m), d * len * 0.95, 0.28, 'lead2');
      });
    }
    if (x.chOn && (sn === 'deer2' || sn === 'break')) b.choir(t, x.vc('choir', 57, 72, 3), d * 12, 0.35, 'o');
    if (sn === 'verse' && sb % 2 === 1 && st === 6) b.deer(t, fit(x.ch.root + 7, 69), d * 4, 0.22);
    if (sn === 'break' && (st === 0 || st === 6) && (sb + st) % 3 !== 2) b.bleat(t, fit(x.ch.root + [0, 3, 7][(sb * 2 + st) % 3], 62), 0.4);
  },
};

export const SONGS: Record<string, SongDef> = { hellyeah, midnight, outrun, storm, vice1, vice2, doom1, doom2, lofi, deer };
