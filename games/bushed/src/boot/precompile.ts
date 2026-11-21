// Shader precompilation. Programs are keyed on the material, the object (skinning, instancing...), the scene's
// lights, fog and the render target's colour space, so the world is compiled into the renderer's own scene target
// after the matte shading patch, exactly as Renderer.render will draw it. With KHR_parallel_shader_compile the
// GPU compiles in the background and the promise resolves when every program is ready; without it the compile
// commands are still queued at once, and the first frame waits only for whatever is left.
import * as THREE from 'three';
import { mattePass } from '../gfx/matte';
import { bitmapize } from './images';
import type { Game } from '../game/game';

export function parallelCompile(game: Game): boolean {
  return !!game.R.gl.extensions.get('KHR_parallel_shader_compile');
}

/** start compiling `root` (a scene, or a subtree to be drawn in `target`); resolves when its programs are ready */
export function precompile(game: Game, root: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene): Promise<unknown> {
  const gl = game.R.gl;
  const rt = (game.R as unknown as { rt?: THREE.WebGLRenderTarget }).rt ?? null;
  const prev = gl.getRenderTarget();
  let p: Promise<unknown> = Promise.resolve();
  // a subtree already in the scene would have its lights counted twice (once via the scene, once via itself): take
  // it out of its parent for the synchronous part of the call, without events, and put it back
  const parent = root !== target ? root.parent : null;
  const at = parent ? parent.children.indexOf(root) : -1;
  try {
    mattePass(root, Math.min(8, gl.capabilities.getMaxAnisotropy()));
    if (rt) gl.setRenderTarget(rt);
    if (parent && at >= 0) { parent.children.splice(at, 1); (root as { parent: THREE.Object3D | null }).parent = null; }
    p = gl.compileAsync(root, camera, target);
  } catch (e) {
    console.warn('[boot] precompile failed', e);
  } finally {
    if (parent && at >= 0) { parent.children.splice(at, 0, root); (root as { parent: THREE.Object3D | null }).parent = parent; }
    gl.setRenderTarget(prev);
  }
  return p.catch(() => undefined);
}

/**
 * While things stream in after the first frame: every object added to the scene is held back from drawing until its
 * images are decoded and its shaders are ready (so a creature or a shop appearing never stalls a frame), then shown.
 * Game code that sets `visible` in that short window is remembered and honoured. Only where the GPU compiles in
 * the background (KHR_parallel_shader_compile: every desktop Chrome/Electron on a real GPU); elsewhere it only
 * decodes images.
 */
export class Holdback {
  private pending: THREE.Object3D[] = [];
  private queued = false;
  private on = false;
  held = 0;
  private readonly onAdd = (e: { child: THREE.Object3D }) => {
    if (!this.on || e.child.name.startsWith('boot:')) return;
    this.pending.push(e.child);
    if (!this.queued) { this.queued = true; queueMicrotask(() => this.flush()); }
  };

  constructor(private readonly game: Game) {}

  start(): void {
    if (this.on) return;
    this.on = true;
    this.game.scene.addEventListener('childadded' as never, this.onAdd as never);
  }
  stop(): void {
    this.on = false;
    this.game.scene.removeEventListener('childadded' as never, this.onAdd as never);
  }

  private flush(): void {
    this.queued = false;
    const list = this.pending.splice(0);
    const gl = this.game.R.gl;
    // without KHR_parallel_shader_compile a compile blocks the first draw whenever it is queued, so holding an
    // object back gains nothing: only its images are decoded off the main thread (in time for most of them)
    const lite = !parallelCompile(this.game);
    for (const o of list) {
      if (!o.parent) continue;
      if (lite) { void bitmapize(gl, o); continue; }
      if (!o.visible) { void bitmapize(gl, o).then(() => precompile(this.game, o, this.game.camera, this.game.scene)); continue; }
      // hide behind an accessor: rendering sees false, a game write is kept and applied when the hold ends
      let want = true;
      const hide = () => Object.defineProperty(o, 'visible', { configurable: true, enumerable: true, get: () => false, set: (v: boolean) => { want = v; } });
      const show = (v: boolean) => Object.defineProperty(o, 'visible', { configurable: true, enumerable: true, writable: true, value: v });
      hide();
      this.held++;
      const ready = bitmapize(gl, o).then(() => {
        // compile while it counts as visible (its own lights included), then keep holding until the GPU is done
        show(true);
        const p = precompile(this.game, o, this.game.camera, this.game.scene);
        hide();
        return p;
      });
      // never hold anything longer than 3 s
      const release = () => { show(want); };
      Promise.race([ready, new Promise((r) => setTimeout(r, 3000))]).then(release, release);
    }
  }
}
