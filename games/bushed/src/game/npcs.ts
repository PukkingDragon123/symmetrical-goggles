// People of Kettle Lake. Each has a place for each part of the day, walks between them, does something there
// (leans on the counter, warms hands at a fire, sits on a log, a bottle or a knife in hand), turns to look at you
// when you come close, and talks when spoken to. Some say useful things. Most say true things. A few are just being
// polite.
//
// Every line is voiced (src/audio/voice: gibberish shaped from the words, each person's own slightly wrong voice)
// and the mouth moves with it. Talking to someone (E) eases the camera into a close-up of their face with the line
// typed out under it (src/game/talk); E / click skips ahead, walking away leaves. Holding something they want, E
// gives it to them (they may trade something back); right click just talks. Food held out with a click is an offer.
//
// They notice you: what you hold (an axe, a rifle, food, a fish), how you look (bloody, soaked, frozen, out at
// night), what you do near them (chopping, shooting, running past), and they remember it (saved in game.flags as
// mem:<id>:<key>=<n>): gifts, gunshots, the day you met. They wave you over when they've got something for you, hand
// it over, laugh, flinch, tag along, and gossip with each other about you when you're close enough to hear.
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
import { ITEMS } from './items';
import { input } from '../core/input';
import { voice, type VoiceLine } from '../audio/voice';
import { talk } from './talk';
import { PERSONA, DEFAULT_PERSONA, REACT, REACT_BY, GOSSIP, GOSSIP_ME, type Persona, type ReactKey } from './talk/lines';

export interface Stop { from: number; to: number; at: THREE.Vector3; face: number; anim: NpcAnim }
export interface NpcDef {
  id: string; name: string; look: LookId | HumanLook; stops: Stop[];
  talk: (g: Game, n: Npc) => string | string[];
  ambient?: string[];
  /** starts hidden (the story shows them) */
  hidden?: boolean;
  /** voice preset id (src/audio/voice/presets.ts); defaults to the npc id */
  voice?: string;
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
  'Your grandfather said goodnight to the trees. Out loud. Every night. I used to laugh. I say it now too.',
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

// ---------------------------------------------------------------------------------------------------- memory
// What people remember about you, kept in game.flags (saved with the game) as `mem:<npc>:<key>=<n>`.
export function memGet(g: Game, id: string, key: string): number {
  const pre = `mem:${id}:${key}=`;
  for (const f of g.flags) if (f.startsWith(pre)) return Number(f.slice(pre.length)) || 0;
  return 0;
}
export function memSet(g: Game, id: string, key: string, v: number): void {
  const pre = `mem:${id}:${key}=`;
  for (const f of g.flags) if (f.startsWith(pre)) { g.flags.delete(f); break; }
  if (v) g.flags.add(pre + Math.round(v * 100) / 100);
}
export function memAdd(g: Game, id: string, key: string, d = 1): number { const v = memGet(g, id, key) + d; memSet(g, id, key, v); return v; }

/** what the town has noticed lately (updated by the life loop) */
const seen = {
  bloodyUntil: 0, wetUntil: 0, shotAt: -1e9, shotPos: new THREE.Vector3(), swingAt: -1e9, felledAt: -1e9, felledPos: new THREE.Vector3(),
  lastUnprompted: -1e9, gossipAt: -1e9, wasCharging: false,
};
const now = () => performance.now() / 1000;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const AXES = /axe|hatchet|maul/;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const _to = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Npc {
  readonly model: HumanModel;
  /** a scripted place that wins over the timetable (null: follow the stops) */
  override: { at: THREE.Vector3; face: number; anim: NpcAnim; speed?: number } | null = null;
  hidden = false;
  /** tagging along with the player until this time (s, performance clock); loses to override */
  followUntil = 0;
  readonly persona: Persona;
  /** the line being voiced (its clock drives the mouth and the subtitles) */
  voiceLine: VoiceLine | null = null;
  /** in a dialogue close-up with the player */
  inCloseup = false;
  private target: { at: THREE.Vector3; face: number; anim: NpcAnim } | null = null;
  private walking = false;
  private talkT = 0;
  private ambientT = 20 + Math.random() * 30;
  private queue: { text: string; dur: number }[] = [];
  private queueT = 0;
  private engaged = false;
  private closeT = 0;
  private later: { t: number; lines: string[] } | null = null;
  private lookOther: { at: THREE.Vector3; until: number } | null = null;
  private gestT = 0;
  private prop: { obj: THREE.Object3D; anim: string } | null = null;
  private propT = 6 + Math.random() * 8;
  private reactT = 0;
  private reacted = new Map<string, number>();
  private nearSince = -1e9;
  private farSince = 0;
  private waiting = false;
  private handing: { item: string; n: number; t: number; obj: THREE.Object3D | null } | null = null;
  private mouthArr = [0, 0, 1];
  private mouthO = { open: 0, round: 0 };
  private voiced = false;
  private turned = false;
  constructor(readonly def: NpcDef, private g: Game) {
    this.model = buildHuman(def.look);
    this.hidden = !!def.hidden;
    this.persona = PERSONA[def.id] ?? DEFAULT_PERSONA;
    g.scene.add(this.model.root);
    floatText.speakers.set(def.name, this.model.root);
    this.model.root.userData.npc = this;
    const s = def.stops[0];
    this.model.root.position.copy(s.at);
    this.model.root.rotation.y = s.face;
    NPCS.set(def.id, this);
    this.model.anim.onEvent((ev) => { if (ev === 'flinch_end') this.restoreClip(); });
    registerInteractable(this.model.root, {
      kind: 'npc', reach: 2.8, enabled: () => !this.hidden,
      label: (ctx) => {
        const it = ctx.held && this.wants(ctx.held) ? ITEMS[ctx.held] : null;
        return it ? `Give ${def.name} the ${it.name.toLowerCase()} · RMB talk` : `Talk to ${def.name}`;
      },
      altLabel: () => `Talk to ${def.name}`,
      use: (ctx) => {
        if (this.queue.length && !this.inCloseup) return;
        // a click with something in hand is an offer; E with something they want is a gift too
        const held = ctx.held && (input.pressed('Mouse0') || this.wants(ctx.held)) ? ctx.held : '';
        this.talkTo(held);
      },
      alt: () => { if (!this.queue.length) this.talkTo(''); },
    });
  }

  get name(): string { return this.def.name; }
  get busy(): boolean { return this.queue.length > 0 || this.queueT > 0; }
  get voiceId(): string { return this.def.voice ?? this.def.id; }
  /** Ray is the story's: no unprompted greetings, waves or gossip (and nothing at all once he's gone / during the finale) */
  get scripted(): boolean { return this.def.id === 'ray'; }
  private get finale(): boolean {
    if (this.g.flags.has('st:ray_gone')) return true;
    const st = (globalThis as { __stories?: { arc?: { finaleRunning?: boolean } } }).__stories;
    return !!st?.arc?.finaleRunning;
  }

  /** say a line now, or several in turn (each waits for the one before to be read) */
  say(lines: string | string[], gap = 0.6): void {
    const arr = Array.isArray(lines) ? lines : [lines];
    for (const t of arr) if (t) this.queue.push({ text: t, dur: Math.min(9, 2.2 + t.split(/\s+/).length * 0.3) + gap });
    if (this.queueT <= 0 && !this.engaged) this.next();
  }

  /** stop talking (the rest of the queue is dropped) */
  hush(): void {
    this.queue = []; this.queueT = 0; this.talkT = 0; this.model.anim.talking = false; this.later = null;
    this.voiceLine?.stop(0.2); this.voiceLine = null;
    if (this.inCloseup) talk.closeup?.release();
  }

  /** on to the next line now (E in a close-up) */
  skip(): void {
    if (this.voiceLine && !this.voiceLine.finished && this.voiceLine.time < 0.35) return; // a click that started the line
    this.voiceLine?.stop(0.12);
    this.queueT = 0;
    this.next();
  }

  /** a line somebody else floated for this person ("<b>Gérard:</b> ..." from the store): voice it, move the mouth */
  voiceExternal(text: string, dur: number): void {
    if (this.hidden) return;
    const d = this.model.root.position.distanceTo(this.g.player.pos);
    if (d > 20) return;
    this.voiceLine?.stop(0.1);
    this.voiceLine = voice.say(this.voiceId, text, { at: this.model.root, maxDur: Math.max(1.2, dur - 1) });
    this.lineFace(text);
    this.talkT = dur; this.voiced = true;
  }

  private next(): void {
    const n = this.queue.shift();
    if (!n) { this.queueT = 0; return; }
    const g = this.g, d = this.model.root.position.distanceTo(g.player.pos);
    const maxDur = Math.max(1.2, n.dur - 1.3);
    this.voiceLine?.stop(0.1);
    this.voiceLine = this.inCloseup || d < 18 ? voice.say(this.voiceId, n.text, { at: this.model.root, maxDur, close: this.inCloseup }) : null;
    if (this.inCloseup) talk.subtitles.show(this.def.name, n.text, this.voiceLine, { hint: this.queue.length ? 'E  next' : '' });
    else { talk.quiet = true; hud.say(speak(this.def.name, n.text), n.dur - 0.3); talk.quiet = false; }
    // the next line renders while this one plays
    if (this.queue[0] && (this.inCloseup || d < 18)) voice.prepare(this.voiceId, this.queue[0].text, { maxDur: Math.max(1.2, this.queue[0].dur - 1.3), close: this.inCloseup });
    this.lineFace(n.text);
    this.model.anim.talking = true; this.talkT = n.dur;
    this.queueT = n.dur;
    this.voiced = !!this.voiceLine;
  }

  /** a face for the line: laughing, startled, a question, or the person's resting face held a beat too long */
  private lineFace(text: string): void {
    const a = this.model.anim;
    if (/\b(ha|hah|heh|hee|haha)\b/i.test(text)) a.expression('happy', 2.2);
    else if (/!/.test(text) && /[A-Z]{3,}/.test(text)) a.expression('surprised', 1.4);
    else if (/\?$/.test(text.trim()) && Math.random() < 0.5) a.expression('surprised', 0.8);
    else if (/\b(sorry|died|dead|gone|miss)\b/i.test(text)) a.expression('sad', 2.5);
    else if (this.persona.mood && Math.random() < 0.55) a.expression(this.persona.mood, 3.2);
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
    if (this.later) { this.later.t -= dt; if (this.later.t <= 0) { const l = this.later.lines; this.later = null; this.say(l); } }
    const dist = root.position.distanceTo(g.player.pos);
    root.visible = !this.hidden && dist < 140;
    const w = this.want(g.hour);
    if (w !== this.target) { this.target = w; this.walking = true; this.dropProp(); }
    if (!root.visible) {
      // nobody watching: no need to walk the whole way
      if (this.walking && dist > 160) { root.position.copy(w.at); root.rotation.y = w.face; this.walking = false; m.anim.play(w.anim); }
      return;
    }
    const following = this.followUntil > now() && !this.override && !this.inCloseup && dist < 30;
    if (following) this.tagAlong(dt, dist);
    else if (this.walking) {
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
    // talking to you, people stop what they're doing, straighten up and turn to you (sitting folk stay put)
    if (this.inCloseup && !this.walking && !following) {
      const st = m.anim.state;
      if (st !== 'sit' && st !== 'walk') {
        if (st !== 'idle' && st !== 'flinch') m.anim.play('idle');
        const yaw = Math.atan2(g.player.pos.x - root.position.x, g.player.pos.z - root.position.z);
        root.rotation.y += wrap(yaw - root.rotation.y) * Math.min(1, dt * 5);
        this.turned = true;
      }
    } else if (this.turned && !this.walking && !following) {
      // and back to it afterwards
      root.rotation.y += wrap(w.face - root.rotation.y) * Math.min(1, dt * 3);
      if (Math.abs(wrap(w.face - root.rotation.y)) < 0.05) { this.turned = false; this.restoreClip(); }
    }
    // the head: a gossip partner, else the player when close (in a close-up: into the lens)
    if (this.lookOther && this.lookOther.until > now()) m.anim.lookAt(this.lookOther.at);
    else m.anim.lookAt(dist < 6 || this.inCloseup ? g.camera.position : null);
    // a gesture (wave, laugh, hand-over) runs out: back to what the timetable says
    if (this.gestT > 0) { this.gestT -= dt; if (this.gestT <= 0) this.restoreClip(); }
    this.handOverTick(dt);
    if (!this.walking && !following) this.activity(dt);
    // the mouth follows the voice; without one (too far to hear), the old flapping for the line's length
    const vl = this.voiceLine, h = m.human;
    if (this.talkT > 0) this.talkT -= dt;
    if (vl && !vl.finished) {
      if (vl.time >= 0) {
        vl.mouth(this.mouthO);
        const o = Math.round(this.mouthO.open * 6) / 2;
        this.mouthArr[0] = o; this.mouthArr[1] = this.mouthO.round && o > 0 ? 0.9 : 0.04 * o; this.mouthArr[2] = this.mouthO.round ? 0.82 : 1 + 0.02 * o;
        h.mouth = this.mouthArr; h.mouthT = 1;
        // in a close-up they stare: no blinking while the words come
        if (this.inCloseup && h.blinkT < 0.3) h.blinkT = 0.3;
      }
      m.anim.talking = true;
    } else {
      // the words end: a blink (sometimes two) the moment they stop
      if (vl) { this.voiceLine = null; if (this.inCloseup) h.blinkT = Math.random() < 0.5 ? -0.001 : 0.15; }
      m.anim.talking = !this.voiced && this.talkT > 0;
    }
    // the close-up holds while there's something left to say, then lets go
    if (this.inCloseup) {
      if (!this.busy && !this.later && !this.handing) { this.closeT += dt; if (this.closeT > 1.6) talk.closeup?.release(); }
      else this.closeT = 0;
    }
    // overheard lines
    if (this.def.ambient && dist < 9 && !this.busy && !(chatter.quietAt && root.position.distanceTo(chatter.quietAt) < 14)) {
      this.ambientT -= dt;
      if (this.ambientT <= 0 && !hud.speaking) {
        this.ambientT = 22 + Math.random() * 25;
        this.say(line(this.def.ambient, this.def.id));
      }
    }
    // noticing you
    this.reactT -= dt;
    if (this.reactT <= 0) { this.reactT = 0.3; this.notice(dist); }
    m.anim.update(dt);
  }

  // ------------------------------------------------------------------------------------------ talking to you
  /** does this person want that (a gift or a trade) */
  wants(item: string): boolean {
    const p = this.persona;
    return !!item && (p.likes.includes(item) || !!p.trades?.some((t) => t.want.includes(item)));
  }

  private talkTo(held: string): void {
    const g = this.g;
    this.engaged = true;
    const id = this.def.id;
    let said: string | string[] | null = null;
    // a gift or a trade first (the label promised it), then the story's hooks, then small talk
    if (held) said = this.exchange(held);
    if (!said) for (const h of npcTalkHooks) { said = h(g, this); if (said) break; }
    let lines = said ? (Array.isArray(said) ? said : [said]) : null;
    if (!lines) {
      const small = this.def.talk(g, this);
      lines = Array.isArray(small) ? small : [small];
      // they notice what you're holding or how you look first, now and then
      const r = this.heldKey(g.hands?.heldItem ?? '') ?? this.stateKey();
      if (r && Math.random() < 0.45 && this.cool(r, 120)) lines = [this.react(r), ...lines];
      else if (memGet(g, id, 'gifts') >= 2 && Math.random() < 0.3) lines = [this.react('greet_friend'), ...lines];
      else if (memGet(g, id, 'shot') >= g.day && memGet(g, id, 'shot') > 0 && this.cool('remember_shot', 600)) lines = [this.react('remember_shot'), ...lines];
    }
    memSet(g, id, 'met', Math.max(1, memGet(g, id, 'met')));
    // they had something waiting for you
    if (this.waiting) { this.waiting = false; this.giveGift(); }
    lines = lines.filter(Boolean);
    this.engaged = false;
    const cu = talk.closeup;
    if ((lines.length || this.queue.length) && cu && !this.inCloseup && g.mode === 'walk' && !(this.scripted && this.finale) && cu.person(this.model)) {
      this.inCloseup = true; this.closeT = 0;
      cu.onAdvance = () => this.skip();
      cu.onEnd = () => { this.inCloseup = false; talk.subtitles.hide(); };
    }
    this.say(lines);
    if (!this.busy) this.next();
    this.model.anim.lookAt(g.camera.position);
  }

  /** you hand them something: a trade, a gift, or a polite no. Returns their lines (null: they don't want it) */
  private exchange(item: string): string[] | null {
    const g = this.g, p = this.persona, id = this.def.id;
    if (!g.owns(item)) return null;
    const trade = p.trades?.find((t) => t.want.includes(item));
    if (!trade && !p.likes.includes(item)) return null;
    g.take(item);
    if (!g.owns(item)) g.hands?.equip(null);
    g.sound('pickup', this.model.root.position, 0.5);
    memAdd(g, id, 'gifts');
    memAdd(g, id, 'aff');
    memSet(g, id, 'gave_' + item, 1);
    this.model.anim.expression('happy', 2.5);
    if (p.follows) this.followUntil = now() + 40;
    if (trade && ITEMS[trade.give[0]]) {
      this.handOver(trade.give[0], trade.give[1]);
      return [trade.say];
    }
    const lines = [this.react('thanks')];
    if (Math.random() < (p.laugh ?? 0.3) * 0.5) lines.push(this.react('laugh'));
    // enough kindness and they give something back today
    if (memGet(g, id, 'aff') >= 2 && memGet(g, id, 'handed') !== g.day + 1 && p.gifts?.length) { lines.push(this.react('hand')); this.giveGift(); }
    return lines;
  }

  /** food held out with a click (game 'offer' event): true when they took it */
  receive(item: string): boolean {
    if (this.hidden || this.busy) return false;
    const g = this.g;
    if (!this.wants(item)) {
      this.say(this.react('decline'));
      return false;
    }
    g.give(item); // exchange() takes it back out (the offer path already took one)
    this.talkTo(item);
    return true;
  }

  private giveGift(): void {
    const p = this.persona, g = this.g;
    const opts = (p.gifts ?? []).filter(([i]) => ITEMS[i]);
    if (!opts.length) return;
    const [item, n] = pick(opts);
    memSet(g, this.def.id, 'handed', g.day + 1);
    this.handOver(item, n);
  }

  /** they hold it out to you and you take it */
  handOver(item: string, n = 1): void {
    if (this.handing) { this.g.give(this.handing.item, this.handing.n); this.handing.obj?.removeFromParent(); }
    const obj = this.g.toolModel(item);
    const sitting = this.model.anim.state === 'sit';
    if (obj && !sitting) { this.dropProp(); this.model.socket('R').add(obj); }
    this.handing = { item, n, t: sitting ? 0.6 : 1.5, obj };
    if (!sitting) { this.model.human.gesture('point', { at: this.g.camera.position.clone().add(_w.set(0, -0.35, 0)), dur: 2 }); this.gestT = 2.2; }
  }

  private handOverTick(dt: number): void {
    const hd = this.handing;
    if (!hd) return;
    hd.t -= dt;
    if (hd.t > 0) return;
    this.handing = null;
    hd.obj?.removeFromParent();
    const g = this.g;
    g.give(hd.item, hd.n);
    const def = ITEMS[hd.item];
    floatText.pop(`+${hd.n} ${def?.name ?? hd.item}`, this.model.root.position.clone().add(_v.set(0, 1.4, 0)));
    g.sound('pickup', g.player.pos, 0.6);
  }

  // ------------------------------------------------------------------------------------------ noticing you
  /** true (and arms the timer) when `key` hasn't fired for `secs` */
  cool(key: string, secs: number): boolean {
    const t = now(), last = this.reacted.get(key) ?? -1e9;
    if (t - last < secs) return false;
    this.reacted.set(key, t);
    return true;
  }

  /** a line for a reaction (their own if they have one) */
  react(key: ReactKey): string { return pick(REACT_BY[this.def.id]?.[key] ?? REACT[key]); }

  private heldKey(held: string): ReactKey | null {
    if (!held) return null;
    if (held === 'rifle') return 'rifle';
    if (held === 'chainsaw') return 'chainsaw';
    if (AXES.test(held)) return 'axe';
    if (held === 'fish') return 'fish';
    if (ITEMS[held]?.food) return 'food';
    return null;
  }

  private stateKey(): ReactKey | null {
    const g = this.g, t = now();
    if (seen.bloodyUntil > t) return 'bloody';
    if ((g.survival?.warmth ?? 1) < 0.28) return 'cold';
    if (seen.wetUntil > t) return 'wet';
    if (g.hour >= 21.5 || g.hour < 4.5) return 'night';
    return null;
  }

  /** an unprompted reaction (a line, a flinch, a wave, a laugh) */
  reactNow(key: ReactKey, o: { flinch?: boolean; wave?: boolean; laugh?: boolean; force?: boolean } = {}): void {
    if (this.hidden || this.inCloseup || this.scripted || (this.busy && !o.force)) return;
    const t = now();
    if (!o.force && t - seen.lastUnprompted < 5) return;
    seen.lastUnprompted = t;
    const a = this.model.anim;
    const standing = a.state !== 'sit' && a.state !== 'walk' && a.state !== 'chop';
    if (o.flinch && a.state !== 'sit') { a.play('flinch', { restart: true }); }
    else if (o.wave && standing) { a.play('wave'); this.gestT = 2.4; }
    if (o.force) this.hushQuiet();
    const lines = [this.react(key)];
    if (o.laugh || (key !== 'shot' && Math.random() < (this.persona.laugh ?? 0) * 0.25)) {
      lines.push(this.react('laugh'));
      if (standing && !o.wave) { this.model.human.gesture('clap', { dur: 1.2 }); this.gestT = 1.4; }
    }
    this.say(lines);
  }

  private hushQuiet(): void { this.queue = []; this.queueT = 0; this.later = null; }

  private notice(dist: number): void {
    const g = this.g, t = now();
    if (this.hidden || this.inCloseup || this.scripted || g.mode !== 'walk' || !this.model.root.visible) return;
    const near = dist < 7;
    if (!near) { if (this.nearSince > 0) this.farSince = t; this.nearSince = 0; }
    // greeting you when you walk up (first time in a while)
    if (near && this.nearSince === 0) {
      this.nearSince = t;
      if (t - this.farSince > 60 && !this.busy && Math.random() < 0.55) {
        const id = this.def.id;
        const met = memGet(g, id, 'met') > 0, friend = memGet(g, id, 'aff') >= 3;
        const today = memGet(g, id, 'seen') === g.day + 1;
        memSet(g, id, 'seen', g.day + 1);
        this.reactNow(friend ? 'greet_friend' : met && today ? 'greet_back' : 'greet', { wave: !today && Math.random() < 0.5 });
        return;
      }
    }
    if (this.busy) return;
    // waving you over when they have something for you
    const p = this.persona;
    if (!this.waiting && p.gifts?.length && memGet(g, this.def.id, 'aff') >= 2 && memGet(g, this.def.id, 'handed') !== g.day + 1 && dist > 6 && dist < 22 && this.cool('wave_over', 240)) {
      this.waiting = true;
      this.reactNow('wave_over', { wave: true, force: true });
      return;
    }
    if (this.waiting && dist < 2.6) { this.waiting = false; this.say(this.react('hand')); this.giveGift(); return; }
    if (!near) return;
    // what you hold, how you look, what you're doing
    const held = this.heldKey(g.hands?.heldItem ?? '');
    const running = g.player.sprinting && g.player.speed > 3.5 && dist < 6;
    if (running && this.cool('run', 90) && Math.random() < 0.6) { this.reactNow('run', { flinch: (p.nerves ?? 0) > 0.6 }); return; }
    if (held && dist < 4.5 && this.cool(held, 240) && Math.random() < 0.5) { this.reactNow(held); return; }
    const st = this.stateKey();
    if (st && dist < 6 && this.cool(st, st === 'night' ? 900 : 300) && Math.random() < 0.4) { this.reactNow(st); return; }
  }

  // ------------------------------------------------------------------------------------------ props and errands
  private activity(dt: number): void {
    const a = this.model.anim, act = this.persona.props?.[a.state];
    if (!act) { this.dropProp(); return; }
    if (!this.prop || this.prop.anim !== a.state) {
      this.dropProp();
      const obj = this.g.toolModel(act.item);
      if (!obj) return;
      this.model.socket(act.hand).add(obj);
      this.prop = { obj, anim: a.state };
    }
    if (!act.use || this.busy || this.handing) return;
    this.propT -= dt;
    if (this.propT > 0) return;
    this.propT = (act.every ?? 12) * (0.7 + Math.random() * 0.6);
    // sitting keeps its pose; standing (or at the fire) the hand comes up to the mouth / the knife
    if (a.state !== 'sit') { this.model.human.gesture(act.use, { dur: 2.2 }); this.gestT = 2.5; }
  }

  private dropProp(): void { if (this.prop) { this.prop.obj.removeFromParent(); this.prop = null; } }

  private restoreClip(): void {
    const w = this.target ?? this.want(this.g.hour);
    if (!this.walking) this.model.anim.play(w.anim, { restart: true });
  }

  /** walk along behind the player, a couple of metres off */
  private tagAlong(dt: number, dist: number): void {
    const m = this.model, root = m.root, p = this.g.player.pos;
    if (dist > 2.6) {
      _to.copy(p).sub(root.position); _to.y = 0;
      const d = _to.length() - 2.2;
      m.anim.play('walk');
      root.position.addScaledVector(_to.normalize(), Math.min(d, (dist > 8 ? 3.2 : 1.8) * dt));
      root.position.y = heightAt(root.position.x, root.position.z);
      root.rotation.y = Math.atan2(_to.x, _to.z);
    } else if (m.anim.state === 'walk') m.anim.play('idle');
    this.walking = false;
    this.target = null;
  }

  /** look at another person for a while (gossip) */
  turnTo(o: Npc, secs: number): void {
    const h = o.model.root.position;
    this.lookOther = { at: new THREE.Vector3(h.x, h.y + o.model.height * 0.92, h.z), until: now() + secs };
  }

  /** say these after a delay (s) */
  sayLater(lines: string[], delay: number): void { this.later = { t: delay, lines }; }
}

/** add a person after the town is up (the story's people); they walk and talk like everybody else */
export function addNpc(g: Game, def: NpcDef): Npc {
  const n = new Npc(def, g);
  g.updaters.push((dt) => n.update(dt));
  return n;
}

// ---------------------------------------------------------------------------------------------------- the town's life
let lifeOn = false;
/** gunshots, falling trees, chopping, offers, blood and rain on you, and the gossip: once, for everybody */
function installLife(g: Game): void {
  if (lifeOn) return;
  lifeOn = true;
  talk.findSpeaker = (name) => { for (const n of NPCS.values()) if (n.name === name) return n; return null; };
  const near = (p: THREE.Vector3, r: number) => [...NPCS.values()].filter((n) => !n.hidden && n.model.root.visible && n.model.root.position.distanceTo(p) < r)
    .sort((a, b) => a.model.root.position.distanceTo(p) - b.model.root.position.distanceTo(p));
  g.events.on('gunshot', (d: { pos?: THREE.Vector3 }) => {
    const p = d?.pos ?? g.player.pos;
    seen.shotAt = now(); seen.shotPos.copy(p);
    for (const n of near(p, 120)) memSet(g, n.def.id, 'shot', g.day + 1);
    near(p, 45).filter((n) => !n.scripted).slice(0, 3).forEach((n, i) => {
      if ((n.persona.nerves ?? 0.4) > 0.15) n.model.anim.play('flinch', { restart: true });
      if (i < 2) setTimeout(() => n.reactNow('shot', { force: i === 0 }), 250 + i * 900);
    });
  });
  g.events.on('felled', () => {
    seen.felledAt = now(); seen.felledPos.copy(g.player.pos);
    const ns = near(g.player.pos, 35).filter((n) => !n.scripted);
    if (ns[0] && Math.random() < 0.7) setTimeout(() => ns[0].reactNow('felled', { flinch: (ns[0].persona.nerves ?? 0) > 0.7 }), 1400);
  });
  // food held out with a click
  g.events.on('offer', (o: { item: string; obj: THREE.Object3D; taken: boolean }) => {
    let n: Npc | null = null;
    for (let p: THREE.Object3D | null = o.obj; p && !n; p = p.parent) n = (p.userData.npc as Npc | undefined) ?? null;
    if (!n) return;
    // taken either way: a "no thanks" hands it straight back (no eating it in their face)
    const took = n.receive(o.item);
    o.taken = true;
    if (!took) queueMicrotask(() => { g.give(o.item); if (!g.hands?.heldItem) g.hands?.equip(o.item); });
  });
  let gossipT = 8;
  g.updaters.push((dt) => {
    const t = now();
    if (g.R.fx.damage > 0.3) seen.bloodyUntil = t + 150;
    if (g.weather.rain > 0.35 && !g.indoors && g.mode === 'walk') seen.wetUntil = Math.max(seen.wetUntil, t + 120);
    // a swing of the axe near people
    const charging = !!g.hands?.charging;
    if (seen.wasCharging && !charging && AXES.test(g.hands?.heldItem ?? '')) {
      seen.swingAt = t;
      const ns = near(g.player.pos, 12).filter((n) => !n.scripted);
      for (const n of ns) memSet(g, n.def.id, 'chop', g.day + 1);
      const n = ns[0];
      if (n) {
        const d = n.model.root.position.distanceTo(g.player.pos);
        if (d < 2.4) n.reactNow('swing_close', { flinch: true, force: true });
        else if (Math.random() < 0.3 && n.cool('chop', 60)) n.reactNow('chop');
      }
    }
    seen.wasCharging = charging;
    // gossip: two people close together, you close enough to hear
    gossipT -= dt;
    if (gossipT > 0) return;
    gossipT = 1.5;
    if (g.mode !== 'walk' || t - seen.gossipAt < 45 || hud.speaking) return;
    const ns = near(g.player.pos, 11).filter((n) => !n.busy && !n.inCloseup && !n.scripted);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j];
      if (a.model.root.position.distanceTo(b.model.root.position) > 4.8 || Math.random() < 0.5) continue;
      seen.gossipAt = t;
      const [la, lb] = gossipAbout(g, a);
      a.turnTo(b, 9); b.turnTo(a, 9);
      a.say(la);
      const da = Math.min(9, 2.2 + la.split(/\s+/).length * 0.3) + 0.6;
      b.sayLater([lb], da);
      if (Math.random() < (b.persona.laugh ?? 0.3) * 0.4) a.sayLater([a.react('laugh')], da + Math.min(9, 2.2 + lb.split(/\s+/).length * 0.3) + 0.6);
      return;
    }
  });
}

/** something to say about the grandkid (if A remembers something), else town talk */
function gossipAbout(g: Game, a: Npc): [string, string] {
  const id = a.def.id, day = g.day + 1;
  const opts: [string, string][] = [];
  const gave = [...g.flags].find((f) => f.startsWith(`mem:${id}:gave_`));
  if (gave) {
    const item = ITEMS[gave.slice(`mem:${id}:gave_`.length).split('=')[0]];
    if (item) for (const [x, y] of GOSSIP_ME.gift) opts.push([x.replace('{item}', `some ${item.name.toLowerCase()}`), y]);
  }
  if (memGet(g, id, 'shot') >= day - 1 && memGet(g, id, 'shot') > 0) opts.push(...GOSSIP_ME.shot);
  if (seen.bloodyUntil > now()) opts.push(...GOSSIP_ME.bloody);
  if (memGet(g, id, 'chop') >= day - 1 && memGet(g, id, 'chop') > 0) opts.push(...GOSSIP_ME.chop);
  if (seen.wetUntil > now()) opts.push(...GOSSIP_ME.wet);
  return opts.length && Math.random() < 0.6 ? pick(opts) : pick(GOSSIP);
}

export function spawnNpcs(g: Game): Npc[] {
  installLife(g);
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
