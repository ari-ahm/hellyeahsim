import * as THREE from 'three';
import type { ArmData } from './armgen';
import { clamp, V3 } from './util';

// The Forearm. Sculpted from math, skinned to 18 bones, pumped with uniforms.

export const armUniforms = {
  uPump: { value: 0 },
  uHell: { value: 0 },
  uTime: { value: 0 },
  uHeart: { value: 0 },
};

export function loadArmData(onProgress: (p: number, label: string) => void): Promise<ArmData> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./armgen.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress(e.data.p, e.data.label);
      else if (e.data.type === 'done') {
        resolve(e.data.data);
        w.terminate();
      }
    };
    w.onerror = reject;
    w.postMessage('go');
  });
}

function skinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    sheen: 0.5,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0.9, 0.45, 0.3),
    iridescence: 0,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, armUniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aVein; attribute float aNail;
        uniform float uPump, uTime, uHeart;
        varying float vVein; varying float vNail; varying vec3 vObj;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vVein = aVein; vNail = aNail; vObj = position;
        float throb = 0.5 + 0.5 * sin(uHeart);
        transformed += objectNormal * aVein * (uPump * 0.0019 + throb * 0.00035 * (0.4 + uPump));`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uHell, uTime, uPump;
        varying float vVein; varying float vNail; varying vec3 vObj;
        float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 1.0 + uPump * 0.25, vVein) * vec3(1.0 + uPump*0.08, 1.0, 1.0);
        float pore = hh(floor(vObj * 2600.0));
        diffuseColor.rgb *= 0.965 + pore * 0.07;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.18, vNail);
        roughnessFactor = mix(roughnessFactor, 0.35, vVein * 0.5);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float lava = vVein * uHell * (0.65 + 0.35 * sin(uTime * 7.0 + vObj.z * 120.0));
        totalEmissiveRadiance += vec3(3.2, 0.7, 0.05) * lava;`,
      );
  };
  return m;
}

function geometry(d: ArmData, mirror: boolean) {
  const g = new THREE.BufferGeometry();
  let pos = d.positions, nor = d.normals, idx = d.index;
  if (mirror) {
    pos = pos.slice();
    nor = nor.slice();
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = -pos[i];
      nor[i] = -nor[i];
    }
    idx = idx.slice();
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setAttribute('aVein', new THREE.BufferAttribute(d.vein, 1));
  g.setAttribute('aNail', new THREE.BufferAttribute(d.nail, 1));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(d.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(d.skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);
const basis = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) =>
  new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

export class Arm {
  root = new THREE.Group();
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[] = [];
  side: number;
  a: number;
  b: number;
  pole: THREE.Vector3;
  /** hand-local anchors (children of the hand bone) */
  canAnchor = new THREE.Group();
  cigAnchor = new THREE.Group();
  tipAnchor = new THREE.Group();
  /** the actual index fingertip (follows the curl) */
  indexTip = new THREE.Object3D();
  curl = [1, 1, 1, 1];
  spread = 0;
  thumb = 0.6;
  private qUpper = new THREE.Quaternion();
  private qFore = new THREE.Quaternion();

  constructor(data: ArmData, side: number, shoulder: THREE.Vector3, parent: THREE.Object3D) {
    this.side = side;
    const m = side < 0;
    const J = data.joints.map(([x, y, z]) => V3(m ? -x : x, y, z));
    data.parents.forEach((p, i) => {
      const b = new THREE.Bone();
      b.position.copy(p < 0 ? J[i] : J[i].clone().sub(J[p]));
      if (p >= 0) this.bones[p].add(b);
      this.bones.push(b);
    });
    this.a = J[0].distanceTo(J[1]);
    this.b = J[1].distanceTo(J[2]);
    this.mesh = new THREE.SkinnedMesh(geometry(data, m), skinMaterial());
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.root.add(this.mesh);
    this.root.position.copy(shoulder);
    parent.add(this.root);
    this.pole = V3(side, -1.0, 0.35).normalize();

    const hb = this.bones[2];
    // can sits under the palm, axis along the thumb direction
    this.canAnchor.position.set(0, -0.047, -0.07);
    this.cigAnchor.position.set(-side * 0.02, 0.0, -0.113);
    this.tipAnchor.position.set(-side * 0.035, -0.02, -0.17);
    hb.add(this.canAnchor, this.cigAnchor, this.tipAnchor);
    this.indexTip.position.set(0, -0.004, -0.032);
    this.bones[5].add(this.indexTip);
  }

  get hand() {
    return this.bones[2];
  }

  /** where the elbow lands (relative to the shoulder) for a wrist target and pole direction */
  private elbowLocal(wrist: THREE.Vector3, pole: THREE.Vector3) {
    const T = wrist.clone().sub(this.root.position);
    let d = T.length();
    const dir = T.normalize();
    d = clamp(d, Math.abs(this.a - this.b) + 0.03, this.a + this.b - 0.004);
    const x = (this.a * this.a - this.b * this.b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.a * this.a - x * x));
    const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return { E: dir.clone().multiplyScalar(x).addScaledVector(p, h), W: dir.multiplyScalar(d) };
  }

  /** elbow position in parent (car) space */
  elbowAt(wrist: THREE.Vector3, pole = this.pole) {
    return this.elbowLocal(wrist, pole).E.add(this.root.position);
  }

  /** wrist position + hand orientation in parent (car) space */
  solve(wrist: THREE.Vector3, hq: THREE.Quaternion) {
    const { E, W } = this.elbowLocal(wrist, this.pole);
    const dSE = E.clone().normalize();
    const dEW = W.clone().sub(E).normalize();
    let n = new THREE.Vector3().crossVectors(dSE, dEW);
    if (n.lengthSq() < 1e-6) n = this.pole.clone().cross(dSE);
    n.normalize();
    {
      const z = dSE.clone().negate();
      const y = new THREE.Vector3().crossVectors(z, n).normalize();
      const xx = new THREE.Vector3().crossVectors(y, z);
      this.qUpper.copy(basis(xx, y, z));
    }
    {
      const z = dEW.clone().negate();
      const hingeY = new THREE.Vector3().crossVectors(z, n).normalize();
      const hingeQ = basis(new THREE.Vector3().crossVectors(hingeY, z), hingeY, z);
      const yRef = Y.clone().applyQuaternion(hq);
      const xx = new THREE.Vector3().crossVectors(yRef, z);
      if (xx.lengthSq() > 1e-6) {
        xx.normalize();
        const y = new THREE.Vector3().crossVectors(z, xx);
        this.qFore.copy(hingeQ).slerp(basis(xx, y, z), 0.65);
      } else this.qFore.copy(hingeQ);
    }
    const [b0, b1, b2] = this.bones;
    b0.quaternion.copy(this.qUpper);
    b1.quaternion.copy(this.qUpper).invert().multiply(this.qFore);
    b2.quaternion.copy(this.qFore).invert().multiply(hq);

    // fingers: curl around local X (negative = toward the palm)
    for (let f = 0; f < 4; f++) {
      const c = this.curl[f];
      const spread = (f - 1.2) * 0.07 * this.spread * this.side;
      this.bones[3 + f * 3].rotation.set(-c * 0.95, -spread, 0);
      this.bones[4 + f * 3].rotation.set(-c * 1.2, 0, 0);
      this.bones[5 + f * 3].rotation.set(-c * 0.8, 0, 0);
    }
    const t = this.thumb;
    this.bones[15].rotation.set(-t * 0.3, -this.side * t * 0.45, -this.side * t * 0.5);
    this.bones[16].rotation.set(-t * 0.55, 0, 0);
    this.bones[17].rotation.set(-t * 0.7, 0, 0);
    void X;
    void Z;
  }
}
