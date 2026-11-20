// Ground disturbance map: a moving window (128 m, 1024 px = 12.5 cm/px) centred near the player, painted with
// wheel tracks, drag marks, trampled paths, mud splashes and dug holes. The terrain shader reads it.
//   R = compression / trampling (darkens, reveals soil)    G = wheel ruts (mud)
//   B = drag scrape (stripped litter, raw soil). The canvas stays opaque black (additive RGB only), because
//   canvas alpha is premultiplied and would corrupt data channels.
// Stamps are pre-rendered soft sprites (one per channel) drawn with a transform, so painting allocates nothing.
import * as THREE from 'three';

export const MARKS_SIZE = 128;
const RES = 1024;
const SPR = 64;

class Marks {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  /** world xz of the window's min corner */
  readonly origin = new THREE.Vector2(-MARKS_SIZE / 2, -MARKS_SIZE / 2);
  readonly uOrigin = { value: this.origin };
  readonly uSize = { value: MARKS_SIZE };
  private dirty = false;
  private tmp: HTMLCanvasElement;
  private sprites: HTMLCanvasElement[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = RES;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, RES, RES);
    this.tmp = document.createElement('canvas');
    this.tmp.width = this.tmp.height = RES;
    for (let ch = 0; ch < 3; ch++) {
      const c = document.createElement('canvas');
      c.width = c.height = SPR;
      const g = c.getContext('2d')!;
      const col = [0, 0, 0]; col[ch] = 255;
      const gr = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},1)`);
      gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, SPR, SPR);
      this.sprites.push(c);
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.premultiplyAlpha = false;
  }

  /** keep the window centred near (x, z); shifts the painted content in 16 m steps */
  follow(x: number, z: number): void {
    const half = MARKS_SIZE / 2, step = 16;
    const cx = this.origin.x + half, cz = this.origin.y + half;
    if (Math.abs(x - cx) < step && Math.abs(z - cz) < step) return;
    const nx = Math.round((x - half) / step) * step, nz = Math.round((z - half) / step) * step;
    const dx = Math.round(((this.origin.x - nx) / MARKS_SIZE) * RES), dz = Math.round(((this.origin.y - nz) / MARKS_SIZE) * RES);
    const t = this.tmp.getContext('2d')!;
    t.globalCompositeOperation = 'copy';
    t.drawImage(this.canvas, 0, 0);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, RES, RES);
    this.ctx.drawImage(this.tmp, dx, dz);
    this.origin.set(nx, nz);
    this.dirty = true;
  }

  /** world -> canvas pixel */
  px(x: number, z: number): [number, number] {
    return [((x - this.origin.x) / MARKS_SIZE) * RES, ((z - this.origin.y) / MARKS_SIZE) * RES];
  }

  /** soft elliptical stamp. ch: 0..2 = R,G,B channel, amt 0..1 */
  stamp(ch: 0 | 1 | 2, x: number, z: number, rx: number, rz: number, angle: number, amt: number): void {
    const px = ((x - this.origin.x) / MARKS_SIZE) * RES, pz = ((z - this.origin.y) / MARKS_SIZE) * RES;
    if (px < -50 || pz < -50 || px > RES + 50 || pz > RES + 50) return;
    const a = Math.max(0, Math.min(1, amt));
    if (a <= 0) return;
    const c = this.ctx;
    const sx = Math.max(0.5, (rx / MARKS_SIZE) * RES), sz = Math.max(0.5, (rz / MARKS_SIZE) * RES);
    const co = Math.cos(angle), si = Math.sin(angle);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a;
    // translate, rotate, scale to the ellipse; the sprite spans [-1, 1]
    c.setTransform(co * sx * 2 / SPR, si * sx * 2 / SPR, -si * sz * 2 / SPR, co * sz * 2 / SPR, px, pz);
    c.drawImage(this.sprites[ch], -SPR / 2, -SPR / 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }

  /** a line of stamps (tyre track, drag mark) */
  line(ch: 0 | 1 | 2, x0: number, z0: number, x1: number, z1: number, width: number, amt: number): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / (width * 0.5)));
    const ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.stamp(ch, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, width, width * 0.8, ang, amt);
    }
  }

  flush(): void {
    if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; }
  }
}

export const marks = new Marks();
