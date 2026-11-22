# Winterworks

A winter contraptions mod for Minecraft Java 1.21.1 (Fabric). **Download and play:** the ready-made jar and
CurseForge install steps are in [dist/](dist/README.md). Every model, texture and animation is made with
[lowpix](../../README.md) and exported with `python -m lowpix mc export` (docs/MINECRAFT.md).

## Content

**Snowball Launcher.** A homemade rapid-fire snowball gatling of iron, redstone and a blaze rod. Hold use to fire packed
snowballs that briefly stun (dizzy stars). Sneak + use switches to cobblestone balls, which charge for a second and hit
hard with recoil. There is no HUD: the hopper on top is the magazine. You can see the 6 snowballs (or 3 cobble balls)
in it; firing pops them off the top, they drop back in one at a time when you stop, and an empty hopper still fires
from your pockets at half rate. Swapping ammo tips the hopper back, throws the old load out (into your inventory) and
drops the new one in. Heat shows on the gun: the gauge needle climbs, the vent opens, the barrels glow orange then
red-hot, the muzzle smokes, and at 100 it overheats, judders and vents steam until it cools.
Recipe: redstone, hopper, redstone / iron, dispenser, iron / iron, blaze rod, iron.

**Icebreaker.** A huge, fat, monstrous seal of frozen rivers, plains and coasts: a long segmented body, a shaggy fur mane,
ice-armour shards on its back, great curved ice tusks, a jagged ice horn and big fins, in six coats (grey, harbour,
leopard, ringed, brown, frost) picked by biome and inherited by cubs. Its face is expressive: blinking lids, heavy
brows that knit when it's angry, flaring nostrils, a bark on every grunt. About one adult in twelve is an
**Alpha**: 30% bigger, +60 health and +5 attack, a full horn, a great lion's mane of fur with a beard and chest ruff,
and a near-black grizzled coat covered in old scars (one runs across its eye). **Cubs** are fluffy white pups built
like little Icebreakers: the same segmented body, a fur ruff and crest, big dark eyes, ice buds for a horn and tusks.
It charges into ice to break holes, guards its fluffy white cubs (it rears up, drums its belly, bellows and
charges players who come near them), and is calmed by fish: drop some or feed it. Animations: idle, waddling walk with a
spring-driven belly wobble, belly slide on ice, hip-driven swimming, charge, ram, belly slap, tail slap, happy chomp.
Its horn grows back in four stages, faster in the cold, faster still while freezing, fastest when it is stuck in
powdered snow (freezing doesn't hurt it).

**Heavy Shears.** Shears + 2 iron blocks + 2 diamonds. Cut a whole connected canopy of leaves at once (sneak to cut one),
get 1-3 extra wool per sheep, and take an Icebreaker's horn (stage 2 or more).

**Potion of Ramming.** Awkward potion + Icebreaker horn (redstone: longer, glowstone: stronger). Sprint for 3 seconds
to charge, then ram: mobs in front take damage and huge knockback, and blocks TNT could break (blast resistance up to 6)
break in a straight line at feet and head height. Limits: 2 blocks a tick, 24 a ram, no block entities, nothing
unbreakable, respects spawn protection, adventure mode and land-claim mods (block-break events).

**Winter Express.** Coaster rails are 3D roller-coaster track (keep momentum, faster, dive down slopes) that hang in
mid-air with nothing under them, straight, sloped or curved. Booster rails run only on a **redstone block** (beside the
rail or under it; levers, torches and dust do nothing): then they push 3x as hard as a powered rail, up to 3x the vanilla
speed limit; unpowered, they brake. Chain lift rails haul carts uphill, faster when powered. The **Coaster Loop**
(8 coaster rails round an iron block) is a full vertical loop of track, radius 3, rising from where you place it in line
with coaster rails: a cart that comes in at about 0.8 blocks a tick (off boosters) rides all the way round, upside down
at the top with its rider (the view turns with you), and leaves at the speed it came in; a slower one rolls back out.
Whole trains loop car after car. The **Switch Rail** (6 iron + a rail + a redstone torch -> 2) is a Y-junction: place it
facing the fork (its branch goes toward a rail already beside it, else to the half of the block you click); unpowered,
carts run straight on, powered they take the branch, and a train's cars all follow its first car's route. Rails are
cheaper: the vanilla rail recipe gives 32, powered rails 12. Paint rail sleepers with any dye (a sponge washes it off).
**Trap Rail** (redstone): while powered, its jaws clamp any cart and hold it still; cut the power and it lets go with a
launch. Use it for coaster stations, brakes and launches. **Drop Rail** (redstone): it hangs in mid-air without
support; power it and it springs open like a trapdoor, so the cart falls to the track below (coaster drops, trap pits).
It closes again a moment after the power goes.
Couple any minecarts into trains with a chain (click the front cart, then the one behind; sneak + click with an empty
hand to uncouple). The Iron Locomotive and the Dragon-Head Locomotive burn coal, from your hand or from a chest
minecart coupled behind them, or run on a **furnace minecart** coupled into the train while it burns (stoke it with coal
or charcoal as usual; a stopped train sets off); sneak + right-click cycles stop / forward / reverse; longer trains are
heavier and slower. A burning furnace minecart also pulls a train of minecarts on its own. Fox and zombie carts; any
vanilla minecart (plain, chest, hopper, furnace, TNT) couples into a train too. Right-click carts with dye to paint the
trim and with wool to change the seat.

**Snow Globe.** Glass + snowballs. Right-click to shake it: it wobbles and tiny flakes swirl around the little snowy
cabin, then slowly settle.

## The Cold Zone

Design contract: [docs/COLD_UPDATE.md](docs/COLD_UPDATE.md).

**The cold.** Ice Caves, cold water and snowstorms freeze you: the vanilla frost overlay, slowdown and freeze damage, no
new HUD. Fires, lava, lit furnaces, and torches or lanterns nearby or in your hand keep you warm; any leather or fur
armour stops the freezing. You see your breath in the cold, and blizzards drive the snow sideways. **Frostbite**
(ancient ice, frost attacks) freezes fast and bites.

**Ice Caves.** A new underground biome under every frozen land: packed and blue ice walls, snow floors with powder-snow
traps, icicles, frozen pools, a wind loop and creaking ice. Frost Zombies, Strays and Zombie Polar Bears live there.

**Polar bears, remade.** Hostile, heavier and furrier: they roar, swipe and charge-jump with a landing slam. A player
holding salmon is spared; five salmon calm one for 5 minutes, and a calm bear can be shorn for **Polar Bear Fur** (it
grows back). They carry fish in their mouths and catch fish at the water's edge. Frost Zombies and Strays ride them.
**Frost Zombies** freeze you with every hit; **Zombie Polar Bears** are always hostile.

**Fur armour.** Polar Bear Fur + wool: a bear-head hood, a mantle with the bear's forepaws, fur trousers and boots, in 3D.
No freezing, no Slowness or Frostbite, and Strength in the cold (I, II with 3 pieces, III for the set). Too hot for the
Nether: it hurts there.

**The Frost Mauler.** A monstrous sabertooth, half skeleton, with ice crystals on its back and ice-blue flames in its
eyes, frozen in see-through **Ancient Ice** inside a frozen tomb in the Ice Caves. Ancient ice is hard to mine (an axe
is fastest), gives Frostbite when touched and bursts when broken. Break 6 blocks of the tomb and the cave shakes, the
ice cracks and explodes, and the Mauler wakes and roars. It fights with a claw-claw-bite combo that starts fast, slows
as it tires and ends with it panting and vulnerable; telegraphed icicle rain; hurled icicles; roars that knock you
back and bring icicles down; a pouncing flurry of fang bites (block them with a shield). It drops its **skull** (3D;
encase it in ancient ice and use a Nether Star to bring the Mauler back), **2 fangs**, bones and ancient ice.

**Fang Daggers.** Fang + Polar Bear Fur + stick. Hold one in each hand: a frenzy of fast hits that slows as you tire and
recharges when you stop; tired, a jumping hit is a **Fang Crit** (2x, Frostbite). Sneak + jump to **pounce** forward
through everything in your way.

## The Amber Age

Design contract: [docs/AMBER_UPDATE.md](docs/AMBER_UPDATE.md).

**Archaeology everywhere.** Every overworld cave has plenty of suspicious sand and gravel holding amber or bones, and
**amber sand** and **amber gravel** (brush them for amber shards, now and then a whole block of amber). Sherds are rare
finds. **Dead Caves**,
a new underground biome found only under the badlands, are a fossil desert that was a prehistoric forest:
banded sandstone walls with amber seams, petrified trunks and stumps, boulders, dead bushes and lots of suspicious
blocks. **Dig Sites** (Dead Caves and wherever mineshafts can be) are abandoned excavations: a shored-up cavern, a pit
with a half-dug fossil skeleton, scaffolding, a ruined shack, a tent, and chests and barrels of loot.

**Amber.** Amber is see-through, honey-coloured and cloudy, and what is trapped inside (a mosquito, a seed) is a full 3D
model. Mine it with **Silk Touch** to keep it whole, inclusion and all; otherwise it shatters into 2-4 **amber shards**
and whatever was inside gets out: a live mosquito, or an Amberwood Bloom. 9 shards make a block of amber again.
Brush **amber fossils** for **Amberwood Blooms**, the tree's sapling: plant one on sand, red sand, terracotta, dirt or
grass and it grows (bone meal helps) into an **Amberwood**: a tall, ribbed, cactus-like trunk with a few arms, crowned
with blooms; its trunk oozes resin. Amberwood is a full wood set: wood, stripped logs and wood, planks, stairs, slabs,
fences and gates, doors, trapdoors, buttons, pressure plates, signs, hanging signs and boats.

**Mosquitoes.** Four-winged, with a giant needle. They hunt anything with blood (not the undead, golems, slimes and
the like), drink, and swell red; bottle that blood. Amber-full ones (they sip Amberwood resin) spit an amber shard
when you give them blood (a potion, a blood stain, a splash): an amber farm. A hungry mosquito near an oozing
Amberwood goes for the resin before it goes for you. Pitcher pods and pitcher plants attract them, and they pollinate
pitcher crops; **torchflowers** burn them (a mosquito that comes within a block of one, planted, potted or still a
crop, catches fire), so they keep well away. **Potion of Blood** + torchflower = **Potion of Immunity**: no other
effect can touch you.

**Torchflowers and pitcher plants glow.** Every growth stage gives a little more light (a grown torchflower shines like
a torch, a pitcher plant at 12) and their flame petals and pitchers are drawn full-bright, from the game's own
textures. Use a grown one with an empty hand to pick it: 1-3 seeds or pods drop and it goes back to a young crop.
Pitcher plants give off a sweet scent and count as flowers for bees.

**Sniffers.** Tame one with pitcher pods: it follows you, sniffs out suspicious sand, gravel and amber fossils and digs
them up for you; sniffer digging also turns up amber, Amberwood Blooms, bones and (rarely) sherds. About once a minute
a tamed sniffer with water nearby drinks, walks over to the farmland by you and **sneezes** a spray over it: the
farmland gets fully moist and the crops grow a stage.

**The Harvester.** A big, gentle, extinct herbivore with a hammerhead of a head lined with cropping teeth. Its eggs are
super rare: brushed out of suspicious sand and gravel, or sealed in the amber of Dig Sites. An egg only develops
underwater (about 20 minutes, faster on moss) and hatches a baby that is tame to whoever is nearby; wild ones are tamed
with pitcher plants. Saddle it and ride it (it jumps 1.5 blocks), give it a chest (15 slots), sneak + use to make it
follow, sit or harvest. Get off it by your farm and it crops everything ripe within 16 blocks (wheat, carrots,
potatoes, beetroots, nether wart, melons, pumpkins, sweet berries, torchflowers, pitcher plants) a whole head-wide
mouthful at a time, replants it and puts the harvest in its chest. Ridden, its head shoves animals along ahead of it:
herd them into a pen.

**The Pot Golem.** Four amber blocks in a T and a decorated pot on top (any way round, in any order, like an iron
golem): a muscular, jelly-like amber golem that follows you and fights. Its pot is its head, and a pot with the same
sherd on all four faces gives it a power, its pattern glowing while it works: Howl rallies wolves, Danger blows itself
up when almost dead, Heart heals you and your pets, Burn has fiery fists and keeps you fireproof, Flow blasts foes away
with a gust, Shelter shields you and swats arrows aimed at you, Plenty vacuums up loot into a 27-slot pot (empty hand
to open), Brewer throws Healing at you and Weakness or Slowness at foes. An Echo Shard inside gives a Warden-like
sonic beam. Give it a Blade, Miner or Archer sherd for a blade arm, a pickaxe that mines ores for you, or a bow. The
pot is its weak spot: hits crack it, and a headshot does double damage and always cracks it (repair it with a sherd or
a brick). Brush it and it giggles and sneezes the pot off, showing its dumb little face.

## Hexes & Havoc

Design contract: [docs/HEXES_UPDATE.md](docs/HEXES_UPDATE.md).

**The Hex Fortress.** A living Nether fortress round a courtyard: nether-brick halls, towers and bridges, Nether Wart
farms on soul sand, brewing rooms with brewing stands and Elixir Jars over soul fire, storerooms with chests, soul-fire
braziers, a working Nether Portal, a few Piglins, a Golden Piglin in its vault, and the quarters of the one and only
**Piglin Witch**.

**The Piglin Witch.** An old, fat, half-zombified Piglin crone under a towering patched backpack. She stumbles about
drunk, hiccups, swigs from her flask and rummages in her pack. She shakes her head and burps at you until you give
her an **Elixir of Greed**; she drinks it, cackles, and trades for good. She sells the **Hex Core** (3 gold blocks
and 16 Soul Elixir), elixir bottles, soul sand, wart, ghast tears and crying obsidian, and pays gold for souls.

**Elixirs.** Craft an **Elixir Bottle** from 4 gold ingots and a bottle. The lantern-sized **Elixir Jar** brews only
over heat (fire, soul fire, a campfire, lava or magma): soul sand makes **Soul Elixir** (the Hexing Table's fuel), a
Potion of Blood poured in and then a gold block make **Elixir of Greed** (drop it near Piglins and they fight to the
death for it), and soul sand in a jar of Greed makes **Cursed Elixir** (a Piglin that drinks it turns golden and never
zombifies).

**The Soul Tank and the Hexing Table.** A Soul Tank holds 1000 souls: mobs that die within 8 blocks drift in (10
each), and Soul Elixir adds 50. The **Hexing Table** (netherite, an enchanting table, the Hex Core, crying obsidian)
needs a tank within 3 blocks. Its soul-blue screen is written in cursed glyphs that resolve into words when you hover.
Put an enchanted book and Soul Elixir in it and press the HEX rune:
* **Lesser hex**: every enchantment +1 level (up to VI; anvils keep it) and one lesser curse. 1 elixir, 100 souls.
* **Sin hex**: Fire Aspect, Fortune, Looting, Mending, Efficiency, Thorns or Protection becomes its Deadly Sin.
  3 elixir, 300 souls.
* Any hex has a 15% chance of a **hidden curse** that shows as scrambled text until it strikes.

Hexing leaves you **Hexed** for 5, 10 or 20 minutes: no natural regeneration, so you heal only with potions. You keep
all your hearts. **Blood instead of yourself**: a lesser hex takes a Potion of Blood from the table's blood slot instead
of hexing you; a sin hex always needs one, and takes three instead of hexing you.

Potions of Blood are a base potion too: with a fermented spider eye they brew Harming, with a ghast tear Regeneration.
Awkward potions brew **Burning** with a torchflower (you burn for the whole time, and water won't put you out) and
**Decay** with a Wither Bone (Wither); every mod potion comes as drink, splash, lingering and tipped arrows.

**Curses.** Narcissus (stare at water and waste away), Icarus (fly too high in the sun and burn), Midas (your food
turns to gold), Orpheus (look back and your pet is dragged under), Sisyphus (mined blocks come back), Tantalus
(food rolls out of your hand), the Moth (drawn to light at night, even lava). Hidden: Cain (you wound your own pets),
Judas (trades turn iron golems on you), Lot's Wife (look back while fleeing and turn to stone), the Leech (one hit in
five heals). Curses never say what they do: each one plays its own few seconds of screen effect when it strikes. Cursed
books look cursed, and anything carrying a curse glints with drifting souls instead of the purple shimmer.

**The Seven Deadly Sins.** Each is a big power with a brutal curse. Wrath: blue soul fire, and strength while you keep
hitting, weakness when you stop. Greed: huge ore and gold drops, but every Piglin hunts you and dropped items vanish.
Lust: far more loot, but twice the hostile spawns, all coming for you, and neutral mobs turn on you. Gluttony: food
repairs your gear, but hunger drains three times as fast. Sloth: instant mining, but you are always slow and nod
off. Envy: attackers burn and you steal their buffs, but stronger foes hit you 50% harder. Pride: huge protection
above half health, none below it, and triple fall damage.

**The Golden Piglin.** A Piglin turned to solid gold: painfully slow, stiff, groaning. Other Piglins kill it for its
gold (2-4 gold blocks); it barters much better loot.

## Building and testing

```bash
./gradlew build                 # the mod jar in build/libs
./gradlew runGametest           # headless GameTests (126)
xvfb-run -a ./gradlew runShowcase       # boots the client, builds scenes, saves in-game screenshots to run/showcase/screenshots
xvfb-run -a ./gradlew runShowcase -PshowcaseMode=hex   # only the Amber Age and Hexes & Havoc scenes
xvfb-run -a ./gradlew runShowcaseCold   # a real generated world: finds and photographs Ice Caves, a frozen tomb, Dead Caves, a Dig Site
JAVA_TOOL_OPTIONS=-Dwinterworks.harvestershots=all xvfb-run -a ./gradlew runClient   # the Harvester, glowing plants, mosquitoes, the sneezing sniffer: run/client/screenshots
python3 tools/gen_data.py       # regenerate sounds, models, blockstates, recipes, loot, tags, lang fragments
```

Model sources live in `examples/src/` at the repo root (icebreaker, icebreaker_cub, snowball_launcher, snow_globe,
locomotive, dragon_locomotive, fox_cart, zombie_cart, frost_mauler, frost_mauler_skull, fang_dagger, polar_bear,
polar_bear_cub, fur_armor, mosquito, pot_golem, piglin_witch, golden_piglin, elixir_jar, soul_tank, hexing_table, hex_core); 2D art in `examples/src/winterworks_art.py`, `winterworks_cold_art.py` and
`winterworks_amber_art.py` and `winterworks_hex_art.py`. Sounds (97 events) are made from CC0 / public-domain recordings by
`tools/sounds/build_sounds.py`; every source is credited in [tools/sounds/CREDITS.md](tools/sounds/CREDITS.md).

## In game

Screenshots taken by `runShowcase` (the real client, software-rendered):

| | |
|---|---|
| ![Icebreaker family](docs/screenshots/icebreaker_family.png) | ![Icebreaker close](docs/screenshots/icebreaker_close.png) |
| ![Winter Express](docs/screenshots/winter_express_running.png) | ![Snow Globe](docs/screenshots/snow_globe_swirl.png) |
| ![Launcher firing](docs/screenshots/launcher_firing.png) | ![Launcher magazine](docs/screenshots/launcher_magazine.png) |
| ![Trap and Drop Rails](docs/screenshots/trap_and_drop_rails.png) | ![Ice Caves](docs/screenshots/ice_caves.png) |
| ![Frost Mauler](docs/screenshots/frost_mauler_close.png) | ![Frozen tomb](docs/screenshots/frozen_tomb.png) |
| ![The Mauler awakens](docs/screenshots/mauler_awakens.png) | ![Fang Daggers and the skull](docs/screenshots/fang_daggers_and_skull.png) |
| ![Polar bears](docs/screenshots/polar_bears.png) | ![Fur armour](docs/screenshots/fur_armour.png) |
| ![Dig Site in the Dead Caves](docs/screenshots/dig_site_natural.png) | ![Dead Caves](docs/screenshots/dead_caves.png) |
| ![Amber and mosquitoes](docs/screenshots/amber_and_mosquitoes.png) | ![Mosquitoes](docs/screenshots/mosquitoes_close.png) |
| ![Pot Golems](docs/screenshots/pot_golems.png) | ![Potless Pot Golem](docs/screenshots/pot_golem_potless.png) |
| ![Amberwood](docs/screenshots/amberwood.png) | ![Hex Fortress](docs/screenshots/hex_fortress.png) |
| ![Piglin Witch and Golden Piglin](docs/screenshots/piglin_witch_and_golden_piglin.png) | ![Piglin Witch](docs/screenshots/piglin_witch_close.png) |
| ![The witch's quarters](docs/screenshots/hex_fortress_witch.png) | ![Hexing Table, Soul Tank, Elixir Jars](docs/screenshots/hexing_table.png) |
| ![Elixir Jars: Cursed brewing, Greed, Soul](docs/screenshots/elixir_jars.png) | ![The Hexing screen](docs/screenshots/hexing_screen.png) |
| ![Hexed Books, elixirs, the Hex Core, 3D icons](docs/screenshots/hex_hotbar.png) | |
| ![A Harvester cropping a farm](docs/screenshots/harvester_cropping.png) | ![Its chest full of the harvest](docs/screenshots/harvester_chest_harvest.png) |
| ![Ridden, saddled](docs/screenshots/harvester_ridden.png) | ![Herding sheep](docs/screenshots/harvester_herding.png) |
| ![Harvester eggs underwater](docs/screenshots/harvester_eggs_underwater.png) | ![A Harvester hatching](docs/screenshots/harvester_egg_hatching.png) |
| ![Glowing torchflowers and pitcher plants](docs/screenshots/amber_plants_glow_close.png) | ![A mosquito burnt by a torchflower](docs/screenshots/amber_mosquito_torchflower_burning.png) |
| ![A mosquito sipping Amberwood resin](docs/screenshots/amber_mosquito_resin.png) | ![A sniffer sneezing over crops](docs/screenshots/amber_sniffer_sneeze.png) |
