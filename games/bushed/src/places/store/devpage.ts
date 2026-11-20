// src/places/store/dev.html: the round-5 places (Pruneau's, the forge lean-to, the campground) on heightAt terrain
// through the game's renderer and sky, for quick looks without booting the whole game. Playwright drives it with
// window.__shoot({ place, at, look, hour, frames }) (place-local coordinates) and reads draw calls / triangles.
//   ?only=store|forge|camp builds one place.
import * as THREE from 'three';
import { Renderer } from '../../gfx/renderer';
import { Sky } from '../../gfx/sky';
import { G } from '../../gfx/globals';
import { loadTex } from '../../gfx/tex';
import { heightAt, SPOTS } from '../../world/layout';
import type { Place } from '../kit';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[]; __shoot?: (v: Shot) => Promise<{ calls: number; tris: number }> };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
const canvas = document.getElementById('game') as HTMLCanvasElement;
const R = new Renderer(canvas);
R.pixel = Number(q.get('pixel') ?? 2);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 900);
const sky = new Sky(scene);
sky.shadowSize = 40;

function groundPatch(cx: number, cz: number, half: number, step: number): THREE.Mesh {
  const n = Math.round((half * 2) / step);
  const g = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, heightAt(x, z) - 0.02, z); uv.setXY(i, x / 2, z / 2); }
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, map: loadTex('terrain/forest_floor_albedo.png', { repeat: true }), normalMap: loadTex('terrain/forest_floor_normal.png', { repeat: true, srgb: false }) });
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

interface Shot { place: string; at: [number, number, number]; look: [number, number, number]; hour: number; frames?: number }
const frames: Record<string, THREE.Object3D> = {};
const places: Place[] = [];

async function main(): Promise<void> {
  const only = q.get('only');
  if (!only || only === 'store') {
    const { buildStore } = await import('../store');
    const st = await buildStore();
    scene.add(st.group); places.push(st); frames.store = st.group;
    scene.add(groundPatch(SPOTS.store.x, SPOTS.store.z, 50, 1));
  }
  if (!only || only === 'forge') {
    const { buildForge } = await import('../forge');
    const f = await buildForge();
    scene.add(f.group); places.push(f); frames.forge = f.group;
    scene.add(groundPatch(f.group.position.x, f.group.position.z, 20, 0.5));
  }
  if (!only || only === 'camp') {
    const { buildCampground } = await import('./campground');
    const c = buildCampground();
    scene.add(c.group); places.push(c); frames.camp = c.group;
    scene.add(groundPatch(SPOTS.campsite.x, SPOTS.campsite.z, 24, 0.5));
  }
  for (const p of places) p.group.traverse((o) => { o.userData.game = { hour: hour }; });
  W.__shoot = async (v: Shot) => {
    hour = v.hour;
    for (const p of places) p.group.traverse((o) => { if (o.userData.game) o.userData.game.hour = v.hour; });
    const f = frames[v.place];
    f.updateMatrixWorld(true);
    const at = new THREE.Vector3(...v.at).applyMatrix4(f.matrixWorld), look = new THREE.Vector3(...v.look).applyMatrix4(f.matrixWorld);
    camera.position.copy(at); camera.lookAt(look);
    for (let i = 0; i < (v.frames ?? 8); i++) { step(1 / 30); await new Promise((r) => setTimeout(r, 0)); }
    const gl = R.gl;
    gl.info.autoReset = false; gl.info.reset();
    step(1 / 30);
    const r = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
    gl.info.autoReset = true;
    return r;
  };
  (window as unknown as { __tris: (k: string) => Record<string, number> }).__tris = (k: string) => {
    const out: Record<string, number> = {};
    frames[k].traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry as THREE.BufferGeometry;
      const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * ((m as THREE.InstancedMesh).count ?? 1);
      const key = `${m.parent?.name ?? ''}/${m.name || (m.material as THREE.Material).name}${m.castShadow ? '*' : ''}`;
      out[key] = (out[key] ?? 0) + Math.round(n);
    });
    return out;
  };
  setTimeout(() => { W.__ready = true; }, 1500);
}

let hour = 13;
function step(dt: number): void {
  G.uTime.value += dt;
  G.uCamPos.value.copy(camera.position);
  for (const p of places) p.update(dt);
  sky.update(hour, camera.position, { cloud: 0.3, rain: 0, fog: 0.05, storm: 0 }, R.grade, G.uTime.value);
  R.sunDir.copy(sky.sunDir); R.sunColor.copy(sky.sun.color); R.fogColor.copy(sky.fogColor);
  R.render(scene, camera);
}
function onResize(): void { R.resize(); const [w, h] = R.internalSize; camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize);
onResize();
main().catch((e) => { W.__errors!.push(String(e?.stack ?? e)); W.__ready = true; });
