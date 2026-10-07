# CLAUDE.md

Notes for working on HELL YEAH SIMULATOR. User-facing docs are in `README.md`.

## Commands

- `npm run dev` — Vite dev server on :5173
- `npm run build` — `tsc --noEmit` + `vite build` (always run `npx tsc --noEmit` after edits)
- No test suite; verify visually with headless screenshots (see Testing).

## Architecture (`src/`)

| File | Role |
|---|---|
| `main.ts` | Renderer, composer, game state `S`, input, simulation loop, HUD, screens, graphics modes (`applyMode`), bonus systems (killer mode, masks, phone missions, mixtape UI) at the bottom |
| `interior.ts` | Car cabin (car-local space), steering wheel, mirror camera, props, particles, **hand action system** (`beer`, `cigarette`, `horns`, `flex`) |
| `arms.ts` | Runtime arm: SkinnedMesh from worker data, skin shader (vein pump / lava), two-bone IK `Arm.solve(wrist, handQuat)` |
| `armgen.ts` / `armgen.worker.ts` | SDF arm sculptor + vein growth + Surface Nets + skin weights (pure math, runs in a worker, ~4s) |
| `can.ts` | Detailed beer can (lathe body, lid with scored flap, ring-pull tab) |
| `world.ts` | Road chunks along `roadCenter(s)`, sky/ground shaders, mountains, props, vice theme (palms), rain |
| `traffic.ts` | Cars, deer, cop, launched debris |
| `hellfx.ts` | World-space burnout smoke, hell-mode fire pillars, meteors |
| `fx.ts` | Full-screen post shader: drunk/smoke/hell/rain/killer effects + per-mode art direction (`MODES`) |
| `audio.ts` | Web Audio: engine, SFX, bit-crusher worklet, reverb/echo buses, song sequencer (`SONGS`, `STATIONS`), tape playback |
| `mixtape.ts` | IndexedDB storage for user-supplied audio files |
| `bonus.ts` | Masks, phone missions, voicemails, grading data |
| `art.ts` | All canvas-generated textures |
| `content.ts` | Joke text: popups, thoughts, tips, ranks, obituary headlines |

## Conventions

- **Spaces:** world road runs along −Z; road coordinate `s = -z`, lateral `lat = x - roadCenter(s)`.
  The cabin lives in `cab.root` (car-local; camera ≈ `(0, 1.19, 0)` looking −Z).
- **Hand frame:** fingers −Z, back of hand +Y, thumb −X (right hand) / +X (left, mirrored mesh).
  Poses are `{ w: wrist pos (car-local), q: hand quat, curl[4], thumb }`; `P(point, q, localOffset, …)` derives
  the wrist from where a prop/anchor should be. A key with `pose: null` means the default pose
  (R = wheel drape, L = elbow out the window / wheel graze).
- **Can:** top along hand −X (`CAN_ROT = rotZ(π/2)`), opening faces can-local +Z. Use `canHandQ(up, backHint)`.
- **Steering power:** right hand on the wheel = 1, left fingertip graze only = 0.5, no hands = 0.
- **Music:** all songs are original. Never embed or transcribe copyrighted songs — the mixtape lets users load their own files.
- Post shader runs **after** `OutputPass` (display space). Colors > 1 in `glow()` materials feed bloom.

## Testing / debugging

Headless screenshots via Playwright against system Chromium (`--use-gl=angle --enable-unsafe-swiftshader`).
Wait for `#loading.done` before interacting (arm generation). Console hooks on `window.HYS`:

- `HYS.S` — game state; `HYS.cab` — interior
- `HYS.at(t)` — freeze the current hand action at time `t` (`HYS.at(null)` to release); fires events up to `t`
- `HYS.dbg(x,y,z, tx,ty,tz)` / `HYS.dbgOff()` — debug camera in car-local space (great for checking clipping)
- `HYS.terminal()`, `HYS.cough(n)` — trigger lung cancer / coughing

Headless frame rate is low, so wall-clock waits don't map to animation time — use `HYS.at()` for exact frames.

## Design voice (keep it)

The brief is always "go wild". Inspirations: the *Asgore driving in my car right after a beer* meme, the
veiny-forearm-on-the-wheel meme photo (the arm reference), NFS Most Wanted's legal warning screen,
Buckshot Roulette (default look), Hotline Miami (masks, phone missions, combos, grades), GTA Vice City
(pastel 80s), The Doors / Kavinsky / DOOM 2016 soundtracks (as *vibes* for original music only).
Humor is deadpan-legal parody + brainrot + dark jokes (obituaries, mugshot charges, fake brands and bands),
recurring bits: 3:33 AM, Highway 666, the deer, the pie at home, the forearm as a god. Violence stays on
cars and cartoon deer; vices always carry in-game consequences and the "in the game, not on the streets" message.
