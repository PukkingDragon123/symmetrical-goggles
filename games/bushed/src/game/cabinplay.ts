// Cabin life: the actions the cabin's interactables ask the game for (stove, wood box, woodshed, chopping block,
// seats, bunk). Wood goes where you put it physically; the stove wants kindling first, then a match, then splits.
import * as THREE from 'three';
import type { Game } from './game';
import type { InteractCtx } from './interact';
import { registerInteractable } from './interact';
import { hud } from '../ui/hud';
import { anchorPos } from './flow';
import { input } from '../core/input';
import { debris } from '../gfx/particles';
import { WoodPiece } from '../chop/wood';

const think = (t: string, s = 3) => hud.say(`<i>${t}</i>`, s);

export class CabinPlay {
  private stoveOpen = false;
  private shedCount = 0;
  private sitting: { pos: THREE.Vector3; yaw: number } | null = null;

  constructor(private g: Game) {
    g.placeAction = (name, ctx) => this.act(name, ctx);
    // the limbed branches lying around become kindling when you gather them
    g.events.on('felled', () => {});
    g.updaters.push((dt) => this.update(dt));
  }

  /** after the cabin is built: let its doors make noise through the game */
  attach(): void {
    this.g.cabin?.group.traverse((o) => { o.userData.game = this.g; });
  }

  private carriedPiece(): WoodPiece | null {
    const h = this.g.hands.held;
    return h.kind === 'carry' && h.piece ? h.piece : null;
  }

  act(name: string, ctx: InteractCtx): void {
    const g = this.g;
    switch (name) {
      case 'stove_door':
        this.stoveOpen = !this.stoveOpen;
        g.sound(this.stoveOpen ? 'stove_open' : 'stove_close', anchorPos(g, 'stove', ctx.point), 0.8);
        g.stove.doorOpen = this.stoveOpen;
        break;
      case 'stove_feed': this.feedStove(ctx); break;
      case 'woodbox': this.putPiece('woodbox', new THREE.Vector3(0, 0.25, 0)); break;
      case 'woodshed': this.stack(); break;
      case 'block': {
        const p = this.carriedPiece();
        if (!p) { think(g.owns('axe_old') || g.owns('axe_splitting') || g.owns('maul') ? 'Stand a round on it and split it from above.' : 'Ray\'s old chopping block. Scarred like a cutting board.'); break; }
        if (p.kind === 'log') { think('Too long for the block. Buck it into rounds first.'); break; }
        const top = anchorPos(g, 'chopping_block', ctx.point);
        g.hands.release('place', top.clone().add(new THREE.Vector3(0, 0.01, 0)));
        break;
      }
      case 'sleep': this.sleep(); break;
      case 'sit_bench': case 'sit_porch': case 'sit_firepit': this.sit(ctx.point); break;
    }
  }

  private feedStove(ctx: InteractCtx): void {
    const g = this.g, s = g.stove;
    const at = anchorPos(g, 'stove_fire', ctx.point);
    const p = this.carriedPiece();
    if (!this.stoveOpen) { this.stoveOpen = true; g.stove.doorOpen = true; g.sound('stove_open', at, 0.8); }
    if (p) {
      g.hands.consumeCarried();
      g.chop.removePiece(p);
      if (!s.lit && s.kindling < 0.2) think('Big wood on a cold stove. It\'ll need kindling under it to catch.', 3.5);
      s.addWood(p.mass, p.kind === 'split' || p.kind === 'half' ? 'split' : 'round');
      g.sound('place_wood', at, 0.9);
      if (s.lit) { debris.emit('ember', at, new THREE.Vector3(0, 1.2, 0), 6, { spread: 0.8, color: new THREE.Color(1, 0.5, 0.15) }); g.sound('fire_ember_pop', at, 0.6); }
      g.piecePlaced(p, 'stove');
      return;
    }
    if (!s.lit) {
      if (s.kindling < 0.2) {
        if (g.take('kindling', 2)) { s.addWood(1.0, 'kindling'); g.sound('wood_chop_kindling', at, 0.5); think('Kindling in. Now a match.'); }
        else think('Needs kindling first. Snap up some branches, or split a piece small with the hatchet.', 4);
        return;
      }
      if (!g.owns('matches')) { think('No matches. Ray said the table drawer.', 3); return; }
      g.sound('match', at, 0.9);
      setTimeout(() => {
        if (s.light()) { g.sound('ignite', at, 0.8); debris.emit('spark', at, new THREE.Vector3(0, 1, 0), 10, { spread: 0.6, color: new THREE.Color(1, 0.6, 0.2) }); }
      }, 700);
      return;
    }
    think(s.fuel < 1.5 ? 'The fire wants more wood.' : 'The stove ticks and pings as it heats.', 2.5);
  }

  /** set the carried piece down inside a place anchor (physics does the rest) */
  private putPiece(anchor: string, off: THREE.Vector3): void {
    const g = this.g;
    const p = this.carriedPiece();
    if (!p) { think('The wood box. Splits go in here so they stay dry.'); return; }
    const at = anchorPos(g, anchor, g.player.pos).add(off).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25));
    g.hands.release('place', at);
  }

  /** neat rows in the woodshed: splits laid side by side, courses stacked up */
  private stack(): void {
    const g = this.g;
    const p = this.carriedPiece();
    if (!p) { think(this.shedCount ? `${this.shedCount} pieces stacked. Winter wants a lot more.` : 'The woodshed. Empty. That\'s a problem.'); return; }
    const base = anchorPos(g, 'woodshed_stack', g.player.pos);
    const shed = g.cabin?.anchors?.woodshed_stack as THREE.Object3D | undefined;
    const q = shed ? shed.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const perRow = 8, i = this.shedCount++;
    const row = i % perRow, course = Math.floor(i / perRow);
    const local = new THREE.Vector3((row - perRow / 2) * 0.17 + (course % 2) * 0.06, 0.1 + course * 0.13, 0);
    const at = base.clone().add(local.applyQuaternion(q));
    const hp = g.hands.consumeCarried();
    if (!hp) return;
    // lay it along the shed depth
    const lay = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    g.chop.group.add(hp.mesh);
    hp.spawn(at, lay);
    hp.stacked = true;
    g.sound('place_wood', at, 0.8);
    g.piecePlaced(hp, 'woodshed');
  }

  private sit(at: THREE.Vector3): void {
    const g = this.g;
    if (g.hands.busy) return;
    this.sitting = { pos: g.player.pos.clone(), yaw: g.player.yaw };
    g.player.enabled = false;
    g.timeScale = 30 * 4;
    g.camera.position.y -= 0.5;
    think('Sit a while. Listen to the bush.', 2.5);
    void at;
  }

  private sleep(): void {
    const g = this.g;
    if (g.hour > 6 && g.hour < 20.5) { think('Not tired yet. There\'s daylight left.'); return; }
    if (g.stove.lit === false && g.stove.roomTemp < 8) think('Cold in here. Should light the stove first...', 2.5);
    g.mode = 'sleep';
    hud.fadeTo(true, 2);
    setTimeout(() => {
      // the night passes: the stove burns down, the cabin cools
      const hours = ((24 - g.hour) + 7) % 24 || 9;
      for (let i = 0; i < hours * 6; i++) g.stove.update(600, -1);
      const cold = g.stove.roomTemp < 6;
      g.day++; g.survival.day = g.day;
      g.hour = 7;
      g.survival.warmth = cold ? 0.45 : 0.9;
      g.survival.stamina = 1;
      g.survival.kcal = Math.max(300, g.survival.kcal - 900);
      g.save();
      g.mode = 'walk';
      g.player.enabled = true;
      hud.fadeTo(false, 2.5);
      hud.title(`Day ${g.day + 1}`, cold ? 'the stove went out in the night' : 'morning', 3.5);
      if (cold) think('Woke up shivering. The stove went out. More wood, bigger pieces at night.', 5);
    }, 2500);
  }

  update(_dt: number): void {
    if (this.sitting && (input.pressed('KeyW') || input.pressed('KeyS') || input.pressed('KeyA') || input.pressed('KeyD') || input.pressed('KeyE') || input.pressed('Space'))) {
      this.g.player.enabled = true;
      this.g.timeScale = 30;
      this.sitting = null;
    }
  }
}

/** gathering limbed branches: each becomes kindling in the pack */
export function makeSlashGatherable(g: Game, holder: THREE.Object3D): void {
  registerInteractable(holder, {
    kind: 'pickup', label: () => 'Snap into kindling',
    use: () => {
      const d = holder.userData.slash as { body: unknown } | undefined;
      if (d?.body) (g as unknown as { removeSlash(h: THREE.Object3D): void }).removeSlash(holder);
      holder.removeFromParent();
      g.give('kindling', 2);
      g.sound('branch_snap', holder.position, 0.7);
      hud.say('<i>Kindling.</i>', 1.2);
    },
  });
}
