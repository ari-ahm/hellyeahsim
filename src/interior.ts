import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Arm, armUniforms } from './arms';
import type { ArmData } from './armgen';
import * as Art from './art';
import { makeCan, type Can } from './can';
import { toon, pbr, glow, clamp, smooth, lerp, rand, V3, basisQ, rotX, rotY, rotZ, qmul, beam, damp } from './util';
import { type Pose, C4, fwdUp, mixPose, frameOf, HandRest, RIM_R, type Frame } from './grip';

type Key = { t: number; pose: Pose | null }; // null => wherever that hand is resting right now
type Ev = { t: number; fn: () => void; done?: boolean };
interface Action {
  name: string;
  dur: number;
  t: number;
  R?: Key[];
  L?: Key[];
  events: Ev[];
  cam?: (t: number) => number;
  tick?: (t: number) => void;
}

export interface ActionHooks {
  glug(): void;
  crush(): void;
  burp(): void;
  grabCan(): void;
  crack(): void;
  lighter(): void;
  inhale(): void;
  exhale(): void;
  flick(): void;
  horns(): void;
  flex(): void;
  heartbeat(): void;
}

// Hand frame: fingers -Z, back of hand +Y, thumb -X (right) / +X (left).
const Q_CAN = basisQ(V3(0, -1, 0), V3(1, 0, 0), V3(0, 0, 1)); // right hand, can upright, thumb up
const Q_PALM_FACE = basisQ(V3(-1, 0, 0), V3(0, 0, -1), V3(0, -1, 0));
const Q_BACK_FACE = basisQ(V3(1, 0, 0), V3(0, 0, 1), V3(0, -1, 0));
const Q_FLAT = new THREE.Quaternion();

const CAN_LOCAL = V3(0, -0.06, -0.078);
const CIG_FILTER_LOCAL = V3(-0.02, -0.05, -0.113);
const TIP_LOCAL_L = V3(0.04, -0.035, -0.18);
const CAN_ROT = rotZ(Math.PI / 2);
/** hand orientation that holds a can with its top pointing along `up` */
function canHandQ(up: THREE.Vector3, back: THREE.Vector3) {
  const x = up.clone().normalize().negate();
  const y = back.clone().addScaledVector(x, -back.dot(x)).normalize();
  return basisQ(x, y, new THREE.Vector3().crossVectors(x, y));
}
const MOUTH = V3(0.035, 1.03, -0.08);

const wristFor = (point: THREE.Vector3, q: THREE.Quaternion, local: THREE.Vector3) => point.clone().sub(local.clone().applyQuaternion(q));
const P = (point: THREE.Vector3, q: THREE.Quaternion, local: THREE.Vector3, curl: number[] | number, thumb = 0.8, spread = 0): Pose => ({
  w: wristFor(point, q, local), q, curl: typeof curl === 'number' ? C4(curl) : curl, thumb, spread,
});
const W = (w: THREE.Vector3, q: THREE.Quaternion, curl: number[] | number, thumb = 0.8, spread = 0): Pose => ({
  w, q, curl: typeof curl === 'number' ? C4(curl) : curl, thumb, spread,
});

// ---- cabin layout (car-local). the driver's eye is at (0, 1.19, 0).
const CX = 0.3; // the car's centerline: the driver sits left of it
const DOOR_L = -0.52; // inner face of the driver's door
const SILL_Y = 0.86; // top of the door, where the left elbow lives
const SPOKE_DROOP = 0.1;
const SHOULDER_L = V3(-0.25, 0.9, -0.1);
const SHOULDER_R = V3(0.22, 0.87, -0.04);
const POLE_L = V3(-1, -0.8, 0.3).normalize();
const POLE_R = V3(1, -1, 0.35).normalize();

// ---- resting styles
// R: 'top' = palm on top of the rim, fingers over the far side (or flat if feeling fancy). steering is a bus knob:
//      the palm never leaves its spot; fingers close into a fist to turn, and past what a wrist can roll they open
//      flat and it's pure palm friction. 'horn' = palm on the hub's upper curve, knuckles up, fingers lying forward over it.
// L: 'door' / 'air' while the right hand drives; 'graze' when it's busy ('top' if you commit to a hard turn).
type RStyle = 'top' | 'horn';
type LStyle = 'door' | 'air' | 'graze' | 'top';
const L_ON_WHEEL: LStyle[] = ['graze', 'top'];
const R_TOP = Math.PI / 2 - 0.33; // contact ~12:40, just right of center
const L_TOP = Math.PI / 2 + 0.42; // ~11:10
const L_GRAZE = 2.55;
const KNOB_MAX = Math.PI / 2; // fingers never point more than 90° away from up
/** rim center relative to the wrist (hand frame) */
const PALM_DRAPE = V3(0, -0.05, -0.07);
const PALM_FIST = V3(0, -0.046, -0.09);
const PALM_FLAT = V3(0, -0.04, -0.072);
const CURL_DANGLE = [0.78, 0.9, 0.98, 1.08];
const CURL_FANCY = [0.2, 0.17, 0.23, 0.3];
const CURL_FIST = [1.12, 1.18, 1.22, 1.28];
const POWER: Record<string, number> = { top: 1, horn: 0.9, door: 0, air: 0, graze: 0.5, 'L-top': 0.85 };
/** elbow parked on the door top */
const ELBOW_SILL = V3(-0.56, 0.95, -0.22);
const POLE_SILL = ELBOW_SILL.clone().sub(SHOULDER_L).normalize();
const POLE_GRAZE = V3(-0.55, 0.95, -0.3).sub(SHOULDER_L).normalize();

interface Particle {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
  op: number;
  grav: number;
}

export class Interior {
  root = new THREE.Group();
  head = new THREE.Group();
  camera: THREE.PerspectiveCamera;
  mirrorCam: THREE.PerspectiveCamera;
  mirrorRT: THREE.WebGLRenderTarget;
  wheelSpin = new THREE.Group();
  tilt = new THREE.Group();
  /** pitch/roll-free frame glued to the road under the car (for things that must stay on the asphalt) */
  ground = new THREE.Group();
  pedals: THREE.Group[] = [];
  headlights: THREE.SpotLight[] = [];
  armL: Arm | null = null;
  armR: Arm | null = null;
  action: Action | null = null;
  camPitch = 0;
  steerVis = 0;
  win = 0;
  sway = 0;
  wipers = new THREE.Group();
  private wiperArms: THREE.Group[] = [];
  wiping = 0;
  phone = new THREE.Group();
  phoneScreen: { c: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  ringing = false;
  /** free-look offset (yaw, pitch) */
  look = { x: 0, y: 0 };
  winHeld = false;
  handsOn = { L: true, R: true };
  /** how much steering authority the hands currently have (0 = jesus, 1 = a firm forearm) */
  steerPower = 1;
  restR = new HandRest<RStyle>('top');
  restL = new HandRest<LStyle>('door');
  private rIdle: RStyle = 'top';
  private lIdle: LStyle = 'door';
  private rIdleT = rand(8, 16);
  private lIdleT = rand(10, 20);
  private holdT = 0;
  private hard = 0;
  private grip = 0;
  /** debug: force resting styles */
  force: { R?: RStyle; L?: LStyle } = {};

  can: THREE.Group;
  canTab: THREE.Group;
  canObj: Can;
  chug = 0;
  cig: THREE.Group;
  ember: THREE.Mesh;
  flame: THREE.Sprite;
  cigLit = false;
  cigDrags = 0;
  pumpTarget = 0;

  dash: { c: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  radio: { c: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  crack: { c: CanvasRenderingContext2D; tex: THREE.CanvasTexture };

  dice: { pivot: THREE.Group; ax: number; az: number; vx: number; vz: number };
  bobble: { head: THREE.Group; a: number; v: number; b: number; vb: number };
  pile: THREE.Object3D[] = [];
  stickers: THREE.Mesh[] = [];
  private stickerTex = Art.stickerTex('🦌');
  flying: { m: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3; t: number; target?: THREE.Vector3; out?: boolean }[] = [];
  particles: Particle[] = [];
  private smokeTex = Art.softDot('230,225,240');
  private cigWispT = 0;
  private headlightGlow: THREE.Mesh;
  dashLamp: THREE.SpotLight;
  hooks!: ActionHooks;

  constructor() {
    const r = this.root;
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.01, 3000);
    this.head.position.set(0, 1.19, 0.0);
    this.head.add(this.camera);
    r.add(this.head);

    this.mirrorRT = new THREE.WebGLRenderTarget(256, 80, { type: THREE.HalfFloatType });
    this.mirrorRT.texture.magFilter = THREE.NearestFilter;
    this.mirrorCam = new THREE.PerspectiveCamera(26, 512 / 160, 1.0, 900);
    this.mirrorCam.position.set(CX, 1.45, -0.4);
    this.mirrorCam.rotation.y = Math.PI;
    r.add(this.mirrorCam);

    const grain = Art.noiseTex(256, 1, 'grain');
    grain.repeat.set(6, 3);
    const leatherBump = Art.noiseTex(256, 1, 'leather');
    leatherBump.repeat.set(8, 1);
    const dark = pbr(0x1a141e, 0.78, 0, { bumpMap: grain, bumpScale: 0.6 });
    const darker = pbr(0x0e0b12, 0.6, 0, { bumpMap: grain, bumpScale: 0.4 });
    const trim = pbr(0x2a2133, 0.5, 0.1, { clearcoat: 0.3 });
    const chrome = pbr(0xc8c8d8, 0.28, 1);
    const paint = pbr(0x8a0016, 0.45, 0.2, { clearcoat: 0.6, clearcoatRoughness: 0.35 });
    const carbon = pbr(0x16161c, 0.55, 0.3, { clearcoat: 0.3, clearcoatRoughness: 0.6, bumpMap: grain, bumpScale: 0.2 });

    // --- Dashboard. The driver sits left of the car's centerline (CX), like in a real car:
    // the door is close enough to lean on and the A-pillar hangs in the corner of your eye.
    const dashBody = new THREE.Mesh(new RoundedBoxGeometry(1.84, 0.34, 0.6, 4, 0.07), dark);
    dashBody.position.set(CX, 0.74, -0.98);
    r.add(dashBody);
    const dashTop = new THREE.Mesh(new RoundedBoxGeometry(1.84, 0.08, 0.5, 4, 0.035), dark);
    dashTop.position.set(CX, 0.9, -0.95);
    dashTop.rotation.x = 0.12;
    r.add(dashTop);
    const binnacle = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.13, 0.28, 4, 0.06), carbon);
    binnacle.position.set(0, 0.93, -0.83);
    r.add(binnacle);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.004, 0.004), glow(0.05, 0.6, 0.8));
    strip.position.set(CX, 0.86, -0.68);
    r.add(strip);
    for (const vx of [-0.38, 0.2, 0.52, 1.0]) {
      const vent = new THREE.Group();
      vent.add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.07, 0.03, 2, 0.012), chrome));
      for (let i = 0; i < 4; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.03), darker);
        slat.position.set(0, -0.022 + i * 0.015, 0.008);
        slat.rotation.x = -0.4;
        vent.add(slat);
      }
      vent.position.set(vx, vx > 0 && vx < 0.6 ? 0.72 : 0.8, -0.685);
      vent.rotation.x = -0.25;
      r.add(vent);
    }
    // knee bolster under the dash so the footwell reads as a footwell, not a void
    const bolster = new THREE.Mesh(new RoundedBoxGeometry(1.84, 0.14, 0.12, 3, 0.04), darker);
    bolster.position.set(CX, 0.55, -0.72);
    bolster.rotation.x = 0.35;
    r.add(bolster);

    const { c: dc } = Art.canvas(512, 256);
    const dashTex = new THREE.CanvasTexture(dc.canvas);
    dashTex.colorSpace = THREE.SRGBColorSpace;
    this.dash = { c: dc, tex: dashTex };
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false }));
    gauge.position.set(0, 0.925, -0.765);
    gauge.rotation.x = -0.32;
    r.add(gauge);

    const { c: rc } = Art.canvas(256, 64);
    const radioTex = new THREE.CanvasTexture(rc.canvas);
    radioTex.colorSpace = THREE.SRGBColorSpace;
    this.radio = { c: rc, tex: radioTex };
    const radioBox = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.1, 0.06, 2, 0.015), carbon);
    radioBox.position.set(0.36, 0.79, -0.705);
    radioBox.rotation.x = -0.25;
    r.add(radioBox);
    const radioScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), new THREE.MeshBasicMaterial({ map: radioTex, toneMapped: false }));
    radioScreen.position.set(0.36, 0.795, -0.672);
    radioScreen.rotation.x = -0.25;
    r.add(radioScreen);

    // --- Pillars, roof, doors
    const carpet = pbr(0x120c16, 0.95, 0, { bumpMap: grain, bumpScale: 1.5 });
    for (const s of [-1, 1]) {
      const inner = s < 0 ? DOOR_L : CX + (CX - DOOR_L); // inner face of the door
      const dx = inner + s * 0.08;
      r.add(beam(V3(inner + s * 0.1, 0.88, -1.05), V3(inner + s * 0.03, 1.62, -0.32), 0.045, 0.075, trim)); // A-pillar
      r.add(beam(V3(inner + s * 0.08, SILL_Y, 0.55), V3(inner + s * 0.05, 1.62, 0.5), 0.05, 0.12, trim)); // B-pillar
      const door = new THREE.Mesh(new RoundedBoxGeometry(0.16, SILL_Y - 0.28, 1.75, 3, 0.04), dark);
      door.position.set(dx, (SILL_Y + 0.28) / 2 - 0.02, -0.25);
      r.add(door);
      // the door top: padded, wide, a forearm's natural habitat
      const sill = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.05, 1.65, 3, 0.022), trim);
      sill.position.set(dx, SILL_Y - 0.025, -0.25);
      r.add(sill);
      const amb = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 1.4), glow(3, 0.2, 2.4));
      amb.position.set(inner + s * 0.003, SILL_Y - 0.07, -0.25);
      r.add(amb);
      // armrest ledge + pull handle + chrome latch + speaker
      const rest = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.04, 0.5, 2, 0.015), darker);
      rest.position.set(inner - s * 0.025, 0.66, -0.1);
      r.add(rest);
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.025, 0.12, 2, 0.008), chrome);
      handle.position.set(inner - s * 0.01, 0.76, -0.5);
      r.add(handle);
      const spk = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 24), pbr(0x07060a, 0.9, 0, { bumpMap: grain, bumpScale: 3 }));
      spk.rotation.z = Math.PI / 2;
      spk.position.set(inner - s * 0.004, 0.45, -0.72);
      r.add(spk);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.2), pbr(0x2a2030, 0.9));
    roof.position.set(CX, 1.64, 0.25);
    r.add(roof);
    const header = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.08, 0.14, 2, 0.03), darker);
    header.position.set(CX, 1.6, -0.33);
    r.add(header);
    const visor = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.02, 0.17, 2, 0.008), pbr(0x3a2d42, 0.9));
    visor.position.set(0.42, 1.565, -0.3);
    visor.rotation.x = 0.35;
    r.add(visor);
    const pol = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.088), new THREE.MeshBasicMaterial({ map: Art.polaroidTex() }));
    pol.position.set(0.47, 1.552, -0.292);
    pol.rotation.set(Math.PI / 2 + 0.35, Math.PI, Math.PI + 0.12);
    r.add(pol);

    // --- Floor, footwell, console, seats, legs: the car has a bottom now. the road stays outside.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 2.2), carpet);
    floor.position.set(CX, 0.27, -0.35);
    r.add(floor);
    const firewall = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.04), carpet);
    firewall.position.set(CX, 0.5, -1.27);
    firewall.rotation.x = -0.5;
    r.add(firewall);
    const tunnel = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 1.25, 3, 0.05), dark);
    tunnel.position.set(CX, 0.4, -0.55);
    r.add(tunnel);
    const consoleTop = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.05, 0.55, 3, 0.02), trim);
    consoleTop.position.set(CX, 0.555, -0.2);
    r.add(consoleTop);
    // cupholder (the beer comes from here)
    const cupRing = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.007, 8, 28), chrome);
    cupRing.rotation.x = Math.PI / 2;
    cupRing.position.set(0.3, 0.582, -0.33);
    r.add(cupRing);
    const cupHole = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), pbr(0x020103, 1));
    cupHole.rotation.x = -Math.PI / 2;
    cupHole.position.set(0.3, 0.581, -0.33);
    r.add(cupHole);
    // shifter: chrome stick, gold skull knob
    r.add(beam(V3(CX + 0.02, 0.55, -0.62), V3(CX + 0.05, 0.72, -0.58), 0.014, 0.014, chrome));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), pbr(0xffc12e, 0.2, 1));
    knob.scale.set(1, 0.9, 1.15);
    knob.position.set(CX + 0.05, 0.735, -0.58);
    r.add(knob);
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 12), pbr(0x0e0b12, 0.9, 0, { bumpMap: leatherBump, bumpScale: 2 }));
    boot.position.set(CX + 0.02, 0.585, -0.62);
    r.add(boot);
    // seats
    const seatMat = pbr(0x2a1520, 0.7, 0, { bumpMap: leatherBump, bumpScale: 1.5, sheen: 0.5, sheenColor: new THREE.Color(0x663344) });
    for (const sx of [0, CX * 2 + 0.05]) {
      const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.14, 0.5, 3, 0.05), seatMat);
      cushion.position.set(sx, 0.47, 0.22);
      cushion.rotation.x = 0.12;
      r.add(cushion);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.7, 0.14, 3, 0.06), seatMat);
      back.position.set(sx, 0.85, 0.52);
      back.rotation.x = -0.18;
      r.add(back);
    }
    // the legs. dark denim, never skipped
    const denim = pbr(0x1c2238, 0.85, 0, { bumpMap: grain, bumpScale: 1.2 });
    const boots = pbr(0x140c08, 0.4, 0, { clearcoat: 0.6 });
    const limb = (a: THREE.Vector3, b: THREE.Vector3, rad: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, a.distanceTo(b), 4, 12), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
      r.add(m);
    };
    for (const lx of [-0.13, 0.13]) {
      const hip = V3(lx, 0.58, 0.18), knee = V3(lx * 1.15 + 0.02, 0.64, -0.36), ankle = V3(lx * 0.9 + 0.06, 0.36, -0.8);
      limb(hip, knee, 0.085, denim);
      limb(knee, ankle, 0.06, denim);
      const boot2 = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.09, 0.26, 2, 0.035), boots);
      boot2.position.copy(ankle).add(V3(0, -0.03, -0.09));
      boot2.rotation.x = -0.45;
      r.add(boot2);
    }
    // pedals (they move)
    for (const [px, w] of [[0.02, 0.09], [0.2, 0.05]] as const) {
      const ped = new THREE.Group();
      ped.position.set(px, 0.5, -1.05);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.015), chrome);
      arm.position.set(0, -0.1, 0);
      const pad = new THREE.Mesh(new RoundedBoxGeometry(w, 0.07, 0.014, 2, 0.005), chrome);
      pad.position.set(0, -0.2, 0.01);
      ped.add(arm, pad);
      ped.rotation.x = 0.35;
      r.add(ped);
      this.pedals.push(ped);
    }

    // --- Windshield
    const { c: cc } = Art.canvas(1024, 512);
    const crackTex = new THREE.CanvasTexture(cc.canvas);
    crackTex.colorSpace = THREE.SRGBColorSpace;
    this.crack = { c: cc, tex: crackTex };
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.98), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false }));
    glass.position.set(CX, 1.27, -0.69);
    glass.rotation.x = 0.77;
    r.add(glass);
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(1.66, 0.98),
      new THREE.MeshPhysicalMaterial({ color: 0x302040, roughness: 0.02, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    tint.position.copy(glass.position);
    tint.rotation.copy(glass.rotation);
    tint.position.z -= 0.004;
    tint.position.y += 0.004;
    r.add(tint);

    // --- Wipers: they live on the glass, they fear nothing
    this.wipers.position.copy(glass.position);
    this.wipers.rotation.copy(glass.rotation);
    r.add(this.wipers);
    for (const x of [-0.42, 0.3]) {
      const arm = new THREE.Group();
      arm.position.set(x, -0.46, 0.012);
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.62, 0.008), darker);
      rod.position.y = 0.31;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.58, 0.014), pbr(0x050505, 0.8));
      blade.position.set(0.012, 0.33, 0.004);
      arm.add(rod, blade);
      arm.rotation.z = 1.35;
      this.wipers.add(arm);
      this.wiperArms.push(arm);
    }

    // --- Dash phone: a brick of 1989 that gives you missions
    {
      const { c: pc } = Art.canvas(128, 96);
      const ptex = new THREE.CanvasTexture(pc.canvas);
      ptex.colorSpace = THREE.SRGBColorSpace;
      this.phoneScreen = { c: pc, tex: ptex };
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.13, 0.03, 2, 0.008), pbr(0x1a1a1e, 0.5, 0.1));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.07, 8), pbr(0x111111, 0.6));
      ant.position.set(0.017, 0.095, 0);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.03), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false }));
      scr.position.set(0, 0.035, 0.0155);
      const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.05), pbr(0x3a3a40, 0.7));
      keys.position.set(0, -0.025, 0.0153);
      this.phone.add(body, ant, scr, keys);
      this.phone.position.set(-0.3, 0.97, -0.84);
      this.phone.rotation.set(-0.45, 0.25, 0);
      r.add(this.phone);
    }

    // --- Hood
    const hood = new THREE.Mesh(new RoundedBoxGeometry(1.75, 0.18, 2.3, 4, 0.08), [
      paint, paint, pbr(0xffffff, 0.45, 0.2, { map: Art.hoodTex(), clearcoat: 0.6, clearcoatRoughness: 0.35 }), paint, paint, paint,
    ]);
    hood.position.set(CX, 0.74, -2.3);
    hood.rotation.x = 0.035;
    r.add(hood);
    const blower = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.16, 0.5, 3, 0.03), chrome);
    blower.position.set(CX, 0.84, -1.95);
    blower.scale.set(0.85, 0.7, 0.85);
    r.add(blower);
    const scoop = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.14, 0.24, 3, 0.03), carbon);
    scoop.position.set(CX, 0.93, -2.0);
    scoop.scale.set(0.85, 0.55, 0.85);
    r.add(scoop);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.2), chrome);
      fin.position.set(CX - 0.085 + i * 0.085, 0.93, -2.1);
      fin.scale.set(1, 0.5, 1);
      r.add(fin);
    }
    const skull = new THREE.Group();
    const gold = pbr(0xffc12e, 0.2, 1);
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), gold);
    sk.scale.set(1, 0.9, 1.3);
    skull.add(sk);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 12, 24, Math.PI * 1.1), gold);
      horn.position.set(s * 0.06, 0.02, 0.0);
      horn.rotation.set(0, s * 1.2, s > 0 ? 0.4 : Math.PI - 0.4);
      skull.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), glow(4, 0.2, 0.1));
      eye.position.set(s * 0.028, 0.012, -0.08);
      skull.add(eye);
    }
    skull.position.set(CX, 0.92, -3.35);
    r.add(skull);

    this.headlightGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 60),
      new THREE.MeshBasicMaterial({ map: Art.softDot('255,220,170'), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.headlightGlow.rotation.x = -Math.PI / 2;
    this.headlightGlow.position.set(CX, 0.05, -32);
    r.add(this.ground);
    this.ground.add(this.headlightGlow);
    // real headlights: they light the asphalt, the traffic, and the deer's last moments
    for (const s of [-1, 1]) {
      const hl = new THREE.SpotLight(0xffe2b8, 160, 120, 0.4, 0.5, 1.1);
      hl.position.set(CX + s * 0.62, 0.62, -3.4);
      hl.target.position.set(CX + s * 1.2, 0, -26);
      r.add(hl, hl.target);
      this.headlights.push(hl);
    }

    // --- Steering wheel: a T. two drooping cross spokes and a stem, all meeting at the horn.
    const tilt = this.tilt;
    tilt.position.set(0, 0.82, -0.46);
    tilt.rotation.x = -0.42;
    r.add(tilt);
    tilt.add(this.wheelSpin);
    const ws = this.wheelSpin;
    const leather = pbr(0x2a1c22, 0.55, 0, { bumpMap: leatherBump, bumpScale: 1.2, sheen: 0.6, sheenColor: new THREE.Color(0x885566), clearcoat: 0.15 });
    const spokeMat = pbr(0x1c1520, 0.45, 0.35, { clearcoat: 0.5, clearcoatRoughness: 0.3, bumpMap: grain, bumpScale: 0.15 });
    ws.add(new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.024, 20, 112), leather));
    const stitch = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.0245, 4, 96, Math.PI * 0.5), pbr(0xff2a2a, 0.6, 0, { wireframe: true }));
    stitch.rotation.z = Math.PI * 0.25;
    ws.add(stitch);
    // twelve o'clock marker: so you always know how much trouble the wheel is in
    const mark = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.0252, 10, 6, 0.11), pbr(0xffc400, 0.4, 0.1, { emissive: 0x803000, emissiveIntensity: 0.4 }));
    mark.rotation.z = Math.PI / 2 - 0.055;
    ws.add(mark);
    // thumb rests where the cross spokes meet the rim
    for (const a of [-SPOKE_DROOP, Math.PI + SPOKE_DROOP]) {
      const bump = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), leather);
      bump.scale.set(0.02, 0.036, 0.027);
      bump.position.set(Math.cos(a) * 0.171, Math.sin(a) * 0.171, 0.002);
      bump.rotation.z = a;
      ws.add(bump);
    }
    const spoke = (angle: number, w0: number, w1: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(0.03, -w0);
      sh.lineTo(0.176, -w1);
      sh.quadraticCurveTo(0.184, 0, 0.176, w1);
      sh.lineTo(0.03, w0);
      sh.lineTo(0.03, -w0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3, curveSegments: 6 });
      const m = new THREE.Mesh(g, spokeMat);
      m.position.z = -0.006;
      m.rotation.z = angle;
      ws.add(m);
      return m;
    };
    spoke(-SPOKE_DROOP, 0.036, 0.022);
    spoke(Math.PI + SPOKE_DROOP, 0.036, 0.022);
    spoke(-Math.PI / 2, 0.03, 0.045);
    // cross-spoke trim: a chrome inlay and a little button cluster on each side
    for (const s of [-1, 1]) {
      const a = s > 0 ? -SPOKE_DROOP : Math.PI + SPOKE_DROOP;
      const g = new THREE.Group();
      g.rotation.z = a;
      g.position.z = 0.0115;
      ws.add(g);
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.0035, 0.003), chrome);
      inlay.position.set(0.128, s > 0 ? 0.021 : -0.021, 0);
      g.add(inlay);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.017, 0.013, 0.006, 2, 0.003), darker);
        b.position.set(0.1 + (i % 2) * 0.022, (i < 2 ? 0.009 : -0.009) * (s > 0 ? 1 : -1), 0.001);
        g.add(b);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0018, 0.002), s > 0 ? glow(0.2, 1.6, 1.8) : glow(2.2, 0.3, 1.4));
        led.position.copy(b.position).add(V3(0, 0, 0.0035));
        g.add(led);
      }
    }
    // stem badge
    const badge = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.05, 0.004, 2, 0.002), chrome);
    badge.position.set(0, -0.13, 0.0115);
    ws.add(badge);
    // the hub: the horn, where every spoke ends up
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.083, 0.05, 48), leather);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.012;
    ws.add(hub);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0745, 0.0035, 8, 64), chrome);
    bezel.position.z = 0.037;
    ws.add(bezel);
    const horn = new THREE.Mesh(new THREE.CircleGeometry(0.071, 48), pbr(0xffffff, 0.3, 0.2, { map: Art.hornTex(), clearcoat: 1 }));
    horn.position.z = 0.0375;
    ws.add(horn);
    // column, shroud, stalks
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 16), darker);
    column.rotation.x = Math.PI / 2;
    column.position.z = -0.2;
    tilt.add(column);
    const shroud = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.11, 0.16, 3, 0.035), darker);
    shroud.position.set(0, -0.015, -0.12);
    tilt.add(shroud);
    for (const s of [-1, 1]) {
      tilt.add(beam(V3(s * 0.07, 0.0, -0.1), V3(s * 0.2, -0.035, -0.075), 0.012, 0.012, darker));
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10), chrome);
      tip.position.set(s * 0.215, -0.039, -0.072);
      tip.rotation.z = Math.PI / 2 - s * 0.26;
      tilt.add(tip);
    }

    // --- Beer can
    this.canObj = makeCan();
    this.can = this.canObj.group;
    this.canTab = this.canObj.tab;
    this.can.visible = false;

    this.cig = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.06, 12), pbr(0xf6f1e6, 0.8));
    paper.position.y = 0.012;
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.022, 12), pbr(0xd98c3a, 0.7));
    filter.position.y = -0.029;
    this.ember = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 10, 8), glow(1, 0.3, 0.05));
    this.ember.position.y = 0.043;
    this.ember.scale.y = 0.6;
    this.cig.add(paper, filter, this.ember);
    this.cig.visible = false;
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: Art.softDot('255,160,40'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flame.scale.setScalar(0.05);
    this.flame.visible = false;
    this.flame.position.y = 0.06;
    this.cig.add(this.flame);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.025), [
      toon(0xc8102e), toon(0xc8102e), toon(0xe8e2d2), toon(0xe8e2d2), toon(0xffffff, { map: Art.cigPackTex() }), toon(0xc8102e),
    ]);
    pack.position.set(0.5, 0.96, -0.86);
    pack.rotation.set(-0.5, -0.3, 0.1);
    r.add(pack);

    // --- mirror, dice, freshener
    r.add(beam(V3(CX, 1.6, -0.4), V3(CX, 1.49, -0.45), 0.018, 0.018, darker));
    const mirrorBack = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.085, 0.03, 2, 0.012), darker);
    mirrorBack.position.set(CX, 1.47, -0.465);
    mirrorBack.scale.set(0.85, 0.85, 1);
    mirrorBack.rotation.x = -0.12;
    r.add(mirrorBack);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.07), new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture }));
    const uv = mirror.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    mirror.position.set(CX, 1.47, -0.449);
    mirror.scale.set(0.85, 0.85, 1);
    mirror.rotation.x = -0.12;
    r.add(mirror);

    const pivot = new THREE.Group();
    pivot.position.set(CX + 0.1, 1.44, -0.465);
    r.add(pivot);
    const diceMats = [1, 6, 2, 5, 3, 4].map((n) => pbr(0xffffff, 0.95, 0, { map: Art.diceFace(n), sheen: 1, sheenColor: new THREE.Color(0xff88cc) }));
    for (const [dx, len] of [[-0.02, 0.045], [0.025, 0.06]]) {
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, len, 4), toon(0xffffff));
      str.position.set(dx, -len / 2, 0);
      pivot.add(str);
      const die = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.045, 0.045, 3, 0.01), diceMats);
      die.position.set(dx, -len - 0.02, 0);
      die.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      pivot.add(die);
    }
    const fresh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.12),
      new THREE.MeshStandardMaterial({ map: Art.freshenerTex(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    fresh.position.set(-0.05, -0.075, 0.01);
    fresh.scale.setScalar(0.75);
    pivot.add(fresh);
    this.dice = { pivot, ax: 0, az: 0, vx: 0, vz: 0 };

    // --- bobblehead deer (it knows)
    const bob = new THREE.Group();
    const brown = pbr(0x8a5a2b, 0.4, 0, { clearcoat: 0.8 });
    bob.add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.08, 2, 0.015), brown));
    const bhead = new THREE.Group();
    bhead.position.set(0, 0.06, -0.03);
    bhead.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), brown));
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), glow(3, 3, 0.5));
      eye.position.set(s * 0.013, 0.008, -0.027);
      bhead.add(eye);
      bhead.add(beam(V3(s * 0.012, 0.02, 0), V3(s * 0.04, 0.07, 0.01), 0.005, 0.005, pbr(0xe8d8b0, 0.5)));
    }
    bob.add(bhead);
    bob.position.set(-0.36, 0.97, -0.88);
    bob.rotation.y = 0.5;
    r.add(bob);
    this.bobble = { head: bhead, a: 0, v: 0, b: 0, vb: 0 };

    for (let i = 0; i < 140; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      r.add(s);
      this.particles.push({ s, v: V3(0, 0, 0), life: 0, max: 1, grow: 0, op: 0, grav: 0 });
    }

    // Buckshot-style harsh key light: a single bare dome bulb over the wheel
    this.dashLamp = new THREE.SpotLight(0xffd6a0, 2.2, 3, 0.9, 0.6, 1.6);
    this.dashLamp.position.set(0.15, 1.6, 0.05);
    this.dashLamp.target.position.set(0, 0.85, -0.55);
    this.dashLamp.castShadow = true;
    this.dashLamp.shadow.mapSize.set(1024, 1024);
    this.dashLamp.shadow.bias = -0.0004;
    this.dashLamp.shadow.camera.near = 0.2;
    this.dashLamp.shadow.camera.far = 3;
    r.add(this.dashLamp, this.dashLamp.target);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), glow(4, 3.4, 2.4));
    bulb.position.copy(this.dashLamp.position).add(V3(0, 0.02, 0));
    r.add(bulb);
    const fill = new THREE.PointLight(0xff3fa8, 0.25, 2.2, 2);
    fill.position.set(0.0, 1.0, -0.6);
    r.add(fill);

    r.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !o.material.transparent) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  attachArms(data: ArmData) {
    this.armL = new Arm(data, -1, SHOULDER_L, this.root);
    this.armR = new Arm(data, 1, SHOULDER_R, this.root);
    this.restR.theta = R_TOP;
    this.can.rotation.z = Math.PI / 2;
    this.armR.canAnchor.add(this.can);
    this.armR.cigAnchor.add(this.cig);
  }

  get busy() {
    return this.action !== null;
  }

  private start(a: Omit<Action, 't'>) {
    if (this.action || !this.armR) return false;
    this.action = { ...a, t: 0 };
    // decide now how the hand comes back to the wheel (applied once it has left)
    if (a.R) this.rIdle = Math.random() < 0.6 ? 'top' : 'horn';
    return true;
  }

  // ---------------- actions ----------------
  beer() {
    const h = this.hooks;
    const c = this.canObj;
    const cup = V3(0.3, 0.6, -0.33);
    const hold = V3(0.035, 0.975, -0.33);
    const upHold = V3(0, 1, 0.5).normalize();
    const M = V3(0.0, 1.045, -0.075);
    const chugA = V3(0, 0.6, -0.8).normalize();
    const chugB = V3(0, 0.86, -0.51).normalize();
    const atMouth = (U: THREE.Vector3) => M.clone().addScaledVector(U, 0.062);
    const back = V3(1, 0.15, 0.1);
    const backChug = V3(1, 0.0, -0.9).normalize();
    const CAN_LOW = V3(-0.03, -0.06, -0.078); // grip toward the bottom of the can so the can (not the fist) owns the frame
    const qCup = canHandQ(V3(0, 1, 0), back);
    const qHold = canHandQ(upHold, back);
    const qA = canHandQ(chugA.clone().negate(), backChug);
    const qB = canHandQ(chugB.clone().negate(), backChug);
    const qCrush = canHandQ(V3(0, 1, 0.2).normalize(), back);
    const qToss = canHandQ(V3(0.5, 1, 0.3).normalize(), back);
    // left index finger hooks the ring (far side of the lid, away from the opening)
    const canQ = qmul(qHold, CAN_ROT);
    const lidC = hold.clone().addScaledVector(upHold, 0.062);
    const ringP = lidC.clone().addScaledVector(V3(0, 0, -1).applyQuaternion(canQ), 0.014);
    const qTab = fwdUp(V3(0.75, -0.45, -0.4), V3(0.1, 1, 0.35));
    const tabPose = (dy: number, dz: number, idx: number) => {
      const tip = ringP.clone().addScaledVector(upHold, dy).add(V3(0, 0, dz));
      return { ...P(tip, qTab, TIP_LOCAL_L, [idx, 1.35, 1.45, 1.5], 0.9, 0.2), tip, tipW: 1 };
    };
    let tabT = 0;
    const events: Ev[] = [
      { t: 0.5, fn: () => { c.reset(); this.can.visible = true; h.grabCan(); } },
      { t: 1.72, fn: () => { this.fizz(); h.crack(); } },
      { t: 4.05, fn: () => h.crush() },
      { t: 4.3, fn: () => h.burp() },
      { t: 4.42, fn: () => this.tossCan() },
    ];
    for (let t = 2.8; t < 3.85; t += 0.2) events.push({ t, fn: () => { h.glug(); this.drip(); } });
    return this.start({
      name: 'beer',
      dur: 5.1,
      R: [
        { t: 0, pose: null },
        { t: 0.42, pose: P(cup, qCup, CAN_LOCAL, 0.2, 0.2) },
        { t: 0.58, pose: P(cup, qCup, CAN_LOCAL, 1.15, 1.0) },
        { t: 1.05, pose: P(hold, qHold, CAN_LOCAL, 1.15, 1.0) },
        { t: 1.68, pose: P(hold, qHold, CAN_LOCAL, 1.15, 1.0) },
        { t: 1.76, pose: P(hold.clone().add(V3(0, -0.008, 0)), qHold, CAN_LOCAL, 1.2, 1.05) },
        { t: 2.3, pose: P(hold.clone().add(V3(0, 0.005, 0)), qHold, CAN_LOCAL, 1.15, 1.0) },
        { t: 2.75, pose: P(atMouth(chugA), qA, CAN_LOW, 1.15, 1.0) },
        { t: 3.85, pose: P(atMouth(chugB), qB, CAN_LOW, 1.15, 1.0) },
        { t: 4.12, pose: P(V3(0.15, 0.97, -0.36), qCrush, CAN_LOCAL, 1.55, 1.3) },
        { t: 4.38, pose: P(V3(0.46, 1.02, -0.46), qToss, CAN_LOCAL, 1.3, 1.0) },
        { t: 4.46, pose: P(V3(0.47, 1.03, -0.47), qToss, CAN_LOCAL, 0.15, 0.2) },
        { t: 5.1, pose: null },
      ],
      L: [
        { t: 0, pose: null },
        { t: 0.9, pose: null },
        { t: 1.3, pose: tabPose(0.012, 0.0, 0.25) },
        { t: 1.45, pose: tabPose(0.002, 0.0, 0.55) },
        { t: 1.72, pose: tabPose(0.02, 0.006, 1.0) },
        { t: 1.95, pose: tabPose(0.004, -0.004, 0.35) },
        { t: 2.45, pose: null },
      ],
      events,
      cam: (t) => {
        if (t > 0.9 && t < 2.45) return -0.27 * Math.sin(Math.min(1, (t - 0.9) / 1.4) * Math.PI);
        if (t < 2.45) return 0;
        if (t < 2.85) return smooth((t - 2.45) / 0.4) * 0.5;
        if (t < 3.85) return 0.5 + (t - 2.85) * 0.07;
        return 0.57 * (1 - smooth((t - 3.85) / 0.35));
      },
      tick: (t) => {
        // ring pull: lift the tab, the nose levers the scored flap into the can, then fold the tab back
        if (t < 1.45) tabT = 0;
        else if (t < 1.72) tabT = smooth((t - 1.45) / 0.27) * 1.25;
        else if (t < 1.95) tabT = 1.25 - smooth((t - 1.72) / 0.23) * 1.05;
        else tabT = 0.2;
        c.tab.rotation.x = tabT;
        c.flap.rotation.x = t < 1.62 ? 0 : Math.min(1.45, smooth((t - 1.62) / 0.12) * 1.45);
        this.chug = t > 2.75 && t < 3.85 ? Math.min(1, (t - 2.75) / 0.2) * Math.min(1, (3.85 - t) / 0.15) : 0;
        if (t > 4.02 && t < 4.2) this.can.scale.set(1, lerp(1, 0.45, (t - 4.02) / 0.12), 1);
        if (t > 1.75 && t < 2.6 && Math.random() < 0.5) this.foam();
      },
    });
  }

  cigarette() {
    const h = this.hooks;
    const first = this.cigDrags <= 0;
    const qCool = qmul(rotY(-0.9), qmul(rotX(-0.5), Q_PALM_FACE));
    const qMouth = qmul(rotZ(0.75), qmul(rotY(-0.35), qmul(rotX(-0.75), Q_PALM_FACE)));
    const mouth = P(MOUTH, qMouth, CIG_FILTER_LOCAL, 0.4, 0.3);
    const mouth2 = P(MOUTH.clone().add(V3(0, 0, 0.008)), qMouth, CIG_FILTER_LOCAL, 0.4, 0.3);
    const cool = W(V3(0.28, 0.97, -0.42), qCool, [0.35, 0.4, 1.2, 1.3], 0.6);
    const keys: Key[] = [{ t: 0, pose: null }];
    const events: Ev[] = [];
    let off = 0;
    if (first) {
      keys.push({ t: 0.35, pose: P(V3(0.5, 0.97, -0.86), Q_FLAT, CIG_FILTER_LOCAL, 0.2, 0.2) });
      keys.push({ t: 0.5, pose: P(V3(0.5, 0.97, -0.84), Q_FLAT, CIG_FILTER_LOCAL, 0.5, 0.4) });
      events.push({ t: 0.42, fn: () => { this.cig.visible = true; this.cigLit = false; this.cigDrags = 4; } });
      off = 0.5;
    }
    keys.push({ t: off + 0.5, pose: mouth });
    if (first) {
      events.push({ t: off + 0.55, fn: () => { this.flame.visible = true; h.lighter(); } });
      events.push({ t: off + 0.95, fn: () => { this.flame.visible = false; this.cigLit = true; } });
    }
    const inhaleAt = off + (first ? 0.9 : 0.55);
    events.push({ t: inhaleAt, fn: () => h.inhale() });
    keys.push({ t: off + 1.7, pose: mouth2 });
    keys.push({ t: off + 2.1, pose: cool });
    events.push({ t: off + 2.05, fn: () => { this.exhale(); h.exhale(); } });
    if (this.cigDrags === 1) {
      keys.push({ t: off + 2.7, pose: cool });
      keys.push({ t: off + 2.95, pose: W(V3(0.6, 1.05, -0.32), qCool, [0.35, 0.4, 1.2, 1.3], 0.6) });
      events.push({ t: off + 2.97, fn: () => this.flickCig() });
      keys.push({ t: off + 3.5, pose: null });
    } else {
      keys.push({ t: off + (first ? 3.3 : 2.8), pose: cool });
      keys.push({ t: off + (first ? 3.9 : 3.3), pose: null });
    }
    events.push({ t: off + 2.2, fn: () => { this.cigDrags--; } });
    return this.start({
      name: 'cig',
      dur: keys[keys.length - 1].t,
      R: keys,
      events,
      cam: (t) => {
        const a = off + 0.4, b = off + 1.8;
        return t > a && t < b ? 0.13 * Math.sin(((t - a) / (b - a)) * Math.PI) : 0;
      },
      tick: (t) => {
        const m = this.ember.material as THREE.MeshBasicMaterial;
        const k = t > inhaleAt && t < off + 1.7 ? 4 + Math.sin(t * 20) * 0.8 : 1.2;
        if (this.cigLit) m.color.setRGB(k, k * 0.28, 0.05);
      },
    });
  }

  horns() {
    const keys: Key[] = [{ t: 0, pose: null }];
    const horns = [0, 1.7, 1.7, 0];
    const base = V3(0.2, 1.06, -0.55);
    keys.push({ t: 0.22, pose: W(base, Q_BACK_FACE, horns, 1.2, 1) });
    for (let i = 0; i < 4; i++) {
      keys.push({ t: 0.38 + i * 0.3, pose: W(base.clone().add(V3(0, 0.12, -0.03)), qmul(rotZ(-0.15), Q_BACK_FACE), horns, 1.2, 1) });
      keys.push({ t: 0.53 + i * 0.3, pose: W(base, Q_BACK_FACE, horns, 1.2, 1) });
    }
    keys.push({ t: 2.0, pose: null });
    return this.start({ name: 'horns', dur: 2.0, R: keys, events: [{ t: 0.2, fn: () => this.hooks.horns() }] });
  }

  /** hold the forearm across the view, fist clenched, wrist curling. the veins: maximum. */
  flex() {
    const keys: Key[] = [{ t: 0, pose: null }];
    const base = V3(-0.015, 1.06, -0.37);
    const fwd = V3(-0.75, 0.6, -0.25);
    const up = V3(0.1, 0.25, 1);
    const fist = (k: number, twist: number) => {
      const q = qmul(new THREE.Quaternion().setFromAxisAngle(fwd.clone().normalize(), twist), fwdUp(fwd, up));
      return qmul(q, rotX(-k));
    };
    keys.push({ t: 0.4, pose: W(base, fist(0.15, 0), 1.5, 1.15) });
    for (let i = 0; i < 6; i++) {
      const s = i % 2 === 0;
      keys.push({ t: 0.65 + i * 0.3, pose: W(base.clone().add(V3(0, s ? 0.012 : 0, 0)), fist(s ? 0.65 : -0.15, s ? 0.25 : -0.1), s ? 1.62 : 1.48, s ? 1.3 : 1.1) });
    }
    keys.push({ t: 2.45, pose: W(base, fist(0.2, 0), 1.5, 1.15) });
    keys.push({ t: 2.9, pose: null });
    const events: Ev[] = [{ t: 0.35, fn: () => this.hooks.flex() }];
    for (let t = 0.6; t < 2.4; t += 0.3) events.push({ t, fn: () => this.hooks.heartbeat() });
    return this.start({
      name: 'flex',
      dur: 2.9,
      R: keys,
      events,
      cam: (t) => (t > 0.3 && t < 2.5 ? 0.04 * Math.min(1, (t - 0.3) / 0.3) : 0),
      tick: (t) => (this.pumpTarget = t > 0.4 && t < 2.5 ? 1 : 0),
    });
  }

  private foam() {
    const p = this.root.worldToLocal(this.can.localToWorld(V3(0, 0.063, 0.013)));
    this.spawn(p, V3(rand(-0.02, 0.02), rand(0.01, 0.05), rand(-0.02, 0.02)), rand(0.4, 0.8), 0.006, 0.012, 0.95, 0.02, 0xfff6e0);
  }

  private drip() {
    const p = this.root.worldToLocal(this.can.localToWorld(V3(0, 0.063, 0.02)));
    for (let i = 0; i < 3; i++) this.spawn(p.clone(), V3(rand(-0.15, 0.15), rand(-0.1, 0.05), rand(0.05, 0.2)), 0.6, 0.006, 0.0, 0.9, 6, 0xffb21e);
  }

  private fizz() {
    const p = this.root.worldToLocal(this.can.localToWorld(V3(0, 0.064, 0.012)));
    for (let i = 0; i < 30; i++) this.spawn(p.clone(), V3(rand(-0.2, 0.2), rand(0.4, 1.0), rand(-0.1, 0.3)), rand(0.3, 0.6), 0.005, 0.008, 0.95, 3.5, i % 3 ? 0xfff4d8 : 0xffc040);
    for (let i = 0; i < 6; i++) this.spawn(p.clone(), V3(rand(-0.05, 0.05), rand(0.05, 0.15), rand(-0.05, 0.05)), 1.2, 0.02, 0.05, 0.25, -0.05);
  }

  private tossCan() {
    const m = this.can.clone();
    this.root.attach(m);
    m.position.copy(this.root.worldToLocal(this.can.getWorldPosition(V3(0, 0, 0))));
    this.can.visible = false;
    const slot = this.pile.length;
    const target = V3(0.32 + (slot % 5) * 0.085 + rand(-0.02, 0.02), 0.975 + Math.floor(slot / 5) * 0.03, -0.92 + rand(-0.04, 0.04));
    const v = target.clone().sub(m.position).multiplyScalar(1 / 0.45);
    v.y += 0.5 * 9.8 * 0.45;
    this.flying.push({ m, v, spin: V3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), t: 0, target });
  }

  private flickCig() {
    const m = this.cig.clone();
    this.root.attach(m);
    m.position.copy(this.root.worldToLocal(this.cig.getWorldPosition(V3(0, 0, 0))));
    this.cig.visible = false;
    this.cigLit = false;
    this.flying.push({ m, v: V3(3, 2, 1.5), spin: V3(20, 5, 9), t: 0, out: true });
    this.hooks.flick();
  }

  addDeerSticker() {
    const n = this.stickers.length;
    if (n >= 24) return;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshStandardMaterial({ map: this.stickerTex, transparent: true, roughness: 0.4 }));
    s.position.set(-0.47 + (n % 6) * 0.045, 0.9 + Math.floor(n / 6) * 0.045, -0.672);
    s.rotation.set(-0.25, 0.12, rand(-0.3, 0.3));
    this.root.add(s);
    this.stickers.push(s);
  }

  exhale() {
    for (let i = 0; i < 26; i++)
      this.spawn(MOUTH.clone().add(V3(rand(-0.02, 0.02), rand(-0.02, 0.01), -0.02)), V3(rand(-0.15, 0.15), rand(-0.05, 0.12), rand(-0.9, -0.4)), rand(1.6, 2.6), rand(0.05, 0.08), rand(0.25, 0.45), 0.5, 0);
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number, op: number, grav: number, color = 0xffffff) {
    const s = this.particles.find((q) => q.life <= 0);
    if (!s) return;
    (s.s.material as THREE.SpriteMaterial).color.setHex(color);
    s.s.position.copy(p);
    s.s.scale.setScalar(size);
    s.v.copy(v);
    s.life = s.max = life;
    s.grow = grow;
    s.op = op;
    s.grav = grav;
    s.s.visible = true;
  }

  addCrack(severity: number) {
    const c = this.crack.c;
    const x = rand(150, 874), y = rand(80, 440);
    c.strokeStyle = 'rgba(235,240,255,0.75)';
    c.lineWidth = 1.6;
    const n = 6 + Math.floor(severity * 6);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2), px = x, py = y;
      c.beginPath();
      c.moveTo(px, py);
      const len = rand(40, 120) * (0.6 + severity);
      for (let k = 0; k < 6; k++) {
        a += rand(-0.4, 0.4);
        px += (Math.cos(a) * len) / 6;
        py += (Math.sin(a) * len) / 6;
        c.lineTo(px, py);
      }
      c.stroke();
    }
    for (let ring = 1; ring < 3; ring++) {
      c.beginPath();
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2, rr = ring * 18 * (0.6 + severity) + rand(-4, 4);
        if (k) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.stroke();
    }
    this.crack.tex.needsUpdate = true;
  }

  clearCracks() {
    this.crack.c.clearRect(0, 0, 1024, 512);
    this.crack.tex.needsUpdate = true;
    for (const m of this.pile) this.root.remove(m);
    for (const m of this.stickers) this.root.remove(m);
    this.pile = [];
    this.stickers = [];
    this.cigDrags = 0;
    this.cig.visible = false;
    this.can.visible = false;
    this.action = null;
    this.chug = 0;
    this.pumpTarget = 0;
  }

  private sample(keys: Key[] | undefined, t: number, def: Pose): { pose: Pose; off: boolean } {
    if (!keys) return { pose: def, off: false };
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const f = smooth((t - k0.t) / Math.max(1e-4, k1.t - k0.t));
    const fill = (p: Pose | null) => (p ? (p.pole ? p : { ...p, pole: def.pole }) : def);
    const off = !!(k0.pose || k1.pose) && !(f < 0.15 && !k0.pose) && !(f > 0.85 && !k1.pose);
    return { pose: mixPose(fill(k0.pose), fill(k1.pose), f), off };
  }

  // ---------------- hands at rest ----------------
  /**
   * The bus knob: the palm sits on one spot of the rim (glued to the wheel at local angle h.theta) and never lets go.
   * Resting, the fingers hang over the far side (or lie flat). Turning, they close into a fist. Once the wheel has
   * carried the hand past what a wrist can roll, the hand opens flat on the rim and steers by palm friction,
   * fingers never pointing more than 90° away from up.
   */
  private knobPose(h: HandRest<string>, fT: Frame, rot: number, side: number, turning: boolean, dt: number): Pose {
    if (!turning) h.noFist = false;
    const thC = h.theta + rot;
    const psiG = Math.PI / 2 - thC; // where the back of a glued hand would face (clockwise from 12)
    const psi = clamp(psiG, -KNOB_MAX, KNOB_MAX);
    const flatK = smooth((Math.abs(psiG) - 1.15) / 0.35);
    h.fist = damp(h.fist, turning && !h.noFist ? 1 : 0, 9, dt);
    const fist = h.fist * (1 - flatK);
    const n = V3(0, 0, 1);
    const rc = V3(Math.cos(thC), Math.sin(thC), 0);
    const e = V3(Math.sin(psi), Math.cos(psi), 0);
    // draped: palm on top of the rim, fingers falling over its far side
    const B = h.flat ? 1.15 : 0.86; // flat fingers lie forward over the rim instead of pointing at the sky
    const yD = n.clone().multiplyScalar(Math.cos(B)).addScaledVector(e, Math.sin(B));
    const fD = e.clone().multiplyScalar(Math.cos(B)).addScaledVector(n, -Math.sin(B));
    // flat: palm pressed on the face of the rim, fingers lying along the wheel
    const yF = n.clone().multiplyScalar(0.95).addScaledVector(rc, 0.3).normalize();
    const fF = e.clone().addScaledVector(yF, -e.dot(yF)).normalize();
    const yy = yD.lerp(yF, flatK).normalize();
    const ff = fD.lerp(fF, flatK);
    ff.addScaledVector(yy, -ff.dot(yy)).normalize();
    const q = fT.q.clone().multiply(fwdUp(ff, yy));
    const local = PALM_DRAPE.clone().lerp(PALM_FIST, fist).lerp(PALM_FLAT, flatK);
    const at = rc.clone().multiplyScalar(RIM_R).applyMatrix4(fT.m);
    const rest = h.flat ? CURL_FANCY : CURL_DANGLE;
    const curl = rest.map((c, j) => lerp(lerp(c, CURL_FIST[j], fist), CURL_FANCY[j], flatK));
    return {
      w: at.sub(local.applyQuaternion(q)),
      q,
      curl,
      thumb: lerp(lerp(h.flat ? 0.12 : 0.3, 0.85, fist), 0.1, flatK),
      spread: lerp(lerp(h.flat ? 0.26 : 0.22, 0.04, fist), 0.3, flatK),
      pole: side > 0 ? POLE_R : V3(-1, -0.7, 0.35).normalize(),
    };
  }

  /** palm on the curve between the horn's face and the top of the hub (a touch right), knuckles up, fingers lying forward over the top toward the dash */
  private hornPose(h: HandRest<string>, fW: Frame, rot: number, s: number, tap: number): Pose {
    const a = Math.PI / 2 - 0.3 * s;
    if (Math.abs(rot) > 1.45 && !h.moving) {
      // past 90°: slide out to the rim and keep going palm-flat, bus-knob style
      h.go('top', 0.22, 0.02, true);
      h.theta = a;
      h.flat = true;
      h.noFist = true;
      if (h === this.restR) this.rIdle = 'top';
    }
    const e = V3(Math.cos(a), Math.sin(a), 0), n = V3(0, 0, 1);
    const B = 1.15;
    const back = n.clone().multiplyScalar(Math.cos(B)).addScaledVector(e, Math.sin(B));
    const fwd = e.clone().multiplyScalar(Math.cos(B)).addScaledVector(n, -Math.sin(B));
    const q = fW.q.clone().multiply(fwdUp(fwd, back));
    const contact = e.clone().multiplyScalar(0.08).addScaledVector(n, 0.026).applyMatrix4(fW.m);
    const w = contact.sub(V3(0, -0.022, -0.06).applyQuaternion(q));
    return { w, q, curl: [0.26 - tap * 0.4, 0.22, 0.28, 0.36], thumb: 0.3, spread: 0.2, pole: V3(s, -0.9, 0.15).normalize() };
  }

  private restPoseR(dt: number, fW: Frame, fT: Frame, rot: number, tap: number, turning: boolean): { pose: Pose; power: number } {
    const h = this.restR;
    const pose = h.style === 'horn' ? this.hornPose(h, fW, rot, 1, tap) : this.knobPose(h, fT, rot, 1, turning, dt);
    if (h.style === 'top' && h.fist < 0.3 && !h.flat) pose.curl[0] -= tap * 0.3;
    return h.update(dt, pose, POWER[h.style]);
  }

  private restPoseL(dt: number, fW: Frame, fT: Frame, rot: number, time: number, beat: number, turning: boolean): { pose: Pose; power: number } {
    const h = this.restL;
    let pose: Pose;
    const st = h.style;
    if (st === 'door') {
      // elbow parked on the door, hand lazily wrapped over the top edge, one finger keeping time
      const drum = Math.max(0, Math.sin(beat * Math.PI));
      const fi = Math.floor(beat) % 4;
      pose = {
        w: V3(-0.632, 0.93, -0.515),
        q: fwdUp(V3(-0.55, -0.22, -0.8), V3(-0.2, 1, -0.05)),
        curl: [0.95, 1.0, 1.05, 1.12].map((c, j) => c - (j === fi ? drum * 0.35 : 0)),
        thumb: 0.2,
        spread: 0.15,
        pole: POLE_SILL,
      };
    } else if (st === 'air') {
      // elbow still on the door, forearm up, hand loose by the pillar riding the breeze
      const sw = Math.sin(time * 1.3);
      pose = {
        w: V3(-0.585 + sw * 0.01, 1.13, -0.43),
        q: qmul(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), sw * 0.12), fwdUp(V3(-0.1, 0.32, -0.94), V3(-0.6, 0.8, 0.1))),
        curl: [0.22, 0.3, 0.38, 0.46],
        thumb: 0.15,
        spread: 0.45,
        pole: POLE_SILL,
      };
    } else if (st === 'graze') {
      // the lightest possible steering input: elbow still on the door, fingertips just touching the rim
      const a = L_GRAZE + Math.sin(time * 0.6) * 0.04;
      const tip = V3(Math.cos(a) * RIM_R, Math.sin(a) * RIM_R, 0.024).applyMatrix4(fT.m);
      const q = fwdUp(V3(0.72, -0.32, -0.62), V3(0.25, 1, 0.1));
      pose = {
        w: tip.clone().sub(V3(-0.03, -0.025, -0.18).applyQuaternion(q)),
        q, curl: [0.32, 0.36, 0.45, 0.55], thumb: 0.15, spread: 0.2, tip, tipW: 1, pole: POLE_GRAZE,
      };
    } else pose = this.knobPose(h, fT, rot, -1, turning, dt);
    return h.update(dt, pose, POWER[st === 'top' ? 'L-top' : st]);
  }

  /** keep road-level decals flat on the asphalt no matter how the body pitches and rolls */
  syncGround() {
    const r = this.root;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.rotation.x, 0, r.rotation.z, 'YXZ')).invert();
    this.ground.quaternion.copy(q);
    this.ground.position.set(0, -r.position.y, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(r.rotation).invert());
  }

  update(dt: number, p: { steer: number; steerIn: number; throttle: number; brake: number; v: number; latAcc: number; longAcc: number; time: number; beat: number; hell: number; bump: number; bac: number; heart: number }) {
    this.steerVis = damp(this.steerVis, p.steer, 10, dt);
    this.wheelSpin.rotation.z = -this.steerVis * 1.9;
    this.root.updateMatrixWorld(true);
    const beatPulse = Math.pow(1 - (p.beat % 1), 3);
    this.pedals.forEach((pd, i) => (pd.rotation.x = damp(pd.rotation.x, 0.35 - (i === 0 ? p.brake : p.throttle) * 0.35, 14, dt)));

    if (this.armL && this.armR) {
      const rot = this.wheelSpin.rotation.z;
      const fW = frameOf(this.wheelSpin, this.root);
      const fT = frameOf(this.tilt, this.root);
      // is the player actually steering? fingers close the moment they do; a held turn pulls the left hand in
      const turning = Math.abs(p.steerIn) > 0.3;
      this.holdT = Math.abs(p.steerIn) > 0.5 ? this.holdT + dt : 0;
      this.hard = this.holdT > 0.1 ? 0.7 : Math.max(0, this.hard - dt);
      const hard = this.hard > 0;

      let camAdd = 0;
      const a = this.action;
      if (a) {
        a.t += dt;
        const t = Math.min(a.t, a.dur);
        for (const e of a.events) if (!e.done && t >= e.t) { e.done = true; e.fn(); }
        a.tick?.(t);
        camAdd = a.cam?.(t) ?? 0;
      }

      // ---- right hand: the main event
      const hr = this.restR;
      const rBusy = !!(a && a.R);
      const settled = !turning && Math.abs(rot) < 0.3; // only rearrange when the wheel is calm
      const placeR = () => {
        hr.theta = R_TOP - rot;
        hr.flat = Math.random() < 0.35;
        hr.noFist = false;
      };
      if (this.force.R) this.rIdle = this.force.R;
      if (rBusy) {
        // the hand is off doing crimes; once it has left, quietly decide where it comes back to
        if (a!.t > (a!.R![1]?.t ?? 0) && hr.style !== this.rIdle) {
          hr.snap(this.rIdle);
          placeR();
        }
      } else if (hr.style !== this.rIdle && !hr.moving && settled) {
        hr.go(this.rIdle, 0.55, 0.07);
        placeR();
      }
      this.rIdleT -= dt;
      if (this.rIdleT <= 0) {
        this.rIdleT = rand(9, 22);
        if (!rBusy && settled && !hr.moving && !this.force.R) {
          if (Math.random() < 0.5) this.rIdle = this.rIdle === 'top' ? 'horn' : 'top';
          else if (hr.style === 'top') {
            // re-settle: dangling fingers <-> fancy flat palm
            hr.go('top', 0.4, 0.03, true);
            hr.flat = !hr.flat;
          }
        }
      }
      const tap = Math.max(0, Math.sin(p.beat * Math.PI)) * 0.25;
      const restR = this.restPoseR(dt, fW, fT, rot, tap, turning);
      let Rr = { pose: restR.pose, off: false };
      if (a) Rr = this.sample(a.R, Math.min(a.t, a.dur), restR.pose);

      // ---- left hand: lives on the door. comes to the wheel only when the right hand is busy
      const hl = this.restL;
      const rAway = Rr.off;
      const lOnWheel = L_ON_WHEEL.includes(hl.style);
      const goL = (st: LStyle, dur: number, lift: number, keep = false, theta = L_TOP) => {
        hl.go(st, dur, lift, keep);
        hl.theta = theta - rot;
        hl.flat = Math.random() < 0.3;
        hl.noFist = false;
      };
      if (this.force.L) {
        if (hl.style !== this.force.L && !hl.moving) goL(this.force.L, 0.5, 0.06);
      } else if (rAway) {
        // a committed turn turns the graze into a real hand on the wheel: the palm lands where the fingertips were
        if (hard && hl.style === 'graze' && !hl.moving) goL('top', 0.22, 0.02, true, L_GRAZE);
        else if (!lOnWheel) goL('graze', 0.42, 0.06);
      } else if (lOnWheel && !hl.moving) hl.go(this.lIdle, 0.7, 0.06);
      else if (!lOnWheel && hl.style !== this.lIdle && !hl.moving) hl.go(this.lIdle, 0.9, 0.05);
      this.lIdleT -= dt;
      if (this.lIdleT <= 0) {
        const toAir = this.lIdle === 'door' && Math.random() < 0.35;
        this.lIdle = toAir ? 'air' : 'door';
        this.lIdleT = toAir ? rand(4, 8) : rand(10, 25);
      }
      const restL = this.restPoseL(dt, fW, fT, rot, p.time, p.beat, turning);
      let L = { pose: restL.pose, off: false };
      if (a) {
        if (a.L) L = this.sample(a.L, Math.min(a.t, a.dur), restL.pose);
        if (a.t >= a.dur) {
          this.action = null;
          this.chug = 0;
        }
      }
      const winOK = this.winHeld && !(this.action && this.action.L);
      this.win = damp(this.win, winOK ? 1 : 0, 5, dt);
      if (this.win > 0.01) {
        const wt = p.time;
        const wq = qmul(rotZ(Math.sin(wt * 2.2) * 0.45), qmul(rotY(0.9), Q_FLAT));
        const wp: Pose = { ...W(V3(-0.74, 1.08 + Math.sin(wt * 2.2 + 0.6) * 0.07, -0.42), wq, 0.08, 0.1, 0.6), pole: V3(-1, -0.1, 0.4).normalize() };
        L = { pose: mixPose(L.pose, wp, smooth(this.win)), off: L.off || this.win > 0.3 };
      }

      const rPow = Rr.off ? 0 : restR.power;
      const lPow = L.off ? 0 : restL.power;
      this.steerPower = Math.max(rPow, lPow);
      this.handsOn = { L: lPow > 0.25, R: rPow > 0.25 };
      this.grip = Math.max(Rr.off ? 0 : hr.fist, L.off ? 0 : hl.fist);

      for (const [arm, s, pole] of [[this.armL, L, POLE_L], [this.armR, Rr, POLE_R]] as const) {
        arm.curl = s.pose.curl;
        arm.thumb = s.pose.thumb;
        arm.spread = s.pose.spread ?? 0;
        arm.pole.copy(s.pose.pole ?? pole);
        arm.solve(s.pose.w, s.pose.q);
        // fingertip IK: nudge the wrist until the index tip actually lands on its target
        if (s.pose.tip && (s.pose.tipW ?? 0) > 0.01) {
          const w = s.pose.w.clone();
          for (let it = 0; it < 3; it++) {
            this.root.updateMatrixWorld(true);
            const tipNow = this.root.worldToLocal(arm.indexTip.getWorldPosition(V3(0, 0, 0)));
            w.addScaledVector(s.pose.tip.clone().sub(tipNow), s.pose.tipW ?? 1);
            arm.solve(w, s.pose.q);
          }
        }
      }
      this.camPitch = damp(this.camPitch, camAdd, 12, dt);
    }
    const bang = p.hell > 0.5 ? beatPulse * 0.05 : beatPulse * 0.008;
    this.camera.rotation.set(
      -0.12 + this.camPitch - bang + this.look.y,
      -this.steerVis * 0.1 + smooth(this.win) * 0.62 + this.look.x,
      -p.latAcc * 0.004 + Math.sin(p.time * 0.7) * p.bac * 0.04 + this.sway,
    );
    // wipers
    this.wiping = damp(this.wiping, this.wiping > 0.5 || this.wipeOn ? 1 : 0, 3, dt);
    const wa = this.wipeOn ? Math.abs(Math.sin(p.time * 2.6)) : 0;
    for (const a of this.wiperArms) a.rotation.z = damp(a.rotation.z, 1.35 - wa * 2.0, 20, dt);
    // phone: buzz on the dash while ringing
    if (this.ringing) {
      this.phone.position.x = -0.3 + Math.sin(p.time * 90) * 0.0015;
      this.phone.rotation.z = Math.sin(p.time * 70) * 0.03;
    }
    armUniforms.uPump.value = damp(armUniforms.uPump.value, Math.max(this.pumpTarget, p.hell * 0.6, this.grip * 0.45), 4, dt);
    armUniforms.uHell.value = damp(armUniforms.uHell.value, p.hell, 3, dt);
    armUniforms.uTime.value = p.time;
    armUniforms.uHeart.value += dt * (p.heart / 60) * Math.PI * 2;
    this.dashLamp.intensity = 2.2 * (0.92 + 0.08 * Math.sin(p.time * 47) * Math.sin(p.time * 13)) * (Math.random() < 0.004 ? 0.2 : 1);

    const d = this.dice;
    d.vz += (-d.az * 40 - d.vz * 1.5 + p.latAcc * 0.6 + rand(-1, 1) * p.bump * 20) * dt;
    d.vx += (-d.ax * 40 - d.vx * 1.5 - p.longAcc * 0.5 + rand(-1, 1) * p.bump * 20) * dt;
    d.az += d.vz * dt;
    d.ax += d.vx * dt;
    d.pivot.rotation.set(d.ax, 0, d.az);

    const b = this.bobble;
    b.v += (-b.a * 160 - b.v * 3 + p.latAcc * 3 + rand(-1, 1) * p.bump * 120 + beatPulse * 20) * dt;
    b.a += b.v * dt;
    b.vb += (-b.b * 160 - b.vb * 3 - p.longAcc * 2 + beatPulse * 15) * dt;
    b.b += b.vb * dt;
    b.head.rotation.set(b.b, 0, b.a);

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      f.v.y -= 9.8 * dt;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.spin.x * dt;
      f.m.rotation.y += f.spin.y * dt;
      f.m.rotation.z += f.spin.z * dt;
      if (f.target && f.t >= 0.45) {
        f.m.position.copy(f.target);
        f.m.rotation.set(Math.PI / 2, rand(0, 6), rand(-0.3, 0.3));
        this.pile.push(f.m);
        if (this.pile.length > 15) this.root.remove(this.pile.shift()!);
        this.flying.splice(i, 1);
      } else if (f.out && f.t > 1.2) {
        this.root.remove(f.m);
        this.flying.splice(i, 1);
      }
    }

    if (this.cig.visible && this.cigLit) {
      this.cigWispT -= dt;
      if (this.cigWispT <= 0) {
        this.cigWispT = 0.06;
        const wp = this.root.worldToLocal(this.ember.getWorldPosition(V3(0, 0, 0)));
        this.spawn(wp, V3(rand(-0.02, 0.02), rand(0.12, 0.2), rand(-0.02, 0.02) + 0.03), 1.4, 0.012, 0.06, 0.35, 0);
      }
    }
    for (const s of this.particles) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.multiplyScalar(1 - dt * (s.grav > 1 ? 0.3 : 0.8));
      s.v.y += dt * (0.05 - s.grav);
      s.s.position.addScaledVector(s.v, dt);
      if (s.s.position.z < -0.7) {
        s.v.z = Math.abs(s.v.z) * 0.2;
        s.v.y += 0.05;
      }
      s.s.scale.addScalar(s.grow * dt);
      const k = s.life / s.max;
      (s.s.material as THREE.SpriteMaterial).opacity = s.op * Math.min(1, k * 2) * Math.min(1, (1 - k) * 8);
      if (s.life <= 0) s.s.visible = false;
    }
    (this.headlightGlow.material as THREE.MeshBasicMaterial).opacity = 0.8 + Math.sin(p.time * 30) * 0.015;
  }

  wipeOn = false;

  drawPhone(line1: string, line2: string, lit: boolean, time: number) {
    const c = this.phoneScreen.c;
    c.fillStyle = lit ? (Math.sin(time * 12) > 0 ? '#7dff7a' : '#38c838') : '#0d2a10';
    c.fillRect(0, 0, 128, 96);
    c.fillStyle = '#062006';
    c.font = 'bold 20px monospace';
    c.textAlign = 'center';
    c.fillText(line1, 64, 38);
    c.font = '14px monospace';
    c.fillText(line2, 64, 66);
    this.phoneScreen.tex.needsUpdate = true;
  }

  smokeAmount() {
    let n = 0;
    for (const s of this.particles) if (s.life > 0 && s.grav === 0) n += s.op * (s.life / s.max) * s.s.scale.x;
    return clamp(n / 1.5, 0, 1);
  }

  drawDash(p: { mph: number; rpm: number; bac: number; time: number; hp: number; lung: number; heat: number; hell: number; bpm: number }) {
    const c = this.dash.c;
    const w = 512, h = 256;
    c.fillStyle = '#07040a';
    c.fillRect(0, 0, w, h);
    const gaugeFn = (cx: number, cy: number, rad: number, val: number, max: number, label: string, col: string, ticks: number) => {
      c.strokeStyle = '#222';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(cx, cy, rad, 0, Math.PI * 2);
      c.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      c.strokeStyle = col;
      c.lineWidth = 3;
      for (let i = 0; i <= ticks; i++) {
        const a = a0 + (a1 - a0) * (i / ticks);
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * rad * 0.82, cy + Math.sin(a) * rad * 0.82);
        c.lineTo(cx + Math.cos(a) * rad * 0.95, cy + Math.sin(a) * rad * 0.95);
        c.stroke();
      }
      const a = a0 + (a1 - a0) * clamp(val / max, 0, 1.05);
      c.strokeStyle = '#ff2a2a';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * rad * 0.85, cy + Math.sin(a) * rad * 0.85);
      c.stroke();
      c.fillStyle = col;
      c.textAlign = 'center';
      c.font = 'bold 16px monospace';
      c.fillText(label, cx, cy + rad * 0.55);
    };
    gaugeFn(105, 128, 95, p.mph, 200, 'MPH', '#5ff', 10);
    c.fillStyle = '#fff';
    c.font = 'bold 30px monospace';
    c.textAlign = 'center';
    c.fillText(String(Math.round(p.mph)), 105, 140);
    gaugeFn(407, 128, 95, p.bac, 1, 'BEER-O-METER', '#fc3', 8);
    c.fillStyle = '#fc3';
    c.font = 'bold 22px monospace';
    c.fillText((p.bac * 0.4).toFixed(2) + '%', 407, 140);
    c.fillStyle = '#0a1a10';
    c.fillRect(196, 30, 120, 196);
    c.fillStyle = '#4f8';
    c.font = 'bold 22px monospace';
    c.fillText('3:33 AM', 256, 60);
    c.font = 'bold 13px monospace';
    c.fillText(`HULL: ${Math.round(p.hp)}%`, 256, 85);
    c.fillText(`LUNGS: ${Math.round(p.lung)}%`, 256, 105);
    c.fillStyle = p.bpm > 160 ? '#f44' : '#4f8';
    c.fillText(`♥ ${Math.round(p.bpm)} BPM`, 256, 125);
    c.fillStyle = '#4f8';
    c.fillText(`RPM ${Math.round(p.rpm)}`, 256, 145);
    const blink = Math.sin(p.time * 6) > 0;
    if (blink) {
      c.fillStyle = '#fa0';
      c.fillText('CHECK ENGINE', 256, 172);
      c.fillText('(AND YOUR LIFE)', 256, 188);
    }
    if (p.bac > 0.5 && !blink) {
      c.fillStyle = '#f33';
      c.fillText('LIVER: CRITICAL', 256, 210);
    }
    if (p.heat > 0.5 && blink) {
      c.fillStyle = '#f0f';
      c.fillText('FEDS NEARBY', 256, 210);
    }
    if (p.hell > 0.5) {
      c.fillStyle = `rgba(255,${Math.floor(80 + Math.random() * 100)},0,0.35)`;
      c.fillRect(0, 0, w, h);
    }
    this.dash.tex.needsUpdate = true;
  }

  drawRadio(name: string, freq: string, text: string, time: number) {
    const c = this.radio.c;
    c.fillStyle = '#021006';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#3f8';
    c.font = 'bold 20px monospace';
    c.textAlign = 'left';
    c.fillText(`${freq} ${name}`, 6, 24);
    c.font = '16px monospace';
    const full = text + '   ★   ';
    const off = Math.floor(time * 8) % full.length;
    c.fillText((full + full).slice(off, off + 28), 6, 50);
    this.radio.tex.needsUpdate = true;
  }
}
