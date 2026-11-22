# Winterworks: Tides & Treasures (design contract)

A full ocean overhaul that feels like a real vanilla update. Same rules as the other contracts: ids, bone and clip
names here are exact, every registration exists up front in `registry/Ocean*.java`, nothing beyond this file. New art
follows the newer standard (lowpix models at `density: 2`, 32 x 32 block/item textures for new blocks, vanilla-style
16 x 16 where a texture must sit beside vanilla's own, e.g. sand-like blocks; every block texture tiles evenly with no
standout spot). **In progress**: until it ships, its creative tab is hidden unless the game runs with `-Dwinterworks.ocean=true`
(set it in dev runs and screenshot harnesses). **Efficient**: worldgen work stays inside its chunk; per-tick work only near players; caches for
anything rendered every frame.

Packages and owners (one agent each; others call only the public APIs named here):
* `ocean/` **world**: terrain, biomes, vents, tube worms, ash sand and the building set, reefs, structures, monuments.
* `oceanmob/` **creatures**: anglerfish, lionfish, nautilus, turtles, the Angler Light, night-vision brewing.
* `oceangear/` **gear and the boss**: Turtle Shell armour, darts, the Elder Guardian boss, Eye of the Ocean, trust.
* `whale/` **the whale**: the whale, its deck, belly dimension, barnacles, irritation, lure, song, Nautilus Horn, cannons.

## 1. Depth and terrain
* Oceans get far deeper and more varied, shaped by noise in the ocean biomes after the vanilla terrain is laid down
  (a per-chunk carving feature, no change to vanilla's noise router): continental-shelf **cliffs** dropping from the
  normal sea floor; deep ocean floors at y -10..-30; **trenches** to y -55; rolling **seafloor elevations**, ridges and
  basins; **rock formations** (stone and tuff pillars, arches, overhangs). Water fills everything carved; aquifers and
  lava never leak in; the edges blend into vanilla floors.
* Two new ocean biomes (deep-ocean climate slots, via the OverworldBiomeBuilder like the cave biomes):
  * `volcanic_depths` (warm and lukewarm deep oceans): **basalt seafloors**, **magma fields**, **Ash Sand**,
    **hydrothermal vents** with tube worms and ore deposits round them.
  * `abyssal_trench` (cold and normal deep oceans, the deepest): the great trenches and cliffs, near-total darkness,
    whale skeletons, female anglerfish.
* **What lives where** (spawn rules by depth): shallows (y > 45) turtles, lionfish (warm reefs), coral, sponges; mid
  water (y 20-45) nautiluses (deep oceans only), guardians, shipwrecks; deep (y < 20) anglerfish (males and small
  ones), deep shipwrecks, sunken treasure, whale skeletons; the abyss (y < -10) female anglerfish, vents. Whales
  roam deep oceans and surface to breathe.

## 2. Blocks
| id | what |
|---|---|
| `hydrothermal_vent` | a chimney of basalt and mineral crust; plumes hot black-smoker water (particles); water within 4 blocks is **poisonous** (Poison I while in it) and hot (no ice); ticks only near players |
| `tube_worms` | waterlogged cluster of red-plumed tube worms (`extended` true/false); **retract** when a player is within 4 blocks, re-extend after a few seconds; Silk Touch collects them for aquariums; they grow round vents |
| `raw_gold_block`, `raw_iron_block` deposits | vanilla blocks, generated in huge seams round vents (no new id) |
| `ash_sand` | falling, grey volcanic sand (16 x 16 vanilla style) |
| `ashstone`, `polished_ashstone`, `ashstone_bricks`, `cracked_ashstone_bricks`, `chiseled_ashstone`; `_stairs`/`_slab`/`_wall` for ashstone, polished and bricks | the underwater building set (2x2 chains, stonecutter, smelting ash sand -> ashstone) |
| `angler_light` | the glowing lure of a giant female anglerfish as a block: light 15, softly pulsing; players within 8 blocks get **Night Vision 30 s** (refreshed every 2 s) |
| `whale_lure` | crafted lure (block entity): animated bioluminescent blink and pulse visible through dark water; attracts whales (section 8) |
| `eye_of_the_ocean` | conduit-like magical block (block entity, owner); section 7 |
| `cannon` | aimable cannon (block entity); section 9 |
| `barnacles` | crusty barnacle block (hard: hardness 25, pickaxe); grows on whale backs, also on old wrecks |
| `whale_flesh`, `whale_hide` | the inside of a whale (belly dimension): flesh can be mined (it hurts the whale), hide is unbreakable |
| `nautilus_horn` | the horn placed as a decorative block (keeps its binding) |
Natural **sponges** (dry and wet) generate in coral reefs, and reefs get denser seagrass, kelp and sea pickles.

## 3. Anglerfish (`anglerfish`)
* Deep-sea predators with a glowing lure on a stalk. The lure **blinks and pulses** naturally (slow breaths of light,
  irregular flickers, a brighter flare when it hunts), seen from far away in dark water, and actually lights the water
  round it (a moving waterlogged light block, only near players, updated when it moves more than a block).
* **Females** (`variant` female, rare, below y -10): enormous (3 x 2 blocks), 80 health, extremely dangerous: they
  lure, lunge, **grab** a player in their jaws (held 3 s, 4 damage a second, struggle by attacking) and swallow small
  mobs. **Males** (common, below y 20): tiny (0.4 blocks), harmless, collectable in a bucket (`anglerfish_bucket`).
* Drops: `raw_anglerfish` (edible: Night Vision 20 s; `cooked_anglerfish` 40 s), `angler_lure` (Night Vision
  potions now brew from it: awkward potion + angler lure; the golden carrot recipe is **removed**). Females also drop an
  `angler_light` block (25%).
* Bones: `body`, `head`, `jaw`, `teeth`, `stalk`, `stalk_tip`, `lure` (glow), `fin_l`, `fin_r`, `fin_top`, `tail`.
  Clips: `swim` (loop), `idle` (loop), `lunge` (0.6 s), `bite` (0.5 s), `hold` (loop), `lure_flash` (0.8 s).
  One model, the female drawn at 7x scale.

## 4. Lionfish, Nautilus, turtles
* **Lionfish** (`lionfish`, warm reefs and shipwrecks): striped, frilled with venomous spines; hunts smaller fish
  (cod, tropical fish); touching it poisons (Poison 4 s). **Shears** collect 2-3 `lionfish_dart` (it regrows them in
  5 min); killed it drops `lionfish` (food; cooked `cooked_lionfish`). **Darts** are ammunition for bows and crossbows
  that fly straight and fast **underwater** (no drag) and poison (5 s); thrown by hand too (weaker). Bones: `body`,
  `fins`, `spines`, `tail`; clips `swim`, `hunt` (0.5 s), `flare` (spines out, 0.8 s).
* **Nautilus** (`nautilus`, deep oceans only, y < 35): a large coiled-shell cephalopod, the underwater **mount**. Tame
  with raw cod or salmon (1 in 3); saddle to ride. Ridden it swims where you look (fast, smooth, a jet dash on jump) and
  its rider has **Water Breathing**. Drops a `nautilus_shell` (vanilla item) when it dies. Bones: `shell`, `body`,
  `eye_l`, `eye_r`, `tentacles` (`tentacle_0..7`), `siphon`, `saddle`. Clips `idle`, `swim`, `dash` (0.5 s).
* **Turtles** (vanilla turtles, overhauled): new adult and baby models and renderer, natural swimming (gliding strokes,
  smooth pitch and banking, surfacing to breathe), basking on beaches; clutches of 2-6 eggs (was 1-4) and more common
  spawns on beaches. Killing one drops 1-3 `turtle_shell_shard`; 9 shards craft a Turtle Shell (vanilla
  `turtle_helmet`). Bones: `shell`, `body`, `head`, `flipper_fl`, `flipper_fr`, `flipper_bl`, `flipper_br`, `tail`;
  clips `idle`, `walk`, `swim`, `bask`, `dig` (laying eggs, 2.0 s). Model names `sea_turtle` and `sea_turtle_baby`.

## 5. Turtle Shell armour
* A full set that looks like an actual turtle shell (3D armour models, not recoloured armour): the vanilla Turtle Shell
  helmet plus `turtle_shell_chestplate` (the carapace on your back and plastron in front), `turtle_shell_leggings`,
  `turtle_shell_boots` (scaled flipper boots). Recipes use Turtle Shells, shell shards and prismarine shards. Armour like
  iron, toughness 1; underwater swim speed +10% per piece.
* **Retreat**: wearing all four, sneaking pulls you into your shell: you can't move or attack, damage taken is cut 60%
  from the front and 90% from behind and above, knockback is ignored; each blocked hit costs durability. Drawn as a
  closed shell on the ground.

## 6. Ocean monuments and the Elder Guardian boss
* Monuments are reworked after they generate: lit wings (sea lanterns, prismarine variants), treasure rooms with chests
  (`winterworks:chests/monument_*`), guardian patrol routes, and the core chamber made into a boss arena (pillars, the
  gold kept). One monument holds **one Elder Guardian boss** in the core; its other two elder spawns become guardians.
* **The Elder Guardian boss** (vanilla entity, new model, renderer and AI): 300 health, a boss bar, the Mining Fatigue
  aura kept. Attacks: **bubble barrage** (bubble projectiles `elder_bubble` that trap, drag and damage), **stare**
  (a charging laser lock, 2 s telegraph, then heavy damage while line of sight holds; hide behind pillars), **tail
  whip** (spinning sweep, knockback), and summoning guardians at 50%. Unique animations for each. New model `elder_guardian`
  (bones `body`, `eye`, `pupil`, `spikes` (`spike_0..11`), `tail_0..3`, `fin_l`, `fin_r`; clips `idle`, `swim`,
  `bubble` (1.0 s), `stare` (2.5 s), `tail_whip` (1.0 s), `death` (2.0 s)).
* Drops the **Elder Guardian Eye** (`elder_guardian_eye`). Guardians drop 1-3 **Guardian Scales** (`guardian_scale`).
* **Eye of the Ocean** (`eye_of_the_ocean`): the Elder Guardian Eye in the centre of 8 Guardian Scales (a crafting
  grid holds 9). A placeable magical block like a Conduit (an animated floating eye in a cage of scales) that works
  underwater **and on land**: its owner and trusted players within 32 blocks get Conduit Power; anyone else who tries to
  break blocks in that range gets Mining Fatigue III. Placing it makes you its owner.
* **Trust**: one trust list per player: `/winterworks trust <player>` and `/winterworks untrust <player>` (no op
  needed); used by the Eye of the Ocean and the whale horn. API `ocean.Trust.isTrusted(UUID owner, Player p)`.

## 7. Reefs, shipwrecks, treasure, skeletons
* Coral reefs: natural sponge clusters, denser seagrass and kelp, more sea pickles.
* **Deep shipwrecks** (`deep_shipwreck`, deep and abyssal oceans): big, rare, barnacle-crusted galleons on the deep
  floor with better treasure (`chests/deep_shipwreck_*`).
* **Sunken treasure** (`sunken_treasure`): a lone chest half buried in the deep seafloor with rare loot, the Heart of
  the Sea possible (`chests/sunken_treasure`).
* **Whale skeletons** (`whale_skeleton`): huge bone-block skeletons on deep floors, with tube worms and anglerfish.

## 8. The Whale (`whale`)
A massive, neutral mob that behaves like a moving block structure.
* **Body**: about 7 wide, 6 tall, 26 long; 600 health; damage from outside is cut 90% (it's mostly blubber). Swims deep
  oceans, surfaces to breathe (a blowhole spout), dives, eats fish schools and food items in the water.
* **The deck**: a block grid over its back (9 wide, 6 high, 21 long), axis-aligned. Players can walk on its back, place
  blocks on it and on those blocks, and build houses, storage (chests, barrels) and cannons; everything moves with the
  whale and anyone standing on it is carried. While its deck has blocks the whale keeps its back at the surface and
  turns in 90-degree steps (the grid rotates with it). Rendered from a cached mesh, collisions from the grid, saved with
  the whale. Anyone can board.
* **Barnacles** appear on its back over time and slowly spread; they raise **irritation**. Mine them off (hard).
* **Irritation** (0-100) rises with barnacles, hunger, a dirty stomach and damage from inside; it falls when fed (drop
  fish or other food into the water near it) and cleaned. Above 70 it **shakes** violently now and then: throws
  everyone off, knocks loose and drops random deck blocks, hurts anyone inside. Kept clean and fed, its deck is safe.
  Care is separate from taming.
* **Swallowing**: when it lunge-feeds, a strong current pulls in what's in front of its mouth (12 blocks) and
  swallows players and mobs into its **belly** (dimension `winterworks:whale_belly`, one sealed room per whale: flesh
  walls on unbreakable hide, rib bones, a stomach pool). Inside: trapped fish, Drowned, unlucky mobs, sometimes
  treasure barrels (`chests/whale_belly`). To escape, wait for the mouth to open (a happy whale every 5-8 minutes, an
  irritated one only every 20-40); the chamber floods and a strong current runs to the mouth for 10 s before it snaps
  shut. You can be trapped for days. Mining the flesh hurts the whale from inside (where it is vulnerable), irritates
  it and makes it shake.
* **Whale Lure** (`whale_lure`: an Angler Light in the centre of 8 prismarine crystals): placed underwater, nearby
  whales (96 blocks) come and circle it and **sing** a pattern of 4-6 notes. Each note is one of the 8 goat horn
  sounds; repeat the song with the matching **Goat Horns** in rhythm (each note within its beat window). Success: a
  magical burst of light and song, the whale is **tamed** to you, advancement `winterworks:ocean/whale_song`. Fail: it
  swims off; try again later.
* **Nautilus Horn** (`nautilus_horn`: a Goat Horn in the centre of 8 Nautilus Shells): bind it by using it on your
  tamed whale (one horn per whale, one whale per horn). Blown (by its owner or a trusted player) within 96 blocks, the
  whale turns toward where you look and swims that way; sneak-blow stops it. Placeable as a decorative block (keeps its
  binding).
* Bones: `body`, `head`, `jaw`, `blowhole`, `fin_l`, `fin_r`, `fluke`, `tail_0`, `tail_1`, `eye_l`, `eye_r`. Clips:
  `swim` (loop), `idle` (loop), `breathe` (spout, 2 s), `mouth_open` (1.0 s), `mouth_close` (0.5 s), `lunge` (1.5 s),
  `shake` (2.0 s), `sing` (loop).

## 9. Cannons
`cannon` (block): place it anywhere, a whale's deck included. Use with an empty hand to aim it where you look (pitch -10
to 60); use gunpowder to load (up to 4 shots); a redstone pulse or sneak-use fires a `cannonball` that arcs and bursts
(explosion power 2, obeying mobGriefing; never breaks whale decks). Pick it up with a pickaxe to move it. Bones:
`base`, `barrel` (pitch), `yoke` (yaw).

## 10. Ids
Blocks: section 2. Items (besides block items): `raw_anglerfish`, `cooked_anglerfish`, `angler_lure`,
`anglerfish_bucket`, `lionfish`, `cooked_lionfish`, `lionfish_dart`, `turtle_shell_shard`, `turtle_shell_chestplate`,
`turtle_shell_leggings`, `turtle_shell_boots`, `guardian_scale`, `elder_guardian_eye`, `nautilus_horn` (block item),
spawn eggs `anglerfish_`, `lionfish_`, `nautilus_`, `whale_spawn_egg`. Entities: `anglerfish`, `lionfish`,
`nautilus`, `whale`, `lionfish_dart`, `cannonball`, `elder_bubble`. Biomes: `volcanic_depths`, `abyssal_trench`.
Structures: `deep_shipwreck`, `sunken_treasure`, `whale_skeleton`. Dimension: `whale_belly`. Advancement:
`ocean/whale_song`.
