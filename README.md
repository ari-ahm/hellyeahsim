# HELL YEAH SIMULATOR

> *The "driving in my car right after a beer" experience™ — now with 300% more forearm.*

A first-person driving sim / art piece built around one meme: a hyper-vascular forearm draped over a
steering wheel at 3:33 AM. Drink, smoke, flex, answer cursed phone calls, hit deer (they're polygons),
and HELL YEAH down Highway 666.

**Do your hell yeahing in the game, not on the streets.** Never drink and drive. Don't smoke.

Everything is generated at runtime — the arm is sculpted from signed distance fields, every texture is
drawn on a canvas, and every sound (engine, coughs, deer screams, nine radio stations of original music)
is synthesized with the Web Audio API. There are no asset files.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

Click / press a key on the warning screen (browsers need a gesture before audio can start). The first load
takes a few seconds while the forearm is forged in a Web Worker.

## Controls

| Key | Action |
|---|---|
| `W` / `S` | gas / brake (`W`+`S` at a standstill = burnout) |
| `A` / `D` | steer |
| `B` | crack a cold one (two-handed: both hands leave the wheel) |
| `C` | smoke a cigarette (4 drags) |
| `G` | flex the forearm |
| `Q` (hold) | hand out the window |
| `H` / `Space` | HELL YEAH (full meter = HELL YEAH MODE) |
| `E` | answer the dash phone |
| `F` | honk |
| `R` | next radio station |
| `V` | graphics mode |
| `T` | world theme (desert / vice) |
| `M` / `P` | mute / pause |
| mouse drag | free-look |
| title: `K` | choose a mask |
| title: `U` | 📼 mixtape (load your own music) |
| while driving, type `666` | 🤫 |

## Features

- **The Forearm** — SDF-sculpted muscular arm with a procedurally grown vein network, meshed with Surface
  Nets and skinned to an 18-bone rig. Veins throb with your heart rate, pump when you flex and glow like lava
  in HELL YEAH mode. The right hand drapes over the wheel like the meme; the left rests out the window and
  grazes the wheel when the right hand is busy.
- **Vices** — fully animated beer (grab, ring-pull with the other hand, fizz, chug, crush, toss onto a growing
  pile), cigarettes (light, inhale with the cherry flaring in view, exhale smoke into the cabin, flick the butt),
  blood alcohol (drunk vision, steering drift, blackouts) and lung HP (coughing fits, a chance of lung
  cancer at 0).
- **Driving** — endless curving highway, traffic, deer, cops with a heat level, near misses, burnouts, a
  rearview mirror that actually renders, windshield cracks, fuzzy dice physics.
- **Graphics modes** — `BUCKSHOT` (default: low-res, Bayer-dithered, crushed palette), `HD (RTX ON)`,
  `VHS 1997`, `DEEP FRIED`, `MIAMI 1989`. Audio is bit-crushed to match each mode.
- **Radio** — HELL YEAH FM, NIGHTCALL FM, VICE FM, HELLFIRE FM, LOFI GOAT RADIO, DEER SCREAMS 24/7,
  MIXTAPE FM. All songs are original compositions.
- **Killer mode** — a storm with rain on the glass, wipers, lightning, noir grading, Hotline-Miami-style
  combos and a graded results screen.
- **Masks** — seven masks with perks (Rooster, Tiger, Owl, Horse, Goat King, Deer…).
- **Phone missions** — a 1989 brick phone on the dash rings with timed objectives.
- **📼 Mixtape** — load your own audio files as the menu theme, the storm theme or a radio station. Files stay
  in your browser's IndexedDB and are never uploaded.

## Tech

Vite + TypeScript + Three.js (r186) with `EffectComposer` (bloom → output → custom "state of mind" shader).
See [`CLAUDE.md`](CLAUDE.md) for the architecture and conventions.
