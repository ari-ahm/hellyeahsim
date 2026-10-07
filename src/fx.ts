// Full-screen "state of mind" + art-direction shader. Runs AFTER tone mapping (display space).
// mode 0: BUCKSHOT (low-res, bayer dithered, crushed palette) · 1: HD · 2: VHS · 3: DEEP FRIED
export const MODES = ['BUCKSHOT', 'HD (RTX ON)', 'VHS 1997', 'DEEP FRIED', 'MIAMI 1989'] as const;

export const MindShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    drunk: { value: 0 },
    smoke: { value: 0 },
    hell: { value: 0 },
    damage: { value: 0 },
    speed: { value: 0 },
    blackout: { value: 0 },
    aspect: { value: 1 },
    trip: { value: 0 },
    mode: { value: 0 },
    chug: { value: 0 },
    rain: { value: 0 },
    flash: { value: 0 },
    kill: { value: 0 },
    res: { value: [1280, 720] },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float time, drunk, smoke, hell, damage, speed, blackout, aspect, trip, chug, rain, flash, kill;
uniform int mode;
uniform vec2 res;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k, c)*sin(a) + k*dot(k, c)*(1.0-ca); }
float bayer(vec2 p){
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return m[x + y*4] / 16.0 - 0.5;
}
vec3 tex(vec2 u){ return texture2D(tDiffuse, u).rgb; }
void main(){
  vec2 uv = vUv;
  float d = drunk;
  if (mode == 2) {
    float line = floor(uv.y * 240.0);
    uv.x += (hash(vec2(line, floor(time * 24.0))) - 0.5) * 0.0025;
    float roll = smoothstep(0.03, 0.0, abs(uv.y - fract(time * 0.11)));
    uv.x += roll * 0.015 * sin(uv.y * 200.0);
    uv.y += step(0.985, hash(vec2(floor(time*3.0), 1.0))) * 0.01;
  }
  uv += vec2(sin(uv.y*7.0 + time*1.7), cos(uv.x*6.0 + time*1.3)) * 0.007 * d;
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 - trip * 0.08 * sin(time*2.0) * dot(c,c) * 4.0);
  if (mode == 0) uv = 0.5 + (uv - 0.5) * (1.0 - 0.06 * dot(c, c)); // subtle CRT barrel
  c = uv - 0.5;
  float sb = speed * 0.03 + hell * 0.04;
  float ca = 0.0012 + d*0.01 + hell*0.006 + damage*0.025 + (mode == 0 ? 0.0018 : 0.0) + (mode == 2 ? 0.0035 : 0.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++){
    float k = float(i) / 4.0;
    vec2 u = uv - c * sb * k * smoothstep(0.05, 0.4, length(c));
    vec2 cd = mode == 2 ? vec2(ca, 0.0) : c * ca;
    col.r += tex(u + cd).r;
    col.g += tex(u).g;
    col.b += tex(u - cd).b;
  }
  col /= 5.0;
  vec2 off = vec2(sin(time*0.8), cos(time*1.1)) * 0.028 * d;
  col = mix(col, tex(uv + off), 0.45 * smoothstep(0.1, 0.6, d));
  col = mix(col, hueShift(col, time*2.0 + uv.y*4.0), trip);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.0 + d*0.7);
  float sm = fbm(uv*3.0 + vec2(time*0.1, -time*0.15));
  col = mix(col, vec3(0.6,0.56,0.66) * (0.45 + sm), clamp(smoke*0.6*sm, 0.0, 0.8));
  col *= mix(vec3(1.0), vec3(1.45, 0.6, 0.4), hell*0.6);
  float fl = fbm(vec2(uv.x*5.0, uv.y*2.5 - time*2.6));
  float flame = smoothstep(0.0, 0.25, fl*0.55 - uv.y + 0.12) * hell;
  float flameTop = smoothstep(0.0, 0.25, fl*0.4 - (1.0-uv.y) + 0.06) * hell * 0.6;
  col += vec3(1.0, 0.45, 0.05) * flame + vec3(0.8, 0.2, 0.05) * flameTop;
  if (rain > 0.001) {
    // rain on the windshield: beads that refract, streaks that run
    for (int L = 0; L < 2; L++) {
      float sc = L == 0 ? 11.0 : 23.0;
      vec2 r = uv * vec2(aspect, 1.0) * sc;
      r.y += time * (L == 0 ? 0.35 : 0.9);
      vec2 id = floor(r);
      vec2 f = fract(r) - 0.5;
      float n = hash(id + float(L) * 17.0);
      vec2 o = vec2(n - 0.5, fract(n * 13.7) - 0.5) * 0.6;
      float d = length((f - o) * vec2(1.0, 0.8));
      float drop = smoothstep(0.17, 0.06, d) * step(0.5, n);
      float trail = smoothstep(0.05, 0.0, abs(f.x - o.x)) * smoothstep(-0.5, o.y, f.y) * step(0.7, n) * 0.5;
      vec2 refr = (f - o) * (drop + trail) * 0.035;
      col = mix(col, tex(uv - refr) * 1.15 + 0.03, clamp(drop + trail, 0.0, 1.0) * rain);
    }
    float L = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(L) * vec3(0.62, 0.78, 1.15), rain * 0.55);
  }
  if (kill > 0.001) {
    // killer mode: noir everything, red survives
    float L = dot(col, vec3(0.3, 0.59, 0.11));
    float red = smoothstep(0.08, 0.3, col.r - max(col.g, col.b));
    col = mix(col, mix(vec3(L) * vec3(0.85, 0.9, 1.05), col * vec3(1.4, 0.5, 0.5), red), kill * 0.75);
  }
  col += flash * vec3(0.75, 0.8, 1.0);
  if (chug > 0.001) {
    // the beer is coming. it is coming fast. it fills your entire world.
    float lvl = 0.16 * chug + 0.025 * sin(uv.x * 11.0 + time * 7.0) + 0.018 * sin(uv.x * 27.0 - time * 11.0);
    float m = smoothstep(lvl, lvl - 0.035, uv.y);
    vec2 bc = floor(vec2(uv.x * 70.0, uv.y * 70.0 - time * 14.0));
    float bub = step(0.975, hash(bc)) * m;
    vec3 beer = mix(vec3(0.55, 0.28, 0.02), vec3(1.0, 0.72, 0.18), clamp(uv.y / max(lvl, 0.01), 0.0, 1.0));
    float foam = smoothstep(0.02, 0.0, abs(uv.y - lvl + 0.012)) * chug;
    col = mix(col, beer + bub * 0.5, m * 0.78 * chug);
    col = mix(col, vec3(1.0, 0.97, 0.88), foam * 0.85);
  }
  float vig = length(c * vec2(aspect, 1.0));
  col = mix(col, vec3(0.6, 0.0, 0.05), damage * smoothstep(0.25, 0.9, vig));

  vec2 px = uv * res;
  if (mode == 0) {
    // BUCKSHOT: crushed blacks, warm-sick tint, heavy vignette, dithered 6-level palette
    col = pow(max(col, 0.0), vec3(1.25)) * 1.18;
    col = mix(vec3(dot(col, vec3(0.3,0.59,0.11))), col, 0.82) * vec3(1.04, 0.98, 0.9);
    col *= 1.0 - smoothstep(0.3, 0.95, vig) * 0.85;
    col += (hash(px + fract(time*7.0)*100.0) - 0.5) * 0.09;
    float levels = 6.0;
    col = floor(col * levels + 0.5 + bayer(px) * 1.0) / levels;
  } else if (mode == 1) {
    col *= 1.0 - smoothstep(0.45, 1.15, vig) * (0.6 + d*0.3);
    col += (hash(uv*vec2(1000.0) + fract(time)) - 0.5) * 0.03;
  } else if (mode == 2) {
    col = mix(vec3(dot(col, vec3(0.3,0.59,0.11))), col, 0.7) * vec3(1.05, 1.0, 1.1);
    col += (hash(vec2(floor(px.y*0.5), floor(time*30.0)) + px.x*0.001) - 0.5) * 0.12;
    col *= 0.9 + 0.1 * sin(px.y * 3.14159);
    float band = smoothstep(0.08, 0.0, uv.y) * (0.5 + 0.5 * hash(vec2(floor(px.x/6.0), floor(time*20.0))));
    col = mix(col, vec3(0.9), band * 0.5);
    col *= 1.0 - smoothstep(0.5, 1.2, vig) * 0.6;
  } else if (mode == 4) {
    // MIAMI 1989: luminance mapped onto a neon gradient that won't stop shifting
    float L = dot(col, vec3(0.3, 0.59, 0.11));
    vec3 g1 = vec3(0.1, 0.0, 0.22), g2 = vec3(1.0, 0.08, 0.55), g3 = vec3(0.05, 0.9, 1.0), g4 = vec3(1.0, 0.96, 0.45);
    vec3 grad = L < 0.33 ? mix(g1, g2, L / 0.33) : L < 0.66 ? mix(g2, g3, (L - 0.33) / 0.33) : mix(g3, g4, (L - 0.66) / 0.34);
    grad = hueShift(grad, sin(time * 0.45) * 0.7);
    col = mix(col * 1.15, grad, 0.68);
    col *= 0.86 + 0.14 * sin(px.y * 3.14159);
    col *= 1.0 - smoothstep(0.4, 1.1, vig) * 0.75;
    col += (hash(px + fract(time * 5.0) * 50.0) - 0.5) * 0.05;
  } else {
    // DEEP FRIED: 8x8 blocks, oversharpened, oversaturated, posterized
    vec2 bl = (floor(px / 8.0) * 8.0 + 4.0) / res;
    vec3 blk = tex(bl);
    vec2 e = 1.5 / res;
    vec3 sharp = col * 5.0 - tex(uv + vec2(e.x,0)) - tex(uv - vec2(e.x,0)) - tex(uv + vec2(0,e.y)) - tex(uv - vec2(0,e.y));
    col = mix(sharp, blk, 0.35) * mix(1.0, 0.6, hell);
    float lum = dot(col, vec3(0.3,0.59,0.11));
    col = mix(vec3(lum), col, 2.2);
    col = (col - 0.5) * 1.45 + 0.5 + vec3(0.08, 0.03, -0.06);
    col = floor(col * 5.0) / 5.0;
  }
  col *= 1.0 - blackout;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};
