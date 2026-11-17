// The field journal: Uncle Ray's leather notebook, held open in both hands in the viewmodel. Pages are painted
// canvases (critter sketches and notes, contracts, Ray's tips). Tab opens/closes, A/D or clicking the page
// edges turns pages. Discovered critter rules are written in the player's own (different) handwriting.
import * as THREE from 'three';
import { paintPaper, type Block } from './paper';
import { canvasTex } from '../gfx/tex';
import { CRITTERS, NOTES } from '../game/story';
import { contractPaper, type Contract } from '../game/contracts';
import { Rng } from '../core/rng';

function leatherTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = new Rng(3);
  g.fillStyle = '#4a2c1c'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const v = r.range(-18, 18);
    g.fillStyle = `rgb(${74 + v},${44 + v * 0.7},${28 + v * 0.5})`;
    g.fillRect(r.int(0, 127), r.int(0, 127), r.int(1, 3), 1);
  }
  // worn edges and stitching
  g.strokeStyle = 'rgba(220,190,140,0.55)'; g.setLineDash([3, 3]); g.lineWidth = 1; g.strokeRect(6, 6, 116, 116);
  g.fillStyle = 'rgba(160,110,70,0.35)'; g.fillRect(0, 0, 128, 4); g.fillRect(0, 124, 128, 4);
  return canvasTex(c);
}

export class Journal {
  readonly object = new THREE.Group();
  open = false;
  page = 0;
  private left: THREE.Mesh;
  private right: THREE.Mesh;
  private pages: Block[][] = [];
  private t = 0;
  private known = new Map<string, Set<string>>();
  private seen = new Set<string>();
  contracts: Contract[] = [];

  constructor() {
    const leather = new THREE.MeshStandardMaterial({ map: leatherTex(), roughness: 0.75 });
    // cover: two slightly bowed boards
    const coverGeo = new THREE.BoxGeometry(0.17, 0.012, 0.23, 1, 1, 1);
    const cl = new THREE.Mesh(coverGeo, leather), cr = new THREE.Mesh(coverGeo, leather);
    cl.position.set(-0.088, -0.006, 0); cr.position.set(0.088, -0.006, 0);
    cl.rotation.z = 0.08; cr.rotation.z = -0.08;
    const pageGeo = new THREE.PlaneGeometry(0.16, 0.215, 6, 1);
    // pages curve down toward the spine
    const pp = pageGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i); pp.setZ(i, 0.012 * Math.sin(((x + 0.08) / 0.16) * Math.PI)); }
    pageGeo.computeVertexNormals();
    this.left = new THREE.Mesh(pageGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    this.right = new THREE.Mesh(pageGeo.clone(), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    this.left.rotation.x = -Math.PI / 2; this.right.rotation.x = -Math.PI / 2;
    this.left.position.set(-0.083, 0.004, 0); this.right.position.set(0.083, 0.004, 0);
    this.left.rotation.y = 0.08; this.right.rotation.y = -0.08;
    // page block thickness
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.01, 0.215), new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 1 }));
    block.position.y = -0.002;
    this.object.add(cl, cr, block, this.left, this.right);
    this.object.visible = false;
    for (const c of CRITTERS) this.known.set(c.id, new Set());
  }

  learn(critter: string, rule: string): boolean {
    const s = this.known.get(critter);
    if (!s || s.has(rule)) return false;
    s.add(rule);
    this.seen.add(critter);
    this.rebuild();
    return true;
  }

  sawCritter(id: string): void { if (!this.seen.has(id)) { this.seen.add(id); this.rebuild(); } }

  knows(critter: string, rule: string): boolean { return this.known.get(critter)?.has(rule) ?? false; }

  rebuild(): void {
    const pages: Block[][] = [];
    // contracts first: what you're doing
    const taken = this.contracts.filter((c) => c.state === 'taken' || c.state === 'done');
    pages.push([
      { t: 'h', text: 'Jobs' },
      ...(taken.length ? taken.flatMap((c): Block[] => [
        { t: 'p', text: `${c.title} — ${c.from}`, struck: c.state === 'done' },
        { t: 'small', text: `${c.goal.count > 0 ? `${Math.min(c.progress, c.goal.count)}/${c.goal.count}  ` : ''}${c.pay > 0 ? `$${c.pay}` : ''}${c.due !== undefined ? `  by day ${c.due + 1}` : ''}` },
      ]) : [{ t: 'p', text: 'Nothing yet. The board at Pruneau\'s has work.' } as Block]),
    ]);
    for (const c of CRITTERS) {
      const known = [...(this.known.get(c.id) ?? [])];
      const bl: Block[] = [
        { t: 'h', text: c.name, hand: 'caveat' },
        { t: 'small', text: c.latin },
        ...c.ray.map((r): Block => ({ t: 'p', text: r, hand: 'caveat' })),
      ];
      if (known.length) {
        bl.push({ t: 'line' });
        for (const k of known) { const rr = c.rules.find((x) => x.id === k); if (rr) bl.push({ t: 'p', text: rr.text, hand: 'patrick', color: '#3a2a6a' }); }
      }
      pages.push(bl);
    }
    pages.push(...NOTES);
    for (const c of taken) pages.push(contractPaper(c));
    this.pages = pages;
    this.paint();
  }

  private paint(): void {
    const set = (m: THREE.Mesh, i: number) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      const blocks = this.pages[i] ?? [{ t: 'gap' as const }];
      mat.map = canvasTex(paintPaper(blocks, { style: 'journal', seed: 100 + i, w: 320, h: 430 }));
      mat.needsUpdate = true;
    };
    set(this.left, this.page);
    set(this.right, this.page + 1);
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) { this.rebuild(); }
  }

  turn(d: number): void {
    const np = Math.max(0, Math.min(Math.max(0, this.pages.length - 2), this.page + d * 2));
    if (np !== this.page) { this.page = np; this.paint(); }
  }

  /** viewmodel placement: held low, tilted up toward the eyes */
  update(dt: number): void {
    this.t += ((this.open ? 1 : 0) - this.t) * Math.min(1, dt * 7);
    this.object.visible = this.t > 0.02;
    this.object.position.set(0, -0.62 + this.t * 0.28, -0.42);
    this.object.rotation.set(0.95 - this.t * 0.15, 0, 0);
  }
}
