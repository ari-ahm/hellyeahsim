import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';
import { World, roadCenter, roadSlope, ROAD_HALF } from './world';
import { Traffic } from './traffic';
import { Interior } from './interior';
import { AudioSys, STATIONS } from './audio';
import { MindShader, MODES } from './fx';
import { loadArmData } from './arms';
import { FX } from './hellfx';
import { loadMixtape, saveFiles, clearSlot, type Slot } from './mixtape';
import { MASKS, pickMission, pickCaller, nextCallDelay, VOICEMAILS, grade, KILLER_LINES, type MissionDef } from './bonus';
import { MSG, THOUGHTS, DRUNK_THOUGHTS, TIPS, RANKS, CANCER_HEADS } from './content';
import { clamp, damp, pick, rand, lerp } from './util';

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x3a0c34, 90, 620);
const hemi = new THREE.HemisphereLight(0xc8a0ff, 0x905070, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffa070, 1.1);
sun.position.set(-170, 60, -400);
scene.add(sun, sun.target);

const world = new World(scene);
const traffic = new Traffic(scene);
const cab = new Interior();
scene.add(cab.root);
const audio = new AudioSys();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cab.camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.92);
composer.addPass(bloom);
const mind = new ShaderPass(MindShader);
composer.addPass(new OutputPass());
composer.addPass(mind);

// reflections: bake the sky into an environment map
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(world.sky.geometry, world.sky.material));
  scene.environment = pm.fromScene(envScene, 0, 1, 2000).texture;
  scene.environmentIntensity = 0.6;
}
const fx = new FX(scene);
{
  const launch = traffic.launch.bind(traffic);
  traffic.launch = (o, from, force) => launch(o, from, force * (mask().id === 'horse' ? 3 : 1));
}

// ---------------------------------------------------------------- art direction modes
let gfx = 0;
function applyMode() {
  const m = gfx;
  const lowRes = m === 0 ? 380 : m === 2 ? 360 : m === 3 ? 480 : m === 4 ? 420 : 0;
  const pr = lowRes ? lowRes / innerHeight : Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  canvas.style.imageRendering = lowRes ? 'pixelated' : 'auto';
  mind.uniforms.mode.value = m;
  mind.uniforms.res.value = [innerWidth * pr, innerHeight * pr];
  hemi.intensity = m === 0 ? 0.6 : 0.95;
  sun.intensity = m === 0 ? 0.9 : 1.1;
  scene.environmentIntensity = m === 0 ? 0.3 : 0.6;
  renderer.toneMappingExposure = m === 0 ? 1.0 : m === 3 ? 1.3 : 1.05;
  (scene.fog as THREE.Fog).near = m === 0 ? 80 : 110;
  (scene.fog as THREE.Fog).far = m === 0 ? 560 : 700;
  if (m === 0) audio.setCrush(10, 3, 1.1);
  else if (m === 1) audio.setCrush(16, 1, 1);
  else if (m === 2) audio.setCrush(9, 4, 1.2);
  else if (m === 3) audio.setCrush(4, 7, 3.2);
  else audio.setCrush(12, 2, 1.05);
  document.body.dataset.mode = String(m);
  $('modelbl').textContent = 'GRAPHICS: ' + MODES[m];
}

addEventListener('resize', () => {
  applyMode();
  cab.camera.aspect = innerWidth / innerHeight;
  cab.camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- DOM
const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on = true) => $(id).classList.toggle('show', on);

function pop(text: string, opts: { color?: string; sub?: string; huge?: boolean; font?: string } = {}) {
  const host = $('popups');
  if (host.children.length > 4) host.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = 'pop' + (opts.huge ? ' huge' : '');
  el.style.setProperty('--r', `${rand(-9, 9)}deg`);
  if (!opts.huge) {
    el.style.color = opts.color ?? pick(['#ffd23a', '#ff2bd6', '#3ff3ff', '#fff', '#7dff5a']);
    el.style.fontFamily = opts.font ?? pick(["'Bungee'", "'Rubik Glitch'", "'Permanent Marker'", "'Metal Mania'"]);
    el.style.top = `${rand(26, 44)}%`;
    el.style.left = `${rand(40, 60)}%`;
  }
  el.innerHTML = text + (opts.sub ? `<small>${opts.sub}</small>` : '');
  host.appendChild(el);
  setTimeout(() => el.remove(), opts.huge ? 2200 : 1800);
}
function flash() {
  const f = $('flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

// ---------------------------------------------------------------- state
type Mode = 'disclaimer' | 'splash' | 'title' | 'play' | 'paused' | 'dead' | 'busted' | 'results';
let mode: Mode = 'disclaimer';
const keys = new Set<string>();

const S = {
  x: 0, s: 0, h: 0, v: 0, steer: 0, yaw: 0,
  hp: 100, bac: 0, lung: 100, meter: 0, hellT: 0, heat: 0, steady: 0,
  points: 0, beers: 0, cigs: 0, deer: 0, crashes: 0, near: 0, dist: 0, topSpeed: 0, blackouts: 0, hys: 0,
  shake: 0, damageFx: 0, bump: 0, lat: 0, latAcc: 0, longAcc: 0, offroad: false, offT: 0,
  cop: { on: false, gap: 120, lat: 2, slowT: 0, ramCd: 0 },
  blackout: 0, blackoutPhase: 0, coughT: 0, smallHyCd: 0, wrongT: 0, time: 0, rpm: 900,
  thoughtT: 6, radioT: 0, killer: 0, combo: 0, comboT: 0, flash: 0, ring: 0, phoneT: 40, autoStormT: 0, fade: 0, terminal: 0, cancerT: 0, coughKick: 0, noHandsT: 0, bpm: 70, flexes: 0, burnout: false as boolean, burnT: 0, djI: 0, throttle: 0, lastSpeed: 0, timeAlive: 0,
};
function resetRun() {
  Object.assign(S, {
    s: 10, h: 0, v: 0, steer: 0, hp: 100, bac: 0, lung: 100, meter: 0, hellT: 0, heat: 0, steady: 0,
    points: 0, beers: 0, cigs: 0, deer: 0, crashes: 0, near: 0, dist: 0, topSpeed: 0, blackouts: 0, hys: 0,
    shake: 0, damageFx: 0, blackout: 0, blackoutPhase: 0, coughT: 0, timeAlive: 0, killer: 0, combo: 0, comboT: 0, flash: 0, ring: 0, phoneT: 40, autoStormT: 0, fade: 0, terminal: 0, cancerT: 0, coughKick: 0, noHandsT: 0, bpm: 70, flexes: 0,
  });
  S.x = roadCenter(S.s) + 2;
  S.h = Math.atan(roadSlope(S.s));
  S.cop = { on: false, gap: 120, lat: 2, slowT: 0, ramCd: 0 };
  traffic.reset();
  world.reset();
  $('blackout').style.opacity = '0';
  $('blackout-text').innerHTML = '';
  cab.clearCracks();
}
resetRun();

const isHell = () => S.hellT > 0;
const mult = () =>
  (1 + Math.floor(S.bac * 6) * 0.5 + (isHell() ? 2 : 0) + (S.steady > 0 ? 0.5 : 0) + (S.killer > 0 ? S.combo * 0.5 : 0)) * (mask().id === 'rooster' ? 1.25 : 1);
function addPoints(n: number, label?: string, sub?: string) {
  const p = Math.round(n * mult());
  S.points += p;
  if (label) pop(label, { sub: sub ?? `+${p}` });
}
function hit(dmg: number, crack: number) {
  if (mask().id === 'tiger' && crack > 0.05) dmg = 0;
  if (isHell()) dmg *= 0.0;
  S.hp = Math.max(0, S.hp - dmg);
  S.shake = Math.max(S.shake, 0.06 + crack * 0.1);
  S.damageFx = Math.min(1, S.damageFx + 0.4 + crack * 0.3);
  if (crack > 0.2 && !isHell()) cab.addCrack(crack);
}

// ---------------------------------------------------------------- actions
cab.hooks = {
  grabCan: () => audio.canOpen(),
  glug: () => {
    audio.glug();
    S.bac = Math.min(1.05, S.bac + 0.026);
  },
  crush: () => audio.crush(),
  burp: () => {
    audio.burp();
    S.beers++;
    S.meter = Math.min(1, S.meter + 0.08);
    addPoints(250, pick(MSG.beer));
  },
  lighter: () => audio.lighter(),
  inhale: () => audio.inhale(),
  exhale: () => {
    audio.exhale();
    S.lung = Math.max(0, S.lung - 9);
    S.steady = 12;
    S.meter = Math.min(1, S.meter + 0.06);
    S.cigs += 0.25;
    addPoints(150, pick(MSG.cig));
    if (S.lung <= 0) {
      if (Math.random() < 0.3) terminal();
      else coughFit(3, 'COUGHING FIT', 'your lungs filed a complaint');
    }
  },
  flick: () => pop('BUTT FLICKED', { color: '#ccc', sub: 'littering +1' }),
  horns: () => {},
  crack: () => {
    audio.crack();
    pop('*PSSSHHT*', { color: '#e8fbff', font: "'Permanent Marker'", sub: 'the sound of freedom' });
  },
  flex: () => {
    audio.grunt();
    S.flexes++;
    S.meter = Math.min(1, S.meter + 0.12);
    S.shake = Math.max(S.shake, 0.02);
    addPoints(300, pick(MSG.flex));
  },
  heartbeat: () => audio.heartbeat(),
};

function coughFit(n: number, title?: string, sub?: string) {
  const times = audio.cough(n);
  S.coughT = Math.max(S.coughT, times[times.length - 1] + 0.4);
  for (const t of times) setTimeout(() => { S.shake = Math.max(S.shake, 0.05); S.coughKick = 1; }, t * 1000);
  if (title) pop(title, { color: '#ff8fb3', sub });
}
/** the lungs have made their final decision */
function terminal() {
  if (S.terminal > 0 || mode !== 'play') return;
  S.terminal = 0.001;
  pop('THE COUGH.', { color: '#ccc', font: "'Metal Mania'", sub: 'oh no. not THE cough.' });
  coughFit(4);
  setTimeout(() => mode === 'play' && coughFit(5), 1500);
  setTimeout(() => mode === 'play' && coughFit(3), 3200);
}
function hellYeah() {
  if (mode !== 'play') return;
  if (S.meter >= 1 && !isHell()) {
    cab.horns();
    S.hellT = 9;
    S.meter = 0;
    S.hys++;
    S.heat = Math.min(5, S.heat + 0.6);
    flash();
    pop(pick(MSG.hy), { huge: true });
    audio.guitarStab();
    audio.speak('HELL YEAH!', 0.05, 0.75);
    S.shake = 0.12;
    addPoints(2000);
  } else if (S.smallHyCd <= 0 && cab.horns()) {
    S.smallHyCd = 2.2;
    audio.speak(pick(MSG.smallHy), 0.3, 0.9);
    pop(pick(MSG.smallHy), { font: "'Permanent Marker'", color: '#fff', sub: 'meter not full. weak.' });
    addPoints(20);
  }
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (keys.has(k)) return;
  keys.add(k);
  if (mode === 'disclaimer') return armsReady ? goSplash() : undefined;
  if (k.length === 1) {
    typed = (typed + k).slice(-12);
    if (mode === 'play' && /666$/.test(typed)) {
      typed = '';
      startKiller('the storm heard you.');
    }
  }
  if (mode === 'results' && k === 'enter') return closeResults();
  if (masksOpen) return maskKey(k);
  if (mode === 'title' && k === 'k') return openMasks();
  if (mode === 'title' && k === 'u') return toggleMixtape();
  if ((mode === 'title' || mode === 'play') && k === 't') {
    world.setTheme(world.theme === 'vice' ? 'desert' : 'vice');
    pop(world.theme === 'vice' ? 'VICE BEACH' : 'HIGHWAY 666', { color: world.theme === 'vice' ? '#ff6fb5' : '#ffb36b', font: "'Bungee'", sub: 'world theme' });
  }
  if (k === 'v') {
    gfx = (gfx + 1) % MODES.length;
    applyMode();
    pop(MODES[gfx], { color: '#fff', font: "'VT323'", sub: 'art direction changed' });
  }
  if (mode === 'title' && k === 'enter') return startGame();
  if ((mode === 'dead' || mode === 'busted') && k === 'enter') return startGame();
  if (k === 'm') audio.setMuted(!audio.muted);
  if (k === 'r') {
    const st = audio.nextStation();
    S.djI = Math.floor(Math.random() * st.dj.length);
    S.radioT = 4;
  }
  if (mode === 'play' || mode === 'paused') {
    if (k === 'p' || k === 'escape') {
      mode = mode === 'play' ? 'paused' : 'play';
      show('pause', mode === 'paused');
      return;
    }
  }
  if (mode !== 'play') return;
  if (k === 'b') {
    if (S.blackout > 0) return;
    if (!cab.beer()) pop('HAND BUSY', { color: '#aaa', font: "'VT323'" });
  }
  if (k === 'c') {
    if (!cab.cigarette()) pop('HAND BUSY', { color: '#aaa', font: "'VT323'" });
  }
  if (k === 'h' || k === ' ') hellYeah();
  if (k === 'e' && S.ring > 0) answerPhone();
  if (k === 'g') {
    if (!cab.flex()) pop('HAND BUSY', { color: '#aaa', font: "'VT323'" });
  }
  if (k === 'q') {
    cab.winHeld = true;
    pop(pick(MSG.window), { color: '#9ff', font: "'Permanent Marker'" });
  }
  if (k === 'f') {
    audio.honk();
    S.meter = Math.min(1, S.meter + 0.005);
  }
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === 'q') cab.winHeld = false;
});
addEventListener('blur', () => keys.clear());
// free-look: hold a mouse button and drag to glance around. snaps back when released.
let looking = false;
const lookT = { x: 0, y: 0 };
addEventListener('pointerdown', () => (looking = mode === 'play'));
addEventListener('pointerup', () => {
  looking = false;
  lookT.x = lookT.y = 0;
});
addEventListener('pointermove', (e) => {
  if (!looking) return;
  lookT.x = clamp(lookT.x - e.movementX * 0.004, -1.1, 1.1);
  lookT.y = clamp(lookT.y - e.movementY * 0.003, -0.45, 0.35);
});
addEventListener('pointerdown', () => {
  if (mode === 'disclaimer' && armsReady) goSplash();
});

function goSplash() {
  audio.init();
  audio.setContext('menu');
  loadMixtape().then((m) => {
    audio.custom = m;
    renderMixtape();
  });
  mode = 'splash';
  show('disclaimer', false);
  show('splash');
  audio.boom();
  setTimeout(() => {
    show('splash', false);
    mode = 'title';
    show('title');
    audio.speak('Hell yeah simulator', 0.1, 0.8);
  }, 2700);
}

function startGame() {
  resetRun();
  ['title', 'obit', 'busted', 'pause'].forEach((id) => show(id, false));
  show('hud');
  mode = 'play';
  mission = null;
  cab.ringing = false;
  cab.wipeOn = false;
  audio.setStorm(0);
  storm = 0;
  audio.setContext('play');
  if (mask().id !== 'none') setTimeout(() => pop(`${mask().emoji} ${mask().name}`, { color: mask().color, font: "'Bungee'", sub: mask().quote }), 1800);
  S.radioT = 5;
  audio.speak("let's go", 0.2, 0.9);
  setTimeout(() => pop('DRIVE.', { sub: 'right after a beer (press B)', color: '#ffd23a' }), 600);
}

let tipI = 0;
setInterval(() => {
  if (mode === 'title') $('tip').textContent = TIPS[tipI++ % TIPS.length];
}, 3200);

// ---------------------------------------------------------------- end screens
function rankName() {
  let r = RANKS[0][1];
  for (const [p, n] of RANKS) if (S.points >= p) r = n;
  return r;
}
function die(how: 'crash' | 'cancer' = 'crash') {
  mode = 'dead';
  if (S.killer > 0) stopKiller();
  audio.setContext('menu');
  S.blackout = 0;
  S.fade = 0;
  audio.crashHit(1.2);
  audio.boom();
  show('hud', false);
  const cause =
    S.bac > 0.6 ? 'an estimated eleven beers' : S.deer > 3 ? 'unresolved deer-related karma' : S.crashes > 4 ? 'repeated aggressive bumper diplomacy' : 'pure, unfiltered hell yeah';
  const heads = [
    'LOCAL GOAT KING DIES DOING WHAT HE LOVED',
    'MUSCULAR ARMS FAIL TO SAVE MAN FROM CONSEQUENCES',
    'AREA DRIVER "HELL YEAHED TOO CLOSE TO THE SUN"',
    'TRAGEDY ON HIGHWAY 666: "HE WAS VIBING," SAYS DEER',
  ];
  $('obit-head').textContent = how === 'cancer' ? pick(CANCER_HEADS) : pick(heads);
  $('obit-sub').textContent =
    how === 'cancer'
      ? `Cause of death: lung cancer, diagnosed and concluded at ${Math.round(S.v * 2.237)} mph. He smoked ${Math.floor(S.cigs)} cigarettes in ${Math.round(S.timeAlive)} seconds, which doctors call "a speedrun."`
      : `Cause of death: ${cause}. Survived by ${Math.max(0, 12 - S.deer)} deer, who are relieved.`;
  $('obit-photo').textContent = how === 'cancer' ? '🚬🫁💀' : '🚗💥🐐';
  const mi = (S.dist / 1609).toFixed(1);
  $('obit-body').innerHTML = `
    <p>A local monarch of considerable forearm passed away late last night at exactly 3:33 AM, after driving ${mi} miles in a manner one witness described as "extremely hell yeah." He was ${Math.round(S.timeAlive)} seconds into his final drive.</p>
    <p>Investigators recovered <b>${S.beers}</b> crushed cans from the dashboard and evidence of <b>${Math.floor(S.cigs)}</b> cigarettes. "His liver was, frankly, a hero," the coroner said.</p>
    <p>He struck <b>${S.deer}</b> deer, ${S.crashes} vehicles, and recorded ${S.near} near-misses. His top speed of <b>${Math.round(S.topSpeed * 2.237)} MPH</b> is being reviewed by physicists and priests.</p>
    <p>He achieved the rank of <b>${rankName()}</b> with <b>${Math.floor(S.points).toLocaleString()}</b> hell yeah points and shouted HELL YEAH at full power ${S.hys} time${S.hys === 1 ? '' : 's'}.</p>
    <p>In lieu of flowers, the family asks that you crack a cold one. In the game. Not on the streets.</p>`;
  setTimeout(() => show('obit'), 900);
}
function busted() {
  if (S.killer > 0) stopKiller();
  audio.setContext('menu');
  mode = 'busted';
  show('hud', false);
  audio.speak('busted', 0.6, 0.9);
  const ch: string[] = [];
  if (S.beers) ch.push(`${S.beers}x OPEN CONTAINER (CHUGGED)`);
  if (S.cigs >= 1) ch.push(`${Math.floor(S.cigs)}x SMOKING IN A MOVING THRONE`);
  if (S.deer) ch.push(`${S.deer}x DEER-SLAUGHTER (1ST DEGREE)`);
  if (S.crashes) ch.push(`${S.crashes}x AGGRAVATED BUMPING`);
  if (S.topSpeed > 45) ch.push(`SPEEDING (${Math.round(S.topSpeed * 2.237)} IN A 55)`);
  if (S.hys) ch.push(`${S.hys}x DISTURBING THE PEACE (HELL YEAH)`);
  ch.push('VIBING WITHOUT A LICENSE');
  ch.push('BEING TOO COOL');
  ch.push(`FINAL SCORE: ${Math.floor(S.points).toLocaleString()}`);
  $('charges').innerHTML = ch.map((c) => `• ${c}`).join('<br>');
  $('charges').style.columns = ch.length > 5 ? '2' : '1';
  $('bust-date').textContent = new Date().toLocaleDateString() + ' 03:33';
  show('busted');
}

// ---------------------------------------------------------------- simulation
function simulate(dt: number) {
  const playing = mode === 'play';
  const auto = mode === 'title' || mode === 'splash' || mode === 'disclaimer';
  S.time += dt;
  if (playing) S.timeAlive += dt;

  const center = roadCenter(S.s);
  const roadH = Math.atan(roadSlope(S.s));
  S.lat = S.x - center;
  const hell = isHell();

  // ---- input
  let throttle = 0, brake = 0, steerIn = 0;
  if (playing && S.blackout <= 0) {
    throttle = keys.has('w') || keys.has('arrowup') ? 1 : 0;
    brake = keys.has('s') || keys.has('arrowdown') ? 1 : 0;
    steerIn = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  } else if (auto) {
    throttle = S.v < 24 ? 1 : 0;
    steerIn = clamp((2 - S.lat) * 0.12 - (S.h - roadH) * 3, -1, 1);
  }
  // drunk drift; cigs steady the paws
  const wob = S.bac * (S.steady > 0 ? 0.25 : 1);
  const drift = (Math.sin(S.time * 0.9) * 0.6 + Math.sin(S.time * 2.3 + 1) * 0.35) * wob * 0.9;
  const cough = S.coughT > 0 ? Math.sin(S.time * 30) * 0.6 : 0;
  const hands = (cab.handsOn.L ? 1 : 0) + (cab.handsOn.R ? 1 : 0);
  // the drape is a full-power steering technique. the left fingertip graze is... less so
  const power = !playing ? 1 : cab.handsOn.R ? 1 : cab.handsOn.L ? 0.5 : 0;
  if (playing && hands === 0) {
    S.noHandsT += dt;
    if (S.noHandsT - dt <= 0) pop('NO HANDS!!', { color: '#ff3b3b', sub: 'jesus take the wheel (x2 points)' });
  } else S.noHandsT = 0;
  if (playing && cab.win > 0.5) S.meter = Math.min(1, S.meter + dt * 0.035 * Math.min(1, S.v / 30));
  const target = clamp(steerIn * power + drift + cough, -1.2, 1.2);
  S.steer = damp(S.steer, target, S.bac > 0.4 ? 3 : 7, dt);
  S.throttle = damp(S.throttle, throttle, 8, dt);

  // ---- longitudinal
  const maxV = hell ? 88 : S.offroad ? 16 : 60;
  let acc = 0;
  // burnout: gas + brake while (nearly) stopped
  S.burnout = playing && !!throttle && !!brake && S.v < 4;
  if (S.burnout) {
    S.burnT += dt;
    S.meter = Math.min(1, S.meter + dt * 0.09);
    S.points += dt * 120 * mult();
    S.shake = Math.max(S.shake, 0.012);
    if (Math.random() < dt * 14) audio.screech(1);
    if (S.burnT > 0.6 && S.burnT - dt <= 0.6) pop('BURNOUT', { color: '#ddd', sub: 'tires: deceased' });
    fx.burnout(new THREE.Vector3(S.x, 0.3, -S.s + 2.2), dt);
  } else S.burnT = 0;
  if (throttle && !S.burnout) acc += (S.offroad ? 7 : hell ? 26 : 13) * Math.max(0, 1 - S.v / maxV) + 0.5;
  if (brake && !S.burnout) acc -= 28;
  acc -= 0.0026 * S.v * S.v + (throttle ? 0 : 1.6);
  if (S.offroad) acc -= S.v * 0.22;
  const prevV = S.v;
  S.v = clamp(S.v + acc * dt, 0, maxV + 4);
  if (!throttle && !brake && Math.abs(S.v) < 0.3) S.v = 0;
  S.longAcc = (S.v - prevV) / Math.max(dt, 1e-3);

  // ---- steering
  const grip = clamp(Math.abs(S.v) / 6, 0, 1) * (1.15 - Math.min(Math.abs(S.v), 80) / 140);
  S.yaw = S.steer * grip * 0.95 * Math.sign(S.v || 1);
  S.h += S.yaw * dt;
  // arcade assist: the car kind of wants to follow the road (it's a good car)
  if (!S.offroad) S.h += (roadH - S.h) * clamp(Math.abs(S.v) / 20, 0, 1) * (1 - Math.min(1, Math.abs(steerIn))) * 1.6 * dt;
  S.latAcc = S.yaw * S.v;
  S.x += Math.sin(S.h) * S.v * dt;
  const ds = Math.cos(S.h) * S.v * dt;
  S.s += ds;
  S.dist += Math.abs(S.v * dt);
  S.topSpeed = Math.max(S.topSpeed, S.v);

  // keep him somewhere in the general vicinity of Earth
  if (Math.abs(S.lat) > 70) {
    S.x = center + Math.sign(S.lat) * 70;
    S.h = roadH;
    S.v *= 0.5;
    if (playing) pop('THE DESERT REJECTS YOU', { color: '#ffb36b' });
  }
  const wasOff = S.offroad;
  S.offroad = Math.abs(S.lat) > ROAD_HALF + 0.6;
  S.bump = S.offroad ? clamp(S.v / 15, 0, 1) : 0;
  if (playing && S.offroad && !wasOff && S.v > 10) pop(pick(MSG.offroad), { color: '#ffb36b' });
  if (playing && Math.cos(S.h - roadH) < 0 && S.v > 5) {
    S.wrongT += dt;
    if (S.wrongT > 1 && S.wrongT - dt <= 1) pop(pick(MSG.wrongway), { color: '#ff3b3b' });
  } else S.wrongT = 0;

  // ---- traffic & collisions
  traffic.spawn(S.s, auto ? 0.6 : 1 + S.dist / 8000);
  traffic.update(dt, S.s, S.time);
  const pS = S.s + 0.8;
  const pPos = new THREE.Vector3(S.x, 0, -S.s);
  for (let i = traffic.vehicles.length - 1; i >= 0; i--) {
    const c = traffic.vehicles[i];
    const d = c.s - pS;
    const dl = c.lane - S.lat;
    const halfLen = c.len / 2 + 2.3;
    if (Math.abs(d) < halfLen && Math.abs(dl) < (c.kind === 'truck' ? 2.4 : 2.0)) {
      const rel = c.oncoming ? S.v + c.v : Math.abs(S.v - c.v);
      traffic.vehicles.splice(i, 1);
      traffic.launch(c.obj, pPos, 10 + rel * (hell ? 1.4 : 0.8));
      audio.crashHit(rel / 40);
      S.crashes++;
      if (!auto) {
        hit(4 + rel * (c.oncoming ? 0.75 : 0.55), clamp(rel / 50, 0.1, 1));
        S.heat = Math.min(5, S.heat + 0.7);
        addPoints((hell ? 1500 : 500) * (mask().id === 'tiger' ? 2 : 1), hell ? 'OBLITERATED' : pick(MSG.crash));
        onKill('car');
      }
      S.v *= hell ? 0.92 : c.oncoming ? 0.25 : 0.55;
      S.meter = Math.min(1, S.meter + 0.05);
      continue;
    }
    if (!c.passed && (c.oncoming ? d < -halfLen : d < -halfLen)) {
      c.passed = true;
      if (Math.abs(dl) < 3.6 && Math.abs(S.v) > 18 && !auto) {
        S.near++;
        S.meter = Math.min(1, S.meter + 0.1);
        audio.nearMiss();
        addPoints(c.oncoming ? 300 : 150, pick(MSG.near));
        onKill('near');
      }
    }
  }
  for (let i = traffic.deer.length - 1; i >= 0; i--) {
    const d = traffic.deer[i];
    if (Math.abs(d.s - pS - 1.5) < 2.4 && Math.abs(d.lat - S.lat) < 1.6 && Math.abs(S.v) > 3) {
      traffic.deer.splice(i, 1);
      traffic.launch(d.obj, pPos.clone().add(new THREE.Vector3(0, -2, 0)), 14 + S.v * 0.7);
      audio.deerHit();
      if (!auto) {
        S.deer++;
        cab.addDeerSticker();
        hit(6, 0.5);
        S.heat = Math.min(5, S.heat + 0.35);
        S.meter = Math.min(1, S.meter + 0.18);
        addPoints(666 * (mask().id === 'deer' ? 3 : 1), pick(MSG.deer), '+666 × ' + mult().toFixed(1));
        onKill('deer');
        if (S.deer === 1) setTimeout(() => audio.speak('hey, that bump is shaped like a deer', 0.4, 1.0), 500);
      }
      S.v *= 0.8;
    }
  }

  if (!playing) {
    S.cop.on = false;
    traffic.cop.visible = false;
    return;
  }

  // ---- body stuff
  S.bac = Math.max(0, S.bac - dt * 0.006);
  S.lung = Math.min(100, S.lung + dt * (S.terminal > 0 ? 0 : 0.8));
  if (S.lung < 1 && S.terminal <= 0) {
    S.cancerT += dt;
    if (S.cancerT > 1) {
      S.cancerT = 0;
      if (Math.random() < 0.05) terminal();
      else if (Math.random() < 0.25 && S.coughT <= 0) coughFit(2);
    }
  }
  if (S.terminal > 0) {
    S.terminal += dt;
    S.fade = clamp((S.terminal - 2.5) / 2.2, 0, 1) * 0.95;
    if (S.terminal > 5) return die('cancer');
  }
  S.coughKick = damp(S.coughKick, 0, 9, dt);
  S.steady = Math.max(0, S.steady - dt);
  S.coughT = Math.max(0, S.coughT - dt);
  if (S.coughT > 0) S.shake = Math.max(S.shake, 0.03);
  S.smallHyCd -= dt;
  if (S.hellT > 0) {
    S.hellT -= dt;
    if (S.hellT <= 0) pop('hell yeah has worn off', { color: '#aaa', font: "'Permanent Marker'", sub: 'back to being mortal' });
  }
  if (S.v > 33) S.meter = Math.min(1, S.meter + (S.v - 33) * 0.0011 * dt);
  S.points += S.v * dt * 0.25 * mult() * (S.noHandsT > 0 ? 2 : 1);
  // heart: speed, booze, cardio from flexing, being alive in this car
  const bpmT = 68 + Math.abs(S.v) * 0.9 + S.bac * 70 + (isHell() ? 55 : 0) + (cab.action?.name === 'flex' ? 45 : 0) + S.heat * 6 + (S.noHandsT > 0 ? 25 : 0);
  S.bpm = damp(S.bpm, bpmT, 0.8, dt);
  if (S.bpm > 190 && Math.random() < dt * 0.3) pop('HEART: "BRO"', { color: '#ff4466', sub: `${Math.round(S.bpm)} BPM` });

  // blackout at max BAC
  if (S.bac >= 1 && S.blackout <= 0) {
    S.blackout = 0.001;
    S.blackoutPhase = 0;
    S.blackouts++;
    audio.speak('uh oh', 0.2, 0.6);
  }
  if (S.blackout > 0) {
    S.blackoutPhase += dt;
    const ph = S.blackoutPhase;
    S.blackout = ph < 1.4 ? ph / 1.4 : ph < 4.4 ? 1 : Math.max(0, 1 - (ph - 4.4) / 1.5);
    $('blackout').style.opacity = String(ph < 4.6 ? Math.min(1, ph / 1.4) : Math.max(0, 1 - (ph - 4.6) / 1.2));
    $('blackout-text').innerHTML =
      ph > 1.5 && ph < 4.6
        ? `<div>you blacked out.</div><div style="font-size:24px;opacity:.7;margin-top:10px">${['...', 'you dreamt of pie.', 'someone said your name. it was a deer.'][Math.min(2, Math.floor((ph - 1.5) / 1))]}</div>`
        : '';
    if (ph >= 4.4 && ph - dt < 4.4) {
      S.s += rand(2000, 5000);
      S.x = roadCenter(S.s) + 2;
      S.h = Math.atan(roadSlope(S.s));
      S.v = 0;
      S.bac = 0.45;
      traffic.reset();
      S.cop.on = false;
      S.heat = 0;
      pop('YOU WOKE UP IN A DIFFERENT TIMEZONE', { color: '#3ff3ff', sub: `+${Math.floor(rand(2, 9))} missing hours` });
      addPoints(1000);
    }
    if (ph > 6) S.blackout = 0;
  }

  // ---- cops
  const c = S.cop;
  if (!c.on && S.heat >= 2.5) {
    c.on = true;
    c.gap = 140;
    c.lat = S.lat;
    pop('★★★ THE FEDS ★★★', { color: '#5aa0ff', sub: 'check your mirror' });
    audio.speak('pull over', 0.8, 1.1);
  }
  if (c.on) {
    const copV = 30 + S.heat * 4.5;
    c.gap += (S.v - copV) * dt;
    const slow = Math.abs(S.v) < 6;
    c.gap = Math.max(slow ? 8 : 5, c.gap);
    c.lat = damp(c.lat, S.lat, 1.2, dt);
    traffic.placeCop(S.s - c.gap, c.lat);
    c.ramCd = Math.max(0, (c.ramCd ?? 0) - dt);
    if (c.gap <= 6 && !slow && c.ramCd <= 0) {
      c.ramCd = 3;
      c.gap = 18;
      hit(7, 0.4);
      S.v += 6;
      audio.crashHit(0.5);
      pop(pick(MSG.copHit), { color: '#5aa0ff' });
    }
    const prevSlow = c.slowT;
    if (c.gap < 20 && slow) c.slowT += dt;
    else c.slowT = Math.max(0, c.slowT - dt * 2);
    for (const [at, txt] of [[0.01, 'PULL OVER!'], [1, '3...'], [2, '2...'], [3, '1...']] as const)
      if (prevSlow < at && c.slowT >= at) pop(txt, { color: '#5aa0ff', sub: at < 1 ? 'GAS IT (W) TO ESCAPE' : undefined });
    if (c.slowT > 4) return busted();
    if (S.heat < 1 || c.gap > 260) {
      c.on = false;
      traffic.cop.visible = false;
      pop(pick(MSG.copGone), { color: '#5aa0ff' });
      S.heat = Math.min(S.heat, 0.9);
      addPoints(1200);
    }
  }
  S.heat = Math.max(0, S.heat - dt * (c.on ? 0.035 : 0.06));
  if (S.v > 50 && !c.on) S.heat = Math.min(5, S.heat + dt * 0.03);

  // ---- thoughts & radio
  S.thoughtT -= dt;
  if (S.thoughtT <= 0) {
    S.thoughtT = rand(9, 16);
    const t = $('thought');
    t.textContent = pick(S.bac > 0.45 && Math.random() < 0.6 ? DRUNK_THOUGHTS : THOUGHTS);
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 4200);
  }
  S.radioT -= dt;

  updateBonus(dt);
  if (S.hp <= 0) die();
}

// ---------------------------------------------------------------- HUD
const hudEls = {
  pts: $('pts'), mult: $('mult'), stars: $('stars'), odo: $('odo'), mph: $('mph'),
  bac: $('m-bac'), lung: $('m-lung'), hp: $('m-hp'), steady: $('m-steady'), steadyRow: $('steadyrow'),
  hy: $('m-hy'), hyWrap: document.querySelector('.hy') as HTMLElement, hyLbl: $('hylbl'), radio: $('radio'), onehand: $('onehand'), combo: $('combo'), killer: $('killerlbl'), mission: $('mission'), mask: $('maskbadge'), bpm: $('bpm'), heart: $('heart'),
};
let lastStars = '';
function hud() {
  if (mode !== 'play') return;
  hudEls.pts.textContent = Math.floor(S.points).toLocaleString();
  const m = mult();
  hudEls.mult.textContent = m > 1 ? `×${m.toFixed(1)} ${isHell() ? 'HELL MULTIPLIER' : S.bac > 0.15 ? 'BEER MULTIPLIER' : 'MULTIPLIER'}` : '';
  const n = Math.floor(S.heat);
  const stars = Array.from({ length: 5 }, (_, i) => (i < n ? '<span class="on">★</span>' : '☆')).join('');
  if (stars !== lastStars) hudEls.stars.innerHTML = lastStars = stars;
  hudEls.odo.textContent = (S.dist / 1609).toFixed(1);
  hudEls.mph.textContent = String(Math.round(Math.abs(S.v) * 2.237));
  hudEls.bac.style.width = `${S.bac * 100}%`;
  hudEls.lung.style.width = `${S.lung}%`;
  hudEls.hp.style.width = `${S.hp}%`;
  hudEls.hp.style.filter = `hue-rotate(${-(100 - S.hp) * 1.1}deg)`;
  hudEls.steady.style.width = `${(S.steady / 12) * 100}%`;
  hudEls.steadyRow.classList.toggle('on', S.steady > 0);
  hudEls.hy.style.height = `${(isHell() ? S.hellT / 9 : S.meter) * 100}%`;
  const full = S.meter >= 1 || isHell();
  hudEls.hyWrap.classList.toggle('full', full);
  hudEls.hyLbl.textContent = isHell() ? 'HELL YEAH MODE' : S.meter >= 1 ? 'PRESS H !!!' : 'HELL YEAH METER';
  const st = STATIONS[audio.station];
  const songFresh = performance.now() - songAt < 6000 && audio.nowPlaying;
  hudEls.radio.textContent = `📻 ${st.freq} ${st.name} — ${songFresh ? '♪ ' + audio.nowPlaying : st.dj[S.djI % st.dj.length]}`;
  // combo / mission / phone HUD
  hudEls.combo.classList.toggle('show', S.killer > 0 && S.combo > 1);
  hudEls.combo.innerHTML = `<b>${S.combo}x</b> COMBO<i style="width:${(S.comboT / 3.5) * 100}%"></i>`;
  hudEls.killer.classList.toggle('show', S.killer > 0);
  hudEls.killer.textContent = `⛈ KILLER MODE ${Math.ceil(S.killer)}s`;
  hudEls.mission.classList.toggle('show', !!mission || S.ring > 0);
  hudEls.mission.innerHTML = mission
    ? `📞 ${mission.def.goal} <span>${missionProgress(mission)}</span> <em>${Math.ceil(mission.t)}s</em>`
    : S.ring > 0 ? `📞 INCOMING: <b>${caller}</b> — press <kbd>E</kbd>` : '';
  hudEls.mask.textContent = mask().id === 'none' ? '' : mask().emoji;
  hudEls.radio.classList.toggle('show', S.radioT > 0);
  const hands = (cab.handsOn.L ? 1 : 0) + (cab.handsOn.R ? 1 : 0);
  hudEls.onehand.textContent = hands === 0 ? 'NO HANDS — GOD IS DRIVING' : 'FINGERTIP STEERING';
  hudEls.onehand.classList.toggle('show', !cab.handsOn.R);
  hudEls.onehand.classList.toggle('nohands', hands === 0);
  hudEls.bpm.textContent = String(Math.round(S.bpm));
  hudEls.heart.style.animationDuration = `${60 / Math.max(40, S.bpm)}s`;
}

// ---------------------------------------------------------------- loop
let lastT = performance.now();
let djCycle = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000, 1 / 20);
  if (mode === 'results') dt = 0;
  if (mode === 'play' && mask().id === 'owl' && traffic.deer.some((d) => d.s - S.s > 0 && d.s - S.s < 70)) dt *= 0.45;
  lastT = now;
  if (mode === 'paused') dt = 0;
  if (freezeAt !== null && cab.action) {
    dt = 0;
    cab.action.t = freezeAt;
    for (const e of cab.action.events) if (!e.done && e.t <= freezeAt) { e.done = true; e.fn(); }
    cab.update(1e-4, { steer: 0, v: 0, latAcc: 0, longAcc: 0, time: S.time, beat: 0, hell: 0, bump: 0, bac: 0, heart: 70 });
  }

  if (dt > 0) {
    simulate(dt);
    if (mode === 'play' || mode === 'title' || mode === 'splash' || mode === 'disclaimer') {
      cab.update(dt, {
        steer: S.steer, v: S.v, latAcc: S.latAcc, longAcc: S.longAcc, time: S.time, beat: audio.beat,
        hell: isHell() ? 1 : 0, bump: S.bump, bac: S.bac, heart: S.bpm,
      });
    }
  }

  // place the car
  const roll = -S.latAcc * 0.0018;
  cab.root.position.set(S.x, S.bump * rand(0, 0.05), -S.s);
  cab.root.rotation.set(S.longAcc * 0.0012 + S.bump * rand(-0.01, 0.01), -S.h, roll, 'YXZ');
  S.shake = damp(S.shake, 0, 5, dt || 0.016);
  cab.look.x = damp(cab.look.x, lookT.x, looking ? 14 : 5, dt || 0.016);
  cab.look.y = damp(cab.look.y, lookT.y, looking ? 14 : 5, dt || 0.016);
  cab.head.position.set(rand(-1, 1) * S.shake, 1.19 + rand(-1, 1) * S.shake - S.coughKick * 0.03, 0.0 + rand(-1, 1) * S.shake * 0.5 - S.coughKick * 0.06);
  cab.head.rotation.x = -S.coughKick * 0.18;
  S.damageFx = damp(S.damageFx, 0, 2.5, dt || 0.016);

  const camWorld = cab.camera.getWorldPosition(new THREE.Vector3());
  const hell = isHell() ? 1 : 0;
  const trip = clamp((S.bac - 0.6) / 0.4, 0, 1);
  vice = damp(vice, world.theme === 'vice' ? 1 : 0, 2, dt || 0.016);
  storm = damp(storm, S.killer > 0 ? 1 : 0, 0.8, dt || 0.016);
  S.flash = damp(S.flash, 0, 9, dt || 0.016);
  world.update(S.s, camWorld, S.time, lerpUniform('hell', hell, dt), trip, vice, storm, S.flash);
  cab.sway = gfx === 4 ? Math.sin(S.time * 0.9) * 0.05 + Math.sin(audio.beat * Math.PI) * 0.012 : 0;
  cab.drawPhone(S.ring > 0 ? 'RING!' : mission ? 'ACTIVE' : '3:33', S.ring > 0 ? caller : mission ? mission.def.goal.slice(0, 14) : 'no signal', S.ring > 0, S.time);

  // speed FOV
  const fov = 78 + clamp(Math.abs(S.v) - 20, 0, 60) * 0.22 + hell * 8;
  cab.camera.fov = damp(cab.camera.fov, fov, 3, dt || 0.016);
  cab.camera.updateProjectionMatrix();

  const u = mind.uniforms;
  u.time.value = S.time;
  u.drunk.value = damp(u.drunk.value, Math.min(1, S.bac * (S.steady > 0 ? 0.7 : 1) * 1.1), 2, dt || 0.016);
  u.smoke.value = cab.smokeAmount();
  u.hell.value = uHell;
  u.damage.value = S.damageFx;
  u.speed.value = clamp((Math.abs(S.v) - 25) / 50, 0, 1);
  u.blackout.value = Math.max(S.blackout, S.fade);
  u.aspect.value = innerWidth / innerHeight;
  u.trip.value = trip;
  u.rain.value = storm;
  u.flash.value = S.flash;
  u.kill.value = storm * 0.8;
  u.chug.value = damp(u.chug.value, cab.chug, 10, dt || 0.016);
  fx.update(dt, S.s, S.time, uHell, cab.root.position);
  scene.fog!.color.setRGB(lerp(0.23, 0.4, uHell), lerp(0.05, 0.03, uHell), lerp(0.2, 0.01, uHell));
  bloom.strength = 0.6 + uHell * 0.5;

  // audio
  const rpm = audio.update({
    speed: Math.abs(S.v), throttle: S.throttle, offroad: S.offroad, siren: S.cop.on ? clamp(1.4 - S.cop.gap / 150, 0.15, 1) : 0, time: S.time, hell,
  });
  if (rpm) S.rpm = rpm;
  djCycle += dt;
  if (djCycle > 14) {
    djCycle = 0;
    S.djI++;
    if (mode === 'play') S.radioT = 5;
  }

  if (cabFrame++ % 2 === 0) {
    cab.drawDash({ mph: Math.abs(S.v) * 2.237, rpm: S.rpm, bac: S.bac, time: S.time, hp: S.hp, lung: S.lung, heat: S.heat, hell, bpm: S.bpm });
    const st = STATIONS[audio.station];
    cab.drawRadio(st.name, st.freq, st.dj[S.djI % st.dj.length], S.time);
  }

  hud();

  // mirror then main
  renderer.setRenderTarget(cab.mirrorRT);
  renderer.render(scene, cab.mirrorCam);
  renderer.setRenderTarget(null);
  composer.render(dt);
}
let cabFrame = 0;
let freezeAt: number | null = null;
let uHell = 0;
function lerpUniform(_: string, target: number, dt: number) {
  uHell = damp(uHell, target, 3, dt || 0.016);
  return uHell;
}

// debug hooks for testing
const dbgCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
cab.root.add(dbgCam);
(window as unknown as { HYS: unknown }).HYS = {
  S, cab, start: startGame, goSplash, get mode() { return mode; },
  /** debug: look at the cabin from (x,y,z) toward (tx,ty,tz), car-local */
  dbg(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    dbgCam.aspect = innerWidth / innerHeight;
    dbgCam.updateProjectionMatrix();
    dbgCam.position.set(x, y, z);
    dbgCam.lookAt(cab.root.localToWorld(new THREE.Vector3(tx, ty, tz)));
    (composer.passes[0] as RenderPass).camera = dbgCam;
  },
  dbgOff() { (composer.passes[0] as RenderPass).camera = cab.camera; },
  /** debug: freeze the current hand action at time t (null to release) */
  at(t: number | null) { freezeAt = t; },
  terminal: () => terminal(),
  cough: (n: number) => coughFit(n),
};

// ---------------------------------------------------------------- forging the forearm
let armsReady = false;
loadArmData((p, label) => {
  $('loadbar').style.width = `${Math.round(p * 100)}%`;
  $('loadlbl').textContent = `${label.toUpperCase()}... ${Math.round(p * 100)}%`;
}).then((data) => {
  cab.attachArms(data);
  armsReady = true;
  $('loading').classList.add('done');
  $('press').style.display = '';
});
applyMode();

// deep fried: emoji confetti that refuses to leave
setInterval(() => {
  if (gfx !== 3) return;
  const host = $('fried');
  if (host.children.length > 9) host.firstElementChild?.remove();
  const e = document.createElement('span');
  e.textContent = pick(['😂', '👌', '💯', '🔥', '🅱️', '😩', '🦌', '🍺', '🚬', '💪', '‼️']);
  e.style.left = `${rand(0, 92)}%`;
  e.style.top = `${rand(0, 85)}%`;
  host.appendChild(e);
}, 450);

// ================================================================ BONUS: masks, phone missions, the storm, mixtape
let typed = '';
let vice = 0;
let storm = 0;
let songAt = 0;
let caller = '';
let maskIdx = 0;
let masksOpen = false;
let mission: { def: MissionDef; t: number; base: Record<string, number>; acc: number; max: number } | null = null;
let lastMeter = 0;
let kStats = { kills: 0, deer: 0, near: 0, maxCombo: 0, p0: 0, t: 0 };
function mask() {
  return MASKS[maskIdx];
}
audio.onSong = () => {
  songAt = performance.now();
  S.radioT = 6;
};

// ---- masks
function renderMasks() {
  $('maskgrid').innerHTML = MASKS.map(
    (m, i) => `<div class="mcard ${i === maskIdx ? 'sel' : ''}" style="--c:${m.color}"><div class="me">${m.emoji}</div><div class="mn">${m.name}</div><div class="mp">${m.perk}</div></div>`,
  ).join('');
  $('maskquote').textContent = `"${mask().quote}"`;
  $('masklbl').textContent = `MASK: ${mask().emoji} ${mask().name}`;
  document.body.style.setProperty('--maskc', mask().color);
  document.body.dataset.mask = mask().id;
}
function openMasks() {
  masksOpen = true;
  renderMasks();
  show('masks');
  audio.blip(660);
}
function maskKey(k: string) {
  if (k === 'arrowright' || k === 'd') maskIdx = (maskIdx + 1) % MASKS.length;
  else if (k === 'arrowleft' || k === 'a') maskIdx = (maskIdx + MASKS.length - 1) % MASKS.length;
  else if (k === 'enter' || k === 'k' || k === 'escape') {
    masksOpen = false;
    show('masks', false);
    audio.speak(mask().quote, 0.2, 0.85);
    return;
  } else return;
  audio.blip(440 + maskIdx * 60);
  renderMasks();
}

// ---- mixtape
function toggleMixtape() {
  const el = $('mixtape');
  el.classList.toggle('show');
  renderMixtape();
}
function renderMixtape() {
  const c = audio.custom;
  $('mx-menu').textContent = c.menu ? c.menu.name : '— (original: MIDNIGHT CALL)';
  $('mx-storm').textContent = c.storm ? c.storm.name : '— (original: KILLER WEATHER)';
  $('mx-radio').textContent = c.radio.length ? c.radio.map((t) => t.name).join(' • ') : '— empty —';
}
for (const slot of ['menu', 'storm', 'radio'] as Slot[]) {
  const inp = $(`mxf-${slot}`) as HTMLInputElement;
  inp.addEventListener('change', async () => {
    if (!inp.files?.length) return;
    await saveFiles(slot, [...inp.files]);
    audio.custom = await loadMixtape();
    renderMixtape();
    inp.value = '';
  });
  $(`mxc-${slot}`).addEventListener('click', async () => {
    await clearSlot(slot);
    audio.custom = await loadMixtape();
    renderMixtape();
  });
}
$('mx-close').addEventListener('click', () => $('mixtape').classList.remove('show'));

// ---- killer mode (the storm)
function startKiller(why: string) {
  if (S.killer > 0 || mode !== 'play') return;
  S.killer = 75;
  S.combo = 0;
  S.comboT = 0;
  kStats = { kills: 0, deer: 0, near: 0, maxCombo: 0, p0: S.points, t: 0 };
  audio.setContext('storm');
  audio.setStorm(1);
  audio.thunder(undefined, 1);
  cab.wipeOn = true;
  S.flash = 1;
  flash();
  pop(pick(KILLER_LINES), { huge: true });
  setTimeout(() => pop(why, { color: '#ff3355', font: "'Metal Mania'", sub: 'combos are live. chain your chaos.' }), 1600);
  audio.speak('there is a storm on the road tonight', 0.05, 0.7);
}
function stopKiller() {
  S.killer = 0;
  S.combo = 0;
  audio.setContext('play');
  audio.setStorm(0);
  cab.wipeOn = false;
}
function onKill(kind: 'car' | 'deer' | 'near') {
  if (S.killer <= 0) return;
  S.combo++;
  S.comboT = 3.5;
  kStats.maxCombo = Math.max(kStats.maxCombo, S.combo);
  if (kind === 'car') kStats.kills++;
  if (kind === 'deer') kStats.deer++;
  if (kind === 'near') kStats.near++;
  if (S.combo > 1 && S.combo % 3 === 0) pop(['DOUBLE', 'TRIPLE', 'MEGA', 'ULTRA', 'MONSTER', 'GODLIKE', 'FOREARM'][Math.min(6, S.combo / 3 - 1)] + ' COMBO', { color: pick(['#ff2bd6', '#3ff3ff', '#ffd23a']), font: "'Bungee'", sub: `x${S.combo}` });
}
function finishKiller() {
  const pts = Math.floor(S.points - kStats.p0);
  const g = grade(pts, kStats.maxCombo);
  stopKiller();
  if (mission?.def.id === 'storm') completeMission();
  mode = 'results';
  $('results-body').innerHTML = `
    <div><span>CARS WRECKED</span><b>${kStats.kills}</b></div>
    <div><span>DEER</span><b>${kStats.deer}</b></div>
    <div><span>NEAR MISSES</span><b>${kStats.near}</b></div>
    <div><span>MAX COMBO</span><b>x${kStats.maxCombo}</b></div>
    <div><span>STORM POINTS</span><b>${pts.toLocaleString()}</b></div>
    <div><span>MASK</span><b>${mask().emoji} ${mask().name}</b></div>`;
  $('results-grade').textContent = g;
  show('results');
  audio.speak(`grade. ${g.replace('+', ' plus')}`, 0.1, 0.8);
}
function closeResults() {
  show('results', false);
  mode = 'play';
}

// ---- phone missions
function missionProgress(m: NonNullable<typeof mission>) {
  const d = m.def.id;
  if (d === 'deer') return `${S.deer - m.base.deer}/2`;
  if (d === 'beers') return `${S.beers - m.base.beers}/2`;
  if (d === 'near') return `${S.near - m.base.near}/4`;
  if (d === 'flex') return `${S.flexes - m.base.flexes}/2`;
  if (d === 'speed') return `${Math.round(m.max)}/120`;
  if (d === 'nohands' || d === 'burnout') return `${m.acc.toFixed(1)}/${d === 'nohands' ? 6 : 4}s`;
  return S.killer > 0 ? 'SURVIVE' : '';
}
function missionDone(m: NonNullable<typeof mission>) {
  const d = m.def.id;
  return (
    (d === 'deer' && S.deer - m.base.deer >= 2) ||
    (d === 'beers' && S.beers - m.base.beers >= 2) ||
    (d === 'near' && S.near - m.base.near >= 4) ||
    (d === 'flex' && S.flexes - m.base.flexes >= 2) ||
    (d === 'speed' && m.max >= 120) ||
    (d === 'nohands' && m.acc >= 6) ||
    (d === 'burnout' && m.acc >= 4)
  );
}
function answerPhone() {
  S.ring = 0;
  cab.ringing = false;
  const def = pickMission(mission?.def.id);
  mission = { def, t: def.dur, base: { deer: S.deer, beers: S.beers, near: S.near, flexes: S.flexes }, acc: 0, max: 0 };
  audio.speak(def.speech, 0.25, 0.88);
  pop('📞 ' + def.goal, { color: '#7dff7a', font: "'VT323'", sub: `${caller} • ${def.dur}s` });
  if (def.id === 'storm') setTimeout(() => startKiller('they told you it was coming.'), 2500);
}
function completeMission() {
  if (!mission) return;
  const r = mission.def.reward;
  mission = null;
  S.meter = 1;
  addPoints(r, 'MISSION COMPLETE', `+${Math.round(r * mult())} • hell yeah meter: FULL`);
  audio.guitarStab();
}
function updateBonus(dt: number) {
  // goat king: double meter gains
  if (mask().id === 'goat' && S.meter > lastMeter) S.meter = Math.min(1, S.meter + (S.meter - lastMeter));
  lastMeter = S.meter;
  // cops love the deer traitor
  if (mask().id === 'deer') S.heat = Math.min(5, S.heat + dt * 0.012);
  // the storm
  if (S.killer > 0) {
    S.killer -= dt;
    kStats.t += dt;
    if (S.comboT > 0) {
      S.comboT -= dt;
      if (S.comboT <= 0 && S.combo > 2) pop('COMBO LOST', { color: '#888', font: "'VT323'", sub: `max x${kStats.maxCombo}` });
      if (S.comboT <= 0) S.combo = 0;
    }
    if (Math.random() < dt * 0.18) {
      S.flash = 1;
      setTimeout(() => audio.thunder(undefined, rand(0.5, 1)), rand(200, 1400));
    }
    if (S.killer <= 0) finishKiller();
  } else {
    // auto-storm: drunk + fast for too long and the sky notices
    if (S.bac > 0.75 && S.v * 2.237 > 110) S.autoStormT += dt;
    else S.autoStormT = Math.max(0, S.autoStormT - dt);
    if (S.autoStormT > 5) {
      S.autoStormT = 0;
      startKiller('drunk at 110. the sky took it personally.');
    }
  }
  // phone
  if (!mission && S.ring <= 0 && S.killer <= 0) {
    S.phoneT -= dt;
    if (S.phoneT <= 0) {
      S.ring = 8;
      caller = pickCaller();
      cab.ringing = true;
      pop('📞 RING RING', { color: '#7dff7a', font: "'VT323'", sub: `${caller} is calling. press E` });
    }
  }
  if (S.ring > 0) {
    if (Math.floor(S.ring / 1.4) !== Math.floor((S.ring - dt) / 1.4)) audio.ring();
    S.ring -= dt;
    if (S.ring <= 0) {
      cab.ringing = false;
      S.phoneT = nextCallDelay();
      pop('MISSED CALL', { color: '#888', font: "'VT323'", sub: caller });
      setTimeout(() => audio.speak(pick(VOICEMAILS), 0.3, 0.9), 600);
    }
  }
  if (mission) {
    mission.t -= dt;
    mission.max = Math.max(mission.max, S.v * 2.237);
    if (mission.def.id === 'nohands' && S.noHandsT > 0) mission.acc += dt;
    if (mission.def.id === 'burnout' && S.burnout) mission.acc += dt;
    if (mission.def.id !== 'storm' && missionDone(mission)) {
      completeMission();
      S.phoneT = nextCallDelay();
    } else if (mission.t <= 0 && mission.def.id !== 'storm') {
      mission = null;
      S.phoneT = nextCallDelay();
      pop('MISSION FAILED', { color: '#ff3b3b', font: "'Bungee'", sub: 'the caller is disappointed' });
    }
  }
}

frame();
