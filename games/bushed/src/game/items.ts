// Item catalogue: everything the player can own, carry, buy or sell. Tools have real gameplay stats.
// model: a Poly Haven prop id (public/assets/models/<id>.glb via src/places/props.ts) or 'gen:<id>' for a
// product generated in code (src/places/products.ts buildProduct(id)).

export interface ToolStats {
  kind: 'axe' | 'hatchet' | 'splitter' | 'maul' | 'saw' | 'chainsaw';
  /** 0..1 edge quality (dulls with use, restored by the file) */
  sharp: number;
  /** head mass kg: more momentum, more stamina */
  headMass: number;
  /** extra reach beyond the arm (m) */
  reach: number;
  /** seconds for a full swing (wind-up to impact at full charge) */
  swingTime: number;
  /** effectiveness multipliers */
  fell: number; split: number; limb: number;
  /** stamina cost per full swing (0..1 of the bar) */
  stamina: number;
}

export interface FoodStats { kcal: number; warmth?: number; raw?: boolean; houndTreat?: number; drink?: boolean }

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  /** shop price in dollars (0 = not sold) */
  price: number;
  /** what the store pays you (0 = won't buy) */
  sell?: number;
  mass: number;
  model: string;
  /** fits in the backpack */
  pocket: boolean;
  tool?: ToolStats;
  food?: FoodStats;
  /** unlocked at the store only after this many dollars earned in total */
  unlockAt?: number;
  tags?: string[];
}

export const ITEMS: Record<string, ItemDef> = {
  // ---------------------------------------------------------------- tools
  axe_old: {
    id: 'axe_old', name: "Grandpa's felling axe", desc: 'A 3½ lb felling axe with a rehung hickory handle. The edge has seen better decades.',
    price: 0, mass: 2.4, model: 'wooden_axe_03', pocket: false,
    tool: { kind: 'axe', sharp: 0.55, headMass: 1.6, reach: 0.55, swingTime: 0.62, fell: 1, split: 0.7, limb: 0.9, stamina: 0.06 },
  },
  hatchet: {
    id: 'hatchet', name: 'Hatchet', desc: 'Light and quick. Limbing, kindling, and the occasional tent peg.',
    price: 28, mass: 0.9, model: 'hatchet', pocket: true,
    tool: { kind: 'hatchet', sharp: 0.85, headMass: 0.6, reach: 0.25, swingTime: 0.38, fell: 0.35, split: 0.45, limb: 1.4, stamina: 0.025 },
  },
  axe_felling: {
    id: 'axe_felling', name: 'Swedish felling axe', desc: 'Thin bit, hand-forged, shaving sharp out of the box. Bites deep across the grain.',
    price: 85, mass: 2.2, model: 'wooden_axe', pocket: false,
    tool: { kind: 'axe', sharp: 0.95, headMass: 1.5, reach: 0.6, swingTime: 0.58, fell: 1.45, split: 0.6, limb: 1, stamina: 0.055 },
  },
  axe_splitting: {
    id: 'axe_splitting', name: 'Splitting axe', desc: 'A fat wedge of a head. Bounces off standing timber, bursts rounds apart.',
    price: 55, mass: 2.8, model: 'wooden_axe_02', pocket: false,
    tool: { kind: 'splitter', sharp: 0.8, headMass: 2.0, reach: 0.6, swingTime: 0.7, fell: 0.55, split: 1.5, limb: 0.6, stamina: 0.07 },
  },
  maul: {
    id: 'maul', name: '8 lb splitting maul', desc: 'Slow, brutal and honest. Knotty rounds fear it.',
    price: 70, mass: 4.6, model: 'sledgehammer_01', pocket: false,
    tool: { kind: 'maul', sharp: 0.7, headMass: 3.6, reach: 0.65, swingTime: 0.95, fell: 0.2, split: 2.2, limb: 0.2, stamina: 0.11 },
  },
  bucksaw: {
    id: 'bucksaw', name: 'Bow saw', desc: 'Clean, quiet bucking cuts. Logs with square ends fetch a better price.',
    price: 40, mass: 1.1, model: 'handsaw_wood', pocket: false,
    tool: { kind: 'saw', sharp: 0.9, headMass: 0.3, reach: 0.3, swingTime: 0.5, fell: 0.6, split: 0, limb: 0.8, stamina: 0.03 },
  },
  chainsaw: {
    id: 'chainsaw', name: 'Chainsaw', desc: 'Loud. Fast. Everything in the forest will know where you are.',
    price: 640, mass: 6.2, model: 'gen:chainsaw', pocket: false, unlockAt: 900,
    tool: { kind: 'chainsaw', sharp: 1, headMass: 0, reach: 0.45, swingTime: 0, fell: 6, split: 0, limb: 4, stamina: 0.01 },
  },
  file: { id: 'file', name: 'Mill bastard file', desc: 'Ten strokes a side and the old axe remembers its job.', price: 12, mass: 0.25, model: 'gen:file', pocket: true },
  log_tongs: { id: 'log_tongs', name: 'Log tongs', desc: 'Bite a log and drag it with half the effort.', price: 35, mass: 1.4, model: 'gen:log_tongs', pocket: false, unlockAt: 150 },
  // ---------------------------------------------------------------- light and fire
  flashlight: { id: 'flashlight', name: 'Flashlight', desc: 'Two D cells. Things in the woods do not like it in their eyes.', price: 18, mass: 0.6, model: 'vintage_flashlight', pocket: true },
  batteries: { id: 'batteries', name: 'D batteries (2)', desc: 'About four hours of courage.', price: 6, mass: 0.28, model: 'gen:batteries', pocket: true },
  lantern: { id: 'lantern', name: 'Kerosene lantern', desc: 'Warm light that lasts the night.', price: 32, mass: 1.3, model: 'Lantern_01', pocket: false },
  matches: { id: 'matches', name: 'Strike-anywhere matches', desc: 'Box of 250. Keep them dry.', price: 3, mass: 0.05, model: 'gen:matches', pocket: true },
  firestarter: { id: 'firestarter', name: 'Fatwood sticks', desc: 'Resin-soaked pine. Lights in the rain.', price: 7, mass: 0.3, model: 'gen:fatwood', pocket: true },
  // ---------------------------------------------------------------- food
  jerky: { id: 'jerky', name: 'Beef jerky', desc: 'Peppered. Tough as a boot. Some things in the woods would kill for it.', price: 6, mass: 0.12, model: 'gen:jerky', pocket: true, food: { kcal: 300, houndTreat: 1 } },
  beer: { id: 'beer', name: 'Beer', desc: 'A stubby brown bottle of the local lager.', price: 3, mass: 0.55, model: 'gen:beer', pocket: true, food: { kcal: 150, warmth: 0.05, drink: true } },
  coffee: { id: 'coffee', name: 'Ground coffee', desc: 'A tin of dark roast. Boil it in the pot, cowboy style.', price: 9, mass: 0.45, model: 'gen:coffee', pocket: true, food: { kcal: 5, warmth: 0.25, drink: true } },
  beans: { id: 'beans', name: 'Baked beans', desc: 'Maple-sweet. Better hot.', price: 4, mass: 0.45, model: 'gen:beans', pocket: true, food: { kcal: 420, warmth: 0.1 } },
  bread: { id: 'bread', name: 'Bannock loaf', desc: 'Dense, buttery, made this morning.', price: 5, mass: 0.5, model: 'gen:bannock', pocket: true, food: { kcal: 700 } },
  eggs: { id: 'eggs', name: 'Eggs (half dozen)', desc: 'From the hens out back of the store.', price: 5, mass: 0.4, model: 'gen:eggs', pocket: true, food: { kcal: 420, raw: true } },
  bacon: { id: 'bacon', name: 'Back bacon', desc: 'Peameal, wrapped in paper.', price: 9, mass: 0.5, model: 'gen:bacon', pocket: true, food: { kcal: 900, raw: true } },
  syrup: { id: 'syrup', name: 'Maple syrup', desc: 'Dark, from the sugar shack down the highway.', price: 11, mass: 0.6, model: 'gen:syrup', pocket: true, food: { kcal: 520 } },
  cookies: { id: 'cookies', name: 'Oatmeal cookies', desc: 'A tin of a dozen. Somebody out there has a sweet tooth.', price: 7, mass: 0.35, model: 'gen:cookies', pocket: true, food: { kcal: 600 } },
  berries: { id: 'berries', name: 'Wild blueberries', desc: 'Picked from the burn.', price: 0, sell: 6, mass: 0.2, model: 'gen:berries', pocket: true, food: { kcal: 90 } },
  chanterelle: { id: 'chanterelle', name: 'Chanterelles', desc: 'Golden, apricot-scented. The store pays well.', price: 0, sell: 14, mass: 0.2, model: 'gen:chanterelle', pocket: true, food: { kcal: 40, raw: true } },
  fish: { id: 'fish', name: 'Lake trout', desc: 'Cold-water fish. Fry it in butter.', price: 0, sell: 12, mass: 1.6, model: 'gen:trout', pocket: true, food: { kcal: 800, raw: true } },
  // ---------------------------------------------------------------- camp and kit
  rope: { id: 'rope', name: 'Manila rope (15 m)', desc: 'For hauling, hanging food, and tying things to other things.', price: 14, mass: 1.5, model: 'gen:rope', pocket: true },
  first_aid: { id: 'first_aid', name: 'First aid kit', desc: 'Bandages, iodine, a sewing needle, a mickey of rye for emergencies.', price: 24, mass: 0.7, model: 'medical_box', pocket: true },
  gloves: { id: 'gloves', name: 'Lined work gloves', desc: 'Warmer hands, steadier swings in the cold.', price: 16, mass: 0.3, model: 'garden_gloves_01', pocket: true },
  pot: { id: 'pot', name: 'Enamel pot', desc: 'Stew, coffee, and boiling the unspeakable.', price: 15, mass: 1.1, model: 'pot_enamel_01', pocket: false },
  pan: { id: 'pan', name: 'Cast-iron pan', desc: 'Heavy enough to defend yourself with.', price: 22, mass: 2.6, model: 'brass_pan_01', pocket: false },
  knife: { id: 'knife', name: 'Fillet knife', desc: 'For fish, bacon, and opening stubborn jerky.', price: 12, mass: 0.15, model: 'fish_knife', pocket: true },
  sleeping_bag: { id: 'sleeping_bag', name: 'Wool sleeping bag', desc: 'Rated to minus twenty. Rated by whom, nobody knows.', price: 60, mass: 2.4, model: 'gen:sleeping_bag', pocket: false },
  backpack_big: { id: 'backpack_big', name: 'Canvas pack (large)', desc: 'More pockets than you will ever remember.', price: 45, mass: 1.2, model: 'gen:backpack', pocket: false, unlockAt: 100 },
  // ---------------------------------------------------------------- resources (sold at the store)
  kindling: { id: 'kindling', name: 'Kindling', desc: 'Dry twigs and splinters.', price: 0, sell: 1, mass: 0.4, model: 'gen:kindling', pocket: true },
  firewood: { id: 'firewood', name: 'Split firewood', desc: 'A good quartered split.', price: 0, sell: 2, mass: 2.5, model: 'gen:split', pocket: false },
  bundle: { id: 'bundle', name: 'Firewood bundle', desc: 'Six splits tied with twine, for the campgrounds.', price: 9, sell: 7, mass: 15, model: 'gen:bundle', pocket: false },
};

/** timber value per cubic metre by species (dollars), before quality */
export const TIMBER_PRICE: Record<string, number> = { spruce: 70, fir: 60, pine: 80, birch: 95, cedar: 140 };
