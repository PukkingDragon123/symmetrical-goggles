// People of Kettle Lake. Each has a place for each part of the day, walks between them, does something there
// (leans on the counter, warms hands at a fire, sits on a log), turns to look at you when you come close, and
// talks when spoken to. Some say useful things. Most say true things. A few are just being polite.
import * as THREE from 'three';
import type { Game } from './game';
import { buildHuman, makeLook, variant, type HumanModel, type NpcAnim, type LookId, type HumanLook } from '../humans';
import { SPOTS, heightAt } from '../world/layout';
import { registerInteractable } from './interact';
import { hud } from '../ui/hud';
import { ODILE, DOUG, line, speak } from './dialogue';
import { flameCards } from '../places/fixtures';
import { campfire } from './flow';
import { buildPieceGeometry, barkMaterial } from '../chop/wood';
import { woodMaterial } from '../chop/woodtex';
import { physics, RAPIER } from '../physics/physics';

interface Stop { from: number; to: number; at: THREE.Vector3; face: number; anim: NpcAnim }
interface NpcDef { id: string; name: string; look: LookId | HumanLook; stops: Stop[]; talk: (g: Game, n: Npc) => string; ambient?: string[] }

const P = (x: number, z: number, dy = 0) => new THREE.Vector3(x, heightAt(x, z) + dy, z);

const MARCEL = [
  "Marcel. Forty years cutting in these woods. I don't go in the cedar hollow. Not because of what's in there. Because of how polite it is.",
  'That rubber thing in the old burn? I shot at it once. Once. The bullet came back and took my hat.',
  'Your uncle said goodnight to the trees. Out loud. Every night. I used to laugh. I say it now too.',
  "Notch on the side you want it to go. Don't argue with the lean. The tree's been standing there longer than you've been arguing.",
];
const HUNTER = [
  'Tracks by the creek. Seventeen inches heel to toe. You did not see me measure that.',
  "My dad said don't shoot the big ones. Not because you'd miss. Because they'd remember.",
  'Something knocked three times on a tree back there. I knocked back. Felt rude not to.',
];
const CAMPERS = [
  "...and he says 'why are you walking backwards?' and the thing behind the tree says, 'I'm not.'",
  "My cousin says the Hidebehind can't stand you looking right at it. So he walked home backwards. Took him eleven hours.",
  "Shh. Did you hear that? ...No, that's Doug snoring in the truck.",
  'Marshmallow? We have like four hundred. Doug bought the wrong size bag.',
];

export class Npc {
  readonly model: HumanModel;
  private stop: Stop | null = null;
  private walking = false;
  private talkT = 0;
  private ambientT = 20 + Math.random() * 30;
  constructor(readonly def: NpcDef, private g: Game) {
    this.model = buildHuman(def.look);
    g.scene.add(this.model.root);
    const s = def.stops[0];
    this.model.root.position.copy(s.at);
    registerInteractable(this.model.root, {
      kind: 'npc', label: () => `Talk to ${def.name}`, reach: 2.8,
      use: () => {
        hud.say(speak(def.name, def.talk(g, this)), 5);
        this.model.anim.talking = true; this.talkT = 4.5;
        this.model.anim.lookAt(g.camera.position);
      },
    });
  }

  private want(hour: number): Stop {
    return this.def.stops.find((s) => (s.from <= s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to)) ?? this.def.stops[0];
  }

  update(dt: number): void {
    const g = this.g, m = this.model, root = m.root;
    const dist = root.position.distanceTo(g.player.pos);
    root.visible = dist < 140;
    if (!root.visible) return;
    const w = this.want(g.hour);
    if (w !== this.stop) { this.stop = w; this.walking = true; }
    if (this.walking) {
      const to = w.at.clone().sub(root.position); to.y = 0;
      const d = to.length();
      if (d < 0.15) { this.walking = false; m.anim.play(w.anim); root.rotation.y = w.face; }
      else {
        m.anim.play('walk');
        const step = Math.min(d, 1.25 * dt);
        root.position.addScaledVector(to.normalize(), step);
        root.position.y = heightAt(root.position.x, root.position.z);
        root.rotation.y = Math.atan2(to.x, to.z);
      }
    }
    // turn the head to the player when close
    m.anim.lookAt(dist < 6 ? g.camera.position : null);
    if (this.talkT > 0) { this.talkT -= dt; if (this.talkT <= 0) m.anim.talking = false; }
    // overheard lines
    if (this.def.ambient && dist < 9) {
      this.ambientT -= dt;
      if (this.ambientT <= 0 && !hud.speaking) {
        this.ambientT = 22 + Math.random() * 25;
        hud.say(speak(this.def.name, line(this.def.ambient, this.def.id)), 5.5);
        m.anim.talking = true; this.talkT = 5;
      }
    }
    m.anim.update(dt);
  }
}

export function spawnNpcs(g: Game): Npc[] {
  const st = SPOTS.store, cs = SPOTS.campsite;
  // the shopkeeper's spot comes from the store if it is built
  const counter = (g.store?.anchors?.shopkeeper_spot as THREE.Object3D | undefined)?.getWorldPosition(new THREE.Vector3()) ?? P(st.x, st.z + 3);
  const porch = (g.store?.anchors?.porch_bench as THREE.Object3D | undefined)?.getWorldPosition(new THREE.Vector3()) ?? P(st.x + 3, st.z - 9);
  const shopFace = (g.store?.anchors?.shopkeeper_spot as THREE.Object3D | undefined)?.getWorldQuaternion(new THREE.Quaternion());
  const shopYaw = shopFace ? new THREE.Euler().setFromQuaternion(shopFace).y : Math.PI;
  const defs: NpcDef[] = [
    {
      id: 'gerard', name: 'Gérard', look: 'shopkeeper',
      stops: [
        { from: 7, to: 21, at: counter, face: shopYaw, anim: 'lean' },
        { from: 21, to: 23, at: porch, face: 0, anim: 'sit' },
        { from: 23, to: 7, at: counter, face: shopYaw, anim: 'count' },
      ],
      talk: (game) => {
        if (!game.flags.has('met_gerard')) { game.flags.add('met_gerard'); return line(ODILE.first, 'first'); }
        const h = game.hour;
        const pool = Math.random() < 0.45 ? [...ODILE.rumorHound, ...ODILE.rumorBigfoot, ...ODILE.rumorGumberoo, ...ODILE.rumorGranny, ...ODILE.rumorRay]
          : game.weather.rain > 0.3 ? ODILE.greetRain : h < 12 ? ODILE.greetMorning : h > 18 ? [...ODILE.greetEvening, ...ODILE.warnNight] : [...ODILE.browse, ...ODILE.contract];
        return line(pool, 'gerard');
      },
    },
    {
      id: 'doug', name: 'Doug', look: 'camper',
      stops: [{ from: 6, to: 17, at: P(cs.x + 4, cs.z - 3), face: 1.2, anim: 'chop' }, { from: 17, to: 6, at: P(cs.x - 1.6, cs.z + 0.8), face: 2.2, anim: 'warm' }],
      talk: (game) => line(game.flags.has('met_doug') ? DOUG.story : (game.flags.add('met_doug'), DOUG.hello), 'doug'),
    },
    {
      id: 'camper', name: 'Camper', look: variant(makeLook('camper'), 4242),
      stops: [{ from: 0, to: 24, at: P(cs.x + (1.7 / Math.hypot(1.7, 1.1)) * 2.0, cs.z + (1.1 / Math.hypot(1.7, 1.1)) * 2.0, -0.1), face: Math.atan2(-1.7, -1.1), anim: 'sit' }],
      talk: () => line(CAMPERS, 'campers'), ambient: CAMPERS,
    },
    {
      id: 'marcel', name: 'Marcel', look: 'oldLogger',
      stops: [{ from: 6, to: 19, at: P(132, -40), face: -1.4, anim: 'sit' }, { from: 19, to: 6, at: P(cs.x + 0.4, cs.z - 1.9), face: 0.2, anim: 'warm' }],
      talk: () => line(MARCEL, 'marcel'),
    },
    {
      id: 'hunter', name: 'Hunter', look: 'hunter',
      stops: [{ from: 5, to: 9, at: P(40, 250), face: 0.4, anim: 'point' }, { from: 9, to: 17, at: P(cs.x + 6, cs.z + 4), face: -2.6, anim: 'idle' }, { from: 17, to: 21, at: P(40, 250), face: 0.4, anim: 'point' }, { from: 21, to: 5, at: P(cs.x + 2.6, cs.z - 1), face: -0.8, anim: 'warm' }],
      talk: () => line(HUNTER, 'hunter'),
    },
  ];
  // log benches round the fire (the camper sits on the first)
  for (const [a, sp] of [[Math.atan2(1.1, 1.7), 'spruce'], [Math.atan2(1.1, 1.7) + 2.1, 'pine'], [Math.atan2(1.1, 1.7) + 4.1, 'birch']] as [number, 'spruce' | 'pine' | 'birch'][]) {
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
