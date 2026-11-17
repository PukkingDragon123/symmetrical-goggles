import * as THREE from 'three';
import { Renderer } from './gfx/renderer';
import { Sky } from './gfx/sky';
import { G } from './gfx/globals';
import { Terrain } from './world/terrain';
import { makeLake } from './world/water';
import { physics } from './physics/physics';
import { Player } from './player/player';
import { input } from './core/input';
import { marks } from './world/marks';
import { SPOTS } from './world/layout';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const R = new Renderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.08, 1400);
const sky = new Sky(scene);
const terrain = new Terrain();
terrain.loadDefault();
scene.add(terrain.group, makeLake());
const params = new URLSearchParams(location.search);
let hour = Number(params.get('hour') ?? 17.8);

async function boot() {
  await physics.init();
  const player = new Player(camera);
  const sx = Number(params.get('x') ?? SPOTS.cabin.x - 20), sz = Number(params.get('z') ?? SPOTS.cabin.z - 10);
  physics.ensureGround(sx, sz);
  player.init(sx, sz, Number(params.get('yaw') ?? 0));
  player.pitch = Number(params.get('pitch') ?? 0);
  terrain.prime(new THREE.Vector3(sx, 0, sz));
  input.attach(canvas);
  canvas.addEventListener('click', () => input.lock());
  const onResize = () => { R.resize(); const [w, h] = R.internalSize; camera.aspect = w / h; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', onResize); onResize();

  let last = performance.now();
  (window as any).__game = { player, sky, R, scene, camera, setHour: (h: number) => (hour = h) };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    G.uTime.value += dt;
    if (params.has('timelapse')) hour = (hour + dt * 0.5) % 24;
    physics.streamTerrain([{ x: player.pos.x, z: player.pos.z }]);
    physics.update(dt, () => {});
    player.update(dt);
    G.uCamPos.value.copy(camera.position);
    terrain.update(camera.position, 2);
    marks.follow(player.pos.x, player.pos.z); marks.flush();
    sky.update(hour, player.pos, { cloud: 0.35, rain: 0, fog: 0.3, storm: 0 }, R.grade, G.uTime.value);
    R.sunDir.copy(sky.sunDir); R.sunColor.copy(sky.sun.color); R.fogColor.copy(sky.fogColor);
    R.render(scene, camera);
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot();
