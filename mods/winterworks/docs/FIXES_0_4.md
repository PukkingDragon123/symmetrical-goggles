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
  new `eat` clip. It is far more hostile when its cubs are near: it charges players who come within 10 blocks of a cub.
* **Potion of Ramming**: when you reach top speed you get a battle cry (sound), a burst of snow and wind particles,
  speed lines on screen, a new running pose (leaning forward, arms swept back) and a further speed boost.

## The Winter Express
* The **Trailer Cart** is removed. **Normal minecarts** (and chest/hopper/furnace minecarts) couple to locomotives
  and to each other the way the trailer did, and get pulled.
* **Coaster Rails** become full 3D track pieces (new models) that can be placed **floating**, with nothing under
  them, and still carry carts (straight, ascending, corners).

## Curses (Hexes & Havoc)
* **No trigger text** any more. Every curse instead plays a longer, stronger screen effect when it triggers, like
  Sloth's nod-off: its own colour, vignette, distortion and sound, a few seconds long.
* Tooltips show just the curse name: no description lines.
