// Talking: the dialogue close-up camera, subtitles typed in step with the voices, cryptid face shots, and the voice
// for every spoken line in the game.
//
//   installTalk(game)                     boot step (after the critters are spawned): wires the late update, gives
//                                         the cryptids' thoughts a voice and a face shot, voices lines other modules
//                                         float with "<b>Name:</b> ..." (the store counter, the radio)
//   talk.closeup.person(model)            ease into a face (src/game/npcs.ts does this when you talk to someone)
//   talk.closeup.creature(obj, {hold})    a dark beat on a creature's face
//   talk.narrate('grandpa', 'Grandpa', text)  -> VoiceLine: a voiced, subtitled line (cutscenes, narration)
//   talk.subtitles.show(name, text, line) / hide()
import * as THREE from 'three';
import type { Game } from '../game';
import { CloseUp, findHead } from './closeup';
import { Subtitles } from './subtitles';
import { voice, VOICES, cryptidPresetFor, type VoiceLine, type SayOpts } from '../../audio/voice';
import { floatText } from '../../ui/float';

/** a speaker other modules can voice by display name (NPCs register themselves here) */
export interface Speaker { voiceExternal(text: string, dur: number): void }

export const talk = {
  closeup: null as CloseUp | null,
  subtitles: new Subtitles(),
  /** display name -> speaker (set by src/game/npcs.ts) */
  findSpeaker: (_name: string): Speaker | null => null,
  /** true while a module is floating a line it voices itself (no double voice) */
  quiet: false,
  /** seconds between cryptid face shots */
  faceShotEvery: 22,
  lastFaceShot: -1e9,
  /** a voiced, subtitled line in nobody's mouth (narration, the old man in the cutscenes). Resolves via line.done */
  narrate(speakerId: string, name: string, text: string, opts: SayOpts & { hold?: number; kind?: 'speech' | 'thought' } = {}): VoiceLine {
    const line = voice.say(speakerId, text, { close: true, ...opts });
    talk.subtitles.show(name, text, line, { kind: opts.kind ?? 'speech' });
    void line.done.then(() => setTimeout(() => { if (talkLine === line) talk.subtitles.hide(); }, (opts.hold ?? 1.2) * 1000));
    talkLine = line;
    return line;
  },
};
let talkLine: VoiceLine | null = null;

/** cryptid events that are attacks: no face shot while something is hitting you */
const VIOLENT = new Set(['gore', 'attack', 'hit', 'butt', 'ram', 'sting', 'nip', 'launch', 'roll', 'throw', 'snap', 'bonk', 'smash']);
/** a hidebehind is never seen */
const NO_SHOT = new Set(['hidebehind']);
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export function installTalk(g: Game): void {
  const cu = (talk.closeup = new CloseUp(g));
  cu.dofEnabled = g.quality?.name !== 'low';
  voice.setQuality(g.quality?.name ?? 'high');
  g.lateUpdaters.push((dt) => { cu.update(dt); talk.subtitles.update(dt); voice.update(); });

  // the cryptids think out loud (src/game/critters.ts think(key = 'who:event', text)): give the thought the
  // creature's voice and, now and then, a beat on its face
  const c = g.critters as unknown as { think?: (key: string, text: string, every: number) => void; said?: Map<string, number>; extra?: { id: string; object: THREE.Object3D }[] } | null;
  if (c && typeof c.think === 'function') {
    const orig = c.think.bind(c);
    c.think = (key: string, text: string, every: number) => {
      const before = c.said?.get(key);
      orig(key, text, every);
      if (c.said && c.said.get(key) === before) return; // rate-limited: nothing was shown
      const [who, ev] = key.split(':');
      cryptidThought(g, c.extra ?? [], who, ev ?? '', text);
    };
  }

  // lines other modules float ("<b>Gérard:</b> ...", the radio): voice them from whoever said them
  const sayOrig = floatText.say.bind(floatText);
  floatText.say = (text, o = {}) => {
    sayOrig(text, o);
    if (talk.quiet) return;
    const m = /^<b>([^<]+):<\/b>\s*(.*)$/s.exec(text);
    if (!m) return;
    const who = m[1].trim(), body = m[2].replace(/<[^>]+>/g, '').trim();
    if (!body) return;
    const sp = talk.findSpeaker(who);
    const dur = o.dur ?? Math.min(9, 2.2 + body.split(/\s+/).length * 0.3);
    if (sp) { sp.voiceExternal(body, dur); return; }
    const radio = /^CK/i.test(who);
    const at = floatText.speakers.get(who) ?? null;
    const inner = /^(\w[\wé]*): (.*)$/.exec(body);
    voice.say(radio ? 'radio' : who, radio && inner ? inner[2] : body, { at, maxDur: Math.max(1.2, dur - 1), volume: radio ? 0.75 : 1 });
  };
}

function cryptidThought(g: Game, extra: { id: string; object: THREE.Object3D }[], who: string, ev: string, text: string): void {
  const cr = extra.find((x) => x.id === who);
  // only the creatures' own thoughts ('helper:...' and other keys are the lumberjack's)
  if (!cr && !VOICES[who]?.cryptid) return;
  const obj = cr?.object ?? null;
  const head = obj ? findHead(obj) ?? obj : null;
  // its voice: the thought, said by the thing (layered, sub-octave, wet), from its head
  if (!VOICES[who]) voice.register(who, cryptidPresetFor(who));
  voice.say(who, text, { at: head, maxDur: 3.2, volume: 0.95 });
  // a beat on its face: only when it's near, visible, roughly ahead, and not attacking
  const cu = talk.closeup;
  if (!cu || !obj || !head || VIOLENT.has(ev) || NO_SHOT.has(who) || g.mode !== 'walk' || cu.active) return;
  const now = performance.now() / 1000;
  if (now - talk.lastFaceShot < talk.faceShotEvery) return;
  let vis = obj.visible;
  for (let p = obj.parent; p && vis; p = p.parent) vis = p.visible;
  if (!vis) return;
  head.getWorldPosition(_v);
  const d = _v.distanceTo(g.camera.position);
  if (d > 40) return;
  g.camera.getWorldDirection(_f);
  if (_f.dot(_v.sub(g.camera.position).normalize()) < -0.1) return;
  const fx = (cr as unknown as { fx?: { shine: { value: number } } }).fx ?? null;
  const size = (cr as unknown as { size?: number }).size;
  if (cu.creature(obj, { head, fx, hold: 1.5, size })) talk.lastFaceShot = now;
}

export { CloseUp, Subtitles, findHead };
