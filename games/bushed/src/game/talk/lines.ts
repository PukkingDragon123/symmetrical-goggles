// What people at Kettle Lake do and say besides small talk: what they want, what they'll trade, what they hand you,
// what they hold while they idle, and how they react to you (your axe, your rifle, your fish, your blood, the rain
// on you, the hour) and to what you do near them (chopping, shooting, running). Used by src/game/npcs.ts.

/** something an NPC does with a prop at one of its stops */
export interface Activity {
  /** item model (src/game/items.ts id) held in a hand */
  item: string;
  hand: 'L' | 'R';
  /** a GG gesture played now and then with it ('think' brings the hand to the mouth: drinking, a pipe) */
  use?: string;
  every?: number;
}

export interface Persona {
  /** gifts they're happy to take */
  likes: string[];
  /** hand them one of `want` and they give `give` back */
  trades?: { want: string[]; give: [string, number]; say: string }[];
  /** what they hand you when they like you (once a day) */
  gifts?: [string, number][];
  /** props per timetable clip */
  props?: Partial<Record<string, Activity>>;
  /** resting face */
  mood?: string;
  /** chance to laugh at a joke / at you (0..1) */
  laugh?: number;
  /** how jumpy (0..1): flinches at gunshots, running, falling trees */
  nerves?: number;
  /** tags along after a treat */
  follows?: boolean;
}

export const PERSONA: Record<string, Persona> = {
  gerard: {
    likes: ['chanterelle', 'berries', 'cookies', 'fish', 'syrup'],
    trades: [{ want: ['chanterelle'], give: ['coffee', 1], say: 'Chanterelles for coffee. My wife will think I picked them. Let her.' }],
    gifts: [['coffee', 1], ['jerky', 1]], props: { sit: { item: 'beer', hand: 'R', use: 'think', every: 14 } }, mood: 'smile', laugh: 0.45, nerves: 0.6,
  },
  doug: {
    likes: ['beer', 'jerky', 'bundle', 'firewood', 'kindling', 'bacon'],
    trades: [{ want: ['bundle', 'firewood', 'kindling'], give: ['beer', 2], say: 'Wood! For the fire! Take two of these, I owe you.' }],
    gifts: [['beer', 1]], props: { warm: { item: 'beer', hand: 'R', use: 'think', every: 11 } }, mood: 'grin', laugh: 0.9, nerves: 0.5,
  },
  camper: {
    likes: ['cookies', 'syrup', 'berries', 'beer', 'nuts'],
    trades: [{ want: ['berries'], give: ['cookies', 1], say: 'Blueberries! Okay, okay, cookies for berries. Fair trade. Very fair.' }],
    gifts: [['cookies', 1]], props: { sit: { item: 'beer', hand: 'R', use: 'think', every: 13 } }, mood: 'smile', laugh: 0.8, nerves: 0.85,
  },
  marcel: {
    likes: ['coffee', 'beer', 'fish', 'jerky'],
    trades: [{ want: ['coffee'], give: ['file', 1], say: 'Coffee. Real coffee. Here, a file. Ten strokes a side. Keep the edge honest.' },
      { want: ['fish'], give: ['firestarter', 2], say: 'A trout for fatwood. The old trade. Your uncle made it every Sunday.' }],
    gifts: [['firestarter', 1]], props: { sit: { item: 'knife', hand: 'R', use: 'browse', every: 9 } }, mood: 'sleepy', laugh: 0.25, nerves: 0.1,
  },
  hunter: {
    likes: ['jerky', 'venison', 'moose_meat', 'coffee'],
    trades: [{ want: ['fish', 'jerky'], give: ['ammo_762', 4], say: 'Four rounds. Don\'t waste them on the knocking.' }],
    gifts: [['jerky', 1]], props: { idle: { item: 'rifle', hand: 'R' }, point: { item: 'rifle', hand: 'R' } }, mood: 'neutral', laugh: 0.1, nerves: 0,
  },
  odile: { likes: ['berries', 'chanterelle', 'cookies', 'syrup'], gifts: [['bread', 1]], mood: 'smile', laugh: 0.5, nerves: 0.4 },
  lucien: {
    likes: ['fish', 'eggs', 'bacon', 'venison', 'chanterelle', 'moose_meat'],
    trades: [{ want: ['fish', 'venison', 'moose_meat'], give: ['beans', 2], say: 'Meat for the pot! Two tins of my beans. Don\'t tell me they\'re better than mine.' }],
    gifts: [['bread', 1]], mood: 'grin', laugh: 0.85, nerves: 0.3,
  },
  hollis: { likes: ['coffee', 'syrup', 'cookies'], gifts: [['nuts', 1]], props: { sit: { item: 'coffee', hand: 'L', use: 'think', every: 16 } }, mood: 'sleepy', laugh: 0.4, nerves: 0.3 },
  esko: {
    likes: ['jerky', 'beer', 'coffee'],
    trades: [{ want: ['deer_hide'], give: ['rope', 1], say: 'A hide. Good. Rope for it. Fifteen metres, it never lies about its length.' }],
    gifts: [['firestarter', 1]], mood: 'neutral', laugh: 0.05, nerves: 0.05,
  },
  megan: { likes: ['berries', 'coffee', 'cookies'], gifts: [['batteries', 1]], mood: 'smile', laugh: 0.6, nerves: 0.4 },
  jojo: { likes: ['cookies', 'syrup', 'berries', 'nuts', 'jerky'], gifts: [['berries', 1]], mood: 'grin', laugh: 1, nerves: 0.9, follows: true },
  ray: { likes: ['coffee', 'jerky', 'beer'], mood: 'neutral', laugh: 0.2, nerves: 0 },
};
export const DEFAULT_PERSONA: Persona = { likes: ['cookies', 'coffee', 'beer'], mood: 'neutral', laugh: 0.4, nerves: 0.4 };

export type ReactKey = 'axe' | 'rifle' | 'chainsaw' | 'food' | 'fish' | 'bloody' | 'wet' | 'cold' | 'night' | 'chop' | 'felled' | 'shot' | 'run' | 'swing_close'
  | 'greet' | 'greet_back' | 'greet_friend' | 'remember_shot' | 'thanks' | 'meh' | 'decline' | 'hand' | 'laugh' | 'wave_over' | 'follow' | 'leave';

/** everybody's lines, then per-person overrides */
export const REACT: Record<ReactKey, string[]> = {
  axe: ['Careful where you point that edge.', 'Nice axe. Keep it out of my shins.', "That edge has seen things. Don't tell me which things."],
  rifle: ['Point that at the ground, eh.', "A rifle. Up here the rifle's for the noise, not the aim.", 'Unload that before you come any closer, please.'],
  chainsaw: ['Oh, a chainsaw. Everything in the bush will love that.', 'Loud. Very loud. They hear that in the cedar hollow.'],
  food: ['That for me?', 'Smells good. Is it for sharing?', "I wouldn't say no to that."],
  fish: ['Lake trout! The lake gave you that. It always wants something back.', 'Nice fish. Cold water ones taste of the bottom.'],
  bloody: ["You're bleeding. Don't drip on the floor.", 'Whose blood is that? ...No. Don\'t tell me.', "You've got a cut. Bush takes a little from everybody."],
  wet: ["You're soaked. Stand by a fire before you go blue.", 'Wet through. The cold finds wet people first.'],
  cold: ["Your lips are blue. Go get warm.", "You're shaking. That's the cold talking. Listen to it."],
  night: ['Late to be wandering. The bush has other people in it at night.', "Dark out. Keep a light on and your voice down.", 'Night. Nothing good walks around at night. Except us.'],
  chop: ['Good swing.', 'Mind the lean!', 'Hit it where it wants to split.', 'Your uncle swung like that. Same hitch at the top.'],
  felled: ['TIMBER! ...Sorry. Always wanted to say it.', 'Felt that one in my teeth.', 'Down she goes.'],
  shot: ['JESUS! Warn a person!', 'What are you shooting at?!', "Stop that! You'll wake something up."],
  run: ["What's chasing you?", 'Slow down! Running makes everything interested.', 'Whoa! Where\'s the fire?'],
  swing_close: ['Hey! Watch it!', 'Not near my head!'],
  greet: ['Hey.', 'Bonjour.', 'There you are.', "Oh. It's you."],
  greet_back: ['Back again.', "You're still alive. Good.", 'Twice in a day. People will talk.'],
  greet_friend: ['My friend! Come, come.', "There's my favourite nephew of Ray.", 'Hey you. Good to see you.'],
  remember_shot: ["You're the one who was shooting yesterday.", 'Heard you shooting. Hit anything that hit back?'],
  thanks: ['For me? Merci. Really.', 'Oh, you shouldn\'t have. But you did.', 'Thank you. I won\'t forget it.', 'That\'s kind. Kind is rare up here.'],
  meh: ["I'll... keep it somewhere.", 'Huh. Thanks. I guess.', 'Okay. Sure. Thanks.'],
  decline: ["No, no. You keep that. You'll need it more than me.", "Not hungry. Not for that.", 'Keep it. Somebody out there wants it more.'],
  hand: ['Here. Take this.', 'For you. Don\'t argue.', 'Here, I had a spare.', 'Take it. It\'s bad luck to say no.'],
  laugh: ['Ha!', 'Ha ha ha!', 'Heh. Heh heh.', 'Hah! Ha.'],
  wave_over: ['Hey! Come here a sec!', 'Psst! Over here!', 'Hey, you! I got something for you!'],
  follow: ['Where are we going? Can I come?', "I'll come with you. Just to the trees.", 'Wait up!'],
  leave: ['Okay. See you.', 'Go on then.', 'Mind the dark.'],
};

export const REACT_BY: Record<string, Partial<Record<ReactKey, string[]>>> = {
  gerard: {
    greet: ['Bonjour. Mind the bell.', 'Ah. The nephew.'], rifle: ['Not in the store with that. Lean it on the porch like a civilized person.'],
    bloody: ['You are bleeding on my linoleum. Again. Well, first time. But it feels like again.'], laugh: ['Ha! Hah. Mon dieu.', 'Heh heh heh.'],
    thanks: ['Merci, mon chou. I will put it by the register where everyone can see I have friends.'],
  },
  doug: {
    greet: ['Hey buddy!', 'There he is!'], chop: ['Yeah! Hit it! HIT IT!', 'Swing like you mean it!'], laugh: ['HA! Ha ha ha ha!', 'Ha! Oh man. Ha!'],
    shot: ['WHOA! Hey! Campers here! CAMPERS!'], night: ['Fire\'s going. Pull up a log, the dark can\'t see us here.'],
  },
  marcel: {
    greet: ['Mm.', 'Ah. Ray\'s boy.'], chop: ['Too much shoulder. Let the axe fall.', 'Better. Again.'], run: ['Running. Hm. Nothing up here is slower than you.'],
    axe: ['Let me see the edge. ...Hm. File it tonight.'], laugh: ['Heh.', 'Ha. Hm.'], night: ['Night. Say goodnight to the trees. Out loud.'],
  },
  hunter: {
    greet: ['...', 'Quiet. Listen.'], rifle: ['Mosin. Good. Loud, but good.'], shot: ['Wrong direction. Whatever you were shooting is behind you.'],
    run: ['Never run. Walk like you own the place.'], laugh: ['Hn.'],
  },
  jojo: {
    greet: ['Hi! Hi! Did you see it? I saw it!', 'You again! Hi!'], laugh: ['Hee hee hee!', 'Ha ha ha ha ha!'], run: ['Race you! RACE YOU!'],
    follow: ['Can I come? I\'ll be quiet. I\'m very quiet.', 'I\'m coming too!'], night: ['Mom says I can\'t be out. Don\'t tell her.'],
  },
  camper: { shot: ['AAH! Okay. Okay. I\'m okay.'], felled: ['Whoa. Did you do that? Cool. Scary. Cool.'] },
  esko: { greet: ['Hm.', 'Day.'], laugh: ['...'], chop: ['Mm. Good.'] },
};

/** overheard pairs: [A, B]. {item} is filled with what you gave A */
export const GOSSIP: [string, string][] = [
  ['You hear the knocking last night?', "Three knocks. I answered. Don't look at me like that."],
  ['Something walked backwards across the burn.', 'Then it was going the other way. Don\'t follow it.'],
  ['The loons stopped at midnight. All at once.', 'They do that when something\'s on the water.'],
  ["Pruneau's put the coffee up again.", 'It was always too cheap for how bad it is.'],
  ['Ray\'s porch light was on last night.', 'Somebody\'s living there now. The nephew.'],
  ['I left a pie on the stump by the hollow.', 'And?'],
  ['My dog won\'t go past the cedars anymore.', 'Smart dog.'],
];
export const GOSSIP_ME: Record<string, [string, string][]> = {
  gift: [["Ray's nephew gave me {item}.", 'Did he now. He never gave me anything.'], ['The nephew brought me {item}. Just like that.', 'Ray used to do that. Same face, too.']],
  shot: [['That one shoots at shadows.', 'Shadows shoot back up here.'], ['Was that the nephew shooting?', "Don't. He's right there."]],
  bloody: [['Saw him come out of the bush bleeding.', 'Bush takes a little from everybody.']],
  chop: [['He swings like Ray. Same hitch at the top.', 'Same hitch. Hope it ends different.']],
  wet: [['He walks around soaked, that one.', 'Ray did too. Wet as a muskrat. Never sick a day.']],
};
