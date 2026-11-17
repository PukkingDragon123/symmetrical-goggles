// Pause: when the mouse is released the world holds its breath and a paper card slides in with the few settings
// a person might need. Click the card's "Back to the bush" (or the world) to continue. Settings persist locally.
import { paintPaper } from './paper';
import { input } from '../core/input';
import { audio } from '../audio/audio';

export interface Settings { sensitivity: number; volume: number; pixel: number; shadows: boolean }

const KEY = 'bushed.settings';
export function loadSettings(): Settings {
  const d: Settings = { sensitivity: 1, volume: 0.9, pixel: 2, shadows: true };
  try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* defaults */ }
  return d;
}
function saveSettings(s: Settings): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

const css = `
#pause { position: fixed; left: 50%; top: 50%; width: 384px; height: 512px; transform: translate(-50%, -46%) rotate(-1.2deg);
  background-size: cover; image-rendering: pixelated; box-shadow: 0 18px 40px rgba(0,0,0,.6); opacity: 0; pointer-events: none;
  transition: opacity .25s, transform .25s; font: 22px Caveat, cursive; color: #1f2433; }
#pause.on { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%) rotate(-1.2deg); }
#pause .in { position: absolute; left: 40px; right: 30px; top: 132px; }
#pause label { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; }
#pause input[type=range] { width: 150px; accent-color: #6b3a22; }
#pause button { font: 26px Caveat, cursive; background: none; border: none; border-bottom: 2px solid #6b3a22; color: #6b3a22; cursor: pointer; padding: 0 2px; }
#pause .keys { font-size: 18px; color: #3a3a46; margin-top: 18px; line-height: 1.25; }
`;

export class Pause {
  private el!: HTMLDivElement;
  open = false;
  readonly s = loadSettings();
  onChange: (s: Settings) => void = () => {};

  mount(root: HTMLElement, canvas: HTMLCanvasElement): void {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.id = 'pause';
    const paper = paintPaper([{ t: 'h', text: 'Holding still.' }, { t: 'p', text: 'The bush waits. It is good at waiting.' }], { style: 'notebook', seed: 77 });
    this.el.style.backgroundImage = `url(${paper.toDataURL()})`;
    this.el.innerHTML = `<div class="in">
      <label>Mouse <input id="p-sens" type="range" min="0.3" max="2.5" step="0.05"></label>
      <label>Volume <input id="p-vol" type="range" min="0" max="1" step="0.02"></label>
      <label>Pixel size <input id="p-px" type="range" min="1" max="4" step="1"></label>
      <label>Shadows <input id="p-sh" type="checkbox"></label>
      <div style="margin-top:14px"><button id="p-back">Back to the bush</button></div>
      <div class="keys">WASD walk · Shift run · E use · LMB swing/place · Q drop · R rotate · B pocket<br>1 axe · 2 hatchet · 3 maul/saw · 4 light · F flashlight · Tab journal · I pack</div>
    </div>`;
    root.appendChild(this.el);
    root.style.pointerEvents = 'none';
    const q = (id: string) => this.el.querySelector(`#${id}`) as HTMLInputElement;
    q('p-sens').value = String(this.s.sensitivity); q('p-vol').value = String(this.s.volume); q('p-px').value = String(this.s.pixel); q('p-sh').checked = this.s.shadows;
    const apply = () => {
      this.s.sensitivity = Number(q('p-sens').value); this.s.volume = Number(q('p-vol').value);
      this.s.pixel = Number(q('p-px').value); this.s.shadows = q('p-sh').checked;
      saveSettings(this.s); this.onChange(this.s);
    };
    for (const id of ['p-sens', 'p-vol', 'p-px', 'p-sh']) q(id).addEventListener('input', apply);
    q('p-back').addEventListener('click', () => { input.lock(); audio.unlock(); });
    document.addEventListener('pointerlockchange', () => this.set(!document.pointerLockElement && this.armed));
    void canvas;
    this.onChange(this.s);
  }

  /** only pause once the game has started (the menu runs unlocked) */
  armed = false;

  set(v: boolean): void {
    this.open = v;
    this.el?.classList.toggle('on', v);
    audio.setPaused(v);
  }
}
