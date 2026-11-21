// What people say. Lines are picked by context and never repeat back-to-back. Gérard Pruneau runs the general
// store; he has opinions about wood, weather, your late grandfather Ray, and the things in the bush. (The pool is still called
// ODILE from before the store had two Pruneaus: those are Gérard's lines. His wife Odile runs the post wicket
// and the night radio show; her lines, and everybody's quest lines, are in src/game/stories.)
import { Rng } from '../core/rng';

type Pool = string[];

export const ODILE = {
  first: [
    "So you're Ray's grandkid. You have his eyebrows. Unfortunate. ...I'm sorry, kid. Best of us, worst customer. Odile has something of his for you, at the wicket.",
  ],
  greetMorning: [
    'Bonjour. Coffee is on the stove, it is free, it is terrible.',
    "You're up early. The bush is still deciding what kind of day it is.",
    'Morning. Mind the bell, it bites.',
  ],
  greetEvening: [
    "Late to be driving. Keep your headlights on and your windows up.",
    'Closing soon. Not for any reason. Just closing.',
    "Evening. You smell like woodsmoke. Good. That means you're still alive.",
  ],
  greetRain: ["Wet enough for you? The roof leaks over the canned goods. Don't buy the dented ones."],
  browse: [
    "Take your time. Nobody's in a hurry up here except the mosquitoes.",
    'The good axes are on the wall. The cheap ones are also on the wall, lower down, for humility.',
    "If it's on the shelf it's for sale. If it's on the counter, ask. If it's on the cat, no.",
  ],
  buy: [
    'Good choice.', 'That will do you.', 'Ray used to buy that. Then he would complain about it. Then buy it again.',
    "Don't tell anyone I sell it this cheap.", 'Merci. Come back alive.',
  ],
  buyJerky: [
    'Jerky. Smart. Ray always kept some in his pocket. He never said why and I never asked.',
    'The peppered one. They seem to like the peppered one. The customers, I mean.',
  ],
  buyAxe: ['A real axe. Keep it sharp and it will keep you warm twice: once cutting, once burning.'],
  sellBirch: ['Bouleau! Now that is wood. Straight, clean, heavy. Ray would be proud, he never brought me anything this nice.'],
  sellCedar: ["Cedar. Smells like my grandmother's hope chest. People pay for that smell."],
  sellPine: ['Pine. Fine. Pine is fine.'],
  sellSpruce: ['Spruce. Honest wood. Nobody writes poems about it but everybody builds houses out of it.'],
  sellFir: ['Balsam. Smells like Christmas and splits like a dream.'],
  sellRotten: [
    'This is mostly air and beetles, mon chou. I give you a little for the beetles.',
    'Rotten. I can poke my finger through it. Look. I am poking.',
  ],
  sellChewed: ["Somebody's been chewing the ends. Hm. I won't ask. Same price."],
  sellMushrooms: ['Chanterelles! Real ones. You have good eyes.', 'Golden. Good. You did not eat the false ones, I see, you are still talking.'],
  sellFalse: ['These are not chanterelles. These are the other ones. Put them down slowly and wash your hands.'],
  poor: ["Short? Bring me wood. I always need wood. Everyone always needs wood. That's the whole economy up here."],
  rumorHound: [
    'Something has been chewing the axe handles in my shed. Only the handles. The heads are fine. Strange animal. Strange taste.',
    "If you hear growling at your woodpile at night, don't run. Running makes everything interested.",
  ],
  rumorBigfoot: [
    'You hear knocking in the cedars? Knock back. Politely. Three times. My father said it is rude not to answer.',
    "The big one? He's shy. Don't put a flashlight in his face. Would you like a flashlight in your face?",
  ],
  rumorGumberoo: ["Stay out of the old burn after supper. Marcel went in with a rifle. He came out with a black eye. From his own bullet."],
  rumorGranny: [
    "If the fog comes in thick and you get turned around, and an old lady with antlers offers to walk you home: say yes, and say thank you.",
    'She likes cookies. Oatmeal. Not raisin. Never raisin.',
  ],
  rumorRay: [
    "Your grandfather was a good man and a terrible bookkeeper. He paid me in firewood and stories. I'm still burning both.",
    "He used to say the bush isn't haunted, it's just occupied.",
  ],
  warnNight: ["Going out now? Take jerky. And a light. And maybe don't."],
  contract: ['Take what you like from the board. Pin it back if you change your mind, the tacks are cheap.'],
  bye: ['Bonne soirée.', 'Drive slow, the moose don\'t.', 'À la prochaine.', 'Keep your stove fed.'],
};

export const DOUG = {
  hello: ["You the wood guy? Thank god. Somebody burned the outhouse door last night. Not me. Allegedly."],
  paid: ['Beautiful splits. These are going straight into the fire pit and onto my resume.'],
  story: [
    "Kids keep asking about the glowing eyes out past the tent pads. I tell them it's raccoons. Big raccoons. Tall raccoons.",
    "Bought this campground off a guy in Kapuskasing. He said it 'basically runs itself'. It does. It runs itself into the lake.",
    "Jojo's mum has the school year, I get the summers and the long weekends. This year I asked for September too. Don't ask why. It's going great.",
    "Eleven sites, four campers, one picnic table that hasn't been burned yet. We're a destination.",
    "Your grandpa came by every Sunday with a bag of flapjack mix and no explanation. Kid still thinks he was a wizard. I haven't told her yet.",
  ],
};

/** more from Gérard: the town, the people in it, and Ray */
export const GERARD_MORE = [
  "My wife Odile does the mail and the radio. Thirty-one years on the air. She has a voice like a warm stove and opinions like a cold one.",
  "Lucien cooked in the bush camps for thirty years. Now he cooks for the church suppers. The church has never been so full, or so quiet.",
  "Old Hollis was a cookee at the Kettle camp when he was a boy. Ninety-three now. He still won't sit with his back to the woods.",
  "The Finn, Esko, runs a trapline up past the lake. He says two words a week. Usually 'no' and 'thanks'.",
  "The ranger, Kowalchuk, says somebody's been walking Ray's trapline since the funeral. I said good. Somebody should.",
  "We buried him in April, behind the church in Hearst. Odile still sets out two cups on Thursdays. I don't say anything.",
  "He left me his debts in the will. Then he left me a note saying there weren't any. That's Ray.",
];

const last = new Map<string, string>();
const rng = new Rng(77);

/** pick a line from a pool without repeating the previous pick */
export function line(pool: Pool, key = pool[0] ?? ''): string {
  if (pool.length === 0) return '';
  let s = rng.pick(pool);
  if (pool.length > 1) for (let i = 0; i < 4 && s === last.get(key); i++) s = rng.pick(pool);
  last.set(key, s);
  return s;
}

export function speak(name: string, text: string): string { return `<b>${name}:</b> ${text}`; }
