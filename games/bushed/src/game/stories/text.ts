// The story's paper: pages Pépère Ray tore out of his book and hid before he died (found ones are pasted back into
// the Book of Cryptids), his will and his last letter, the cook's ledger, notices, the mail that comes to Pruneau's
// post wicket, and the letters he left in his cubbyhole for after. Ray writes in Caveat; Délima, his grandmother,
// in the old copperplate (IM Fell); notaries and companies in type; kids and Finns as they can.
import type { Block } from '../../ui/paper';

type Sketch = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
const sk = (h: number, draw: Sketch): Block => ({ t: 'sketch', h, draw });
const R = (text: string): Block => ({ t: 'p', text, hand: 'caveat' });
const RS = (text: string): Block => ({ t: 'sig', text, hand: 'caveat' });

/** Ray's map of the line: the lake trail, five sets, the old camp on the north shore */
const lineMap: Sketch = (g, x, y, w, h) => {
  g.strokeStyle = '#2a2a3a'; g.fillStyle = '#2a2a3a'; g.lineWidth = 2;
  // the lake
  g.beginPath(); g.ellipse(x + w * 0.78, y + h * 0.68, w * 0.2, h * 0.24, -0.4, 0, 7); g.stroke();
  g.font = '15px Caveat, serif'; g.fillText('lake', x + w * 0.72, y + h * 0.72);
  // cabin and trail
  g.strokeRect(x + w * 0.06, y + h * 0.82, 12, 10); g.fillText('cabin', x + w * 0.02, y + h * 0.98);
  g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.82); g.quadraticCurveTo(x + w * 0.3, y + h * 0.72, x + w * 0.55, y + h * 0.7); g.stroke();
  // the line: five sets curling north to the camp
  const sets = [[0.28, 0.66], [0.24, 0.5], [0.32, 0.34], [0.44, 0.2], [0.56, 0.18]];
  g.beginPath(); g.moveTo(x + w * 0.27, y + h * 0.74);
  for (const [sx, sy] of sets) g.lineTo(x + w * sx, y + h * sy);
  g.lineTo(x + w * 0.68, y + h * 0.26); g.stroke(); g.setLineDash([]);
  sets.forEach(([sx, sy], i) => { g.beginPath(); g.arc(x + w * sx, y + h * sy, 4, 0, 7); g.fill(); g.fillText(String(i + 1), x + w * sx + 6, y + h * sy - 4); });
  // the camp: two little rectangles and an X
  g.strokeRect(x + w * 0.66, y + h * 0.2, 16, 9); g.strokeRect(x + w * 0.72, y + h * 0.3, 20, 8);
  g.fillText('camp?', x + w * 0.74, y + h * 0.16);
  g.fillText('split rock', x + w * 0.27, y + h * 0.8);
};

/** a grainy trail-camera still, printed on the ranger's portable printer */
const camPhoto: Sketch = (g, x, y, w, h) => {
  g.strokeStyle = '#1e1e26'; g.lineWidth = 2; g.strokeRect(x + 8, y + 2, w - 16, h - 6);
  g.fillStyle = '#1e1e26';
  // noise
  for (let i = 0; i < 420; i++) g.fillRect(x + 10 + Math.random() * (w - 20), y + 4 + Math.random() * (h - 10), 1, 1);
  // trunks
  for (const tx of [0.12, 0.3, 0.83]) { g.fillRect(x + w * tx, y + 4, 7, h - 10); }
  // the man: hat, beard, a pot in one hand, the other hand up, waving
  const mx = x + w * 0.56, my = y + h * 0.3;
  g.beginPath(); g.arc(mx, my, 7, 0, 7); g.fill();
  g.fillRect(mx - 9, my - 9, 18, 3);
  g.lineWidth = 3; g.beginPath(); g.moveTo(mx, my + 7); g.lineTo(mx, my + 34); g.lineTo(mx - 7, my + 56); g.moveTo(mx, my + 34); g.lineTo(mx + 7, my + 56);
  g.moveTo(mx, my + 14); g.lineTo(mx - 14, my + 26); g.moveTo(mx, my + 14); g.lineTo(mx + 12, my - 2); g.lineTo(mx + 16, my - 10); g.stroke();
  g.beginPath(); g.ellipse(mx - 17, my + 30, 7, 5, 0, 0, 7); g.fill();
  g.font = '12px SpecialElite, monospace'; g.fillText('CAM3  09/14  06:14  3°C', x + 14, y + h - 10);
};

/** Jojo's drawing of the Kettle (the teakettler), in pencil crayon */
const jojoDraw: Sketch = (g, x, y, w, h) => {
  g.strokeStyle = '#2a2a3a'; g.lineWidth = 3; g.lineJoin = 'round';
  const cx = x + w * 0.45, cy = y + h * 0.58;
  // a fat round body like a kettle, a spout nose, four stick legs, steam
  g.beginPath(); g.ellipse(cx, cy, 52, 34, 0, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(cx + 46, cy - 10); g.lineTo(cx + 80, cy - 30); g.lineTo(cx + 84, cy - 24); g.lineTo(cx + 50, cy + 2); g.stroke();
  for (const lx of [-34, -14, 14, 34]) { g.beginPath(); g.moveTo(cx + lx, cy + 30); g.lineTo(cx + lx - 4, cy + 54); g.stroke(); }
  g.beginPath(); g.arc(cx + 22, cy - 12, 4, 0, 7); g.fill?.();
  g.beginPath(); g.moveTo(cx - 10, cy - 34); g.quadraticCurveTo(cx - 2, cy - 44, cx - 10, cy - 52); g.stroke();
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(cx + 88 + i * 8, y + h * 0.2 + i * 6); g.quadraticCurveTo(cx + 100 + i * 8, y + h * 0.1, cx + 90 + i * 10, y + h * 0.02 + i * 4); g.stroke(); }
  // a stick-figure kid with a mug
  const kx = x + w * 0.1, ky = y + h * 0.5;
  g.beginPath(); g.arc(kx, ky, 8, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(kx, ky + 8); g.lineTo(kx, ky + 36); g.lineTo(kx - 8, ky + 56); g.moveTo(kx, ky + 36); g.lineTo(kx + 8, ky + 56); g.moveTo(kx, ky + 16); g.lineTo(kx + 18, ky + 18); g.stroke();
  g.strokeRect(kx + 18, ky + 12, 9, 10);
  g.font = '16px PatrickHand, sans-serif'; g.fillStyle = '#2a2a3a'; g.fillText('ME', kx - 8, ky + 72); g.fillText('THE KETTEL', cx - 30, cy + 76);
};

/** pages that go into the Book once found (id -> blocks) */
export const PAGES: Record<string, { title: string; blocks: Block[] }> = {
  ray1: {
    title: 'Pépère, last September', blocks: [
      { t: 'h', text: 'Sept 1', hand: 'caveat' },
      R('Knee\'s done. Doc in Hearst says "no more bush." Doc in Hearst has never been in the bush.'),
      R('Still. I can\'t walk the line much longer and somebody has to.'),
      R('You\'re the only Tremblay left who answers the phone. So it goes to you, in the will. All of it.'),
      R('I tore some pages out of the book and hid them. Not to be cute. You won\'t believe a word of it unless you find it yourself. I didn\'t.'),
      R('Follow the orange tape from the woodshed. It goes where my legs used to.'),
      RS('— Pépère'),
    ],
  },
  ray2: {
    title: 'The line', blocks: [
      { t: 'h', text: 'The line', hand: 'caveat' },
      R('Seven miles once. Five sets now. Haven\'t caught a thing since the spring of \'89 and I\'ve never eaten better.'),
      R('The jaws are wired shut. The plates are for them.'),
      R('Put something on a plate, come back in the morning. They pay. Always. More than I can say for the Township.'),
      sk(150, lineMap),
      R('Tin lids on the trees, numbered. Start at the split rock.'),
    ],
  },
  ray3: {
    title: 'On the book', blocks: [
      { t: 'h', text: 'On the book', hand: 'caveat' },
      R('It came with the cabin. My grandmother said it came with the camp. It bites.'),
      R('Don\'t feed it. It eats what you learn and it\'s never full.'),
      R('It liked her better than me. It\'ll like you better than me. Let it.'),
      R('Hold it up when you see something new and keep your thumbs out of the gutter.'),
    ],
  },
  ray4: {
    title: 'Set five', blocks: [
      { t: 'h', text: 'Set five', hand: 'caveat' },
      R('Last one. The camp\'s just past it, on the shore. Fifteen minutes on two good knees, an hour on mine.'),
      R('The old Kettle camp. Rang 4 Timber Company. My grandmother cooked there twenty-eight winters.'),
      R('They closed it in \'51. Nobody told the crew.'),
    ],
  },
  ledger: {
    title: 'Livre de la cuisine', blocks: [
      { t: 'h', text: 'Livre de la cuisine', hand: 'fell' },
      { t: 'small', text: 'Camp Kettle — Mme D. Tremblay, cook — 1923', hand: 'fell' },
      { t: 'p', text: 'Rules of this cookery, which the foreman will not write down, so I do.', hand: 'fell' },
      { t: 'p', text: 'One plate for the bush every night, after the men. Hot. Not scraps.', hand: 'fell' },
      { t: 'p', text: 'Ring the gut hammer twice for the men, and once for the others.', hand: 'fell' },
      { t: 'p', text: 'Tell the stories at the stove. A story is how they know they are welcome.', hand: 'fell' },
      { t: 'p', text: 'Whoever cooks here keeps this book.', hand: 'fell' },
    ],
  },
  notice: {
    title: 'Notice, 1951', blocks: [
      { t: 'h', text: 'NOTICE', hand: 'type' },
      { t: 'p', text: 'Camp Kettle will close April 30, 1951. The Company has gone to trucks and power saws. All hands to report to the depot for their time. Cook and cookee likewise.', hand: 'type' },
      { t: 'sig', text: '— Rang 4 Timber Co. Ltd.', hand: 'type' },
      { t: 'p', text: 'Mme Tremblay says she is not going anywhere. — A.G., foreman', hand: 'patrick' },
      { t: 'p', text: 'Neither are they. — H.B.', hand: 'apple' },
    ],
  },
  ray5: {
    title: 'A page in fresh pencil', blocks: [
      { t: 'h', text: 'Thursday', hand: 'caveat' },
      R('Kid got the cabin stove lit. Saw the smoke from the point.'),
      R('Fed the hound three nights running, by the look of it. Soft. Good.'),
      R('Cold out here. Colder than it ought to be. I don\'t feel it much now.'),
      R('Supper soon.'),
    ],
  },
  ray6: {
    title: 'Supper\'s at sundown', blocks: [
      { t: 'h', text: 'Kid —', hand: 'caveat' },
      R('That\'s the gut hammer. Délima\'s. Hang it back on its post at the cookhouse.'),
      R('Cook something. I don\'t care what. Hot. Enough for everybody.'),
      R('Ring it at sundown. Once, for the others.'),
      R('I\'ll be along.'),
      RS('— Pépère'),
    ],
  },
  esko: {
    title: 'Ray\'s fur tally', blocks: [
      { t: 'h', text: 'R. Tremblay — fur', hand: 'caveat' },
      R('\'74: 31 marten, 6 fisher, 1 lynx (sorry).'),
      R('\'80: 22 marten.'),
      R('\'86: 9 marten. Something eats the bait, springs the trap, leaves a pine cone. A thank-you?'),
      R('\'88: 2 marten. Same thank-you.'),
      R('\'89: none. Wired the jaws. Bought plates.'),
      { t: 'p', text: 'Fool. — E.M.', hand: 'patrick' },
    ],
  },
  crew: {
    title: 'The last crew', blocks: [
      { t: 'h', text: 'Last crew, winter \'50–\'51', hand: 'apple' },
      { t: 'p', text: 'Foreman: A. Gauthier. Clerk: none, we lost him in \'48 (to Timmins).', hand: 'apple' },
      { t: 'p', text: 'Teamsters: Big Pete, Little Pete, the Swede who was Norwegian.', hand: 'apple' },
      { t: 'p', text: 'Choppers: twenty-two, give or take a Gagnon.', hand: 'apple' },
      { t: 'p', text: 'Cook: Mme Délima Tremblay. Cookee: H. Beattie, aged 17.', hand: 'apple' },
      { t: 'p', text: 'Not pictured: the others. They never sat for a photograph.', hand: 'apple' },
    ],
  },
  trailcam: {
    title: 'Trail camera, CAM3', blocks: [
      { t: 'h', text: 'CAM3 — north shore', hand: 'type' },
      sk(170, camPhoto),
      { t: 'p', text: 'I was at his funeral in April. The clock on this camera is wrong. — M.K.', hand: 'patrick' },
    ],
  },
  jojo: {
    title: 'The Kettle, by Jojo', blocks: [
      { t: 'h', text: 'THE KETTEL', hand: 'patrick' },
      sk(190, jojoDraw),
      { t: 'p', text: 'IT IS MY FREIND. IT WALKS BACKWERDS. BY JOJO AGE 9', hand: 'patrick' },
    ],
  },
};

/** Ray's radio log (the item from set five; Odile wants it): the last of thirty-one years of Thursdays */
export const RADIO_LOG: Block[] = [
  { t: 'h', text: 'CKLK — Thursdays', hand: 'caveat' },
  { t: 'small', text: 'Kettle Lake After Dark. What I told her.', hand: 'caveat' },
  R('Feb 6. Hound at the woodpile. Fed him. Told Odile it was "a neighbour\'s dog". She laughed.'),
  R('Feb 13. Big fella knocked twice. TWICE. He\'s getting lazy.'),
  R('Mar 6. Knee. Didn\'t call.'),
  R('Mar 27. Told Odile the kid\'s getting the place. She said good. She said, "And you, Ray?" Hung up. Coward.'),
  R('Apr 3. Couldn\'t get to the set. Odile, if you\'re reading this: Thursdays.'),
];

/** the will, the notary's copy (on the passenger seat in the opening; in the book once his letter is) */
export const WILL: Block[] = [
  { t: 'h', text: 'Last Will', hand: 'type' },
  { t: 'small', text: 'and Testament of Raymond Joseph Tremblay, of Lot 14, Rang 4, Township of Kettle Lake', hand: 'type' },
  { t: 'line' },
  { t: 'p', text: 'I give my cabin, its stove and its contents, and my right to the old Camp Kettle on the north shore, to my grandchild.', hand: 'type' },
  { t: 'p', text: 'With the camp go its rules, as my grandmother Délima kept them. My grandchild will know what this means in time.', hand: 'type' },
  { t: 'p', text: 'My radio to Odile Pruneau. My debts to Gérard Pruneau, who will pretend there are none.', hand: 'type' },
  { t: 'sig', text: 'R. J. Tremblay', hand: 'caveat' },
  { t: 'small', text: 'Witness: L. Gagné, notary, Hearst. April 9.', hand: 'type' },
];

/** the camp sign, painted on a board */
export const CAMP_SIGN = ['CAMP KETTLE', 'RANG 4 TIMBER CO.', '1923'];

// ---------------------------------------------------------------------------------------------- the mail
export interface Letter { id: string; from: string; blocks: Block[]; seed: number }
const L = (id: string, from: string, seed: number, blocks: Block[]): Letter => ({ id, from, seed, blocks });

export const LETTERS: Record<string, Letter> = {
  ray: L('ray', 'Pépère (his last letter)', 31, [
    { t: 'h', text: 'Kid —', hand: 'caveat' },
    R('If Odile handed you this, you found the store and you\'ve got the will, and I\'m behind the church in Hearst. Don\'t stand there long. It\'s cold and I\'m not in it.'),
    R('The will says what\'s yours. This says what it means. The cabin\'s the easy part. The camp comes with a job, and I couldn\'t put the job in the will without the notary calling somebody.'),
    R('I\'ve gone up the line, as the old jacks used to say. I know exactly where I am, which is more than most people can say.'),
    R('I left you a trail. Start where you\'d start: the woodpile. Under the bottom row, by the block.'),
    RS('— Pépère'),
    { t: 'small', text: 'P.S. Pay Gérard for the coffee. He says it\'s free. It isn\'t.', hand: 'caveat' },
  ]),
  township: L('township', 'the Township', 32, [
    { t: 'h', text: 'TOWNSHIP OF KETTLE LAKE', hand: 'type' },
    { t: 'small', text: 'Notice of arrears — Lot 14, Rang 4 (estate of R. Tremblay)', hand: 'type' },
    { t: 'p', text: 'Amount owing: $14.60. Outstanding since: 1987. This is our fourteenth notice. Our condolences.', hand: 'type' },
    { t: 'p', text: 'Please remit at Pruneau\'s General Store. Please.', hand: 'type' },
    { t: 'sig', text: '— the Clerk (Tuesdays and every other Thursday)', hand: 'type' },
  ]),
  lise: L('lise', 'Tante Lise', 33, [
    { t: 'h', text: 'Mon petit,', hand: 'apple' },
    { t: 'p', text: 'I couldn\'t come up for it. My hip and the bus from Sudbury don\'t agree. Odile says it was a good funeral and that he would have hated it.', hand: 'apple' },
    { t: 'p', text: 'The notary says he left you the camp. He left me his good thermos and a note that says "Don\'t." I don\'t know what it means either. He talked about you every Sunday.', hand: 'apple' },
    { t: 'sig', text: '— Lise (his sister), Sudbury', hand: 'apple' },
    { t: 'small', text: 'P.S. Eat something.', hand: 'apple' },
  ]),
  ministry: L('ministry', 'the Ministry', 34, [
    { t: 'h', text: 'Ministry of Natural Resources', hand: 'type' },
    { t: 'small', text: 'Kettle Lake District — Re: Lot 14, Rang 4 (estate of R. Tremblay): reports of a light at the old Kettle camp', hand: 'type' },
    { t: 'p', text: 'Please contact the undersigned at your convenience. She is usually by the lake. Please do not bring any animals, however friendly.', hand: 'type' },
    { t: 'sig', text: '— C.O. M. Kowalchuk', hand: 'type' },
  ]),
  company: L('company', 'Rang 4 Timber Co.', 35, [
    { t: 'h', text: 'RANG 4 TIMBER CO. LTD.', hand: 'type' },
    { t: 'small', text: '(in receivership) — to Mme Délima Tremblay, Cook, Camp Kettle', hand: 'type' },
    { t: 'p', text: 'Re: final wages, season 1950–51. Enclosed please find our cheque for $3.12, being the balance owing after deduction for board. This cheque is void after 90 days. Dated 14 March 1952.', hand: 'type' },
    { t: 'small', text: 'Forwarded 1952, 1961, 1979, 2003, and now. RETURN TO SENDER: ADDRESSEE IN BUSH.', hand: 'type' },
  ]),
  listener: L('listener', 'Bev, Smooth Rock Falls', 36, [
    { t: 'h', text: 'For the Cookee\'s grandkid, c/o CKLK', hand: 'apple' },
    { t: 'p', text: 'We heard about him. We\'re sorry. Thirty years we listened in the truck at the mill gate. When he said the big fella "knocked twice, he\'s getting lazy", Raymond laughed so hard he drove into the ditch.', hand: 'apple' },
    { t: 'p', text: 'Call in again. Odile sounds tired.', hand: 'apple' },
    { t: 'sig', text: '— Bev and Raymond (a different Raymond)', hand: 'apple' },
  ]),
  lachance: L('lachance', 'Mme Lachance', 37, [
    { t: 'h', text: 'Merci.', hand: 'apple' },
    { t: 'p', text: 'It\'s hanging over the door where Jean-Louis kept it. I talk to it. It doesn\'t answer, which is how I know it\'s his.', hand: 'apple' },
    { t: 'sig', text: '— G. Lachance', hand: 'apple' },
  ]),
  jojo: L('jojo', 'Jojo', 38, [
    { t: 'h', text: 'TO THE COOK AT RAYS', hand: 'patrick' },
    { t: 'p', text: 'THANK YOU FOR NOT TELLING DAD ABOUT THE COFFEE. I TOLD HIM. HE SAID ITS FINE IF YOUR THERE. ARE YOU THERE', hand: 'patrick' },
    { t: 'sig', text: '— JOJO', hand: 'patrick' },
  ]),
  // the letters he wrote at the kitchen table in March and left in his cubbyhole, each marked "not before"
  post1: L('post1', 'Pépère (a letter from the cubbyhole)', 41, [
    { t: 'h', text: 'Not before the supper.', hand: 'caveat' },
    R('If you\'re reading this one, you rang it, and they came, and I suppose I did too. I hoped I would.'),
    R('Feed the crew. Hot. Not scraps.'),
    RS('— Pépère'),
  ]),
  post2: L('post2', 'Pépère (a letter from the cubbyhole)', 42, [
    { t: 'h', text: 'On the big fella.', hand: 'caveat' },
    R('He\'s shy, not slow. Keep the light off him. Thirty Easters he left a trout on the stump and I never once saw him do it.'),
    R('Give him my best: three knocks.'),
    RS('— Pépère'),
  ]),
  post3: L('post3', 'Pépère (a letter from the cubbyhole)', 43, [
    { t: 'h', text: 'On Odile.', hand: 'caveat' },
    R('Thursdays, nine o\'clock. Call in. She\'ll pretend she doesn\'t know your voice. She knew mine for thirty-one years and never once let on.'),
    RS('— Pépère'),
  ]),
  post4: L('post4', 'Pépère (a letter from the cubbyhole)', 44, [
    { t: 'h', text: 'Last one.', hand: 'caveat' },
    R('That\'s all of them. I wrote them at the kitchen table in March with the stove going and the hound under it.'),
    R('Don\'t keep the place like a museum. Burn the wood, eat the food, wear out the floor. That\'s what it\'s for.'),
    RS('— Pépère'),
  ]),
};
