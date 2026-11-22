# Winterworks: the Amber Age update (design contract)

Archaeology, amber, mosquitoes, blood, sniffers and the Pot Golem. Same rules as docs/COLD_UPDATE.md: ids,
bone and clip names here are exact; change them here first. Java packages: `amber/` (amber, mosquito, blood,
amberwood, sniffers), `golem/` (Pot Golem), `world/` (Dead Caves, deposits, Dig Site).

## 1. Suspicious deposits everywhere
* `winterworks:cave_deposits` (all overworld biomes, underground decoration): ~18 tries per chunk on cave floors
  below y=50: sand floors become suspicious sand, other floors suspicious gravel. Loot tables
  `winterworks:archaeology/cave_amber` (amber chunks, amber blocks, Amberwood seeds, torchflower/pitcher seeds,
  sherds) and `winterworks:archaeology/cave_bones` (bones, bone blocks, skulls, sherds, an amber chunk).
* The Dead Caves and Dig Sites use `winterworks:archaeology/dead_cave` and `winterworks:archaeology/dig_site`.

## 2. The Dead Caves biome (`winterworks:dead_caves`)
* Underground under hot, dry land (temperature 0.2..1, humidity -1..-0.1, depth 0.2..0.9), added like the Ice
  Caves. A fossil desert that was a prehistoric forest: sand, gravel and coarse-dirt floors with dead bushes,
  sandstone walls, petrified logs (fallen trunks and stumps), big boulders, amber blocks in the walls, amber
  fossils, lots of suspicious sand and gravel. Feature `winterworks:dead_cave_surface`. Dusty fog, `ash`-like
  drifting dust particles. Spawns: husks, skeletons, spiders, mosquitoes (from amber).

## 3. Dig Sites (`winterworks:dig_site`)
* An abandoned excavation: a dug pit with scaffolding towers, plank walkways and ladders, ruined wooden shacks,
  a canvas tent, lanterns, rails, 2-4 chests (`winterworks:chests/dig_site`: amber, brushes, sherds, bones,
  gravel, Amberwood seeds, maps-like paper, torches, food), suspicious sand and gravel, amber blocks, amber
  fossils, bones. Not rare: in Dead Caves and wherever mineshafts can be (spacing 24, separation 8), y -20..30.
  Built by `world.DigSite#build(WorldGenLevel, BlockPos, RandomSource)`.

## 4. Amber and fossils
* `amber_block`: translucent orange; property `inclusion` = none | seed | mosquito (you can see what's inside).
  Breaking a natural one with an inclusion releases it: a seed drop (Amberwood seed, torchflower seeds or pitcher
  pod) or a live mosquito. Drops itself (inclusion none). Crafted from 4 `amber_chunk`.
* `amber_fossil`: a brushable block like suspicious gravel (`dusted` 0..3) holding a petrified Amberwood seed;
  brushing gives an `amberwood_seed`. Sniffers can dig Amberwood seeds too.
* `petrified_log` (axis): stone-hard fossil wood, decoration of the Dead Caves.

## 5. Amberwood
* `amberwood_seed` plants `amberwood_sapling`; grows a short tree (3-5 log trunk, a squat crown) of
  `amberwood_log` (axis, `resin` true/false) and `amberwood_leaves` (glowing amber-gold leaves).
  `amberwood_planks` from logs. Logs randomly ooze resin (`resin=true`, dripping amber texture).
* Mosquitoes drink resin from resin logs (the log goes back to `resin=false`) and become amber-full.

## 6. The mosquito (`mosquito`)
* Small (0.5 x 0.4), flying, hostile, very cool: 4 wings (two pairs), a long giant needle, striped abdomen,
  long legs. States (synced): `empty`, `blood` (abdomen swollen dark red, glows faintly), `amber` (abdomen
  swollen gold). Health 6. Hunts any living mob except `#minecraft:undead` and `#winterworks:bloodless`
  (golems, slimes, magma cubes, blazes, breezes, endermen, endermites, shulkers, vexes, allays, armour stands,
  snow golems, Pot Golems): stabs (2 damage) and drinks -> `blood`, then is calm and slow for 2 minutes.
* Use a glass bottle on a `blood` mosquito: a Potion of Blood, the mosquito becomes `empty`.
* An `amber` mosquito fed blood (use a Potion of Blood on it, or it lands on a blood stain, or a splash/lingering
  Potion of Blood hits nearby) spits out an `amber_chunk` and becomes `empty`: an amber farm.
* Attracted to pitcher plants, pitcher crops and players holding pitcher pods (tempt); they hang around pitcher
  plants and pollinate pitcher crops (grow them a stage, like bees).
* Bones: `body`, `head`, `needle`, `abdomen`, `wing_l1`, `wing_r1`, `wing_l2`, `wing_r2`, `leg_*` (6).
  Clips: `fly` (loop, fast wing buzz), `idle` (hover loop), `stab` (0.6 s), `drink` (loop), `spit` (0.6 s).
  Textures `mosquito`, `mosquito_blood`, `mosquito_amber` (same layout).

## 7. Blood
* Potion `winterworks:blood` (no effect, dark red): from mosquitoes; splash/lingering via vanilla brewing.
  Splash/lingering blood leaves `blood_stain` (a thin layer that fades after ~2 minutes) and makes every amber
  mosquito within 8 blocks spit its amber. Mosquitoes that touch a stain do too.
* Brewing: Potion of Blood + torchflower -> Potion of Immunity (0:30); + redstone -> 1:00.
* Effect `winterworks:immunity`: while active you can't gain any other effect.

## 8. Sniffers
* Tame with pitcher pods (each pod 1 in 3, hearts). Tamed sniffers follow you, and every ~30 s sniff for
  suspicious sand/gravel and amber fossils within 16 blocks: walk there, dig (vanilla digging animation and
  sounds) and excavate it (its brushing loot pops out, the block turns to sand/gravel).
* Sniffer digging loot gains Amberwood seeds, amber chunks, bones and sherds.

## 9. The Pot Golem (`pot_golem`)
* Build: amber blocks in an iron-golem T (4 blocks) and a decorated pot on top. A giant muscular amber humanoid,
  a bit jelly-like (wobbles), with the pot as its head (the real pot, with its sherds, drawn on the `head` bone).
  Follows its builder, fights hostile mobs. Health 80.
* Head forms (from the pot): an Echo Shard inside the pot -> Echo Head (a sonic beam like the Warden's, 8 s
  cooldown); the Howl sherd -> Howl Head (howls: wolves within 16 get Strength II, Speed II, Resistance I,
  Regeneration I for 20 s); the Danger sherd -> Danger Head (below 20% health it hisses and explodes, mob
  damage only); any other pot -> plain.
* Body shards (use a sherd on it): Blade sherd -> a blade arm (12 damage melee sweeps); Miner sherd -> a pickaxe
  arm, mines ores and stone around its owner; Archer sherd -> a bow arm (shoots arrows). One at a time.
* Weakness: the pot. Hits crack it (`cracks` 0..3, 1 in 3 hits); at 3 it shatters (sherds drop), the golem
  loses its head ability and is dazed. Repair a crack by using any sherd or a brick on it.
* Brush it: it giggles, then sneezes the pot off (the pot drops intact), showing its dumb face: two tiny dot eyes,
  one bigger. Use a decorated pot on it to give it a new head.
* Dies -> its sherds and 2-4 amber chunks.
* Bones: `body`, `chest`, `head` (the pot seat), `face` (the dumb face, shown when potless), `arm_l`, `arm_r`,
  `blade` (child of arm_r), `pickaxe` (arm_r), `bow` (arm_l), `leg_l`, `leg_r`, `jelly_*` (wobbly bits).
  Clips: `idle`, `walk`, `attack` (0.6 s), `slash` (0.7 s), `mine` (0.8 s), `shoot` (0.8 s), `howl` (1.5 s),
  `beam` (1.2 s), `giggle` (1.0 s), `sneeze` (1.0 s), `dazed` (loop), `fuse` (1.5 s).

## 10. Ids
Blocks: `amber_block`, `amber_fossil`, `petrified_log`, `amberwood_log`, `amberwood_leaves`, `amberwood_sapling`,
`amberwood_planks`, `blood_stain`. Items: `amber_chunk`, `amberwood_seed` (plants the sapling),
`mosquito_spawn_egg`, `pot_golem_spawn_egg`. Entities: `mosquito`, `pot_golem`. Effect: `immunity`. Potions:
`blood`, `immunity`, `long_immunity`. Biome: `dead_caves`. Structure: `dig_site`.
