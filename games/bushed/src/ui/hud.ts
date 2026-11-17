// The only overlay: a one-pixel dot, a pencilled interaction word near it, and spoken lines / thoughts at the
// bottom (dialogue is speech, not UI chrome). Everything else lives in the world.
const css = `
#hud-dot { position: fixed; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; background: rgba(240,232,210,0.55);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.35); image-rendering: pixelated; transition: transform .12s, opacity .2s; }
#hud-dot.charge { background: rgba(255,226,170,0.85); }
#hud-label { position: fixed; left: 50%; top: calc(50% + 22px); transform: translateX(-50%); font: 26px Caveat, cursive;
  color: #efe6cf; text-shadow: 0 2px 0 rgba(0,0,0,0.65), 0 0 6px rgba(0,0,0,0.5); letter-spacing: .5px; white-space: nowrap; opacity: 0; transition: opacity .15s; }
#hud-say { position: fixed; left: 50%; bottom: 9vh; transform: translateX(-50%); max-width: 60vw; text-align: center;
  font: 30px Caveat, cursive; color: #f3ead2; text-shadow: 0 2px 0 rgba(0,0,0,.8), 0 0 10px rgba(0,0,0,.6); opacity: 0; transition: opacity .35s; }
#hud-say b { color: #e7b46a; font-weight: normal; }
#hud-fade { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; transition: opacity 1.2s; }
#hud-title { position: fixed; left: 0; right: 0; top: 38vh; text-align: center; font: 64px IMFell, serif; color: #e9dcc0; opacity: 0;
  transition: opacity 2s; text-shadow: 0 3px 0 #000; letter-spacing: 6px; }
#hud-title small { display: block; font: 26px Caveat, cursive; letter-spacing: 1px; color: #c9b894; margin-top: 8px; }
#hud-charge { position: fixed; left: 50%; top: calc(50% + 10px); width: 0; height: 2px; transform: translateX(-50%);
  background: rgba(240,220,170,.6); transition: width .05s linear; }
`;

class Hud {
  private dot!: HTMLDivElement;
  private label!: HTMLDivElement;
  private say_!: HTMLDivElement;
  private fade!: HTMLDivElement;
  private title_!: HTMLDivElement;
  private charge!: HTMLDivElement;
  private sayT = 0;
  private queue: { text: string; dur: number }[] = [];
  visible = true;

  mount(root: HTMLElement): void {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const mk = (id: string) => { const d = document.createElement('div'); d.id = id; root.appendChild(d); return d; };
    this.dot = mk('hud-dot'); this.label = mk('hud-label'); this.say_ = mk('hud-say'); this.fade = mk('hud-fade'); this.title_ = mk('hud-title');
    this.charge = mk('hud-charge');
  }

  setLabel(t: string): void {
    if (!this.label) return;
    if (this.label.textContent !== t) this.label.textContent = t;
    this.label.style.opacity = t && this.visible ? '1' : '0';
  }

  setCharge(c: number): void {
    if (!this.charge) return;
    this.charge.style.width = `${Math.round(c * 34)}px`;
    this.dot.classList.toggle('charge', c > 0);
  }

  showDot(v: boolean): void { if (this.dot) this.dot.style.opacity = v && this.visible ? '1' : '0'; }

  /** a spoken line or a thought: "<b>Odile:</b> ..." */
  say(text: string, dur = 3.5): void {
    this.queue.push({ text, dur });
    if (this.sayT <= 0) this.next();
  }

  private next(): void {
    const n = this.queue.shift();
    if (!n) { this.say_.style.opacity = '0'; return; }
    this.say_.innerHTML = n.text;
    this.say_.style.opacity = '1';
    this.sayT = n.dur;
  }

  fadeTo(black: boolean, secs = 1.2): void {
    if (!this.fade) return;
    this.fade.style.transition = `opacity ${secs}s`;
    this.fade.style.opacity = black ? '1' : '0';
  }

  title(text: string, sub = '', secs = 4): void {
    this.title_.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.title_.style.opacity = '1';
    setTimeout(() => (this.title_.style.opacity = '0'), secs * 1000);
  }

  update(dt: number): void {
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.next(); }
  }

  get speaking(): boolean { return this.sayT > 0; }
}

export const hud = new Hud();
