import * as THREE from 'three';
import * as Art from './art';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, rand, pick, V3 } from './util';

export const CHUNK = 80;
export const ROAD_HALF = 8;
export const roadCenter = (s: number) => 60 * Math.sin(s / 700) + 25 * Math.sin(s / 260 + 1.3);
export const roadSlope = (s: number) => (60 / 700) * Math.cos(s / 700) + (25 / 260) * Math.cos(s / 260 + 1.3);
/** road-space -> world */
export const toWorld = (s: number, lat: number, y = 0) => V3(roadCenter(s) + lat, y, -s);

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FS = `
uniform float time; uniform float hell; uniform float trip; uniform float vice; uniform float storm; uniform float flash; uniform vec3 sunDir;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 top = vec3(0.01,0.0,0.035), mid = vec3(0.12,0.01,0.18), hor = vec3(1.0,0.18,0.3), low = vec3(0.25,0.03,0.15);
  vec3 col = h > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.12,0.55,h)), smoothstep(0.0,0.14,h)) : mix(hor, low, smoothstep(0.0,-0.08,h));
  float sd = distance(d, sunDir);
  float R = 0.17;
  if (sd < R) {
    float v = (d.y - sunDir.y) / R;
    vec3 sc = mix(vec3(1.0,0.9,0.25), vec3(1.0,0.08,0.45), smoothstep(0.7,-0.9,v));
    float stripe = step(0.45 + v*0.25, fract(v*7.0 + time*0.25));
    float cut = v < 0.15 ? stripe : 1.0;
    col = mix(col, sc * 1.1, cut * smoothstep(R, R-0.004, sd));
  }
  col += vec3(1.0,0.25,0.45) * exp(-sd*5.0) * 0.3;
  vec2 sp = vec2(atan(d.z, d.x) * 120.0, d.y * 220.0);
  float st = hash(floor(sp));
  if (st > 0.993 && h > 0.12) col += vec3(1.0) * (0.6 + 0.6*sin(time*3.0 + st*100.0)) * smoothstep(0.12,0.3,h);
  // VICE: pastel peach-to-teal sunset, the 80s never ended
  vec3 vtop = vec3(0.05,0.08,0.3), vmid = vec3(0.95,0.35,0.55), vhor = vec3(1.0,0.75,0.45);
  vec3 vcol = h > 0.0 ? mix(vhor, mix(vmid, vtop, smoothstep(0.1,0.6,h)), smoothstep(0.0,0.18,h)) : vec3(0.1,0.55,0.6) * (0.6 + 0.4*smoothstep(-0.1,0.0,h));
  // kept under the bloom threshold: at 1.3 it bloomed into a white blob the size of the windshield
  vec3 vsun = mix(vec3(1.0,0.9,0.62), vec3(1.0,0.5,0.62), smoothstep(0.6,-0.9,(d.y - sunDir.y) / R)) * 0.9;
  vcol = mix(vcol, vsun, smoothstep(R, R-0.004, sd)) + vec3(1.0,0.6,0.5) * exp(-sd*6.0) * 0.12;
  col = mix(col, vcol, vice);
  // STORM: bruised clouds and lightning that lights them from inside
  float cl = 0.0; vec2 cp = d.xz / max(d.y + 0.25, 0.05) * 1.6 + vec2(time*0.04, 0.0);
  for (int i = 0; i < 4; i++) { cl += hash(floor(cp)) * pow(0.5, float(i)); cp *= 2.1; }
  vec3 scol = mix(vec3(0.02,0.025,0.04), vec3(0.09,0.1,0.14), cl * 0.6) + flash * vec3(0.55,0.6,0.85) * (0.4 + cl);
  col = mix(col, scol, storm);
  vec3 hc = vec3(col.r*1.6+0.15, col.g*0.25, col.b*0.15);
  col = mix(col, hc, hell);
  float a = time*0.8 + d.y*6.0;
  col = mix(col, col * vec3(0.5+0.5*sin(a), 0.5+0.5*sin(a+2.1), 0.5+0.5*sin(a+4.2)) * 1.6, trip);
  gl_FragColor = vec4(col, 1.0);
}`;

const GROUND_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FS = `
uniform vec3 camPos; uniform float time; uniform float hell; uniform float trip; uniform float vice; uniform float storm;
varying vec3 vW;
float grid(vec2 p){ vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y), 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  float d = length(vW.xz - camPos.xz);
  vec3 base = vec3(0.045, 0.012, 0.06) + hash(floor(vW.xz*2.0))*0.012;
  float g = grid(vW.xz / 12.0);
  vec3 lc = mix(mix(vec3(1.0,0.12,0.75), vec3(0.1,1.0,0.9), vice), vec3(1.0,0.35,0.02), hell);
  lc *= 1.0 - storm * 0.75;
  float a = time + vW.x*0.01;
  lc = mix(lc, vec3(0.5+0.5*sin(a), 0.5+0.5*sin(a+2.0), 0.5+0.5*sin(a+4.0))*1.5, trip);
  vec3 col = base + lc * g * exp(-d*0.0035) * 1.3;
  vec3 fogCol = mix(mix(mix(vec3(0.35,0.06,0.22), vec3(0.85,0.45,0.5), vice), vec3(0.04,0.05,0.07), storm), vec3(0.5,0.05,0.02), hell);
  col = mix(fogCol, col, exp(-d*0.0022));
  gl_FragColor = vec4(col, 1.0);
}`;

export class World {
  group = new THREE.Group();
  sky: THREE.Mesh;
  ground: THREE.Mesh;
  mountains = new THREE.Group();
  chunks = new Map<number, THREE.Group>();
  skyU = { time: { value: 0 }, hell: { value: 0 }, trip: { value: 0 }, vice: { value: 0 }, storm: { value: 0 }, flash: { value: 0 }, sunDir: { value: V3(-0.42, 0.14, -1).normalize() } };
  groundU = { camPos: { value: V3(0, 0, 0) }, time: { value: 0 }, hell: { value: 0 }, trip: { value: 0 }, vice: { value: 0 }, storm: { value: 0 } };
  theme: 'desert' | 'vice' = 'desert';
  rain: THREE.LineSegments;
  private rainU = { time: { value: 0 }, amt: { value: 0 }, cam: { value: V3(0, 0, 0) } };
  private viceTex: THREE.Texture[] = [];
  roadMat: THREE.MeshLambertMaterial;
  neon: THREE.MeshBasicMaterial;
  billTex: THREE.Texture[] = [];
  private g = {
    pole: new THREE.CylinderGeometry(0.1, 0.14, 8, 8),
    arm: new THREE.BoxGeometry(2.6, 0.12, 0.12),
    lamp: new THREE.BoxGeometry(0.7, 0.14, 0.35),
    pool: new THREE.PlaneGeometry(9, 9),
    cactus: new THREE.CylinderGeometry(0.35, 0.42, 1, 8),
    rock: new THREE.DodecahedronGeometry(1, 0),
  };
  private m = {
    pole: toon(0x2a2233),
    lamp: glow(3.2, 1.4, 0.4),
    pool: new THREE.MeshBasicMaterial({ map: Art.softDot('255,170,80'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    cactus: toon(0x1f6b3a),
    rock: new THREE.MeshLambertMaterial({ color: 0x4a2a3e, flatShading: true }),
    post: toon(0x555060),
  };
  private deerSign = Art.deerSignTex();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.ShaderMaterial({ uniforms: this.groundU, vertexShader: GROUND_VS, fragmentShader: GROUND_FS }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    scene.add(this.ground);

    // synthwave mountains
    for (const [R, hMin, hMax, col, line] of [
      [1300, 120, 320, 0x12031c, 0xff2bd6],
      [1050, 50, 170, 0x1e0626, 0x9a3cff],
    ] as const) {
      const pos: number[] = [];
      const N = 90;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
        const hh = rand(hMin, hMax) * (0.5 + 0.5 * Math.abs(Math.sin(am * 3)));
        const r2 = R - rand(0, 80);
        pos.push(Math.cos(a0) * R, -10, Math.sin(a0) * R, Math.cos(am) * r2, hh, Math.sin(am) * r2, Math.cos(a1) * R, -10, Math.sin(a1) * R);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, fog: false }));
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: line, fog: false }));
      this.mountains.add(mesh, lines);
    }
    scene.add(this.mountains);

    const rt = Art.roadTexture();
    this.roadMat = new THREE.MeshLambertMaterial({ map: rt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.neon = glow(3, 0.2, 2.2);
    for (let i = 0; i < Art.BILLBOARDS.length; i++) this.billTex.push(Art.billboardTex(i));
    for (const [t, sub, bg, fg] of [
      ['OCEAN VIEW MOTEL', 'vacancy (emotionally)', '#ff5fa2', '#fff'],
      ['MALIBU NIGHTS', 'dress code: pastel or die', '#1de9d0', '#300040'],
      ['PINK FLAMINGO LOUNGE', 'live sax every night. no escape.', '#ff8ac0', '#2a0040'],
      ['RENT-A-SUIT', 'sleeves pre-rolled', '#ffe066', '#ff2a7a'],
      ['THE 80s NEVER ENDED', 'please stop asking', '#2b0a57', '#ff4fd8'],
      ['SUNBURN & CO.', 'tanning, regret, cocktails', '#ff7b39', '#fff'],
      ['NEON NIGHTS ARCADE', 'high score: you, eventually', '#000', '#00fff2'],
      ['STAY AWAKE', '— the night', '#0b0b2a', '#ff3b8d'],
    ] as const) this.viceTex.push(Art.signTex2(t, sub, bg, fg));
    // rain: 3000 streaks that follow the camera
    const rp: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const x = rand(-60, 60), y = rand(0, 50), z = rand(-80, 20);
      rp.push(x, y, z, x + 0.15, y + 1.4, z + 0.4);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: this.rainU,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float time; uniform vec3 cam; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - time * 38.0, 50.0) - 6.0; p.xz += cam.xz; vA = 1.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float amt; varying float vA; void main(){ gl_FragColor = vec4(0.65, 0.72, 0.85, 0.35 * amt); }`,
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  private strip(s0: number, s1: number, l0: number, l1: number, y: number, mat: THREE.Material, uvLen = 32) {
    const n = 16;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const c = roadCenter(s);
      pos.push(c + l0, y, -s, c + l1, y, -s);
      uv.push(0, s / uvLen, 1, s / uvLen);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }

  private placeAt(o: THREE.Object3D, s: number, lat: number, y = 0) {
    o.position.copy(toWorld(s, lat, y));
    o.rotation.y = -Math.atan(roadSlope(s));
    return o;
  }

  private buildChunk(i: number) {
    const g = new THREE.Group();
    const s0 = i * CHUNK, s1 = s0 + CHUNK;
    g.add(this.strip(s0, s1, -ROAD_HALF, ROAD_HALF, 0.02, this.roadMat));
    g.add(this.strip(s0, s1, -ROAD_HALF - 0.45, -ROAD_HALF - 0.2, 0.04, this.neon));
    g.add(this.strip(s0, s1, ROAD_HALF + 0.2, ROAD_HALF + 0.45, 0.04, this.neon));

    for (let k = 0; k < 2; k++) {
      const s = s0 + k * 40 + 20;
      for (const side of [-1, 1]) {
        const L = new THREE.Group();
        const pole = new THREE.Mesh(this.g.pole, this.m.pole);
        pole.position.y = 4;
        const arm = new THREE.Mesh(this.g.arm, this.m.pole);
        arm.position.set(-side * 1.2, 7.95, 0);
        const lamp = new THREE.Mesh(this.g.lamp, this.m.lamp);
        lamp.position.set(-side * 2.3, 7.85, 0);
        const pool = new THREE.Mesh(this.g.pool, this.m.pool);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(-side * 2.6, 0.06, 0);
        L.add(pole, arm, lamp, pool);
        this.placeAt(L, s, side * 10.5);
        g.add(L);
      }
    }
    const palms: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const s = rand(s0, s1);
      const side = Math.random() < 0.5 ? -1 : 1;
      const lat = side * rand(13, 110);
      if (this.theme === 'vice' && Math.random() < 0.75) {
        const palm = this.makePalm();
        this.placeAt(palm, s, side * rand(12, 60));
        palm.rotation.y = rand(0, 6);
        palm.updateMatrixWorld(true);
        palm.traverse((o) => { if (o instanceof THREE.Mesh) palms.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
      } else if (Math.random() < 0.6) {
        const cac = new THREE.Group();
        const hh = rand(2.5, 6);
        const trunk = new THREE.Mesh(this.g.cactus, this.m.cactus);
        trunk.scale.set(1, hh, 1);
        trunk.position.y = hh / 2;
        cac.add(trunk);
        for (const sd of [-1, 1]) {
          if (Math.random() < 0.3) continue;
          const h2 = rand(1, 2.2), y = rand(hh * 0.35, hh * 0.65);
          const a = new THREE.Mesh(this.g.cactus, this.m.cactus);
          a.scale.set(0.6, 0.9, 0.6);
          a.rotation.z = sd * Math.PI / 2;
          a.position.set(sd * 0.6, y, 0);
          const up = new THREE.Mesh(this.g.cactus, this.m.cactus);
          up.scale.set(0.55, h2, 0.55);
          up.position.set(sd * 1.0, y + h2 / 2, 0);
          cac.add(a, up);
        }
        this.placeAt(cac, s, lat);
        cac.rotation.y = rand(0, 6);
        g.add(cac);
      } else {
        const rock = new THREE.Mesh(this.g.rock, this.m.rock);
        const sc = rand(0.8, 3.5);
        rock.scale.set(sc * rand(1, 1.8), sc * rand(0.5, 1), sc);
        this.placeAt(rock, s, lat, sc * 0.3);
        rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
        g.add(rock);
      }
    }
    // a palm is 16 meshes; 50 of them on screen doubled the draw calls. bake the chunk's grove into one.
    if (palms.length) {
      const grove = new THREE.Mesh(mergeGeometries(palms), this.palmMat);
      grove.userData.owned = true;
      palms.forEach((p) => p.dispose());
      g.add(grove);
    }
    if (Math.random() < 0.45 && i > 1) {
      const b = new THREE.Group();
      const side = Math.random() < 0.7 ? 1 : -1;
      const tex = this.theme === 'vice' ? pick(this.viceTex) : pick(this.billTex);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: tex }));
      board.material.color.setScalar(1.4);
      board.position.y = 8;
      const back = new THREE.Mesh(new THREE.BoxGeometry(12.4, 6.4, 0.3), this.m.pole);
      back.position.set(0, 8, -0.2);
      b.add(board, back);
      for (const px of [-4, 4]) {
        const leg = new THREE.Mesh(this.g.pole, this.m.post);
        leg.scale.set(1.5, 0.75, 1.5);
        leg.position.set(px, 3, -0.2);
        b.add(leg);
      }
      this.placeAt(b, rand(s0, s1), side * rand(17, 24));
      b.rotation.y += -side * 0.35;
      g.add(b);
    } else if (Math.random() < 0.3) {
      const sgn = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), this.m.post);
      post.position.y = 1.3;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: this.deerSign, transparent: true }));
      plate.position.y = 2.8;
      sgn.add(post, plate);
      this.placeAt(sgn, rand(s0, s1), 10);
      sgn.rotation.y -= 0.3;
      g.add(sgn);
    }
    this.group.add(g);
    this.chunks.set(i, g);
  }

  private palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  private palmGeo = (() => {
    const tint = (g: THREE.BufferGeometry, hex: number) => {
      const c = new THREE.Color(hex), n = g.attributes.position.count;
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c.toArray()[i % 3]), 3));
      return g;
    };
    const leaf = new THREE.ConeGeometry(0.55, 4.2, 4, 1);
    leaf.scale(1, 1, 0.12);
    leaf.translate(0, 2.1, 0);
    return { seg: tint(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7), 0x7a5236), leaf: tint(leaf, 0x1f8a4c) };
  })();
  private makePalm() {
    const p = new THREE.Group();
    const h = rand(7, 12), lean = rand(0.04, 0.12);
    let y = 0, x = 0;
    const n = Math.ceil(h / 1.5);
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Mesh(this.palmGeo.seg);
      seg.position.set(x, y + 0.75, 0);
      seg.rotation.z = -lean * (i + 1) * 0.6;
      p.add(seg);
      y += 1.45;
      x += lean * (i + 1) * 0.9;
    }
    for (let i = 0; i < 8; i++) {
      const lf = new THREE.Mesh(this.palmGeo.leaf);
      lf.position.set(x, y, 0);
      lf.rotation.set(0, (i / 8) * Math.PI * 2, 1.25 + rand(-0.2, 0.25));
      lf.rotation.order = 'YZX';
      p.add(lf);
    }
    return p;
  }

  setTheme(t: 'desert' | 'vice') {
    if (t === this.theme) return;
    this.theme = t;
    this.reset();
  }

  update(s: number, cam: THREE.Vector3, time: number, hell: number, trip: number, vice = 0, storm = 0, flash = 0) {
    this.skyU.vice.value = vice;
    this.skyU.storm.value = storm;
    this.skyU.flash.value = flash;
    this.groundU.vice.value = vice;
    this.groundU.storm.value = storm;
    this.rain.visible = storm > 0.02;
    this.rainU.amt.value = storm;
    this.rainU.time.value = time;
    this.rainU.cam.value.copy(cam);
    const ci = Math.floor(s / CHUNK);
    for (let i = ci - 1; i <= ci + 8; i++) if (!this.chunks.has(i)) this.buildChunk(i);
    for (const [i, g] of this.chunks) {
      if (i < ci - 1 || i > ci + 9) {
        this.group.remove(g);
        g.traverse((o) => {
          if (o instanceof THREE.Mesh && (o.userData.owned || (o.geometry.attributes.uv?.count ?? 0) === 34)) o.geometry.dispose();
        });
        this.chunks.delete(i);
      }
    }
    this.sky.position.copy(cam);
    this.mountains.position.set(cam.x, 0, cam.z);
    this.ground.position.set(cam.x, 0, cam.z);
    this.skyU.time.value = time;
    this.skyU.hell.value = hell;
    this.skyU.trip.value = trip;
    this.groundU.camPos.value.copy(cam);
    this.groundU.time.value = time;
    this.groundU.hell.value = hell;
    this.groundU.trip.value = trip;
    const v = vice * (1 - hell);
    this.neon.color.setRGB((3 * (1 - hell) + 4 * hell) * (1 - v) + 0.2 * v, 0.2 + 0.8 * hell + 2.6 * v, 2.2 * (1 - hell) * (1 - v) + 2.4 * v);
  }

  reset() {
    for (const [, g] of this.chunks) this.group.remove(g);
    this.chunks.clear();
  }
}
