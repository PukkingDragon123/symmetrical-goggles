// Floating text: every word in BUSHED is set in Alagard and floats in the world instead of sitting in a HUD box.
//   speech  - rises above whoever said it (NPCs, the Book, creatures), follows them, fades with distance
//   thought - drifts up from just below the centre of view, like breath
//   label   - hovers next to the thing you're looking at (what E would do)
//   pop     - small rising notes at a point ("+2 kindling", "$14.50")
// DOM elements projected from 3D every frame: crisp pixel glyphs, untouched by the post grain and dither.
import * as THREE from 'three';

export type FloatKind = 'speech' | 'thought' | 'label' | 'pop' | 'title';

export interface FloatOpts {
  at?: THREE.Object3D | THREE.Vector3;
  /** speaker name, shown in a darker tint before the line */
  who?: string;
  dur?: number;
  kind?: FloatKind;
  color?: string;
  /** metres above the anchor (speech) */
  lift?: number;
}

interface Item { el: HTMLDivElement; kind: FloatKind; at: THREE.Object3D | THREE.Vector3 | null; t: number; dur: number; lift: number; y0: number }

const css = `
@font-face { font-family: Alagard; src: url(assets/fonts/Alagard.ttf); }
.ft { position: fixed; left: 0; top: 0; pointer-events: none; white-space: pre-wrap; text-align: center;
  font-family: Alagard, monospace; -webkit-font-smoothing: none; font-smooth: never; text-rendering: optimizeSpeed;
  color: #f1e6c8; letter-spacing: 0; line-height: 1.05;
  text-shadow: 2px 0 0 #120d0a, -2px 0 0 #120d0a, 0 2px 0 #120d0a, 0 -2px 0 #120d0a, 2px 2px 0 #120d0a, -2px 2px 0 #120d0a, 2px -2px 0 #120d0a, -2px -2px 0 #120d0a, 0 4px 0 rgba(0,0,0,.45);
  will-change: transform, opacity; }
.ft.speech { font-size: 32px; max-width: 560px; }
.ft.thought { font-size: 32px; max-width: 640px; color: #d8cfb6; }
.ft.label { font-size: 16px; color: #f6eccf; }
.ft.pop { font-size: 16px; color: #ffe08a; }
.ft.title { font-size: 64px; color: #eadcbc; letter-spacing: 2px; left: 50%; top: 38%; transform: translate(-50%, -50%); }
.ft .who { color: #e2a35a; }
`;

class FloatText {
  private root: HTMLElement | null = null;
  private cam: THREE.Camera | null = null;
  private items: Item[] = [];
  private labelEl: HTMLDivElement | null = null;
  private labelAt: THREE.Vector3 | null = null;
  private labelText = '';
  private v = new THREE.Vector3();
  /** named speakers: NPCs and creatures register themselves so their lines float above them */
  readonly speakers = new Map<string, THREE.Object3D>();
  enabled = true;

  mount(root: HTMLElement, cam: THREE.Camera | null): void {
    this.root = root; this.cam = cam;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    this.labelEl = this.mk('label');
    this.labelEl.style.opacity = '0';
  }

  setCamera(cam: THREE.Camera): void { this.cam = cam; }

  private mk(kind: FloatKind): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `ft ${kind}`;
    this.root?.appendChild(el);
    return el;
  }

  /** float a line. Text may carry <b>Name:</b> (speech) or <i>...</i> (thought) markup from older callers */
  say(text: string, o: FloatOpts = {}): void {
    if (!this.root) return;
    let kind: FloatKind = o.kind ?? 'thought';
    let who = o.who;
    const m = /^<b>([^<]+):<\/b>\s*(.*)$/s.exec(text);
    if (m) { who = who ?? m[1]; text = m[2]; kind = o.kind ?? 'speech'; }
    text = text.replace(/<\/?i>/g, '').replace(/<\/?b>/g, '');
    const at = o.at ?? (who ? this.speakers.get(who) ?? null : null);
    if (kind === 'speech' && !at) kind = 'thought';
    // one line per speaker at a time: a new line replaces the old
    for (const it of this.items) if (it.kind === kind && (kind === 'thought' || it.at === at)) it.t = Math.max(it.t, it.dur - 0.25);
    const el = this.mk(kind);
    el.innerHTML = (who && kind === 'speech' ? `<span class="who">${who}</span>\n` : '') + escapeHtml(text);
    if (o.color) el.style.color = o.color;
    const words = text.split(/\s+/).length;
    this.items.push({ el, kind, at, t: 0, dur: o.dur ?? Math.min(9, 1.6 + words * 0.32), lift: o.lift ?? 0.45, y0: 0 });
  }

  clearTitles(): void { for (const it of this.items) if (it.kind === 'title') it.t = Math.max(it.t, it.dur - 0.6); }

  pop(text: string, at: THREE.Vector3, color?: string): void { this.say(text, { at: at.clone(), kind: 'pop', dur: 1.6, color, lift: 0.1 }); }

  title(text: string, sub = '', dur = 4): void {
    if (!this.root) return;
    const el = this.mk('title');
    el.innerHTML = escapeHtml(text) + (sub ? `<div style="font-size:32px;margin-top:10px;color:#c8b48c">${escapeHtml(sub)}</div>` : '');
    this.items.push({ el, kind: 'title', at: null, t: 0, dur, lift: 0, y0: 0 });
  }

  /** the interaction label, every frame: text next to a world point (null hides it) */
  label(text: string, at: THREE.Vector3 | null): void { this.labelText = text; this.labelAt = at ? (this.labelAt ?? new THREE.Vector3()).copy(at) : null; }

  get speaking(): boolean { return this.items.some((i) => i.kind === 'speech' || i.kind === 'thought'); }

  private project(p: THREE.Vector3): { x: number; y: number; ok: boolean; d: number } {
    const cam = this.cam!;
    this.v.copy(p).project(cam);
    const d = p.distanceTo((cam as THREE.PerspectiveCamera).position);
    return { x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight, ok: this.v.z < 1 && this.v.z > -1, d };
  }

  update(dt: number): void {
    if (!this.cam || !this.root) return;
    this.cam.updateMatrixWorld();
    const W = innerWidth, H = innerHeight;
    let thoughtRow = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const life = it.t / it.dur;
      if (life >= 1 || !this.enabled) { it.el.remove(); this.items.splice(i, 1); continue; }
      const fadeIn = Math.min(1, it.t / 0.25), fadeOut = Math.min(1, (it.dur - it.t) / 0.6);
      let x = W / 2, y = H / 2, a = fadeIn * fadeOut, s = 1;
      if (it.kind === 'thought') {
        // drifts up slowly from below the crosshair
        y = H * 0.74 - it.t * 6 - thoughtRow * 76; thoughtRow++;
        x = W / 2 + Math.sin(it.t * 0.8) * 3;
      } else if (it.kind === 'title') {
        it.el.style.opacity = String(Math.min(1, it.t / 1.2) * Math.min(1, (it.dur - it.t) / 1.2));
        continue;
      } else if (it.at) {
        const p = it.at instanceof THREE.Object3D ? it.at.getWorldPosition(this.v.clone()) : it.at.clone();
        const box = it.at instanceof THREE.Object3D ? headHeight(it.at) : 0;
        p.y += box + it.lift + (it.kind === 'pop' ? it.t * 0.5 : it.t * 0.04);
        const pr = this.project(p);
        if (!pr.ok) { it.el.style.opacity = '0'; continue; }
        x = pr.x; y = pr.y;
        // distance: shrink a little, fade far away (speech you can't hear doesn't float)
        s = THREE.MathUtils.clamp(6 / Math.max(pr.d, 1), 0.5, 1);
        a *= 1 - THREE.MathUtils.smoothstep(pr.d, 14, 26);
      }
      it.el.style.opacity = String(a);
      it.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
    }
    // label
    const L = this.labelEl!;
    if (this.labelText && this.labelAt && this.enabled) {
      const pr = this.project(this.labelAt);
      if (pr.ok) {
        if (L.textContent !== this.labelText) L.textContent = this.labelText;
        L.style.opacity = '1';
        // sit just to the right of the point, never on top of the crosshair
        const x = Math.max(pr.x, W / 2 + 24), y = Math.min(Math.max(pr.y, H / 2 - 40), H / 2 + 60);
        L.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(0, -50%)`;
      } else L.style.opacity = '0';
    } else L.style.opacity = '0';
  }
}

/** height of a speaker's head above its origin (cached per object) */
function headHeight(o: THREE.Object3D): number {
  const c = o.userData.__headH as number | undefined;
  if (c !== undefined) return c;
  const b = new THREE.Box3().setFromObject(o);
  const h = isFinite(b.max.y) ? b.max.y - o.getWorldPosition(new THREE.Vector3()).y : 1.8;
  o.userData.__headH = Math.min(4, Math.max(0.3, h));
  return o.userData.__headH;
}

function escapeHtml(s: string): string { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!); }

export const floatText = new FloatText();
