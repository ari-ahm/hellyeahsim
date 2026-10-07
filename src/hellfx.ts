import * as THREE from 'three';
import * as Art from './art';
import { rand, V3 } from './util';
import { roadCenter } from './world';

interface Spr { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; base: number }

/** world-space spectacle: burnout smoke, hellfire pillars, meteors */
export class FX {
  smoke: Spr[] = [];
  fire: Spr[] = [];
  meteors: Spr[] = [];
  private fireT = 0;
  private metT = 0;

  constructor(scene: THREE.Scene) {
    const smokeTex = Art.softDot('220,215,225');
    const fireTex = Art.fireTex();
    const metTex = Art.softDot('255,170,60');
    const mk = (tex: THREE.Texture, add: boolean, list: Spr[], n: number) => {
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
        s.visible = false;
        scene.add(s);
        list.push({ s, v: V3(0, 0, 0), life: 0, max: 1, grow: 0, base: 1 });
      }
    };
    mk(smokeTex, false, this.smoke, 60);
    mk(fireTex, true, this.fire, 28);
    mk(metTex, true, this.meteors, 10);
  }

  private take(list: Spr[]) {
    return list.find((p) => p.life <= 0);
  }

  burnout(p: THREE.Vector3, dt: number) {
    if (Math.random() > dt * 30) return;
    const q = this.take(this.smoke);
    if (!q) return;
    q.s.position.copy(p).add(V3(rand(-0.8, 0.8), 0, rand(-0.3, 0.3)));
    q.v.set(rand(-1, 1), rand(0.5, 1.5), rand(1, 3));
    q.life = q.max = rand(1.5, 2.5);
    q.grow = 2.5;
    q.base = 0.8;
    q.s.scale.setScalar(0.8);
    q.s.visible = true;
  }

  update(dt: number, s: number, time: number, hell: number, car: THREE.Vector3) {
    if (hell > 0.3) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.12;
        const q = this.take(this.fire);
        if (q) {
          const ss = s + rand(40, 160);
          const side = Math.random() < 0.5 ? -1 : 1;
          q.s.position.set(roadCenter(ss) + side * rand(11, 16), 0, -ss);
          q.base = rand(5, 9);
          q.life = q.max = rand(1.2, 2.2);
          q.grow = 0;
          q.v.set(0, 0, 0);
          q.s.visible = true;
        }
      }
      this.metT -= dt;
      if (this.metT <= 0) {
        this.metT = rand(0.3, 0.9);
        const q = this.take(this.meteors);
        if (q) {
          q.s.position.set(car.x + rand(-300, 300), rand(200, 320), car.z - rand(350, 650));
          q.v.set(rand(-60, 60), -rand(110, 170), rand(-20, 20));
          q.life = q.max = 2.2;
          q.base = rand(14, 30);
          q.s.visible = true;
        }
      }
    }
    for (const q of this.smoke) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.s.position.addScaledVector(q.v, dt);
      q.v.multiplyScalar(1 - dt * 0.8);
      q.s.scale.addScalar(q.grow * dt);
      const k = q.life / q.max;
      (q.s.material as THREE.SpriteMaterial).opacity = 0.55 * k;
      if (q.life <= 0) q.s.visible = false;
    }
    for (const q of this.fire) {
      if (q.life <= 0) continue;
      q.life -= dt;
      const k = q.life / q.max;
      const h = q.base * Math.sin(k * Math.PI) * (0.85 + 0.15 * Math.sin(time * 30 + q.base));
      q.s.scale.set(h * 0.45, h, 1);
      q.s.position.y = h * 0.5;
      (q.s.material as THREE.SpriteMaterial).opacity = Math.min(1, hell * 1.5);
      if (q.life <= 0) q.s.visible = false;
    }
    for (const q of this.meteors) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.s.position.addScaledVector(q.v, dt);
      q.s.scale.setScalar(q.base * (0.8 + Math.random() * 0.4));
      if (q.s.position.y < 0) q.life = 0;
      if (q.life <= 0) q.s.visible = false;
    }
  }
}
