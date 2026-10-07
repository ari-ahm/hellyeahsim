import * as THREE from 'three';
import { pick, rand } from './util';

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvas(w: number, h: number, draw?: Draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  draw?.(c, w, h);
  return { cv, c };
}

export function canvasTex(w: number, h: number, draw: Draw) {
  const { cv } = canvas(w, h, draw);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function fitText(c: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string) {
  let s = size;
  do {
    c.font = `${s}px ${font}`;
    s -= 2;
  } while (c.measureText(text).width > maxW && s > 8);
}

export function roadTexture() {
  const t = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#1b1720';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      const v = Math.random() * 40 + 15;
      c.fillStyle = `rgba(${v},${v},${v + 10},0.55)`;
      c.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    // tar snakes
    c.strokeStyle = 'rgba(5,3,8,0.7)';
    c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      c.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += rand(-14, 14);
        y += rand(-20, 20);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    const X = (m: number) => (m + 8) * 16;
    c.fillStyle = '#efe8d6';
    c.fillRect(X(-7.6) - 2, 0, 4, h);
    c.fillRect(X(7.6) - 2, 0, 4, h);
    c.fillStyle = '#ffc21a';
    c.fillRect(X(0) - 6, 0, 3.5, h);
    c.fillRect(X(0) + 2.5, 0, 3.5, h);
    c.fillStyle = '#efe8d6';
    for (const m of [-4, 4]) {
      c.fillRect(X(m) - 2, 0, 4, h * 0.13);
      c.fillRect(X(m) - 2, h * 0.5, 4, h * 0.13);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function beerLabel() {
  return canvasTex(2048, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5a000c');
    g.addColorStop(0.18, '#c4001a');
    g.addColorStop(0.5, '#ff2424');
    g.addColorStop(0.82, '#c4001a');
    g.addColorStop(1, '#4a0008');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // brushed metal stripes peeking through
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
      c.fillRect(0, Math.random() * h, w, 1);
    }
    c.fillStyle = '#ffc93a';
    c.fillRect(0, 40, w, 18);
    c.fillRect(0, h - 58, w, 18);
    c.fillStyle = '#1a0004';
    c.fillRect(0, 62, w, 6);
    c.fillRect(0, h - 68, w, 6);
    const panel = (ox: number) => {
      c.save();
      c.translate(ox, 0);
      // flames up the side
      for (let i = 0; i < 9; i++) {
        const x = 80 + i * 90, len = 220 + Math.random() * 220;
        const fg = c.createLinearGradient(0, h - 70, 0, h - 70 - len);
        fg.addColorStop(0, '#ffe14a');
        fg.addColorStop(0.5, '#ff7a00');
        fg.addColorStop(1, 'rgba(255,0,40,0)');
        c.fillStyle = fg;
        c.beginPath();
        c.moveTo(x - 40, h - 70);
        c.bezierCurveTo(x - 50, h - 70 - len * 0.5, x + 40, h - 70 - len * 0.6, x + 10, h - 70 - len);
        c.bezierCurveTo(x, h - 70 - len * 0.6, x + 50, h - 70 - len * 0.3, x + 40, h - 70);
        c.fill();
      }
      // goat skull emblem
      c.save();
      c.translate(512, 330);
      c.fillStyle = '#f3ead8';
      c.strokeStyle = '#1a0004';
      c.lineWidth = 8;
      c.beginPath();
      c.ellipse(0, 0, 70, 82, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.lineWidth = 26;
      c.lineCap = 'round';
      c.strokeStyle = '#f3ead8';
      c.beginPath();
      c.moveTo(-50, -50);
      c.quadraticCurveTo(-130, -110, -110, -190);
      c.moveTo(50, -50);
      c.quadraticCurveTo(130, -110, 110, -190);
      c.stroke();
      c.fillStyle = '#1a0004';
      c.beginPath();
      c.arc(-28, -6, 18, 0, Math.PI * 2);
      c.arc(28, -6, 18, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.textAlign = 'center';
      c.lineJoin = 'round';
      c.font = '900 190px Impact, "Arial Black", sans-serif';
      c.lineWidth = 22;
      c.strokeStyle = '#1a0004';
      c.fillStyle = '#ffd84a';
      c.strokeText('HELL YEAH', 512, 610);
      c.fillText('HELL YEAH', 512, 610);
      c.font = 'italic 900 70px Georgia, serif';
      c.lineWidth = 10;
      c.strokeText('Premium Lager', 512, 700);
      c.fillStyle = '#fff';
      c.fillText('Premium Lager', 512, 700);
      c.font = 'bold 44px Impact, sans-serif';
      c.fillStyle = '#ffd84a';
      c.fillText('BREWED IN THE PITS • 666% ABV', 512, 790);
      c.font = 'bold 30px sans-serif';
      c.fillStyle = '#fff';
      c.fillText('12 FL OZ (355 mL) • DRINK IN THE GAME, NOT ON THE STREETS', 512, 850);
      // barcode + legalese on the back panel
      c.fillStyle = '#fff';
      c.fillRect(840, 120, 150, 90);
      c.fillStyle = '#000';
      for (let i = 0; i < 40; i++) c.fillRect(848 + i * 3.4, 128, Math.random() < 0.5 ? 1.6 : 2.8, 66);
      c.font = 'bold 18px sans-serif';
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.fillText('CA CASH REFUND 5¢ • HELL REFUND: YOUR SOUL', 40, 120);
      c.restore();
    };
    panel(0);
    panel(1024);
  });
}

export function cigPackTex() {
  return canvasTex(256, 384, (c, w, h) => {
    c.fillStyle = '#e8e2d2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#c8102e';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h * 0.45);
    c.lineTo(w / 2, h * 0.3);
    c.lineTo(0, h * 0.45);
    c.fill();
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.font = '900 40px Impact, sans-serif';
    c.fillText('LUNG', w / 2, h * 0.56);
    c.fillText('BUSTERS', w / 2, h * 0.67);
    c.fillStyle = '#000';
    c.fillRect(10, h * 0.74, w - 20, h * 0.23);
    c.fillStyle = '#fff';
    c.font = 'bold 19px sans-serif';
    c.fillText('SMOKING KILLS.', w / 2, h * 0.8);
    c.font = '15px sans-serif';
    c.fillText("(you're already dead inside", w / 2, h * 0.86);
    c.fillText('so it evens out)', w / 2, h * 0.91);
  });
}

export function diceFace(n: number) {
  return canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#ff4fb0';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,220,0.6)' : 'rgba(170,20,110,0.5)';
      c.fillRect(Math.random() * w, Math.random() * h, 2, 4);
    }
    const P: Record<number, [number, number][]> = {
      1: [[0.5, 0.5]],
      2: [[0.25, 0.25], [0.75, 0.75]],
      3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
      4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
      5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
      6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
    };
    c.fillStyle = '#16001a';
    for (const [x, y] of P[n]) {
      c.beginPath();
      c.arc(x * w, y * h, 11, 0, Math.PI * 2);
      c.fill();
    }
  });
}

export function freshenerTex() {
  return canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = '#19d36b';
    c.beginPath();
    c.moveTo(w / 2, 10);
    for (let i = 1; i <= 3; i++) {
      c.lineTo(w / 2 + 18 * i + 8, 10 + i * 58);
      c.lineTo(w / 2 + 8 * i, 10 + i * 58);
    }
    c.lineTo(w / 2 + 10, h - 30);
    c.lineTo(w / 2 - 10, h - 30);
    for (let i = 3; i >= 1; i--) {
      c.lineTo(w / 2 - 8 * i, 10 + i * 58);
      c.lineTo(w / 2 - 18 * i - 8, 10 + i * 58);
    }
    c.closePath();
    c.fill();
    c.fillStyle = '#073';
    c.textAlign = 'center';
    c.font = 'bold 14px sans-serif';
    c.fillText('SCENT:', w / 2, 130);
    c.font = 'bold 18px sans-serif';
    c.fillText('REGRET', w / 2, 152);
  });
}

export function hornTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#120a14';
    c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 128);
    g.addColorStop(0, '#ffb000');
    g.addColorStop(0.5, '#ff3d00');
    g.addColorStop(1, '#3a0010');
    c.fillStyle = g;
    c.beginPath();
    c.arc(w / 2, h / 2, 118, 0, Math.PI * 2);
    c.fill();
    // goat skull
    c.fillStyle = '#f3ead8';
    c.beginPath();
    c.ellipse(128, 120, 40, 46, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#f3ead8';
    c.lineWidth = 14;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(98, 90);
    c.quadraticCurveTo(60, 60, 70, 20);
    c.moveTo(158, 90);
    c.quadraticCurveTo(196, 60, 186, 20);
    c.stroke();
    c.fillStyle = '#120a14';
    c.beginPath();
    c.arc(112, 116, 10, 0, Math.PI * 2);
    c.arc(144, 116, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.font = '900 30px Impact, sans-serif';
    c.fillText('HELL YEAH', 128, 205);
  });
}

export function hoodTex() {
  return canvasTex(512, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#3a0008');
    g.addColorStop(0.5, '#a3001c');
    g.addColorStop(1, '#3a0008');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // flame decals licking up from the windshield end (bottom of texture)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const x0 = w / 2 + side * (40 + i * 34);
        const len = rand(300, 620);
        const fg = c.createLinearGradient(0, h, 0, h - len);
        fg.addColorStop(0, '#ffe14a');
        fg.addColorStop(0.5, '#ff7a00');
        fg.addColorStop(1, 'rgba(255,0,60,0)');
        c.fillStyle = fg;
        c.beginPath();
        c.moveTo(x0 - 22, h);
        c.bezierCurveTo(x0 - 30, h - len * 0.4, x0 + side * 50, h - len * 0.6, x0 + side * 20, h - len);
        c.bezierCurveTo(x0 + side * 5, h - len * 0.6, x0 + 30, h - len * 0.3, x0 + 22, h);
        c.fill();
      }
    }
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(w / 2 - 30, 0, 60, h);
  });
}

export const BILLBOARDS: { bg: string; fg: string; title: string; sub: string }[] = [
  { bg: '#ffde00', fg: '#111', title: 'HYDRATE.', sub: '(with beer)' },
  { bg: '#ff2d6f', fg: '#fff', title: 'SPEED LIMIT: VIBES', sub: 'enforced by nobody' },
  { bg: '#1a1a1a', fg: '#ff3030', title: 'YOUR WIFE LEFT.', sub: 'keep driving.' },
  { bg: '#00b3ff', fg: '#fff', title: 'JESUS TAKE THE WHEEL', sub: 'he said no' },
  { bg: '#33ff88', fg: '#003', title: 'SIGMA GRINDSET RV PARK', sub: 'no women. no rules. no plumbing.' },
  { bg: '#ffffff', fg: '#c00', title: 'BUTTERSCOTCH PIE', sub: 'next exit • someone misses you' },
  { bg: '#6a00ff', fg: '#ffea00', title: 'LAST GAS FOR 666 MI', sub: 'pray accordingly' },
  { bg: '#ff8800', fg: '#200', title: 'SKIBIDI MOTEL', sub: '0 stars • cash only • do not' },
  { bg: '#000000', fg: '#fff', title: 'THIS SIGN IS LOAD-BEARING', sub: 'please do not hit' },
  { bg: '#ffd0e0', fg: '#600', title: 'DEER XING', sub: 'they chose this' },
  { bg: '#0d3b1e', fg: '#fff', title: 'EXIT 69: REGRET', sub: 'also: Taco Bell' },
  { bg: '#ff0033', fg: '#fff', title: 'HELL YEAH BROTHER', sub: '— the management' },
  { bg: '#222266', fg: '#88f', title: 'THE ROAD IS JUST', sub: 'a really long floor' },
  { bg: '#fff200', fg: '#000', title: 'GOT DUI?', sub: 'call 1-800-NOT-ME' },
  { bg: '#ff66cc', fg: '#000', title: 'MOM SAYS COME HOME', sub: 'she made the pie again' },
  { bg: '#111', fg: '#0f0', title: 'NO THOUGHTS', sub: 'only highway' },
];

export function billboardTex(i: number) {
  const b = BILLBOARDS[i % BILLBOARDS.length];
  return canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = b.bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = b.fg;
    c.lineWidth = 8;
    c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = b.fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, b.title, w - 60, 72, '900 Impact, "Arial Black", sans-serif');
    c.fillText(b.title, w / 2, h * 0.44);
    fitText(c, b.sub, w - 80, 30, 'italic bold Georgia, serif');
    c.fillText(b.sub, w / 2, h * 0.74);
  });
}

export function signTex(lines: string[], bg = '#0b6b2f', fg = '#fff') {
  return canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = fg;
    c.lineWidth = 5;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => {
      fitText(c, l, w - 30, 34, 'bold "Arial Narrow", Arial, sans-serif');
      c.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 38);
    });
  });
}

export function truckTex(text: string, sub: string, bg: string) {
  return canvasTex(512, 192, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, w - 40, 56, '900 Impact, sans-serif');
    c.fillText(text, w / 2, h * 0.42);
    fitText(c, sub, w - 60, 26, 'italic bold Georgia, serif');
    c.fillText(sub, w / 2, h * 0.76);
  });
}

export function softDot(color = '255,255,255') {
  return canvasTex(64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, `rgba(${color},1)`);
    g.addColorStop(0.4, `rgba(${color},0.5)`);
    g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
  });
}

export function polaroidTex() {
  return canvasTex(128, 150, (c, w, h) => {
    c.fillStyle = '#f7f3ea';
    c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, 110);
    g.addColorStop(0, '#ffb3c7');
    g.addColorStop(1, '#9a4dff');
    c.fillStyle = g;
    c.fillRect(10, 10, w - 20, 100);
    c.fillStyle = '#fff';
    c.font = '50px serif';
    c.textAlign = 'center';
    c.fillText('🐐', w / 2 - 18, 80);
    c.fillText('🥧', w / 2 + 22, 86);
    c.fillStyle = '#c00';
    c.font = 'italic bold 18px "Comic Sans MS", cursive';
    c.fillText('miss u ♥', w / 2, 135);
  });
}

export function deerSignTex() {
  return canvasTex(256, 256, (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.rotate(Math.PI / 4);
    c.fillStyle = '#ffd21a';
    c.fillRect(-85, -85, 170, 170);
    c.strokeStyle = '#111';
    c.lineWidth = 8;
    c.strokeRect(-78, -78, 156, 156);
    c.rotate(-Math.PI / 4);
    c.font = '96px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🦌', 0, -6);
    c.fillStyle = '#111';
    c.font = 'bold 18px sans-serif';
    c.fillText('GOOD LUCK', 0, 62);
  });
}

export const randomBillboard = () => Math.floor(Math.random() * BILLBOARDS.length);
export { pick };

/** grayscale noise for bump maps (plastic grain, leather) */
export function noiseTex(size = 256, scale = 1, kind: 'grain' | 'leather' = 'grain') {
  const t = canvasTex(size, size, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = Math.floor(i / w);
      let v = Math.random() * 255;
      if (kind === 'leather') {
        const cell = Math.sin(x * 0.35 * scale + Math.sin(y * 0.21 * scale) * 2) * Math.sin(y * 0.33 * scale + Math.sin(x * 0.17 * scale) * 2);
        v = 128 + cell * 90 + (Math.random() - 0.5) * 50;
      }
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function stickerTex(emoji: string, ring = '#ff2a2a') {
  return canvasTex(128, 128, (c, w) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w / 2, w / 2, 60, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = ring;
    c.lineWidth = 8;
    c.stroke();
    c.font = '72px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(emoji, w / 2, w / 2 + 4);
    c.strokeStyle = ring;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(24, 24);
    c.lineTo(104, 104);
    c.stroke();
  });
}

export function fireTex() {
  return canvasTex(64, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.6, h * 0.55);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.25, 'rgba(255,200,40,0.95)');
    g.addColorStop(0.55, 'rgba(255,70,0,0.6)');
    g.addColorStop(1, 'rgba(120,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.bezierCurveTo(w * 1.1, h * 0.5, w, h, w / 2, h);
    c.bezierCurveTo(0, h, -w * 0.1, h * 0.5, w / 2, 0);
    c.fill();
  });
}

/** retro neon sign: script-ish title + subtitle */
export function signTex2(title: string, sub: string, bg: string, fg: string) {
  return canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = fg;
    c.lineWidth = 6;
    c.strokeRect(14, 14, w - 28, h - 28);
    c.strokeRect(24, 24, w - 48, h - 48);
    c.fillStyle = fg;
    c.shadowColor = fg;
    c.shadowBlur = 18;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, title, w - 70, 64, 'italic 900 "Brush Script MT", "Bungee", Georgia, serif');
    c.fillText(title, w / 2, h * 0.44);
    c.shadowBlur = 0;
    fitText(c, sub, w - 90, 26, 'bold "VT323", monospace');
    c.fillText(sub, w / 2, h * 0.74);
  });
}
