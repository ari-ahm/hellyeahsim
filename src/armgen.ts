// Sculpts a medically concerning forearm out of signed distance fields, adds a procedurally
// grown vein network, meshes it with Surface Nets and skins it to an 18-bone rig.
// Runs in a worker. Pure math, no three.js.

export type Vec = [number, number, number];

export interface ArmData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  vein: Float32Array;
  nail: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
  joints: Vec[];
  parents: number[];
}

// ---------------------------------------------------------------- rng
let seed = 1337;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rr = (a: number, b: number) => a + rnd() * (b - a);

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const norm = (x: number, y: number, z: number): Vec => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

// ---------------------------------------------------------------- rig (right arm, shoulder at origin, pointing -Z, palm down)
export function rig() {
  const S: Vec = [0, 0, 0], E: Vec = [0, 0, -0.33], W: Vec = [0, 0, -0.64];
  const MCP: Vec[] = [[-0.0355, 0.0, -0.736], [-0.0118, 0.002, -0.742], [0.0122, 0.001, -0.738], [0.0345, -0.002, -0.727]];
  const FL = [[0.046, 0.027, 0.023], [0.05, 0.031, 0.025], [0.047, 0.029, 0.024], [0.037, 0.023, 0.021]];
  const FR = [[0.0108, 0.0087], [0.011, 0.0089], [0.0105, 0.0085], [0.0092, 0.0076]];
  const FD: Vec[] = [norm(-0.15, 0, -1), norm(-0.03, 0, -1), norm(0.09, 0, -1), norm(0.2, 0, -1)];
  const fj: Vec[][] = MCP.map((m, f) => {
    const j1 = add(m, mul(FD[f], FL[f][0]));
    const j2 = add(j1, mul(FD[f], FL[f][1]));
    const tip = add(j2, mul(FD[f], FL[f][2]));
    return [m, j1, j2, tip];
  });
  const CMC: Vec = [-0.025, -0.015, -0.655];
  const d0 = norm(-0.7, -0.3, -0.65);
  const d1 = norm(-0.42, -0.24, -0.88);
  const TM = add(CMC, mul(d0, 0.05));
  const TI = add(TM, mul(d1, 0.034));
  const TT = add(TI, mul(d1, 0.03));
  const joints: Vec[] = [S, E, W];
  const parents = [-1, 0, 1];
  for (let f = 0; f < 4; f++) {
    for (let j = 0; j < 3; j++) {
      joints.push(fj[f][j]);
      parents.push(j === 0 ? 2 : joints.length - 2);
    }
  }
  joints.push(CMC, TM, TI);
  parents.push(2, 15, 16);
  // bone segments used for skin weights
  const segs: [number, Vec, Vec][] = [[0, S, E], [1, E, W]];
  for (const m of MCP) segs.push([2, W, m]);
  segs.push([2, W, CMC]);
  fj.forEach((f, i) => {
    for (let j = 0; j < 3; j++) segs.push([3 + i * 3 + j, f[j], f[j + 1]]);
  });
  segs.push([15, CMC, TM], [16, TM, TI], [17, TI, TT]);
  return { S, E, W, MCP, FL, FR, FD, fj, CMC, TM, TI, TT, joints, parents, segs };
}

// ---------------------------------------------------------------- primitives
const CONE = 0, ELL = 1, BOX = 2;
interface Prim {
  kind: number;
  g: number; // group: 0 arm/palm, 1-4 fingers, 5 thumb
  k: number;
  ax: number; ay: number; az: number; bx: number; by: number; bz: number; il2: number; r1: number; r2: number;
  cx: number; cy: number; cz: number; sx: number; sy: number; sz: number; round: number;
  min: Vec; max: Vec;
}
function cone(a: Vec, b: Vec, r1: number, r2: number, k: number, g = 0): Prim {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const r = Math.max(r1, r2);
  return {
    kind: CONE, g, k, ax: a[0], ay: a[1], az: a[2], bx, by, bz, il2: 1 / (bx * bx + by * by + bz * bz || 1e-9), r1, r2,
    cx: 0, cy: 0, cz: 0, sx: 0, sy: 0, sz: 0, round: 0,
    min: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
    max: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
  };
}
function ell(c: Vec, s: Vec, k: number, g = 0): Prim {
  return {
    kind: ELL, g, k, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, il2: 0, r1: 0, r2: 0,
    cx: c[0], cy: c[1], cz: c[2], sx: s[0], sy: s[1], sz: s[2], round: 0,
    min: [c[0] - s[0], c[1] - s[1], c[2] - s[2]], max: [c[0] + s[0], c[1] + s[1], c[2] + s[2]],
  };
}
function box(c: Vec, h: Vec, round: number, k: number, g = 0): Prim {
  const p = ell(c, [h[0] + round, h[1] + round, h[2] + round], k, g);
  p.kind = BOX;
  p.sx = h[0];
  p.sy = h[1];
  p.sz = h[2];
  p.round = round;
  return p;
}
function evalPrim(p: Prim, x: number, y: number, z: number) {
  if (p.kind === CONE) {
    const px = x - p.ax, py = y - p.ay, pz = z - p.az;
    let h = (px * p.bx + py * p.by + pz * p.bz) * p.il2;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = px - p.bx * h, dy = py - p.by * h, dz = pz - p.bz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.r1 + (p.r2 - p.r1) * h);
  }
  const lx = x - p.cx, ly = y - p.cy, lz = z - p.cz;
  if (p.kind === ELL) {
    const ux = lx / p.sx, uy = ly / p.sy, uz = lz / p.sz;
    const k0 = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const vx = ux / p.sx, vy = uy / p.sy, vz = uz / p.sz;
    const k1 = Math.sqrt(vx * vx + vy * vy + vz * vz);
    return k1 < 1e-9 ? -Math.min(p.sx, p.sy, p.sz) : (k0 * (k0 - 1)) / k1;
  }
  const qx = Math.abs(lx) - p.sx, qy = Math.abs(ly) - p.sy, qz = Math.abs(lz) - p.sz;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.round;
}
const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const JOIN_K = [0, 0.0045, 0.0045, 0.0045, 0.0045, 0.011];
const VEIN_K = 0.005;
const NG = 6;

// ---------------------------------------------------------------- build
export function buildArm(progress: (p: number, label: string) => void = () => {}): ArmData {
  seed = 1337;
  const R = rig();
  const { S, E, W, MCP, FR, fj, CMC, TM, TI, TT } = R;
  const prims: Prim[] = [];
  const nails: Prim[] = [];
  const P = (p: Prim) => (prims.push(p), p);

  // upper arm: the part that lifts the beers. +Y is the inside of the elbow bend (biceps), -Y the triceps.
  // separate heads with small blend radii so the grooves between them survive.
  P(cone([0, 0, 0.02], [0, 0, -0.33], 0.1, 0.07, 0.02));
  P(ell([0, 0.01, 0.0], [0.125, 0.12, 0.115], 0.03)); // deltoid
  P(ell([0.04, 0.035, -0.07], [0.085, 0.08, 0.09], 0.02)); // front delt insertion
  P(ell([0.004, 0.07, -0.19], [0.088, 0.08, 0.13], 0.016)); // biceps
  P(ell([0.0, 0.098, -0.205], [0.064, 0.05, 0.075], 0.014)); // the peak
  P(ell([0.07, 0.025, -0.25], [0.045, 0.05, 0.08], 0.014)); // brachialis
  P(ell([0.02, -0.07, -0.13], [0.085, 0.075, 0.14], 0.016)); // triceps, long head
  P(ell([0.07, -0.04, -0.1], [0.06, 0.065, 0.1], 0.014)); // triceps, lateral head (horseshoe)
  P(ell([-0.05, -0.045, -0.2], [0.05, 0.055, 0.09], 0.014)); // triceps, medial head
  // elbow
  P(ell([0, -0.01, -0.33], [0.085, 0.075, 0.07], 0.02));
  P(ell([0, -0.072, -0.338], [0.032, 0.03, 0.034], 0.014));
  // forearm (pronated): extensors on top, flexors below, brachioradialis on the thumb side.
  // the meme forearm: a cartoon taper from a slab of muscle at the elbow down to a sane wrist.
  P(cone([0, 0, -0.34], [0, 0, -0.622], 0.078, 0.036, 0.02));
  P(cone([-0.058, 0.046, -0.35], [-0.034, 0.014, -0.555], 0.064, 0.016, 0.018)); // brachioradialis
  P(cone([-0.03, 0.068, -0.37], [-0.014, 0.03, -0.5], 0.05, 0.016, 0.016)); // ext. carpi radialis
  P(cone([0.018, 0.07, -0.37], [0.006, 0.026, -0.575], 0.054, 0.015, 0.016)); // extensor digitorum
  P(cone([0.008, -0.065, -0.35], [0.0, -0.02, -0.58], 0.068, 0.017, 0.018)); // flexors
  P(cone([0.07, -0.01, -0.37], [0.034, -0.006, -0.595], 0.05, 0.016, 0.016)); // ulnar side
  P(ell([0, 0, -0.632], [0.048, 0.029, 0.033], 0.018));
  P(ell([0.041, 0.011, -0.627], [0.013, 0.013, 0.013], 0.009));
  // palm: meaty
  P(box([0, -0.002, -0.69], [0.04, 0.0125, 0.043], 0.012, 0.013));
  P(ell([-0.032, -0.016, -0.668], [0.026, 0.019, 0.036], 0.013));
  P(ell([0.035, -0.013, -0.688], [0.016, 0.016, 0.036], 0.011));
  for (const m of MCP) {
    P(cone([m[0] * 0.55, 0.011, -0.648], [m[0], 0.0105, m[2] + 0.006], 0.0052, 0.0058, 0.01)); // extensor tendons
  }
  // fingers
  fj.forEach((f, i) => {
    const g = i + 1;
    const [r0, r3] = FR[i];
    const rAt = (j: number) => r0 + ((r3 - r0) * j) / 3;
    P(ell(add(f[0], [0, 0.004, 0]), [rAt(0) * 1.15, rAt(0) * 1.05, rAt(0) * 1.1], 0.004, g));
    for (let j = 0; j < 3; j++) {
      P(cone(f[j], f[j + 1], rAt(j), rAt(j + 1), 0.005, g));
      if (j > 0) P(ell(add(f[j], [0, 0.0015, 0]), [rAt(j) * 1.08, rAt(j) * 1.03, rAt(j) * 1.05], 0.004, g));
    }
    // fingertip pad
    P(ell(add(f[3], [0, -0.002, 0.004]), [r3 * 0.95, r3 * 0.85, r3 * 1.15], 0.004, g));
    // nail
    const dir = norm(f[3][0] - f[2][0], f[3][1] - f[2][1], f[3][2] - f[2][2]);
    const c = add(add(f[2], mul(dir, 0.62 * Math.hypot(f[3][0] - f[2][0], f[3][1] - f[2][1], f[3][2] - f[2][2]))), [0, r3 * 0.78, 0]);
    const n = ell(c, [r3 * 0.72, r3 * 0.2, 0.0085], 0.0016, g);
    nails.push(n);
    P(n);
  });
  // thumb
  P(cone(CMC, TM, 0.02, 0.0145, 0.014, 5));
  P(ell(TM, [0.015, 0.0145, 0.015], 0.004, 5));
  P(cone(TM, TI, 0.0145, 0.0128, 0.005, 5));
  P(cone(TI, TT, 0.0128, 0.0104, 0.005, 5));
  P(ell(add(TT, [0, -0.002, 0.004]), [0.0112, 0.01, 0.013], 0.004, 5));
  {
    const dir = norm(TT[0] - TI[0], TT[1] - TI[1], TT[2] - TI[2]);
    const up = norm(0.25, 1, 0);
    const c = add(add(TI, mul(dir, 0.02)), mul(up, 0.0092));
    const n = ell(c, [0.0082, 0.0025, 0.01], 0.0016, 5);
    nails.push(n);
    P(n);
  }

  // ---- bins
  const BS = 0.01;
  const gmin: Vec = [1e9, 1e9, 1e9], gmax: Vec = [-1e9, -1e9, -1e9];
  for (const p of prims) for (let a = 0; a < 3; a++) {
    gmin[a] = Math.min(gmin[a], p.min[a] - 0.012);
    gmax[a] = Math.max(gmax[a], p.max[a] + 0.012);
  }
  const bn = [0, 1, 2].map((a) => Math.ceil((gmax[a] - gmin[a]) / BS));
  const binsBase: number[][] = Array.from({ length: bn[0] * bn[1] * bn[2] }, () => []);
  const binsVein: number[][] = Array.from({ length: bn[0] * bn[1] * bn[2] }, () => []);
  const insert = (bins: number[][], i: number, mn: Vec, mx: Vec, pad: number) => {
    const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor((mn[a] - pad - gmin[a]) / BS)));
    const hi = [0, 1, 2].map((a) => Math.min(bn[a] - 1, Math.floor((mx[a] + pad - gmin[a]) / BS)));
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++)
      bins[x + bn[0] * (y + bn[1] * z)].push(i);
  };
  prims.forEach((p, i) => insert(binsBase, i, p.min, p.max, p.k + 0.012));
  const binOf = (x: number, y: number, z: number) => {
    const bx = Math.floor((x - gmin[0]) / BS), by = Math.floor((y - gmin[1]) / BS), bz = Math.floor((z - gmin[2]) / BS);
    if (bx < 0 || by < 0 || bz < 0 || bx >= bn[0] || by >= bn[1] || bz >= bn[2]) return -1;
    return bx + bn[0] * (by + bn[1] * bz);
  };

  const G = new Float64Array(NG);
  const veins: Prim[] = [];
  /** base distance (no veins). fills G with per-group distances */
  const evalBase = (x: number, y: number, z: number) => {
    G.fill(1e9);
    const b = binOf(x, y, z);
    if (b < 0) return 0.05;
    const list = binsBase[b];
    if (!list.length) return 0.05;
    for (let i = 0; i < list.length; i++) {
      const p = prims[list[i]];
      G[p.g] = smin(G[p.g], evalPrim(p, x, y, z), p.k);
    }
    // each finger melts into the palm, but never into its neighbours (no webbed mitten hands)
    let d = G[0];
    for (let g = 1; g < NG; g++) if (G[g] < 1e8) d = Math.min(d, smin(G[0], G[g], JOIN_K[g]));
    return d > 0.05 ? 0.05 : d;
  };
  const evalFull = (x: number, y: number, z: number) => {
    let d = evalBase(x, y, z);
    const b = binOf(x, y, z);
    if (b < 0) return d;
    const list = binsVein[b];
    let dv = 1e9;
    for (let i = 0; i < list.length; i++) {
      const v = evalPrim(veins[list[i]], x, y, z);
      if (v < dv) dv = v;
    }
    if (dv < 1e8) d = smin(d, dv, VEIN_K);
    return d;
  };
  const grad = (f: (x: number, y: number, z: number) => number, x: number, y: number, z: number, e = 0.0008): Vec =>
    norm(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e));

  // ---- veins
  progress(0.02, 'growing veins');
  const surf = (o: Vec, d: Vec): Vec | null => {
    let prev = 0;
    for (let r = 0.004; r < 0.26; r += 0.003) {
      if (evalBase(o[0] + d[0] * r, o[1] + d[1] * r, o[2] + d[2] * r) > 0) {
        let lo = prev, hi = r;
        for (let i = 0; i < 12; i++) {
          const m = (lo + hi) / 2;
          if (evalBase(o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m) > 0) hi = m;
          else lo = m;
        }
        return [o[0] + d[0] * hi, o[1] + d[1] * hi, o[2] + d[2] * hi];
      }
      prev = r;
    }
    return null;
  };
  const addSeg = (a: Vec, b: Vec, r1: number, r2: number) => {
    const p = cone(a, b, r1, r2, 0);
    veins.push(p);
  };
  const place = (p: Vec, r: number): Vec => {
    const n = grad(evalBase, p[0], p[1], p[2]);
    return add(p, mul(n, -r * 0.12));
  };
  /**
   * random walk over the skin, marching along the arm axis (the rest-pose arm is a straight line down -Z,
   * so "around the axis" is just an angle). phi 0 = +Y. walks freely from the wrist over the elbow to the shoulder.
   */
  const Z_END = 0.03;
  const walk = (z: number, phi: number, r: number, life: number, dir: number, depth: number, phiLo: number, phiHi: number) => {
    let prev: Vec | null = null, prevR = r, dphi = 0;
    for (let s = 0; s < life; s++) {
      const hit = surf([0, 0, z], [Math.sin(phi), Math.cos(phi), 0]);
      if (!hit) break;
      const p = place(hit, r);
      if (prev) addSeg(prev, p, prevR, r);
      prev = p;
      prevR = r;
      z += dir * rr(0.0026, 0.0042);
      dphi += rr(-0.04, 0.04);
      dphi *= 0.9;
      phi += dphi;
      if (phi < phiLo || phi > phiHi) dphi -= (phi - (phiLo + phiHi) / 2) * 0.02;
      r = Math.max(0.002, r * rr(0.994, 1.004));
      if (z < -0.63 || z > Z_END) break;
      if (depth < 2 && rnd() < 0.022) walk(z, phi, r * 0.72, Math.floor(life * rr(0.15, 0.4)), dir, depth + 1, phiLo - 0.6, phiHi + 0.6);
      if (rnd() < 0.006) {
        // perforator: short squiggle diving sideways
        walk(z, phi + (rnd() < 0.5 ? -1 : 1) * 0.15, r * 0.6, 6, dir, 3, -9, 9);
      }
    }
    return prev;
  };
  // forearm: absolutely shredded. some of these die out around the elbow, the rest keep climbing.
  for (let i = 0; i < 8; i++) {
    const phi = -2.4 + (i / 7) * 4.3 + rr(-0.15, 0.15);
    const life = rnd() < 0.35 ? rr(130, 190) : rr(55, 100);
    walk(rr(-0.625, -0.6), phi, rr(0.0058, 0.0074), Math.floor(life), 1, 0, phi - 0.8, phi + 0.8);
  }
  // the trunk lines, wrist to shoulder without stopping: cephalic up the thumb side, basilic up the pinky side,
  // and the median that climbs the top and spills over the elbow crease onto the biceps
  walk(-0.62, -1.55, 0.0082, 200, 1, 0, -2.1, -1.0);
  walk(-0.62, 1.95, 0.0076, 200, 1, 0, 1.4, 2.5);
  walk(-0.6, -0.35, 0.0078, 200, 1, 0, -0.9, 0.4);
  {
    // median cubital: the diagonal across the inside of the elbow
    let prev: Vec | null = null;
    for (let k = 0; k <= 34; k++) {
      const f = k / 34;
      const hit = surf([0, 0, -0.39 + f * 0.1], [Math.sin(-1.5 + f * 3.2), Math.cos(-1.5 + f * 3.2), 0]);
      if (!hit) continue;
      const p = place(hit, 0.0072);
      if (prev) addSeg(prev, p, 0.0072, 0.0072);
      prev = p;
    }
  }
  // upper arm: a vascular roadmap over the biceps, delts and triceps
  for (let i = 0; i < 6; i++) {
    const phi = -3.0 + (i / 6) * 6.0 + rr(-0.2, 0.2);
    walk(rr(-0.37, -0.3), phi, rr(0.0062, 0.0078), Math.floor(rr(55, 110)), 1, 0, phi - 0.7, phi + 0.7);
  }
  walk(-0.33, 0.05, 0.0088, 120, 1, 0, -0.3, 0.4); // the one that splits the biceps in half
  // back of hand: from between the knuckles to the wrist, then up the forearm
  const gaps = [MCP[0][0] - 0.008, (MCP[0][0] + MCP[1][0]) / 2, (MCP[1][0] + MCP[2][0]) / 2, (MCP[2][0] + MCP[3][0]) / 2, MCP[3][0] + 0.006];
  for (const gx of gaps) {
    let x = gx, z = -0.722;
    let prev: Vec | null = null;
    let r = rr(0.0026, 0.0034);
    while (z < -0.64) {
      const hit = surf([x, -0.004, z], [0, 1, 0]);
      if (hit) {
        const p = place(hit, r);
        if (prev) addSeg(prev, p, r, r * 1.01);
        prev = p;
      }
      z += rr(0.0035, 0.005);
      x += rr(-0.0025, 0.0025) - x * 0.03;
      r *= 1.006;
    }
    if (prev) {
      const phi = Math.atan2(prev[0], prev[1]);
      walk(prev[2], phi, r * 1.3, Math.floor(rr(30, 80)), 1, 1, phi - 0.6, phi + 0.6);
    }
  }
  {
    // dorsal venous arch
    let prev: Vec | null = null;
    for (let x = -0.039; x <= 0.039; x += 0.0035) {
      const z = -0.68 - Math.cos((x / 0.039) * 1.4) * 0.013 + rr(-0.001, 0.001);
      const hit = surf([x, -0.003, z], [0, 1, 0]);
      if (!hit) continue;
      const p = place(hit, 0.0024);
      if (prev) addSeg(prev, p, 0.0024, 0.0024);
      prev = p;
    }
  }

  veins.forEach((p, i) => insert(binsVein, i, p.min, p.max, VEIN_K + 0.004));

  // ---- grid
  const h = 0.0018;
  const gmin2: Vec = [gmin[0] + 0.006, gmin[1] + 0.006, gmin[2] + 0.006];
  const nx = Math.ceil((gmax[0] - gmin2[0] - 0.006) / h) + 1;
  const ny = Math.ceil((gmax[1] - gmin2[1] - 0.006) / h) + 1;
  const nz = Math.ceil((gmax[2] - gmin2[2] - 0.006) / h) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const B = 8;
  const half = B * h * 0.5 * 1.7321 * 1.4 + 0.004;
  const nbz = Math.ceil(nz / B);
  for (let bz = 0; bz < nbz; bz++) {
    if (bz % 4 === 0) progress(0.05 + 0.75 * (bz / nbz), 'sculpting muscles');
    for (let by = 0; by < Math.ceil(ny / B); by++) for (let bx = 0; bx < Math.ceil(nx / B); bx++) {
      const x0 = bx * B, y0 = by * B, z0 = bz * B;
      const x1 = Math.min(nx, x0 + B), y1 = Math.min(ny, y0 + B), z1 = Math.min(nz, z0 + B);
      const cx = gmin2[0] + ((x0 + x1 - 1) / 2) * h, cy = gmin2[1] + ((y0 + y1 - 1) / 2) * h, cz = gmin2[2] + ((z0 + z1 - 1) / 2) * h;
      const dc = evalFull(cx, cy, cz);
      if (Math.abs(dc) > half) {
        for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) vals.fill(dc, x0 + nx * (y + ny * z), x1 + nx * (y + ny * z));
        continue;
      }
      for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
        vals[x + nx * (y + ny * z)] = evalFull(gmin2[0] + x * h, gmin2[1] + y * h, gmin2[2] + z * h);
    }
  }

  // ---- surface nets
  progress(0.82, 'meshing');
  const cnx = nx - 1, cny = ny - 1;
  const cellV = new Int32Array(cnx * cny * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const cv = new Float32Array(8);
  const EDGES: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) EDGES.push([i, i | bit]);
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0;
    for (let i = 0; i < 8; i++) {
      const v = vals[x + (i & 1) + nx * (y + ((i >> 1) & 1) + ny * (z + ((i >> 2) & 1)))];
      cv[i] = v;
      if (v < 0) mask |= 1 << i;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t;
      sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
      n++;
    }
    cellV[x + cnx * (y + cny * z)] = pos.length / 3;
    pos.push(gmin2[0] + (x + sx / n) * h, gmin2[1] + (y + sy / n) * h, gmin2[2] + (z + sz / n) * h);
  }
  const idx: number[] = [];
  const C = (x: number, y: number, z: number) => cellV[x + cnx * (y + cny * z)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const v0 = vals[x + nx * (y + ny * z)];
    const in0 = v0 < 0;
    if (x < nx - 1 && in0 !== vals[x + 1 + nx * (y + ny * z)] < 0)
      quad(C(x, y, z), C(x, y - 1, z), C(x, y - 1, z - 1), C(x, y, z - 1), !in0);
    if (y < ny - 1 && in0 !== vals[x + nx * (y + 1 + ny * z)] < 0)
      quad(C(x, y, z), C(x, y, z - 1), C(x - 1, y, z - 1), C(x - 1, y, z), !in0);
    if (z < nz - 1 && in0 !== vals[x + nx * (y + ny * (z + 1))] < 0)
      quad(C(x, y, z), C(x - 1, y, z), C(x - 1, y - 1, z), C(x, y - 1, z), !in0);
  }

  // ---- attributes
  progress(0.88, 'skinning');
  const nv = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(nv * 3);
  const colors = new Float32Array(nv * 3);
  const vein = new Float32Array(nv);
  const nail = new Float32Array(nv);
  const skinIndex = new Uint16Array(nv * 4);
  const skinWeight = new Float32Array(nv * 4);
  const allowed: number[][] = [
    [0, 1, 2, 3, 6, 9, 12, 15],
    [2, 3, 4, 5],
    [2, 6, 7, 8],
    [2, 9, 10, 11],
    [2, 12, 13, 14],
    [2, 15, 16, 17],
  ];
  const segD = (b: number, x: number, y: number, z: number) => {
    let best = 1e9;
    for (const [bi, a, c] of R.segs) {
      if (bi !== b) continue;
      const bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2];
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      let t = (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(px - bx * t, py - by * t, pz - bz * t);
      if (d < best) best = d;
    }
    return best;
  };
  const hash = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x: number, y: number, z: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    let r = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
      r += hash(ix + dx, iy + dy, iz + dz) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    }
    return r;
  };
  const ws = new Float64Array(18);
  for (let i = 0; i < nv; i++) {
    if (i % 20000 === 0) progress(0.88 + 0.12 * (i / nv), 'skinning');
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const n = grad(evalFull, x, y, z, 0.0006);
    normals[i * 3] = n[0];
    normals[i * 3 + 1] = n[1];
    normals[i * 3 + 2] = n[2];
    const db = evalBase(x, y, z);
    let g = 0;
    for (let k = 1; k < NG; k++) if (G[k] < G[g]) g = k;
    const vv = Math.min(1, Math.max(0, db / 0.0045));
    vein[i] = vv * vv * (3 - 2 * vv);
    let dn = 1e9;
    for (const p of nails) dn = Math.min(dn, evalPrim(p, x, y, z));
    const nl = Math.min(1, Math.max(0, 1 - dn / 0.0011));
    nail[i] = nl;

    // skin tone: bronzed, slightly oiled, deeply unwell
    const nz1 = vnoise(x * 60, y * 60, z * 60) - 0.5;
    const nz2 = vnoise(x * 300, y * 300, z * 300) - 0.5;
    let r = 0.6 + nz1 * 0.08 + nz2 * 0.025, gg = 0.3 + nz1 * 0.05 + nz2 * 0.015, b = 0.17 + nz1 * 0.03;
    const onHand = z < -0.64;
    if (onHand && n[1] < -0.3) { r += 0.06; gg += 0.06; b += 0.05; } // palm lighter
    if (g > 0 && g < 5) { r += 0.03; gg -= 0.015; } // fingers a bit redder
    // knuckle redness
    for (let j = 3; j < 18; j++) {
      const J = R.joints[j];
      const d = Math.hypot(x - J[0], y - J[1], z - J[2]);
      if (d < 0.016 && n[1] > 0.2) { const k = (1 - d / 0.016) * 0.08; r += k * 0.5; gg -= k * 0.4; b -= k * 0.3; }
    }
    if (z > -0.38 && z < -0.29 && n[1] < 0) { r -= 0.05; gg -= 0.03; } // elbow
    r = r * (1 - vein[i] * 0.12);
    gg = gg * (1 - vein[i] * 0.2);
    b = b * (1 + vein[i] * 0.1);
    colors[i * 3] = r + (0.95 - r) * nl * 0.7;
    colors[i * 3 + 1] = gg + (0.62 - gg) * nl * 0.7;
    colors[i * 3 + 2] = b + (0.55 - b) * nl * 0.7;

    // skin weights
    ws.fill(0);
    let sum = 0;
    for (const bi of allowed[g]) {
      const d = segD(bi, x, y, z);
      const w = 1 / Math.pow(d + 0.003, 5);
      ws[bi] = w;
    }
    const top: number[] = [];
    for (let k = 0; k < 4; k++) {
      let bi = -1;
      for (let j = 0; j < 18; j++) if (ws[j] > 0 && !top.includes(j) && (bi < 0 || ws[j] > ws[bi])) bi = j;
      top.push(bi);
    }
    for (const bi of top) if (bi >= 0) sum += ws[bi];
    top.forEach((bi, k) => {
      skinIndex[i * 4 + k] = bi < 0 ? 0 : bi;
      skinWeight[i * 4 + k] = bi < 0 ? 0 : ws[bi] / sum;
    });
  }
  progress(1, 'done');
  return {
    positions, normals, colors, vein, nail, skinIndex, skinWeight,
    index: new Uint32Array(idx), joints: R.joints, parents: R.parents,
  };
}
