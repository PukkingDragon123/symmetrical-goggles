// Words. Pépère Ray's field journal, the critter notes the player fills in, notes and contracts. Ray Tremblay is
// your grandfather; he died this spring and left you the cabin (his note is still pinned to the door).
import type { Block } from '../ui/paper';

export interface CritterRule { id: string; text: string }
export interface Critter {
  id: string; name: string; latin: string;
  /** Ray's first, half-right notes (present from the start) */
  ray: string[];
  /** rules the player discovers by observing / experimenting */
  rules: CritterRule[];
  /** seen at all */
  seen?: boolean;
}

export const CRITTERS: Critter[] = [
  {
    id: 'hound', name: 'Axehandle Hound', latin: 'Canis manubriophagus',
    ray: ['Comes round the woodpile after dark. Head like an axe bit, body like a handle, legs like nothing.', 'It wants HANDLES, not hands. Mostly.', 'Jerky?? (try it)'],
    rules: [
      { id: 'night', text: 'Only comes out after sundown. Stays at the edge of the firelight.' },
      { id: 'handles', text: 'Goes for the axe, not you. Snatched mine right out of the block.' },
      { id: 'jerky', text: 'Beef jerky stops it cold. Hold it out and stand still.' },
      { id: 'friend', text: 'Fed it three times. Now it follows me around like a bad idea.' },
      { id: 'warn', text: 'Growls low before something big comes through the bush.' },
    ],
  },
  {
    id: 'bigfoot', name: 'Sasquatch', latin: 'Homo silvestris (?)',
    ray: ['Three knocks on a tree from the cedar hollow. Then nothing.', 'Prints 17 inches long by the creek. Never seen it close.', "Don't put the light on it. It's only shy."],
    rules: [
      { id: 'watch', text: 'Watches from the treeline at dusk. Never comes closer than a stone\'s throw.' },
      { id: 'light', text: 'Flashlight in its eyes and it is gone like smoke.' },
      { id: 'knock', text: 'Knock back on a trunk with the axe handle. It answers.' },
      { id: 'gift', text: 'Leave something on the big stump by the hollow. Something comes back.' },
    ],
  },
  {
    id: 'gumberoo', name: 'Gumberoo', latin: 'Elastocorpus inflammabilis',
    ray: ['Big round hairless thing in the old burn. Marcel swears his bullets bounced back at him.', 'Leave it alone. It rolls off.', 'Smells like a tire fire. Afraid of fire? Makes sense.'],
    rules: [],
  },
  {
    id: 'dingbat', name: 'Dingbats', latin: 'Chiroptera cornuta',
    ray: ['Little things with antler nubs in the eaves. Light the lantern and the whole roost goes mad.', 'Dark and quiet and they settle.'],
    rules: [],
  },
  {
    id: 'granny', name: 'Granny Tamarack', latin: '???',
    ray: ['Got lost in the fog by the hollow. Something tall with ANTLERS walked me home. Old woman\'s voice.', 'Left a tin of oatmeal cookies on the stump to say thanks. Tin was empty next morning, washed.'],
    rules: [],
  },
  {
    id: 'hidebehind', name: 'Hidebehind', latin: '—',
    ray: ['Always behind the tree I\'m not looking at.', 'Never seen it. Never.'],
    rules: [],
  },
];

export const RAY_NOTE: Block[] = [
  { t: 'h', text: 'Kid —' },
  { t: 'p', text: "If you're reading this the old place is yours. Sorry about the roof. Pinned this up in April, in case." },
  { t: 'p', text: "Nights get cold fast up here. Wood box is empty and the stove's cold, so first thing: wood." },
  { t: 'p', text: "Axe is stuck in the chopping block. There's a little spruce I flagged with orange tape behind the shed. Drop it toward the clearing, buck it short, split it on the block." },
  { t: 'p', text: 'Matches in the table drawer. Kindling first, then splits.' },
  { t: 'p', text: 'And keep jerky in your pocket after dark. Trust me on that one.' },
  { t: 'gap', h: 6 },
  { t: 'sig', text: '— Pépère' },
];

export const NOTES: Block[][] = [
  [
    { t: 'h', text: 'Felling (Ray\'s way)' },
    { t: 'p', text: 'Notch on the side you want it to fall. Hit high at an angle, then low and flat, back and forth: the chips pop out where the two cuts meet.' },
    { t: 'p', text: 'Same spot over and over just bruises it.' },
    { t: 'p', text: 'When it starts to talk (creak) step back and watch the top. Never stand behind the stump.' },
    { t: 'p', text: 'Limb it from the butt to the top. Buck it on the high side. Rounds a forearm long split easy.' },
    { t: 'p', text: 'Stand a round on the block, hit it square from above.' },
  ],
];
