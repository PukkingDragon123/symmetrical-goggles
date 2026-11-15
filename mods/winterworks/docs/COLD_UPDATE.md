# Winterworks: the Cold Zone update (design contract)

This file is the contract between the parts of the update: ids, model part names, clip names and numbers.
Code, art and data must use these names exactly. Change a name here first, then everywhere.

Namespace: `winterworks`. Java package root: `dev.lowpix.winterworks`. Minecraft 1.21.1, Fabric, Mojang mappings.
Models are lowpix box specs in Minecraft pixels (see `examples/src/icebreaker.py`, `docs/MINECRAFT.md`),
exported with `python -m lowpix mc export`. lowpix space: Y up, ground y=0, the model faces +Z, "right" is -X.

## 1. The cold

* **Cold exposure** (per player, `cold.ColdSystem`): adds to vanilla frozen ticks (the powder-snow frost
  overlay, slowdown and freeze damage), so no new HUD.
  * Ice Caves biome: 0.25 frozen ticks per tick (fully frozen after ~28 s).
  * In water in a cold biome (`Biome#coldEnoughToSnow`): 0.4.
  * Snowstorm (raining, snow falls at your position, sky visible): 0.15; thundering (blizzard): 0.35.
  * Capped at the vanilla full-freeze value (140), so ambient cold hurts like powder snow (1 per 2 s).
* **Warmth** stops cold: within 5 blocks of a lit campfire/soul campfire, fire, lava, magma block or lit
  furnace/smoker/blast furnace; within 2 of a torch/lantern; or holding a torch/lantern. Any leather or fur
  armour piece makes you freeze-immune (vanilla `#minecraft:freeze_immune_wearables`), so no cold freezing.
* **Frostbite** (`winterworks:frostbite`, harmful): freezes fast (+8 frozen ticks/tick up to 180) and deals
  freeze damage (1 + amplifier) every 30 ticks. Entities that can't freeze are immune.
* Breath vapour (`frost_breath` particles) puffs from players and mobs in cold places. Shivering sound when
  frozen ticks > 100.

## 2. Polar Bear Fur armour (`fur_hood`, `fur_coat`, `fur_leggings`, `fur_boots`)

* Material `winterworks:fur`: defence 2/5/4/2 (hood/coat/legs/boots), toughness 0, enchantability 15,
  durability multiplier 12, repair item `polar_bear_fur`, equip sound `item.armor.equip_fur`.
* Recipes: fur `F` + any wool `W` (`#minecraft:wool`): hood `FWF`/`F F`, coat `F F`/`FWF`/`FFF`,
  leggings `FWF`/`F F`/`F F`, boots `F F`/`W W`.
* Any piece: freeze immune, immune to Slowness, Frostbite and Stunned.
* When you're in the cold (any exposure above, near ancient ice, or a cold attack just hit you): Strength I
  with 1-2 pieces, II with 3, III with the full set (refreshed every second while cold).
* In the Nether (ultra-warm dimension): overheating, 1 damage every 60/pieces ticks
  (`winterworks:overheat` damage type) with steam puffs.
* 3D model `fur_armor` (a polar bear pelt: the hood is the bear's head with snout and ears, a thick fur mantle,
  shaggy sleeves, fur trousers, big fur boots). Bones, with the vanilla player pivots in lowpix space:
  `head` (0,24,0), `body` (0,24,0), `right_arm` (-5,22,0), `left_arm` (5,22,0), `right_leg` (-1.9,12,0),
  `left_leg` (1.9,12,0), `right_boot` (-1.9,12,0), `left_boot` (1.9,12,0). The player's body: head
  x -4..4, y 24..32, z -4..4; body x -4..4, y 12..24, z -2..2; right arm x -8..-4, y 12..24, z -2..2;
  legs x -4..0 / 0..4, y 0..12, z -2..2. Armour sits ~1 px outside. Hood = bone `head`; coat = `body` +
  both arms; leggings = both legs; boots = both boots.

## 3. Polar bears, remade (every vanilla polar bear)

* Adults are hostile to players (16 blocks), except to a player holding salmon (they come closer instead,
  unless that player hurt them). Health 40, attack 8, speed 0.28.
* **Charge-jump**: target 4-10 blocks away, on the ground, cooldown 100 ticks: crouch 10 ticks (growl), leap
  at the target (speed ~1.1, y 0.5), land with a slam: 6 damage + knockback in 2.5 blocks, snow puff.
* Swipe attack (stands up, both paws). Roars when it first spots you.
* **Calming**: right-click with raw or cooked salmon, or drop salmon near it: it eats (munch). 5 salmon within
  60 s calms it for 6000 ticks (5 min): no hostility, sits, hearts; feeding extends it.
* **Shearing**: shears on a calm bear: 2-3 `polar_bear_fur`, the bear is shorn (short-fur texture, fur parts
  hidden) for 6000 ticks, then grows back. Shearing an angry bear: it attacks, no fur.
* Death: 0-2 `polar_bear_fur` (+1 per looting level) on top of the vanilla drops.
* Some carry a salmon in their mouth (40% of adults spawn with one); calmed bears drop it as a gift.
* They spawn more (extra spawn entries in snowy plains, ice spikes, snowy taiga, snowy slopes, frozen peaks,
  frozen river, snowy beach).
* **Jockeys**: Frost Zombies and Strays that spawn naturally in the Ice Caves or snowy biomes have a 12%
  chance to spawn riding a polar bear.
* Models `polar_bear` and `polar_bear_cub` (cubs: their own fluffy model). Bones: `body`, `neck`, `head`, `jaw`,
  `ear_l`, `ear_r`, `front_leg_l`, `front_leg_r`, `back_leg_l`, `back_leg_r`, `tail`, `mouth_item` (an empty
  locator at the front of the mouth, where a carried salmon is drawn). Parts named `fur_*` are long fur, hidden
  when shorn. Parts named `zombie_*` (exposed ribs and spine, torn ear...) are only drawn on the zombie polar
  bear. Clips: `idle`, `walk`, `run`, `swim`, `leap` (1.2 s: crouch, airborne, slam), `swipe` (0.9 s),
  `roar` (1.6 s), `eat` (1.0 s), `sit` (loop), `shake` (0.8 s). Textures `polar_bear`, `polar_bear_sheared`,
  `zombie_polar_bear` (+ `zombie_polar_bear_glow`: eyes), `polar_bear_cub`.

## 4. Undead of the cold

* **Frost Zombie** (`frost_zombie`, extends Zombie): health 24, its hits add 160 frozen ticks and Slowness I
  (3 s); immune to freezing; doesn't burn in daylight. Vanilla zombie geometry with its own skin
  (`textures/entity/frost_zombie.png`, 64x64), an outer frost layer (`frost_zombie_outer.png`, 64x64, like the
  drowned's) and glowing eyes (`frost_zombie_eyes.png`).
* **Zombie Polar Bear** (`zombie_polar_bear`, Monster, undead): health 45, attack 9, speed 0.3, always hostile,
  charge-jump, spawns only in the Ice Caves (dark). Uses the `polar_bear` model with `zombie_*` parts.
* Strays (vanilla) spawn in the Ice Caves too.

## 5. The Ice Caves biome (`winterworks:ice_caves`)

* An underground biome under frozen regions (climate: temperature -1..-0.45, humidity -1..0.7, depth 0.2..0.9),
  added to the overworld through a mixin on `OverworldBiomeBuilder#addUndergroundBiomes`.
* Decorated by `winterworks:ice_cave_surface` (packed ice / blue ice / snow on cave walls, floors and ceilings,
  powder snow pools) and `winterworks:icicle_cluster` (hanging icicles). Ambient: drifting snow
  (`blizzard_flake`), cold mist, wind loop `ambient.ice_caves.loop`.
* Spawns: Frost Zombie 80, Stray 50, Zombie Polar Bear 12, Skeleton 20, Creeper 30.
* Structure `winterworks:frozen_tomb`, only in the Ice Caves (spacing 28, separation 10 chunks): a domed
  chamber with a huge block of ancient ice with ice spikes; the Frost Mauler is frozen inside.
  The chamber is built by `boss.FrozenTomb#build(WorldGenLevel level, BlockPos centre, RandomSource random)`.

## 6. Ancient Ice (`ancient_ice`) and icicles (`icicle`)

* Ancient ice: translucent, slippery (0.989), hardness 25, best tool axe (`#minecraft:mineable/axe`); a
  netherite axe takes ~4 s per block, hands take minutes. Touching it (standing on it, walking into it, punching
  it) gives Frostbite for 5 s. Breaking it makes it burst: Frostbite 10 s (amplifier 1) to everything within
  3.5 blocks, the breaker included, ice shards, `block.ancient_ice.burst`. Drops itself only with Silk Touch.
  Great for traps.
* Icicle: hangs from ceilings (property `tip`: true on the bottom block). Breaks into a falling icicle if its
  support goes. `falling_icicle` entity: falls, deals 6 damage to what it hits, shatters (`block.icicle.shatter`,
  ice shards).

## 7. The Frost Mauler (`frost_mauler`, the boss)

* A huge furry beast between a wolf and a giant bear: frozen body parts, ice spikes along its back, half its skull
  and one flank's ribs bare bone, two massive sabre fangs, glowing ice-blue eyes. Hitbox 2.4 x 2.6.
* Health 320, armour 10, attack 14, speed 0.3, knockback resistance 0.9, follow range 40, boss bar (blue,
  "Frost Mauler"), immune to freezing, takes 1.5x fire damage.
* **Dormant** in its tomb (no AI, invulnerable, no gravity, frozen pose). It counts the ancient ice within 6
  blocks when the tomb is built. When 6 of those blocks are broken: the cave shakes (camera shake for players
  within 32 blocks, `event.frozen_tomb.rumble`), the remaining tomb ice cracks for 3 s (vanilla crack overlay),
  then all of it explodes (ice shards, Frostbite burst), the Mauler drops to the ground, gets up (`wake`), and
  roars.
* Attacks: **Roar** (knockback in 8 blocks, Slowness II 3 s, breaks ice/packed ice/snow within 5 blocks, and
  4-8 icicles fall from the ceiling above nearby players); **Claws** (left/right swipes, 14 damage + knockback);
  **Fury** (charges and bounces at you, a flurry of 6 fang bites of 5 damage each, ignoring the invulnerability
  frames; a raised shield blocks each bite), then it is **stunned** for 5 s (takes 1.5x damage).
  Below 35% health it roars twice as often and moves faster.
* Death: explodes (no block damage, big knockback), drops `frost_mauler_skull`, 2 `mauler_fang`, 0-6 bones,
  and a 35% chance of 1-3 `ancient_ice`.
* Model `frost_mauler`. Bones (exact): `body`, `chest`, `hips`, `neck`, `head`, `jaw`, `fang_l`, `fang_r`,
  `eye_l`, `eye_r` (glow), `front_leg_l`, `front_leg_r`, `front_paw_l`, `front_paw_r`, `back_leg_l`,
  `back_leg_r`, `back_paw_l`, `back_paw_r`, `tail`, `tail_tip`. Clips: `idle`, `walk`, `run`, `roar` (2.0 s),
  `claw_l` (0.8 s), `claw_r` (0.8 s), `fury` (0.5 s loop: lunge, bite, bounce), `stunned` (1.5 s loop),
  `wake` (3.0 s: frozen pose, falls, rises, shakes off ice), `frozen` (a held pose: mid-roar), `death` (2.0 s).

## 8. The skull and the revival

* `frost_mauler_skull`: a block (4 facings) with a block-entity renderer, model `frost_mauler_skull` (bones
  `skull`, `jaw`, `fang_l`, `fang_r`, `eye` (glow, drawn only when lit)).
* Revival: encase the skull in ancient ice on all 6 sides, then use a Nether Star on the skull or any of that ice:
  the star is used up, the eye lights up, frost swirls and the ground shakes for 3 s, the ice and skull
  explode and the Frost Mauler wakes (`wake`, then `roar`). Sound `block.frost_mauler_skull.ignite` then
  `.revive`.

## 9. Fang Daggers (`fang_dagger`, made from a `mauler_fang`, a `polar_bear_fur` and a stick)

* Recipe (vertical): fang / fur / stick, makes one dagger. The boss drops two fangs: two daggers.
* One dagger: a fast knife (5 damage, 2.0 attacks/s), normal crits.
* **Dual wield** (one in each hand): **frenzy**: each attack is a quick hit (3 damage + enchantments) that
  alternates hands and ignores invulnerability frames; the first hits come every 2 ticks, every hit adds fatigue
  (+0.12), and the gap grows to 10 ticks as fatigue reaches 1. Fatigue drains (0.01/tick) after 1 s without
  attacking. Exhausted (fatigue 1): the daggers swing like one slow dagger (vanilla attack); a jumping (falling)
  hit is then a **Fang Crit**: 2x damage, Frostbite 3 s, ice crit burst.
* **Pounce**: dual wield, sneak + jump on the ground: leap forward (1.3 horizontal, 0.42 up), hitting everything
  you pass for up to 5 rapid hits (3 damage each). Costs 0.35 fatigue, 40-tick cooldown.
* VFX: `frost_slash` on every hit, `ice_crit` on crits, a snowflake trail while pouncing, frost breath.
* Model `fang_dagger` (item, bone `dagger`): a huge curved fang as the blade (ivory, frost-blue edge),
  a guard of ice crystals, a polar-fur grip, a bone pommel. 2D icon `item/fang_dagger`.

## 10. Particles (2D pixel art, `assets/winterworks/textures/particle/`)

`frost_breath` (vapour puff), `ice_shard` (debris with gravity), `frost_burst` (expanding frost ring),
`roar_wave` (shockwave ring), `frost_slash` (icy slash arc), `ice_crit` (icy crit sparkle), `fur_tuft`
(floating fur), `blizzard_flake` (wind-blown snow), `snow_puff` (landing/slam puff), `cold_mist` (low mist).

## 11. Items and blocks (ids)

Items: `polar_bear_fur`, `fur_hood`, `fur_coat`, `fur_leggings`, `fur_boots`, `mauler_fang`, `fang_dagger`,
`frost_mauler_spawn_egg`, `frost_zombie_spawn_egg`, `zombie_polar_bear_spawn_egg`.
Blocks (with items): `ancient_ice`, `icicle`, `frost_mauler_skull`.
Entities: `frost_mauler`, `frost_zombie`, `zombie_polar_bear`, `falling_icicle`.
Effect: `frostbite`. Damage types: `overheat`, `falling_icicle`.
