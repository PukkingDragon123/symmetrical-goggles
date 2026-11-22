# Winterworks 0.4: fixes and remakes of earlier content

What the player asked for, made precise. Art (textures, lowpix models) is done by the art pass; this file is the
contract for the Java side.

## Amber
* **Amber blocks** need **Silk Touch**: with it they drop themselves (inclusion kept); without it they shatter into
  2-4 **Amber Shards** (`amber_shard`, new item) and release whatever was inside (a mosquito flies out, a seed
  inclusion drops an Amberwood Bloom). The **Amber Chunk** item is replaced by Amber Shards everywhere (recipes,
  loot, the mosquito amber farm, tags); 4 shards craft an amber block.
* The **Amber Fossil** stays; new texture (gravel with amber inside, vanilla suspicious-gravel style).
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
* **Potion of Ramming**: when you reach top speed you get a battle cry (sound), a burst of snow and wind particles,
  speed lines on screen, a new running pose (leaning forward, arms swept back) and a further speed boost.

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

## Torchflowers, pitcher plants, mosquitoes and sniffers (Amber Age)
* **Torchflowers burn mosquitoes**: a mosquito that touches or flies within 1 block of a torchflower (planted, potted
  or the crop) catches fire; mosquitoes avoid torchflowers.
* **Potion of Burning** (`burning`): awkward potion + torchflower. Whoever it touches burns for the duration, and water
  doesn't put them out (3:00 drink / splash / lingering / tipped arrows; redstone extends it). The existing Potion of
  Immunity recipe (blood + torchflower) stays.
* **Mosquitoes really harvest Amberwood**: empty mosquitoes find oozing Amberwood logs, sip the resin and become
  amber-full (fix: it doesn't happen today in game).
* **Torchflowers and pitcher plants glow**: new textures (vanilla style, 16 x 16) for the torchflower, its crop
  stages, the pitcher crop and plant, each crop stage glowing a little more (torchflower light 15 when grown, pitcher
  plant 12). Harvesting: use a grown torchflower or pitcher plant with an empty hand to pick it: torchflower seeds or
  pitcher pods (1-3) drop and it goes back to a young crop (like sweet berries). Breaking still works as in vanilla.
* **Pitcher plants attract bees** (they count as flowers for bees and pollination) and mosquitoes, and give off sweet
  golden-pink scent particles (`sweet_scent`).
* **Sniffers water crops**: a tamed sniffer with water within 12 blocks walks over, drinks, then finds farmland near
  its owner and **sneezes** a spray over it (a sneeze animation, splash particles, a sneeze sound): farmland in a 3-block
  radius becomes fully moist and crops there get a growth tick. About once a minute.

## The Harvester (a new dinosaur, Amber Age)
* `harvester`: a big, gentle prehistoric herbivore with a huge, wide **hammerhead-shark-like head** lined with rows of
  teeth for cropping plants. Found rarely in savannas, badlands and the Dead Caves' surface biomes (herds of 1-2), and
  hatched from nothing else.
* **Tame** it with pitcher plants (1 in 3 per plant). Tamed: follows, sits, can be **ridden with a saddle** (walks,
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
* **Blood instead of yourself**: the Hexing Table gets a third slot for Potions of Blood. A lesser hex can take 1
  Potion of Blood instead of hexing you; a sin hex always needs 1 Potion of Blood, and takes 2 more instead of hexing
  you. With no blood offered, you are Hexed as before.
