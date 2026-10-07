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
| `interior.ts` | Car cabin (car-local space), T-spoke steering wheel, mirror camera, props, particles, **hand action system** (`beer`, `cigarette`, `horns`, `flex`), resting-hand brain (which style each hand holds, when it switches) |
| `grip.ts` | `Pose` type, pose blending, `HandRest` (per-hand rest state + lift-and-resettle transitions between styles) |
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
  The cabin lives in `cab.root` (car-local; camera ≈ `(0, 1.19, 0)` looking −Z). The driver sits left of the car's
  centerline (`CX = 0.3`); the driver door's inner face is at `x = −0.52`, its top (`SILL_Y`) at 0.86 — the left elbow rests there.
  `cab.ground` is a pitch/roll-free child for decals that must stay on the asphalt (`cab.syncGround()` each frame).
- **Hand frame:** fingers −Z, back of hand +Y, thumb −X (right hand) / +X (left, mirrored mesh).
  Poses are `{ w: wrist pos (car-local), q: hand quat, curl[4], thumb }`; `P(point, q, localOffset, …)` derives
  the wrist from where a prop/anchor should be. A key with `pose: null` means that hand's
  current rest pose. `Pose.pole` steers the elbow.
- **Rest styles (one-handed driving, as taught by the user):** R = `top` — palm on top of the rim, fingers dangling
  over the far side (or flat/extended, `h.flat`) — or `horn` — palm on the hub's upper curve (a touch right), knuckles
  up, fingers lying forward over the top toward the dash. Steering is a **bus knob**: the palm stays glued to its spot on the rim; while steering, fingers close into a
  fist; once the wheel carries the hand past ~65–90° of wrist roll it opens flat (palm friction), fingers never more than
  90° from up. `horn` past 90° slides out to `top` palm-flat. L = `door` (elbow on the door, hand over its edge) / `air`;
  when R is busy: `graze` only (fingertips, elbow still on the door); a held turn turns the graze into `top`.
  The left hand never does the horn pose (user preference).
  Debug: `HYS.hands('horn','graze')`, `HYS.steer(1)`, `HYS.gfx(1)` for the clean HD look.
- **Can:** top along hand −X (`CAN_ROT = rotZ(π/2)`), opening faces can-local +Z. Use `canHandQ(up, backHint)`.
  The thumb points at the lid, so the grip sits low (`canAnchor`/`CAN_LOCAL` x = −0.04) and can poses keep `thumb` ≈ 0.45 — more wrap pushes it through the wall.
- **Cig:** held a touch above `MOUTH` and rolled so the ember clears the knuckles; the camera dips (not lifts) during a drag so the cherry stays in frame.
- **Rearview mirror** must stay inside the top of the frame (y ≈ 1.40 at z −0.45 with the −0.12 camera pitch); higher and it's silently off-screen.
- **Steering power:** `cab.steerPower` — right top 1, right horn 0.9, left top 0.85, left graze 0.5, no hands 0 (the NO HANDS pop needs 0.3 s of zero hands).
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
