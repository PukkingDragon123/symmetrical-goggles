// webs_dev.html: spider webs in the real forest (src/world/forest.ts trees, the game's renderer and sky), for looks.
//   window.__webs.make(kind) spawns a web near the stand-in player ('branch' | 'trunk'), returns its index
//   window.__webs.shoot({ web, hour, back, side, up, flash, frames }) frames the camera on web n and renders
import * as THREE from 'three';
import { Renderer } from '../../gfx/renderer';
import { Sky } from '../../gfx/sky';
import { G } from '../../gfx/globals';
import { loadTex } from '../../gfx/tex';
import { heightAt } from '../layout';
import { Forest } from '../forest';
import { Bugs, type BugWorld, type TreeLike } from './bugs';
import { webLight } from './webs';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[]; __webs?: unknown };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
const canvas = document.getElementById('game') as HTMLCanvasElement;
const R = new Renderer(canvas);
R.pixel = Number(q.get('pixel') ?? 2);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 900);
const sky = new Sky(scene);
sky.shadowSize = 30;
const X = Number(q.get('x') ?? 40), Z = Number(q.get('z') ?? 60);

function groundPatch(cx: number, cz: number, half: number, step: number): THREE.Mesh {
  const n = Math.round((half * 2) / step);
  const g = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, heightAt(x, z) - 0.02, z); uv.setXY(i, x / 2, z / 2); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95, map: loadTex('terrain/forest_floor_albedo.png', { repeat: true }), normalMap: loadTex('terrain/forest_floor_normal.png', { repeat: true, srgb: false }) }));
  m.receiveShadow = true;
  return m;
}

let hour = 13, flashOn = false;
const bugs = new Bugs();
bugs.forced = { spider: 0 };
scene.add(bugs.object, groundPatch(X, Z, 40, 1));
const forest = new Forest(scene, camera, R.gl, { far: 90, shadow: 30 });
forest.prewarm(X, Z, 60);
const player = { pos: new THREE.Vector3(X, heightAt(X, Z), Z), eye: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), speed: 0 };
const bw: BugWorld = {
  dt: 0, time: 0, hour: 13, player, heightAt, waterY: -100, lake: { x: 9999, z: 9999, r: 1 }, lights: [], flash: null,
  stands: (x, z, r) => forest.stands(x, z, r), solids: () => [], open: () => 0, warmth: 1, rain: 0, swat: false,
  say: () => {}, swatted: () => {}, trees: (x, z, r) => forest.near(x, z, r) as unknown as TreeLike[],
};
const webs: { hub: THREE.Vector3; normal: THREE.Vector3; radius: number }[] = [];

function step(dt: number): void {
  G.uTime.value += dt;
  G.uCamPos.value.copy(camera.position);
  G.uWindStrength.value = 0.35;
  bw.dt = dt; bw.time += dt; bw.hour = hour;
  player.eye.copy(camera.position);
  camera.getWorldDirection(player.dir);
  webLight(flashOn, camera.position, player.dir, hour, 0, R.internalSize[1]);
  bugs.update(bw);
  forest.update(dt);
  sky.update(hour, camera.position, { cloud: 0.25, rain: 0, fog: 0.05, storm: 0 }, R.grade, G.uTime.value);
  R.sunDir.copy(sky.sunDir); R.sunColor.copy(sky.sun.color); R.fogColor.copy(sky.fogColor);
  R.render(scene, camera);
}

(window as unknown as { __bugs: unknown }).__bugs = bugs;
W.__webs = {
  make(kind: 'branch' | 'trunk' = 'branch', x = X, z = Z, spider = true) { const w = bugs.webAt(bw, x, z, kind, spider); if (!w) return -1; webs.push(w); return webs.length - 1; },
  /** frame web n: `back` metres out along its normal, `side` across, `up` above the hub */
  async shoot(o: { web: number; hour: number; back?: number; side?: number; up?: number; flash?: boolean; frames?: number; look?: number }) {
    hour = o.hour; flashOn = !!o.flash;
    const w = webs[o.web];
    const n = w.normal.clone();
    // look from the side the sun (or the flashlight) makes it glint from: the camera on the far side of the light
    const s = new THREE.Vector3(-n.z, 0, n.x);
    camera.position.copy(w.hub).addScaledVector(n, o.back ?? 1.3).addScaledVector(s, o.side ?? 0.3);
    camera.position.y += o.up ?? 0.05;
    camera.lookAt(w.hub.clone().addScaledVector(s, o.look ?? 0));
    // the stand-in player stays put (moving it through a web would break it)
    for (let i = 0; i < (o.frames ?? 6); i++) { step(1 / 30); await new Promise((r) => setTimeout(r, 0)); }
    return { hub: w.hub.toArray(), n: w.normal.toArray(), r: w.radius };
  },
  /** walk into web n: it collapses (the moorings stay hanging) */
  tear(i: number) { const w = (bugs as unknown as { webs: { mesh: { hub: THREE.Vector3 }; broke: number }[] }).webs.find((o) => o.mesh.hub === webs[i].hub); if (w) w.broke = 0.01; },
  get count() { return webs.length; },
};
function onResize(): void { R.resize(); const [w, h] = R.internalSize; camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize);
onResize();
camera.position.set(X, heightAt(X, Z) + 1.6, Z + 3);
camera.lookAt(X, heightAt(X, Z) + 1.4, Z);
for (let i = 0; i < 4; i++) step(1 / 30);
setTimeout(() => { W.__ready = true; }, 1000);
