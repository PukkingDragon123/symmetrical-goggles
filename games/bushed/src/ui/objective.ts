// The current objective, top-left: one short line in Alagard beside a small diamond, a quiet kicker above it (the
// chapter), and a hint under it (how far, which way). It cross-fades when the task changes and is struck through
// when done. A small pin marks the target in the world (an arrow on the screen edge when it's behind you).
// Ported from the author's own game หลอนยันปลายทาง (effective-octo-train/src/ui/Objective.js), restyled for BUSHED.
//
//   objectiveUI.set({ id, text, kicker?, steps? }) · .tick(stepId) · .done() · .clear() · .hint(text) · .marker(m | null)
const STYLE = `
.bobj { position: fixed; top: max(20px, calc(env(safe-area-inset-top) + 16px)); left: max(24px, calc(env(safe-area-inset-left) + 20px));
  max-width: min(42vw, 470px); z-index: 24; pointer-events: none; display: flex; align-items: flex-start; gap: 11px;
  font-family: Alagard, monospace; color: #ece2c9; opacity: 0; transform: translateY(-6px);
  transition: opacity .45s cubic-bezier(.22,.61,.36,1), transform .45s cubic-bezier(.22,.61,.36,1);
  text-shadow: 0 2px 0 rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9), 0 2px 10px rgba(0,0,0,.5); }
.bobj::before { content: ''; position: absolute; left: -18px; top: -14px; right: -46px; bottom: -16px; z-index: -1;
  background: radial-gradient(closest-side, rgba(0,0,0,.48), rgba(0,0,0,0)); }
.bobj.is-on { opacity: .93; transform: none; }
.bobj.is-hidden { opacity: 0 !important; }
.bobj__mark { flex: none; position: relative; width: 8px; height: 8px; margin-top: calc(1.05em + 7px); border: 1.5px solid #d8a85c; transform: rotate(45deg); transition: background .4s; }
.bobj.is-new .bobj__mark::after { content: ''; position: absolute; inset: -5px; border: 1px solid #d8a85c; opacity: 0; animation: bobj-ping 1.4s ease-out 2; }
@keyframes bobj-ping { 0% { opacity: .8; transform: scale(.6); } 100% { opacity: 0; transform: scale(1.9); } }
.bobj.is-done .bobj__mark { background: #d8a85c; }
.bobj__text { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.bobj__k { font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: #c9a86a; opacity: .7; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bobj__k:empty { display: none; }
.bobj__t { font-size: clamp(15px, .45vw + 11px, 20px); letter-spacing: .3px;
  background: linear-gradient(currentColor, currentColor) no-repeat 0 58% / 0% 1.5px; transition: background-size .55s ease; }
.bobj.is-done .bobj__t { background-size: 100% 1.5px; }
.bobj__h { margin-top: 5px; font-size: 12px; letter-spacing: .08em; color: #d9ccae; opacity: .62; display: flex; align-items: center; gap: 7px; min-height: 1em; transition: opacity .4s; }
.bobj__h:empty, .bobj__h.is-empty { opacity: 0; }
.bobj__arrow { width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 8px solid #d9ccae; transform: rotate(var(--a, 0rad)); transition: transform .25s; flex: none; }
.bobj__list { list-style: none; margin: 7px 0 0; padding: 6px 0 0; display: flex; flex-direction: column; gap: 3px; border-top: 1px solid rgba(236,226,201,.16); }
.bobj__list:empty { display: none; }
.bobj__s { display: flex; align-items: center; gap: 8px; font-size: clamp(13px, .3vw + 10px, 16px); opacity: .8; transition: opacity .4s; }
.bobj__box { flex: none; width: .7em; height: .7em; border: 1.5px solid rgba(236,226,201,.75); position: relative; }
.bobj__s.is-next { opacity: 1; } .bobj__s.is-next .bobj__box { border-color: #f4ead2; }
.bobj__s.is-done { opacity: .45; } .bobj__s.is-done .bobj__st { text-decoration: line-through; text-decoration-thickness: 1.5px; }
.bobj__s.is-done .bobj__box { border-color: #d8a85c; background: rgba(216,168,92,.2); }
.bobjm { position: fixed; z-index: 23; pointer-events: none; left: 0; top: 0; opacity: 0; transition: opacity .35s; font-family: Alagard, monospace;
  color: #f1e7cf; text-shadow: 0 1px 0 #000, 0 0 3px rgba(0,0,0,.9); font-size: 12px; letter-spacing: .06em; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.bobjm.is-on { opacity: .62; }
.bobjm__pin { width: 8px; height: 8px; border: 1.5px solid #f1e7cf; outline: 1px solid rgba(0,0,0,.45); transform: rotate(45deg); }
.bobjm.is-off .bobjm__pin { width: 0; height: 0; border: none; outline: none; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 11px solid #f1e7cf; transform: rotate(var(--a, 0rad)); }
.bobjm.is-off .bobjm__d { display: none; }
@media (max-width: 640px) { .bobj { max-width: calc(100vw - 110px); } .bobj__k { font-size: 10px; } }
`;

export interface ObjectiveStep { id: string; text: string; done?: boolean }
export interface ObjectiveView { id: string; text: string; kicker?: string; steps?: ObjectiveStep[] }
export interface MarkerView { x: number; y: number; dist: number; off: boolean; angle: number }

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

class ObjectiveUI {
  private el: HTMLDivElement | null = null;
  private mk!: HTMLDivElement;
  private kEl!: HTMLElement;
  private tEl!: HTMLElement;
  private hEl!: HTMLElement;
  private hTxt!: HTMLElement;
  private arrow!: HTMLElement;
  private list!: HTMLElement;
  private mkD!: HTMLElement;
  private key = '';
  private timer = 0;
  private newT = 0;
  private hintKey = '';
  private mkOn = false;
  private hidden = false;
  /** the id of what's showing (null when nothing) */
  current: string | null = null;

  private ensure(): boolean {
    if (this.el) return true;
    if (typeof document === 'undefined') return false;
    const st = document.createElement('style'); st.id = 'bobj-css'; st.textContent = STYLE; document.head.appendChild(st);
    const root = document.getElementById('ui') ?? document.body;
    const el = document.createElement('div');
    el.className = 'bobj';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="bobj__mark"></span><span class="bobj__text"><span class="bobj__k"></span><span class="bobj__t"></span>'
      + '<span class="bobj__h"><span class="bobj__arrow"></span><span class="bobj__ht"></span></span><ul class="bobj__list"></ul></span>';
    root.appendChild(el);
    this.el = el;
    this.kEl = el.querySelector('.bobj__k')!; this.tEl = el.querySelector('.bobj__t')!; this.hEl = el.querySelector('.bobj__h')!;
    this.hTxt = el.querySelector('.bobj__ht')!; this.arrow = el.querySelector('.bobj__arrow')!; this.list = el.querySelector('.bobj__list')!;
    const m = document.createElement('div');
    m.className = 'bobjm';
    m.innerHTML = '<span class="bobjm__pin"></span><span class="bobjm__d"></span>';
    root.appendChild(m);
    this.mk = m; this.mkD = m.querySelector('.bobjm__d')!;
    return true;
  }

  /** show an objective (cross-fades from the one before; the same one again only refreshes its checklist) */
  set(o: ObjectiveView | null): void {
    if (!o) { this.clear(); return; }
    if (!this.ensure()) return;
    const el = this.el!;
    const key = `${o.id}|${o.text}|${o.kicker ?? ''}|${(o.steps ?? []).map((s) => s.id + ':' + s.text).join(',')}`;
    if (key === this.key && !el.classList.contains('is-done')) {
      for (const s of o.steps ?? []) if (s.done) this.tick(s.id);
      return;
    }
    this.key = key;
    this.current = o.id;
    clearTimeout(this.timer);
    const show = () => {
      el.classList.remove('is-done');
      this.kEl.textContent = o.kicker ?? '';
      this.tEl.textContent = o.text;
      this.list.innerHTML = (o.steps ?? []).map((s) => `<li class="bobj__s${s.done ? ' is-done' : ''}" data-id="${esc(s.id)}"><span class="bobj__box"></span><span class="bobj__st">${esc(s.text)}</span></li>`).join('');
      this.next();
      this.hintKey = '-'; this.hint(null);
      void el.offsetWidth;
      el.classList.add('is-on', 'is-new');
      clearTimeout(this.newT);
      this.newT = window.setTimeout(() => el.classList.remove('is-new'), 3000);
    };
    if (el.classList.contains('is-on')) { el.classList.remove('is-on'); this.timer = window.setTimeout(show, 460); } else show();
  }

  /** a checklist step done (any order) */
  tick(id: string): void {
    const li = this.el?.querySelector(`.bobj__s[data-id="${CSS.escape(id)}"]`);
    if (!li || li.classList.contains('is-done')) return;
    li.classList.add('is-done');
    this.next();
  }
  private next(): void {
    const lis = [...(this.el?.querySelectorAll('.bobj__s') ?? [])];
    lis.forEach((l) => l.classList.remove('is-next'));
    lis.find((l) => !l.classList.contains('is-done'))?.classList.add('is-next');
  }

  /** the line under it: "120 m, ahead on the left" with a little arrow turned the way to go (angle: 0 = ahead) */
  hint(text: string | null, angle = 0): void {
    if (!this.el) return;
    const k = text === null ? '' : `${text}|${Math.round(angle * 8)}`;
    if (k === this.hintKey) return;
    this.hintKey = k;
    this.hEl.classList.toggle('is-empty', !text);
    this.hTxt.textContent = text ?? '';
    this.arrow.style.setProperty('--a', `${(Math.round(angle * 8) / 8).toFixed(3)}rad`);
  }

  /** struck through, then gone */
  done(): void {
    if (!this.el || !this.current) return;
    this.current = null;
    this.key = '';
    this.marker(null);
    this.el.classList.add('is-done');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el?.classList.remove('is-on'), 1400);
  }

  clear(): void {
    this.current = null;
    this.key = '';
    this.marker(null);
    clearTimeout(this.timer);
    this.el?.classList.remove('is-on');
  }

  /** hidden for a while (cutscenes, the book open) without forgetting what it says */
  setHidden(h: boolean): void {
    if (h === this.hidden || !this.el) return;
    this.hidden = h;
    this.el.classList.toggle('is-hidden', h);
    if (h) this.marker(null);
  }

  /** the pin toward the target (screen px), or null to hide it; touches the DOM only when something visible changed */
  private mx = -1e9; private my = -1e9; private mOff = false; private mA = 0; private mD = -1;
  marker(m: MarkerView | null): void {
    if (!this.el) return;
    const on = !!m && !!this.current && !this.hidden;
    if (on !== this.mkOn) { this.mkOn = on; this.mk.classList.toggle('is-on', on); }
    if (!on || !m) return;
    const x = Math.round(m.x), y = Math.round(m.y), a = Math.round(m.angle * 20) / 20;
    if (x !== this.mx || y !== this.my || a !== this.mA) {
      this.mx = x; this.my = y; this.mA = a;
      this.mk.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      this.mk.style.setProperty('--a', `${a}rad`);
    }
    if (m.off !== this.mOff) { this.mOff = m.off; this.mk.classList.toggle('is-off', m.off); }
    // the distance in steps (5 m near, 10 m past 100 m, 0.1 km past a kilometre)
    const d = m.dist < 1 ? 0 : m.dist >= 1000 ? Math.round(m.dist / 100) * 100 : m.dist >= 100 ? Math.round(m.dist / 10) * 10 : Math.max(1, Math.round(m.dist / 5) * 5);
    if (d !== this.mD) { this.mD = d; this.mkD.textContent = d === 0 ? '' : d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`; }
  }
}

export const objectiveUI = new ObjectiveUI();
