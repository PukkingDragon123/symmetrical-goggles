# Winterworks 0.4: fixes and remakes of earlier content

What the player asked for, made precise. Art (textures, lowpix models) is done by the art pass; this file is the
contract for the Java side.

## Amber
* **Amber blocks** need **Silk Touch**: with it they drop themselves (inclusion kept); without it they shatter into
  2-4 **Amber Shards** (`amber_shard`, new item) and release whatever was inside (a mosquito flies out, a seed
  inclusion drops an Amberwood Bloom). The **Amber Chunk** item is replaced by Amber Shards everywhere (recipes,
  loot, the mosquito amber farm, tags); 9 shards craft an amber block (and an amber block crafts back into 9 shards).
* The **Amber Fossil** stays; new texture (gravel with amber inside, vanilla suspicious-gravel style).
* **Amber Sand** and **Amber Gravel** (`amber_sand`, `amber_gravel`, new): sand and gravel with amber showing through,
  brushable like suspicious sand/gravel (4 dusting stages, turning into plain sand/gravel). Brushing gives amber: amber
  shards mostly, sometimes a whole amber block (with an inclusion now and then). They generate in cave deposits, the
  Dead Caves and Dig Sites, alongside suspicious sand and gravel.
* **Archaeology is richer**: suspicious sand and gravel (and the new amber blocks) generate in caves about three times
  as often, and amber turns up in them far more. **Sherds and decorated pots become much rarer** in all of this mod's
  loot (cave deposits, Dig Sites, sniffer digging): about a fifth of their old weight, so pots are a real find.
* **Amberwood**: a full vanilla-style wood set: log, wood, stripped log, stripped wood, planks, stairs, slab, fence,
  fence gate, door, trapdoor, button, pressure plate, sign and hanging sign (and boat and chest boat if the boat types
  can be registered cleanly). Vanilla behaviour throughout (stripping with an axe, sign editing, tags, recipes, fuel,
  creative tab order). Textures are 16 x 16 in vanilla's own style.
* **The Amberwood Bloom is the sapling**: plant it (sand, red sand, terracotta, dirt, grass) and it grows into an
  Amberwood (random ticks, bone meal). The tree's top blooms drop blooms. The separate Amberwood seed and sapling go
  (the amber seed inclusion and fossil loot give blooms instead).

## Cold Zone
* **Frost Mauler**: new head and eyes from the art pass; keep the soul-flame eyes and particles lined up.
* **Frost Mauler Skull**: remade model. Powered by redstone (rising edge) it **roars** and shakes loose every icicle and
  pointed dripstone within 12 blocks above, so they fall (vanilla falling dripstone; our falling icicles). 3 s cooldown.
* **Ancient Ice**: new texture (translucent, animated shimmer).
* **Fur armour** ("polar bear armour"): worn armour uses vanilla's armour rendering with the new
  `fur_layer_1/2` textures, so it looks like Minecraft armour; new item icons.
* **Fang Daggers**: the 3D model in first person too. Dual wield feel: **left click strikes with the left dagger,
  right click with the right dagger** (each its own swing animation, sounds and slash particles), with the existing
  fast-then-slow-then-recharge rhythm. Cooler feel: snappy swings, a little camera kick, crit sparks.
* **Snowball Launcher**: much bigger when held (first and third person).
* **Icebreaker**: about 25% smaller (new model) and much furrier. It attacks polar bears. Feeding it fish plays the
  new `eat` clip. It is far more hostile when its cubs are near: it charges players who come within 10 blocks of a cub. When it rams it
  points its horns at the target (the `ram` clip holds the head low with horn and tusks aimed ahead).
* **Icebreakers love water** (a fix: today they barely swim). They head for water often, swim fast and gracefully
  (porpoising at the surface, diving deep, rolling), haul out onto ice and shores to rest, and spend most of their
  time in or near water. They **sleep** lying flat on their bellies (new `sleep` clip, the cub too), mostly at night,
  waking when hurt or approached. They **hunt salmon (and cod) violently**: they chase them fast underwater, lunge,
  bite, shake and eat them (the `eat` clip), and go after salmon within 16 blocks whenever they're hungry (every
  couple of minutes).
* **Potion of Ramming**: when you reach top speed you get a battle cry (sound), a burst of snow and wind particles,
  speed lines on screen, a new running pose (leaning forward, arms swept back) and a further speed boost.

* **The cold bites harder, in four levels**: a cold meter (shown as the Cold effect I-IV): **Chilly** (shivers, frost
  breath, the frost overlay creeping in), **Cold** (Slowness, Mining Fatigue), **Freezing** (Slowness II, Weakness,
  fully frozen: vanilla freeze damage), **Frozen** (Slowness IV, Weakness II, extra freeze damage). It fills from the Ice
  Caves, cold water, standing on or touching ice, powder snow and snowstorms, much faster than before; warmth thaws you
  fast, leaving the cold slowly. Each leather or fur piece cuts the cold by a quarter (a full set keeps it out).

## The Winter Express
* The **Trailer Cart** is removed. **Normal minecarts** (and chest/hopper/furnace minecarts) couple to locomotives
  and to each other the way the trailer did, and get pulled.
* **Furnace minecarts power trains**: a furnace minecart coupled into a train with a locomotive drives the locomotive
  while the furnace burns (fed coal or charcoal as usual): the train runs by itself, no locomotive fuel needed. A
  burning furnace minecart also pulls a train of coupled minecarts on its own.
* **Coaster Rails** become full 3D track pieces (new models) that can be placed **floating**, with nothing under
  them, and still carry carts (straight, ascending, corners).

## Curses (Hexes & Havoc)
* **No trigger text** any more. Every curse instead plays a longer, stronger screen effect when it triggers, like
  Sloth's nod-off: its own colour, vignette, distortion and sound, a few seconds long.
* Tooltips show just the curse name: no description lines.
* **Soul fire looks like soul fire** (a fix): Wrath already sets victims alight with soul fire (double burn damage,
  soul sparks), but they're drawn with vanilla's orange flames. Anything burning with soul fire (Wrath, Envy, the Soul
  Bull's horns) must show **blue soul flames** on its body and, for the local player, on the first-person screen
  overlay. The soul-burning state is synced to clients (e.g. entity data or a payload), and soul fire also lasts its
  full time (8 s for Wrath).

## Torchflowers, pitcher plants, mosquitoes and sniffers (Amber Age)
* **Torchflowers burn mosquitoes**: a mosquito that touches or flies within 1 block of a torchflower (planted, potted
  or the crop) catches fire; mosquitoes avoid torchflowers.
* **Potion of Burning** (`burning`): awkward potion + torchflower. Whoever it touches burns for the duration, and water
  doesn't put them out (3:00 drink / splash / lingering / tipped arrows; redstone extends it). The existing Potion of
  Immunity recipe (blood + torchflower) stays.
* **Mosquitoes really harvest Amberwood**: empty mosquitoes find oozing Amberwood logs, sip the resin and become
  amber-full (fix: it doesn't happen today in game).
* **Torchflowers and pitcher plants glow**: they keep vanilla's own textures (the user asked for the old look) and
  glow: each crop stage gives a little more light (torchflower light 15 when grown, pitcher plant 12) and their
  luminous parts render full-bright at runtime from the game's own textures (an emissive pass, like the End Bloom's
  BloomGlowModel). No vanilla texture files are copied into the mod. Harvesting: use a grown torchflower or pitcher plant with an empty hand to pick it: torchflower seeds or
  pitcher pods (1-3) drop and it goes back to a young crop (like sweet berries). Breaking still works as in vanilla.
* **Pitcher plants attract bees** (they count as flowers for bees and pollination) and mosquitoes, and give off sweet
  golden-pink scent particles (`sweet_scent`).
* **Sniffers water crops**: a tamed sniffer with water within 12 blocks walks over, drinks, then finds farmland near
  its owner and **sneezes** a spray over it (a sneeze animation, splash particles, a sneeze sound): farmland in a 3-block
  radius becomes fully moist and crops there get a growth tick. About once a minute.

## The Harvester (a new dinosaur, Amber Age)
* `harvester`: a big, gentle prehistoric herbivore with a huge, wide **hammerhead-shark-like head** lined with rows of
  teeth for cropping plants, and a broad nose. It is extinct: it does **not** spawn naturally.
* **Reviving it**: find a **Harvester Egg** (`harvester_egg`, a block like the sniffer egg). They are super rare:
  brushed out of suspicious sand and gravel (about 1 in 150 brushes) and sealed inside the amber blocks of Dig Sites
  (about 1 in 40 of those, as a new `egg` inclusion that drops the egg when the amber breaks). A placed egg only
  develops while **submerged in water** (water above it, or waterlogged); it cracks in three stages over about 20
  minutes (faster on moss, like sniffer eggs) and hatches a baby Harvester that grows up like other animals.
* A Harvester hatched near a player starts tame to that player; others are tamed with pitcher plants (1 in 3 per plant). Tamed: follows, sits, can be **ridden with a saddle** (walks,
  jumps 1.5 blocks) and wears a **chest** like a donkey (15 slots).
* **Harvests crops**: a tamed Harvester left near farmland (not sitting, not ridden) crops mature wheat, carrots,
  potatoes, beetroots, nether wart, melons, pumpkins, sweet berries, torchflowers and pitcher plants within 16 blocks of
  where it was left, replants them, and puts the harvest into its chest (or drops it when it has none or it's full).
* **Herds animals**: while ridden, its massive head shoves animals in front of it along the way it walks, so you can
  drive herds into pens.
* Drops nothing special (leather 1-3). Bones: `body`, `neck`, `head` (the wide hammer head), `jaw`, `teeth_upper`,
  `teeth_lower`, `tail_0..2`, `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`, `chest_l`, `chest_r` (shown with a chest),
  `saddle` (shown when saddled). Clips: `idle`, `walk`, `run`, `graze` (1.5 s), `chomp` (0.8 s, harvesting), `shove`
  (0.8 s, herding), `sit`.

## Blood in hexing (Hexes & Havoc)
* The **Elixir of Greed** needs blood: the Elixir Jar brews it from a gold block only after a Potion of Blood has been
  poured in (the jar takes the blood first, then the gold).
* **Blood is a base potion**: besides the Elixir of Greed, the Potion of Blood is the base for Instant Damage and
  Regeneration in the brewing stand: Potion of Blood + fermented spider eye -> Potion of Harming; Potion of Blood +
  ghast tear -> Potion of Regeneration (the vanilla potions, which then extend/strengthen as usual). The vanilla
  recipes stay too.
* **Blood instead of yourself**: the Hexing Table gets a third slot for Potions of Blood. A lesser hex can take 1
  Potion of Blood instead of hexing you; a sin hex always needs 1 Potion of Blood, and takes 2 more instead of hexing
  you. With no blood offered, you are Hexed as before.

## Rails (Winter Express)
* **Booster Rails** are nerfed and buffed: they only run when a **redstone block** powers them (touching the rail or
  directly under it; levers, torches and dust do nothing), and then they push far harder than a powered rail (about 3x
  the speed gain, up to the cart's top speed).
* **Switch Rail** (`switch_rail`, new): a Y-junction for splitting paths. Placed where a track forks, it sends carts
  straight on when unpowered and onto the branch (left or right, set by where you place it) when powered. Whole trains
  follow their leader's route. Recipe: 6 iron + a rail + a redstone torch -> 2.

* **Coaster Loop** (`coaster_loop`, new): a full **360-degree vertical loop**. Placed in line with coaster rails, it
  shows a complete 3D loop of coaster track (radius 3 blocks, made of the 3D coaster rail pieces, rendered by the block)
  rising from it. A cart that enters fast enough (about 0.8 blocks/tick, e.g. off Booster Rails) rides all the way
  round, upside down at the top with its rider, and comes out the far side at the same speed; too slow and it falls back
  out of the loop. Whole trains loop one car after another. Recipe: 8 coaster rails round an iron block.

* **Every rail is 3D track** (the user's choice): vanilla's own rails are replaced by the new 3D track style through
  resource overrides of their blockstates and models (our own models and textures, no vanilla art copied):
  * **Rail**: the plain 3D track (steel rails, ties, the spine beam below when nothing is underneath), all 10 shapes.
  * **Powered Rail**: gold-plated ties and a redstone strip down the middle that glows when powered.
  * **Detector Rail**: a sensor plate between the rails with a lamp that lights when a cart is on it.
  * **Activator Rail**: red-trimmed ties with a fork that flips and lights when powered.
  * The Winterworks rails get matching 3D versions: Booster (its redstone-block plate), Lift, Trap, Drop (and open),
    Switch, Coaster Loop entry. The Coaster Rail stays the free-floating coaster piece.
  * Item icons show the 3D pieces. Behaviour is unchanged; only the look.

## 3D icons
* Blocks and items that have a 3D model show that model as their inventory icon too: the Hexing Table, Soul Tank,
  Elixir Jar and Hex Core, the locomotives and carts, the Snow Globe, and every new End block/item with a 3D model.

## Potions
* Every potion in the mod comes as drink, splash and lingering (vanilla brewing with gunpowder and dragon's breath),
  as tipped arrows, and in levels where it makes sense: long (redstone) and strong (glowstone) for Ramming, Immunity
  (long), Burning (long and strong), Decay (long and strong). All of them appear in the creative tabs.
* **Potion of Decay** (`decay`): awkward potion + Wither Bone. Gives the Wither effect (0:40; long 1:30; strong II 0:20).

## Cursed books and cursed gear (Hexes & Havoc)
* Enchanted books carrying a curse (any of ours, Binding or Vanishing) get their own **cursed book** textures instead of
  vanilla's enchanted book, in the same book form (violet with a soul flame for a curse, crimson with a horned gold eye
  for a sin), and every cursed item gets a new **soul glint**: three souls in soul-fire teal rising through soft
  swirls instead of the purple shimmer. The new art has no black outlines.
* The **elixir** items (bottle, Soul Elixir, Elixir of Greed, Cursed Elixir) get vanilla-style potion-bottle icons.

## The End
* **Phantoms are locals in the End**: they spawn in the outer End (our biomes and the vanilla highlands/midlands) in
  small flocks, regardless of insomnia.

## The Soul Bull (a new Nether mob)
* `soul_bull`: a bull that is a completely black skeleton, kept alive by soul fire burning inside its ribs and skull
  (blue flames in the eye sockets). Spawns in **Soul Sand Valleys** (herds of 1-3); sometimes a **Wither Skeleton
  rides it** (a jockey).
* Wild ones are hostile: they **ram**, catch you on their horns and **pin** you (held 1.5 s), dealing **soul fire**
  damage (it sets you alight with soul fire).
* Its **health is its soul energy**. Water and rain hurt it, like a blaze.
* **Drops** its **Soul Bull Skull** (always) and 1-3 **Wither Bones** (`wither_bone`). Wither Skeletons also drop a
  Wither Bone 25% of the time.
* **Taming**: a wild bull below half health can be tamed by feeding it a soul torch, soul lantern or soul campfire
  (1 in 3). Or **revive** one: place a Soul Bull Skull on soul sand in the middle of lit soul fire (soul fire on the
  4 sides at least); its eye sockets ignite. Then use 10-15 Wither Bones on it (the number is rolled per skull; each adds
  bones round it); the last one rebuilds the bull, alive and tamed to you.
* Tamed: it takes **horse armour** and a **saddle** and can be ridden. While riding, a **soul bar** replaces the
  experience bar and shows its soul energy (= its health). Its **ram** (the jump key, charged like a horse jump) charges
  forward, pinning and soul-burning what it hits, and costs a lot of soul energy.
* **Armoured variant**: blackened, gilded blackstone plates bolted to its bones (more armour, +50% health). Armoured
  bulls are seen with **piglins**: round bastion remnants and in Hex Fortress pens (sometimes a piglin or brute rides
  one). The **unarmoured** wild bulls of the Soul Sand Valleys are the ones **Wither Skeletons** ride. The bones of every Soul Bull are the colour of
  a Wither Skeleton's (dark charcoal greys), not pure black.
* **Milking**: use an Elixir Bottle on a tamed Soul Bull to draw a **Soul Elixir** from its soul fire; it costs a
  quarter of its soul energy (it refuses below a quarter).
* **Recharging**: use a soul torch, soul lantern or soul campfire on it (big refills), or let it suck the souls out of
  soul fire, soul torches, soul lanterns and soul campfires near it, which breaks or puts them out (soul fire gives a
  little, the others a lot more).
* Bones (model `soul_bull`): `body`, `ribs`, `soul_fire` (the flame inside, glow), `neck`, `head`, `jaw`, `horn_l`,
  `horn_r`, `tail`, `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`, `saddle`, `rider` (locator). Clips: `idle`, `walk`, `run`,
  `ram` (1.0 s), `pin` (1.5 s), `drain` (souls flow in), `revive` (2.0 s). The skull block `soul_bull_skull` (3D, with
  lit eyes as a state).

## Sound events for this batch (namespace winterworks; registered by the Java side)
`entity.harvester.ambient|hurt|death|chomp|shove|step`, `entity.soul_bull.ambient|hurt|death|snort|ram|pin|step|drain|revive`,
`block.soul_bull_skull.ignite`, `entity.sniffer.sneeze`, `entity.player.ramming_cry`, `entity.player.ramming_wind`,
`block.frost_mauler_skull.roar`, `block.switch_rail.switch`, `item.fang_dagger.slash_left|slash_right`,
`curse.effect.lesser|sin|hidden`.

## The Pot Golem (Amber Age)
* **Fix**: building one must actually work in survival: four amber blocks in a T with a decorated pot placed on top
  becomes a Pot Golem, like an iron golem. It doesn't matter which way the pot (or the T) faces, or which block is
  placed last. Today it doesn't happen in game.
* **Four matching faces**: a head ability only works when **all four faces of the pot carry the same sherd**. A mixed
  pot still makes a golem, just without a head ability (the Echo Shard inside still gives the Echo Head).
* **The pattern glows** while its ability is active: the sherd pattern on the head is drawn full-bright in a soft
  colour per ability (the glow mask is made at runtime from the pattern texture, so no vanilla art is copied). The same
  glow shows on a **decorated pot item** whose four faces carry the same ability sherd (its inventory icon and in hand).
* **Six new head abilities** (on top of Howl and Danger), each from 4 matching sherds:
  * **Heart**: a healing aura: its owner and their pets within 8 blocks get Regeneration I.
  * **Burn**: burning fists (sets what it hits on fire) and Fire Resistance for its owner nearby.
  * **Flow**: a wind burst every 6 s that hurls enemies within 5 blocks away (like a breeze charge, no block damage).
  * **Shelter**: shields its owner: Resistance I within 6 blocks, and it steps in to block arrows aimed at them.
  * **Plenty**: vacuums up dropped items within 8 blocks into its pot (27 slots); use it with an empty hand to open it.
  * **Brewer**: throws splash potions: Healing at its owner when they're hurt, Weakness or Slowness at enemies.
* **Headshots**: the pot is the golem's head and its weak spot. A hit that lands on the head (arrows, tridents and
  other projectiles by where they strike; melee by where the attacker is looking, a ray against the head box) is a
  **headshot**: double damage, it always cracks the pot, and it shows a crit burst of pottery chips with a sharp clink.
  Body hits do normal damage and crack the pot only sometimes, as now.

## Art notes for the Java side (from the art pass)
* **Amberwood**: textures follow vanilla paths for WoodType `winterworks:amberwood` (`entity/signs/amberwood.png`,
  `entity/signs/hanging/amberwood.png`, `gui/hanging_signs/amberwood.png`, `entity/boat/amberwood.png`,
  `entity/chest_boat/amberwood.png`); blocks `amberwood_log(_top, _resin)`, `stripped_amberwood_log(_top)`,
  `amberwood_planks`, `amberwood_door_top/bottom`, `amberwood_trapdoor`, `amberwood_bloom(_top)`; items
  `amberwood_door`, `amberwood_sign`, `amberwood_hanging_sign`, `amberwood_boat`, `amberwood_chest_boat`, `amberwood_bloom`.
* **Amber**: `item/amber_shard`, `block/amber_sand_0..3`, `block/amber_gravel_0..3`; `amber_chunk` can go.
* **Coaster rail**: 3D models `coaster_rail_straight` (north_south 0 / east_west 90), `coaster_rail_ascending`
  (ascending_north/east/south/west 0/90/180/270), `coaster_rail_corner` (south_east/south_west/north_west/north_east
  0/90/180/270); the blockstate already maps them. Floating needs `canSurvive` overridden. `coaster_rail_loop_segment`
  is 19.6 px of rail centred on (8,8,8) along z with the ride surface in the plane y=8 facing +y: 16 of them at radius
  3 blocks, each turned so +y faces the loop centre, close the loop.
* **Fur armour**: vanilla layers `models/armor/fur_layer_1/2.png` (ArmorMaterial layer `winterworks:fur`).
* **Icebreaker**: 0.75 scale; hitbox 2.5 x 2.1 -> 1.875 x 1.575, eye height 1.35; new `eat` clip (1.2 s);
  `charge` (loop) holds the head low with the horn levelled; `ram` (0.8 s) thrusts and returns to rest. Don't play
  `ram` on top of `charge` (skip it while charging).
* **Frost Mauler / skull**: new eye glow parts already in the export; no Java changes needed.
* **Harvester**: `HarvesterModel` (texture 256x512, draw `entityCutoutNoCull`; cards for fringes and teeth). Hitbox
  2.0 x 1.9 fits; the head is ~3 blocks wide, nose to tail ~4.9. Toggle `saddle`, `chest_l`, `chest_r`. Rider seat
  top at y 35 px (~2.2 blocks). Clips: `idle` 4.0 loop, `walk` 1.6 loop, `run` 0.8 loop, `graze` 1.5, `chomp` 0.8,
  `shove` 0.8 (sweeps toward its left), `sit` 3.0 loop.
* **Harvester Egg**: block models `harvester_egg_{not_cracked,slightly_cracked,very_cracked}` (sniffer-egg box) and
  `item/harvester_egg`; the blockstate (hatch 0-2) and item model are still to write. Amber egg inclusion:
  `AmberEggModel` + `entity/amber_egg.png` (register an `AMBER_EGG` layer in AmberClient and an `EGG` case in
  AmberInclusionRenderer like `seed`, fit ~0.6).
* **Hexing Table GUI** (already in `gui/hexing_table.png`): blood slot item at (74, 20) (frame at 73, 19), ghost
  blood potion at sheet (240, 64, 16, 16); the rows moved: `HexGui.ROW_X` 80 -> 95 and `ROW_W` 88 -> 73 (must change
  with the art, or the rows draw misaligned). The no-sheet fallback's 9-link chain must fit 73 px.
* `sweet_scent` particle: 5 frames, soft alpha (translucent sheet, setSpriteFromAge). `mob_effect/burning.png`.
* **Soul Bull**: `SoulBullModel` (density 2; ~2.05 x 2.6 x 4.65 blocks with horns and tail flame, the trunk and legs
  ~1.7 wide and 2.7 long, withers 2.0 blocks up, the hump's spine tips 2.6; a hitbox of about 1.7 x 2.5 fits); glow
  via `_glow` with RenderType.eyes. Textures: `soul_bull`, `soul_bull_armor_{iron,gold,diamond}` (horse armour),
  `soul_bull_armored` (the natural armoured variant). Hide `saddle` unless saddled; `rider` locator = MC model
  (0, -11.25, 3.5), seat top ~2.2 blocks. Optional: scale `soul_fire` with soul energy. Clips: idle 4.0, walk 1.2,
  run 0.6, drain 2.0 (loops); ram 1.0, pin 1.5, revive 2.0.
* **Soul Bull Skull** block: `SoulBullSkullModel` (bones `skull`, `jaw`, `horn_l/r`, `eye_fire`; ~0.5 render scale;
  hide `eye_fire` when unlit; idle 2 s loop); a renderer like FrostMaulerSkullRenderer.
* **Soul bar**: `gui/soul_bar.png` 182x25: background at v=0, full-bar frames at v=5,10,15,20 (182x5 each; frame
  (ticks/3)%4, width cropped to 182*soul/max); `gui/soul_bar_icon.png` 9x36 (4 frames at v=9i) drawn at (barX-10, barY-2).
* **Soul glint**: `misc/soul_glint_item.png`, `misc/soul_glint_entity.png` (128x128 RGB, additive like vanilla's glint,
  three souls per tile). `SoulGlint` scales the item one so a whole tile covers a 16 px item (atlas uv x 64 on the
  1024-wide atlas) and the entity one by 2 (a tile = 32 x 16 armour px); the glint only translates (souls rise, sway).
* **Cursed books**: `item/cursed_book`, `item/cursed_book_sin` (item/generated); enchanted books carrying a curse use them
  via a model override. `item/wither_bone`.
* **Switch Rail**: models `block/switch_rail_{right,left}{,_on}` drawn toe-south (straight runs north; `_right`
  branches east, `_left` west); blockstate y: toe south 0, west 90, north 180, east 270. `item/switch_rail.json` exists.
  Add it to the rail colour providers (block tint 0 = RailPaint.tint; item 0xFF8A6B47) and the cutout layer.
* **Booster Rail**: art shows a redstone-block plate (dull unpowered, bright powered); same file names.

## The Hex Fortress, reworked (Hexes & Havoc)
* **Smaller, simpler and more common** (about 40 x 40, spacing about 20 chunks): a compact stronghold that looks like a
  real Nether fortress (nether-brick walls, a bridge or two on piers, corridors with fence windows, a stair tower) built
  onto a piece of bastion (blackstone, gilded blackstone, basalt). It keeps a brewing room, a wart farm, a storeroom,
  the witch's quarters and the Nether Portal.
* **The witch's crew**: **piglins and piglin brutes** walk about and **work for the witch**: brutes guard the gate and
  her quarters, piglins tend the wart, haul and brew. They are on her side: they defend her and each other and attack
  whoever attacks her. (Bartering and the gold rules still work for the piglins.)
* **Soul Bull pens**: soul-sand pens lit with soul fire holding 2-3 hostile **Soul Bulls** (sometimes armoured); you
  must defeat them to get past.
* **Golden Piglins** (her failed experiments, caged or wandering) and **weird experiments** about: caged half-turned
  creatures, bubbling cauldrons and Elixir Jars over soul fire, soul tanks wired to cages, a table with bones and a Soul
  Bull skull, potion stains. Chests hold the experiments' loot.
* **The Piglin Witch, super strong**: still neutral and still trades after an Elixir of Greed, but attack her (or her
  crew) and she fights with her **spellbook** (an open hexed book floats before her, glyphs circling): a boss bar,
  250 health, and spells:
  * **Hex bolts**: volleys of homing soul-fire bolts.
  * **Soul ring**: a ring of soul fire bursting outward along the ground (jump it).
  * **Hex**: curses you with Hexed (no natural regeneration) for 30 s, and Slowness.
  * **Potion barrage**: throws Harming, Weakness and Slowness potions.
  * **Summon**: calls her brutes, and raises a Soul Bull from a pile of bones.
  * **Blink**: when hit hard, she vanishes in smoke and reappears nearby.
  She drinks healing when low (once per fight). Killed, she drops her spellbook (a Hexed Book with a strong random
  hex) and her stash.
* Structure id stays `hex_fortress`; `/winterworks hexfortress` builds one.

## Piglins, hoglins and the Withered Commander (the Nether)
* **Brutes love the elixirs too**: piglin brutes want the Elixir of Greed and the Cursed Elixir like piglins do
  (they go after them, admire, fight for Greed, drink).
* **Turning to gold sooner**: a piglin or brute that drinks the Cursed Elixir starts gilding at once (the golden
  shimmer spreads over 20 s) and then **becomes a Golden Piglin** (a brute becomes a golden brute-sized Golden Piglin
  with a gilded axe). Golden Piglins also turn up more often (1 in 15 piglin spawns, up from 1 in 40).
* **Hoglin jockeys**: adult piglins ride adult hoglins (crimson forests, bastions, Hex Fortresses); piglins keep and use
  hoglins far more: they ride them into fights, and herd them in pens at bastions and Hex Fortresses.
* **Wither skeletons ride the unarmoured Soul Bulls** (as above).
* **The Withered Commander** (`withered_commander`, a new mob): a mini-boss of vanilla **Nether fortresses** (one per
  fortress, on a bridge crossing or courtyard), a towering wither skeleton officer in cool blackened-netherite armour
  (spiked pauldrons, a crested helm, a torn banner cape) wielding a **netherite spear**, riding an unarmoured Soul Bull.
  * Very strong: 150 health, armour 12, a boss bar; spear **lunges** (long reach, knockback, Wither II), a **sweeping
    spin**, and a **war cry** that rallies wither skeletons and blazes nearby (Strength I). Charges on its bull.
  * **When its bull dies it fights on** on foot (faster, angrier).
  * Drops 1-3 **Ancient Debris**, its spear sometimes (a usable `netherite_spear`: long-reach melee weapon, thrust
    attack), wither bones and XP 150.
  * Model `withered_commander` (bones `body`, `head`, `helm`, `cape`, `arm_l`, `arm_r`, `spear` (in `arm_r`),
    `leg_l`, `leg_r`, `pauldron_l`, `pauldron_r`; clips `idle`, `walk`, `ride`, `lunge` (0.8 s), `spin` (1.2 s),
    `war_cry` (1.5 s), `death` (1.5 s)); item model `netherite_spear` (3D in hand and GUI).
