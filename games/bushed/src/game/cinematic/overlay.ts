// The cinematics' screen layer: letterbox bars, fades, subtitles, the title card, the chapter cards and the
// hold-to-skip ring. Alagard throughout, cream on black, nothing louder than it needs to be. Ported from the
// author's own game หลอนยันปลายทาง (effective-octo-train/src/ui/Chapter.js, src/ui/Subtitles.js and the letterbox
// and fade of src/game/Cinematic.js), restyled for BUSHED.
//
//   cineUI.letterbox(true, 1.2); cineUI.fade(false, 2.5); cineUI.subtitle('Kid.', 'Pépère', 3);
//   cineUI.title('BUSHED', 'Kettle Lake, Northern Ontario', 6); cineUI.skip(0.4); chapterCard({ kicker, title, sub })
const CSS = `
.cine { position: fixed; inset: 0; pointer-events: none; z-index: 30; font-family: Alagard, monospace; color: #ece1c8;
  --bar: 12.5vh; --ease: cubic-bezier(.22,.61,.36,1); }
.cine__fade { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 1.5s ease-in-out; }
.cine__bar { position: absolute; left: 0; right: 0; height: var(--bar); background: #000; transform: scaleY(0); transition: transform 1.3s var(--ease); }
.cine__bar.t { top: 0; transform-origin: top; } .cine__bar.b { bottom: 0; transform-origin: bottom; }
.cine.is-box .cine__bar { transform: scaleY(1); }
.cine__sub { position: absolute; left: 50%; bottom: calc(var(--bar) * 0.5); transform: translate(-50%, 50%); width: min(84vw, 980px);
  text-align: center; font-size: clamp(15px, 1.05vw + 8px, 24px); line-height: 1.35; letter-spacing: 0.4px;
  text-shadow: 0 2px 0 rgba(0,0,0,.9), 0 0 8px rgba(0,0,0,.7); opacity: 0; transition: opacity .6s ease; }
.cine:not(.is-box) .cine__sub { bottom: 9vh; transform: translate(-50%, 0); }
.cine__sub.is-on { opacity: 1; }
.cine__sub .w { opacity: 0; display: inline-block; transform: translateY(3px); animation: cine-w .55s var(--ease) forwards; animation-delay: calc(var(--i) * 45ms); }
.cine__who { display: block; font-size: 0.62em; letter-spacing: 0.32em; text-transform: uppercase; color: #c9a86a; opacity: .8; margin-bottom: .25em; }
@keyframes cine-w { to { opacity: 1; transform: none; } }
.cine__title { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-58%); text-align: center; opacity: 0; transition: opacity 1.6s ease; }
.cine__title.is-on { opacity: 1; }
.cine__title::before { content: ''; position: absolute; left: 50%; top: 50%; width: 120vw; height: 70vh; transform: translate(-50%, -50%);
  background: radial-gradient(closest-side, rgba(0,0,0,.55), rgba(0,0,0,0)); z-index: -1; }
.cine__name { font-size: clamp(54px, 8.5vw, 150px); letter-spacing: 0.62em; margin-right: -0.62em; color: #f1e6cb; line-height: 1;
  text-shadow: 0 4px 0 rgba(0,0,0,.85), 0 0 24px rgba(0,0,0,.6); transition: letter-spacing 7s var(--ease), margin-right 7s var(--ease); }
.cine__title.is-on .cine__name { letter-spacing: 0.34em; margin-right: -0.34em; }
.cine__name .l { opacity: 0; display: inline-block; animation: cine-l 1.4s var(--ease) forwards; animation-delay: calc(0.25s + var(--i) * 140ms); }
@keyframes cine-l { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.cine__hair { margin: clamp(14px, 2.4vh, 26px) auto; width: min(34vw, 320px); height: 1px; background: rgba(236,225,200,.45); transform: scaleX(0); transition: transform 1.6s 0.9s var(--ease); }
.cine__title.is-on .cine__hair { transform: scaleX(1); }
.cine__tsub { font-size: clamp(13px, 0.7vw + 8px, 19px); letter-spacing: 0.22em; text-transform: uppercase; color: #cdb88f; opacity: 0; transition: opacity 1.4s 1.5s ease; }
.cine__title.is-on .cine__tsub { opacity: .9; }
.cine__skip { position: absolute; right: max(26px, 3vw); bottom: calc(var(--bar) * 0.5 - 15px); display: flex; align-items: center; gap: 10px;
  font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: #cbbf9f; opacity: 0; transition: opacity .5s; }
.cine:not(.is-box) .cine__skip { bottom: 4vh; }
.cine__skip.is-on { opacity: .75; }
.cine__skip svg { width: 30px; height: 30px; transform: rotate(-90deg); }
.cine__skip circle { fill: none; stroke-width: 2.2; }
.cine__skip .bg { stroke: rgba(236,225,200,.22); } .cine__skip .fg { stroke: #ece1c8; stroke-dasharray: 75.4; stroke-dashoffset: 75.4; }
.chcard { position: fixed; inset: 0; z-index: 29; pointer-events: none; display: flex; align-items: center; justify-content: center;
  font-family: Alagard, monospace; color: #efe3c6; opacity: 0; transition: opacity 1.2s cubic-bezier(.45,0,.55,1); }
.chcard.is-in { opacity: 1; }
.chcard::before { content: ''; position: absolute; inset: 0; background: radial-gradient(56% 42% at 50% 46%, rgba(0,0,0,.55) 0%, rgba(0,0,0,.26) 55%, rgba(0,0,0,0) 100%); }
.chcard__in { position: relative; text-align: center; transform: translateY(-4vh); text-shadow: 0 3px 0 rgba(0,0,0,.85), 0 0 12px rgba(0,0,0,.6); }
.chcard__k { font-size: clamp(12px, 0.5vw + 9px, 16px); letter-spacing: .42em; margin-right: -.42em; text-transform: uppercase; color: #c9a86a; opacity: 0; transition: opacity .9s .15s ease; }
.chcard__hair { margin: clamp(12px, 2vh, 20px) auto; width: 150px; height: 1px; background: rgba(239,227,198,.4); transform: scaleX(0); transition: transform 1.1s .35s cubic-bezier(.22,.61,.36,1); }
.chcard__t { font-size: clamp(34px, 3.6vw, 66px); letter-spacing: .06em; line-height: 1.1; color: #f4e9cf; }
.chcard__t .l { opacity: 0; display: inline-block; }
.chcard.is-in .chcard__t .l { animation: cine-l .7s cubic-bezier(.22,.61,.36,1) forwards; animation-delay: calc(.7s + min(var(--i), 40) * 32ms); }
.chcard__s { margin-top: .9em; font-size: clamp(13px, 0.55vw + 9px, 17px); color: #cdbd98; opacity: 0; transition: opacity 1s 1.4s ease; max-width: min(70vw, 640px); margin-left: auto; margin-right: auto; line-height: 1.4; }
.chcard.is-in .chcard__k, .chcard.is-in .chcard__s { opacity: 1; }
.chcard.is-in .chcard__hair { transform: scaleX(1); }
`;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** a line as word (or letter) spans, each with its own stagger index */
function spans(text: string, cls: 'w' | 'l'): string {
  let i = 0;
  const parts = cls === 'w' ? text.split(/(\s+)/) : [...text];
  return parts.map((p) => (/^\s+$/.test(p) ? (cls === 'l' ? '&nbsp;' : ' ') : `<span class="${cls}" style="--i:${i++}">${esc(p)}</span>`)).join('');
}

let css = false;
function ensureCss(): void {
  if (css) return;
  css = true;
  const st = document.createElement('style');
  st.id = 'cine-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

class CineUI {
  private root: HTMLDivElement | null = null;
  private fadeEl!: HTMLDivElement;
  private subEl!: HTMLDivElement;
  private titleEl!: HTMLDivElement;
  private skipEl!: HTMLDivElement;
  private skipFg!: SVGCircleElement;
  private subT = 0;
  private titleT = 0;
  private skipShown = -1;
  /** closed: the cinematic is over, late subtitles (a timer, a voice callback) are dropped */
  private closed = false;

  private ensure(): boolean {
    if (this.root) return true;
    if (typeof document === 'undefined') return false;
    ensureCss();
    const r = document.createElement('div');
    r.className = 'cine';
    r.innerHTML = '<div class="cine__bar t"></div><div class="cine__bar b"></div><div class="cine__fade"></div>'
      + '<div class="cine__title"><div class="cine__name"></div><div class="cine__hair"></div><div class="cine__tsub"></div></div>'
      + '<div class="cine__sub" role="status" aria-live="polite"></div>'
      + '<div class="cine__skip"><svg viewBox="0 0 30 30"><circle class="bg" cx="15" cy="15" r="12"/><circle class="fg" cx="15" cy="15" r="12"/></svg><span>hold space to skip</span></div>';
    (document.getElementById('ui') ?? document.body).appendChild(r);
    this.root = r;
    this.fadeEl = r.querySelector('.cine__fade')!;
    this.subEl = r.querySelector('.cine__sub')!;
    this.titleEl = r.querySelector('.cine__title')!;
    this.skipEl = r.querySelector('.cine__skip')!;
    this.skipFg = r.querySelector('.cine__skip .fg')!;
    return true;
  }

  /** the 2.39:1 bars slide in (or out) */
  letterbox(on: boolean, secs = 1.3): void {
    if (!this.ensure()) return;
    for (const b of this.root!.querySelectorAll<HTMLElement>('.cine__bar')) b.style.transitionDuration = `${secs}s`;
    this.root!.classList.toggle('is-box', on);
  }
  get boxed(): boolean { return !!this.root?.classList.contains('is-box'); }

  /** to black (true) or back to the picture */
  fade(black: boolean, secs = 1.5): void {
    if (!this.ensure()) return;
    this.fadeEl.style.transitionDuration = `${secs}s`;
    this.fadeEl.style.opacity = black ? '1' : '0';
  }

  /** a subtitle line (words ink in one after another); dur in seconds, 0 = until the next one */
  subtitle(text: string, who = '', dur = 0): void {
    if (this.closed || !this.ensure()) return;
    clearTimeout(this.subT);
    const show = () => {
      this.subEl.innerHTML = (who ? `<span class="cine__who">${esc(who)}</span>` : '') + spans(text, 'w');
      void this.subEl.offsetWidth;
      this.subEl.classList.add('is-on');
      if (dur > 0) this.subT = window.setTimeout(() => this.clearSub(), dur * 1000);
    };
    if (this.subEl.classList.contains('is-on')) { this.subEl.classList.remove('is-on'); this.subT = window.setTimeout(show, 380); }
    else show();
  }
  /** the subtitle fades; hard: gone this frame, text and all (the hand-back) */
  clearSub(hard = false): void {
    if (!this.root) return;
    clearTimeout(this.subT);
    this.subEl.classList.remove('is-on');
    if (hard) { this.subEl.style.transition = 'none'; this.subEl.innerHTML = ''; void this.subEl.offsetWidth; this.subEl.style.transition = ''; }
  }
  /** a cinematic starts: subtitles allowed */
  open(): void { this.closed = false; }
  /** the cinematic is over: every subtitle goes now and none can come back until the next open() */
  close(): void { this.closed = true; this.clearSub(true); this.clearTitle(); this.skip(null); }

  /** the title card: the name letter by letter, tracking in slowly, a hairline, the place and time under it */
  title(text: string, sub = '', secs = 6): void {
    if (!this.ensure()) return;
    clearTimeout(this.titleT);
    this.titleEl.querySelector('.cine__name')!.innerHTML = spans(text, 'l');
    this.titleEl.querySelector('.cine__tsub')!.textContent = sub;
    this.titleEl.classList.remove('is-on');
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('is-on');
    if (secs > 0) this.titleT = window.setTimeout(() => this.titleEl.classList.remove('is-on'), secs * 1000);
  }
  clearTitle(): void { if (!this.root) return; clearTimeout(this.titleT); this.titleEl.classList.remove('is-on'); }

  /** the hold-to-skip ring: null hides it, 0..1 shows the hold progress */
  skip(p: number | null): void {
    if (!this.ensure()) return;
    const on = p !== null;
    if (on !== (this.skipShown >= 0)) this.skipEl.classList.toggle('is-on', on);
    const q = Math.round((p ?? 0) * 60) / 60;
    if (q !== this.skipShown) { this.skipFg.style.strokeDashoffset = String(75.4 * (1 - q)); }
    this.skipShown = on ? q : -1;
  }

  /** everything off (end of a cinematic) */
  clear(fadeSecs = 1.2): void {
    if (!this.root) return;
    this.clearSub(); this.clearTitle(); this.skip(null);
    this.letterbox(false, fadeSecs);
    this.fade(false, fadeSecs);
  }
}

export const cineUI = new CineUI();

// ---------------------------------------------------------------------------------------------- chapter cards
let cardSeq = 0;
let cardEl: HTMLDivElement | null = null;
/**
 * a chapter title card (Chapter.js's hour card, as BUSHED's chapter): the kicker ("Chapter One"), a hairline drawn
 * out from the middle, the title inked letter by letter, the hint under it; it holds, then fades. Resolves when gone.
 */
export async function chapterCard(o: { kicker?: string; title: string; sub?: string; secs?: number }): Promise<void> {
  if (typeof document === 'undefined') return;
  ensureCss();
  const seq = ++cardSeq;
  if (cardEl) { const old = cardEl; old.classList.remove('is-in'); setTimeout(() => old.remove(), 1300); cardEl = null; }
  const el = document.createElement('div');
  el.className = 'chcard';
  el.innerHTML = `<div class="chcard__in">${o.kicker ? `<div class="chcard__k">${esc(o.kicker)}</div><div class="chcard__hair"></div>` : ''}`
    + `<div class="chcard__t">${spans(o.title, 'l')}</div>${o.sub ? `<div class="chcard__s">${esc(o.sub)}</div>` : ''}</div>`;
  (document.getElementById('ui') ?? document.body).appendChild(el);
  cardEl = el;
  void el.offsetWidth;
  el.classList.add('is-in');
  const total = Math.max(2.5, o.secs ?? 5);
  await new Promise((r) => setTimeout(r, (total - 1.2) * 1000));
  if (seq !== cardSeq) return;
  el.classList.remove('is-in');
  cardEl = null;
  await new Promise((r) => setTimeout(r, 1300));
  el.remove();
}
