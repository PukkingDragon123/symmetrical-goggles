// CKLK 98.1, Kettle Lake's community station, broadcast from the back room at Pruneau's. Ray's valve set on the
// cabin desk and the set behind the store counter both pick it up. By day it's Rémi and the Swap Shop; from ten
// at night till one it's Odile and "After Dark", call-ins about what people saw in the bush. Ray used to call in
// on Thursdays as "the Cookee". Lines float above whichever radio is on, under a hiss of static.
import * as THREE from 'three';
import type { Game } from '../game';
import { hud } from '../../ui/hud';
import { floatText } from '../../ui/float';
import { audio } from '../../audio/audio';
import { registerInteractable } from '../interact';
import { has, set, think } from './kit';

type Line = [who: string, text: string];
const STATION = 'CKLK 98.1';

const NIGHT: Line[][] = [
  [
    ['Odile', 'Bonsoir, Kettle Lake. Ten o\'clock, CKLK 98.1, this is After Dark and I\'m Odile. The phones are open. The coffee is not.'],
    ['Odile', 'Environment Canada says clear and cold, two above, frost in the low spots. I say bring your boots in.'],
    ['Caller', 'Hi Odile, long-time listener. Something under my woodpile out on the Rang 6 road. Growls. Only at night. Only at the axe.'],
    ['Odile', 'Is your axe in the block? Take it in the house. Leave a bit of jerky out instead. You\'ll see.'],
    ['Caller', '...You sound like you know something.'],
    ['Odile', 'I know everything, mon chou. I run the post office.'],
  ],
  [
    ['Odile', 'After Dark, CKLK. Line two, you\'re on.'],
    ['Caller', 'Odile, it\'s Réjean, I drive the chip truck on the 11. Fog by the tamarack swamp tonight. An old lady with antlers waved me down. I said no thanks.'],
    ['Odile', 'You said no to Granny Tamarack? Réjean. Next time say yes. And say thank you at the door.'],
    ['Caller', 'She was nine feet tall.'],
    ['Odile', 'So was my mother, in a mood. Drive safe.'],
  ],
  [
    ['Odile', 'It\'s eleven, it\'s After Dark, and the line is open. Go ahead.'],
    ['Caller', 'Walking home from the bush road. Every time I turn round, there\'s nothing. Every time I don\'t, something\'s a tree closer.'],
    ['Odile', 'Then look at it, and keep looking. It can\'t move while you\'re watching. And light a lantern. And go home.'],
    ['Caller', 'I\'m calling from the bush road.'],
    ['Odile', 'Then hang up, dear, and walk backwards.'],
  ],
  [
    ['Odile', 'CKLK After Dark. We have a young caller. Isn\'t it past your bedtime?'],
    ['Caller', 'Something knocked on a tree three times out in the cedars. Mum says don\'t answer.'],
    ['Odile', 'Your mum\'s a wise woman. But it\'s only the neighbour. Knock back, three times, politely. And don\'t put a flashlight in his face. Would you like a flashlight in your face?'],
    ['Caller', 'No.'],
    ['Odile', 'There you are, then. Bonne nuit.'],
  ],
  [
    ['Odile', 'After Dark. Line one. Oh. It\'s Marcel.'],
    ['Caller', 'Odile, it\'s about the hat.'],
    ['Odile', 'Marcel, it has been eleven years.'],
    ['Caller', 'I saw it again in the old burn. The rubber one. I had a lantern this time. It wouldn\'t come near.'],
    ['Odile', 'Fire, Marcel. They don\'t like fire. We all know. We\'ve all heard. Goodnight, Marcel.'],
  ],
  [
    ['Odile', 'A note from a listener: "Odile, there are bats in my attic with antlers. I put the flashlight on them and they went crazy."'],
    ['Odile', 'Dark and still, mon chou. Turn the light off and stand there like a lamp. They settle. Then go to bed quietly. Antler bats. Honestly.'],
    ['Odile', 'And a dedication, for Ray Tremblay, from his sister Lise in Sudbury: "I know you\'re listening. You always were nosy."'],
  ],
  [
    ['Odile', 'It\'s After Dark. Line two, go ahead.'],
    ['Caller', 'It\'s Doug at the campground. Quick question. How much coffee does a, uh, kettle-type animal drink? Ballpark.'],
    ['Odile', 'All of it, Doug.'],
    ['Caller', 'That\'s what I was afraid of.'],
  ],
  [
    ['Odile', 'After Dark. Line one, you\'re on.'],
    ['Caller', 'Something in the swamp bellowed at me, Odile. Big yellow throat on it. Spines up.'],
    ['Odile', 'Back away. It warns before it fights. If it charges twice and stops, it\'s still only warning. Don\'t give it a third.'],
    ['Caller', 'What does it eat?'],
    ['Odile', 'Bacon. Everything eats bacon. That\'s why I don\'t keep it in the house.'],
  ],
];

const DAY: Line[] = [
  ['Rémi', 'It\'s the Swap Shop on CKLK. You\'ve got it, somebody up here needs it. You need it, somebody up here has two.'],
  ['Caller', 'For sale: woodstove, airtight, slightly haunted. Forty dollars or best offer. Ask for Yvon.'],
  ['Caller', 'Wanted: one left-hand mitten, red, lost at the rink. Reward is the right-hand mitten.'],
  ['Caller', 'Free to a good home: one rooster. Not a good rooster. Free to any home.'],
  ['Caller', 'Trade: snowmobile track, fits a \'78, for a canoe or a good dog.'],
  ['Caller', 'Lost at the church supper: dentures, upper. Lucien, if you put them in the tourtière again, it\'s not funny.'],
  ['Caller', 'For sale: axe handles, hickory, a dozen. Don\'t leave them in the block overnight.'],
  ['Caller', 'Wanted: somebody to split eight cord. Will pay in pie.'],
  ['Caller', 'Found on the north shore: one canoe paddle, chewed. Not by me.'],
  ['Rémi', 'And Gérard at Pruneau\'s asks me to say the coffee is free. Gérard. Gérard is waving at me. It isn\'t free.'],
  ['Rémi', 'Weather: grey, then less grey, then dark. Swap Shop\'s back after the news, which is that there isn\'t any.'],
];

/** story segments, played first when their moment has come (each once) */
function storySegment(g: Game): { id: string; lines: Line[] } | null {
  const night = g.hour >= 22 || g.hour < 1;
  if (!night) return null;
  const S: { id: string; ok: boolean; lines: Line[] }[] = [
    {
      id: 'collect', ok: has(g, 'ending') && !has(g, 'radio:collect'), lines: [
        ['Odile', 'Nine o\'clock was an hour ago, but. Line one is lit. ...Line one, you\'re on After Dark.'],
        ['Ray', '(a long hiss) ...ow\'s the kid?'],
        ['Odile', '...Feeding them. Hot. Not scraps.'],
        ['Ray', 'Good. ...Odile?'],
        ['Odile', 'What.'],
        ['Ray', 'Thursdays.'],
        ['Odile', 'That line\'s been dead since April. ...Here\'s the weather.'],
      ],
    },
    {
      id: 'smoke', ok: has(g, 'camp_stove') && !has(g, 'radio:smoke'), lines: [
        ['Odile', 'After Dark. Line two. Hollis? It\'s past your bedtime, Hollis.'],
        ['Caller', 'Odile. There\'s smoke over the north shore. Somebody\'s lit Délima\'s stove.'],
        ['Odile', '...I know, Hollis. Somebody has. Go to bed.'],
      ],
    },
    {
      id: 'newcaller', ok: has(g, 'called_in') && !has(g, 'radio:newcaller'), lines: [
        ['Odile', 'Last night we had a new caller from Rang 4. Some of you wrote in already. Bev. Calm down, Bev.'],
        ['Odile', 'The Thursday line is open again. That\'s all. That\'s the announcement.'],
      ],
    },
    {
      id: 'thursday', ok: has(g, 'q:odile:caller:done') && !has(g, 'radio:thursday'), lines: [
        ['Odile', 'Thursdays at nine used to belong to a caller I won\'t name. He knew who he was. He can\'t call now.'],
        ['Odile', 'The line\'s open anyway. It always will be. Here\'s the weather.'],
      ],
    },
  ];
  const s = S.find((x) => x.ok);
  return s ? { id: s.id, lines: s.lines } : null;
}

interface RadioSet { obj: THREE.Object3D; anchor: THREE.Object3D; on: boolean; name: string; callIn: boolean; dial: THREE.Mesh }
let dialMat: THREE.MeshBasicMaterial | null = null;

export class Radio {
  private sets: RadioSet[] = [];
  private playing: RadioSet | null = null;
  private queue: Line[] = [];
  private lineT = 0;
  private gapT = 0;
  private segment = 0;
  private hiss: { src: AudioBufferSourceNode; gain: GainNode; pan: PannerNode } | null = null;
  private calling = false;

  constructor(private g: Game) {
    g.updaters.push((dt) => this.update(dt));
  }

  /** make an object a radio set (Ray's can also call in to the show) */
  add(obj: THREE.Object3D, name: string, callIn = false): void {
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.25, 0);
    obj.add(anchor);
    // the tuning dial glows amber while it's on (a valve set warming up)
    dialMat ??= new THREE.MeshBasicMaterial({ color: 0xffb860, fog: true });
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.055), dialMat);
    dial.position.set(0.07, 0.3, 0.212);
    dial.visible = false;
    obj.add(dial);
    const r: RadioSet = { obj, anchor, on: false, name, callIn, dial };
    this.sets.push(r);
    registerInteractable(obj, {
      kind: 'switch', reach: 2.6,
      label: () => (r.on ? `Turn off ${name}` : `Turn on ${name}`),
      use: () => this.toggle(r),
      altLabel: () => (r.callIn && this.canCall() ? 'Call in to After Dark' : ''),
      alt: () => { if (r.callIn && this.canCall()) this.callIn(r); },
    });
  }

  private canCall(): boolean {
    const g = this.g;
    return (g.hour >= 22 || g.hour < 1) && has(g, 'q:odile:call_in:on') && !has(g, 'called_in') && !this.calling;
  }

  private toggle(r: RadioSet): void {
    const g = this.g;
    g.sound('flashlight_click', undefined, 0.6, 0.7);
    if (r.on) { r.on = false; r.dial.visible = false; if (this.playing === r) this.stop(); return; }
    for (const s of this.sets) { s.on = false; s.dial.visible = false; }
    r.on = true; r.dial.visible = true;
    this.playing = r;
    floatText.speakers.set(STATION, r.anchor);
    this.queue = [];
    this.gapT = 1.2;
    this.startHiss(r);
  }

  private stop(): void {
    this.playing = null;
    this.queue = [];
    if (this.hiss) { try { this.hiss.gain.gain.setTargetAtTime(0, audio.ctx!.currentTime, 0.05); this.hiss.src.stop(audio.ctx!.currentTime + 0.3); } catch { /* gone */ } this.hiss = null; }
  }

  /** a bed of static under the voices (synthesized: the bank has no radio) */
  private startHiss(r: RadioSet): void {
    const ctx = audio.ctx;
    if (!ctx || !audio.master) return;
    if (this.hiss) this.stop();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.92 * b + 0.08 * w; d[i] = w * 0.5 + b * 1.6 + (Math.random() < 0.0006 ? (Math.random() - 0.5) * 4 : 0); }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.6;
    const gain = ctx.createGain(); gain.gain.value = 0.0;
    gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.1);
    const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 1.5; pan.rolloffFactor = 1.4;
    const p = r.obj.getWorldPosition(new THREE.Vector3());
    pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
    src.connect(bp).connect(gain).connect(pan).connect(audio.master);
    src.start();
    this.hiss = { src, gain, pan };
  }

  /** the next stretch of programme for this hour */
  private program(): Line[] {
    const g = this.g, h = g.hour;
    if (h >= 1 && h < 6) return [['Rémi', 'CKLK is off the air until six. This is a test of the test signal. Goodnight, Kettle Lake.']];
    const s = storySegment(g);
    if (s) { set(g, `radio:${s.id}`); return s.lines; }
    if (h >= 22 || h < 1) { const ep = NIGHT[(g.day * 3 + this.segment++) % NIGHT.length]; return ep; }
    const out: Line[] = [];
    const n = DAY.length;
    for (let i = 0; i < 3; i++) out.push(DAY[(g.day * 5 + this.segment * 3 + i) % n]);
    this.segment++;
    return out;
  }

  private say(l: Line): number {
    const [who, text] = l;
    const dur = Math.min(9, 2.4 + text.split(/\s+/).length * 0.3);
    hud.say(`<b>${STATION}:</b> ${who === 'Caller' || who === 'Odile' || who === 'Rémi' || who === 'Ray' ? `${who}: ` : ''}${text}`, dur);
    return dur + 0.5;
  }

  /** Odile's quest: call the show from Ray's set at night */
  private callIn(r: RadioSet): void {
    const g = this.g;
    if (!r.on) this.toggle(r);
    this.calling = true;
    const friends = ['hound', 'bigfoot', 'hodag', 'squonk', 'agropelter', 'teakettler', 'wasset', 'gouger', 'hoopsnake', 'splintercat', 'goofus']
      .filter((c) => g.journal.knows(c, c === 'hound' ? 'friend' : c === 'bigfoot' ? 'gift' : c === 'squonk' || c === 'hoopsnake' ? 'r5' : 'r4'));
    const what = friends.length ? `${friends.length === 1 ? 'one of them' : `${friends.length} of them`} eats from my hand now` : 'I\'ve been leaving plates out like he did';
    this.queue = [
      ['Odile', 'After Dark. Line two, the Rang 4 line. ...Go ahead, you\'re on.'],
      ['You', `It\'s Ray\'s kid. At the cabin. ${what.charAt(0).toUpperCase() + what.slice(1)}.`],
      ['You', 'The stove\'s lit. The plates are full. Tell whoever\'s listening: the cook\'s still here.'],
      ['Odile', '...Did you all hear that? The cook\'s still here. Thank you, Rang 4. Thursdays at nine. Don\'t be late.'],
    ];
    this.gapT = 0.4;
    g.sound('flashlight_click', undefined, 0.5, 1.4);
    set(g, 'called_in');
    think('You lift the old microphone and press the key.', 3);
  }

  private update(dt: number): void {
    const r = this.playing;
    if (!r) return;
    if (this.hiss) {
      // louder between lines, under the voices when someone's talking
      const target = this.lineT > 0 ? 0.018 : 0.05;
      this.hiss.gain.gain.value += (target - this.hiss.gain.gain.value) * Math.min(1, dt * 4);
    }
    if (this.lineT > 0) { this.lineT -= dt; return; }
    if (this.gapT > 0) { this.gapT -= dt; return; }
    if (!this.queue.length) {
      // a pause between segments: static, a bar of nothing
      if (this.calling) { this.calling = false; }
      this.queue = this.program().slice();
      this.gapT = 0;
      this.lineT = 0;
      // the next segment comes after a breath of static
      this.gapT = 2.5;
      return;
    }
    const l = this.queue.shift()!;
    if (l[0] === 'You') { hud.say(`<i>${l[1]}</i>`, 5); this.lineT = 5.5; return; }
    this.lineT = this.say(l);
    if (!this.queue.length) this.gapT = 14 + Math.random() * 10;
  }
}
