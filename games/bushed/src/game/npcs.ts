// People of Kettle Lake. Each has a place for each part of the day, walks between them, does something there
// (leans on the counter, warms hands at a fire, sits on a log), turns to look at you when you come close, and
// talks when spoken to. Some say useful things. Most say true things. A few are just being polite.
//
// The story (src/game/stories) adds people with addNpc(), speaks through them with npc.say(lines), moves them
// with npc.override (a scripted stop that wins over the timetable), hides them (npc.hidden) and answers for them
// first through npcTalkHooks (quest lines before small talk).
import * as THREE from 'three';
import type { Game } from './game';
import { buildHuman, makeLook, variant, LOOK_IDS, type HumanModel, type NpcAnim, type LookId, type HumanLook } from '../humans';
import { SPOTS, heightAt } from '../world/layout';
import { registerInteractable } from './interact';
import { hud } from '../ui/hud';
import { floatText } from '../ui/float';
import { ODILE, DOUG, GERARD_MORE, line, speak } from './dialogue';
import { flameCards } from '../places/fixtures';
import { campfire } from './flow';
import { buildPieceGeometry, barkMaterial } from '../chop/wood';
import { woodMaterial } from '../chop/woodtex';
import { physics, RAPIER } from '../physics/physics';

export interface Stop { from: number; to: number; at: THREE.Vector3; face: number; anim: NpcAnim }
export interface NpcDef {
  id: string; name: string; look: LookId | HumanLook; stops: Stop[];
  talk: (g: Game, n: Npc) => string | string[];
  ambient?: string[];
  /** starts hidden (the story shows them) */
  hidden?: boolean;
}

/** answered before an NPC's own small talk: return a line (or several, said in turn) or null to pass */
export const npcTalkHooks: ((g: Game, n: Npc) => string | string[] | null)[] = [];
/** everybody, by id */
export const NPCS = new Map<string, Npc>();
/** no overheard chatter near this point (a tale is being told) */
export const chatter: { quietAt: THREE.Vector3 | null } = { quietAt: null };

/** ground point (feet) */
export const P = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);
/** the yaw that turns a model (facing +Z) at `from` toward `to` */
export const faceTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

/** a preset look if this build of src/humans has it, else a jittered copy of a fallback preset */
export function lookOr(id: string, fallback: LookId, seed: number): LookId | HumanLook {
  return (LOOK_IDS as string[]).includes(id) ? (id as LookId) : variant(makeLook(fallback), seed);
}

/** where folk stand round the campground fire: three log benches, and standing room between them */
export const FIRE_BENCH = [Math.atan2(1.1, 1.7), Math.atan2(1.1, 1.7) + 2.1, Math.atan2(1.1, 1.7) + 4.1];
export const FIRE_STAND = [1.35, 1.95, 3.4, 3.95, 5.4, 6.0];
export function fireSlot(angle: number, r: number, anim: NpcAnim, from = 0, to = 24): Stop {
  const cs = SPOTS.campsite;
  const at = P(cs.x + Math.cos(angle) * r, cs.z + Math.sin(angle) * r, anim === 'sit' ? -0.1 : 0);
  return { from, to, at, face: Math.atan2(-Math.cos(angle), -Math.sin(angle)), anim };
}

const MARCEL = [
  "Marcel. Forty years cutting in these woods. I don't go in the cedar hollow. Not because of what's in there. Because of how polite it is.",
  'That rubber thing in the old burn? I shot at it once. Once. The bullet came back and took my hat.',
  'Your uncle said goodnight to the trees. Out loud. Every night. I used to laugh. I say it now too.',
  "Notch on the side you want it to go. Don't argue with the lean. The tree's been standing there longer than you've been arguing.",
  'Ray had a trapline north of the lake. Never once saw him carry a pelt home. Never once saw him come home hungry either.',
];
const HUNTER = [
  'Tracks by the creek. Seventeen inches heel to toe. You did not see me measure that.',
  "My dad said don't shoot the big ones. Not because you'd miss. Because they'd remember.",
  'Something knocked three times on a tree back there. I knocked back. Felt rude not to.',
  'Saw smoke over the north shore last week. Nobody lives up there. Nobody with a chimney, anyway.',
];
const CAMPERS = [
  "...and he says 'why are you walking backwards?' and the thing behind the tree says, 'I'm not.'",
  "My cousin says the Hidebehind can't stand you looking right at it. So he walked home backwards. Took him eleven hours.",
  "Shh. Did you hear that? ...No, that's Doug snoring in the truck.",
  'Marshmallow? We have like four hundred. Doug bought the wrong size bag.',
];

const _to = new THREE.Vector3();

export class Npc {
  readonly model: HumanModel;
  /** a scripted place that wins over the timetable (null: follow the stops) */
  override: { at: THREE.Vector3; face: number; anim: NpcAnim; speed?: number } | null = null;
  hidden = false;
  private target: { at: THREE.Vector3; face: number; anim: NpcAnim } | null = null;
  private walking = false;
  private talkT = 0;
  private ambientT = 20 + Math.random() * 30;
  private queue: { text: string; dur: number }[] = [];
  private queueT = 0;
  constructor(readonly def: NpcDef, private g: Game) {
    this.model = buildHuman(def.look);
    this.hidden = !!def.hidden;
    g.scene.add(this.model.root);
    floatText.speakers.set(def.name, this.model.root);
    const s = def.stops[0];
    this.model.root.position.copy(s.at);
    this.model.root.rotation.y = s.face;
    NPCS.set(def.id, this);
    registerInteractable(this.model.root, {
      kind: 'npc', label: () => `Talk to ${def.name}`, reach: 2.8, enabled: () => !this.hidden,
      use: () => {
        if (this.queue.length) return;
        let said: string | string[] | null = null;
        for (const h of npcTalkHooks) { said = h(g, this); if (said) break; }
        this.say(said ?? def.talk(g, this));
        this.model.anim.lookAt(g.camera.position);
      },
    });
  }

  get name(): string { return this.def.name; }
  get busy(): boolean { return this.queue.length > 0 || this.queueT > 0; }

  /** say a line now, or several in turn (each waits for the one before to be read) */
  say(lines: string | string[], gap = 0.6): void {
    const arr = Array.isArray(lines) ? lines : [lines];
    for (const t of arr) if (t) this.queue.push({ text: t, dur: Math.min(9, 2.2 + t.split(/\s+/).length * 0.3) + gap });
    if (this.queueT <= 0) this.next();
  }

  /** stop talking (the rest of the queue is dropped) */
  hush(): void { this.queue = []; this.queueT = 0; this.talkT = 0; this.model.anim.talking = false; }

  private next(): void {
    const n = this.queue.shift();
    if (!n) { this.queueT = 0; return; }
    hud.say(speak(this.def.name, n.text), n.dur - 0.3);
    this.model.anim.talking = true; this.talkT = n.dur;
    this.queueT = n.dur;
  }

  private want(hour: number): { at: THREE.Vector3; face: number; anim: NpcAnim } {
    if (this.override) return this.override;
    return this.def.stops.find((s) => (s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to)) ?? this.def.stops[0];
  }

  /** jump straight to where the timetable says (after loading, or when shown) */
  snap(): void {
    const w = this.want(this.g.hour);
    this.target = w; this.walking = false;
    this.model.root.position.copy(w.at); this.model.root.rotation.y = w.face;
    this.model.anim.play(w.anim);
  }

  update(dt: number): void {
    const g = this.g, m = this.model, root = m.root;
    if (this.queueT > 0) { this.queueT -= dt; if (this.queueT <= 0) this.next(); }
    const dist = root.position.distanceTo(g.player.pos);
    root.visible = !this.hidden && dist < 140;
    const w = this.want(g.hour);
    if (w !== this.target) { this.target = w; this.walking = true; }
    if (!root.visible) {
      // nobody watching: no need to walk the whole way
      if (this.walking && dist > 160) { root.position.copy(w.at); root.rotation.y = w.face; this.walking = false; m.anim.play(w.anim); }
      return;
    }
    if (this.walking) {
      _to.copy(w.at).sub(root.position); _to.y = 0;
      const d = _to.length();
      if (d < 0.15) { this.walking = false; m.anim.play(w.anim); root.rotation.y = w.face; root.position.y = w.at.y; }
      else {
        m.anim.play('walk');
        const step = Math.min(d, (this.override?.speed ?? 1.25) * dt);
        root.position.addScaledVector(_to.normalize(), step);
        root.position.y = heightAt(root.position.x, root.position.z);
        root.rotation.y = Math.atan2(_to.x, _to.z);
      }
    }
    // turn the head to the player when close
    m.anim.lookAt(dist < 6 ? g.camera.position : null);
    if (this.talkT > 0) { this.talkT -= dt; if (this.talkT <= 0) m.anim.talking = false; }
    // overheard lines
    if (this.def.ambient && dist < 9 && !this.busy && !(chatter.quietAt && root.position.distanceTo(chatter.quietAt) < 14)) {
      this.ambientT -= dt;
      if (this.ambientT <= 0 && !hud.speaking) {
        this.ambientT = 22 + Math.random() * 25;
        this.say(line(this.def.ambient, this.def.id));
      }
    }
    m.anim.update(dt);
  }
}

/** add a person after the town is up (the story's people); they walk and talk like everybody else */
export function addNpc(g: Game, def: NpcDef): Npc {
  const n = new Npc(def, g);
  g.updaters.push((dt) => n.update(dt));
  return n;
}

export function spawnNpcs(g: Game): Npc[] {
  const st = SPOTS.store, cs = SPOTS.campsite;
  // the shopkeeper's spot comes from the store if it is built
  const counter = (g.store?.anchors?.shopkeeper_spot as THREE.Object3D | undefined)?.getWorldPosition(new THREE.Vector3()) ?? P(st.x, st.z + 3);
  // the sit pose puts the hips 0.47 m above the feet: the porch anchor is the seat, so the feet go below it
  const porchObj = g.store?.anchors?.porch_bench as THREE.Object3D | undefined;
  const porch = porchObj ? porchObj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.47, 0)) : P(st.x + 3, st.z - 9);
  const porchYaw = porchObj ? new THREE.Euler().setFromQuaternion(porchObj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
  const shopFace = (g.store?.anchors?.shopkeeper_spot as THREE.Object3D | undefined)?.getWorldQuaternion(new THREE.Quaternion());
  const shopYaw = shopFace ? new THREE.Euler().setFromQuaternion(shopFace).y : Math.PI;
  const defs: NpcDef[] = [
    {
      id: 'gerard', name: 'Gérard', look: 'shopkeeper',
      stops: [
        { from: 7, to: 21, at: counter, face: shopYaw, anim: 'lean' },
        { from: 21, to: 23, at: porch, face: porchYaw, anim: 'sit' },
        { from: 23, to: 7, at: counter, face: shopYaw, anim: 'count' },
      ],
      talk: (game) => {
        if (!game.flags.has('met_gerard')) { game.flags.add('met_gerard'); return line(ODILE.first, 'first'); }
        const h = game.hour;
        const pool = Math.random() < 0.45 ? [...ODILE.rumorHound, ...ODILE.rumorBigfoot, ...ODILE.rumorGumberoo, ...ODILE.rumorGranny, ...ODILE.rumorRay, ...GERARD_MORE]
          : game.weather.rain > 0.3 ? ODILE.greetRain : h < 12 ? ODILE.greetMorning : h > 18 ? [...ODILE.greetEvening, ...ODILE.warnNight] : [...ODILE.browse, ...ODILE.contract];
        return line(pool, 'gerard');
      },
    },
    {
      id: 'doug', name: 'Doug', look: 'camper',
      stops: [{ from: 6, to: 17, at: P(cs.x + 4, cs.z - 3), face: 1.2, anim: 'chop' }, fireSlot(FIRE_STAND[0], 2.7, 'warm', 17, 6)],
      talk: (game) => line(game.flags.has('met_doug') ? DOUG.story : (game.flags.add('met_doug'), DOUG.hello), 'doug'),
    },
    {
      id: 'camper', name: 'Camper', look: variant(makeLook('camper'), 4242),
      stops: [fireSlot(FIRE_BENCH[0], 2.0, 'sit')],
      talk: () => line(CAMPERS, 'campers'), ambient: CAMPERS,
    },
    {
      id: 'marcel', name: 'Marcel', look: 'oldLogger',
      stops: [{ from: 6, to: 19, at: P(132, -40), face: -1.4, anim: 'sit' }, fireSlot(FIRE_STAND[1], 2.7, 'warm', 19, 6)],
      talk: () => line(MARCEL, 'marcel'),
    },
    {
      id: 'hunter', name: 'Hunter', look: 'hunter',
      stops: [{ from: 5, to: 9, at: P(40, 250), face: 0.4, anim: 'point' }, { from: 9, to: 17, at: P(cs.x + 6, cs.z + 4), face: -2.6, anim: 'idle' }, { from: 17, to: 21, at: P(40, 250), face: 0.4, anim: 'point' }, fireSlot(FIRE_STAND[2], 2.7, 'warm', 21, 5)],
      talk: () => line(HUNTER, 'hunter'),
    },
  ];
  // log benches round the fire (the camper sits on the first)
  for (const [a, sp] of [[FIRE_BENCH[0], 'spruce'], [FIRE_BENCH[1], 'pine'], [FIRE_BENCH[2], 'birch']] as [number, 'spruce' | 'pine' | 'birch'][]) {
    const bx = cs.x + Math.cos(a) * 2.05, bz = cs.z + Math.sin(a) * 2.05;
    const g0 = buildPieceGeometry({ species: sp, stem: [{ y: 0, r: 0.2, x: 0, z: 0 }, { y: 2, r: 0.18, x: 0, z: 0 }], y0: 0, y1: 1.7, seed: Math.round(a * 100) });
    const bench = new THREE.Mesh(g0.geo, [barkMaterial(sp), woodMaterial('end', sp, 2), woodMaterial('split', sp)]);
    bench.position.set(bx, heightAt(bx, bz) + 0.17, bz);
    // lie along the tangent of the ring
    bench.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)));
    bench.castShadow = bench.receiveShadow = true;
    g.scene.add(bench);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(bench.position.x, bench.position.y, bench.position.z)
      .setRotation({ x: bench.quaternion.x, y: bench.quaternion.y, z: bench.quaternion.z, w: bench.quaternion.w }));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.85, 0.19), body);
    registerInteractable(bench, { kind: 'seat', label: () => 'Sit by the fire', use: (ctx) => g.placeAction('sit_firepit', ctx) });
  }
  // the campground's fire burns from dusk
  const fire = campfire(g, P(cs.x, cs.z, 0.02), true);
  g.updaters.push(() => { fire.level = g.hour > 17.5 || g.hour < 1.5 ? 1 : 0; });
  return defs.map((d) => new Npc(d, g));
}

export { flameCards };
