# Winterworks: The Living End (design contract)

The End becomes a living alien ecosystem. Same rules as COLD_UPDATE.md / HEXES_UPDATE.md: ids, bone and clip names
here are exact, every registration already exists in `registry/End*.java`, and no feature beyond this file.

**Eyes.** Every eye motif (the Monolith, the shield, the wand, the Monolith Eye, chiseled obsidian, wing eye-spots) is
**round**: round irises and pupils, soft highlights, no slit pupils or sharp diamond shapes. (The Obolisk was later
remade in the vanilla mob style: see section 9.)

**Resolution.** Everything new is higher resolution than the older content: entity and item models are lowpix specs at
`density: 2` (2 texels per Minecraft pixel; held items may use 4), with more parts, cards and painted detail; block
textures and item icons are **32 x 32**; particles 16 x 16; the eclipse sky textures 256 x 256.

Java packages and owners (one agent each; other agents only call the public API named here):
* `end/` **world**: biomes, terrain features, structures, the new blocks' behaviour, End City loot.
* `endmob/` **mobs**: Enderfly, Endling, Gucker, Obolisk, Chorus Cocoon, End Bloom, End Bulb, `end_glow`, Recall potion.
* `endgear/` **gear**: End Glider, Obsidian Shield, Monolith Wand, petrification (`end/Petrify` API), Dragon Egg cracking, Dragonling.
* `endboss/` **bosses**: the eclipse (`end/Eclipse` API, sky, lighting), the Ender Dragon rework, the Monolith.

## 1. Biomes and terrain
Two new End biomes, added with Fabric's `TheEndBiomes` as highlands (their midlands and barrens are themselves):
`chorus_meadows` (weight 8) and `dead_end` (weight 6). Both keep the End's sky and void.
* **Chorus Meadows**: purple **End Grass** over end stone, `end_grass` and `tall_end_grass`, **End Blooms**,
  **End Moss** patches, thick **chorus trees** (`chorus_stem` trunks and branches, chorus flowers and hanging
  **Chorus Cocoons**), vanilla chorus plants (also with cocoons). Ambient: drifting violet spores.
* **The Dead End**: a grey moon-like desert: **End Sand** over end stone, rock piles, giant end-stone pillars capped with
  obsidian, jagged obsidian formations, `dry_end_bush`, **Suspicious End Sand**, and very rare **meteorites** (a
  half-buried cluster of `meteorite` round a `meteorite_core`, in a shallow crater). Ambient: fine grey dust.
* In both: **floating islands** at different heights (y 70-150, radius 4-14, their own surface and vegetation) with big
  `chorus_roots` hanging under them, small **floating rocks**, terraced **cliffs** and overhangs at island edges, and
  **alien formations** (arches, rings and twisted spires of end stone, purpur and obsidian).
* Spawns. Chorus Meadows: endling (creature 10, 2-4), enderfly (monster 8, 1-3), gucker (monster 4, 1), enderman
  (monster 10, 1-4). Dead End: gucker (monster 6, 1-2), obolisk (monster 2, 1; spawns disguised), enderfly
  (monster 2, 1-2), enderman (monster 10, 1-4).

## 2. Blocks
| id | what |
|---|---|
| `end_grass_block` | purple grass on end stone; spreads to end stone next to it, turns back to end stone under a full block; bone meal grows `end_grass`, `tall_end_grass` and (rarely) `end_bloom` round it |
| `end_grass`, `tall_end_grass` | plants (shears to collect); `end_grass` -> 1 purple dye, `tall_end_grass` -> 2 |
| `end_moss_block`, `end_moss_carpet` | alien moss; bone meal spreads it over end stone like moss |
| `end_bloom` | an End flower; states `open` (bool), `bulb` (bool). Opens only during an eclipse. Shearing an open bloom with a bulb gives an `end_bulb` and clears `bulb`; the bulb regrows (random tick) when no eclipse is on |
| `chorus_stem` | thick chorus-tree trunk (pillar, axis) |
| `chorus_roots` | big hanging roots under floating islands (pillar, axis) |
| `chorus_cocoon` | hangs under chorus stems and chorus plants; `age` 0-3 (random ticks). Broken before maturity: an angry Endermite jumps out at the breaker. Mature (3): hatches into an Enderfly by itself or when broken. Drops 1-2 chorus fruit; silk touch drops the cocoon |
| `chorus_fruit_block` | 9 chorus fruit <-> 1 block, decorative |
| `end_sand` | falling block (grey) |
| `suspicious_end_sand` | brushable (vanilla BrushableBlockEntity), turns into end sand; loot `winterworks:archaeology/dead_end` and `.../obsidian_ruins` |
| `dry_end_bush` | breaks instantly, drops 0-2 sticks; on end sand / end stone |
| `meteorite` | hardness 80, resistance 1200, diamond pickaxe, light 15, drops itself. Furnace fuel for 48000 ticks (240 items) |
| `meteorite_core` | the heart of a meteorite: hardness 100, diamond pickaxe, light 15, drops itself (a wand ingredient) |
| `polished_meteorite`, `meteorite_bricks` (+ `_stairs`, `_slab`, `_wall` for the bricks) | decorative, light 12, hardness 30 |
| obsidian set: `polished_obsidian`, `obsidian_bricks`, `cracked_obsidian_bricks`, `obsidian_tiles`, `cracked_obsidian_tiles`, `chiseled_obsidian`, and `_stairs` / `_slab` / `_wall` for polished, bricks (`obsidian_brick_*`) and tiles (`obsidian_tile_*`) | like the deepslate set; obsidian's hardness and blast resistance; crafting 2x2 chains obsidian -> polished -> bricks -> tiles, chiseled from 2 brick slabs, cracked by smelting, all in the stonecutter |

## 3. Structures (loot tables `winterworks:chests/<id>`)
* `obsidian_ruins` (Dead End; spacing 28, separation 10): broken obsidian-brick shrines and arches half buried in end
  sand, crying obsidian, a chest, suspicious end sand, 1-2 disguised Obolisks nearby.
* `end_shrine` (Chorus Meadows; spacing 32, separation 12): an end-stone-brick and purpur ring temple overgrown with
  end moss and blooms, a chest on an altar, guarded by 2-3 disguised Obolisks.
* `monolith_tower` (Dead End; spacing 48, separation 20): a 60+ block obsidian-brick tower, spiral stairs inside,
  floors with chests and disguised Obolisks, and on top an open arena (radius 12) with obsidian pillars for cover, where
  the Monolith floats. A treasure chest (`chests/monolith_tower_treasure`) under the arena.
* The `void_rod` (the wand's rod) is found in `obsidian_ruins` (25%), `monolith_tower` (50%) and End City (5%) chests.
  End City chests also gain obsidian shards and meteorites.

## 4. Enderflies (`enderfly`)
Moth-like evolutions of Endermites, 0.7 x 0.6, flying, 10 health. Born from mature Chorus Cocoons; also spawn.
* They teleport about at random, dodge projectiles (75%: teleport away, no damage), and **dive** into players: on
  contact the player is teleported up to 12 blocks (chorus-fruit style, safe ground) and takes 1 damage, then the
  Enderfly flutters off (10 s cooldown).
* During an eclipse they swarm round open End Blooms (24 blocks). They secretly prefer players with `end_glow` (32
  blocks).
* Drop `enderfly_wing` 25% (+5% per Looting level). Awkward potion + wing -> **Potion of Recall** (`recall`,
  instant): teleports you to your spawn point (bed/anchor, else world spawn; across dimensions).
* Bones: `body`, `thorax`, `abdomen`, `head`, `antenna_l`, `antenna_r`, `wing_fl`, `wing_fr`, `wing_bl`, `wing_br`,
  `legs`. Clips: `fly` (loop), `hover` (loop), `dive` (0.6 s), `teleport` (0.3 s). Glow: eyes and wing eye-spots.

## 5. The eclipse (`end/Eclipse`)
* End only. At the start of every 24000-tick day there is a 1-in-8 chance of an eclipse lasting 6000 ticks, with
  600-tick fades. The Ender Dragon's second phase starts one (see 10). `/winterworks eclipse start [seconds]|stop`.
* A massive moon rises in the End sky: a dark disc with a blazing violet-gold corona, the sky shading from deep violet
  to magenta, the End lit brighter with a violet-gold tint and matching fog. A soft ambient chime.
* End Blooms open; Enderflies swarm them.
* API: `Eclipse.isActive(Level)`, `Eclipse.fraction(Level)` (0..1 with fades; client and server),
  `Eclipse.start(ServerLevel, int ticks)`, `Eclipse.stop(ServerLevel)`.

## 6. End Bulbs and `end_glow`
`end_bulb`: food (2 hunger, always edible). Eating it gives `end_glow` for 8 minutes: you glow softly (drawn at full
brightness with faint violet motes). Its tooltip only mentions the glow; secretly, Enderflies are drawn to you.

## 7. Guckers (`gucker`)
Big salamander-like predators, 1.6 x 0.9, 40 health, with breathing holes along the back.
* Idle, they **burrow** into end stone, end sand or end grass: only the back shows, the holes puffing dust. Prey within
  7 blocks (Endermen, Endlings, players) makes them burst out and lunge (bite 8).
* At 6-14 blocks they **inflate** (1.2 s) and **spit** a ball of blinding dust (`gucker_spit`): a dust cloud that
  gives Blindness 4 s.
* Drop `gucker_meat` 1-3 (cooked if burning; cook it to `cooked_gucker_meat`: 3 / 8 hunger) and `gucker_gland` 0-1
  (+Looting).
* Bones: `body`, `head`, `jaw`, `throat` (the sac, scaled when inflating), `vents` (the breathing holes), `tail_0`,
  `tail_1`, `tail_2`, `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`. Clips: `idle`, `walk`, `run`, `burrowed` (loop),
  `emerge` (0.8 s), `bite` (0.5 s), `inflate` (1.2 s), `spit` (0.5 s). Glow: eyes, a faint glow in the vents.

## 8. Endlings (`endling`)
Tiny, cute Enderman-like creatures, 0.5 x 0.9, 8 health: two long legs, no arms, a big head, violet eyes.
* Wild ones flee players (unless the player sneaks holding chorus fruit), teleport short hops when hurt, and are
  hunted by Guckers. A quarter of the wild ones have a flower (an End Bloom or End grass) growing on the head.
* Tame with chorus fruit (1 in 3). Tamed: follow, sit (sneak + use). Use a plant (tag
  `winterworks:endling_head_plants`: flowers, saplings, mushrooms, ferns, grass, End plants) on one to put it on its
  head (shears take it off).
* **Void rescue**: if you fall into the void (below the world's floor - 10) and a tamed Endling of yours is loaded within
  128 blocks in that dimension, it sacrifices itself: you are teleported to it with Slow Falling, and it vanishes in a
  burst of light.
* Bones: `body`, `head`, `jaw`, `leg_l`, `leg_r`, `head_plant` (locator: the plant renders here). Clips: `idle`,
  `walk`, `run`, `hop` (0.5 s, happy), `sit` (loop), `teleport` (0.4 s), `sacrifice` (1.2 s). Glow: eyes.

## 9. Obolisks (`obolisk`) and the Obsidian Shield
Living blocks of obsidian: each is one tall 2 x 4 block pillar (hitbox 2.0 x 4.0, eye height 2.8), 100 health,
armour 15. Remade in the vanilla Minecraft mob style (density 1, block-resolution obsidian and crying-obsidian
texture) with a grumpy carved face: a heavy slanted brow over two small flat glowing slit eyes, crying-obsidian tears
and a frowning crack of a mouth. No visible legs: it walks by rocking from edge to edge and slams by toppling forward.
* They **disguise** themselves as obsidian rock (leaning, brow shut over the eyes, motionless) and **rise** (2 s) when a survival
  player comes within 6 blocks or they are hit. After 30 s without a target they settle back down.
* **Slam**: rears up and slams (range 3.5): 14 damage, heavy knockback, and breaks blocks in radius 2 round the impact
  (hardness < 50, not in `winterworks:obolisk_unbreakable`; obeys mobGriefing).
* Only pickaxes hurt them properly: a melee hit with a pickaxe does full damage, everything else 15%.
* Drop `obsidian_shard` 2-4 (+Looting).
* API: `Obolisk.spawnDisguised(ServerLevel, BlockPos)`, `Obolisk.spawnAwake(ServerLevel, BlockPos, LivingEntity target)`.
* Bones: `body`, `eye` (both slits, one card), `eyelid` (the brow), `leg_fl`, `leg_fr`, `leg_bl`, `leg_br` (empty
  pivots). Clips: `disguised` (loop), `rise` (2.0 s), `idle`, `walk`, `slam` (1.2 s), `settle` (1.5 s). Glow: eyes,
  crying obsidian, the light in the mouth.
* **Obsidian Shield** (`obsidian_shield`; 6 shards + 1 iron ingot, shield shape; 1008 durability): a shield that
  reflects 50% of blocked damage back at the attacker, and when you start blocking while sneaking, releases a knockback
  shockwave (radius 4.5, 4 damage, no block damage; 5 s cooldown). 3D model everywhere, the GUI included. Bones:
  `shield`, `handle`, `eye`.

## 10. The Ender Dragon, harder
* **Dives**: every 10-16 s it dives at a player (a faster charge).
* **Grab and throw**: a dive that reaches a player grabs them (8 damage), carries them in its jaws for 2.5 s (hitting
  the head frees you), then hurls them away from the island.
* **Second phase at half health** (once):
  * it starts an eclipse that lasts until it dies;
  * it grows a second pair of wings;
  * it fires **blinding light beams** (`dragon_light_beam`): a 1.5 s warning line, then a 1 s beam, 10 damage every
    half second and Blindness 6 s;
  * it **regenerates End Crystals** (one every 40 s, up to 4);
  * the **obsidian towers grow** 10 blocks taller over 10 s, carrying their crystals up;
  * it **summons Obolisks** (2 at once, then 1 every 60 s, at most 4 alive).

## 11. The Monolith (`monolith`) and the Monolith Wand
A giant obsidian boss (3 x 7, hovering) with three glowing eyes and two giant floating hands, on top of the Monolith
Tower. 600 health, armour 20, immune to knockback and fire, a purple boss bar.
* **Stare**: while it sees you (32 blocks) its eyes lock on: Slowness builds over 3 s, and after 4 s of unbroken stare
  you are **petrified** in obsidian for 3 s (vulnerable: its hands can crush you). Break line of sight to escape.
* **Hand slam** (a 1 s shadow telegraph, radius 3, 14 damage, knockback), **grab** (lifts and crushes a player, 4
  damage a second for 2 s, then hurls them), **clap** (a shockwave ring along the floor, jump it; 10 damage).
* **Summons** 2 Obolisks at 66% and 33% health and every 45 s (at most 4).
* Phases: 100-66% stare and slams; 66-33% plus grabs and summons, faster; below 33% plus claps, both hands, fastest.
  Only the body takes damage; projectiles do half.
* Drops 3 `monolith_eye`, a `meteorite_core`, and `winterworks:entities/monolith` loot; 500 XP.
* Bones: `body`, `eye_0`, `eye_1`, `eye_2`, `hand_l`, `hand_r` (each with `thumb_*` and `finger_*_0..3`), `shards`
  (a floating ring of debris). Clips: `idle`, `stare`, `slam_l`, `slam_r` (1.2 s), `grab` (1.0 s), `clap` (1.2 s),
  `summon` (2.0 s), `death` (3.0 s). Glow: eyes, runes.
* **Monolith Wand** (`monolith_wand`; recipe ` E ` / `OCO` / ` R ` with E monolith_eye, O obsidian, C meteorite_core,
  R void_rod; 128 durability, 3 s cooldown): use it on a mob within 24 blocks to petrify it for 10 s. Petrified mobs
  can't move, act or be damaged. Bosses are immune (`winterworks:petrify_immune`). Bones: `rod`, `head`, `eye`.
* Petrification (`end/Petrify`, effect `petrified`): the entity is encased in an obsidian shell (rendered round its
  bounding box) that shatters when it ends. Amplifier 0 = invulnerable (the wand), 1 = vulnerable (the Monolith).
  API: `Petrify.freeze(LivingEntity, int ticks, boolean invulnerable)`, `Petrify.isFrozen(Entity)`.

## 12. The End Glider
`end_glider`: recipe `WSW` / `GMG` / `PSP` (W enderfly_wing, S shulker_shell, G gucker_gland, M meteorite,
P phantom_membrane); 432 durability (1 per second of flight), repaired with phantom membrane.
* A **glowing magic wing glider**: a light handle under a pair of luminous, translucent violet wings (enderfly-like
  membranes with glowing veins and soft round eye-spots) that shimmer and beat gently. No machinery.
* **Alone**: hold it while falling and hold use to **glide** like a hang glider: about 0.6 blocks/tick forward, sinking
  slowly (0.08 blocks/tick), steered by where you look; no climbing; no fall damage while gliding.
* **With an Elytra** (gliding with it in hand): **free flight**: it flies where you look at a cruising speed (1.1
  blocks/tick), climbing included, no fireworks; hold use to **boost** (2.2 blocks/tick) with heavier steering.
* Held overhead in both hands while gliding or flying. Bones: `frame`, `handle`, `wing_l`, `wing_r`, and `jet_l`,
  `jet_r`, `jet_flame_l`, `jet_flame_r` (now glowing rune sigils at the wing roots that flare when boosting). Clips:
  `flap` (loop), `boost` (loop). Glow: wing veins, eye-spots, sigils.

## 13. Dragonlings
* **Hatching**: throw the Dragon Egg into the void in the End. It comes back (falling onto whoever threw it, else onto
  the exit portal) with a crack: `winterworks:egg_cracks` 1, then 2; the third time it hatches into a baby Dragonling.
  Cracked eggs have their own item textures.
* **Dragonling** (`dragonling`): baby 0.8 x 0.7 (20 health), teen 2.2 x 1.6 (60 health). Feed chorus fruit to tame
  (1 in 3). Tamed babies follow you and hunt Endermites and small mobs (silverfish, chickens, rabbits, bats, enderflies);
  every meal grows them (Endermite 4, others 2); at 40 they become **teens**.
* Teens: sit / follow, fly after you, **rideable** with a saddle (fly where you look; jump climbs), and wear iron,
  golden or diamond horse armour. **Fire breath** (rider key, default R): a cone of dragon fire (8 blocks, 6 damage,
  fire). It needs Dragon's Breath: a bottle gives 6 breaths (max 24).
* Models `dragonling_baby` and `dragonling_teen`; armour textures `dragonling_teen_armor_{iron,gold,diamond}`.
  Bones: `body`, `neck`, `head`, `jaw`, `wing_l`, `wing_r`, `wing_l_tip`, `wing_r_tip`, `tail_0`..`tail_3`, `leg_fl`,
  `leg_fr`, `leg_bl`, `leg_br`, and on the teen `saddle`. Clips: `idle`, `walk`, `fly`, `glide`, `eat` (0.8 s),
  `breath` (1.0 s), `sit`; baby also `hatch` (1.5 s).

## 14. Ids
Blocks: section 2. Items (besides block items): `end_bulb`, `enderfly_wing`, `gucker_meat`, `cooked_gucker_meat`,
`gucker_gland`, `obsidian_shard`, `obsidian_shield`, `end_glider`, `monolith_eye`, `void_rod`, `monolith_wand`, spawn
eggs `enderfly_`, `endling_`, `gucker_`, `obolisk_`, `dragonling_`, `monolith_spawn_egg`. Entities: `enderfly`,
`endling`, `gucker`, `gucker_spit`, `obolisk`, `monolith`, `dragonling`, `dragon_light_beam`. Effects: `end_glow`,
`petrified`, `recall` (instant). Potion: `recall`. Component: `egg_cracks`. Biomes: `chorus_meadows`, `dead_end`.
Structures: `obsidian_ruins`, `end_shrine`, `monolith_tower`. Particles: `end_spore`, `end_dust`, `eclipse_mote`,
`blinding_dust`, `gucker_breath`, `enderfly_scale`, `obsidian_crack`, `meteor_spark`. Key: `key.winterworks.dragon_breath`.

## 15. Art files (exact paths under `assets/winterworks/textures/`)
* Blocks (32 x 32): `block/end_grass_block_top`, `block/end_grass_block_side`, `block/end_grass`,
  `block/tall_end_grass_top`, `block/tall_end_grass_bottom`, `block/end_moss_block`, `block/end_bloom_closed`,
  `block/end_bloom_open`, `block/end_bloom_open_bare` (no bulb), `block/end_bloom_glow` (emissive overlay of the open
  bloom), `block/chorus_stem`, `block/chorus_stem_top`, `block/chorus_roots`, `block/chorus_roots_top`,
  `block/chorus_fruit_block`, `block/chorus_fruit_block_top`, `block/end_sand`, `block/suspicious_end_sand_0..3`,
  `block/dry_end_bush`, `block/meteorite`, `block/meteorite_core`, `block/polished_meteorite`, `block/meteorite_bricks`,
  `block/polished_obsidian`, `block/obsidian_bricks`, `block/cracked_obsidian_bricks`, `block/obsidian_tiles`,
  `block/cracked_obsidian_tiles`, `block/chiseled_obsidian`, `block/chiseled_obsidian_top`. The Chorus Cocoon is a 3D
  block model (`chorus_cocoon` ages 0-3) from the 3D art.
* Items (32 x 32): `item/end_bulb`, `item/enderfly_wing`, `item/gucker_meat`, `item/cooked_gucker_meat`,
  `item/gucker_gland`, `item/obsidian_shard`, `item/monolith_eye`, `item/void_rod`, `item/dragon_egg_cracked_1`,
  `item/dragon_egg_cracked_2`, `item/end_bloom` (the flower's inventory icon). The shield, glider and wand are 3D
  models everywhere (GUI included), with 32 x 32 2D icons `item/obsidian_shield_icon`, `item/end_glider_icon`,
  `item/monolith_wand_icon` for first person if a renderer wants them.
* Particles (16 x 16, frames `_0.._n`): `particle/end_spore`, `end_dust`, `eclipse_mote`, `blinding_dust`,
  `gucker_breath`, `enderfly_scale`, `obsidian_crack`, `meteor_spark`.
* Sky (256 x 256): `environment/eclipse_moon` (the dark disc with its lit rim), `environment/eclipse_corona` (the glow
  round it, additive).
* Effects: `entity/dragon_light_beam` (a vertical strip for the beam), `entity/obsidian_shell` (32 x 32 tileable
  obsidian crust with crying-obsidian cracks, for petrified entities), `mob_effect/end_glow`, `mob_effect/petrified`,
  `mob_effect/recall` (18 x 18 effect icons).
* Entity models (lowpix specs in `examples/src/`, exported with `python -m lowpix mc export` to
  `client/lowpix/<Name>Model.java` and `entity/<name>.png` + `_glow` / `_tint`): `enderfly`, `endling`, `gucker`,
  `obolisk`, `dragonling_baby`, `dragonling_teen` (+ `dragonling_teen_armor_iron|gold|diamond` texture variants),
  `monolith`, `end_glider`, `obsidian_shield`, `monolith_wand`, `chorus_cocoon`.

## 16. Additions after review
* **The Monolith Wand, cooler and more meteorite**: a remade 3D model: the round Monolith eye held in a crown of jagged,
  glowing meteorite shards with molten seams and orbiting meteorite embers, a meteorite-banded void-rod shaft and a
  meteorite-core pommel; a stronger beam with meteor sparks and a hot impact flash.
* **Falling meteorites**: now and then a meteor streaks down through the End sky (a flaming rock with a long glowing
  trail and smoke, a rising whistle) and crashes into the outer islands, about 30-90 blocks from a player: a bright
  impact flash, a shockwave that knocks back and burns what is near (no damage to the main island or structures), and
  a fresh smoking crater of `meteorite` blocks round a glowing core (a `meteorite_core` one time in three). About one
  every 10-15 minutes per player in the outer End, three times as often in the Dead End and during an eclipse.
  `/winterworks meteor` drops one ahead of you. Entity `falling_meteorite`.
