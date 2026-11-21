// Dialogue subtitles: the speaker's name over the line, the line typed out in step with the voice (each syllable
// reveals its letters as it is spoken), Alagard pixel type with a hard outline. Cryptid thoughts are set in a pale
// italic with no name. Presentation after the Dialogue / Subtitles UI of the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/game/Dialogue.js, src/ui/Subtitles.js).
import type { VoiceLine } from '../../audio/voice';

const css = `
#talk-sub { position: fixed; left: 50%; bottom: 11vh; transform: translateX(-50%); width: min(78vw, 980px); text-align: center; z-index: 26;
  pointer-events: none; font-family: Alagard, monospace; -webkit-font-smoothing: none; opacity: 0; transition: opacity .25s; }
#talk-sub .who { display: block; font-size: 22px; letter-spacing: 3px; color: #e2a35a; margin-bottom: 6px; text-transform: uppercase;
  text-shadow: 2px 0 0 #120d0a, -2px 0 0 #120d0a, 0 2px 0 #120d0a, 0 -2px 0 #120d0a; }
#talk-sub .line { font-size: 30px; line-height: 1.15; color: #f1e6c8; white-space: pre-wrap;
  text-shadow: 2px 0 0 #120d0a, -2px 0 0 #120d0a, 0 2px 0 #120d0a, 0 -2px 0 #120d0a, 2px 2px 0 #120d0a, -2px 2px 0 #120d0a, 2px -2px 0 #120d0a, -2px -2px 0 #120d0a, 0 4px 0 rgba(0,0,0,.45); }
#talk-sub .line .rest { color: transparent; text-shadow: none; }
#talk-sub.thought .line { color: #cfc6b0; font-style: italic; }
#talk-sub.creature .line { color: #c9d6b8; letter-spacing: 1px; }
#talk-sub .hint { display: block; margin-top: 10px; font-size: 14px; color: rgba(230,220,200,.45); letter-spacing: 1px; }
@media (max-width: 700px) { #talk-sub .line { font-size: 22px; } #talk-sub .who { font-size: 16px; } }
`;

export class Subtitles {
  private root: HTMLDivElement | null = null;
  private whoEl!: HTMLSpanElement;
  private shownEl!: HTMLSpanElement;
  private restEl!: HTMLSpanElement;
  private hintEl!: HTMLSpanElement;
  private text = '';
  private line: VoiceLine | null = null;
  private shown = -1;
  private hideT = 0;
  private t = 0;
  private cps = 32;

  private mount(): void {
    if (this.root || typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const r = (this.root = document.createElement('div'));
    r.id = 'talk-sub';
    this.whoEl = document.createElement('span'); this.whoEl.className = 'who';
    const ln = document.createElement('div'); ln.className = 'line';
    this.shownEl = document.createElement('span');
    this.restEl = document.createElement('span'); this.restEl.className = 'rest';
    ln.append(this.shownEl, this.restEl);
    this.hintEl = document.createElement('span'); this.hintEl.className = 'hint';
    r.append(this.whoEl, ln, this.hintEl);
    document.body.appendChild(r);
  }

  /** show a line; `line` is the voice it types along with (null: types at reading speed) */
  show(who: string, text: string, line: VoiceLine | null, o: { kind?: 'speech' | 'thought' | 'creature'; hold?: number; hint?: string } = {}): void {
    this.mount();
    if (!this.root) return;
    this.text = text; this.line = line; this.shown = -1; this.t = 0;
    this.root.className = o.kind && o.kind !== 'speech' ? o.kind : '';
    this.whoEl.textContent = who;
    this.whoEl.style.display = who ? '' : 'none';
    this.hintEl.textContent = o.hint ?? '';
    this.hideT = o.hold ?? 0;
    this.root.style.opacity = '1';
    this.render(0);
  }

  hide(): void { if (this.root) this.root.style.opacity = '0'; this.line = null; this.hideT = 0; }

  setHint(h: string): void { if (this.root && this.hintEl.textContent !== h) this.hintEl.textContent = h; }

  get visible(): boolean { return !!this.root && this.root.style.opacity === '1'; }

  update(dt: number): void {
    if (!this.root || !this.visible) return;
    this.t += dt;
    const n = this.line ? this.line.revealed() : Math.min(this.text.length, Math.floor(this.t * this.cps));
    this.render(n);
    if (this.hideT > 0) { this.hideT -= dt; if (this.hideT <= 0) this.hide(); }
  }

  private render(n: number): void {
    if (n === this.shown) return;
    this.shown = n;
    this.shownEl.textContent = this.text.slice(0, n);
    this.restEl.textContent = this.text.slice(n);
  }
}
