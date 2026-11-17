// Delivery zones: physical volumes that count the wood resting inside them (the cabin woodbox, the woodshed
// stack, the campground woodbox, the store's log deck and porch). Nothing is "turned in" through a menu; you
// put the wood there and somebody notices.
import * as THREE from 'three';
import type { WoodPiece } from '../chop/wood';

export interface Zone {
  name: string;
  box: THREE.Box3;
  /** pieces currently resting inside */
  inside: Set<WoodPiece>;
}

export class Zones {
  readonly list: Zone[] = [];
  private t = 0;

  add(name: string, center: THREE.Vector3, half: THREE.Vector3): Zone {
    const z = { name, box: new THREE.Box3(center.clone().sub(half), center.clone().add(half)), inside: new Set<WoodPiece>() };
    this.list.push(z);
    return z;
  }

  get(name: string): Zone | undefined { return this.list.find((z) => z.name === name); }

  /** re-count a few times a second */
  update(dt: number, pieces: Iterable<WoodPiece>): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.4;
    for (const z of this.list) z.inside.clear();
    for (const p of pieces) {
      if (!p.body) continue;
      const v = p.body.linvel();
      if (Math.hypot(v.x, v.y, v.z) > 0.3) continue;
      const pos = p.mesh.position;
      for (const z of this.list) if (z.box.containsPoint(pos)) z.inside.add(p);
    }
  }

  count(name: string, f: (p: WoodPiece) => boolean = () => true): number {
    const z = this.get(name);
    if (!z) return 0;
    let n = 0;
    for (const p of z.inside) if (f(p)) n++;
    return n;
  }
}
