// Interaction contract. Anything the player can use is an Interactable registered on an Object3D:
//   registerInteractable(obj, { kind: 'door', label: () => 'Open', use: (ctx) => ... })
// The player's interaction ray (src/player/hands.ts) finds the nearest registered ancestor of whatever mesh it
// hits (by raycasting the scene, or the physics collider's owner object), shows the label as a tiny pencilled
// hint, and calls use() on E / left click (primary) or alt() on right click.
import * as THREE from 'three';

export type InteractKind =
  | 'door' | 'drawer' | 'pickup' | 'stove' | 'bed' | 'switch' | 'board' | 'paper' | 'register' | 'seat'
  | 'container' | 'vehicle' | 'npc' | 'creature' | 'block' | 'custom';

export interface InteractCtx {
  /** what the player holds right now (item id) or '' */
  held: string;
  /** world point that was hit */
  point: THREE.Vector3;
  /** game services (set by the game; loosely typed to keep this module dependency-free) */
  game: any;
}

export interface Interactable {
  kind: InteractKind;
  /** short verb phrase shown near the crosshair, e.g. 'Open', 'Take kindling', 'Light stove'. '' hides it */
  label: (ctx: InteractCtx) => string;
  use: (ctx: InteractCtx) => void;
  alt?: (ctx: InteractCtx) => void;
  altLabel?: (ctx: InteractCtx) => string;
  /** max reach in metres (default 2.2) */
  reach?: number;
  enabled?: () => boolean;
}

const KEY = '__interact';

export function registerInteractable(obj: THREE.Object3D, it: Interactable): Interactable {
  obj.userData[KEY] = it;
  return it;
}

export function unregisterInteractable(obj: THREE.Object3D): void { delete obj.userData[KEY]; }

/** walk up from a hit object to the first registered interactable */
export function findInteractable(obj: THREE.Object3D | null): { obj: THREE.Object3D; it: Interactable } | null {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const it = o.userData[KEY] as Interactable | undefined;
    if (it && (it.enabled?.() ?? true)) return { obj: o, it };
  }
  return null;
}

/**
 * Hinged door helper: swings `leaf` about its local Y axis (put the pivot on the hinge) with a little spring,
 * creak-sound hook, and an open/closed state. Returns the interactable.
 */
export function hingedDoor(leaf: THREE.Object3D, opts: { openAngle?: number; onSound?: (open: boolean) => void; locked?: () => boolean } = {}): Interactable & { open: boolean; update(dt: number): void } {
  const target = { a: 0 };
  let a = 0, v = 0;
  const base = leaf.rotation.y;
  const door = {
    kind: 'door' as const,
    open: false,
    label: () => (opts.locked?.() ? 'Locked' : door.open ? 'Close' : 'Open'),
    use: () => {
      if (opts.locked?.()) return;
      door.open = !door.open;
      target.a = door.open ? opts.openAngle ?? 1.7 : 0;
      opts.onSound?.(door.open);
    },
    update: (dt: number) => {
      const k = 18, c = 7;
      v += ((target.a - a) * k - v * c) * dt;
      a += v * dt;
      leaf.rotation.y = base + a;
    },
  };
  registerInteractable(leaf, door);
  return door;
}

/** sliding drawer helper along local +Z */
export function slidingDrawer(drawer: THREE.Object3D, travel: number, onSound?: (open: boolean) => void): Interactable & { open: boolean; update(dt: number): void } {
  const z0 = drawer.position.z;
  let z = 0;
  const d = {
    kind: 'drawer' as const,
    open: false,
    label: () => (d.open ? 'Close' : 'Open'),
    use: () => { d.open = !d.open; onSound?.(d.open); },
    update: (dt: number) => { z += ((d.open ? travel : 0) - z) * Math.min(1, dt * 10); drawer.position.z = z0 + z; },
  };
  registerInteractable(drawer, d);
  return d;
}
