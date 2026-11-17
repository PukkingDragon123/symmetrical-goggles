// The barrel stove: a 45-gallon drum on cast-iron cradle legs with a cast door kit (spin draft), flue collar and
// stovepipe with a damper. Fire: an ember bed, flame cards inside the barrel, glow leaking through the door gap
// and draft holes, and a flickering shadow-casting light in front of the door. setFire(level 0..1).
// Frame: barrel axis along Z, door toward +Z, origin on the floor under the barrel centre.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, lathe, tube, flicker, shadowy } from './kit';
import { flameCards } from './fixtures';
import { registerInteractable } from '../game/interact';

export interface Stove {
  group: THREE.Group;
  light: THREE.PointLight;
  setFire(level: number): void;
  update(dt: number): void;
  /** world-ish local anchors */
  door: THREE.Object3D;
  fire: THREE.Object3D;
  top: THREE.Object3D;
  level: number;
}

const R = 0.29, L = 0.86, AXIS_Y = 0.56;
export const STOVE = { R, L, AXIS_Y };

export function buildStove(o: { pipeTop: number; seed?: number; legs?: number }): Stove {
  const r = new Rand(o.seed ?? 9);
  const group = new THREE.Group();
  group.name = 'stove';
  const ms = new Mesher();
  const ay = o.legs ?? AXIS_Y;
  // ---- drum: lathe about Y rotated so lathe +Y = +Z (door end). Outer skin, inner skin (seen through the
  // open door), back end disc; the front end is the cast faceplate with the door opening.
  const dw = 0.3, dh = 0.25;
  const hz = L / 2;
  ms.push(new THREE.Matrix4().makeTranslation(0, ay, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  {
    const ridge = (z: number) => [[R, z - 0.018], [R + 0.012, z - 0.006], [R + 0.012, z + 0.006], [R, z + 0.018]] as [number, number][];
    const prof: [number, number][] = [[0, -hz], [R - 0.02, -hz], [R + 0.008, -hz + 0.008], [R, -hz + 0.03]];
    prof.push(...ridge(-L / 6), ...ridge(L / 6));
    prof.push([R, hz - 0.02], [R + 0.01, hz - 0.006], [R + 0.01, hz]);
    lathe(ms, 'iron', prof, 20, { phase: r.range(0, 1) });
    // inner skin (normals inward): reversed profile, slightly smaller
    const ri = R - 0.008;
    lathe(ms, 'iron', [[ri, hz], [ri, -hz + 0.01], [0, -hz + 0.01]].reverse().map(([a, b]) => [a, b] as [number, number]).reverse(), 14);
  }
  ms.pop();
  // ---- door kit on the front (+Z) end: cast faceplate with the door opening, hinge pins
  const fz = hz + 0.004;
  ms.pushT(0, ay, hz);
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R + 0.008, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.moveTo(-dw / 2, -dh / 2); hole.lineTo(-dw / 2, dh / 2); hole.lineTo(dw / 2, dh / 2); hole.lineTo(dw / 2, -dh / 2); hole.lineTo(-dw / 2, -dh / 2);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false, curveSegments: 10 });
    ms.geom('iron', g);
    g.dispose();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      boxAt(ms, 'iron', Math.cos(a) * (R - 0.035), Math.sin(a) * (R - 0.035), 0.018, 0.018, 0.018, 0.012);
    }
    // raised lip around the opening
    boxAt(ms, 'iron', 0, dh / 2 + 0.02, 0.024, dw + 0.06, 0.035, 0.02);
    boxAt(ms, 'iron', 0, -dh / 2 - 0.02, 0.024, dw + 0.06, 0.035, 0.02);
    boxAt(ms, 'iron', -dw / 2 - 0.02, 0, 0.024, 0.035, dh + 0.04, 0.02);
    boxAt(ms, 'iron', dw / 2 + 0.02, 0, 0.024, 0.035, dh + 0.04, 0.02);
    // hinge pins on the left
    for (const y of [-0.07, 0.07]) {
      ms.pushT(-dw / 2 - 0.05, y, 0.03);
      lathe(ms, 'iron', [[0, -0.03], [0.012, -0.03], [0.012, 0.03], [0, 0.03]], 6);
      ms.pop();
    }
  }
  ms.pop();
  // ---- flue collar on top, toward the back
  const fx = 0, fzc = -L / 2 + 0.2;
  ms.pushT(fx, ay + R - 0.02, fzc);
  lathe(ms, 'iron', [[0.105, 0], [0.105, 0.02], [0.082, 0.03], [0.08, 0.1]], 14);
  ms.pop();
  // ---- stovepipe up to pipeTop with a damper and crimped joints every 0.6 m
  const pr = 0.075;
  const py0 = ay + R + 0.08, py1 = o.pipeTop;
  {
    const prof2: [number, number][] = [[pr, py0]];
    for (let y = py0 + 0.6; y < py1 - 0.1; y += 0.6) prof2.push([pr, y - 0.02], [pr + 0.006, y - 0.01], [pr + 0.006, y + 0.01], [pr, y + 0.02]);
    prof2.push([pr, py1]);
    ms.pushT(fx, 0, fzc);
    lathe(ms, 'iron', prof2, 12);
    // damper handle
    ms.pushT(0, py0 + 0.45, 0);
    boxAt(ms, 'iron', pr + 0.06, 0, 0, 0.12, 0.012, 0.012);
    tube(ms, 'iron', [V(pr + 0.11, 0, -0.03), V(pr + 0.13, 0, 0), V(pr + 0.11, 0, 0.03)], 0.007, 5);
    ms.pop();
    ms.pop();
  }
  const body = ms.build({ name: 'stove_body' });
  group.add(body);

  // ---- door (separate: it can swing), with a spin-draft disc and holes
  const doorPivot = new THREE.Group();
  doorPivot.name = 'stove_door';
  doorPivot.position.set(-dw / 2 - 0.05, ay, fz + 0.03);
  const dms = new Mesher();
  {
    // door plate with a round draft opening (holes)
    const sh = new THREE.Shape();
    const x0 = 0.02, x1 = dw + 0.06;
    sh.moveTo(x0, -dh / 2 - 0.01); sh.lineTo(x1, -dh / 2 - 0.01); sh.lineTo(x1, dh / 2 + 0.01); sh.lineTo(x0, dh / 2 + 0.01); sh.lineTo(x0, -dh / 2 - 0.01);
    const cx = (x0 + x1) / 2 + 0.01;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const hole = new THREE.Path();
      hole.absarc(cx + Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.014, 0, Math.PI * 2, true);
      sh.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: false, curveSegments: 6 });
    dms.geom('iron', g);
    g.dispose();
    // raised border ribs + a cast "sunburst" boss
    boxAt(dms, 'iron', (x0 + x1) / 2, dh / 2 - 0.01, 0.022, x1 - x0 - 0.02, 0.016, 0.012);
    boxAt(dms, 'iron', (x0 + x1) / 2, -dh / 2 + 0.01, 0.022, x1 - x0 - 0.02, 0.016, 0.012);
    // spin draft disc (partly covering the holes)
    dms.pushT(cx, 0, 0.026, 0, Math.PI / 2);
    lathe(dms, 'iron', [[0, 0], [0.072, 0], [0.072, 0.006], [0.02, 0.012], [0, 0.03]], 12);
    dms.pop();
    // handle: a coil spring grip
    const hx = x1 - 0.03;
    tube(dms, 'iron', [V(hx, 0.05, 0.02), V(hx + 0.01, 0.04, 0.06), V(hx + 0.01, -0.04, 0.06), V(hx, -0.05, 0.02)], 0.008, 6);
    // hinge straps
    boxAt(dms, 'iron', 0.04, 0.07, 0.008, 0.06, 0.02, 0.012);
    boxAt(dms, 'iron', 0.04, -0.07, 0.008, 0.06, 0.02, 0.012);
  }
  const doorMesh = dms.build({ name: 'stove_door_mesh' });
  doorPivot.add(doorMesh);
  group.add(doorPivot);

  // ---- fire: glow plane behind the door (leaks through gaps/holes), embers, flames
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1.0, 0.42, 0.12), emissiveIntensity: 0, roughness: 1 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(dw + 0.04, dh + 0.04), glowMat);
  glow.position.set(0, ay, fz + 0.012);
  group.add(glow);
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: new THREE.Color(1.0, 0.35, 0.08), emissiveIntensity: 0, roughness: 1 });
  const ember = new THREE.Mesh(new THREE.BoxGeometry(R * 1.3, 0.06, L * 0.8), emberMat);
  ember.position.set(0, ay - R + 0.08, 0);
  group.add(ember);
  const flames = new THREE.Group();
  const fl1 = flameCards(0.22, 0.3, 1), fl2 = flameCards(0.18, 0.26, 2), fl3 = flameCards(0.2, 0.22, 3);
  fl1.position.set(0, ay - R + 0.1, 0.18);
  fl2.position.set(-0.08, ay - R + 0.1, 0.05);
  fl3.position.set(0.07, ay - R + 0.1, -0.1);
  flames.add(fl1, fl2, fl3);
  group.add(flames);

  const light = new THREE.PointLight(0xff8a3c, 0, 9, 1.8);
  light.position.set(0, ay - 0.02, fz + 0.28);
  shadowy(light, 512, -0.004);
  light.shadow.camera.far = 9;
  group.add(light);

  const door = new THREE.Object3D(); door.name = 'stove_door_anchor'; door.position.set(0, ay, fz + 0.1); group.add(door);
  const fire = new THREE.Object3D(); fire.name = 'stove_fire'; fire.position.set(0, ay - 0.1, 0.05); group.add(fire);
  const top = new THREE.Object3D(); top.name = 'stove_top'; top.position.set(0, ay + R, 0.1); group.add(top);

  let t = 0;
  let doorOpen = 0, doorTarget = 0;
  const st: Stove = {
    group, light, door, fire, top, level: 0.7,
    setFire(level: number) { st.level = Math.max(0, Math.min(1, level)); },
    update(dt: number) {
      t += dt;
      const f = flicker(t, 3.1);
      const lv = st.level;
      glowMat.emissiveIntensity = lv * 3.2 * f;
      glow.visible = doorOpen < 0.25;
      emberMat.emissiveIntensity = (0.25 + lv * 1.6) * (0.9 + 0.1 * Math.sin(t * 2.3));
      fl1.userData.tick(dt, lv); fl2.userData.tick(dt, lv * 0.9); fl3.userData.tick(dt, lv * 0.8);
      light.intensity = (0.4 + 5.5 * lv) * f * (1 + doorOpen * 0.8);
      doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 6);
      doorPivot.rotation.y = -doorOpen * 1.9;
    },
  };
  registerInteractable(doorPivot, {
    kind: 'stove',
    label: () => (doorTarget > 0 ? 'Close the stove' : 'Open the stove'),
    use: (ctx) => { doorTarget = doorTarget > 0 ? 0 : 1; ctx.game?.placeAction?.('stove_door', ctx); },
    alt: (ctx) => ctx.game?.placeAction?.('stove_feed', ctx),
    altLabel: () => 'Feed the fire',
  });
  registerInteractable(body, {
    kind: 'stove',
    label: () => 'Feed the fire',
    use: (ctx) => ctx.game?.placeAction?.('stove_feed', ctx),
  });
  st.setFire(0.7);
  return st;
}
