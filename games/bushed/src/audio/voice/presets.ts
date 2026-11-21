// Who sounds like what. Every speaker has a pitch, a throat (formant scale), a rhythm and a particular way of being
// slightly wrong. People are almost right; the old man is warm and wrong; the things in the bush are layered,
// sub-octave and wet.

/** how a voice goes wrong (0..1 each) */
export interface Wrong {
  /** vowels held far too long, sagging */
  drag: number;
  /** a syllable caught and repeated */
  stutter: number;
  /** the end of the line sucked back (reversed) */
  reverseTail: number;
  /** a breathy whispered double, a beat late, in your ear */
  double: number;
  /** digital wrongness: a skip, a bit-crushed word, a dropout, a ring-mod wobble */
  glitch: number;
  /** pauses in the wrong places */
  pause: number;
  /** uneven meter: some syllables long, some clipped */
  lilt: number;
  /** pitch that wanders off and doesn't come back */
  sag: number;
}

export interface CryptidVoice {
  /** extra voices: a fifth-up whine, a detuned twin */
  layers: number;
  /** octave-down double */
  sub: number;
  /** wet clicks and smacks between syllables */
  clicks: number;
  /** period-doubled growl on the voicing */
  growl: number;
  /** a whistling partial riding the pitch (steam, wind through teeth) */
  whistle: number;
  /** throat gurgle: fast amplitude flutter */
  wet: number;
  /** the whole line said backwards */
  backwards: number;
  /** only breath, no voice (it whispers) */
  whisper?: boolean;
}

export interface VoicePreset {
  label: string;
  /** base pitch (Hz) */
  f0: number;
  /** formant (throat length) scale: 1 an adult man, 1.16 a woman, 1.3 a child, 0.7 something large */
  fs: number;
  rate: number;
  breath: number; jitter: number; shimmer: number;
  /** phrase-final vocal fry */
  creak: number;
  oq: number; tilt: number;
  tremor: { rate: number; depth: number; amp: number } | null;
  /** slow pitch wander (semitones) and how fast it wanders */
  drift: number; driftRate: number;
  /** intonation depth (1 lively, 0.3 flat) */
  tune: number;
  wrong: Wrong;
  cryptid?: CryptidVoice;
  whisper?: boolean;
  /** band-limited like a radio / phone */
  radio?: boolean;
  /** low warmth boost (dB) */
  warm?: number;
  /** level trim (dB) */
  gain?: number;
}

const W = (o: Partial<Wrong> = {}): Wrong => ({ drag: 0.25, stutter: 0.15, reverseTail: 0.25, double: 0.2, glitch: 0.12, pause: 0.2, lilt: 0.3, sag: 0.25, ...o });
const man = (o: Partial<VoicePreset>): VoicePreset => ({
  label: '', f0: 112, fs: 1, rate: 1, breath: 0.07, jitter: 0.008, shimmer: 0.05, creak: 0.4, oq: 0.52, tilt: 0.26, tremor: null,
  drift: 0.45, driftRate: 1, tune: 1, wrong: W(), ...o,
});
const woman = (o: Partial<VoicePreset>): VoicePreset => man({ f0: 200, fs: 1.15, breath: 0.12, oq: 0.62, tilt: 0.32, creak: 0.15, ...o });
const thing = (o: Partial<VoicePreset> & { cryptid: CryptidVoice }): VoicePreset => man({
  f0: 70, fs: 0.78, rate: 0.85, breath: 0.2, jitter: 0.03, shimmer: 0.18, creak: 0.8, drift: 1.4, driftRate: 1.6, tune: 0.5,
  wrong: W({ drag: 0.6, stutter: 0.45, reverseTail: 0.7, double: 0.7, glitch: 0.45, pause: 0.5, lilt: 0.6, sag: 0.7 }), ...o,
});

export const VOICES: Record<string, VoicePreset> = {
  // ---------------------------------------------------------------- people of Kettle Lake
  gerard: man({ label: 'Gérard Pruneau (shopkeeper): dry, nasal, smiles too long', f0: 108, fs: 0.97, rate: 0.96, drift: 0.55, tune: 1.15,
    wrong: W({ drag: 0.35, reverseTail: 0.3, glitch: 0.1, lilt: 0.45 }) }),
  odile: woman({ label: 'Odile Pruneau (post wicket, night radio): low, breathy, slow', f0: 172, fs: 1.1, rate: 0.86, breath: 0.2, drift: 0.6,
    wrong: W({ double: 0.45, drag: 0.4, reverseTail: 0.35 }) }),
  doug: man({ label: 'Doug (camper): loud, fast, glitches when he laughs', f0: 122, fs: 1.02, rate: 1.16, creak: 0.55, tune: 1.25,
    wrong: W({ stutter: 0.35, glitch: 0.25, drag: 0.15, lilt: 0.2 }) }),
  camper: man({ label: 'Camper: young, eager, a pitch that slides up and stays', f0: 136, fs: 1.05, rate: 1.1, drift: 0.7, driftRate: 1.4,
    wrong: W({ sag: 0.5, stutter: 0.25 }) }),
  marcel: man({ label: 'Marcel (old logger): gravel, tremble, too-slow vowels', f0: 94, fs: 0.92, rate: 0.8, breath: 0.12, jitter: 0.02, shimmer: 0.12, creak: 0.75,
    tremor: { rate: 5.4, depth: 0.22, amp: 0.1 }, tune: 0.8, wrong: W({ drag: 0.55, pause: 0.4, reverseTail: 0.3 }) }),
  hunter: man({ label: 'Hunter: low, half-whispered, pauses like he is listening', f0: 99, fs: 0.96, rate: 0.9, breath: 0.24, tune: 0.65,
    wrong: W({ pause: 0.6, double: 0.4, drag: 0.3 }) }),
  lucien: man({ label: 'Lucien (camp cook): round and jolly, then flat', f0: 116, fs: 0.99, rate: 1.02, tune: 1.3, wrong: W({ lilt: 0.55, sag: 0.4 }) }),
  hollis: man({ label: 'Hollis (old-timer): thin, shaking, pitch drifts away', f0: 128, fs: 0.95, rate: 0.82, jitter: 0.024, shimmer: 0.14,
    tremor: { rate: 6.2, depth: 0.35, amp: 0.14 }, drift: 0.9, wrong: W({ sag: 0.6, drag: 0.45 }) }),
  esko: man({ label: 'Esko (trapper): flat, slow, every word the same note', f0: 97, fs: 0.95, rate: 0.84, tune: 0.32, creak: 0.6,
    wrong: W({ pause: 0.45, lilt: 0.1, drag: 0.35 }) }),
  megan: woman({ label: 'Megan (ranger): quick and bright, a whisper rides under it', f0: 212, fs: 1.16, rate: 1.08, tune: 1.2, wrong: W({ double: 0.4, glitch: 0.15 }) }),
  jojo: man({ label: 'Jojo (kid): child voice, sing-song, laughs backwards', f0: 268, fs: 1.28, rate: 1.06, breath: 0.12, oq: 0.62, creak: 0.1, tune: 1.4,
    wrong: W({ reverseTail: 0.55, lilt: 0.6, stutter: 0.3, double: 0.3 }) }),
  ray: man({ label: 'Ray (your uncle): close, tired, the words arrive a little early', f0: 104, fs: 0.97, rate: 0.9, breath: 0.16, drift: 0.7,
    wrong: W({ double: 0.55, reverseTail: 0.5, drag: 0.4, pause: 0.35 }) }),
  grandpa: man({ label: 'Grandpa (the cutscenes): old, warm, kind, and wrong', f0: 96, fs: 0.94, rate: 0.76, breath: 0.2, jitter: 0.02, shimmer: 0.13, creak: 0.7,
    tremor: { rate: 5.1, depth: 0.25, amp: 0.1 }, drift: 0.8, driftRate: 0.7, tune: 0.95, warm: 5,
    wrong: W({ drag: 0.6, reverseTail: 0.6, double: 0.55, glitch: 0.18, pause: 0.45, sag: 0.55, lilt: 0.35 }) }),
  radio: man({ label: 'The radio (CKTL night show): band-limited, hiss between words', f0: 150, fs: 1.08, rate: 0.95, radio: true, breath: 0.15, wrong: W({ glitch: 0.35 }) }),
  stranger: man({ label: 'Stranger (anyone without a preset): hashed per name', wrong: W() }),
  // ---------------------------------------------------------------- the things in the bush
  cryptid: thing({ label: 'Generic cryptid: layered, sub-octave, wet', cryptid: { layers: 0.6, sub: 0.8, clicks: 0.6, growl: 0.5, whistle: 0, wet: 0.5, backwards: 0.2 } }),
  hodag: thing({ label: 'Hodag: a bull in a barrel, wet snorts', f0: 66, fs: 0.66, cryptid: { layers: 0.4, sub: 1, clicks: 0.5, growl: 0.9, whistle: 0, wet: 0.7, backwards: 0.1 } }),
  squonk: thing({ label: 'Squonk: sobbing, high and drowned', f0: 250, fs: 1.25, rate: 0.7, tremor: { rate: 7.5, depth: 0.9, amp: 0.3 },
    cryptid: { layers: 0.7, sub: 0.5, clicks: 0.4, growl: 0, whistle: 0, wet: 1, backwards: 0.3 } }),
  hidebehind: thing({ label: 'Hidebehind: only breath, right behind you, tongue clicks', f0: 90, whisper: true,
    cryptid: { layers: 0.8, sub: 0.6, clicks: 1, growl: 0.2, whistle: 0, wet: 0.3, backwards: 0.6, whisper: true } }),
  agropelter: thing({ label: 'Agropelter: chattering, quick, from up a tree', f0: 180, fs: 1.1, rate: 1.4,
    cryptid: { layers: 0.6, sub: 0.3, clicks: 0.9, growl: 0.2, whistle: 0, wet: 0.2, backwards: 0.3 } }),
  teakettler: thing({ label: 'Teakettler: a voice made of steam and whistle', f0: 140, fs: 1, rate: 0.9,
    cryptid: { layers: 0.4, sub: 0.3, clicks: 0.3, growl: 0, whistle: 1, wet: 0.2, backwards: 0.2 } }),
  wasset: thing({ label: 'Snow wasset: muffled, under the snow', f0: 120, fs: 0.9, rate: 1.1,
    cryptid: { layers: 0.5, sub: 0.6, clicks: 0.7, growl: 0.3, whistle: 0, wet: 0.6, backwards: 0.2 } }),
  gouger: thing({ label: 'Sidehill gouger: bleating, lopsided rhythm', f0: 150, fs: 0.95, tremor: { rate: 9, depth: 1.2, amp: 0.4 },
    cryptid: { layers: 0.5, sub: 0.4, clicks: 0.3, growl: 0.3, whistle: 0, wet: 0.4, backwards: 0.1 } }),
  hoopsnake: thing({ label: 'Hoop snake: hiss with a voice inside it', f0: 110, whisper: true,
    cryptid: { layers: 0.6, sub: 0.5, clicks: 0.5, growl: 0, whistle: 0.3, wet: 0.2, backwards: 0.4, whisper: true } }),
  splintercat: thing({ label: 'Splinter cat: a yowl that becomes a growl', f0: 85, fs: 0.8, cryptid: { layers: 0.7, sub: 0.9, clicks: 0.4, growl: 1, whistle: 0, wet: 0.5, backwards: 0.2 } }),
  goofus: thing({ label: 'Goofus bird: everything backwards', f0: 200, fs: 1.15, rate: 1.1, cryptid: { layers: 0.4, sub: 0.3, clicks: 0.6, growl: 0, whistle: 0, wet: 0.2, backwards: 1 } }),
  hound: thing({ label: 'Axehandle hound: growl and chew', f0: 80, fs: 0.82, cryptid: { layers: 0.3, sub: 0.8, clicks: 0.8, growl: 0.8, whistle: 0, wet: 0.8, backwards: 0.1 } }),
  bigfoot: thing({ label: 'Bigfoot: enormous, slow, almost kind', f0: 58, fs: 0.62, rate: 0.7, cryptid: { layers: 0.5, sub: 1, clicks: 0.3, growl: 0.6, whistle: 0, wet: 0.3, backwards: 0.15 } }),
  granny: thing({ label: 'Granny Tamarack: an old woman whispering through bark', f0: 170, fs: 1.08, rate: 0.75, whisper: true,
    cryptid: { layers: 0.6, sub: 0.4, clicks: 0.5, growl: 0, whistle: 0, wet: 0.3, backwards: 0.4, whisper: true } }),
  gumberoo: thing({ label: 'Gumberoo: rubbery, bouncing, squeaks', f0: 160, fs: 0.95, rate: 1.2, cryptid: { layers: 0.4, sub: 0.6, clicks: 0.6, growl: 0.2, whistle: 0, wet: 0.5, backwards: 0.2 } }),
  roperite: thing({ label: 'Roperite: quick, clicking, a whistle through its beak', f0: 190, fs: 1.08, rate: 1.3,
    cryptid: { layers: 0.5, sub: 0.3, clicks: 1, growl: 0.1, whistle: 0.5, wet: 0.2, backwards: 0.3 } }),
  hugag: thing({ label: 'Hugag: enormous, leaning, every word a long low groan', f0: 54, fs: 0.6, rate: 0.62,
    cryptid: { layers: 0.4, sub: 1, clicks: 0.2, growl: 0.5, whistle: 0, wet: 0.3, backwards: 0.15 } }),
  billdad: thing({ label: 'Billdad: wet slaps, a beaver talking through water', f0: 118, fs: 0.9, rate: 1.05,
    cryptid: { layers: 0.4, sub: 0.5, clicks: 0.9, growl: 0.2, whistle: 0, wet: 1, backwards: 0.2 } }),
  wapaloosie: thing({ label: 'Wapaloosie: high chatter from a tree, too many syllables', f0: 260, fs: 1.22, rate: 1.45,
    cryptid: { layers: 0.6, sub: 0.2, clicks: 0.8, growl: 0, whistle: 0.2, wet: 0.2, backwards: 0.35 } }),
  dingbat: thing({ label: 'Dingbat: a screech folded into words', f0: 320, fs: 1.3, rate: 1.3, cryptid: { layers: 0.6, sub: 0.2, clicks: 0.8, growl: 0, whistle: 0.4, wet: 0.2, backwards: 0.3 } }),
};

/** names people go by -> preset ids */
const ALIAS: Record<string, string> = {
  'gérard': 'gerard', gerard: 'gerard', pruneau: 'gerard', shopkeeper: 'gerard', odile: 'odile', doug: 'doug', camper: 'camper',
  marcel: 'marcel', hunter: 'hunter', lucien: 'lucien', hollis: 'hollis', esko: 'esko', megan: 'megan', jojo: 'jojo', ray: 'ray',
  grandpa: 'grandpa', 'grand-père': 'grandpa', granddad: 'grandpa', 'old man': 'grandpa', cktl: 'radio', radio: 'radio',
  caller: 'radio', 'rémi': 'radio', remi: 'radio',
};

/** a stable preset for any speaker id or display name (unknown people get a hashed variation of a plain voice) */
export function presetFor(id: string): VoicePreset {
  const k = id.toLowerCase().trim();
  const hit = VOICES[k] ?? VOICES[ALIAS[k] ?? ''];
  if (hit) return hit;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = (s: number) => (((h >>> s) & 255) / 255);
  const fem = u(3) < 0.35;
  const base = fem ? woman({}) : man({});
  return { ...base, label: `${id} (hashed)`, f0: base.f0 * (0.88 + u(8) * 0.24), fs: base.fs * (0.95 + u(16) * 0.1), rate: 0.9 + u(20) * 0.22, tune: 0.7 + u(12) * 0.6 };
}

export function isCryptidVoice(id: string): boolean { return !!presetFor(id).cryptid; }

/** a creature with no voice of its own: the generic cryptid, pitched and thickened per name */
export function cryptidPresetFor(id: string): VoicePreset {
  const own = presetFor(id);
  if (own.cryptid) return own;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const u = (s: number) => ((h >>> s) & 255) / 255;
  const c = VOICES.cryptid;
  return { ...c, label: `${id} (generic cryptid)`, f0: c.f0 * (0.7 + u(2) * 1.6), fs: c.fs * (0.85 + u(10) * 0.4), rate: 0.8 + u(18) * 0.5,
    cryptid: { ...c.cryptid!, clicks: u(5), whistle: u(13) > 0.7 ? 0.5 : 0, backwards: u(21) * 0.5 } };
}
