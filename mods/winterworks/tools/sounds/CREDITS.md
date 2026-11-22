# Winterworks sound credits

Every sound in `src/main/resources/assets/winterworks/sounds/` is made by `tools/sounds/build_sounds.py` from the recordings listed here (trimmed, layered, re-pitched, granulated, filtered, reverberated and normalised; see `tools/sounds/recipes.json`), plus procedural synthesis (numpy noise, tones, chimes, thumps, wind).
Only CC0 and public-domain sources are used, so the derived files can be shipped with the mod. None of them carries an attribution requirement or a no-AI / no-machine-learning clause; credit is given anyway, with thanks to the recordists.

Rebuild: `python3 mods/winterworks/tools/sounds/build_sounds.py fetch` then `... build` (downloads are checked against the sha256 in recipes.json).

## archive.org (Radio Aporee ::: Maps)

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Caleta Portales - Sea Lion](https://archive.org/details/aporee_37576_43021) (`ia_sealion`) | Felix Blume | Public Domain Mark 1.0 [1] | `entity.icebreaker.ambient`, `entity.icebreaker.death`, `entity.icebreaker.happy`, `entity.icebreaker.hurt`, `entity.icebreaker.roar` |
| [Fobney Island Nature Reserve Reading UK - Cracking Lake Ice](https://archive.org/details/aporee_52228_59621) (`ia_pond_ice`) | mike | Public Domain Mark 1.0 [2] | `ambient.ice_caves.mood`, `block.ancient_ice.crack`, `block.frost_mauler_skull.ignite`, `block.ice.crack`, `entity.frost_mauler.death`, `event.frozen_tomb.rumble` |
| [Klondike Park Lake Ice Booms, Augusta, Missouri](https://archive.org/details/aporee_51900_59267) (`ia_icebooms`) | Pierrot Desperes | Public Domain Mark 1.0 [3] | `ambient.ice_caves.additions`, `ambient.ice_caves.mood`, `block.ancient_ice.crack`, `entity.frost_mauler.death`, `event.frozen_tomb.rumble` |
| [Utena, Lietuva - Lake ice Andromeda](https://archive.org/details/aporee_55411_63316) (`ia_lake_ice_andromeda`) | miegantizeme | Public Domain Mark 1.0 [4] | `ambient.ice_caves.additions`, `ambient.ice_caves.mood`, `block.ancient_ice.crack`, `block.ice.crack` |

## bigsoundbank.com

| Source | Author | Licence | Used by |
|---|---|---|---|
| [1 pendulum chime](https://bigsoundbank.com/1-pendulum-chime-s3360.html) (`bsb_3360`) | Joseph Sardin & Axeline T. | CC0 1.0 | `block.eye_of_the_ocean.activate` |
| [A man sneezing](https://bigsoundbank.com/a-man-sneezing-s0609.html) (`bsb_0609`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.sneeze` |
| [A Mirror Explodes](https://bigsoundbank.com/mirror-explodes-s0387.html) (`bsb_0387`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.burst`, `block.frost_mauler_skull.revive`, `effect.petrified.shatter`, `entity.frost_mauler.explode`, `entity.frost_mauler.wake` |
| [Air](https://bigsoundbank.com/air-s0138.html) (`bsb_0138`) | Joseph Sardin | CC0 1.0 | `entity.gucker.spit`, `entity.whale.breathe`, `item.snowball_launcher.fire` |
| [An arrow on a target](https://bigsoundbank.com/an-arrow-on-a-target-s0548.html) (`bsb_0548`) | Joseph Sardin | CC0 1.0 | `entity.mosquito.stab` |
| [Anvil #1](https://bigsoundbank.com/anvil-1-s3589.html) (`bsb_3589`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.hurt`, `item.obsidian_shield.reflect`, `item.obsidian_shield.shockwave`, `item.snowball_launcher.overheat` |
| [Applause #3](https://bigsoundbank.com/applause-3-s1767.html) (`bsb_1767`) | Joseph Sardin | CC0 1.0 | `entity.monolith.clap` |
| [Apple crunched #1](https://bigsoundbank.com/apple-crunched-1-s1113.html) (`bsb_1113`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.eat` |
| [Apple crunched #2](https://bigsoundbank.com/apple-crunched-2-s1114.html) (`bsb_1114`) | Joseph Sardin | CC0 1.0 | `entity.whale.eat` |
| [Baby amused #1](https://bigsoundbank.com/baby-amused-1-s0231.html) (`bsb_0231`) | Joseph Sardin | CC0 1.0 | `entity.endling.ambient`, `entity.endling.happy`, `entity.endling.hurt`, `entity.endling.sacrifice` |
| [Balloon, inflation #1](https://bigsoundbank.com/balloon-inflation-1-s1129.html) (`bsb_1129`) | Joseph Sardin | CC0 1.0 | `entity.gucker.inflate` |
| [Balloon, inflation #2](https://bigsoundbank.com/balloon-inflation-2-s1130.html) (`bsb_1130`) | Joseph Sardin | CC0 1.0 | `entity.gucker.inflate` |
| [Bass Tom, #1](https://bigsoundbank.com/bass-tom-1-s2338.html) (`bsb_2338`) | Joseph Sardin | CC0 1.0 | `entity.whale.mouth_close` |
| [Bass tom, #4](https://bigsoundbank.com/bass-tom-4-s2341.html) (`bsb_2341`) | Joseph Sardin | CC0 1.0 | `entity.whale.mouth_close` |
| [Big Branching Fire #1](https://bigsoundbank.com/big-branching-fire-1-s0987.html) (`bsb_0987`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `block.meteorite.hum` |
| [Big broth in a pot](https://bigsoundbank.com/big-broth-in-a-pot-s0491.html) (`bsb_0491`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.bubble`, `entity.gucker.ambient` |
| [Big rope](https://bigsoundbank.com/big-rope-s3426.html) (`bsb_3426`) | Joseph Sardin & Axeline T. | CC0 1.0 | `ambient.whale_belly.loop`, `block.cannon.aim`, `entity.whale.shake` |
| [Blow hard #1](https://bigsoundbank.com/blow-hard-1-s1602.html) (`bsb_1602`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.breath`, `entity.frost_mauler.breath`, `entity.gucker.breathe`, `entity.whale.breathe` |
| [Blow Hard #2](https://bigsoundbank.com/blow-hard-2-s1603.html) (`bsb_1603`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.breath`, `entity.frost_mauler.breath`, `entity.gucker.breathe`, `entity.whale.breathe` |
| [Blowtorch](https://bigsoundbank.com/blowtorch-s0930.html) (`bsb_0930`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.breath`, `entity.ender_dragon.beam_fire`, `item.end_glider.boost`, `item.end_glider.jet` |
| [Body Fall #1](https://bigsoundbank.com/body-fall-1-s2452.html) (`bsb_2452`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.dragonling.death`, `entity.frost_mauler.step`, `entity.gucker.death`, `entity.gucker.step`, `entity.icebreaker.ram`, `entity.monolith.slam`, `entity.obolisk.slam`, `entity.piglin_witch.death`, `entity.polar_bear.slam`, `entity.pot_golem.step`, `entity.whale.hurt` |
| [Body Fall #2](https://bigsoundbank.com/body-fall-2-s2453.html) (`bsb_2453`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.step`, `entity.icebreaker.ram`, `entity.piglin_witch.death`, `entity.polar_bear.slam`, `entity.pot_golem.step` |
| [Body fall #3](https://bigsoundbank.com/body-fall-3-s2454.html) (`bsb_2454`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.step`, `entity.icebreaker.ram`, `entity.polar_bear.slam`, `entity.pot_golem.step` |
| [Body fall #4](https://bigsoundbank.com/body-fall-4-s2455.html) (`bsb_2455`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.step`, `entity.pot_golem.step` |
| [Boiling water](https://bigsoundbank.com/boiling-water-s0149.html) (`bsb_0149`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.bubble`, `block.hydrothermal_vent.loop` |
| [Bones cracking #1](https://bigsoundbank.com/bones-cracking-s0596.html) (`bsb_0596`) | Joseph Sardin | CC0 1.0 | `block.barnacles.break`, `effect.ramming.impact`, `entity.ender_dragon.grab`, `entity.frost_mauler.bite`, `entity.gucker.bite`, `entity.icebreaker.shear`, `entity.piglin_witch.rummage`, `entity.whale.eat` |
| [Bones cracking #2](https://bigsoundbank.com/bones-cracking-2-s1408.html) (`bsb_1408`) | Joseph Sardin | CC0 1.0 | `block.barnacles.break`, `effect.ramming.impact`, `entity.dragonling.eat`, `entity.frost_mauler.bite`, `entity.icebreaker.shear`, `entity.monolith.grab`, `entity.piglin_witch.rummage`, `entity.whale.eat`, `entity.zombie_polar_bear.death` |
| [Bones cracking #3](https://bigsoundbank.com/bones-cracking-3-s1409.html) (`bsb_1409`) | Joseph Sardin | CC0 1.0 | `block.barnacles.break`, `effect.ramming.impact`, `entity.frost_mauler.bite`, `entity.icebreaker.shear`, `entity.monolith.grab`, `entity.piglin_witch.rummage`, `entity.whale.eat`, `entity.zombie_polar_bear.death` |
| [Bottle clink](https://bigsoundbank.com/bottle-clink-s0487.html) (`bsb_0487`) | Joseph Sardin | CC0 1.0 [5] | `block.elixir_jar.fill`, `entity.piglin_witch.death`, `entity.piglin_witch.rummage` |
| [Boy 2-3 years old, tickling #2](https://bigsoundbank.com/boy-2-3-years-old-tickling-2-s1419.html) (`bsb_1419`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.giggle` |
| [Breath horse #3](https://bigsoundbank.com/breath-horse-3-s0287.html) (`bsb_0287`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.breath`, `entity.frost_mauler.stunned`, `entity.polar_bear.calm` |
| [Breath Horse #4](https://bigsoundbank.com/breath-horse-4-s1543.html) (`bsb_1543`) | Joseph Sardin | CC0 1.0 | `effect.ramming.charged`, `entity.frost_mauler.ambient`, `entity.frost_mauler.stunned`, `entity.gucker.breathe`, `entity.polar_bear.calm`, `entity.sniffer.tame`, `entity.whale.breathe` |
| [Breath of a horse #1](https://bigsoundbank.com/breath-of-a-horse-1-s0285.html) (`bsb_0285`) | Joseph Sardin | CC0 1.0 | `effect.ramming.charged`, `entity.frost_mauler.ambient`, `entity.frost_mauler.breath`, `entity.gucker.breathe`, `entity.piglin_witch.refuse`, `entity.polar_bear.calm`, `entity.sniffer.tame`, `entity.whale.breathe` |
| [Breath of a horse #2](https://bigsoundbank.com/breath-of-a-horse-2-s0286.html) (`bsb_0286`) | Joseph Sardin | CC0 1.0 | `effect.ramming.charged`, `entity.frost_mauler.breath`, `entity.frost_mauler.stunned`, `entity.gucker.breathe`, `entity.sniffer.tame` |
| [Breathless Man](https://bigsoundbank.com/breathless-man-s1103.html) (`bsb_1103`) | Joseph Sardin | CC0 1.0 | `entity.player.shiver` |
| [Brita jug flow](https://bigsoundbank.com/brita-jug-flow-s0592.html) (`bsb_0592`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.fill` |
| [Broken Christmas Ball #1](https://bigsoundbank.com/broken-christmas-ball-1-s1121.html) (`bsb_1121`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.burst`, `block.icicle.shatter` |
| [Broken glass](https://bigsoundbank.com/broken-glass-s0771.html) (`bsb_0771`) | Joseph Sardin | CC0 1.0 | `block.icicle.shatter` |
| [Broken Plate #1](https://bigsoundbank.com/broken-plate-1-s1643.html) (`bsb_1643`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break`, `effect.petrified.shatter`, `entity.pot_golem.death`, `entity.pot_golem.shatter` |
| [Broken plate #3](https://bigsoundbank.com/broken-plate-3-s1645.html) (`bsb_1645`) | Joseph Sardin | CC0 1.0 [6] | `block.barnacles.break`, `effect.petrified.shatter`, `entity.pot_golem.death`, `entity.pot_golem.shatter` |
| [Broken plate #4](https://bigsoundbank.com/broken-plate-4-s1646.html) (`bsb_1646`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.crack` |
| [Broken plate #5](https://bigsoundbank.com/broken-plate-5-s1647.html) (`bsb_1647`) | Joseph Sardin | CC0 1.0 | `effect.petrified.shatter`, `entity.pot_golem.shatter` |
| [Broken plate #6](https://bigsoundbank.com/broken-plate-6-s1648.html) (`bsb_1648`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.crack` |
| [Broken plate #8](https://bigsoundbank.com/broken-plate-8-s1650.html) (`bsb_1650`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.crack` |
| [Broken twigs #1](https://bigsoundbank.com/broken-twigs-1-s1299.html) (`bsb_1299`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.crack`, `block.chorus_cocoon.hatch`, `entity.dragonling.hatch`, `entity.gucker.bite`, `item.dragon_egg.crack` |
| [Broken twigs #2](https://bigsoundbank.com/broken-twigs-2-s1300.html) (`bsb_1300`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.crack`, `block.chorus_cocoon.hatch`, `entity.dragonling.hatch`, `entity.gucker.bite`, `item.dragon_egg.crack` |
| [Bubble wrap: Breakouts](https://bigsoundbank.com/bubble-wrap-breakouts-s0462.html) (`bsb_0462`) | Joseph Sardin | CC0 1.0 | `block.amber.release`, `block.end_bloom.open` |
| [Bubbles Burst](https://bigsoundbank.com/bubbles-burst-s1074.html) (`bsb_1074`) | Joseph Sardin | CC0 1.0 | `block.amber.release` |
| [Bulb bursting #1](https://bigsoundbank.com/bulb-bursting-1-s2039.html) (`bsb_2039`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.crit` |
| [Bulb bursting #3](https://bigsoundbank.com/bulb-bursting-3-s2041.html) (`bsb_2041`) | Joseph Sardin | CC0 1.0 | `block.icicle.shatter`, `item.elixir_of_greed.shatter`, `item.fang_dagger.crit` |
| [Bulb bursting #4](https://bigsoundbank.com/bulb-bursting-4-s2042.html) (`bsb_2042`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.crit` |
| [Bumblebee #2](https://bigsoundbank.com/bumblebee-2-s1001.html) (`bsb_1001`) | Joseph Sardin | CC0 1.0 | `entity.mosquito.buzz`, `entity.mosquito.death` |
| [Burp #3](https://bigsoundbank.com/burp-3-s1709.html) (`bsb_1709`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.burp` |
| [Burps](https://bigsoundbank.com/burps-s0242.html) (`bsb_0242`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.burp` |
| [Can that are crushed](https://bigsoundbank.com/can-that-are-crushed-s0118.html) (`bsb_0118`) | Joseph Sardin | CC0 1.0 | `entity.monolith.grab` |
| [Canvas bag on floor](https://bigsoundbank.com/canvas-bag-on-floor-s0576.html) (`bsb_0576`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.rummage`, `item.armor.equip_fur` |
| [Castanets (double)](https://bigsoundbank.com/castanets-double-s0921.html) (`bsb_0921`) | Joseph Sardin | CC0 1.0 | `entity.nautilus.death` |
| [Castanets (simple)](https://bigsoundbank.com/castanets-simple-s0922.html) (`bsb_0922`) | Joseph Sardin | CC0 1.0 | `entity.nautilus.hurt`, `item.turtle_shell.retreat` |
| [Cat roar #1](https://bigsoundbank.com/cat-roar-1-s1881.html) (`bsb_1881`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.death`, `entity.dragonling.hurt`, `entity.dragonling.roar` |
| [Cat roar #2](https://bigsoundbank.com/cat-roar-2-s1882.html) (`bsb_1882`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.death`, `entity.dragonling.hurt`, `entity.dragonling.roar` |
| [Champagne Cork #1](https://bigsoundbank.com/champagne-cork-s0211.html) (`bsb_0211`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.build` |
| [Champagne cork #2](https://bigsoundbank.com/champagne-cork-2-s0648.html) (`bsb_0648`) | Joseph Sardin | CC0 1.0 | `block.amber.release`, `entity.pot_golem.build` |
| [Chattering teeth #2](https://bigsoundbank.com/chattering-teeth-2-s2190.html) (`bsb_2190`) | Joseph Sardin | CC0 1.0 | `entity.player.shiver` |
| [Cheers, Champagne Flute #1](https://bigsoundbank.com/cheers-champagne-flute-1-s1335.html) (`bsb_1335`) | Joseph Sardin | CC0 1.0 | `effect.recall.teleport`, `entity.ender_dragon.crystal_regrow`, `entity.enderfly.teleport`, `item.fang_dagger.ready`, `item.obsidian_shield.reflect` |
| [Cheers, red wine glass #1](https://bigsoundbank.com/cheers-red-wine-glass-1-s1328.html) (`bsb_1328`) | Joseph Sardin | CC0 1.0 | `effect.recall.teleport`, `entity.ender_dragon.crystal_regrow`, `entity.enderfly.teleport`, `item.obsidian_shield.reflect` |
| [Chick 1 (Stuffings)](https://bigsoundbank.com/chick-1-stuffings-s0430.html) (`bsb_0430`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.ambient`, `entity.dragonling.death`, `entity.dragonling.eat`, `entity.dragonling.hatch`, `entity.dragonling.hurt`, `entity.dragonling.roar` |
| [Chick 2 (Stuffings)](https://bigsoundbank.com/chick-2-stuffings-s0431.html) (`bsb_0431`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.ambient`, `entity.dragonling.death`, `entity.dragonling.hatch`, `entity.dragonling.hurt` |
| [Chick that chirp](https://bigsoundbank.com/chick-that-chirp-s0672.html) (`bsb_0672`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.ambient`, `entity.dragonling.hurt`, `entity.dragonling.roar` |
| [Chimes "butterfly" #1](https://bigsoundbank.com/chimes-butterfly-1-s2087.html) (`bsb_2087`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake`, `entity.icebreaker.horn_regrow`, `entity.whale.tamed`, `item.nautilus_horn.bind` |
| [Chimes "butterfly" #2](https://bigsoundbank.com/chimes-butterfly-2-s2088.html) (`bsb_2088`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Chimes "Dream" #1](https://bigsoundbank.com/chimes-dream-1-s2079.html) (`bsb_2079`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake`, `entity.ender_dragon.crystal_regrow`, `entity.icebreaker.horn_regrow`, `entity.whale.tamed`, `item.nautilus_horn.bind` |
| [Clink of glass, Toast #1](https://bigsoundbank.com/clink-of-glass-toast-1-s2886.html) (`bsb_2886`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.ready` |
| [Coin in cup #1](https://bigsoundbank.com/coin-in-cup-1-s0339.html) (`bsb_0339`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.trade` |
| [Coins #1](https://bigsoundbank.com/coins-1-s0193.html) (`bsb_0193`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.death` |
| [Cow Moos #1](https://bigsoundbank.com/cow-moos-s0546.html) (`bsb_0546`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.roar` |
| [Cow moos #3](https://bigsoundbank.com/cow-moos-3-s2383.html) (`bsb_2383`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.roar` |
| [Cow moos #4](https://bigsoundbank.com/cow-moos-4-s2384.html) (`bsb_2384`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.roar` |
| [Cracking ice #1](https://bigsoundbank.com/cracking-ice-1-s2205.html) (`bsb_2205`) | Joseph Sardin | CC0 1.0 | `block.amber.release`, `block.ancient_ice.break`, `block.ancient_ice.hit`, `block.ice.crack`, `effect.petrified.encase`, `entity.frost_mauler.claw`, `entity.frost_zombie.hurt`, `entity.monolith.hurt`, `entity.obolisk.hurt`, `entity.pot_golem.crack`, `entity.pot_golem.death`, `item.dragon_egg.crack`, `item.monolith_wand.petrify` |
| [Cracking ice #2](https://bigsoundbank.com/cracking-ice-2-s2206.html) (`bsb_2206`) | Joseph Sardin | CC0 1.0 | `block.amber.release`, `block.ancient_ice.break`, `block.ice.crack`, `effect.petrified.encase`, `entity.monolith.hurt`, `entity.obolisk.hurt`, `entity.pot_golem.death`, `item.monolith_wand.petrify` |
| [Cracking ice #3](https://bigsoundbank.com/cracking-ice-3-s2207.html) (`bsb_2207`) | Joseph Sardin | CC0 1.0 | `block.amber.release`, `block.ancient_ice.break`, `block.ancient_ice.hit`, `block.ice.crack`, `effect.petrified.encase`, `entity.monolith.hurt`, `entity.obolisk.hurt`, `entity.pot_golem.crack`, `item.monolith_wand.petrify` |
| [Cracking ice #4](https://bigsoundbank.com/cracking-ice-4-s2208.html) (`bsb_2208`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.additions`, `block.ancient_ice.hit`, `block.ice.crack` |
| [Creaking Door #2](https://bigsoundbank.com/creaking-door-2-s3205.html) (`bsb_3205`) | Joseph Sardin & Axeline T. | CC0 1.0 | `entity.whale.mouth_open` |
| [Creaking Door #4](https://bigsoundbank.com/creaking-door-4-s3207.html) (`bsb_3207`) | Joseph Sardin & Axeline T. | CC0 1.0 | `block.cannon.aim` |
| [Creaking door #5](https://bigsoundbank.com/creaking-door-5-s3208.html) (`bsb_3208`) | Joseph Sardin & Axeline T. | CC0 1.0 | `entity.whale.mouth_open` |
| [Creaking Door #8](https://bigsoundbank.com/creaking-door-8-s3211.html) (`bsb_3211`) | Joseph Sardin & Axeline T. | CC0 1.0 | `entity.whale.mouth_close` |
| [Creaking metallic door](https://bigsoundbank.com/creaking-metallic-door-s0616.html) (`bsb_0616`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar`, `entity.golden_piglin.creak`, `entity.golden_piglin.groan` |
| [Defrost #2](https://bigsoundbank.com/defrost-2-s2220.html) (`bsb_2220`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.crack` |
| [Defrost #3](https://bigsoundbank.com/defrost-3-s2221.html) (`bsb_2221`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.crack` |
| [Delirious Laughter #3](https://bigsoundbank.com/delirious-laughter-3-s2093.html) (`bsb_2093`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.cackle` |
| [Dig With a Shovel](https://bigsoundbank.com/dig-with-a-shovel-s1305.html) (`bsb_1305`) | Joseph Sardin | CC0 1.0 | `entity.gucker.burrow` |
| [Dog singing #1](https://bigsoundbank.com/dog-singing-1-s2450.html) (`bsb_2450`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.howl` |
| [Dog singing #2](https://bigsoundbank.com/dog-singing-2-s2451.html) (`bsb_2451`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.howl` |
| [Door squeaks and rubs #1](https://bigsoundbank.com/door-squeaks-and-rubs-1-s1159.html) (`bsb_1159`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.creak`, `entity.golden_piglin.groan` |
| [Drink from the gourd #1](https://bigsoundbank.com/drink-from-the-gourd-1-s3247.html) (`bsb_3247`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.drink`, `entity.whale.swallow`, `item.elixir.drink` |
| [Drink from the gourd #3](https://bigsoundbank.com/drink-from-the-gourd-3-s3249.html) (`bsb_3249`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.drink`, `entity.whale.swallow`, `item.elixir.drink` |
| [Drops of water #1](https://bigsoundbank.com/drops-of-water-1-s1384.html) (`bsb_1384`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.additions`, `ambient.whale_belly.loop`, `curse.narcissus` |
| [Drops of water #2](https://bigsoundbank.com/drops-of-water-2-s1385.html) (`bsb_1385`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.additions` |
| [Eat a Rusk](https://bigsoundbank.com/eat-a-rusk-s0407.html) (`bsb_0407`) | Joseph Sardin | CC0 1.0 | `entity.whale.eat` |
| [Eating potato chips #2](https://bigsoundbank.com/eating-potato-chips-2-s1432.html) (`bsb_1432`) | Joseph Sardin | CC0 1.0 | `entity.whale.eat` |
| [Electric shock](https://bigsoundbank.com/electric-shock-s0134.html) (`bsb_0134`) | Joseph Sardin | CC0 1.0 | `block.booster_rail.boost`, `entity.elder_guardian.laser`, `item.monolith_wand.petrify` |
| [Eructation](https://bigsoundbank.com/eructation-s1338.html) (`bsb_1338`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.burp` |
| [Explosion #1](https://bigsoundbank.com/explosion-1-s1807.html) (`bsb_1807`) | Joseph Sardin | CC0 1.0 | `block.cannon.fire`, `entity.cannonball.burst` |
| [Explosion #2](https://bigsoundbank.com/explosion-2-s1808.html) (`bsb_1808`) | Joseph Sardin | CC0 1.0 | `block.cannon.fire` |
| [Explosion far Away #1](https://bigsoundbank.com/explosion-far-away-s1023.html) (`bsb_1023`) | Joseph Sardin | CC0 1.0 | `block.cannon.fire` |
| [Fall of Stone](https://bigsoundbank.com/fall-of-stone-s1022.html) (`bsb_1022`) | Joseph Sardin | CC0 1.0 | `effect.petrified.encase`, `effect.petrified.shatter`, `entity.cannonball.burst`, `entity.ender_dragon.tower_grow`, `entity.gucker.emerge`, `entity.monolith.death`, `entity.monolith.slam`, `entity.obolisk.ambient`, `entity.obolisk.death`, `entity.obolisk.rise`, `entity.obolisk.settle`, `entity.obolisk.slam`, `item.obsidian_shield.shockwave` |
| [Fermentation airlock #2](https://bigsoundbank.com/fermentation-airlock-2-s3561.html) (`bsb_3561`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.bubble` |
| [Fermentation airlock #3](https://bigsoundbank.com/fermentation-airlock-3-s3562.html) (`bsb_3562`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.bubble`, `entity.anglerfish.ambient` |
| [Field cricket](https://bigsoundbank.com/field-cricket-s1020.html) (`bsb_1020`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.hatch`, `entity.enderfly.ambient`, `entity.enderfly.dive`, `entity.enderfly.hurt` |
| [Flag #1](https://bigsoundbank.com/flag-1-s1787.html) (`bsb_1787`) | Joseph Sardin | CC0 1.0 | `entity.lionfish.flare`, `item.fang_dagger.pounce` |
| [Flag #2](https://bigsoundbank.com/flag-2-s1788.html) (`bsb_1788`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.flap`, `item.armor.equip_fur`, `item.end_glider.flap`, `item.fang_dagger.pounce` |
| [Flag #3](https://bigsoundbank.com/flag-3-s1789.html) (`bsb_1789`) | Joseph Sardin | CC0 1.0 | `item.armor.equip_fur` |
| [Flash powder #1](https://bigsoundbank.com/flash-powder-1-s2685.html) (`bsb_2685`) | Joseph Sardin | CC0 1.0 | `entity.enderfly.death`, `entity.gucker.spit` |
| [Flash powder #2](https://bigsoundbank.com/flash-powder-2-s2686.html) (`bsb_2686`) | Joseph Sardin | CC0 1.0 | `entity.enderfly.death`, `entity.gucker.spit` |
| [Flight Bird #1](https://bigsoundbank.com/flight-bird-1-s2891.html) (`bsb_2891`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.hatch`, `entity.dragonling.flap`, `entity.enderfly.death`, `entity.enderfly.dive`, `entity.enderfly.flutter`, `item.end_glider.flap` |
| [Flight bird #3](https://bigsoundbank.com/flight-bird-3-s2893.html) (`bsb_2893`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.hatch`, `entity.dragonling.flap`, `entity.enderfly.death`, `entity.enderfly.dive`, `entity.enderfly.flutter`, `item.end_glider.flap` |
| [Flight of a Pigeon](https://bigsoundbank.com/flight-of-a-pigeon-s0840.html) (`bsb_0840`) | Joseph Sardin | CC0 1.0 | `entity.enderfly.flutter` |
| [Fly and Glass](https://bigsoundbank.com/fly-and-glass-s0759.html) (`bsb_0759`) | Joseph Sardin | CC0 1.0 | `entity.mosquito.buzz` |
| [Flying Melolonthinae](https://bigsoundbank.com/flying-melolonthinae-s1833.html) (`bsb_1833`) | Joseph Sardin | CC0 1.0 | `entity.enderfly.flutter` |
| [Footstep in the Snow #1](https://bigsoundbank.com/on-snow-s0208.html) (`bsb_0208`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.slam` |
| [Gargle #1](https://bigsoundbank.com/gargle-1-s1652.html) (`bsb_1652`) | Joseph Sardin | CC0 1.0 | `entity.anglerfish.ambient` |
| [Gargle #2](https://bigsoundbank.com/gargle-2-s1653.html) (`bsb_1653`) | Joseph Sardin | CC0 1.0 | `entity.anglerfish.ambient`, `entity.anglerfish.hurt` |
| [Gargle #3](https://bigsoundbank.com/gargle-3-s1654.html) (`bsb_1654`) | Joseph Sardin | CC0 1.0 | `ambient.whale_belly.loop`, `entity.anglerfish.ambient`, `entity.anglerfish.death` |
| [Gas fog horn #2](https://bigsoundbank.com/gas-fog-horn-2-s1049.html) (`bsb_1049`) | Joseph Sardin | CC0 1.0 | `item.nautilus_horn.command` |
| [Gasoline fire #1](https://bigsoundbank.com/gasoline-fire-1-s1340.html) (`bsb_1340`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `entity.dragonling.breath` |
| [Gasoline Fire #2](https://bigsoundbank.com/gasoline-fire-2-s1341.html) (`bsb_1341`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.breath` |
| [Ghost #1](https://bigsoundbank.com/ghost-1-s2046.html) (`bsb_2046`) | Joseph Sardin | CC0 1.0 | `block.soul_tank.absorb` |
| [Ghost #2](https://bigsoundbank.com/ghost-2-s2047.html) (`bsb_2047`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `curse.orpheus` |
| [Ghost #3](https://bigsoundbank.com/ghost-3-s2048.html) (`bsb_2048`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `curse.trigger` |
| [Ghost #4](https://bigsoundbank.com/ghost-4-s2049.html) (`bsb_2049`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `block.soul_tank.absorb` |
| [Ghost #5](https://bigsoundbank.com/ghost-5-s2050.html) (`bsb_2050`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `curse.trigger` |
| [Ghost #6](https://bigsoundbank.com/ghost-6-s2051.html) (`bsb_2051`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `curse.orpheus` |
| [Ghost #7](https://bigsoundbank.com/ghost-7-s2052.html) (`bsb_2052`) | Joseph Sardin | CC0 1.0 | `block.soul_tank.absorb` |
| [Ghost #8](https://bigsoundbank.com/ghost-8-s2053.html) (`bsb_2053`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `curse.trigger` |
| [Ghost on the Flute #1](https://bigsoundbank.com/ghost-on-the-flute-1-s2054.html) (`bsb_2054`) | Joseph Sardin | CC0 1.0 | `block.soul_tank.hum` |
| [Ghost on the flute #2](https://bigsoundbank.com/ghost-on-the-flute-2-s2055.html) (`bsb_2055`) | Joseph Sardin | CC0 1.0 | `block.soul_tank.hum` |
| [Glass ball, bounce #1](https://bigsoundbank.com/glass-ball-bounce-1-s2240.html) (`bsb_2240`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.horn_regrow`, `entity.pot_golem.build` |
| [Glass Burst](https://bigsoundbank.com/glass-burst-s0148.html) (`bsb_0148`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.burst`, `block.frost_mauler_skull.revive`, `effect.petrified.shatter`, `entity.frost_mauler.explode`, `entity.frost_mauler.wake`, `entity.monolith.death`, `item.elixir_of_greed.shatter` |
| [Gong, strong #1](https://bigsoundbank.com/gong-strong-1-s1483.html) (`bsb_1483`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.hex`, `curse.sin`, `curse.trigger` |
| [Gong, strong #2](https://bigsoundbank.com/gong-strong-2-s1484.html) (`bsb_1484`) | Joseph Sardin | CC0 1.0 | `curse.trigger` |
| [Gong, sweet](https://bigsoundbank.com/gong-sweet-s1482.html) (`bsb_1482`) | Joseph Sardin | CC0 1.0 | `curse.trigger` |
| [Gong, very strong](https://bigsoundbank.com/gong-very-strong-s1485.html) (`bsb_1485`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.begin`, `block.hexing_table.hex`, `curse.sin`, `entity.monolith.summon` |
| [Gore (pepper) #1](https://bigsoundbank.com/gore-pepper-1-s2593.html) (`bsb_2593`) | Joseph Sardin | CC0 1.0 | `item.blood.splash` |
| [Growling cat #1](https://bigsoundbank.com/growling-cat-1-s1885.html) (`bsb_1885`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.ambient`, `entity.dragonling.roar` |
| [Grumpy pig, with the mouth #1](https://bigsoundbank.com/grumpy-pig-1-s1658.html) (`bsb_1658`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.death`, `entity.golden_piglin.groan`, `entity.golden_piglin.hurt`, `entity.icebreaker.ambient`, `entity.piglin_witch.ambient`, `entity.piglin_witch.burp`, `entity.piglin_witch.cackle`, `entity.piglin_witch.death`, `entity.piglin_witch.drink`, `entity.piglin_witch.hiccup`, `entity.piglin_witch.hurt`, `entity.piglin_witch.refuse`, `entity.piglin_witch.trade` |
| [Grumpy Pig, with the Mouth #2](https://bigsoundbank.com/grumpy-pig-2-s1659.html) (`bsb_1659`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.hurt`, `entity.icebreaker.ambient`, `entity.piglin_witch.ambient`, `entity.piglin_witch.burp`, `entity.piglin_witch.cackle`, `entity.piglin_witch.death`, `entity.piglin_witch.drink`, `entity.piglin_witch.hiccup`, `entity.piglin_witch.hurt`, `entity.piglin_witch.refuse`, `entity.piglin_witch.trade` |
| [Grunts](https://bigsoundbank.com/grunts-s0486.html) (`bsb_0486`) | Joseph Sardin | CC0 1.0 [7] | `entity.golden_piglin.death`, `entity.golden_piglin.groan`, `entity.piglin_witch.ambient` |
| [Gun, loading #1](https://bigsoundbank.com/gun-loading-1-s1988.html) (`bsb_1988`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.mode` |
| [Gun, loading #2](https://bigsoundbank.com/gun-loading-2-s1989.html) (`bsb_1989`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.mode` |
| [Heart Beat](https://bigsoundbank.com/heart-beat-s0218.html) (`bsb_0218`) | Joseph Sardin | CC0 1.0 | `curse.narcissus` |
| [Heavy chain](https://bigsoundbank.com/heavy-chain-s0359.html) (`bsb_0359`) | Joseph Sardin | CC0 1.0 | `block.lift_rail.clank` |
| [Hiss of steam train #1](https://bigsoundbank.com/hiss-of-steam-train-1-s0227.html) (`bsb_0227`) | Joseph Sardin | CC0 1.0 | `block.hydrothermal_vent.loop`, `entity.dragon_locomotive.roar`, `entity.whale.breathe`, `item.snowball_launcher.overheat` |
| [Hiss of Steam Train #2](https://bigsoundbank.com/hiss-of-steam-train-2-s0228.html) (`bsb_0228`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar` |
| [Horn #5](https://bigsoundbank.com/horn-5-s2524.html) (`bsb_2524`) | Joseph Sardin | CC0 1.0 | `item.nautilus_horn.command` |
| [Horse chewing hay](https://bigsoundbank.com/horse-chewing-hay-s0497.html) (`bsb_0497`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.munch` |
| [Hush, long man](https://bigsoundbank.com/hush-long-man-s1076.html) (`bsb_1076`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.whisper` |
| [Ice cubes in a glass #1](https://bigsoundbank.com/ice-cubes-in-a-glass-1-s2123.html) (`bsb_2123`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.step`, `block.snow_globe.shake`, `entity.icebreaker.shear` |
| [Ice cubes in a glass #2](https://bigsoundbank.com/ice-cubes-in-a-glass-2-s2124.html) (`bsb_2124`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.place`, `block.snow_globe.shake`, `entity.icebreaker.shear`, `entity.mosquito.spit` |
| [Ice cubes in a glass #3](https://bigsoundbank.com/ice-cubes-in-a-glass-3-s2125.html) (`bsb_2125`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.place`, `block.snow_globe.shake`, `entity.icebreaker.shear` |
| [Ice cubes in a glass #4](https://bigsoundbank.com/ice-cubes-in-a-glass-4-s2126.html) (`bsb_2126`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.place`, `block.icicle.shatter`, `block.snow_globe.shake`, `entity.mosquito.spit` |
| [Ice cubes in a glass #5](https://bigsoundbank.com/ice-cubes-in-a-glass-5-s2127.html) (`bsb_2127`) | Joseph Sardin | CC0 1.0 | `block.icicle.fall`, `block.snow_globe.shake` |
| [Ice cubes in a glass #6](https://bigsoundbank.com/ice-cubes-in-a-glass-6-s2128.html) (`bsb_2128`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Jumping on concrete #1](https://bigsoundbank.com/jumping-on-concrete-1-s1835.html) (`bsb_1835`) | Joseph Sardin | CC0 1.0 | `entity.monolith.slam`, `entity.obolisk.settle`, `entity.obolisk.slam`, `entity.obolisk.step` |
| [Jumping on Concrete #2](https://bigsoundbank.com/jumping-on-concrete-2-s1836.html) (`bsb_1836`) | Joseph Sardin | CC0 1.0 | `entity.monolith.slam`, `entity.obolisk.rise`, `entity.obolisk.slam`, `entity.obolisk.step` |
| [Large ratchet](https://bigsoundbank.com/large-ratchet-s0795.html) (`bsb_0795`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Laughing Boy of 16 Months](https://bigsoundbank.com/laughing-boy-of-16-months-s0980.html) (`bsb_0980`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.giggle` |
| [Little Meow of a Cat #1](https://bigsoundbank.com/little-meow-of-a-cat-s0494.html) (`bsb_0494`) | Joseph Sardin | CC0 1.0 | `entity.endling.hurt`, `entity.endling.scared` |
| [Long Welding #1](https://bigsoundbank.com/long-welding-1-s0950.html) (`bsb_0950`) | Joseph Sardin | CC0 1.0 | `entity.elder_guardian.laser`, `entity.ender_dragon.beam_charge`, `entity.ender_dragon.beam_fire` |
| [Man Breathing](https://bigsoundbank.com/man-breathing-s2195.html) (`bsb_2195`) | Joseph Sardin | CC0 1.0 | `entity.player.shiver` |
| [Man sniffing](https://bigsoundbank.com/man-sniffing-s1095.html) (`bsb_1095`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.refuse` |
| [Manual winch #1](https://bigsoundbank.com/manual-winch-1-s0901.html) (`bsb_0901`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar` |
| [Match #1](https://bigsoundbank.com/match-s0004.html) (`bsb_0004`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.fuse` |
| [Medium chain](https://bigsoundbank.com/medium-chain-s0619.html) (`bsb_0619`) | Joseph Sardin | CC0 1.0 | `block.lift_rail.clank` |
| [Medium Chain #1](https://bigsoundbank.com/medium-chain-1-s0360.html) (`bsb_0360`) | Joseph Sardin | CC0 1.0 | `entity.minecart.couple` |
| [Medium chain #2](https://bigsoundbank.com/medium-chain-2-s0361.html) (`bsb_0361`) | Joseph Sardin | CC0 1.0 | `entity.minecart.couple` |
| [Metal ball, bounce #2](https://bigsoundbank.com/metal-ball-bounce-2-s2243.html) (`bsb_2243`) | Joseph Sardin | CC0 1.0 | `item.obsidian_shield.reflect`, `item.snowball_launcher.overheat` |
| [Metal grinding](https://bigsoundbank.com/metal-grinding-s0779.html) (`bsb_0779`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.groan` |
| [Mewing kitten 3 weeks](https://bigsoundbank.com/mewing-kitten-3-weeks-s0390.html) (`bsb_0390`) | Joseph Sardin | CC0 1.0 | `entity.endling.death`, `entity.endling.hurt`, `entity.endling.scared` |
| [Mouth Noises #1](https://bigsoundbank.com/mouth-noises-1-s0352.html) (`bsb_0352`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.munch` |
| [Mouth open](https://bigsoundbank.com/mouth-open-s0720.html) (`bsb_0720`) | Joseph Sardin | CC0 1.0 | `entity.whale.eat` |
| [Music box, C #1](https://bigsoundbank.com/music-box-c-1-s1867.html) (`bsb_1867`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake`, `entity.whale.tamed` |
| [Music box, F #1](https://bigsoundbank.com/music-box-f-1-s1870.html) (`bsb_1870`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Music box, G #1](https://bigsoundbank.com/music-box-g-1-s1871.html) (`bsb_1871`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake`, `entity.whale.tamed` |
| [Nutcracker](https://bigsoundbank.com/nutcracker-s0050.html) (`bsb_0050`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.crack`, `entity.dragonling.hatch`, `item.dragon_egg.crack` |
| [One frog](https://bigsoundbank.com/one-frog-s0819.html) (`bsb_0819`) | Joseph Sardin | CC0 1.0 | `entity.gucker.ambient`, `entity.gucker.death`, `entity.gucker.emerge`, `entity.gucker.hurt` |
| [Overtone singing, C](https://bigsoundbank.com/overtone-singing-c-s3033.html) (`bsb_3033`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.begin`, `ambient.eclipse.end`, `entity.monolith.ambient`, `entity.monolith.death`, `entity.monolith.stare`, `entity.monolith.summon` |
| [Overtone singing, D](https://bigsoundbank.com/overtone-singing-d-s3034.html) (`bsb_3034`) | Joseph Sardin | CC0 1.0 | `entity.monolith.ambient`, `entity.monolith.death`, `entity.monolith.summon` |
| [Overtone singing, F](https://bigsoundbank.com/overtone-singing-f-s3036.html) (`bsb_3036`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.begin`, `ambient.eclipse.end`, `ambient.eclipse.loop`, `entity.monolith.ambient`, `entity.monolith.stare`, `entity.monolith.summon` |
| [Pages that Turn #5](https://bigsoundbank.com/pages-that-turn-5-s2212.html) (`bsb_2212`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.crack`, `block.chorus_cocoon.hatch`, `entity.enderfly.ambient`, `entity.enderfly.flutter`, `entity.enderfly.hurt` |
| [Pistol, cocking #2](https://bigsoundbank.com/pistol-cocking-2-s1985.html) (`bsb_1985`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.empty` |
| [Pistol, cocking #3](https://bigsoundbank.com/pistol-cocking-3-s1986.html) (`bsb_1986`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.empty` |
| [Pistol, cocking hammer #1](https://bigsoundbank.com/pistol-cocking-hammer-1-s1992.html) (`bsb_1992`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.empty`, `item.snowball_launcher.mode` |
| [Pneumatic cylinder, small #1](https://bigsoundbank.com/pneumatic-cylinder-small-1-s1491.html) (`bsb_1491`) | Joseph Sardin | CC0 1.0 | `entity.nautilus.dash`, `item.snowball_launcher.fire` |
| [Pneumatic cylinder, small #2](https://bigsoundbank.com/pneumatic-cylinder-small-2-s1492.html) (`bsb_1492`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.fire` |
| [Pneumatic cylinder, small #3](https://bigsoundbank.com/pneumatic-cylinder-small-3-s1493.html) (`bsb_1493`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.fire` |
| [Pressure cooker](https://bigsoundbank.com/pressure-cooker-s0805.html) (`bsb_0805`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.overheat` |
| [Punch #1](https://bigsoundbank.com/punch-s0105.html) (`bsb_0105`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.ram` |
| [Punch #4](https://bigsoundbank.com/punch-4-s2459.html) (`bsb_2459`) | Joseph Sardin | CC0 1.0 | `entity.ender_dragon.grab`, `entity.frost_mauler.claw`, `entity.icebreaker.ram`, `item.fang_dagger.crit` |
| [Punch #5](https://bigsoundbank.com/punch-5-s2460.html) (`bsb_2460`) | Joseph Sardin | CC0 1.0 | `entity.ender_dragon.grab`, `entity.frost_mauler.claw`, `entity.icebreaker.ram`, `item.fang_dagger.crit` |
| [Punch #6](https://bigsoundbank.com/punch-6-s2461.html) (`bsb_2461`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `item.fang_dagger.crit` |
| [Quenching, cooling #1](https://bigsoundbank.com/quenching-cooling-1-s1694.html) (`bsb_1694`) | Joseph Sardin | CC0 1.0 | `entity.player.overheat`, `item.elixir_of_greed.shatter` |
| [Quenching, cooling #2](https://bigsoundbank.com/quenching-cooling-2-s1695.html) (`bsb_1695`) | Joseph Sardin | CC0 1.0 | `entity.player.overheat`, `item.elixir_of_greed.shatter` |
| [Quenching, cooling #3](https://bigsoundbank.com/quenching-cooling-3-s1696.html) (`bsb_1696`) | Joseph Sardin | CC0 1.0 | `entity.player.overheat`, `item.elixir_of_greed.shatter` |
| [Rain stick](https://bigsoundbank.com/rain-stick-s0464.html) (`bsb_0464`) | Joseph Sardin | CC0 1.0 | `entity.lionfish.flare` |
| [Ratchet tensioner](https://bigsoundbank.com/ratchet-tensioner-s1824.html) (`bsb_1824`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Rattle](https://bigsoundbank.com/rattle-s0923.html) (`bsb_0923`) | Joseph Sardin | CC0 1.0 | `entity.lionfish.flare` |
| [Rattle (toy)](https://bigsoundbank.com/rattle-toy-s0371.html) (`bsb_0371`) | Joseph Sardin | CC0 1.0 | `entity.lionfish.flare` |
| [Raw carrot crunched #1](https://bigsoundbank.com/raw-carrot-crunched-1-s1594.html) (`bsb_1594`) | Joseph Sardin | CC0 1.0 | `entity.dragonling.eat` |
| [Raw carrot crunched #2](https://bigsoundbank.com/raw-carrot-crunched-2-s1595.html) (`bsb_1595`) | Joseph Sardin | CC0 1.0 | `block.barnacles.break` |
| [Raw carrot crunched #3](https://bigsoundbank.com/raw-carrot-crunched-3-s1596.html) (`bsb_1596`) | Joseph Sardin | CC0 1.0 | `block.barnacles.break` |
| [Raw rice poured into a saucepan](https://bigsoundbank.com/raw-rice-poured-into-a-saucepan-s0201.html) (`bsb_0201`) | Joseph Sardin | CC0 1.0 | `block.cannon.load` |
| [Rowing Quickly](https://bigsoundbank.com/rowing-quickly-s1513.html) (`bsb_1513`) | Joseph Sardin | CC0 1.0 | `entity.anglerfish.lunge`, `entity.elder_guardian.tail_whip` |
| [Rowing slowly](https://bigsoundbank.com/rowing-slowly-s1514.html) (`bsb_1514`) | Joseph Sardin | CC0 1.0 | `entity.whale.mouth_close` |
| [Scissors](https://bigsoundbank.com/scissors-s0008.html) (`bsb_0008`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.shear`, `entity.polar_bear.shear` |
| [Shells sculpture](https://bigsoundbank.com/shells-sculpture-s0038.html) (`bsb_0038`) | Joseph Sardin | CC0 1.0 | `block.barnacles.break` |
| [Short welds](https://bigsoundbank.com/short-welds-s0952.html) (`bsb_0952`) | Joseph Sardin | CC0 1.0 | `block.booster_rail.boost`, `entity.elder_guardian.laser`, `item.monolith_wand.petrify` |
| [Shot of shovel](https://bigsoundbank.com/shot-shovel-s1084.html) (`bsb_1084`) | Joseph Sardin | CC0 1.0 | `item.obsidian_shield.reflect` |
| [Sigh by the Mouth](https://bigsoundbank.com/sigh-by-the-mouth-s1405.html) (`bsb_1405`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.breath`, `entity.polar_bear.calm`, `item.fang_dagger.tired` |
| [Sigh by the nose](https://bigsoundbank.com/sigh-by-the-nose-s1404.html) (`bsb_1404`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.calm`, `entity.pot_golem.sneeze`, `item.fang_dagger.tired` |
| [Sika deer rut call #1](https://bigsoundbank.com/sika-deer-rut-call-1-s3617.html) (`bsb_3617`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.roar` |
| [Sika deer rut call #2](https://bigsoundbank.com/sika-deer-rut-call-2-s3618.html) (`bsb_3618`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.stunned` |
| [Singing insect #1](https://bigsoundbank.com/singing-insect-1-s3089.html) (`bsb_3089`) | Joseph Sardin | CC0 1.0 | `entity.enderfly.ambient`, `entity.enderfly.hurt` |
| [Slaps](https://bigsoundbank.com/slaps-s0597.html) (`bsb_0597`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.slap` |
| [Slow wick #2](https://bigsoundbank.com/slow-wick-2-s1307.html) (`bsb_1307`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.fuse` |
| [Slow wick 1](https://bigsoundbank.com/slow-wick-1--s1306.html) (`bsb_1306`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.fuse` |
| [Small chain #1](https://bigsoundbank.com/small-chain-1-s0355.html) (`bsb_0355`) | Joseph Sardin | CC0 1.0 | `entity.minecart.couple` |
| [Small metal grinding #1](https://bigsoundbank.com/petit-grincement-metal-1-s0322.html) (`bsb_0322`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.creak` |
| [Small metal grinding #2](https://bigsoundbank.com/petit-grincement-metal-2-s0323.html) (`bsb_0323`) | Joseph Sardin | CC0 1.0 | `entity.golden_piglin.creak` |
| [Small ratchet](https://bigsoundbank.com/small-ratchet-s0794.html) (`bsb_0794`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Sniff](https://bigsoundbank.com/sniff-s0784.html) (`bsb_0784`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.ambient`, `entity.piglin_witch.cackle`, `entity.piglin_witch.hiccup`, `entity.piglin_witch.refuse` |
| [Sonar #2](https://bigsoundbank.com/sonar-2-s1920.html) (`bsb_1920`) | Joseph Sardin | CC0 1.0 | `block.whale_lure.pulse` |
| [Splash, Big #1](https://bigsoundbank.com/splash-big-1-s1519.html) (`bsb_1519`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.splash`, `entity.whale.shake` |
| [Splash, big #2](https://bigsoundbank.com/splash-big-2-s1520.html) (`bsb_1520`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.splash`, `entity.whale.shake` |
| [Splash, Big #3](https://bigsoundbank.com/splash-big-3-s1521.html) (`bsb_1521`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.splash`, `entity.whale.shake` |
| [Splash, Small #1](https://bigsoundbank.com/splash-small-1-s1529.html) (`bsb_1529`) | Joseph Sardin | CC0 1.0 [8] | `item.blood.splash` |
| [Splash, small #3](https://bigsoundbank.com/splash-small-3-s1531.html) (`bsb_1531`) | Joseph Sardin | CC0 1.0 | `item.blood.splash` |
| [Splash, small #4](https://bigsoundbank.com/splash-small-4-s1532.html) (`bsb_1532`) | Joseph Sardin | CC0 1.0 | `item.blood.splash`, `item.elixir_of_greed.shatter` |
| [Steam engine, foley #1](https://bigsoundbank.com/steam-engine-foley-1-s3310.html) (`bsb_3310`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.chuff` |
| [Steam engine, foley #2](https://bigsoundbank.com/steam-engine-foley-2-s3311.html) (`bsb_3311`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.chuff` |
| [Steps in the Mud](https://bigsoundbank.com/steps-in-the-mud-s0495.html) (`bsb_0495`) | Joseph Sardin | CC0 1.0 | `entity.gucker.death`, `entity.gucker.step` |
| [Stir concrete with a trowel](https://bigsoundbank.com/stir-concrete-with-a-trowel-s0623.html) (`bsb_0623`) | Joseph Sardin | CC0 1.0 | `entity.pot_golem.repair` |
| [Stomach gurgling #1](https://bigsoundbank.com/stomach-gurgling-1-s1280.html) (`bsb_1280`) | Joseph Sardin | CC0 1.0 | `ambient.whale_belly.loop` |
| [Stomach gurgling #2](https://bigsoundbank.com/stomach-gurgling-2-s1281.html) (`bsb_1281`) | Joseph Sardin | CC0 1.0 | `ambient.whale_belly.loop`, `entity.anglerfish.ambient`, `entity.anglerfish.hurt`, `entity.whale.swallow` |
| [Stomach gurgling #3](https://bigsoundbank.com/stomach-gurgling-3-s3176.html) (`bsb_3176`) | Joseph Sardin & Axeline T. | CC0 1.0 | `ambient.whale_belly.loop` |
| [Stomach gurgling #4](https://bigsoundbank.com/stomach-gurgling-4-s3177.html) (`bsb_3177`) | Joseph Sardin & Axeline T. | CC0 1.0 | `ambient.whale_belly.loop`, `entity.anglerfish.ambient`, `entity.anglerfish.death`, `entity.whale.swallow` |
| [Stomach gurgling #5](https://bigsoundbank.com/stomach-gurgling-5-s3178.html) (`bsb_3178`) | Joseph Sardin & Axeline T. | CC0 1.0 | `ambient.whale_belly.loop` |
| [Straw, end of glass](https://bigsoundbank.com/straw-end-of-glass-s0508.html) (`bsb_0508`) | Joseph Sardin | CC0 1.0 | `entity.mosquito.drink` |
| [Straw, suction #1](https://bigsoundbank.com/straw-suction-1-s1244.html) (`bsb_1244`) | Joseph Sardin | CC0 1.0 | `entity.mosquito.drink` |
| [Straw, suction #2](https://bigsoundbank.com/straw-suction-2-s1245.html) (`bsb_1245`) | Joseph Sardin | CC0 1.0 | `block.tube_worms.extend`, `entity.nautilus.ambient` |
| [Straw, suction #3](https://bigsoundbank.com/straw-suction-3-s1246.html) (`bsb_1246`) | Joseph Sardin | CC0 1.0 | `entity.mosquito.drink` |
| [Strident Laughter](https://bigsoundbank.com/strident-laughter-s0489.html) (`bsb_0489`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.cackle`, `entity.piglin_witch.hiccup` |
| [Suction cup on window](https://bigsoundbank.com/suction-cup-on-window-s1262.html) (`bsb_1262`) | Joseph Sardin | CC0 1.0 | `block.tube_worms.retract`, `entity.anglerfish.bite`, `entity.lionfish.hurt` |
| [Sword That Cuts](https://bigsoundbank.com/sword-that-cuts-s0127.html) (`bsb_0127`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw` |
| [Sword Through the Air](https://bigsoundbank.com/sword-through-the-air-s0128.html) (`bsb_0128`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.slash` |
| [Synthetic Coat Rubbed](https://bigsoundbank.com/synthetic-coat-rubbed-s1104.html) (`bsb_1104`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.rummage`, `entity.polar_bear.shear`, `item.armor.equip_fur`, `item.turtle_shell.retreat` |
| [Tent or curtain shower](https://bigsoundbank.com/tent-or-curtain-shower-s0399.html) (`bsb_0399`) | Joseph Sardin | CC0 1.0 | `block.end_bloom.open` |
| [Thunder #2](https://bigsoundbank.com/thunder-2-s3113.html) (`bsb_3113`) | Joseph Sardin | CC0 1.0 | `entity.ender_dragon.tower_grow`, `entity.monolith.clap`, `entity.monolith.death`, `entity.monolith.slam`, `entity.obolisk.death`, `entity.obolisk.slam`, `entity.pot_golem.beam`, `event.frozen_tomb.rumble`, `item.snowball_launcher.heavy` |
| [Thunder #3](https://bigsoundbank.com/thunder-3-s3114.html) (`bsb_3114`) | Joseph Sardin | CC0 1.0 | `event.frozen_tomb.rumble` |
| [Tibetan bowl singing](https://bigsoundbank.com/tibetan-bowl-singing-s1109.html) (`bsb_1109`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.begin`, `ambient.eclipse.loop`, `block.angler_light.hum`, `block.eye_of_the_ocean.ambient`, `block.meteorite.hum`, `entity.monolith.ambient` |
| [Tibetan Bowl Struck #1](https://bigsoundbank.com/tibetan-bowl-struck-s1110.html) (`bsb_1110`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.end`, `entity.endling.sacrifice`, `entity.monolith.death`, `entity.monolith.hurt` |
| [Tibetan bowl struck #2](https://bigsoundbank.com/tibetan-bowl-struck-2-s2553.html) (`bsb_2553`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.begin`, `entity.endling.sacrifice`, `entity.monolith.hurt`, `entity.monolith.stare`, `entity.obolisk.rise` |
| [Tombstone: Opening](https://bigsoundbank.com/tombstone-opening-s0580.html) (`bsb_0580`) | Joseph Sardin | CC0 1.0 | `effect.petrified.encase`, `entity.ender_dragon.tower_grow`, `entity.gucker.burrow`, `entity.monolith.grab`, `entity.obolisk.ambient`, `entity.obolisk.death`, `entity.obolisk.hurt`, `entity.obolisk.rise`, `entity.obolisk.settle`, `entity.obolisk.step` |
| [Tongue clicks](https://bigsoundbank.com/tongue-clicks-s1038.html) (`bsb_1038`) | Joseph Sardin | CC0 1.0 | `entity.nautilus.ambient` |
| [Train whistle, foley #2](https://bigsoundbank.com/train-whistle-foley-2-s3316.html) (`bsb_3316`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.whistle` |
| [Train whistle, foley #5](https://bigsoundbank.com/train-whistle-foley-5-s3319.html) (`bsb_3319`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.whistle` |
| [Triangle #1](https://bigsoundbank.com/triangle-1-s1687.html) (`bsb_1687`) | Joseph Sardin | CC0 1.0 | `entity.ender_dragon.crystal_regrow` |
| [Tripes](https://bigsoundbank.com/tripes-s0334.html) (`bsb_0334`) | Joseph Sardin | CC0 1.0 | `block.chorus_cocoon.crack`, `block.chorus_cocoon.hatch`, `entity.dragonling.hatch`, `item.blood.splash` |
| [Turned Page](https://bigsoundbank.com/turned-page-s0164.html) (`bsb_0164`) | Joseph Sardin | CC0 1.0 | `entity.enderfly.ambient`, `entity.enderfly.flutter`, `entity.enderfly.hurt` |
| [Underwater](https://bigsoundbank.com/underwater-s3430.html) (`bsb_3430`) | Joseph Sardin & Axeline T. | CC0 1.0 | `ambient.whale_belly.current`, `ambient.whale_belly.loop`, `block.eye_of_the_ocean.activate`, `block.eye_of_the_ocean.ambient`, `entity.whale.mouth_open`, `entity.whale.swallow` |
| [Water Blop #1](https://bigsoundbank.com/water-blop-1-s3427.html) (`bsb_3427`) | Joseph Sardin & Axeline T. | CC0 1.0 | `block.hydrothermal_vent.loop`, `block.whale_lure.pulse`, `entity.anglerfish.ambient`, `entity.elder_guardian.bubble`, `entity.nautilus.ambient` |
| [Water Blop #2](https://bigsoundbank.com/water-blop-2-s3428.html) (`bsb_3428`) | Joseph Sardin & Axeline T. | CC0 1.0 | `block.tube_worms.extend`, `entity.anglerfish.ambient`, `entity.elder_guardian.bubble`, `entity.nautilus.ambient` |
| [Water Blop #3](https://bigsoundbank.com/water-blop-3-s3429.html) (`bsb_3429`) | Joseph Sardin & Axeline T. | CC0 1.0 | `block.hydrothermal_vent.loop`, `entity.elder_guardian.bubble`, `entity.nautilus.ambient` |
| [Water Bubble #2](https://bigsoundbank.com/water-bubble-2-s0183.html) (`bsb_0183`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.brewed` |
| [Water bubbles](https://bigsoundbank.com/water-bubbles-s0150.html) (`bsb_0150`) | Joseph Sardin | CC0 1.0 | `block.elixir_jar.brewed`, `block.hydrothermal_vent.loop`, `entity.gucker.ambient`, `entity.nautilus.ambient` |
| [Water drum #5](https://bigsoundbank.com/water-drum-5-s0739.html) (`bsb_0739`) | faeli83 | CC0 1.0 | `entity.whale.mouth_close` |
| [Water gun #1](https://bigsoundbank.com/water-gun-1-s0324.html) (`bsb_0324`) | DavidGreck | CC0 1.0 | `entity.nautilus.dash` |
| [Wheelbarrow of limestone, filling](https://bigsoundbank.com/wheelbarrow-of-limestone-filling-s1635.html) (`bsb_1635`) | Joseph Sardin | CC0 1.0 | `entity.gucker.breathe`, `entity.gucker.burrow`, `entity.gucker.emerge` |
| [Whisper #1](https://bigsoundbank.com/whisper-1-s3255.html) (`bsb_3255`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.whisper`, `item.hexed_book.whisper` |
| [Whisper #2](https://bigsoundbank.com/whisper-2-s3256.html) (`bsb_3256`) | Joseph Sardin | CC0 1.0 | `block.hexing_table.whisper`, `item.hexed_book.whisper` |
| [Whistling of the Wind #2](https://bigsoundbank.com/whistling-of-the-wind-2-s0155.html) (`bsb_0155`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.loop`, `entity.ender_dragon.throw` |
| [Whistling train #2](https://bigsoundbank.com/whistling-train-2-s0226.html) (`bsb_0226`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.whistle` |
| [Whoosh #4](https://bigsoundbank.com/whoosh-4-s1796.html) (`bsb_1796`) | Joseph Sardin | CC0 1.0 | `entity.elder_guardian.tail_whip`, `entity.ender_dragon.grab`, `entity.enderfly.dive`, `entity.frost_mauler.claw`, `entity.polar_bear.leap`, `item.end_glider.boost`, `item.fang_dagger.pounce` |
| [Whoosh #7](https://bigsoundbank.com/whoosh-7-s1800.html) (`bsb_1800`) | Joseph Sardin | CC0 1.0 | `entity.elder_guardian.tail_whip`, `entity.ender_dragon.grab`, `entity.frost_mauler.claw`, `entity.polar_bear.leap`, `item.fang_dagger.pounce` |
| [Whoosh #8](https://bigsoundbank.com/whoosh-8-s1801.html) (`bsb_1801`) | Joseph Sardin | CC0 1.0 | `entity.elder_guardian.tail_whip`, `entity.ender_dragon.throw`, `entity.frost_mauler.claw`, `entity.polar_bear.leap`, `item.end_glider.boost`, `item.fang_dagger.pounce` |
| [Wind from inside #1](https://bigsoundbank.com/wind-from-inside-1-s1714.html) (`bsb_1714`) | Joseph Sardin | CC0 1.0 | `ambient.eclipse.loop`, `ambient.ice_caves.loop`, `entity.ender_dragon.throw` |
| [Winder #1](https://bigsoundbank.com/winder-1-s1674.html) (`bsb_1674`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Winder #2](https://bigsoundbank.com/winder-2-s1675.html) (`bsb_1675`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Winder #4](https://bigsoundbank.com/winder-4-s2665.html) (`bsb_2665`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Wooden stick on bars](https://bigsoundbank.com/wooden-stick-on-bars-s0995.html) (`bsb_0995`) | Joseph Sardin | CC0 1.0 | `block.cannon.load` |
| [Zombie #1](https://bigsoundbank.com/zombie-1-s2106.html) (`bsb_2106`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death` |
| [Zombie #2](https://bigsoundbank.com/zombie-2-s2107.html) (`bsb_2107`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.death`, `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death` |
| [Zombie #3](https://bigsoundbank.com/zombie-3-s2108.html) (`bsb_2108`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.zombie_polar_bear.ambient` |
| [Zombie #4](https://bigsoundbank.com/zombie-4-s2109.html) (`bsb_2109`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.death` |
| [Zombie #5](https://bigsoundbank.com/zombie-5-s2110.html) (`bsb_2110`) | Joseph Sardin | CC0 1.0 | `entity.zombie_polar_bear.hurt` |
| [Zombie #6](https://bigsoundbank.com/zombie-6-s2111.html) (`bsb_2111`) | Joseph Sardin | CC0 1.0 | `entity.piglin_witch.death`, `entity.zombie_polar_bear.hurt` |
| [Zombie #7](https://bigsoundbank.com/zombie-7-s2112.html) (`bsb_2112`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.piglin_witch.death` |

## commons.wikimedia.org

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Lion_raring-sound1TamilNadu178.ogg](https://commons.wikimedia.org/wiki/File:Lion_raring-sound1TamilNadu178.ogg) (`cw_lion`) | த*உழவன் | Public domain [9] | `block.frost_mauler_skull.revive`, `entity.dragon_locomotive.roar`, `entity.elder_guardian.roar`, `entity.frost_mauler.ambient`, `entity.frost_mauler.death`, `entity.frost_mauler.hurt`, `entity.frost_mauler.roar`, `entity.polar_bear.roar` |

## nps.gov (Glacier Bay National Park & Preserve)

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Humpback whale bubble-feeding and vocalizing](https://www.nps.gov/glba/learn/nature/soundclips.htm) (`nps_glba_bubblenet`) | National Park Service (Glacier Bay hydrophone) | Public domain (US federal work) [10] | `ambient.whale_belly.current`, `entity.elder_guardian.bubble`, `entity.whale.death`, `entity.whale.hurt`, `entity.whale.song` |
| [Humpback whale contact call (moo)](https://www.nps.gov/glba/learn/nature/soundclips.htm) (`nps_glba_moo`) | National Park Service (Glacier Bay hydrophone) | Public domain (US federal work) [11] | `entity.whale.call`, `entity.whale.song` |
| [Humpback whale feeding call](https://www.nps.gov/glba/learn/nature/soundclips.htm) (`nps_glba_feeding`) | National Park Service (Glacier Bay hydrophone) | Public domain (US federal work) [12] | `entity.whale.call` |
| [Humpback whale vocals and wheeze-blow](https://www.nps.gov/glba/learn/nature/soundclips.htm) (`nps_glba_wheezeblow`) | National Park Service (Glacier Bay hydrophone) | Public domain (US federal work) [13] | `entity.whale.breathe` |

## opengameart.org

| Source | Author | Licence | Used by |
|---|---|---|---|
| [100 CC0 metal and wood SFX](https://opengameart.org/content/100-cc0-metal-and-wood-sfx) (`oga_rd_metalwood`) | rubberduck | CC0 1.0 | `block.cannon.aim`, `block.cannon.load`, `entity.golden_piglin.death`, `entity.golden_piglin.hurt`, `entity.piglin_witch.rummage` |
| [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx) (`oga_rd_100`) | rubberduck | CC0 1.0 | `entity.cannonball.burst`, `entity.pot_golem.crack`, `entity.pot_golem.death`, `entity.pot_golem.hurt`, `entity.pot_golem.repair`, `entity.pot_golem.shatter` |
| [12 wet towel hitting/falling/punching floor sounds](https://opengameart.org/content/12-wet-towel-hittingfallingpunching-floor-sounds) (`oga_towel`) | qubodup | CC0 1.0 [14] | `entity.anglerfish.flop`, `entity.icebreaker.death`, `entity.icebreaker.slap`, `entity.icebreaker.step`, `entity.lionfish.flop`, `entity.whale.mouth_close` |
| [25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-firework-sfx) (`oga_rd_bang`) | rubberduck | CC0 1.0 | `block.cannon.fire`, `block.frost_mauler_skull.revive`, `entity.cannonball.burst`, `entity.frost_mauler.explode`, `entity.monolith.clap`, `entity.monolith.death`, `entity.monolith.slam`, `entity.pot_golem.beam`, `item.obsidian_shield.shockwave`, `item.snowball_launcher.heavy` |
| [4 dry snow steps](https://opengameart.org/content/4-dry-snow-steps) (`oga_dry_snow`) | qubodup | CC0 1.0 | `entity.frost_zombie.step`, `entity.icebreaker.slap`, `entity.polar_bear.slam`, `item.snowball_launcher.load` |
| [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) (`oga_rd_water`) | rubberduck | CC0 1.0 | `ambient.whale_belly.current`, `block.tube_worms.extend`, `block.tube_worms.retract`, `entity.anglerfish.ambient`, `entity.anglerfish.bite`, `entity.anglerfish.death`, `entity.anglerfish.flop`, `entity.anglerfish.hurt`, `entity.anglerfish.lunge`, `entity.elder_guardian.bubble`, `entity.elder_guardian.roar`, `entity.elder_guardian.stare_charge`, `entity.elder_guardian.tail_whip`, `entity.icebreaker.splash`, `entity.lionfish.death`, `entity.lionfish.flare`, `entity.lionfish.hurt`, `entity.nautilus.ambient`, `entity.nautilus.dash`, `entity.nautilus.death`, `entity.nautilus.hurt`, `entity.piglin_witch.drink`, `entity.polar_bear.munch`, `entity.pot_golem.death`, `entity.pot_golem.hurt`, `entity.pot_golem.step`, `entity.whale.breathe`, `entity.whale.death`, `item.blood.splash`, `item.elixir.drink` |
| [42 Snow and Gravel Footsteps (recorded by Corsica_S, cut by qubodup)](https://opengameart.org/content/42-snow-and-gravel-footsteps) (`oga_snow42`) | qubodup / Corsica_S | CC0 1.0 [15] | `block.ancient_ice.fall`, `block.ancient_ice.step`, `entity.frost_mauler.step`, `entity.frost_zombie.step` |
| [51 UI sound effects (buttons, switches and clicks)](https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) (`oga_kenney_ui`) | Kenney | CC0 1.0 | `entity.mosquito.stab`, `entity.pot_golem.repair`, `item.snowball_launcher.empty`, `item.snowball_launcher.load`, `item.snowball_launcher.mode` |
| [75 CC0 breaking / falling / hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx) (`oga_rd_break`) | rubberduck | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.burst`, `block.ancient_ice.fall`, `block.ancient_ice.hit`, `block.ancient_ice.place`, `block.icicle.shatter`, `effect.petrified.shatter`, `effect.ramming.impact`, `entity.frost_mauler.bite`, `entity.frost_zombie.death`, `entity.golden_piglin.death`, `entity.gucker.emerge`, `entity.icebreaker.ram`, `entity.minecart.couple`, `entity.monolith.death`, `entity.monolith.hurt`, `entity.monolith.slam`, `entity.mosquito.spit`, `entity.mosquito.stab`, `entity.obolisk.death`, `entity.obolisk.hurt`, `entity.obolisk.slam`, `entity.pot_golem.crack`, `entity.pot_golem.death`, `entity.pot_golem.hurt`, `entity.pot_golem.shatter`, `item.elixir_of_greed.shatter`, `item.fang_dagger.tired`, `item.snowball_launcher.load`, `item.snowball_launcher.overheat` |
| [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) (`oga_rd_creature`) | rubberduck | CC0 1.0 | `entity.anglerfish.ambient`, `entity.anglerfish.bite`, `entity.anglerfish.hurt`, `entity.dragonling.ambient`, `entity.dragonling.eat`, `entity.dragonling.hurt`, `entity.dragonling.roar`, `entity.ender_dragon.grab`, `entity.enderfly.ambient`, `entity.enderfly.hurt`, `entity.endling.ambient`, `entity.endling.happy`, `entity.endling.hurt`, `entity.endling.scared`, `entity.endling.teleport`, `entity.frost_mauler.hurt`, `entity.frost_mauler.stunned`, `entity.gucker.ambient`, `entity.gucker.bite`, `entity.gucker.burrow`, `entity.gucker.death`, `entity.gucker.hurt`, `entity.gucker.inflate`, `entity.gucker.spit`, `entity.icebreaker.happy`, `entity.icebreaker.hurt`, `entity.mosquito.death`, `entity.mosquito.hurt`, `entity.mosquito.spit`, `entity.nautilus.hurt`, `entity.obolisk.death`, `entity.obolisk.hurt`, `entity.piglin_witch.burp`, `entity.piglin_witch.hurt`, `entity.polar_bear.leap`, `entity.polar_bear.munch`, `entity.pot_golem.howl`, `entity.sniffer.tame`, `entity.zombie_polar_bear.hurt` |
| [80 CC0 creture SFX #2](https://opengameart.org/content/80-cc0-creture-sfx-2) (`oga_rd_creature2`) | rubberduck | CC0 1.0 | `entity.anglerfish.death`, `entity.enderfly.ambient`, `entity.enderfly.death`, `entity.enderfly.hurt`, `entity.frost_mauler.hurt`, `entity.gucker.ambient`, `entity.gucker.hurt`, `entity.mosquito.death`, `entity.mosquito.hurt`, `entity.nautilus.death`, `entity.polar_bear.leap`, `entity.pot_golem.hurt`, `entity.pot_golem.step` |
| [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx) (`oga_rd_rpg`) | rubberduck | CC0 1.0 | `entity.piglin_witch.death`, `entity.piglin_witch.trade`, `item.elixir_of_greed.shatter` |
| [9 wet snow steps](https://opengameart.org/content/9-wet-snow-steps) (`oga_wet_snow`) | qubodup | CC0 1.0 | `entity.icebreaker.step`, `item.snowball_launcher.load` |
| [Bear Growls (U.S. Fish & Wildlife Service recordings)](https://opengameart.org/content/bear-growls) (`oga_bear`) | AntumDeluge | CC0 1.0 [16] | `entity.frost_mauler.ambient`, `entity.polar_bear.roar`, `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death`, `entity.zombie_polar_bear.hurt` |
| [Big scary troll sounds (troll-idle-noises)](https://opengameart.org/content/big-scary-troll-sounds) (`oga_troll_idle`) | Darsycho | CC0 1.0 | `entity.frost_mauler.ambient`, `entity.frost_mauler.wake`, `entity.zombie_polar_bear.ambient` |
| [Big scary troll sounds (troll-roars)](https://opengameart.org/content/big-scary-troll-sounds) (`oga_troll_roars`) | Darsycho | CC0 1.0 | `block.frost_mauler_skull.revive`, `entity.dragon_locomotive.roar`, `entity.frost_mauler.death`, `entity.frost_mauler.hurt`, `entity.frost_mauler.roar`, `entity.icebreaker.roar`, `entity.polar_bear.roar` |
| [Cannon fire](https://opengameart.org/content/cannon-fire) (`oga_cannon`) | Thimras | CC0 1.0 | `block.cannon.fire`, `entity.frost_mauler.explode`, `item.snowball_launcher.heavy` |
| [CC0 Deep Monster Roar](https://opengameart.org/content/cc0-deep-monster-roar) (`oga_deep_roar`) | trazzz123 | CC0 1.0 | `curse.sin`, `entity.elder_guardian.roar`, `entity.frost_mauler.death`, `entity.frost_mauler.roar`, `entity.frost_mauler.wake`, `entity.obolisk.ambient` |
| [Fly Swatter Squish sound](https://opengameart.org/content/fly-swatter-squish-sound) (`oga_flyswatter`) | qubodup | CC0 1.0 | `entity.mosquito.death`, `entity.mosquito.stab`, `item.blood.splash` |
| [Genuine Sneeze Sound](https://opengameart.org/content/genuine-sneeze-sound) (`oga_sneeze_qubodup`) | qubodup | CC0 1.0 | `entity.pot_golem.sneeze` |
| [Group giggling](https://opengameart.org/content/group-giggling) (`oga_giggling`) | Nocturnal_Vanguard (AuraVoice) | CC0 1.0 | `entity.pot_golem.giggle` |
| [Ice breaking/shattering](https://opengameart.org/content/ice-breakingshattering) (`oga_ice_shatter`) | IgnasD | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.burst`, `block.frost_mauler_skull.revive`, `block.icicle.shatter`, `entity.frost_mauler.death`, `entity.frost_mauler.explode`, `entity.frost_mauler.wake`, `entity.frost_zombie.death` |
| [Insect or alien scream (short)](https://opengameart.org/content/insect-or-alien-scream-short) (`oga_insect_scream`) | qubodup | CC0 1.0 | `entity.enderfly.death`, `entity.mosquito.death`, `entity.mosquito.hurt` |
| [Mechanical Sounds (clank1)](https://opengameart.org/content/mechanical-sounds) (`oga_mech_clank`) | BMacZero | CC0 1.0 | `block.lift_rail.clank`, `entity.minecart.couple` |
| [Mechanical Sounds (lightclunk1)](https://opengameart.org/content/mechanical-sounds) (`oga_mech_clunk1`) | BMacZero | CC0 1.0 | `block.lift_rail.clank`, `entity.minecart.couple`, `entity.pot_golem.repair`, `item.snowball_launcher.mode` |
| [Mechanical Sounds (lightclunk2)](https://opengameart.org/content/mechanical-sounds) (`oga_mech_clunk2`) | BMacZero | CC0 1.0 | `entity.minecart.couple` |
| [Mechanical Sounds (mechanical1)](https://opengameart.org/content/mechanical-sounds) (`oga_mech1`) | BMacZero | CC0 1.0 | `item.snowball_launcher.mode` |
| [Monster snarls (monster-snarl-5)](https://opengameart.org/content/monster-snarls) (`oga_snarls5`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Monster snarls (monster-snarl-attack)](https://opengameart.org/content/monster-snarls) (`oga_snarls4`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Monster snarls (monster-snarls)](https://opengameart.org/content/monster-snarls) (`oga_snarls1`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Monster snarls (monster-snarls-2)](https://opengameart.org/content/monster-snarls) (`oga_snarls2`) | Darsycho | CC0 1.0 | `entity.ender_dragon.grab`, `entity.frost_mauler.bite`, `entity.gucker.bite` |
| [Monster snarls (monsters-snarls-3)](https://opengameart.org/content/monster-snarls) (`oga_snarls3`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Sneeze](https://opengameart.org/content/sneeze) (`oga_sneeze_zarokima`) | zarokima | CC0 1.0 | `entity.pot_golem.sneeze` |
| [Steam release sounds](https://opengameart.org/content/steam-release-sounds) (`oga_steam_hiss`) | bart | CC0 1.0 [17] | `entity.dragon_locomotive.roar`, `entity.locomotive.chuff`, `entity.player.overheat`, `entity.whale.breathe`, `item.snowball_launcher.overheat` |
| [Steam whistle (steamwhistle)](https://opengameart.org/content/steam-whistle) (`oga_steam_whistle1`) | bart | CC0 1.0 [18] | `entity.locomotive.whistle` |
| [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) (`oga_swishes`) | artisticdude | CC0 1.0 | `item.fang_dagger.slash`, `item.snowball_launcher.fire` |
| [various scissors (garden_shears_01)](https://opengameart.org/content/various-scissors) (`oga_shears1`) | sinny | CC0 1.0 | `entity.icebreaker.shear`, `entity.polar_bear.shear` |
| [various scissors (garden_shears_02)](https://opengameart.org/content/various-scissors) (`oga_shears2`) | sinny | CC0 1.0 | `entity.icebreaker.shear` |
| [wind1 (synthesised wind)](https://opengameart.org/content/wind1) (`oga_wind1`) | Luke.RUSTLTD | CC0 1.0 [19] | `ambient.ice_caves.loop` |
| [Zombie moans](https://opengameart.org/content/zombie-moans) (`oga_zombie_moans`) | Darsycho | CC0 1.0 | `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death` |
| [Zombies Sound Pack](https://opengameart.org/content/zombies-sound-pack) (`oga_zombies`) | artisticdude | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.frost_zombie.death`, `entity.frost_zombie.hurt`, `entity.zombie_polar_bear.hurt` |

## pmel.noaa.gov (NOAA PMEL Acoustics Program)

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Blue whale, Atlantic (10x speed)](https://www.pmel.noaa.gov/acoustics/whales/sounds/sounds_whales_blue.html) (`noaa_pmel_atlblue`) | NOAA Pacific Marine Environmental Laboratory | Public domain (US federal work) [20] | `entity.whale.call`, `entity.whale.song` |
| [Blue whale, NE Pacific (10x speed)](https://www.pmel.noaa.gov/acoustics/whales/sounds/sounds_whales_blue.html) (`noaa_pmel_nepblue`) | NOAA Pacific Marine Environmental Laboratory | Public domain (US federal work) [21] | `entity.whale.call`, `entity.whale.death`, `entity.whale.song` |
| [Blue whale, West Pacific (10x speed)](https://www.pmel.noaa.gov/acoustics/whales/sounds/sounds_whales_blue.html) (`noaa_pmel_wblue`) | NOAA Pacific Marine Environmental Laboratory | Public domain (US federal work) [22] | `entity.whale.call`, `entity.whale.song` |

Notes:

* [1] Caleta Portales - Sea Lion: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [2] Fobney Island Nature Reserve Reading UK - Cracking Lake Ice: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [3] Klondike Park Lake Ice Booms, Augusta, Missouri: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [4] Utena, Lietuva - Lake ice Andromeda: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [5] Bottle clink: page marks it 'License CC0 (public domain): Free and royalty-free'
* [6] Broken plate #3: page marks it 'License CC0 (public domain): Free and royalty-free'
* [7] Grunts: page marks it 'License CC0 (public domain): Free and royalty-free'
* [8] Splash, Small #1: page marks it 'License CC0 (public domain): Free and royalty-free'
* [9] Lion_raring-sound1TamilNadu178.ogg: Own work of the uploader, who released it into the public domain ("I, the copyright holder of this work, release this work into the public domain").
* [10] Humpback whale bubble-feeding and vocalizing: Hydrophone recording made by the National Park Service in Glacier Bay National Park, Alaska; a work of the US federal government, in the public domain (nps.gov: NPS-created audiovisual material is generally public domain).
* [11] Humpback whale contact call (moo): Hydrophone recording made by the National Park Service in Glacier Bay National Park, Alaska; a work of the US federal government, in the public domain (nps.gov: NPS-created audiovisual material is generally public domain).
* [12] Humpback whale feeding call: Hydrophone recording made by the National Park Service in Glacier Bay National Park, Alaska; a work of the US federal government, in the public domain (nps.gov: NPS-created audiovisual material is generally public domain).
* [13] Humpback whale vocals and wheeze-blow: Hydrophone recording made by the National Park Service in Glacier Bay National Park, Alaska; a work of the US federal government, in the public domain (nps.gov: NPS-created audiovisual material is generally public domain).
* [14] 12 wet towel hitting/falling/punching floor sounds: The page states the pack is CC0 as of 2024-08-24 (the older text file inside the archive is superseded).
* [15] 42 Snow and Gravel Footsteps (recorded by Corsica_S, cut by qubodup): Recorded by Corsica_S (freesound); cut and released as CC0 by qubodup with the recordist's permission (stated on the page).
* [16] Bear Growls (U.S. Fish & Wildlife Service recordings): U.S. Fish & Wildlife Service recordings, packaged and released as CC0.
* [17] Steam release sounds: CC0; the author appreciates (does not require) attribution.
* [18] Steam whistle (steamwhistle): CC0; the author appreciates (does not require) attribution.
* [19] wind1 (synthesised wind): Synthesised wind (PureData).
* [20] Blue whale, Atlantic (10x speed): NOAA Pacific Marine Environmental Laboratory hydrophone recording, played 10x faster by NOAA to bring the infrasonic calls into hearing range; a work of the US federal government, in the public domain.
* [21] Blue whale, NE Pacific (10x speed): NOAA Pacific Marine Environmental Laboratory hydrophone recording, played 10x faster by NOAA to bring the infrasonic calls into hearing range; a work of the US federal government, in the public domain.
* [22] Blue whale, West Pacific (10x speed): NOAA Pacific Marine Environmental Laboratory hydrophone recording, played 10x faster by NOAA to bring the infrasonic calls into hearing range; a work of the US federal government, in the public domain.

## Events and their ingredients

| Event | Files | Recordings (source ids) | Synthesis |
|---|---|---|---|
| `block.ice.crack` | 3 | bsb_2205, bsb_2206, bsb_2207, bsb_2208, ia_lake_ice_andromeda, ia_pond_ice | - |
| `block.ancient_ice.crack` | 3 | bsb_2220, bsb_2221, ia_icebooms, ia_lake_ice_andromeda, ia_pond_ice | rumble |
| `block.ancient_ice.break` | 4 | bsb_1643, bsb_2124, bsb_2205, bsb_2206, bsb_2207, oga_ice_shatter, oga_rd_break | thump |
| `block.ancient_ice.step` | 5 | bsb_2123, oga_snow42 | thump |
| `block.ancient_ice.hit` | 4 | bsb_2205, bsb_2207, bsb_2208, oga_rd_break | - |
| `block.ancient_ice.place` | 3 | bsb_2124, bsb_2125, bsb_2126, oga_rd_break | thump |
| `block.ancient_ice.fall` | 3 | oga_rd_break, oga_snow42 | thump |
| `block.ancient_ice.burst` | 3 | bsb_0148, bsb_0387, bsb_1121, oga_ice_shatter, oga_rd_break | thump, whoosh |
| `block.icicle.fall` | 3 | bsb_2127 | whoosh |
| `block.icicle.shatter` | 4 | bsb_0771, bsb_1121, bsb_2041, bsb_2126, oga_ice_shatter, oga_rd_break | - |
| `ambient.ice_caves.loop` | 1 | bsb_0155, bsb_1714, oga_wind1 | rumble, wind |
| `ambient.ice_caves.additions` | 6 | bsb_1384, bsb_1385, bsb_2208, ia_icebooms, ia_lake_ice_andromeda | - |
| `ambient.ice_caves.mood` | 3 | ia_icebooms, ia_lake_ice_andromeda, ia_pond_ice | rumble |
| `event.frozen_tomb.rumble` | 2 | bsb_3113, bsb_3114, ia_icebooms, ia_pond_ice | rumble |
| `entity.icebreaker.ambient` | 4 | bsb_1658, bsb_1659, ia_sealion | - |
| `entity.icebreaker.hurt` | 3 | ia_sealion, oga_rd_creature | thump |
| `entity.icebreaker.death` | 2 | ia_sealion, oga_towel | thump |
| `entity.icebreaker.roar` | 3 | bsb_0546, bsb_2383, bsb_2384, ia_sealion, oga_troll_roars | rumble |
| `entity.icebreaker.ram` | 3 | bsb_0105, bsb_2452, bsb_2453, bsb_2454, bsb_2459, bsb_2460, oga_rd_break | thump |
| `entity.icebreaker.happy` | 3 | ia_sealion, oga_rd_creature | - |
| `entity.icebreaker.step` | 4 | oga_towel, oga_wet_snow | thump |
| `entity.icebreaker.slap` | 3 | bsb_0597, oga_dry_snow, oga_towel | thump |
| `entity.icebreaker.splash` | 3 | bsb_1519, bsb_1520, bsb_1521, oga_rd_water | thump |
| `entity.icebreaker.shear` | 3 | bsb_0008, bsb_0596, bsb_1408, bsb_1409, bsb_2123, bsb_2124, bsb_2125, oga_shears1, oga_shears2 | - |
| `entity.icebreaker.horn_regrow` | 3 | bsb_2079, bsb_2087, bsb_2240 | chime, whoosh |
| `item.snowball_launcher.fire` | 4 | bsb_0138, bsb_1491, bsb_1492, bsb_1493, oga_swishes | thump |
| `item.snowball_launcher.charge` | 3 | bsb_0794, bsb_0795, bsb_1674, bsb_1675, bsb_1824, bsb_2665 | - |
| `item.snowball_launcher.heavy` | 3 | bsb_3113, oga_cannon, oga_rd_bang | thump |
| `item.snowball_launcher.overheat` | 3 | bsb_0227, bsb_0805, bsb_2243, bsb_3589, oga_rd_break, oga_steam_hiss | - |
| `item.snowball_launcher.empty` | 3 | bsb_1985, bsb_1986, bsb_1992, oga_kenney_ui | - |
| `item.snowball_launcher.mode` | 3 | bsb_1988, bsb_1989, bsb_1992, oga_kenney_ui, oga_mech1, oga_mech_clunk1 | - |
| `item.snowball_launcher.load` | 3 | oga_dry_snow, oga_kenney_ui, oga_rd_break, oga_wet_snow | thump |
| `effect.ramming.charged` | 3 | bsb_0285, bsb_0286, bsb_1543 | whoosh |
| `effect.ramming.impact` | 3 | bsb_0596, bsb_1408, bsb_1409, bsb_2452, bsb_2453, bsb_2455, oga_rd_break | thump |
| `entity.locomotive.whistle` | 4 | bsb_0226, bsb_3316, bsb_3319, oga_steam_whistle1 | - |
| `entity.locomotive.chuff` | 4 | bsb_3310, bsb_3311, oga_steam_hiss | noise, thump |
| `entity.dragon_locomotive.roar` | 3 | bsb_0227, bsb_0228, bsb_0616, bsb_0901, cw_lion, oga_steam_hiss, oga_troll_roars | - |
| `block.lift_rail.clank` | 3 | bsb_0359, bsb_0619, oga_mech_clank, oga_mech_clunk1 | - |
| `block.booster_rail.boost` | 3 | bsb_0134, bsb_0952 | tone, whoosh |
| `entity.minecart.couple` | 3 | bsb_0355, bsb_0360, bsb_0361, oga_mech_clank, oga_mech_clunk1, oga_mech_clunk2, oga_rd_break | - |
| `block.snow_globe.shake` | 3 | bsb_1867, bsb_1870, bsb_1871, bsb_2079, bsb_2087, bsb_2088, bsb_2123, bsb_2124, bsb_2125, bsb_2126, bsb_2127, bsb_2128 | chime |
| `entity.player.shiver` | 3 | bsb_1103, bsb_2190, bsb_2195 | - |
| `entity.player.overheat` | 3 | bsb_1694, bsb_1695, bsb_1696, oga_steam_hiss | - |
| `entity.frost_mauler.ambient` | 4 | bsb_0285, bsb_1543, cw_lion, oga_bear, oga_troll_idle | - |
| `entity.frost_mauler.hurt` | 3 | cw_lion, oga_rd_creature, oga_rd_creature2, oga_troll_roars | thump |
| `entity.frost_mauler.death` | 2 | cw_lion, ia_icebooms, ia_pond_ice, oga_deep_roar, oga_ice_shatter, oga_troll_roars | - |
| `entity.frost_mauler.roar` | 3 | bsb_3617, cw_lion, oga_deep_roar, oga_troll_roars | chime, noise, rumble |
| `entity.frost_mauler.claw` | 3 | bsb_0127, bsb_1796, bsb_1800, bsb_1801, bsb_2205, bsb_2459, bsb_2460, bsb_2461 | - |
| `entity.frost_mauler.bite` | 3 | bsb_0596, bsb_1408, bsb_1409, oga_rd_break, oga_snarls2 | thump |
| `entity.frost_mauler.fury` | 3 | oga_snarls1, oga_snarls3, oga_snarls4, oga_snarls5 | - |
| `entity.frost_mauler.stunned` | 3 | bsb_0286, bsb_0287, bsb_1543, bsb_3618, oga_rd_creature | - |
| `entity.frost_mauler.step` | 4 | bsb_2452, bsb_2453, bsb_2454, bsb_2455, oga_snow42 | thump |
| `entity.frost_mauler.wake` | 2 | bsb_0148, bsb_0387, oga_deep_roar, oga_ice_shatter, oga_troll_idle | thump |
| `entity.frost_mauler.breath` | 3 | bsb_0285, bsb_0286, bsb_0287, bsb_1405, bsb_1602, bsb_1603 | noise |
| `entity.frost_mauler.explode` | 2 | bsb_0148, bsb_0387, oga_cannon, oga_ice_shatter, oga_rd_bang | thump, whoosh |
| `entity.polar_bear.roar` | 3 | cw_lion, oga_bear, oga_troll_roars | - |
| `entity.polar_bear.leap` | 3 | bsb_1796, bsb_1800, bsb_1801, oga_rd_creature, oga_rd_creature2 | - |
| `entity.polar_bear.slam` | 3 | bsb_0208, bsb_2452, bsb_2453, bsb_2454, oga_dry_snow | thump |
| `entity.polar_bear.munch` | 3 | bsb_0352, bsb_0497, oga_rd_creature, oga_rd_water | - |
| `entity.polar_bear.calm` | 3 | bsb_0285, bsb_0287, bsb_1404, bsb_1405, bsb_1543 | - |
| `entity.polar_bear.shear` | 3 | bsb_0008, bsb_1104, oga_shears1 | - |
| `entity.zombie_polar_bear.ambient` | 3 | bsb_2106, bsb_2107, bsb_2108, oga_bear, oga_troll_idle, oga_zombie_moans | - |
| `entity.zombie_polar_bear.hurt` | 3 | bsb_2110, bsb_2111, oga_bear, oga_rd_creature, oga_zombies | - |
| `entity.zombie_polar_bear.death` | 2 | bsb_1408, bsb_1409, bsb_2106, bsb_2107, oga_bear, oga_zombie_moans | - |
| `entity.frost_zombie.ambient` | 3 | bsb_2106, bsb_2108, bsb_2112, oga_zombies | crackle |
| `entity.frost_zombie.hurt` | 3 | bsb_2205, oga_zombies | - |
| `entity.frost_zombie.death` | 2 | bsb_2107, bsb_2109, oga_ice_shatter, oga_rd_break, oga_zombies | - |
| `entity.frost_zombie.step` | 4 | oga_dry_snow, oga_snow42 | crackle |
| `item.armor.equip_fur` | 3 | bsb_0576, bsb_1104, bsb_1788, bsb_1789 | - |
| `item.fang_dagger.slash` | 5 | bsb_0128, oga_swishes | chime |
| `item.fang_dagger.pounce` | 3 | bsb_1787, bsb_1788, bsb_1796, bsb_1800, bsb_1801 | - |
| `item.fang_dagger.crit` | 3 | bsb_2039, bsb_2041, bsb_2042, bsb_2459, bsb_2460, bsb_2461 | chime |
| `item.fang_dagger.tired` | 3 | bsb_1404, bsb_1405, oga_rd_break | - |
| `item.fang_dagger.ready` | 3 | bsb_1335, bsb_2886 | chime |
| `block.frost_mauler_skull.ignite` | 2 | ia_pond_ice | noise, tone |
| `block.frost_mauler_skull.revive` | 2 | bsb_0148, bsb_0387, cw_lion, oga_ice_shatter, oga_rd_bang, oga_troll_roars | thump, whoosh |
| `entity.mosquito.buzz` | 4 | bsb_0759, bsb_1001 | tone |
| `entity.mosquito.stab` | 3 | bsb_0548, oga_flyswatter, oga_kenney_ui, oga_rd_break | whoosh |
| `entity.mosquito.drink` | 3 | bsb_0508, bsb_1244, bsb_1246 | - |
| `entity.mosquito.spit` | 3 | bsb_2124, bsb_2126, oga_rd_break, oga_rd_creature | - |
| `entity.mosquito.hurt` | 3 | oga_insect_scream, oga_rd_creature, oga_rd_creature2 | tone |
| `entity.mosquito.death` | 2 | bsb_1001, oga_flyswatter, oga_insect_scream, oga_rd_creature, oga_rd_creature2 | tone |
| `entity.pot_golem.step` | 4 | bsb_2452, bsb_2453, bsb_2454, bsb_2455, oga_rd_creature2, oga_rd_water | thump |
| `entity.pot_golem.hurt` | 3 | oga_rd_100, oga_rd_break, oga_rd_creature2, oga_rd_water | thump |
| `entity.pot_golem.death` | 2 | bsb_1643, bsb_1645, bsb_2205, bsb_2206, oga_rd_100, oga_rd_break, oga_rd_water | thump |
| `entity.pot_golem.giggle` | 4 | bsb_0980, bsb_1419, oga_giggling | - |
| `entity.pot_golem.sneeze` | 2 | bsb_0609, bsb_1404, oga_sneeze_qubodup, oga_sneeze_zarokima | thump |
| `entity.pot_golem.howl` | 2 | bsb_2450, bsb_2451, oga_rd_creature | - |
| `entity.pot_golem.beam` | 2 | bsb_3113, oga_rd_bang | noise, thump, tone, whoosh |
| `entity.pot_golem.fuse` | 2 | bsb_0004, bsb_1306, bsb_1307 | - |
| `entity.pot_golem.crack` | 3 | bsb_1646, bsb_1648, bsb_1650, bsb_2205, bsb_2207, oga_rd_100, oga_rd_break | - |
| `entity.pot_golem.shatter` | 3 | bsb_1643, bsb_1645, bsb_1647, oga_rd_100, oga_rd_break | thump |
| `entity.pot_golem.repair` | 3 | bsb_0623, oga_kenney_ui, oga_mech_clunk1, oga_rd_100 | - |
| `entity.pot_golem.build` | 2 | bsb_0211, bsb_0648, bsb_2240 | chime, thump, whoosh |
| `block.amber.release` | 3 | bsb_0462, bsb_0648, bsb_1074, bsb_2205, bsb_2206, bsb_2207 | chime |
| `item.blood.splash` | 3 | bsb_0334, bsb_1529, bsb_1531, bsb_1532, bsb_2593, oga_flyswatter, oga_rd_water | - |
| `entity.sniffer.tame` | 3 | bsb_0285, bsb_0286, bsb_1543, oga_rd_creature | tone |
| `block.elixir_jar.bubble` | 3 | bsb_0149, bsb_0491, bsb_3561, bsb_3562 | - |
| `block.elixir_jar.fill` | 3 | bsb_0487, bsb_0592 | - |
| `block.elixir_jar.brewed` | 3 | bsb_0150, bsb_0183 | chime |
| `block.soul_tank.absorb` | 3 | bsb_2046, bsb_2049, bsb_2052 | whoosh |
| `block.soul_tank.hum` | 2 | bsb_2054, bsb_2055 | noise, tone |
| `block.hexing_table.hex` | 2 | bsb_0987, bsb_1340, bsb_1483, bsb_1485, bsb_2047, bsb_2048, bsb_2049, bsb_2050, bsb_2051, bsb_2053 | thump, whoosh |
| `block.hexing_table.whisper` | 4 | bsb_1076, bsb_3255, bsb_3256 | - |
| `item.hexed_book.whisper` | 3 | bsb_3255, bsb_3256 | - |
| `item.elixir.drink` | 3 | bsb_3247, bsb_3249, oga_rd_water | - |
| `item.elixir_of_greed.shatter` | 3 | bsb_0148, bsb_1532, bsb_1694, bsb_1695, bsb_1696, bsb_2041, oga_rd_break, oga_rd_rpg | - |
| `entity.piglin_witch.ambient` | 4 | bsb_0486, bsb_0784, bsb_1658, bsb_1659 | - |
| `entity.piglin_witch.hiccup` | 3 | bsb_0489, bsb_0784, bsb_1658, bsb_1659 | - |
| `entity.piglin_witch.drink` | 2 | bsb_1658, bsb_1659, bsb_3247, bsb_3249, oga_rd_water | - |
| `entity.piglin_witch.burp` | 3 | bsb_0242, bsb_1338, bsb_1658, bsb_1659, bsb_1709, oga_rd_creature | - |
| `entity.piglin_witch.rummage` | 3 | bsb_0487, bsb_0576, bsb_0596, bsb_1104, bsb_1408, bsb_1409, oga_rd_metalwood | - |
| `entity.piglin_witch.refuse` | 3 | bsb_0285, bsb_0784, bsb_1095, bsb_1658, bsb_1659 | - |
| `entity.piglin_witch.cackle` | 3 | bsb_0489, bsb_0784, bsb_1658, bsb_1659, bsb_2093 | - |
| `entity.piglin_witch.hurt` | 3 | bsb_1658, bsb_1659, oga_rd_creature | - |
| `entity.piglin_witch.death` | 2 | bsb_0487, bsb_1658, bsb_1659, bsb_2111, bsb_2112, bsb_2452, bsb_2453, oga_rd_rpg | - |
| `entity.piglin_witch.trade` | 3 | bsb_0339, bsb_1658, bsb_1659, oga_rd_rpg | - |
| `entity.golden_piglin.groan` | 3 | bsb_0486, bsb_0616, bsb_0779, bsb_1159, bsb_1658 | - |
| `entity.golden_piglin.creak` | 3 | bsb_0322, bsb_0323, bsb_0616, bsb_1159 | - |
| `entity.golden_piglin.hurt` | 3 | bsb_1658, bsb_1659, bsb_3589, oga_rd_metalwood | - |
| `entity.golden_piglin.death` | 2 | bsb_0193, bsb_0486, bsb_1658, oga_rd_break, oga_rd_metalwood | thump |
| `curse.trigger` | 3 | bsb_1482, bsb_1483, bsb_1484, bsb_2048, bsb_2050, bsb_2053 | thump, tone |
| `curse.narcissus` | 2 | bsb_0218, bsb_1384 | chime, noise |
| `curse.orpheus` | 2 | bsb_2047, bsb_2051 | pluck, whoosh |
| `curse.sin` | 2 | bsb_1483, bsb_1485, oga_deep_roar | thump, tone |
| `entity.enderfly.ambient` | 4 | bsb_0164, bsb_1020, bsb_2212, bsb_3089, oga_rd_creature, oga_rd_creature2 | clicks |
| `entity.enderfly.flutter` | 3 | bsb_0164, bsb_0840, bsb_1833, bsb_2212, bsb_2891, bsb_2893 | - |
| `entity.enderfly.hurt` | 3 | bsb_0164, bsb_1020, bsb_2212, bsb_3089, oga_rd_creature, oga_rd_creature2 | chime |
| `entity.enderfly.death` | 2 | bsb_2685, bsb_2686, bsb_2891, bsb_2893, oga_insect_scream, oga_rd_creature2 | chime, tone |
| `entity.enderfly.teleport` | 3 | bsb_1328, bsb_1335 | chime, tone, whoosh |
| `entity.enderfly.dive` | 3 | bsb_1020, bsb_1796, bsb_2891, bsb_2893 | tone, whoosh |
| `entity.endling.ambient` | 4 | bsb_0231, oga_rd_creature | - |
| `entity.endling.hurt` | 3 | bsb_0231, bsb_0390, bsb_0494, oga_rd_creature | - |
| `entity.endling.death` | 2 | bsb_0390 | chime, noise, tone |
| `entity.endling.happy` | 3 | bsb_0231, oga_rd_creature | chime |
| `entity.endling.scared` | 3 | bsb_0390, bsb_0494, oga_rd_creature | tone |
| `entity.endling.teleport` | 3 | oga_rd_creature | chime, tone, whoosh |
| `entity.endling.sacrifice` | 2 | bsb_0231, bsb_1110, bsb_2553 | chime, noise, whoosh |
| `entity.gucker.ambient` | 4 | bsb_0150, bsb_0491, bsb_0819, oga_rd_creature, oga_rd_creature2 | - |
| `entity.gucker.hurt` | 3 | bsb_0819, oga_rd_creature, oga_rd_creature2 | - |
| `entity.gucker.death` | 2 | bsb_0495, bsb_0819, bsb_2452, oga_rd_creature | thump |
| `entity.gucker.breathe` | 3 | bsb_0285, bsb_0286, bsb_1543, bsb_1602, bsb_1603, bsb_1635 | - |
| `entity.gucker.burrow` | 3 | bsb_0580, bsb_1305, bsb_1635, oga_rd_creature | rumble |
| `entity.gucker.emerge` | 3 | bsb_0819, bsb_1022, bsb_1635, oga_rd_break | thump, whoosh |
| `entity.gucker.inflate` | 3 | bsb_1129, bsb_1130, oga_rd_creature | tone |
| `entity.gucker.spit` | 3 | bsb_0138, bsb_2685, bsb_2686, oga_rd_creature | noise |
| `entity.gucker.bite` | 3 | bsb_0596, bsb_1299, bsb_1300, oga_rd_creature, oga_snarls2 | thump |
| `entity.gucker.step` | 4 | bsb_0495, bsb_2452 | thump |
| `entity.obolisk.ambient` | 3 | bsb_0580, bsb_1022, oga_deep_roar | rumble |
| `entity.obolisk.rise` | 2 | bsb_0580, bsb_1022, bsb_1836, bsb_2553 | rumble, thump |
| `entity.obolisk.settle` | 2 | bsb_0580, bsb_1022, bsb_1835 | rumble, thump |
| `entity.obolisk.slam` | 3 | bsb_1022, bsb_1835, bsb_1836, bsb_2452, bsb_3113, oga_rd_break | thump, whoosh |
| `entity.obolisk.step` | 4 | bsb_0580, bsb_1835, bsb_1836 | thump |
| `entity.obolisk.hurt` | 3 | bsb_0580, bsb_2205, bsb_2206, bsb_2207, oga_rd_break, oga_rd_creature | thump |
| `entity.obolisk.death` | 2 | bsb_0580, bsb_1022, bsb_3113, oga_rd_break, oga_rd_creature | thump |
| `entity.monolith.ambient` | 3 | bsb_1109, bsb_3033, bsb_3034, bsb_3036 | rumble, tone |
| `entity.monolith.stare` | 2 | bsb_2553, bsb_3033, bsb_3036 | tone |
| `entity.monolith.slam` | 3 | bsb_1022, bsb_1835, bsb_1836, bsb_2452, bsb_3113, oga_rd_bang, oga_rd_break | thump, whoosh |
| `entity.monolith.grab` | 2 | bsb_0118, bsb_0580, bsb_1408, bsb_1409 | thump, whoosh |
| `entity.monolith.clap` | 2 | bsb_1767, bsb_3113, oga_rd_bang | rumble, thump, whoosh |
| `entity.monolith.summon` | 2 | bsb_1485, bsb_3033, bsb_3034, bsb_3036 | rumble |
| `entity.monolith.hurt` | 3 | bsb_1110, bsb_2205, bsb_2206, bsb_2207, bsb_2553, oga_rd_break | thump |
| `entity.monolith.death` | 2 | bsb_0148, bsb_1022, bsb_1110, bsb_3033, bsb_3034, bsb_3113, oga_rd_bang, oga_rd_break | rumble, thump, tone |
| `entity.dragonling.ambient` | 4 | bsb_0430, bsb_0431, bsb_0672, bsb_1885, oga_rd_creature | - |
| `entity.dragonling.hurt` | 3 | bsb_0430, bsb_0431, bsb_0672, bsb_1881, bsb_1882, oga_rd_creature | - |
| `entity.dragonling.death` | 2 | bsb_0430, bsb_0431, bsb_1881, bsb_1882, bsb_2452 | tone |
| `entity.dragonling.eat` | 3 | bsb_0430, bsb_1113, bsb_1408, bsb_1594, oga_rd_creature | - |
| `entity.dragonling.roar` | 3 | bsb_0430, bsb_0672, bsb_1881, bsb_1882, bsb_1885, oga_rd_creature | - |
| `entity.dragonling.flap` | 4 | bsb_1788, bsb_2891, bsb_2893 | noise, whoosh |
| `entity.dragonling.breath` | 2 | bsb_0930, bsb_1340, bsb_1341, bsb_1602, bsb_1603 | crackle, whoosh |
| `entity.dragonling.hatch` | 2 | bsb_0050, bsb_0334, bsb_0430, bsb_0431, bsb_1299, bsb_1300 | chime |
| `item.dragon_egg.crack` | 3 | bsb_0050, bsb_1299, bsb_1300, bsb_2205 | chime, thump |
| `entity.ender_dragon.grab` | 2 | bsb_0596, bsb_1796, bsb_1800, bsb_2459, bsb_2460, oga_rd_creature, oga_snarls2 | thump, whoosh |
| `entity.ender_dragon.throw` | 2 | bsb_0155, bsb_1714, bsb_1801 | whoosh, wind |
| `entity.ender_dragon.beam_charge` | 2 | bsb_0950 | rumble, tone, whoosh |
| `entity.ender_dragon.beam_fire` | 2 | bsb_0930, bsb_0950 | thump, tone |
| `entity.ender_dragon.crystal_regrow` | 2 | bsb_1328, bsb_1335, bsb_1687, bsb_2079 | chime, whoosh |
| `entity.ender_dragon.tower_grow` | 2 | bsb_0580, bsb_1022, bsb_3113 | rumble |
| `item.end_glider.flap` | 3 | bsb_1788, bsb_2891, bsb_2893 | noise, whoosh |
| `item.end_glider.jet` | 3 | bsb_0930 | noise, tone |
| `item.end_glider.boost` | 2 | bsb_0930, bsb_1796, bsb_1801 | thump, whoosh |
| `item.obsidian_shield.reflect` | 3 | bsb_1084, bsb_1328, bsb_1335, bsb_2243, bsb_3589 | noise, thump |
| `item.obsidian_shield.shockwave` | 2 | bsb_1022, bsb_3589, oga_rd_bang | thump, whoosh |
| `item.monolith_wand.petrify` | 3 | bsb_0134, bsb_0952, bsb_2205, bsb_2206, bsb_2207 | chime, tone |
| `effect.petrified.encase` | 3 | bsb_0580, bsb_1022, bsb_2205, bsb_2206, bsb_2207 | crackle, thump |
| `effect.petrified.shatter` | 3 | bsb_0148, bsb_0387, bsb_1022, bsb_1643, bsb_1645, bsb_1647, oga_rd_break | thump |
| `ambient.eclipse.begin` | 1 | bsb_1109, bsb_1485, bsb_2553, bsb_3033, bsb_3036 | chime, wind |
| `ambient.eclipse.end` | 1 | bsb_1110, bsb_3033, bsb_3036 | chime, whoosh, wind |
| `ambient.eclipse.loop` | 1 | bsb_1109, bsb_1714, bsb_3036 | chime, noise, wind |
| `block.end_bloom.open` | 3 | bsb_0399, bsb_0462 | chime, whoosh |
| `block.chorus_cocoon.crack` | 3 | bsb_0050, bsb_0334, bsb_1299, bsb_1300, bsb_2212 | - |
| `block.chorus_cocoon.hatch` | 2 | bsb_0334, bsb_1020, bsb_1299, bsb_1300, bsb_2212, bsb_2891, bsb_2893 | - |
| `block.meteorite.hum` | 3 | bsb_0987, bsb_1109 | crackle, tone |
| `effect.recall.teleport` | 2 | bsb_1328, bsb_1335 | chime, thump, tone, whoosh |
| `entity.anglerfish.ambient` | 4 | bsb_1281, bsb_1652, bsb_1653, bsb_1654, bsb_3177, bsb_3427, bsb_3428, bsb_3562, oga_rd_creature, oga_rd_water | - |
| `entity.anglerfish.hurt` | 3 | bsb_1281, bsb_1653, oga_rd_creature, oga_rd_water | - |
| `entity.anglerfish.death` | 2 | bsb_1654, bsb_3177, oga_rd_creature2, oga_rd_water | - |
| `entity.anglerfish.lunge` | 3 | bsb_1513, oga_rd_water | whoosh |
| `entity.anglerfish.bite` | 3 | bsb_1262, oga_rd_creature, oga_rd_water | thump |
| `entity.anglerfish.flop` | 3 | oga_rd_water, oga_towel | - |
| `entity.lionfish.hurt` | 3 | bsb_1262, oga_rd_water | - |
| `entity.lionfish.death` | 2 | oga_rd_water | - |
| `entity.lionfish.flare` | 3 | bsb_0371, bsb_0464, bsb_0923, bsb_1787, oga_rd_water | whoosh |
| `entity.lionfish.flop` | 3 | oga_towel | - |
| `entity.nautilus.ambient` | 4 | bsb_0150, bsb_1038, bsb_1245, bsb_3427, bsb_3428, bsb_3429, oga_rd_water | - |
| `entity.nautilus.hurt` | 3 | bsb_0922, oga_rd_creature, oga_rd_water | - |
| `entity.nautilus.death` | 2 | bsb_0921, oga_rd_creature2, oga_rd_water | thump |
| `entity.nautilus.dash` | 3 | bsb_0324, bsb_1491, oga_rd_water | whoosh |
| `entity.whale.song` | 3 | noaa_pmel_atlblue, noaa_pmel_nepblue, noaa_pmel_wblue, nps_glba_bubblenet, nps_glba_moo | noise, tone |
| `entity.whale.call` | 3 | noaa_pmel_atlblue, noaa_pmel_nepblue, noaa_pmel_wblue, nps_glba_feeding, nps_glba_moo | noise, tone |
| `entity.whale.breathe` | 3 | bsb_0138, bsb_0227, bsb_0285, bsb_1543, bsb_1602, bsb_1603, nps_glba_wheezeblow, oga_rd_water, oga_steam_hiss | noise |
| `entity.whale.hurt` | 3 | bsb_2452, nps_glba_bubblenet | noise, thump, tone |
| `entity.whale.death` | 2 | noaa_pmel_nepblue, nps_glba_bubblenet, oga_rd_water | noise, rumble, tone |
| `entity.whale.swallow` | 2 | bsb_1281, bsb_3177, bsb_3247, bsb_3249, bsb_3430 | thump, whoosh |
| `entity.whale.mouth_open` | 2 | bsb_3205, bsb_3208, bsb_3430 | rumble, whoosh |
| `entity.whale.mouth_close` | 2 | bsb_0739, bsb_1514, bsb_2338, bsb_2341, bsb_3211, oga_towel | thump |
| `entity.whale.shake` | 2 | bsb_1519, bsb_1520, bsb_1521, bsb_3426 | rumble, thump |
| `entity.whale.eat` | 3 | bsb_0407, bsb_0596, bsb_0720, bsb_1114, bsb_1408, bsb_1409, bsb_1432 | thump |
| `entity.whale.note` | 1 | none (fully synthesised) | noise, tone |
| `entity.whale.tamed` | 2 | bsb_1867, bsb_1871, bsb_2079, bsb_2087 | chime, noise, tone, whoosh |
| `ambient.whale_belly.loop` | 1 | bsb_1280, bsb_1281, bsb_1384, bsb_1654, bsb_3176, bsb_3177, bsb_3178, bsb_3426, bsb_3430 | noise, rumble, thump |
| `ambient.whale_belly.current` | 2 | bsb_3430, nps_glba_bubblenet, oga_rd_water | noise, wind |
| `entity.elder_guardian.bubble` | 3 | bsb_3427, bsb_3428, bsb_3429, nps_glba_bubblenet, oga_rd_water | thump, whoosh |
| `entity.elder_guardian.stare_charge` | 2 | oga_rd_water | noise, tone, whoosh |
| `entity.elder_guardian.laser` | 2 | bsb_0134, bsb_0950, bsb_0952 | noise, thump, tone |
| `entity.elder_guardian.tail_whip` | 3 | bsb_1513, bsb_1796, bsb_1800, bsb_1801, oga_rd_water | whoosh |
| `entity.elder_guardian.roar` | 2 | cw_lion, oga_deep_roar, oga_rd_water | rumble |
| `block.hydrothermal_vent.loop` | 1 | bsb_0149, bsb_0150, bsb_0227, bsb_3427, bsb_3429 | rumble |
| `block.tube_worms.retract` | 3 | bsb_1262, oga_rd_water | thump, whoosh |
| `block.tube_worms.extend` | 3 | bsb_1245, bsb_3428, oga_rd_water | whoosh |
| `block.angler_light.hum` | 3 | bsb_1109 | noise, tone |
| `block.whale_lure.pulse` | 3 | bsb_1920, bsb_3427 | chime, tone |
| `block.eye_of_the_ocean.ambient` | 3 | bsb_1109, bsb_3430 | tone |
| `block.eye_of_the_ocean.activate` | 2 | bsb_3360, bsb_3430 | chime, noise, thump, tone, whoosh |
| `block.cannon.fire` | 3 | bsb_1023, bsb_1807, bsb_1808, oga_cannon, oga_rd_bang | thump |
| `block.cannon.load` | 3 | bsb_0201, bsb_0995, oga_rd_metalwood | thump |
| `block.cannon.aim` | 3 | bsb_3207, bsb_3426, oga_rd_metalwood | - |
| `entity.cannonball.burst` | 3 | bsb_1022, bsb_1807, oga_rd_100, oga_rd_bang | rumble, thump |
| `item.turtle_shell.retreat` | 3 | bsb_0922, bsb_1104 | thump |
| `block.barnacles.break` | 3 | bsb_0038, bsb_0596, bsb_1408, bsb_1409, bsb_1595, bsb_1596, bsb_1645 | thump |
| `item.nautilus_horn.bind` | 2 | bsb_2079, bsb_2087 | chime, noise, tone |
| `item.nautilus_horn.command` | 3 | bsb_1049, bsb_2524 | noise, tone |

## Licences

* CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
* Public Domain Mark 1.0: https://creativecommons.org/publicdomain/mark/1.0/
* BigSoundBank: every sound used is marked "License CC0 (public domain): Free and royalty-free" on its page; site terms at https://bigsoundbank.com/licenses.html (CC0 1.0 Universal).
* OpenGameArt: every page used lists CC0 as its licence.
* US federal government works (NOAA, National Park Service): recordings made by federal staff are not subject to copyright in the US (17 U.S.C. 105) and are in the public domain; nps.gov states that audiovisual material the National Park Service creates is generally in the public domain (https://www.nps.gov/aboutus/disclaimer.htm).
