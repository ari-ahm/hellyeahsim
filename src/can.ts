import * as THREE from 'three';
import * as Art from './art';
import { pbr } from './util';

// A 355ml can of HELL YEAH LAGER, accurate down to the rivet. Local frame: +Y = top, opening faces +Z.
export interface Can {
  group: THREE.Group;
  tab: THREE.Group;
  flap: THREE.Group;
  reset(): void;
}

const V2 = (r: number, y: number) => new THREE.Vector2(r, y);

export function makeCan(): Can {
  const g = new THREE.Group();
  const alu = pbr(0xc9cdd6, 0.32, 1, { envMapIntensity: 0.35 });
  const aluSat = pbr(0xa7acb6, 0.45, 1, { envMapIntensity: 0.3 });
  const label = pbr(0xffffff, 0.38, 0.3, { map: Art.beerLabel(), clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.35 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.095, 64, 1, true), label);
  body.position.y = -0.0025;
  g.add(body);

  // domed bottom with standing ring
  const bottom = new THREE.Mesh(
    new THREE.LatheGeometry(
      [V2(0.0001, -0.049), V2(0.008, -0.0495), V2(0.015, -0.0515), V2(0.0205, -0.0555), V2(0.0232, -0.0595), V2(0.0248, -0.0612),
        V2(0.0266, -0.0606), V2(0.0292, -0.0575), V2(0.0318, -0.0535), V2(0.033, -0.0498)],
      64,
    ),
    alu,
  );
  bottom.material = alu.clone();
  (bottom.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
  g.add(bottom);

  // shoulder, neck and rolled lip
  const shoulder = new THREE.Mesh(
    new THREE.LatheGeometry(
      [V2(0.033, 0.0445), V2(0.0326, 0.0495), V2(0.0312, 0.0542), V2(0.0293, 0.0582), V2(0.0277, 0.0603), V2(0.0273, 0.0614),
        V2(0.0281, 0.0624), V2(0.0291, 0.0637), V2(0.0287, 0.0651), V2(0.0273, 0.0657), V2(0.0263, 0.0648), V2(0.0258, 0.0626), V2(0.0256, 0.0614)],
      64,
    ),
    alu.clone(),
  );
  (shoulder.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
  g.add(shoulder);

  // lid with the scored opening
  const LID_Y = 0.0613;
  const OPEN = { cz: 0.0128, rx: 0.0068, rz: 0.0086 };
  const lidShape = new THREE.Shape();
  lidShape.absarc(0, 0, 0.0257, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absellipse(0, -OPEN.cz, OPEN.rx, OPEN.rz, 0, Math.PI * 2, true, 0);
  lidShape.holes.push(hole);
  const lidGeo = new THREE.ShapeGeometry(lidShape, 48);
  lidGeo.rotateX(-Math.PI / 2);
  const lid = new THREE.Mesh(lidGeo, aluSat);
  lid.position.y = LID_Y;
  g.add(lid);
  // the bead ring pressed into the lid
  const bead = new THREE.Mesh(new THREE.TorusGeometry(0.0222, 0.0007, 6, 64), aluSat);
  bead.rotation.x = Math.PI / 2;
  bead.position.y = LID_Y + 0.0002;
  g.add(bead);
  // score line around the opening
  const score = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 48), pbr(0x6d727c, 0.5, 1));
  score.scale.set(OPEN.rx + 0.0005, OPEN.rz + 0.0005, 0.0006);
  score.rotation.x = Math.PI / 2;
  score.position.set(0, LID_Y + 0.0003, OPEN.cz);
  g.add(score);
  // what's inside: beer, gold, darkness
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.0255, 32), pbr(0x3a1e02, 0.08, 0, { emissive: 0x1a0c00 }));
  inside.rotation.x = -Math.PI / 2;
  inside.position.y = LID_Y - 0.006;
  g.add(inside);

  // flap: hinged at the rivet side of the opening, folds into the can
  const flapShape = new THREE.Shape();
  flapShape.absellipse(0, -OPEN.cz, OPEN.rx, OPEN.rz, 0, Math.PI * 2, false, 0);
  const flapGeo = new THREE.ShapeGeometry(flapShape, 32);
  flapGeo.rotateX(-Math.PI / 2);
  const hingeZ = OPEN.cz - OPEN.rz;
  flapGeo.translate(0, 0, -hingeZ);
  const flap = new THREE.Group();
  flap.position.set(0, LID_Y - 0.0001, hingeZ);
  const flapM = new THREE.Mesh(flapGeo, aluSat.clone());
  (flapM.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
  flap.add(flapM);
  g.add(flap);

  // rivet + ring-pull tab
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0026, 0.0014, 16), alu);
  rivet.position.y = LID_Y + 0.0009;
  g.add(rivet);
  const tabShape = new THREE.Shape();
  const w = 0.0066, y0 = -0.0062, y1 = 0.0215, rr = 0.0045;
  tabShape.moveTo(-w + rr, y0);
  tabShape.lineTo(w - rr, y0);
  tabShape.quadraticCurveTo(w, y0, w, y0 + rr);
  tabShape.lineTo(w, y1 - rr);
  tabShape.quadraticCurveTo(w, y1, w - rr, y1);
  tabShape.lineTo(-w + rr, y1);
  tabShape.quadraticCurveTo(-w, y1, -w, y1 - rr);
  tabShape.lineTo(-w, y0 + rr);
  tabShape.quadraticCurveTo(-w, y0, -w + rr, y0);
  const ring = new THREE.Path();
  ring.absellipse(0, 0.0128, 0.0043, 0.0049, 0, Math.PI * 2, true, 0);
  tabShape.holes.push(ring);
  const slot = new THREE.Path();
  slot.absellipse(0, 0.0025, 0.0028, 0.0011, 0, Math.PI * 2, true, 0);
  tabShape.holes.push(slot);
  const tabGeo = new THREE.ExtrudeGeometry(tabShape, { depth: 0.0007, bevelEnabled: true, bevelSize: 0.0003, bevelThickness: 0.0003, bevelSegments: 2, curveSegments: 16 });
  tabGeo.rotateX(-Math.PI / 2);
  const tab = new THREE.Group();
  tab.position.set(0, LID_Y + 0.0016, 0);
  tab.add(new THREE.Mesh(tabGeo, alu));
  g.add(tab);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    group: g,
    tab,
    flap,
    reset() {
      tab.rotation.x = 0;
      flap.rotation.x = 0;
      g.scale.set(1, 1, 1);
    },
  };
}
