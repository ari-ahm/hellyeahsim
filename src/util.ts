import * as THREE from 'three';

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function toon(color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...extra });
}
export function pbr(color: THREE.ColorRepresentation, roughness: number, metalness = 0, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra });
}

/** Bright unlit material that blooms. */
export function glow(r: number, g: number, b: number) {
  const m = new THREE.MeshBasicMaterial();
  m.color.setRGB(r, g, b);
  return m;
}

/** Outlines were a toon-era thing. The forearm has evolved past them. */
export function outline(_mesh: THREE.Mesh, _t = 0.005) {}

export function basisQ(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
export const rotX = (a: number) => new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), a);
export const rotY = (a: number) => new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), a);
export const rotZ = (a: number) => new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), a);
export const qmul = (a: THREE.Quaternion, b: THREE.Quaternion) => new THREE.Quaternion().multiplyQuaternions(a, b);

/** Box stretched between two points. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
