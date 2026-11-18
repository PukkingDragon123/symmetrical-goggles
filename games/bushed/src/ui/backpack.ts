// The backpack is the inventory: press I and your hands swing the old canvas pack round and open it in front of
// you. Everything you carry sits inside as a real little model; click one to take it into your hand.
import * as THREE from 'three';
import { ITEMS } from '../game/items';
import { canvasTex } from '../gfx/tex';
import { Rng } from '../core/rng';

function canvasCloth(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = new Rng(9);
  g.fillStyle = '#6b6346'; g.fillRect(0, 0, 128, 128);
  // woven duck canvas: alternating warp/weft pixels
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const w = ((x + y) & 1) ? 6 : -6;
    const n = r.range(-10, 10);
    g.fillStyle = `rgb(${107 + w + n},${99 + w + n},${70 + w * 0.6 + n})`;
    g.fillRect(x, y, 1, 1);
  }
  // seams and grime
  g.fillStyle = 'rgba(40,34,22,0.5)'; g.fillRect(0, 62, 128, 2);
  g.strokeStyle = 'rgba(220,200,150,0.35)'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(0, 58); g.lineTo(128, 58); g.moveTo(0, 68); g.lineTo(128, 68); g.stroke();
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(50,40,25,${r.range(0.05, 0.15)})`; g.beginPath(); g.arc(r.range(0, 128), r.range(0, 128), r.range(6, 20), 0, 7); g.fill(); }
  return canvasTex(c, { repeat: true });
}

/** an open canvas rucksack: a lofted rounded body with a thick rolled rim, leather-trimmed */
function packMesh(): THREE.Object3D {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ map: canvasCloth(), roughness: 1, side: THREE.DoubleSide });
  const W = 0.42, D = 0.24, H = 0.2;
  const ringN = 28, rows = 6;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = -H + t * H;
    const bulge = 1 + 0.08 * Math.sin(t * Math.PI) - 0.1 * (1 - t) * (1 - t);
    for (let i = 0; i <= ringN; i++) {
      const a = (i / ringN) * Math.PI * 2;
      // superellipse for a soft box shape
      const cx = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.55), cz = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.55);
      const sag = 0.012 * Math.sin(a * 6 + t * 3);
      pos.push(cx * (W / 2) * bulge + sag, y, cz * (D / 2) * bulge);
      uv.push(i / ringN * 4, t * 1.2);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < ringN; i++) {
    const a = j * (ringN + 1) + i, b = a + 1, c = a + ringN + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // bottom
  const base = pos.length / 3;
  pos.push(0, -H, 0); uv.push(0.5, 0.5);
  for (let i = 0; i < ringN; i++) idx.push(base, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, cloth);
  g.add(body);
  // rolled rim (torus-like tube following the superellipse)
  const rimPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const cx = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.55), cz = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.55);
    rimPts.push(new THREE.Vector3(cx * W / 2 * 1.02, 0.004, cz * D / 2 * 1.02));
  }
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 64, 0.012, 6, true),
    new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.7 }));
  g.add(rim);
  return g;
}

export class Backpack {
  readonly object = new THREE.Group();
  open = false;
  private t = 0;
  private slots = new THREE.Group();
  private ray = new THREE.Raycaster();
  hover: string | null = null;

  constructor(private modelFor: (id: string) => THREE.Object3D | null) {
    this.object.add(packMesh(), this.slots);
    this.object.visible = false;
  }

  /** lay out the carried items inside the pack */
  fill(items: Map<string, number>): void {
    this.slots.clear();
    const list = [...items.entries()].filter(([id, n]) => n > 0 && ITEMS[id]?.pocket);
    const cols = 4;
    list.forEach(([id, n], i) => {
      const m = this.modelFor(id);
      const holder = new THREE.Group();
      holder.userData.itemId = id;
      const x = ((i % cols) - (cols - 1) / 2) * 0.095, z = (Math.floor(i / cols) - 0.5) * 0.09;
      holder.position.set(x, -0.03, z);
      if (m) {
        const box = new THREE.Box3().setFromObject(m);
        const size = box.getSize(new THREE.Vector3());
        const s = 0.075 / Math.max(size.x, size.y, size.z, 1e-3);
        m.scale.multiplyScalar(s);
        const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
        m.position.sub(c);
        holder.add(m);
      }
      // count tag: a little paper label for stacks
      if (n > 1) {
        const c = document.createElement('canvas'); c.width = 32; c.height = 16;
        const g = c.getContext('2d')!; g.fillStyle = '#e6dcc0'; g.fillRect(0, 0, 32, 16); g.fillStyle = '#222'; g.font = '16px Alagard, monospace'; g.fillText(`x${n}`, 6, 12);
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.015), new THREE.MeshBasicMaterial({ map: canvasTex(c) }));
        tag.position.set(0.03, 0.03, 0.03); tag.rotation.x = -0.6;
        holder.add(tag);
      }
      this.slots.add(holder);
    });
  }

  toggle(items: Map<string, number>): void {
    this.open = !this.open;
    if (this.open) this.fill(items);
  }

  /** pick the item under a normalised device coordinate */
  pick(ndc: THREE.Vector2, cam: THREE.Camera): string | null {
    this.ray.setFromCamera(ndc, cam);
    const hits = this.ray.intersectObject(this.slots, true);
    for (const h of hits) for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.userData.itemId) return o.userData.itemId as string;
    return null;
  }

  update(dt: number): void {
    this.t += ((this.open ? 1 : 0) - this.t) * Math.min(1, dt * 8);
    this.object.visible = this.t > 0.02;
    this.object.position.set(0, -0.75 + this.t * 0.36, -0.5);
    this.object.rotation.set(0.85, 0, 0);
    // the hovered item lifts a little
    for (const c of this.slots.children) {
      const up = c.userData.itemId === this.hover ? 0.03 : 0;
      c.position.y += (-0.03 + up - c.position.y) * Math.min(1, dt * 12);
    }
  }
}
