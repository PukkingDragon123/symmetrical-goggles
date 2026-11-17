// props.html: every converted prop in a grid under a warm key light + cool fill (or a night scene with a
// campfire-ish point light and a flashlight). Orbit with the mouse, click a prop to inspect it.
// URL params: ?cat=tool  ?id=wooden_axe  ?night=1  ?labels=0  ?tex=1 (texture sets)  ?jeep=1
//             ?cam=x,y,z,tx,ty,tz (camera + target)  ?yaw=deg (turn every prop)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadProp, PROP_META, type PropMeta } from '../places/props';
import { loadTex, applyPixelTex } from '../gfx/tex';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[]; __stats?: unknown };
W.__errors = [];

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none' });
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const night = q.get('night') === '1';
(document.getElementById('night') as HTMLInputElement).checked = night;
(document.getElementById('night') as HTMLInputElement).onchange = (e) => {
  q.set('night', (e.target as HTMLInputElement).checked ? '1' : '0'); location.search = q.toString();
};
const showLabels = q.get('labels') !== '0';
(document.getElementById('labels') as HTMLInputElement).checked = showLabels;
(document.getElementById('labels') as HTMLInputElement).onchange = (e) => {
  labels.domElement.style.display = (e.target as HTMLInputElement).checked ? '' : 'none';
};
if (!showLabels) labels.domElement.style.display = 'none';

// ---- lights
const key = new THREE.DirectionalLight(night ? 0x8fa6d8 : 0xffd2a0, night ? 0.25 : 2.6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const fill = new THREE.HemisphereLight(night ? 0x26324a : 0xa9bfd6, night ? 0x0d0b09 : 0x4a3b2c, night ? 0.25 : 0.9);
scene.add(fill);
const rim = new THREE.DirectionalLight(night ? 0x000000 : 0x9db7ff, night ? 0 : 0.6);
scene.add(rim, rim.target);
scene.background = new THREE.Color(night ? 0x07090d : 0x2b2620);
scene.fog = new THREE.Fog(scene.background as THREE.Color, 60, 180);
const fire = new THREE.PointLight(0xff8a3a, night ? 30 : 0, 12, 1.6);
fire.castShadow = night;
scene.add(fire);
const torch = new THREE.SpotLight(0xfff1d6, night ? 40 : 0, 25, 0.38, 0.5, 1.5);
camera.add(torch, torch.target);
torch.position.set(0.15, -0.1, 0);
torch.target.position.set(0, 0, -1);
scene.add(camera);

// ---- ground: the terrain forest-floor texture if present (also a check of the texture set)
const groundMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.95 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
{
  const probe = new Image();
  probe.onload = () => {
    const tile = 4; // metres per tile, see public/assets/textures/README.md
    const a = loadTex('terrain/forest_floor_albedo.png', { repeat: true });
    const n = loadTex('terrain/forest_floor_normal.png', { repeat: true, srgb: false });
    for (const t of [a, n]) t.repeat.set(400 / tile, 400 / tile);
    groundMat.map = a; groundMat.normalMap = n; groundMat.color.set(0xffffff); groundMat.needsUpdate = true;
  };
  probe.src = 'assets/textures/terrain/forest_floor_albedo.png';
}

// ---- layout
const CATS = ['tool', 'light', 'cabin', 'storage', 'outdoor', 'store'] as const;
const catSel = document.getElementById('cat') as HTMLSelectElement;
for (const c of CATS) catSel.add(new Option(c, c));
catSel.value = q.get('cat') ?? '';
catSel.onchange = () => { q.set('cat', catSel.value); q.delete('id'); q.delete('cam'); location.search = q.toString(); };

function label(text: string, cls = 'lbl'): CSS2DObject {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return new CSS2DObject(d);
}

const picked: THREE.Object3D[] = [];
const bounds = new THREE.Box3();

async function layoutProps(ids: string[]): Promise<void> {
  const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 0));
  let z = 0;
  const byCat = new Map<string, string[]>();
  for (const id of ids) {
    const c = PROP_META[id]?.category ?? 'misc';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(id);
  }
  const objs = await Promise.all(ids.map((id) => loadProp(id).catch((e) => { W.__errors!.push(`${id}: ${e}`); return null; })));
  const objOf = new Map(ids.map((id, i) => [id, objs[i]]));
  for (const [cat, list] of byCat) {
    list.sort((a, b) => PROP_META[a].size[1] - PROP_META[b].size[1]);
    // rows about as wide as the category is deep: a compact block per category
    const area = list.reduce((s, id) => {
      const m = PROP_META[id].size;
      return s + (Math.max(m[0], m[2], 0.25) + 0.35) * (Math.max(m[2], 0.25) + 0.6);
    }, 0);
    const maxRow = q.get('id') ? 1e9 : Math.max(1.5, Math.sqrt(area) * 1.7);
    const cl = label(cat.toUpperCase(), 'lbl cat');
    cl.position.set(-1.2, 0.05, z);
    scene.add(cl);
    let x = 0, rowDepth = 0, rowW = 0;
    for (const id of list) {
      const o = objOf.get(id);
      if (!o) continue;
      const s = PROP_META[id].size;
      const w = Math.max(s[0], s[2], 0.25);
      if (rowW > 0 && rowW + w > maxRow) { z += rowDepth + 0.6; x = 0; rowW = 0; rowDepth = 0; }
      o.rotation.y = yaw;
      o.position.set(x + w / 2, 0, z + Math.max(s[2], 0.25) / 2);
      scene.add(o);
      picked.push(o);
      const l = label(PROP_META[id].name);
      l.position.set(0, s[1] + 0.06, 0);
      o.add(l);
      x += w + 0.35;
      rowW = x;
      rowDepth = Math.max(rowDepth, Math.max(s[2], 0.25));
    }
    z += rowDepth + 1.4;
  }
  for (const o of picked) bounds.expandByObject(o);
}

function frame(box: THREE.Box3, dirv = new THREE.Vector3(0.55, 0.55, 1)): void {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.08);
  const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.9;
  camera.position.copy(c).addScaledVector(dirv.normalize(), d);
  controls.target.copy(c);
  camera.near = Math.max(0.005, d / 200);
  camera.updateProjectionMatrix();
}

function placeLights(box: THREE.Box3): void {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
  key.position.copy(c).add(new THREE.Vector3(-0.6, 1.0, 0.7).multiplyScalar(r * 1.2));
  key.target.position.copy(c);
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.near = 0.1; cam.far = r * 4;
  cam.updateProjectionMatrix();
  rim.position.copy(c).add(new THREE.Vector3(0.8, 0.5, -0.9).multiplyScalar(r));
  rim.target.position.copy(c);
  fire.position.set(c.x, 0.6, box.max.z + 0.8);
  fire.distance = Math.max(12, r * 1.5);
}

// ---- inspect
const info = document.getElementById('info')!;
function describe(id: string, m: PropMeta): string {
  return `${m.name}  [${id}]\n${m.category}  ${m.size.map((v) => v.toFixed(2)).join(' x ')} m  ${m.mass} kg\n`
    + `${m.tris} tris  collider ${m.collider}${m.hull ? ` (${m.hull.length / 3} pts)` : ''}  rough ${m.rough}`
    + `${m.price != null ? `  $${m.price}` : ''}\n${m.desc ?? ''}`;
}
const ray = new THREE.Raycaster();
renderer.domElement.addEventListener('dblclick', (e) => {
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(picked, true)[0];
  if (!hit) return;
  let o: THREE.Object3D | null = hit.object;
  while (o && !o.userData.propId) o = o.parent;
  if (!o) return;
  info.textContent = describe(o.userData.propId, PROP_META[o.userData.propId]);
  frame(new THREE.Box3().setFromObject(o));
});
info.textContent = 'double-click a prop to inspect it';

// ---- texture sets (?tex=1): every albedo + normal pair on a 2 x 2 m bevelled slab and a 1 m sphere
async function layoutTextures(): Promise<void> {
  const res = await fetch('assets/textures/index.json').catch(() => null);
  if (!res || !res.ok) { W.__errors!.push('no assets/textures/index.json'); return; }
  const idx = (await res.json()) as { set: string; name: string; tile: number }[];
  let i = 0;
  for (const t of idx) {
    const a = loadTex(`${t.set}/${t.name}_albedo.png`, { repeat: true });
    const n = loadTex(`${t.set}/${t.name}_normal.png`, { repeat: true, srgb: false });
    const mat = new THREE.MeshStandardMaterial({ map: a, normalMap: n, roughness: 0.9 });
    const slabW = 3;
    const g = new THREE.PlaneGeometry(slabW, slabW, 1, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * slabW / t.tile, uv.getY(k) * slabW / t.tile);
    const slab = new THREE.Mesh(g, mat);
    const col = i % 6, row = Math.floor(i / 6);
    slab.position.set(col * 3.6, 0.01, row * 4.2);
    slab.rotation.x = -Math.PI / 2;
    slab.receiveShadow = true;
    scene.add(slab);
    const wall = new THREE.Mesh(g.clone(), mat);
    wall.position.set(col * 3.6, slabW / 2, row * 4.2 - slabW / 2);
    wall.receiveShadow = true;
    scene.add(wall);
    const l = label(`${t.set}/${t.name} (${t.tile} m)`);
    l.position.set(col * 3.6, 0.1, row * 4.2 + slabW / 2 + 0.2);
    scene.add(l);
    picked.push(slab, wall);
    i++;
  }
  for (const o of picked) bounds.expandByObject(o);
}

// ---- the Jeep (?jeep=1): spins the wheels and steering wheel to prove the node pivots
const spinners: { o: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[] = [];
async function layoutJeep(): Promise<void> {
  const files = (q.get('jeepfiles') ?? 'jeep').split(',');
  let x = 0;
  for (const f of files) {
    const g = await new GLTFLoader().loadAsync(`assets/models/${f}.glb`).catch((e) => { W.__errors!.push(`${f}: ${e}`); return null; });
    if (!g) continue;
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) { const s = mat as THREE.MeshStandardMaterial; if (s.map) applyPixelTex(s.map); }
        m.castShadow = m.receiveShadow = true;
      }
      if (/^wheel_/.test(o.name)) spinners.push({ o, axis: 'x', speed: q.get('spin') === '1' ? 3 : 0 });
      if (o.name === 'steering_wheel') spinners.push({ o, axis: 'z', speed: q.get('spin') === '1' ? 1 : 0 });
    });
    const b = new THREE.Box3().setFromObject(g.scene);
    g.scene.position.x = x - b.min.x;
    x += b.getSize(new THREE.Vector3()).x + 1.5;
    scene.add(g.scene);
    picked.push(g.scene);
    const l = label(f);
    l.position.set(0, b.max.y + 0.2, 0);
    g.scene.add(l);
  }
  for (const o of picked) bounds.expandByObject(o);
}

// ---- go
async function main(): Promise<void> {
  if (q.get('tex') === '1') await layoutTextures();
  else if (q.get('jeep') === '1') await layoutJeep();
  else {
    let ids = Object.keys(PROP_META);
    const cat = q.get('cat');
    if (cat) ids = ids.filter((id) => PROP_META[id].category === cat);
    const one = q.get('id');
    if (one) ids = one.split(',');
    await layoutProps(ids);
    document.getElementById('count')!.textContent = `${ids.length} props`;
    if (one && ids.length === 1) info.textContent = describe(one, PROP_META[one]);
  }
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  placeLights(bounds);
  const cam = q.get('cam');
  if (cam) {
    const v = cam.split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]);
    controls.target.set(v[3], v[4], v[5]);
    camera.near = 0.01; camera.updateProjectionMatrix();
  } else frame(bounds, q.get('id') || q.get('jeep') ? new THREE.Vector3(0.7, 0.45, 1) : new THREE.Vector3(0.25, 0.75, 1));
  controls.update();
  // let textures upload, then signal screenshot scripts
  renderer.render(scene, camera);
  setTimeout(() => {
    if (q.get('still') === '1') {   // screenshot scripts: draw one frame and stop the loop (SwiftShader is slow)
      renderer.setAnimationLoop(null);
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    }
    W.__ready = true;
  }, 300);
}
main().catch((e) => { W.__errors!.push(String(e)); W.__ready = true; });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});
const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = timer.getDelta();
  for (const s of spinners) s.o.rotation[s.axis] += s.speed * dt;
  if (night) fire.intensity = 26 + Math.sin(performance.now() * 0.013) * 3 + Math.sin(performance.now() * 0.031) * 2;
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
