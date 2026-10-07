import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as Art from './art';
import { toon, glow, rand, pick, V3, beam } from './util';
import { roadCenter, roadSlope, toWorld } from './world';

export interface Vehicle {
  obj: THREE.Group;
  s: number;
  lane: number;
  v: number;
  oncoming: boolean;
  passed: boolean;
  kind: string;
  len: number;
}
export interface Deer {
  obj: THREE.Group;
  s: number;
  lat: number;
  dir: number;
  legs: THREE.Object3D[];
  t: number;
}
interface Flyer {
  obj: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  life: number;
}

const COLORS = [0x2d7dff, 0xffd400, 0x28c76f, 0xff6a00, 0xe6e6e6, 0x8e44ff, 0x111111, 0x00d1c1, 0xff3e8a];

const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
wheelGeo.rotateZ(Math.PI / 2);
const tire = toon(0x0c0a0e);
const glass = toon(0x1a2440, { emissive: 0x05070f });
const tail = glow(4, 0.1, 0.15);
const head = glow(4, 3.6, 2.6);

const truckTexes = [
  () => Art.truckTex('TOTALLY LEGAL GOAT TRANSPORT', "don't look inside", '#2b2b2b'),
  () => Art.truckTex("MR. FROSTY'S EXISTENTIAL DREAD", 'now in 31 flavors of despair', '#ff6fb5'),
  () => Art.truckTex('BIG JIM’S DEER REMOVAL', 'business is booming', '#1d5c2e'),
  () => Art.truckTex('AMAZON PRIMAL', 'delivered by a guy named Steve', '#16213e'),
];
let truckCache: THREE.Texture[] | null = null;

function makeCar(kind: string) {
  const g = new THREE.Group();
  const col = kind === 'cop' ? 0x0d0d14 : pick(COLORS);
  const paint = toon(col);
  let len = 4.4;
  if (kind === 'truck') {
    truckCache ??= truckTexes.map((f) => f());
    len = 11;
    const cab = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.4, 2.4, 2, 0.2), paint);
    cab.position.set(0, 1.6, -4.1);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.1), glass);
    win.position.set(0, 2.2, -5.3);
    const sideMat = toon(0xffffff, { map: pick(truckCache) });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 8), [sideMat, sideMat, paint, paint, toon(0xdddddd), toon(0xdddddd)]);
    box.position.set(0, 2.2, 1.3);
    g.add(cab, win, box);
    for (const z of [-4, 0, 3.5]) for (const x of [-1.15, 1.15]) {
      const w = new THREE.Mesh(wheelGeo, tire);
      w.scale.setScalar(1.3);
      w.position.set(x, 0.47, z);
      g.add(w);
    }
    for (const x of [-1.1, 1.1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), tail);
      t.position.set(x, 1, 5.32);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), head);
      h.position.set(x * 0.85, 1.0, -5.32);
      g.add(t, h);
    }
  } else {
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.75, 4.4, 2, 0.18), paint);
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.62, 0.62, 2.2, 2, 0.16), kind === 'cop' ? toon(0xf2f2f2) : glass);
    cabin.position.set(0, 1.24, 0.25);
    g.add(body, cabin);
    if (kind === 'cop') {
      const doors = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.4, 1.8), toon(0xf2f2f2));
      doors.position.set(0, 0.62, 0.1);
      g.add(doors);
      const red = glow(6, 0.1, 0.1), blue = glow(0.1, 0.4, 6);
      const lr = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), red);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), blue);
      lr.position.set(-0.35, 1.62, 0.25);
      lb.position.set(0.35, 1.62, 0.25);
      lr.name = 'red';
      lb.name = 'blue';
      g.add(lr, lb);
    }
    for (const z of [-1.4, 1.4]) for (const x of [-0.92, 0.92]) {
      const w = new THREE.Mesh(wheelGeo, tire);
      w.position.set(x, 0.36, z);
      g.add(w);
    }
    for (const x of [-0.65, 0.65]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tail);
      t.position.set(x, 0.75, 2.21);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), head);
      h.position.set(x, 0.7, -2.21);
      g.add(t, h);
    }
    if (kind === 'van') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 10), toon(0xe0a050));
      cone.rotation.x = Math.PI;
      cone.position.set(0, 2.1, 0.2);
      const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), toon(0xff9ad5));
      scoop.position.set(0, 2.7, 0.2);
      g.add(cone, scoop);
    }
  }
  return { g, len };
}

function makeDeer() {
  const g = new THREE.Group();
  const fur = toon(0x8a5528);
  const light = toon(0xe8d2a8);
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.6, 1.3, 2, 0.2), fur);
  body.position.y = 1.15;
  const neck = beam(V3(0, 1.3, -0.5), V3(0, 1.85, -0.75), 0.25, 0.25, fur);
  const headM = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.5, 2, 0.1), fur);
  headM.position.set(0, 1.95, -0.92);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0x111111));
  nose.position.set(0, 1.92, -1.18);
  const tailM = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), light);
  tailM.position.set(0, 1.35, 0.68);
  g.add(body, neck, headM, nose, tailM);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(6, 6, 1.2));
    eye.position.set(s * 0.13, 2.02, -1.03);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), fur);
    ear.position.set(s * 0.18, 2.12, -0.82);
    ear.rotation.z = -s * 0.9;
    g.add(eye, ear);
    const a0 = V3(s * 0.08, 2.1, -0.85);
    const a1 = V3(s * 0.35, 2.6, -0.8);
    g.add(beam(a0, a1, 0.04, 0.04, light));
    g.add(beam(a1, V3(s * 0.55, 2.8, -0.95), 0.035, 0.035, light));
    g.add(beam(V3(s * 0.22, 2.35, -0.83), V3(s * 0.15, 2.65, -1.0), 0.03, 0.03, light));
  }
  const legs: THREE.Object3D[] = [];
  for (const z of [-0.45, 0.45]) for (const x of [-0.18, 0.18]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.95, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), fur);
    leg.position.y = -0.47;
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  }
  return { g, legs };
}

export class Traffic {
  vehicles: Vehicle[] = [];
  deer: Deer[] = [];
  flyers: Flyer[] = [];
  cop: THREE.Group;
  copLights: THREE.Mesh[] = [];
  copOn = false;
  scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.cop = makeCar('cop').g;
    this.cop.visible = false;
    this.copLights = this.cop.children.filter((c) => c.name === 'red' || c.name === 'blue') as THREE.Mesh[];
    scene.add(this.cop);
  }

  reset() {
    for (const v of this.vehicles) this.scene.remove(v.obj);
    for (const d of this.deer) this.scene.remove(d.obj);
    for (const f of this.flyers) this.scene.remove(f.obj);
    this.vehicles = [];
    this.deer = [];
    this.flyers = [];
    this.cop.visible = false;
  }

  spawn(playerS: number, density: number) {
    if (this.vehicles.length < 10 * density && Math.random() < 0.04 * density) {
      const oncoming = Math.random() < 0.45;
      const r = Math.random();
      const kind = r < 0.15 ? 'truck' : r < 0.25 ? 'van' : 'sedan';
      const { g, len } = makeCar(kind);
      const lane = oncoming ? pick([-6, -2]) : pick([2, 6]);
      const v = oncoming ? rand(20, 30) : kind === 'truck' ? rand(16, 22) : rand(20, 30);
      const s = playerS + rand(260, 520);
      if (this.vehicles.some((o) => o.lane === lane && Math.abs(o.s - s) < 25)) return;
      this.scene.add(g);
      this.vehicles.push({ obj: g, s, lane, v, oncoming, passed: false, kind, len });
    }
    if (this.deer.length < 2 && Math.random() < 0.006 * density) {
      const { g, legs } = makeDeer();
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.scene.add(g);
      this.deer.push({ obj: g, s: playerS + rand(120, 220), lat: -dir * 13, dir, legs, t: 0 });
    }
  }

  launch(obj: THREE.Object3D, from: THREE.Vector3, force: number) {
    const v = obj.position.clone().sub(from).setY(0).normalize().multiplyScalar(force * 0.4);
    v.y = force * 0.5 + 6;
    this.flyers.push({ obj, v, w: V3(rand(-4, 4), rand(-6, 6), rand(-4, 4)), life: 5 });
  }

  update(dt: number, playerS: number, time: number) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const c = this.vehicles[i];
      c.s += (c.oncoming ? -c.v : c.v) * dt;
      c.obj.position.copy(toWorld(c.s, c.lane));
      c.obj.rotation.y = -Math.atan(roadSlope(c.s)) + (c.oncoming ? Math.PI : 0);
      if (c.s < playerS - 60 || c.s > playerS + 700) {
        this.scene.remove(c.obj);
        this.vehicles.splice(i, 1);
      }
    }
    for (let i = this.deer.length - 1; i >= 0; i--) {
      const d = this.deer[i];
      d.t += dt;
      const walking = Math.abs(d.lat) > 3 || Math.sin(d.t * 0.7) > -0.3; // they freeze in headlights sometimes
      if (walking) d.lat += d.dir * 3.2 * dt;
      d.obj.position.copy(toWorld(d.s, d.lat));
      d.obj.rotation.y = d.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      d.legs.forEach((l, k) => (l.rotation.x = walking ? Math.sin(d.t * 9 + k * 1.6) * 0.5 : 0));
      if (Math.abs(d.lat) > 15 || d.s < playerS - 30) {
        this.scene.remove(d.obj);
        this.deer.splice(i, 1);
      }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.life -= dt;
      f.v.y -= 14 * dt;
      f.obj.position.addScaledVector(f.v, dt);
      if (f.obj.position.y < 0) {
        f.obj.position.y = 0;
        f.v.y *= -0.35;
        f.v.x *= 0.7;
        f.v.z *= 0.7;
        f.w.multiplyScalar(0.7);
      }
      f.obj.rotation.x += f.w.x * dt;
      f.obj.rotation.y += f.w.y * dt;
      f.obj.rotation.z += f.w.z * dt;
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        this.flyers.splice(i, 1);
      }
    }
    const flash = Math.floor(time * 8) % 2 === 0;
    this.copLights.forEach((m) => {
      const on = (m.name === 'red') === flash;
      m.scale.setScalar(on ? 1.15 : 0.6);
      (m.material as THREE.MeshBasicMaterial).color.multiplyScalar(1);
      m.visible = on || Math.random() < 0.2;
    });
  }

  placeCop(s: number, lat: number) {
    this.cop.visible = true;
    this.cop.position.copy(toWorld(s, lat));
    this.cop.rotation.y = -Math.atan(roadSlope(s));
  }

  centerAt(s: number) {
    return roadCenter(s);
  }
}
