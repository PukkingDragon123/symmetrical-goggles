// Pixel buffer + canvas for one human's painted atlas (the subset of Gacha Garage's src/gfx/pix.js the people use).
import * as THREE from 'three';

export class Pix {
  readonly w: number; readonly h: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  img: ImageData;
  d: Uint8ClampedArray;
  /** pixel buffer newer than the canvas */
  dirty = false;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
    this.img = this.ctx.getImageData(0, 0, w, h);
    this.d = this.img.data;
  }
  flush(): this { if (this.dirty) { this.ctx.putImageData(this.img, 0, 0); this.dirty = false; } return this; }
  texture(): THREE.CanvasTexture {
    this.flush();
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    return t;
  }
}
