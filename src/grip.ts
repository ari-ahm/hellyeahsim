import * as THREE from 'three';
import { basisQ, clamp, lerp, smooth, V3 } from './util';

// How the hands live on the wheel (and the door) when they're not busy being a menace.
// Every rest pose is a target; HandRest glides between them with a lift-and-resettle arc.

export type Pose = {
  w: THREE.Vector3;
  q: THREE.Quaternion;
  curl: number[];
  thumb: number;
  spread?: number;
  tip?: THREE.Vector3;
  tipW?: number;
  /** elbow pole direction (car space, from the shoulder). undefined = the arm's default */
  pole?: THREE.Vector3;
};

export const C4 = (x: number) => [x, x, x, x];

export const clonePose = (p: Pose): Pose => ({
  ...p, w: p.w.clone(), q: p.q.clone(), curl: p.curl.slice(), tip: p.tip?.clone(), pole: p.pole?.clone(),
});

export function fwdUp(fwd: THREE.Vector3, up: THREE.Vector3) {
  const z = fwd.clone().normalize().negate();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return basisQ(x, y, z);
}

export function mixPose(a: Pose, b: Pose, f: number, out: Pose = { w: V3(0, 0, 0), q: new THREE.Quaternion(), curl: C4(0), thumb: 0 }): Pose {
  out.w = a.w.clone().lerp(b.w, f);
  out.q = a.q.clone().slerp(b.q, f);
  out.curl = a.curl.map((c, j) => lerp(c, b.curl[j], f));
  out.thumb = lerp(a.thumb, b.thumb, f);
  out.spread = lerp(a.spread ?? 0, b.spread ?? 0, f);
  out.tip = f < 0.5 ? a.tip ?? b.tip : b.tip ?? a.tip;
  out.tipW = lerp(a.tip ? a.tipW ?? 0 : 0, b.tip ? b.tipW ?? 0 : 0, f);
  out.pole = a.pole && b.pole ? a.pole.clone().lerp(b.pole, f).normalize() : f < 0.5 ? a.pole ?? b.pole : b.pole ?? a.pole;
  return out;
}

/** a wheel-ish object's frame in car space */
export function frameOf(o: THREE.Object3D, root: THREE.Object3D) {
  const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
  const p = V3(0, 0, 0), q = new THREE.Quaternion(), s = V3(0, 0, 0);
  m.decompose(p, q, s);
  return { p, q, m };
}
export type Frame = ReturnType<typeof frameOf>;

export const RIM_R = 0.19;

export interface RestOut { pose: Pose; power: number }

/** One hand's resting life: holds a style, and when it changes, lifts off and resettles. */
export class HandRest<S extends string> {
  style: S;
  age = 0;
  /** wheel-local grip angle for styles that hold the rim */
  theta = 0;
  /** resting variant on the rim: fingers extended flat instead of dangling */
  flat = false;
  /** 0..1 how much the fingers have closed into a turning fist */
  fist = 0;
  /** came over from the horn mid-turn: stay flat-palmed until the turn is over */
  noFist = false;
  private from: Pose | null = null;
  private fromPower = 0;
  private t = 1;
  private dur = 0.4;
  private lift = 0.05;
  private keepPower = false;
  last: RestOut | null = null;

  constructor(style: S) {
    this.style = style;
  }

  get moving() {
    return this.from !== null && this.t < this.dur;
  }

  /** change style with a visible move. `keepPower` = the hand never really lets go (a regrab) */
  go(style: S, dur = 0.4, lift = 0.05, keepPower = false) {
    if (this.last) {
      this.from = clonePose(this.last.pose);
      this.fromPower = this.last.power;
    }
    if (style !== this.style) this.fist = 0;
    this.style = style;
    this.t = 0;
    this.dur = dur;
    this.lift = lift;
    this.keepPower = keepPower;
    this.age = 0;
  }

  /** change style instantly (the hand is busy elsewhere, nobody's watching the rest pose) */
  snap(style: S) {
    if (style !== this.style) this.fist = 0;
    this.style = style;
    this.from = null;
    this.age = 0;
  }

  update(dt: number, target: Pose, power: number): RestOut {
    this.age += dt;
    let out: RestOut;
    if (!this.from || this.t >= this.dur) {
      this.from = null;
      out = { pose: target, power };
    } else {
      this.t += dt;
      const k = clamp(this.t / this.dur, 0, 1);
      const f = smooth(k);
      const arc = Math.sin(Math.PI * k);
      const pose = mixPose(this.from, target, f);
      // up and back toward the driver, fingers loosen mid-air
      pose.w.addScaledVector(V3(0, 0.85, 0.5), this.lift * arc);
      pose.curl = pose.curl.map((c) => Math.max(0.12, c * (1 - 0.45 * arc)));
      pose.thumb *= 1 - 0.4 * arc;
      const p = this.keepPower ? Math.max(Math.min(this.fromPower, power), 0.6) : k < 0.4 ? this.fromPower : k > 0.6 ? power : 0;
      out = { pose, power: p };
    }
    this.last = out;
    return out;
  }
}
