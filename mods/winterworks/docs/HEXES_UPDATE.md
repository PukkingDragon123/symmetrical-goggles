# Winterworks: Hexes & Havoc (design contract)

Curses reinvented: souls, gold, greed, brewing and Netherite. Same rules as COLD_UPDATE.md: ids, bone and clip
names here are exact. Java packages: `hex/` (Elixir Jar, elixirs, Soul Tank, Hexing Table, Hexed Books, Hexed),
`curse/` (all curse and sin behaviour), `nether/` (Piglin Witch, Golden Piglin, piglin greed, the Hex Fortress).
Vanilla look, polished personality. No extra features beyond this file.

## 1. Elixirs and the Elixir Jar
* `elixir_bottle` (empty): 4 gold ingots round a glass bottle -> 1. Expensive on purpose.
* `elixir_jar`: a lantern-sized brass-and-glass jar (block entity). It brews only over heat (fire, soul fire,
  campfires, lava, magma below it). Use an ingredient on it and it bubbles for 10 s:
  * soul sand -> **Soul Elixir** x3 (pale soul-blue; the Hexing Table's fuel, like lapis);
  * a gold block -> **Elixir of Greed** x3 (molten gold);
  * soul sand added to a full jar of Greed -> **Cursed Elixir** x3 (gold bound with souls).
  Use an `elixir_bottle` on it to fill one dose. The liquid colour and level show in the jar.
* `soul_elixir`, `elixir_of_greed`, `cursed_elixir`: items (stack 16).
  * Elixir of Greed: drop it (or hold it out) near Piglins and they fight each other to the death for it; the
    winner drinks it. Give it to the Piglin Witch to open her trades.
  * Cursed Elixir: every Piglin wants it (they walk to it and admire it like gold); a Piglin that drinks it (use it
    on one, or it picks one up) gets the `golden` effect, permanent: immune to zombification, a golden shimmer.

## 2. The Soul Tank and the Hexing Table
* `soul_tank`: a block, a reinforced glass tank of souls, 1000 souls max. Fills when mobs die within 8 blocks
  (10 souls each, their souls drift into it) and from Soul Elixir used on it (+50). Swirling souls, fill gauge.
* `hex_core`: a cursed animated hexagon of dark netherite and gold filled with swirling souls (3D item, soul
  particles). Only from the Piglin Witch.
* `hexing_table`: 4 netherite ingots, an enchanting table, the hex core, 2 netherite blocks, 2 crying obsidian
  (shaped, very expensive). Must have a Soul Tank within 3 blocks. A floating hexed book and soul flames.
* **The Hexing screen**: soul-fire blue, unreadable cursed glyph text, souls swirling; slots: an enchanted book and
  Soul Elixir (1-3); shows the tank's souls, the hex's power, the upgraded enchantments and the attached curse
  (written in cursed glyphs that resolve into words as you hover), and a big animated HEX rune button.
* Hexing an enchanted book makes a `hexed_book`:
  * **Lesser hex** (any book): every enchantment +1 level (up to VI; max-level-1 enchantments don't upgrade) and one
    **lesser curse** (random). Costs 1 Soul Elixir, 100 souls, `hexed` for 5 min (10 min if anything reaches V-VI).
  * **Sin hex** (a book holding one of the seven sin sources, see 4): that enchantment becomes its **sin
    enchantment**. Costs 3 Soul Elixir, 300 souls, `hexed` for 20 min.
  * Any hex has a 15% chance to add a **hidden curse** too.
* Anvils accept hexed levels above vanilla's maximum (up to VI).
* `hexed` effect: no natural regeneration from food; you heal only from potions (and potion-like effects). No
  heart loss. 5 / 10 / 20 minutes.
* Hexed Books have their own animated textures: lesser (soul blue runes), sin (crimson and gold, a sin sigil),
  hidden (black, flickering). The curse names show in the tooltip; hidden curses show as obfuscated text until you
  have triggered them once.

## 3. Lesser curses (rare, poetic, specific; plus vanilla Binding and Vanishing)
1. **Curse of Narcissus** (helmet): stare at water for 10 s and you are transfixed: you can't move or turn away
   and you waste away (1 damage every 2 s) until you die or something else hurts you.
2. **Curse of Icarus** (chestplate/elytra): above y=160 in daylight under open sky, your elytra burns away
   (durability melts) and you catch fire.
3. **Curse of Midas** (any): food in your hands sometimes turns to gold nuggets before you can eat it.
4. **Curse of Orpheus** (any armour): turn round sharply while a pet follows you and it is dragged back to the
   underworld: it sinks into the ground and reappears at your spawn point.
5. **Curse of Sisyphus** (tools): blocks you mine sometimes come back a few seconds later.
6. **Curse of Tantalus** (any): food sometimes slips out of your hand and rolls away as you eat.
7. **Curse of the Moth** (any): at night you are drawn to the nearest light source within 12 blocks, even lava.

## 4. The Seven Deadly Sins (sin enchantments; each is the power and the major curse in one)
| sin | from | power | curse |
|---|---|---|---|
| **Wrath** | Fire Aspect | sets enemies alight with soul fire (8 s, stronger) | not dealing damage for 5 s: Slowness and Weakness that build; dealing damage: Strength that builds |
| **Greed** | Fortune | ores and gold drop much more (Fortune +2 and gold nuggets) | all Piglins hunt you whatever you wear; items you drop vanish |
| **Lust** | Looting | mobs drop far more loot | hostile mobs spawn twice as much round you and go for you; neutral mobs turn aggressive |
| **Gluttony** | Mending | repairs from food you eat as well as XP | hunger drains three times as fast; starving hurts twice as much |
| **Sloth** | Efficiency | mines almost instantly | you're always slow, and now and then you nod off (blind and frozen 3 s) |
| **Envy** | Thorns | attackers take your damage back as soul fire and you steal their buffs | you take 50% more damage from anything with more health than you |
| **Pride** | Protection | huge damage reduction while above half health | below half health the protection vanishes; fall damage x3 |

## 5. Hidden curses (not listed anywhere in game until discovered)
* **Curse of Cain**: your hits wound your own pets near you (it will kill them).
* **Curse of Judas**: every trade makes the nearest iron golem turn on you.
* **Curse of Lot's Wife**: look back while fleeing (hurt in the last 3 s and turning round) and you turn to stone
  (frozen 4 s).
* **Curse of the Leech**: one hit in five heals your target instead.

## 6. The Piglin Witch (`piglin_witch`)
* One per Hex Fortress (spawned with it, persistent). An old, fat Piglin crone, half her body zombified, an old
  drunkard with a huge, very old patched backpack (pots, bottles, bones, a lantern hanging off it).
* Neutral. Stumbles about drunk, hiccups, drinks from a flask, pulls random things out of her backpack and looks at
  them. Hurt, she drinks healing and throws harmful potions.
* Refuses to trade (shakes her head, burps) until you give her an Elixir of Greed: she drinks it, cackles, and her
  trades open for good (vanilla merchant screen): Hex Core (3 gold blocks + 16 Soul Elixir), elixir bottles,
  soul sand, nether wart, ghast tears, crying obsidian; she pays in gold for souls (Soul Elixir).
* Bones: `body`, `belly`, `head`, `snout`, `jaw`, `ear_l`, `ear_r`, `arm_l`, `arm_r`, `hand_r` (item locator),
  `leg_l`, `leg_r`, `backpack`, `backpack_lid`. Parts `zombie_*` are the rotten half. Clips: `idle`, `walk`
  (stumbling), `drink` (1.6 s), `hiccup` (0.6 s), `rummage` (2.0 s), `refuse` (1.2 s), `cackle` (1.5 s), `throw`
  (0.8 s), `trade` (loop).

## 7. The Golden Piglin (`golden_piglin`)
* A Piglin whose whole body has turned to solid gold. Extremely slow (speed 0.06), stiff and janky, always in pain
  (groans, creaks). Spawns rarely among Piglins (1 in 40) and in Hex Fortresses.
* Other Piglins attack it for its gold. Killed, it drops 2-4 gold blocks. It barters like a Piglin, with much
  better loot (`winterworks:gameplay/golden_piglin_bartering`).
* Bones like the vanilla piglin (`body`, `head`, `ear_l`, `ear_r`, `arm_l`, `arm_r`, `leg_l`, `leg_r`); clips
  `idle` (strained trembling), `walk` (stiff, janky), `barter` (2.0 s), `hurt_groan` (1.0 s).

## 8. The Hex Fortress (`hex_fortress`, the Nether)
* A complete, living Nether Fortress (not a bastion): nether brick halls, towers and bridges round a central
  courtyard; Nether Wart farms on soul sand; brewing rooms with brewing stands, cauldrons and Elixir Jars over soul
  fire; storerooms and chests (`winterworks:chests/hex_fortress`); the Piglin Witch's quarters with her stash;
  soul-fire braziers; and a working Nether Portal. One witch per fortress, a few Piglins and a Golden Piglin.
* Any Nether biome, spacing 32, separation 12. Built in several chunk-sized pieces (`nether.HexFortress`).

## 9. Ids
Blocks: `elixir_jar`, `soul_tank`, `hexing_table` (all with block entities). Items: `elixir_bottle`, `soul_elixir`,
`elixir_of_greed`, `cursed_elixir`, `hex_core`, `hexed_book`, `piglin_witch_spawn_egg`, `golden_piglin_spawn_egg`.
Entities: `piglin_witch`, `golden_piglin`. Effects: `hexed`, `golden`. Menu: `hexing_table`.
Enchantments (data-driven, `data/winterworks/enchantment/`): curses `narcissus`, `icarus`, `midas`, `orpheus`,
`sisyphus`, `tantalus`, `moth`, `cain`, `judas`, `lots_wife`, `leech` (all `#minecraft:curse`); sins `wrath`, `greed`,
`lust`, `gluttony`, `sloth`, `envy`, `pride`. Structure: `hex_fortress`.

## 10. Fixes in this update
* Amber blocks are see-through.
* Amberwood is a columnar, cactus-like tree (ribbed trunk, a few arms) crowned only with flowers
  (`amberwood_bloom` on top), detailed.
* Frost Mauler: a full skull head, frostbitten flesh, soul-like eyes with soul particles.
