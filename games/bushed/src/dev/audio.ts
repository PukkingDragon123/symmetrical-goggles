// Audio test page: every sound with play buttons, an ambience mixer, the world state that drives the wildlife
// scheduler, reverb zones, category volumes, and a moving 3D source around a rotatable listener (top-down view).
import * as THREE from 'three';
import { audio, AMBIENCES, WILDLIFE, type Voice, type ReverbZone } from '../audio/audio';
import { SOUNDS, type SoundCat } from '../audio/bank';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ------------------------------------------------------------------ listener + 3D test state
const cam = new THREE.PerspectiveCamera();
cam.position.set(0, 1.7, 0);
let heading = 0; // radians, 0 = facing -Z (north / up on the canvas)
const src = { on: false, id: 'veh_idle', radius: 8, speed: 0.35, angle: 0, height: 1, voice: null as Voice | null, every: 1.2, timer: 0 };
let wall = false;
const spawns: { id: string; x: number; z: number; t: number }[] = [];
audio.onWildlife = (id, p) => spawns.push({ id, x: p.x - cam.position.x, z: p.z - cam.position.z, t: performance.now() });

// occlusion: a wall 3 m east of the listener, from z = -6 to z = +6 (only when enabled)
audio.setOcclusion((p) => {
  if (!wall) return 0;
  const a = cam.position;
  const wx = a.x + 3;
  if ((a.x - wx) * (p.x - wx) >= 0) return 0;
  const t = (wx - a.x) / (p.x - a.x);
  const z = a.z + (p.z - a.z) * t;
  return Math.abs(z - a.z) < 6 ? 1 : 0;
});

// ------------------------------------------------------------------ sound list
const groups = new Map<string, string[]>();
for (const id of Object.keys(SOUNDS)) {
  const dir = SOUNDS[id].files[0].split('/')[2];
  if (!groups.has(dir)) groups.set(dir, []);
  groups.get(dir)!.push(id);
}
const loops = new Map<string, Voice>();
const listEl = $('#sounds');
function play(id: string, variant?: number): void {
  const d = SOUNDS[id];
  if (d.loop) {
    const cur = loops.get(id);
    if (cur) { cur.stop(0.3); loops.delete(id); refreshLoopButtons(); return; }
    const v = audio.play(id, { variant, fadeIn: 0.2 });
    if (v) loops.set(id, v);
    refreshLoopButtons();
    return;
  }
  audio.play(id, { variant });
}
const loopBtns = new Map<string, HTMLButtonElement>();
function refreshLoopButtons(): void {
  for (const [id, b] of loopBtns) b.classList.toggle('on', loops.has(id));
}
for (const [dir, ids] of groups) {
  listEl.append(el('h2', { textContent: dir }));
  for (const id of ids) {
    const d = SOUNDS[id];
    const row = el('div', { className: 'row' });
    row.dataset.key = `${dir} ${id}`;
    row.append(el('span', { className: 'id', textContent: id }),
      el('span', { className: 'meta', textContent: `${d.cat}${d.loop ? ' loop' : ''}${d.spatial ? ' 3d' : ''} v${d.vol}` }));
    if (d.loop) {
      const b = el('button', { textContent: 'loop', onclick: () => play(id) });
      loopBtns.set(id, b);
      row.append(b);
    } else {
      row.append(el('button', { textContent: 'rnd', title: 'random variation + rate jitter', onclick: () => play(id) }));
      d.files.forEach((_, i) => row.append(el('button', { textContent: String(i + 1), onclick: () => play(id, i) })));
    }
    if (d.spatial) row.append(el('button', { textContent: '3d', title: 'play from the moving source', onclick: () => { src.id = id; srcSel.value = id; restartSource(); } }));
    listEl.append(row);
  }
}
$<HTMLInputElement>('#filter').oninput = (e) => {
  const q = (e.target as HTMLInputElement).value.toLowerCase();
  listEl.querySelectorAll<HTMLElement>('.row').forEach((r) => { r.style.display = r.dataset.key!.toLowerCase().includes(q) ? '' : 'none'; });
};

// ------------------------------------------------------------------ side panel
const side = $('#side');
const slider = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void) => {
  const out = el('b', { textContent: value.toFixed(2) });
  const inp = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  inp.oninput = () => { const v = +inp.value; out.textContent = v.toFixed(2); on(v); };
  on(value);
  return el('label', {}, el('span', { textContent: label }), inp, out);
};

side.append(el('h2', { textContent: '3D source (top-down, 1 px = 0.1 m; you are the triangle)' }));
const canvas = el('canvas', { width: 420, height: 420 });
side.append(canvas);
const srcSel = el('select');
for (const id of Object.keys(SOUNDS).filter((i) => SOUNDS[i].spatial)) srcSel.append(el('option', { value: id, textContent: id }));
srcSel.value = src.id;
srcSel.onchange = () => { src.id = srcSel.value; restartSource(); };
const srcBtn = el('button', { textContent: 'start source', onclick: () => { src.on = !src.on; restartSource(); } });
side.append(el('div', { className: 'row' }, srcSel, srcBtn,
  el('button', { textContent: 'wall (occlusion)', onclick: (e: MouseEvent) => { wall = !wall; (e.target as HTMLElement).classList.toggle('on', wall); } })));
side.append(slider('radius m', 1, 60, 0.5, src.radius, (v) => (src.radius = v)),
  slider('orbit speed', -2, 2, 0.05, src.speed, (v) => (src.speed = v)),
  slider('height m', -5, 20, 0.5, src.height, (v) => (src.height = v)),
  slider('one-shot every s', 0.3, 5, 0.1, src.every, (v) => (src.every = v)),
  slider('listener heading', -180, 180, 1, 0, (v) => (heading = (v * Math.PI) / 180)));
function restartSource(): void {
  src.voice?.stop(0.2);
  src.voice = null;
  srcBtn.classList.toggle('on', src.on);
  srcBtn.textContent = src.on ? 'stop source' : 'start source';
  if (src.on && SOUNDS[src.id].loop) src.voice = audio.play(src.id, { pos: srcPos(), loop: true });
  src.timer = 0;
}
function srcPos(): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(src.angle) * src.radius, src.height, -Math.cos(src.angle) * src.radius);
}

side.append(el('h2', { textContent: 'Reverb zone / indoors' }));
const zoneRow = el('div', { className: 'row' });
for (const z of ['outdoor', 'cabin', 'store'] as ReverbZone[]) {
  zoneRow.append(el('button', { textContent: z, onclick: (e: MouseEvent) => {
    audio.setReverb(z);
    zoneRow.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    (e.target as HTMLElement).classList.add('on');
  } }));
}
side.append(zoneRow, slider('indoors', 0, 1, 0.01, 0, (v) => audio.setIndoors(v)));

side.append(el('h2', { textContent: 'Ambience beds (target weights; 1.5 s crossfades)' }));
for (const name of Object.keys(AMBIENCES)) side.append(slider(name, 0, 1, 0.01, 0, (v) => audio.ambience(name, v)));
side.append(el('div', { className: 'row' },
  el('button', { textContent: 'day preset', onclick: () => preset({ forest_day: 1, wind: 0.25 }) }),
  el('button', { textContent: 'dusk', onclick: () => preset({ forest_dusk: 1, lake: 0.4 }) }),
  el('button', { textContent: 'night', onclick: () => preset({ forest_night: 1, wind: 0.15 }) }),
  el('button', { textContent: 'storm', onclick: () => preset({ rain: 1, wind: 0.8 }) }),
  el('button', { textContent: 'cabin', onclick: () => preset({ cabin: 1, rain_roof: 0.6 }) }),
  el('button', { textContent: 'dread', onclick: () => preset({ forest_night: 0.6, drone: 1 }) }),
  el('button', { textContent: 'silence', onclick: () => preset({}) })));
function preset(w: Record<string, number>): void {
  side.querySelectorAll<HTMLLabelElement>('label').forEach((l) => {
    const name = l.querySelector('span')!.textContent!;
    if (!(name in AMBIENCES)) return;
    const inp = l.querySelector('input')!;
    inp.value = String(w[name] ?? 0);
    inp.dispatchEvent(new Event('input'));
  });
}

side.append(el('h2', { textContent: 'World (drives the wildlife scheduler)' }));
const wild = el('label', {}, el('span', { textContent: 'wildlife on' }), el('input', { type: 'checkbox', checked: true, onchange: (e: Event) => { audio.wildlifeEnabled = (e.target as HTMLInputElement).checked; } }));
side.append(wild, slider('hour', 0, 24, 0.25, 12, (v) => audio.setHour(v)),
  slider('rain', 0, 1, 0.01, 0, (v) => audio.setWeather({ rain: v })),
  slider('wind', 0, 1, 0.01, 0, (v) => audio.setWeather({ wind: v })),
  slider('storm', 0, 1, 0.01, 0, (v) => audio.setWeather({ storm: v })),
  slider('lake nearby', 0, 1, 0.01, 0.3, (v) => audio.setHabitat({ lake: v })),
  slider('creek nearby', 0, 1, 0.01, 0, (v) => audio.setHabitat({ creek: v })),
  slider('dread', 0, 1, 0.01, 0, (v) => audio.setDread(v)));
const trig = el('div', { className: 'row' });
for (const w of WILDLIFE) trig.append(el('button', { textContent: w.id.replace(/^(bird|animal|creature|weather)_/, ''), title: 'place one now', onclick: () => audio.triggerWildlife(w.id) }));
side.append(el('h3', { textContent: 'trigger a scheduled call now' }), trig);

side.append(el('h2', { textContent: 'Volumes' }));
for (const c of ['master', 'sfx', 'amb', 'ui', 'voice', 'music'] as (SoundCat | 'master')[]) side.append(slider(c, 0, 1.5, 0.01, 1, (v) => audio.setVolume(c, v)));
side.append(el('div', { className: 'row' }, el('button', { textContent: 'preload all', onclick: () => { const t = performance.now(); void audio.preload().then(() => console.log('[audio] preloaded in', Math.round(performance.now() - t), 'ms')); } }),
  el('button', { textContent: 'stop all', onclick: () => { audio.stopAll(0.2); loops.clear(); refreshLoopButtons(); preset({}); src.on = false; restartSource(); } })));

// ------------------------------------------------------------------ gate + loop
$('#gate').onclick = async () => {
  await audio.unlock();
  $('#gate').remove();
};
const ctx2 = canvas.getContext('2d')!;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  cam.rotation.set(0, -heading, 0);
  audio.setListener(cam);
  // move / retrigger the test source
  src.angle += src.speed * dt;
  const p = srcPos();
  if (src.on) {
    if (src.voice) src.voice.setPos(p);
    else if (!SOUNDS[src.id].loop && (src.timer -= dt) <= 0) { audio.play(src.id, { pos: p }); src.timer = src.every; }
  }
  draw(p);
  $('#stats').textContent = `voices ${audio.activeVoices}  ctx ${audio.ctx?.state ?? 'none'}  beds ${Object.entries(audio.ambienceWeights()).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(' ')}`;
  requestAnimationFrame(frame);
}
function draw(p: THREE.Vector3): void {
  const g = ctx2, W = canvas.width, c = W / 2, s = 10; // 10 px per metre
  g.clearRect(0, 0, W, W);
  g.strokeStyle = '#22262c';
  for (let r = 5; r <= 20; r += 5) { g.beginPath(); g.arc(c, c, r * s, 0, Math.PI * 2); g.stroke(); }
  if (wall) { g.strokeStyle = '#c66'; g.lineWidth = 3; g.beginPath(); g.moveTo(c + 3 * s, c - 6 * s); g.lineTo(c + 3 * s, c + 6 * s); g.stroke(); g.lineWidth = 1; }
  // listener
  g.save(); g.translate(c, c); g.rotate(heading);
  g.fillStyle = '#f0c674'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill();
  g.restore();
  // source (clamped to the view)
  const k = Math.min(1, (c - 8) / (Math.hypot(p.x, p.z) * s || 1));
  g.fillStyle = src.on ? '#8abeb7' : '#444'; g.beginPath(); g.arc(c + p.x * s * k, c + p.z * s * k, 6, 0, Math.PI * 2); g.fill();
  // wildlife spawns: shown on the rim at their bearing, labelled with distance
  const t = performance.now();
  g.font = '10px monospace';
  for (let i = spawns.length - 1; i >= 0; i--) {
    const w = spawns[i];
    const age = (t - w.t) / 6000;
    if (age > 1) { spawns.splice(i, 1); continue; }
    const d = Math.hypot(w.x, w.z), r = Math.min(c - 12, d * s);
    const x = c + (w.x / d) * r, y = c + (w.z / d) * r;
    g.globalAlpha = 1 - age;
    g.fillStyle = '#b294bb'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    g.fillText(`${w.id} ${Math.round(d)}m`, Math.min(W - 120, x + 6), y - 4);
    g.globalAlpha = 1;
  }
}
requestAnimationFrame(frame);
// handy from the devtools console (and for automated checks)
(window as unknown as { audio: typeof audio }).audio = audio;
