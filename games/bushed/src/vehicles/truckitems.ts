// Store items the truck's repairs need (merged into ITEMS by installTruck when items.ts doesn't list them yet).
// Models are existing Poly Haven props (src/places/props.ts).
import type { ItemDef } from '../game/items';

export const TRUCK_ITEMS: Record<string, ItemDef> = {
  toolbox: {
    id: 'toolbox', name: "Mechanic's toolbox", desc: 'Wrenches, a socket set, a tyre iron and a jack. Every truck repair starts with this.',
    price: 38, sell: 12, mass: 7, model: 'ammo_box', pocket: false, tags: ['truck', 'tool'],
  },
  panel_hammer: {
    id: 'panel_hammer', name: 'Body hammer and dolly', desc: 'For beating dents back out of a fender. Reusable, and very satisfying.',
    price: 18, sell: 6, mass: 0.9, model: 'wooden_hammer_01', pocket: true, tags: ['truck', 'tool'],
  },
  bumper_bolts: {
    id: 'bumper_bolts', name: 'Bumper bolts', desc: 'Four grade-8 bolts, nuts and fat washers. A hung bumper goes back on.',
    price: 6, mass: 0.4, model: 'cleaner_tin_01', pocket: true, tags: ['truck', 'part'],
  },
  windshield: {
    id: 'windshield', name: 'Windshield', desc: 'A new pane of laminated glass with the rubber seal, wrapped in cardboard.',
    price: 65, mass: 14, model: 'cardboard_box_01', pocket: false, tags: ['truck', 'part'],
  },
  headlamp: {
    id: 'headlamp', name: 'Sealed-beam headlamp', desc: 'A round 7-inch sealed beam. Fits the old truck, one lamp per box.',
    price: 14, mass: 0.8, model: 'cardboard_box_01', pocket: true, tags: ['truck', 'part'],
  },
  tyre: {
    id: 'tyre', name: 'Spare tyre', desc: 'A 31-inch all-terrain on a steel rim. Heavy. Roll it, don\'t carry it.',
    price: 55, sell: 15, mass: 24, model: 'old_tyre', pocket: false, tags: ['truck', 'part'],
  },
  engine_parts: {
    id: 'engine_parts', name: 'Engine parts', desc: 'Radiator hoses, a fan belt, six plugs and a can of coolant. Fixes most of what a crash does to an engine.',
    price: 30, mass: 3, model: 'small_oil_can_01', pocket: true, tags: ['truck', 'part'],
  },
};
