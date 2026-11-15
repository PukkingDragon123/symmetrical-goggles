# Winterworks sound credits

Every sound in `src/main/resources/assets/winterworks/sounds/` is made by `tools/sounds/build_sounds.py` from the recordings listed here (trimmed, layered, re-pitched, filtered, reverberated and normalised; see `tools/sounds/recipes.json`), plus procedural synthesis (numpy noise, tones, chimes, thumps, wind).
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
| [A Mirror Explodes](https://bigsoundbank.com/mirror-explodes-s0387.html) (`bsb_0387`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.burst`, `block.frost_mauler_skull.revive`, `entity.frost_mauler.explode`, `entity.frost_mauler.wake` |
| [Air](https://bigsoundbank.com/air-s0138.html) (`bsb_0138`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.fire` |
| [Anvil #1](https://bigsoundbank.com/anvil-1-s3589.html) (`bsb_3589`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.overheat` |
| [Blow hard #1](https://bigsoundbank.com/blow-hard-1-s1602.html) (`bsb_1602`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.breath` |
| [Blow Hard #2](https://bigsoundbank.com/blow-hard-2-s1603.html) (`bsb_1603`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.breath` |
| [Body Fall #1](https://bigsoundbank.com/body-fall-1-s2452.html) (`bsb_2452`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.step`, `entity.icebreaker.ram`, `entity.polar_bear.slam` |
| [Body Fall #2](https://bigsoundbank.com/body-fall-2-s2453.html) (`bsb_2453`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.step`, `entity.icebreaker.ram`, `entity.polar_bear.slam` |
| [Body fall #3](https://bigsoundbank.com/body-fall-3-s2454.html) (`bsb_2454`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.step`, `entity.icebreaker.ram`, `entity.polar_bear.slam` |
| [Body fall #4](https://bigsoundbank.com/body-fall-4-s2455.html) (`bsb_2455`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.step` |
| [Bones cracking #1](https://bigsoundbank.com/bones-cracking-s0596.html) (`bsb_0596`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.bite`, `entity.icebreaker.shear` |
| [Bones cracking #2](https://bigsoundbank.com/bones-cracking-2-s1408.html) (`bsb_1408`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.bite`, `entity.icebreaker.shear`, `entity.zombie_polar_bear.death` |
| [Bones cracking #3](https://bigsoundbank.com/bones-cracking-3-s1409.html) (`bsb_1409`) | Joseph Sardin | CC0 1.0 | `effect.ramming.impact`, `entity.frost_mauler.bite`, `entity.icebreaker.shear`, `entity.zombie_polar_bear.death` |
| [Breath horse #3](https://bigsoundbank.com/breath-horse-3-s0287.html) (`bsb_0287`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.breath`, `entity.frost_mauler.stunned`, `entity.polar_bear.calm` |
| [Breath Horse #4](https://bigsoundbank.com/breath-horse-4-s1543.html) (`bsb_1543`) | Joseph Sardin | CC0 1.0 | `effect.ramming.charged`, `entity.frost_mauler.ambient`, `entity.frost_mauler.stunned`, `entity.polar_bear.calm` |
| [Breath of a horse #1](https://bigsoundbank.com/breath-of-a-horse-1-s0285.html) (`bsb_0285`) | Joseph Sardin | CC0 1.0 | `effect.ramming.charged`, `entity.frost_mauler.ambient`, `entity.frost_mauler.breath`, `entity.polar_bear.calm` |
| [Breath of a horse #2](https://bigsoundbank.com/breath-of-a-horse-2-s0286.html) (`bsb_0286`) | Joseph Sardin | CC0 1.0 | `effect.ramming.charged`, `entity.frost_mauler.breath`, `entity.frost_mauler.stunned` |
| [Breathless Man](https://bigsoundbank.com/breathless-man-s1103.html) (`bsb_1103`) | Joseph Sardin | CC0 1.0 | `entity.player.shiver` |
| [Broken Christmas Ball #1](https://bigsoundbank.com/broken-christmas-ball-1-s1121.html) (`bsb_1121`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.burst`, `block.icicle.shatter` |
| [Broken glass](https://bigsoundbank.com/broken-glass-s0771.html) (`bsb_0771`) | Joseph Sardin | CC0 1.0 | `block.icicle.shatter` |
| [Broken Plate #1](https://bigsoundbank.com/broken-plate-1-s1643.html) (`bsb_1643`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break` |
| [Bulb bursting #1](https://bigsoundbank.com/bulb-bursting-1-s2039.html) (`bsb_2039`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.crit` |
| [Bulb bursting #3](https://bigsoundbank.com/bulb-bursting-3-s2041.html) (`bsb_2041`) | Joseph Sardin | CC0 1.0 | `block.icicle.shatter`, `item.fang_dagger.crit` |
| [Bulb bursting #4](https://bigsoundbank.com/bulb-bursting-4-s2042.html) (`bsb_2042`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.crit` |
| [Canvas bag on floor](https://bigsoundbank.com/canvas-bag-on-floor-s0576.html) (`bsb_0576`) | Joseph Sardin | CC0 1.0 | `item.armor.equip_fur` |
| [Chattering teeth #2](https://bigsoundbank.com/chattering-teeth-2-s2190.html) (`bsb_2190`) | Joseph Sardin | CC0 1.0 | `entity.player.shiver` |
| [Cheers, Champagne Flute #1](https://bigsoundbank.com/cheers-champagne-flute-1-s1335.html) (`bsb_1335`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.ready` |
| [Chimes "butterfly" #1](https://bigsoundbank.com/chimes-butterfly-1-s2087.html) (`bsb_2087`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake`, `entity.icebreaker.horn_regrow` |
| [Chimes "butterfly" #2](https://bigsoundbank.com/chimes-butterfly-2-s2088.html) (`bsb_2088`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Chimes "Dream" #1](https://bigsoundbank.com/chimes-dream-1-s2079.html) (`bsb_2079`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake`, `entity.icebreaker.horn_regrow` |
| [Clink of glass, Toast #1](https://bigsoundbank.com/clink-of-glass-toast-1-s2886.html) (`bsb_2886`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.ready` |
| [Cow Moos #1](https://bigsoundbank.com/cow-moos-s0546.html) (`bsb_0546`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.roar` |
| [Cow moos #3](https://bigsoundbank.com/cow-moos-3-s2383.html) (`bsb_2383`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.roar` |
| [Cow moos #4](https://bigsoundbank.com/cow-moos-4-s2384.html) (`bsb_2384`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.roar` |
| [Cracking ice #1](https://bigsoundbank.com/cracking-ice-1-s2205.html) (`bsb_2205`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.hit`, `block.ice.crack`, `entity.frost_mauler.claw`, `entity.frost_zombie.hurt` |
| [Cracking ice #2](https://bigsoundbank.com/cracking-ice-2-s2206.html) (`bsb_2206`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break`, `block.ice.crack` |
| [Cracking ice #3](https://bigsoundbank.com/cracking-ice-3-s2207.html) (`bsb_2207`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.hit`, `block.ice.crack` |
| [Cracking ice #4](https://bigsoundbank.com/cracking-ice-4-s2208.html) (`bsb_2208`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.additions`, `block.ancient_ice.hit`, `block.ice.crack` |
| [Creaking metallic door](https://bigsoundbank.com/creaking-metallic-door-s0616.html) (`bsb_0616`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar` |
| [Defrost #2](https://bigsoundbank.com/defrost-2-s2220.html) (`bsb_2220`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.crack` |
| [Defrost #3](https://bigsoundbank.com/defrost-3-s2221.html) (`bsb_2221`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.crack` |
| [Drops of water #1](https://bigsoundbank.com/drops-of-water-1-s1384.html) (`bsb_1384`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.additions` |
| [Drops of water #2](https://bigsoundbank.com/drops-of-water-2-s1385.html) (`bsb_1385`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.additions` |
| [Electric shock](https://bigsoundbank.com/electric-shock-s0134.html) (`bsb_0134`) | Joseph Sardin | CC0 1.0 | `block.booster_rail.boost` |
| [Flag #1](https://bigsoundbank.com/flag-1-s1787.html) (`bsb_1787`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.pounce` |
| [Flag #2](https://bigsoundbank.com/flag-2-s1788.html) (`bsb_1788`) | Joseph Sardin | CC0 1.0 | `item.armor.equip_fur`, `item.fang_dagger.pounce` |
| [Flag #3](https://bigsoundbank.com/flag-3-s1789.html) (`bsb_1789`) | Joseph Sardin | CC0 1.0 | `item.armor.equip_fur` |
| [Footstep in the Snow #1](https://bigsoundbank.com/on-snow-s0208.html) (`bsb_0208`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.slam` |
| [Glass ball, bounce #1](https://bigsoundbank.com/glass-ball-bounce-1-s2240.html) (`bsb_2240`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.horn_regrow` |
| [Glass Burst](https://bigsoundbank.com/glass-burst-s0148.html) (`bsb_0148`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.burst`, `block.frost_mauler_skull.revive`, `entity.frost_mauler.explode`, `entity.frost_mauler.wake` |
| [Grumpy pig, with the mouth #1](https://bigsoundbank.com/grumpy-pig-1-s1658.html) (`bsb_1658`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.ambient` |
| [Grumpy Pig, with the Mouth #2](https://bigsoundbank.com/grumpy-pig-2-s1659.html) (`bsb_1659`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.ambient` |
| [Gun, loading #1](https://bigsoundbank.com/gun-loading-1-s1988.html) (`bsb_1988`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.mode` |
| [Gun, loading #2](https://bigsoundbank.com/gun-loading-2-s1989.html) (`bsb_1989`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.mode` |
| [Heavy chain](https://bigsoundbank.com/heavy-chain-s0359.html) (`bsb_0359`) | Joseph Sardin | CC0 1.0 | `block.lift_rail.clank` |
| [Hiss of steam train #1](https://bigsoundbank.com/hiss-of-steam-train-1-s0227.html) (`bsb_0227`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar`, `item.snowball_launcher.overheat` |
| [Hiss of Steam Train #2](https://bigsoundbank.com/hiss-of-steam-train-2-s0228.html) (`bsb_0228`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar` |
| [Horse chewing hay](https://bigsoundbank.com/horse-chewing-hay-s0497.html) (`bsb_0497`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.munch` |
| [Ice cubes in a glass #1](https://bigsoundbank.com/ice-cubes-in-a-glass-1-s2123.html) (`bsb_2123`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.step`, `block.snow_globe.shake`, `entity.icebreaker.shear` |
| [Ice cubes in a glass #2](https://bigsoundbank.com/ice-cubes-in-a-glass-2-s2124.html) (`bsb_2124`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.place`, `block.snow_globe.shake`, `entity.icebreaker.shear` |
| [Ice cubes in a glass #3](https://bigsoundbank.com/ice-cubes-in-a-glass-3-s2125.html) (`bsb_2125`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.place`, `block.snow_globe.shake`, `entity.icebreaker.shear` |
| [Ice cubes in a glass #4](https://bigsoundbank.com/ice-cubes-in-a-glass-4-s2126.html) (`bsb_2126`) | Joseph Sardin | CC0 1.0 | `block.ancient_ice.place`, `block.icicle.shatter`, `block.snow_globe.shake` |
| [Ice cubes in a glass #5](https://bigsoundbank.com/ice-cubes-in-a-glass-5-s2127.html) (`bsb_2127`) | Joseph Sardin | CC0 1.0 | `block.icicle.fall`, `block.snow_globe.shake` |
| [Ice cubes in a glass #6](https://bigsoundbank.com/ice-cubes-in-a-glass-6-s2128.html) (`bsb_2128`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Large ratchet](https://bigsoundbank.com/large-ratchet-s0795.html) (`bsb_0795`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Man Breathing](https://bigsoundbank.com/man-breathing-s2195.html) (`bsb_2195`) | Joseph Sardin | CC0 1.0 | `entity.player.shiver` |
| [Manual winch #1](https://bigsoundbank.com/manual-winch-1-s0901.html) (`bsb_0901`) | Joseph Sardin | CC0 1.0 | `entity.dragon_locomotive.roar` |
| [Medium chain](https://bigsoundbank.com/medium-chain-s0619.html) (`bsb_0619`) | Joseph Sardin | CC0 1.0 | `block.lift_rail.clank` |
| [Medium Chain #1](https://bigsoundbank.com/medium-chain-1-s0360.html) (`bsb_0360`) | Joseph Sardin | CC0 1.0 | `entity.minecart.couple` |
| [Medium chain #2](https://bigsoundbank.com/medium-chain-2-s0361.html) (`bsb_0361`) | Joseph Sardin | CC0 1.0 | `entity.minecart.couple` |
| [Metal ball, bounce #2](https://bigsoundbank.com/metal-ball-bounce-2-s2243.html) (`bsb_2243`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.overheat` |
| [Mouth Noises #1](https://bigsoundbank.com/mouth-noises-1-s0352.html) (`bsb_0352`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.munch` |
| [Music box, C #1](https://bigsoundbank.com/music-box-c-1-s1867.html) (`bsb_1867`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Music box, F #1](https://bigsoundbank.com/music-box-f-1-s1870.html) (`bsb_1870`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Music box, G #1](https://bigsoundbank.com/music-box-g-1-s1871.html) (`bsb_1871`) | Joseph Sardin | CC0 1.0 | `block.snow_globe.shake` |
| [Pistol, cocking #2](https://bigsoundbank.com/pistol-cocking-2-s1985.html) (`bsb_1985`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.empty` |
| [Pistol, cocking #3](https://bigsoundbank.com/pistol-cocking-3-s1986.html) (`bsb_1986`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.empty` |
| [Pistol, cocking hammer #1](https://bigsoundbank.com/pistol-cocking-hammer-1-s1992.html) (`bsb_1992`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.empty`, `item.snowball_launcher.mode` |
| [Pneumatic cylinder, small #1](https://bigsoundbank.com/pneumatic-cylinder-small-1-s1491.html) (`bsb_1491`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.fire` |
| [Pneumatic cylinder, small #2](https://bigsoundbank.com/pneumatic-cylinder-small-2-s1492.html) (`bsb_1492`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.fire` |
| [Pneumatic cylinder, small #3](https://bigsoundbank.com/pneumatic-cylinder-small-3-s1493.html) (`bsb_1493`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.fire` |
| [Pressure cooker](https://bigsoundbank.com/pressure-cooker-s0805.html) (`bsb_0805`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.overheat` |
| [Punch #1](https://bigsoundbank.com/punch-s0105.html) (`bsb_0105`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.ram` |
| [Punch #4](https://bigsoundbank.com/punch-4-s2459.html) (`bsb_2459`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `entity.icebreaker.ram`, `item.fang_dagger.crit` |
| [Punch #5](https://bigsoundbank.com/punch-5-s2460.html) (`bsb_2460`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `entity.icebreaker.ram`, `item.fang_dagger.crit` |
| [Punch #6](https://bigsoundbank.com/punch-6-s2461.html) (`bsb_2461`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `item.fang_dagger.crit` |
| [Quenching, cooling #1](https://bigsoundbank.com/quenching-cooling-1-s1694.html) (`bsb_1694`) | Joseph Sardin | CC0 1.0 | `entity.player.overheat` |
| [Quenching, cooling #2](https://bigsoundbank.com/quenching-cooling-2-s1695.html) (`bsb_1695`) | Joseph Sardin | CC0 1.0 | `entity.player.overheat` |
| [Quenching, cooling #3](https://bigsoundbank.com/quenching-cooling-3-s1696.html) (`bsb_1696`) | Joseph Sardin | CC0 1.0 | `entity.player.overheat` |
| [Ratchet tensioner](https://bigsoundbank.com/ratchet-tensioner-s1824.html) (`bsb_1824`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Scissors](https://bigsoundbank.com/scissors-s0008.html) (`bsb_0008`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.shear`, `entity.polar_bear.shear` |
| [Short welds](https://bigsoundbank.com/short-welds-s0952.html) (`bsb_0952`) | Joseph Sardin | CC0 1.0 | `block.booster_rail.boost` |
| [Sigh by the Mouth](https://bigsoundbank.com/sigh-by-the-mouth-s1405.html) (`bsb_1405`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.breath`, `entity.polar_bear.calm`, `item.fang_dagger.tired` |
| [Sigh by the nose](https://bigsoundbank.com/sigh-by-the-nose-s1404.html) (`bsb_1404`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.calm`, `item.fang_dagger.tired` |
| [Sika deer rut call #1](https://bigsoundbank.com/sika-deer-rut-call-1-s3617.html) (`bsb_3617`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.roar` |
| [Sika deer rut call #2](https://bigsoundbank.com/sika-deer-rut-call-2-s3618.html) (`bsb_3618`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.stunned` |
| [Slaps](https://bigsoundbank.com/slaps-s0597.html) (`bsb_0597`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.slap` |
| [Small chain #1](https://bigsoundbank.com/small-chain-1-s0355.html) (`bsb_0355`) | Joseph Sardin | CC0 1.0 | `entity.minecart.couple` |
| [Small ratchet](https://bigsoundbank.com/small-ratchet-s0794.html) (`bsb_0794`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Splash, Big #1](https://bigsoundbank.com/splash-big-1-s1519.html) (`bsb_1519`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.splash` |
| [Splash, big #2](https://bigsoundbank.com/splash-big-2-s1520.html) (`bsb_1520`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.splash` |
| [Splash, Big #3](https://bigsoundbank.com/splash-big-3-s1521.html) (`bsb_1521`) | Joseph Sardin | CC0 1.0 | `entity.icebreaker.splash` |
| [Steam engine, foley #1](https://bigsoundbank.com/steam-engine-foley-1-s3310.html) (`bsb_3310`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.chuff` |
| [Steam engine, foley #2](https://bigsoundbank.com/steam-engine-foley-2-s3311.html) (`bsb_3311`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.chuff` |
| [Sword That Cuts](https://bigsoundbank.com/sword-that-cuts-s0127.html) (`bsb_0127`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw` |
| [Sword Through the Air](https://bigsoundbank.com/sword-through-the-air-s0128.html) (`bsb_0128`) | Joseph Sardin | CC0 1.0 | `item.fang_dagger.slash` |
| [Synthetic Coat Rubbed](https://bigsoundbank.com/synthetic-coat-rubbed-s1104.html) (`bsb_1104`) | Joseph Sardin | CC0 1.0 | `entity.polar_bear.shear`, `item.armor.equip_fur` |
| [Thunder #2](https://bigsoundbank.com/thunder-2-s3113.html) (`bsb_3113`) | Joseph Sardin | CC0 1.0 | `event.frozen_tomb.rumble`, `item.snowball_launcher.heavy` |
| [Thunder #3](https://bigsoundbank.com/thunder-3-s3114.html) (`bsb_3114`) | Joseph Sardin | CC0 1.0 | `event.frozen_tomb.rumble` |
| [Train whistle, foley #2](https://bigsoundbank.com/train-whistle-foley-2-s3316.html) (`bsb_3316`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.whistle` |
| [Train whistle, foley #5](https://bigsoundbank.com/train-whistle-foley-5-s3319.html) (`bsb_3319`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.whistle` |
| [Whistling of the Wind #2](https://bigsoundbank.com/whistling-of-the-wind-2-s0155.html) (`bsb_0155`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.loop` |
| [Whistling train #2](https://bigsoundbank.com/whistling-train-2-s0226.html) (`bsb_0226`) | Joseph Sardin | CC0 1.0 | `entity.locomotive.whistle` |
| [Whoosh #4](https://bigsoundbank.com/whoosh-4-s1796.html) (`bsb_1796`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `entity.polar_bear.leap`, `item.fang_dagger.pounce` |
| [Whoosh #7](https://bigsoundbank.com/whoosh-7-s1800.html) (`bsb_1800`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `entity.polar_bear.leap`, `item.fang_dagger.pounce` |
| [Whoosh #8](https://bigsoundbank.com/whoosh-8-s1801.html) (`bsb_1801`) | Joseph Sardin | CC0 1.0 | `entity.frost_mauler.claw`, `entity.polar_bear.leap`, `item.fang_dagger.pounce` |
| [Wind from inside #1](https://bigsoundbank.com/wind-from-inside-1-s1714.html) (`bsb_1714`) | Joseph Sardin | CC0 1.0 | `ambient.ice_caves.loop` |
| [Winder #1](https://bigsoundbank.com/winder-1-s1674.html) (`bsb_1674`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Winder #2](https://bigsoundbank.com/winder-2-s1675.html) (`bsb_1675`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Winder #4](https://bigsoundbank.com/winder-4-s2665.html) (`bsb_2665`) | Joseph Sardin | CC0 1.0 | `item.snowball_launcher.charge` |
| [Zombie #1](https://bigsoundbank.com/zombie-1-s2106.html) (`bsb_2106`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death` |
| [Zombie #2](https://bigsoundbank.com/zombie-2-s2107.html) (`bsb_2107`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.death`, `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death` |
| [Zombie #3](https://bigsoundbank.com/zombie-3-s2108.html) (`bsb_2108`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.zombie_polar_bear.ambient` |
| [Zombie #4](https://bigsoundbank.com/zombie-4-s2109.html) (`bsb_2109`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.death` |
| [Zombie #5](https://bigsoundbank.com/zombie-5-s2110.html) (`bsb_2110`) | Joseph Sardin | CC0 1.0 | `entity.zombie_polar_bear.hurt` |
| [Zombie #6](https://bigsoundbank.com/zombie-6-s2111.html) (`bsb_2111`) | Joseph Sardin | CC0 1.0 | `entity.zombie_polar_bear.hurt` |
| [Zombie #7](https://bigsoundbank.com/zombie-7-s2112.html) (`bsb_2112`) | Joseph Sardin | CC0 1.0 | `entity.frost_zombie.ambient` |

## commons.wikimedia.org

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Lion_raring-sound1TamilNadu178.ogg](https://commons.wikimedia.org/wiki/File:Lion_raring-sound1TamilNadu178.ogg) (`cw_lion`) | த*உழவன் | Public domain [5] | `block.frost_mauler_skull.revive`, `entity.dragon_locomotive.roar`, `entity.frost_mauler.ambient`, `entity.frost_mauler.death`, `entity.frost_mauler.hurt`, `entity.frost_mauler.roar`, `entity.polar_bear.roar` |

## opengameart.org

| Source | Author | Licence | Used by |
|---|---|---|---|
| [12 wet towel hitting/falling/punching floor sounds](https://opengameart.org/content/12-wet-towel-hittingfallingpunching-floor-sounds) (`oga_towel`) | qubodup | CC0 1.0 [6] | `entity.icebreaker.death`, `entity.icebreaker.slap`, `entity.icebreaker.step` |
| [25 CC0 bang / firework SFX](https://opengameart.org/content/25-cc0-bang-firework-sfx) (`oga_rd_bang`) | rubberduck | CC0 1.0 | `block.frost_mauler_skull.revive`, `entity.frost_mauler.explode`, `item.snowball_launcher.heavy` |
| [4 dry snow steps](https://opengameart.org/content/4-dry-snow-steps) (`oga_dry_snow`) | qubodup | CC0 1.0 | `entity.frost_zombie.step`, `entity.icebreaker.slap`, `entity.polar_bear.slam`, `item.snowball_launcher.load` |
| [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) (`oga_rd_water`) | rubberduck | CC0 1.0 | `entity.icebreaker.splash`, `entity.polar_bear.munch` |
| [42 Snow and Gravel Footsteps (recorded by Corsica_S, cut by qubodup)](https://opengameart.org/content/42-snow-and-gravel-footsteps) (`oga_snow42`) | qubodup / Corsica_S | CC0 1.0 [7] | `block.ancient_ice.fall`, `block.ancient_ice.step`, `entity.frost_mauler.step`, `entity.frost_zombie.step` |
| [51 UI sound effects (buttons, switches and clicks)](https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks) (`oga_kenney_ui`) | Kenney | CC0 1.0 | `item.snowball_launcher.empty`, `item.snowball_launcher.load`, `item.snowball_launcher.mode` |
| [75 CC0 breaking / falling / hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx) (`oga_rd_break`) | rubberduck | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.burst`, `block.ancient_ice.fall`, `block.ancient_ice.hit`, `block.ancient_ice.place`, `block.icicle.shatter`, `effect.ramming.impact`, `entity.frost_mauler.bite`, `entity.frost_zombie.death`, `entity.icebreaker.ram`, `entity.minecart.couple`, `item.fang_dagger.tired`, `item.snowball_launcher.load`, `item.snowball_launcher.overheat` |
| [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) (`oga_rd_creature`) | rubberduck | CC0 1.0 | `entity.frost_mauler.hurt`, `entity.frost_mauler.stunned`, `entity.icebreaker.happy`, `entity.icebreaker.hurt`, `entity.polar_bear.leap`, `entity.polar_bear.munch`, `entity.zombie_polar_bear.hurt` |
| [80 CC0 creture SFX #2](https://opengameart.org/content/80-cc0-creture-sfx-2) (`oga_rd_creature2`) | rubberduck | CC0 1.0 | `entity.frost_mauler.hurt`, `entity.polar_bear.leap` |
| [9 wet snow steps](https://opengameart.org/content/9-wet-snow-steps) (`oga_wet_snow`) | qubodup | CC0 1.0 | `entity.icebreaker.step`, `item.snowball_launcher.load` |
| [Bear Growls (U.S. Fish & Wildlife Service recordings)](https://opengameart.org/content/bear-growls) (`oga_bear`) | AntumDeluge | CC0 1.0 [8] | `entity.frost_mauler.ambient`, `entity.polar_bear.roar`, `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death`, `entity.zombie_polar_bear.hurt` |
| [Big scary troll sounds (troll-idle-noises)](https://opengameart.org/content/big-scary-troll-sounds) (`oga_troll_idle`) | Darsycho | CC0 1.0 | `entity.frost_mauler.ambient`, `entity.frost_mauler.wake`, `entity.zombie_polar_bear.ambient` |
| [Big scary troll sounds (troll-roars)](https://opengameart.org/content/big-scary-troll-sounds) (`oga_troll_roars`) | Darsycho | CC0 1.0 | `block.frost_mauler_skull.revive`, `entity.dragon_locomotive.roar`, `entity.frost_mauler.death`, `entity.frost_mauler.hurt`, `entity.frost_mauler.roar`, `entity.icebreaker.roar`, `entity.polar_bear.roar` |
| [Cannon fire](https://opengameart.org/content/cannon-fire) (`oga_cannon`) | Thimras | CC0 1.0 | `entity.frost_mauler.explode`, `item.snowball_launcher.heavy` |
| [CC0 Deep Monster Roar](https://opengameart.org/content/cc0-deep-monster-roar) (`oga_deep_roar`) | trazzz123 | CC0 1.0 | `entity.frost_mauler.death`, `entity.frost_mauler.roar`, `entity.frost_mauler.wake` |
| [Ice breaking/shattering](https://opengameart.org/content/ice-breakingshattering) (`oga_ice_shatter`) | IgnasD | CC0 1.0 | `block.ancient_ice.break`, `block.ancient_ice.burst`, `block.frost_mauler_skull.revive`, `block.icicle.shatter`, `entity.frost_mauler.death`, `entity.frost_mauler.explode`, `entity.frost_mauler.wake`, `entity.frost_zombie.death` |
| [Mechanical Sounds (clank1)](https://opengameart.org/content/mechanical-sounds) (`oga_mech_clank`) | BMacZero | CC0 1.0 | `block.lift_rail.clank`, `entity.minecart.couple` |
| [Mechanical Sounds (lightclunk1)](https://opengameart.org/content/mechanical-sounds) (`oga_mech_clunk1`) | BMacZero | CC0 1.0 | `block.lift_rail.clank`, `entity.minecart.couple`, `item.snowball_launcher.mode` |
| [Mechanical Sounds (lightclunk2)](https://opengameart.org/content/mechanical-sounds) (`oga_mech_clunk2`) | BMacZero | CC0 1.0 | `entity.minecart.couple` |
| [Mechanical Sounds (mechanical1)](https://opengameart.org/content/mechanical-sounds) (`oga_mech1`) | BMacZero | CC0 1.0 | `item.snowball_launcher.mode` |
| [Monster snarls (monster-snarl-5)](https://opengameart.org/content/monster-snarls) (`oga_snarls5`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Monster snarls (monster-snarl-attack)](https://opengameart.org/content/monster-snarls) (`oga_snarls4`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Monster snarls (monster-snarls)](https://opengameart.org/content/monster-snarls) (`oga_snarls1`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Monster snarls (monster-snarls-2)](https://opengameart.org/content/monster-snarls) (`oga_snarls2`) | Darsycho | CC0 1.0 | `entity.frost_mauler.bite` |
| [Monster snarls (monsters-snarls-3)](https://opengameart.org/content/monster-snarls) (`oga_snarls3`) | Darsycho | CC0 1.0 | `entity.frost_mauler.fury` |
| [Steam release sounds](https://opengameart.org/content/steam-release-sounds) (`oga_steam_hiss`) | bart | CC0 1.0 [9] | `entity.dragon_locomotive.roar`, `entity.locomotive.chuff`, `entity.player.overheat`, `item.snowball_launcher.overheat` |
| [Steam whistle (steamwhistle)](https://opengameart.org/content/steam-whistle) (`oga_steam_whistle1`) | bart | CC0 1.0 [10] | `entity.locomotive.whistle` |
| [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) (`oga_swishes`) | artisticdude | CC0 1.0 | `item.fang_dagger.slash`, `item.snowball_launcher.fire` |
| [various scissors (garden_shears_01)](https://opengameart.org/content/various-scissors) (`oga_shears1`) | sinny | CC0 1.0 | `entity.icebreaker.shear`, `entity.polar_bear.shear` |
| [various scissors (garden_shears_02)](https://opengameart.org/content/various-scissors) (`oga_shears2`) | sinny | CC0 1.0 | `entity.icebreaker.shear` |
| [wind1 (synthesised wind)](https://opengameart.org/content/wind1) (`oga_wind1`) | Luke.RUSTLTD | CC0 1.0 [11] | `ambient.ice_caves.loop` |
| [Zombie moans](https://opengameart.org/content/zombie-moans) (`oga_zombie_moans`) | Darsycho | CC0 1.0 | `entity.zombie_polar_bear.ambient`, `entity.zombie_polar_bear.death` |
| [Zombies Sound Pack](https://opengameart.org/content/zombies-sound-pack) (`oga_zombies`) | artisticdude | CC0 1.0 | `entity.frost_zombie.ambient`, `entity.frost_zombie.death`, `entity.frost_zombie.hurt`, `entity.zombie_polar_bear.hurt` |

Notes:

* [1] Caleta Portales - Sea Lion: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [2] Fobney Island Nature Reserve Reading UK - Cracking Lake Ice: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [3] Klondike Park Lake Ice Booms, Augusta, Missouri: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [4] Utena, Lietuva - Lake ice Andromeda: Radio Aporee recording released by the recordist under the Public Domain Mark 1.0 (archive.org item licence).
* [5] Lion_raring-sound1TamilNadu178.ogg: Own work of the uploader, who released it into the public domain ("I, the copyright holder of this work, release this work into the public domain").
* [6] 12 wet towel hitting/falling/punching floor sounds: The page states the pack is CC0 as of 2024-08-24 (the older text file inside the archive is superseded).
* [7] 42 Snow and Gravel Footsteps (recorded by Corsica_S, cut by qubodup): Recorded by Corsica_S (freesound); cut and released as CC0 by qubodup with the recordist's permission (stated on the page).
* [8] Bear Growls (U.S. Fish & Wildlife Service recordings): U.S. Fish & Wildlife Service recordings, packaged and released as CC0.
* [9] Steam release sounds: CC0; the author appreciates (does not require) attribution.
* [10] Steam whistle (steamwhistle): CC0; the author appreciates (does not require) attribution.
* [11] wind1 (synthesised wind): Synthesised wind (PureData).

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

## Licences

* CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
* Public Domain Mark 1.0: https://creativecommons.org/publicdomain/mark/1.0/
* BigSoundBank: every sound used is marked "License CC0 (public domain): Free and royalty-free" on its page; site terms at https://bigsoundbank.com/licenses.html (CC0 1.0 Universal).
* OpenGameArt: every page used lists CC0 as its licence.
