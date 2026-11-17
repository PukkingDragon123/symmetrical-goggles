// Keyboard + mouse with pointer lock. Edge-triggered queries (pressed/released) are valid for one frame.
class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  sensitivity = 0.0022;
  private el: HTMLElement | null = null;

  attach(el: HTMLElement): void {
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (!this.down.has(k)) this.pressedSet.add(k);
      this.down.add(k);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); this.releasedSet.add(e.code); });
    window.addEventListener('mousedown', (e) => {
      const k = `Mouse${e.button}`;
      this.down.add(k); this.pressedSet.add(k);
    });
    window.addEventListener('mouseup', (e) => { const k = `Mouse${e.button}`; this.down.delete(k); this.releasedSet.add(k); });
    window.addEventListener('mousemove', (e) => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.el; });
    window.addEventListener('blur', () => this.down.clear());
  }

  lock(): void { if (this.el && !this.locked) this.el.requestPointerLock?.(); }
  unlock(): void { if (this.locked) document.exitPointerLock?.(); }

  held(k: string): boolean { return this.down.has(k); }
  pressed(k: string): boolean { return this.pressedSet.has(k); }
  released(k: string): boolean { return this.releasedSet.has(k); }
  axis(neg: string, pos: string): number { return (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0); }

  /** call at the end of every frame */
  endFrame(): void { this.pressedSet.clear(); this.releasedSet.clear(); this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0; }
}

export const input = new Input();
