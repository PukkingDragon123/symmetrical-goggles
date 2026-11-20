// The small mammals' real bodies: a red squirrel and a snowshoe hare (brown summer coat), rigged and animated glTF
// models (public/assets/models/creatures/squirrel|hare/, built by tools/blender/fauna/small.py from Sketchfab models,
// CC-BY 4.0: credits in CREDITS.md). Each critter of a kind clones one loaded asset (shared geometry, material, clips).
//   squirrel clips: idle (tail up in an S, looking round, tail flicks), run (a bound), eat, beg (sat up), alert, freeze
//   hare clips:     idle (ears swivelling, nose going), hop, run, freeze (ears flat), alert (sat tall), graze
// Wildlife (../wildlife.ts) owns the behaviour; MammalBody turns a critter's state and speed into clips.
import * as THREE from 'three';
import { RealBody, realAsset, realAssetNow, AX, type RealAsset } from '../game/realbody';
import { registerPreload } from '../preload';
import type { Species } from './models';

const FILE: Record<'squirrel' | 'hare', string> = { squirrel: 'squirrel/squirrel.glb', hare: 'hare/hare.glb' };
/** ground speed of the gaits at playback rate 1 (m/s) */
const NATURAL: Record<string, number> = { 'squirrel:run': 1.2, 'hare:hop': 0.9, 'hare:run': 1.6 };

export const isMammal = (k: Species): k is 'squirrel' | 'hare' => k === 'squirrel' || k === 'hare';
export function mammalAssetNow(k: 'squirrel' | 'hare'): RealAsset | null { return realAssetNow(FILE[k]); }
export function mammalAssetsAsync(): Promise<unknown> {
  return Promise.all((Object.keys(FILE) as ('squirrel' | 'hare')[]).map((k) => realAsset(FILE[k], { shineCol: 0xf0e0b0, cull: 2.5 }).catch(() => null)));
}
registerPreload('wildlife-mammals', () => mammalAssetsAsync());

/** what the body needs from a Critter */
interface CritterLike { state: string; speed: number; t: number; st: number; phase: number; alt: number; trunk: unknown; object: THREE.Object3D }

export class MammalBody {
  readonly body: RealBody;
  private idleAlt = 0;
  constructor(readonly kind: 'squirrel' | 'hare', asset: RealAsset) {
    this.body = new RealBody(asset);
    this.body.play('idle', { fade: 0, at: Math.random() });
  }
  pose(c: CritterLike, dt: number) {
    const b = this.body, k = this.kind, sp = c.speed;
    let clip: string;
    if (k === 'squirrel') {
      if (c.state === 'climb') clip = sp > 0.2 ? 'run' : 'freeze';
      else if (c.state === 'eat') clip = 'eat';
      else if (c.state === 'beg') clip = sp > 0.3 ? 'run' : 'beg';
      else if (sp > 0.25) clip = 'run';
      else if (c.state === 'freeze') clip = 'freeze';
      else if (c.state === 'alert') clip = 'alert';
      else clip = 'idle';
    } else {
      if (c.state === 'freeze') clip = 'freeze';
      else if (sp > 2.5 || c.state === 'flee') clip = 'run';
      else if (sp > 0.2) clip = 'hop';
      else if (c.state === 'alert') clip = 'alert';
      else {
        // between hops a hare sits, looks about, nibbles
        this.idleAlt -= dt;
        if (this.idleAlt < 0) this.idleAlt = 3 + Math.random() * 5;
        clip = this.idleAlt > 2.2 ? 'graze' : 'idle';
      }
    }
    if (clip !== b.current) b.play(clip, { fade: clip === 'freeze' ? 0.12 : 0.25, at: Math.random() * 0.5 });
    const nat = NATURAL[k + ':' + clip];
    b.speed = nat ? Math.min(2.4, Math.max(0.6, (c.state === 'climb' ? 1.2 : Math.max(sp, 0.3)) / nat)) : 1;
    b.update(dt);
    // a hare's nose and a squirrel's head never quite keep still
    if (clip === 'idle' && k === 'squirrel') b.turn(b.bone('head'), AX.y, 0.15 * Math.sin(c.t * 2.3 + c.phase * 6));
  }
}
