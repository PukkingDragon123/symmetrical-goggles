// Contracts pinned to the store's noticeboard. Each is a handwritten sheet the player takes down, reads and
// keeps in the journal. Progress is checked by the game against the world (pieces delivered, road cleared...).
import type { Block } from '../ui/paper';

export type ContractState = 'posted' | 'taken' | 'done' | 'paid' | 'failed';

export interface Contract {
  id: string;
  from: string;
  title: string;
  body: string;
  pay: number;
  /** game day it must be done by (inclusive); undefined = no deadline */
  due?: number;
  /** what counts: species/kind/count/where */
  goal: { kind: 'splits' | 'logs' | 'clear_road' | 'item' | 'mushrooms'; count: number; species?: string; minLen?: number; where: string };
  state: ContractState;
  progress: number;
  /** written in this hand */
  hand: 'caveat' | 'apple' | 'patrick' | 'type';
  paperSeed: number;
}

export function initialContracts(): Contract[] {
  return [
    {
      id: 'camp_wood', from: 'Doug, Lakeside campground', title: 'FIREWOOD WANTED',
      body: 'Need 10 good splits in the woodbox at the lakeside campsite. Campers keep burning the picnic table. Cash on delivery.',
      pay: 40, due: 3, goal: { kind: 'splits', count: 10, where: 'campsite' }, state: 'posted', progress: 0, hand: 'patrick', paperSeed: 11,
    },
    {
      id: 'birch_logs', from: 'O. Pruneau', title: 'BOULEAU / BIRCH',
      body: '3 paper birch logs, 2 m or longer, delivered to the log deck behind the store. Straight ones. I pay the scale price plus a bonus.',
      pay: 30, goal: { kind: 'logs', count: 3, species: 'birch', minLen: 2, where: 'log_deck' }, state: 'posted', progress: 0, hand: 'caveat', paperSeed: 12,
    },
    {
      id: 'store_cord', from: 'O. Pruneau', title: 'Bois pour le poêle',
      body: "The store stove eats like a teenager. 20 splits stacked on the store porch, any species but cedar (it spits).",
      pay: 60, due: 6, goal: { kind: 'splits', count: 20, where: 'store_porch' }, state: 'posted', progress: 0, hand: 'caveat', paperSeed: 13,
    },
    {
      id: 'deadfall', from: 'Township of Kettle Lake (Roads)', title: 'DEADFALL ON HWY',
      body: 'Blowdown across the highway east of the store near the km 3 post. Clear the travelled lane. Keep the wood. Township pays on inspection.',
      pay: 35, goal: { kind: 'clear_road', count: 1, where: 'highway_km3' }, state: 'posted', progress: 0, hand: 'type', paperSeed: 14,
    },
    {
      id: 'lost_axe', from: 'Mme G. Lachance', title: 'LOST — an axe',
      body: "My late husband's axe. Red handle, his initials burned in. He lost it near the cedar hollow the autumn before he passed. I would like it back. Reward.",
      pay: 50, goal: { kind: 'item', count: 1, where: 'hollow' }, state: 'posted', progress: 0, hand: 'apple', paperSeed: 15,
    },
    {
      id: 'chanterelles', from: 'O. Pruneau', title: 'CHANTERELLES',
      body: 'Buying golden chanterelles, $15 a kilo, as many as you find. They like the moss under the old spruce. Not the false ones (gills like a knife).',
      pay: 0, goal: { kind: 'mushrooms', count: 0, where: 'store' }, state: 'posted', progress: 0, hand: 'caveat', paperSeed: 16,
    },
  ];
}

export function contractPaper(c: Contract): Block[] {
  const blocks: Block[] = [
    { t: 'h', text: c.title, hand: c.hand },
    { t: 'p', text: c.body, hand: c.hand },
    { t: 'gap', h: 8 },
    { t: 'p', text: c.pay > 0 ? `Pays $${c.pay}` : 'Paid by weight', hand: c.hand },
  ];
  if (c.due !== undefined) blocks.push({ t: 'small', text: `Needed by day ${c.due + 1}`, hand: c.hand });
  blocks.push({ t: 'sig', text: `— ${c.from}`, hand: c.hand });
  if (c.state === 'done' || c.state === 'paid') blocks.push({ t: 'p', text: c.state === 'paid' ? 'PAID' : 'DONE', color: '#8a2a22' });
  return blocks;
}
