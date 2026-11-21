// Scout marks: what a tame wapaloosie saw from the top of its tree (caches, cryptids), pinned on the screen as small
// hand-inked tags that ride over their spot in the world (or sit on the screen's edge with an arrow when it is
// behind you or off to the side), with the distance. The same marks go out on game.events 'map_mark' for a map.
//   marks.add({ id, kind: 'cache' | 'cryptid', label, pos, until })   // pos may be a live Vector3 (a creature's)
//   marks.update(camera, playerPos, now)                               // every frame (no allocation)
import * as THREE from 'three';

export interface Mark { id: string; kind: 'cache' | 'cryptid'; label: string; pos: THREE.Vector3; until: number }

const _v = new THREE.Vector3();
const MAX = 24;

class Marks {
  readonly list: Mark[] = [];
  private root: HTMLDivElement | null = null;
  private els: { el: HTMLDivElement; txt: HTMLSpanElement; arrow: HTMLSpanElement }[] = [];

  private mount(): void {
    if (this.root || typeof document === 'undefined') return;
    const r = document.createElement('div');
    r.id = 'scout-marks';
    Object.assign(r.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '20', overflow: 'hidden' });
    const css = document.createElement('style');
    css.textContent = `#scout-marks .m{position:absolute;left:0;top:0;transform:translate(-50%,-100%);font:13px PatrickHand,Caveat,cursive;
      color:#f2e6c8;text-shadow:0 1px 2px #000,0 0 6px #000;white-space:nowrap;display:none;text-align:center}
      #scout-marks .m i{display:block;width:9px;height:9px;margin:2px auto 0;border:2px solid currentColor;transform:rotate(45deg);border-radius:1px}
      #scout-marks .m.cache{color:#e8c46a} #scout-marks .m.cryptid{color:#b9e6a0}
      #scout-marks .m b{display:block;font-weight:normal;opacity:.8;font-size:11px}
      #scout-marks .m .a{display:none;font-size:15px} #scout-marks .m.edge .a{display:block} #scout-marks .m.edge i{display:none}`;
    r.appendChild(css);
    for (let k = 0; k < MAX; k++) {
      const el = document.createElement('div'); el.className = 'm';
      const arrow = document.createElement('span'); arrow.className = 'a'; arrow.textContent = '➤';
      const txt = document.createElement('span');
      el.append(arrow, txt, document.createElement('i'));
      r.appendChild(el);
      this.els.push({ el, txt, arrow });
    }
    document.body.appendChild(r);
    this.root = r;
  }

  /** add or refresh a mark (same id: refreshed) */
  add(m: Mark): void {
    const have = this.list.find((x) => x.id === m.id);
    if (have) { have.until = Math.max(have.until, m.until); have.pos = m.pos; have.label = m.label; return; }
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(m);
  }
  remove(id: string): void { const i = this.list.findIndex((x) => x.id === id); if (i >= 0) this.list.splice(i, 1); }

  update(cam: THREE.Camera, player: THREE.Vector3, now: number): void {
    if (!this.list.length && !this.root) return;
    this.mount();
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].until < now) this.list.splice(i, 1);
    const W = window.innerWidth, H = window.innerHeight;
    for (let k = 0; k < MAX; k++) {
      const e = this.els[k], m = this.list[k];
      if (!m) { if (e.el.style.display !== 'none') e.el.style.display = 'none'; continue; }
      _v.copy(m.pos); _v.y += m.kind === 'cryptid' ? 2 : 0.8;
      const d = Math.round(Math.hypot(m.pos.x - player.x, m.pos.z - player.z));
      _v.project(cam);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - y; }
      const pad = 40;
      const edge = behind || x < pad || x > W - pad || y < pad || y > H - pad;
      if (edge) {
        // on the rim, pointing the way
        const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, s = Math.min((W / 2 - pad) / Math.max(1, Math.abs(dx)), (H / 2 - pad) / Math.max(1, Math.abs(dy)));
        x = cx + dx * s; y = cy + dy * s;
        e.arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
      e.el.className = `m ${m.kind}${edge ? ' edge' : ''}`;
      const t = `${m.label} · ${d} m`;
      if (e.txt.textContent !== t) e.txt.textContent = t;
      e.el.style.display = 'block';
      e.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
    }
  }
}

export const marks = new Marks();
