# BUSHED credits

## Sound

Every file in `public/assets/sfx/` is made by `tools/sounds/build_sounds.py` from the recordings below (trimmed, layered, re-pitched, filtered, reverberated, loudness-normalised; recipes in `tools/sounds/recipes.json`), plus a little procedural synthesis (numpy noise, tones, thumps). Only CC0 and public-domain sources are used. Rebuild: `python3 tools/sounds/build_sounds.py fetch` then `... build` (downloads are checked against the sha256 in recipes.json).

### archive.org

| Source | Author | Licence | Used by |
|---|---|---|---|
| [American Black Bear](https://archive.org/details/AmericanBlackBear) (`usfws_americanblackbear`) | U.S. Fish and Wildlife Service | Public domain (US FWS) | `hound_growl` |
| [Common Loon](https://archive.org/details/CommonLoon) (`usfws_commonloon`) | U.S. Fish and Wildlife Service | Public domain (US FWS) | `bird_loon` |
| [Frogs Sounds](https://archive.org/details/FrogsSounds) (`usfws_frogssounds`) | U.S. Fish and Wildlife Service | Public domain (US FWS) | `animal_frogs` |
| [Wolves Howl](https://archive.org/details/WolvesHowl_571) (`usfws_wolveshowl_571`) | U.S. Fish and Wildlife Service | Public domain (US FWS) | `animal_wolves`, `bigfoot_whoop` |

### archive.org (Radio Aporee ::: Maps)

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Dawn chorus (Kagawong, ON, Canada)](https://archive.org/details/aporee_32614_37493) (`ia_32614_37493`) | Matt Rogalsky | Public Domain Mark 1.0 | `bird_songbird` |
| [DawnBirds_20200502_Reveil (3785 Eagle Lake Rd, South River, ON P0A 1X0, Canada)](https://archive.org/details/aporee_50102_57160) (`ia_50102_57160`) | darren | Public Domain Mark 1.0 | `amb_forest_day` |
| [Early morning forest soundscape with White Throated Sparrow and Hermit Thrush (Pevensy Road, Strong Township, Ontario, Canada)](https://archive.org/details/aporee_67870_78562) (`ia_67870_78562`) | NAISA | Public Domain Mark 1.0 | `amb_forest_day` |
| [Great Horned Owl Duet at Canaveral Seashore (Leeper House ACA Soundscape Fieldstation)](https://archive.org/details/aporee_55185_63075) (`ia_55185_63075`) | Felix BLUME | Public Domain Mark 1.0 | `bird_owl_horned` |
| [Hermit thrush (Mikisew Provincial Park, Ontario, Canada)](https://archive.org/details/aporee_32684_37566) (`ia_32684_37566`) | Matt Rogalsky | Public Domain Mark 1.0 | `bird_thrush` |
| [Hermit thrushes (Mikisew Provincial Park, Canada)](https://archive.org/details/aporee_32701_37584) (`ia_32701_37584`) | Matt Rogalsky | Public Domain Mark 1.0 | `amb_forest_dusk` |
| [Late night summer insects (The Funny Farm, Meaford, ON, Canada)](https://archive.org/details/aporee_32988_37901) (`ia_32988_37901`) | Matt Rogalsky | Public Domain Mark 1.0 | `amb_forest_dusk`, `amb_forest_night` |
| [Light rain near pond (Taylor Creek Park, East York, ON, Canada)](https://archive.org/details/aporee_59181_67910) (`ia_59181_67910`) | James Bailey | Public Domain Mark 1.0 | `amb_rain` |
| [Lithuania, Utena, woodpecker (Lithuania, Utena, woodpecker)](https://archive.org/details/aporee_16829_19576) (`ia_16829_19576`) | alas23/sala | Public Domain Mark 1.0 | `bird_woodpecker` |
| [loons, frogs, wind, Lake Insula, boundary waters Minnesota (Lake Insula, MN, USA)](https://archive.org/details/aporee_29901_34384) (`ia_29901_34384`) | Radio Aporee ::: Maps contributor | Public Domain Mark 1.0 | `bird_loon` |
| [Luknės, Lithuania, woodpecker work (Luknės, Lithuania, woodpecker work)](https://archive.org/details/aporee_58550_67180) (`ia_58550_67180`) | alas23/sala | Public Domain Mark 1.0 | `bird_woodpecker` |
| [Shubie Stream (Shubie Park, Dartmouth, NS B2X 2M1, Canada)](https://archive.org/details/aporee_24290_28198) (`ia_24290_28198`) | Radio Aporee ::: Maps contributor | Public Domain Mark 1.0 | `amb_creek` |
| [Spring Peepers, Tree Frogs and Loons (Warbler's Roost, Ontario, Canada)](https://archive.org/details/aporee_32726_57050) (`ia_32726_57050`) | darren | Public Domain Mark 1.0 | `amb_forest_night` |
| [Utena, Lithuania, sounding pine tree (Utena, Lithuania, sounding pine tree)](https://archive.org/details/aporee_54529_62366) (`ia_54529_62366`) | alas23/sala | Public Domain Mark 1.0 | `amb_drone`, `tree_creak` |

### bigsoundbank.com

| Source | Author | Licence | Used by |
|---|---|---|---|
| [2 small dogs bark and growl](https://bigsoundbank.com/small-dogs-bark-growl-s1060.html) (`bsb_1060`) | Joseph Sardin | CC0 1.0 | `hound_snarl`, `hound_whine`, `hound_yip` |
| [Air leak](https://bigsoundbank.com/air-leak-s1486.html) (`bsb_1486`) | Joseph Sardin | CC0 1.0 | `gumberoo_deflate` |
| [Aluminum lid 20 cm](https://bigsoundbank.com/couvercle-en-aluminium-20cm-sample-s0379.html) (`bsb_0379`) | Joseph Sardin | CC0 1.0 | `pot_lid` |
| [Anvil #1](https://bigsoundbank.com/anvil-1-s3589.html) (`bsb_3589`) | Joseph Sardin | CC0 1.0 | `hound_ting` |
| [Apartment Door, Closing #1](https://bigsoundbank.com/apartment-door-closing-1-s1704.html) (`bsb_1704`) | Joseph Sardin | CC0 1.0 | `door_creak_close` |
| [Apartment Door, Opening #1](https://bigsoundbank.com/apartment-door-opening-1-s1702.html) (`bsb_1702`) | Joseph Sardin | CC0 1.0 | `door_creak_open` |
| [Apple crunched #1](https://bigsoundbank.com/apple-crunched-1-s1113.html) (`bsb_1113`) | Joseph Sardin | CC0 1.0 | `eat_crunch` |
| [Apple crunched #2](https://bigsoundbank.com/apple-crunched-2-s1114.html) (`bsb_1114`) | Joseph Sardin | CC0 1.0 | `eat_crunch` |
| [Apple crunched #3](https://bigsoundbank.com/apple-crunched-3-s3081.html) (`bsb_3081`) | Joseph Sardin | CC0 1.0 | `eat_crunch` |
| [Ax on axe wedge](https://bigsoundbank.com/ax-on-axe-wedge-s0706.html) (`bsb_0706`) | Joseph Sardin | CC0 1.0 | `axe_glance`, `hound_ting` |
| [Ax on log](https://bigsoundbank.com/ax-on-log-s0705.html) (`bsb_0705`) | Joseph Sardin | CC0 1.0 | `axe_chop`, `axe_stuck` |
| [Ax on Wood](https://bigsoundbank.com/ax-on-wood-s0536.html) (`bsb_0536`) | Joseph Sardin | CC0 1.0 | `axe_chop`, `axe_chop_hard`, `axe_glance` |
| [Balloon, inflation #1](https://bigsoundbank.com/balloon-inflation-1-s1129.html) (`bsb_1129`) | Joseph Sardin | CC0 1.0 | `gumberoo_deflate` |
| [Barking dog #1](https://bigsoundbank.com/barking-dog-s0916.html) (`bsb_0916`) | Joseph Sardin | CC0 1.0 | `hound_bark` |
| [Barking Dog #2](https://bigsoundbank.com/barking-dog-2-s2954.html) (`bsb_2954`) | Joseph Sardin | CC0 1.0 | `hound_bark`, `hound_snarl` |
| [Barking of a Spitz](https://bigsoundbank.com/barking-of-a-spitz-s0682.html) (`bsb_0682`) | Joseph Sardin | CC0 1.0 | `hound_snarl` |
| [Big Branching Fire #1](https://bigsoundbank.com/big-branching-fire-1-s0987.html) (`bsb_0987`) | Joseph Sardin | CC0 1.0 | `fire_camp` |
| [Big diesel engine](https://bigsoundbank.com/big-diesel-engine-s0967.html) (`bsb_0967`) | Joseph Sardin | CC0 1.0 | `veh_start`, `veh_stop` |
| [Bike on gravel (MTB) #1](https://bigsoundbank.com/bike-on-gravel-mtb-1-s1284.html) (`bsb_1284`) | Joseph Sardin | CC0 1.0 | `log_drag`, `log_roll` |
| [Bike on Path (MTB)](https://bigsoundbank.com/bike-on-path-mtb-s1283.html) (`bsb_1283`) | Joseph Sardin | CC0 1.0 | `veh_gravel` |
| [Blow hard #1](https://bigsoundbank.com/blow-hard-1-s1602.html) (`bsb_1602`) | Joseph Sardin | CC0 1.0 | `grunt_effort` |
| [Blow Hard #2](https://bigsoundbank.com/blow-hard-2-s1603.html) (`bsb_1603`) | Joseph Sardin | CC0 1.0 | `grunt_effort` |
| [Blow on hand](https://bigsoundbank.com/blow-on-hand-s0747.html) (`bsb_0747`) | Joseph Sardin | CC0 1.0 | `breath_cold` |
| [Body Fall #1](https://bigsoundbank.com/body-fall-1-s2452.html) (`bsb_2452`) | Joseph Sardin | CC0 1.0 | `bigfoot_step`, `log_thud`, `tree_fall_big` |
| [Body Fall #2](https://bigsoundbank.com/body-fall-2-s2453.html) (`bsb_2453`) | Joseph Sardin | CC0 1.0 | `bigfoot_step`, `log_thud`, `tree_fall_small` |
| [Body fall #3](https://bigsoundbank.com/body-fall-3-s2454.html) (`bsb_2454`) | Joseph Sardin | CC0 1.0 | `bigfoot_step`, `log_roll`, `log_thud`, `tree_fall_big` |
| [Body fall #4](https://bigsoundbank.com/body-fall-4-s2455.html) (`bsb_2455`) | Joseph Sardin | CC0 1.0 | `bigfoot_step`, `log_thud`, `tree_fall_small` |
| [Boiling water](https://bigsoundbank.com/boiling-water-s0149.html) (`bsb_0149`) | Joseph Sardin | CC0 1.0 | `pot_boil` |
| [Bones cracking #1](https://bigsoundbank.com/bones-cracking-s0596.html) (`bsb_0596`) | Joseph Sardin | CC0 1.0 | `bigfoot_branch_break`, `branch_break_big`, `branch_snap`, `tree_fall_big` |
| [Bones cracking #2](https://bigsoundbank.com/bones-cracking-2-s1408.html) (`bsb_1408`) | Joseph Sardin | CC0 1.0 | `branch_snap` |
| [Bones cracking #3](https://bigsoundbank.com/bones-cracking-3-s1409.html) (`bsb_1409`) | Joseph Sardin | CC0 1.0 | `branch_break_big` |
| [Bottle Caps](https://bigsoundbank.com/bottle-caps-s1392.html) (`bsb_1392`) | Joseph Sardin | CC0 1.0 | `bottle_clink` |
| [Bottle of beer, opening #1](https://bigsoundbank.com/bottle-of-beer-opening-s1390.html) (`bsb_1390`) | Joseph Sardin | CC0 1.0 | `bottle_open` |
| [Bottle of beer, opening #2](https://bigsoundbank.com/bottle-of-beer-opening-2-s1931.html) (`bsb_1931`) | Joseph Sardin | CC0 1.0 | `bottle_open` |
| [Bottle of beer, opening #3](https://bigsoundbank.com/bottle-of-beer-opening-3-s1932.html) (`bsb_1932`) | Joseph Sardin | CC0 1.0 | `bottle_open` |
| [Bottle of beer, shocks #1](https://bigsoundbank.com/bottle-of-beer-shocks-1-s1935.html) (`bsb_1935`) | Joseph Sardin | CC0 1.0 | `bottle_clink`, `bottle_set` |
| [Bottle of beer, shocks #2](https://bigsoundbank.com/bottle-of-beer-shocks-2-s1936.html) (`bsb_1936`) | Joseph Sardin | CC0 1.0 | `bottle_clink` |
| [Bottles of beer, shocks #1](https://bigsoundbank.com/bottles-of-beer-shocks-1-s1393.html) (`bsb_1393`) | Joseph Sardin | CC0 1.0 | `bottle_clink`, `bottle_set` |
| [Breathless Man](https://bigsoundbank.com/breathless-man-s1103.html) (`bsb_1103`) | Joseph Sardin | CC0 1.0 | `breath_heavy` |
| [Broken twigs #1](https://bigsoundbank.com/broken-twigs-1-s1299.html) (`bsb_1299`) | Joseph Sardin | CC0 1.0 | `bigfoot_branch_break`, `branch_break_big`, `branch_snap`, `tree_fall_big`, `tree_fall_small` |
| [Broken twigs #2](https://bigsoundbank.com/broken-twigs-2-s1300.html) (`bsb_1300`) | Joseph Sardin | CC0 1.0 | `axe_pull`, `branch_break_big`, `branch_snap` |
| [Car door #1](https://bigsoundbank.com/car-door-1-s0971.html) (`bsb_0971`) | Joseph Sardin | CC0 1.0 | `veh_door_close` |
| [Car door #2](https://bigsoundbank.com/car-door-2-s1276.html) (`bsb_1276`) | Joseph Sardin | CC0 1.0 | `veh_door_close`, `veh_door_open` |
| [Car door #3](https://bigsoundbank.com/car-door-3-s1524.html) (`bsb_1524`) | Joseph Sardin | CC0 1.0 | `veh_door_open` |
| [Car hood (Closing)](https://bigsoundbank.com/car-hood-closing-s0119.html) (`bsb_0119`) | Joseph Sardin | CC0 1.0 | `veh_suspension` |
| [Car interior, 80 km/h](https://bigsoundbank.com/car-interior-80-km-h-s3098.html) (`bsb_3098`) | Joseph Sardin | CC0 1.0 | `veh_interior` |
| [Car: Difficult Start](https://bigsoundbank.com/car-difficult-start-s0872.html) (`bsb_0872`) | Joseph Sardin | CC0 1.0 | `veh_crank_fail`, `veh_start` |
| [Chainsaw #2](https://bigsoundbank.com/chainsaw-2-s0707.html) (`bsb_0707`) | Joseph Sardin | CC0 1.0 | `chainsaw_cut`, `chainsaw_stop` |
| [Chainsaw (Starting)](https://bigsoundbank.com/chainsaw-starting-s0982.html) (`bsb_0982`) | Joseph Sardin | CC0 1.0 | `chainsaw_idle`, `chainsaw_start` |
| [Chainsaw and falling tree](https://bigsoundbank.com/chainsaw-and-falling-tree-s2750.html) (`bsb_2750`) | Joseph Sardin | CC0 1.0 | `tree_fall_big`, `tree_fall_small` |
| [Chattering teeth #1](https://bigsoundbank.com/chattering-teeth-s0789.html) (`bsb_0789`) | Joseph Sardin | CC0 1.0 | `teeth_chatter` |
| [Chattering teeth #2](https://bigsoundbank.com/chattering-teeth-2-s2190.html) (`bsb_2190`) | Joseph Sardin | CC0 1.0 | `teeth_chatter` |
| [Coin in cup #1](https://bigsoundbank.com/coin-in-cup-1-s0339.html) (`bsb_0339`) | Joseph Sardin | CC0 1.0 | `cash_register`, `coins` |
| [Coin in cup #2](https://bigsoundbank.com/coin-in-cup-2-s0340.html) (`bsb_0340`) | Joseph Sardin | CC0 1.0 | `coins` |
| [Coin-Coin (Toy)](https://bigsoundbank.com/coin-coin-toy-s0364.html) (`bsb_0364`) | Joseph Sardin | CC0 1.0 | `gumberoo_boing` |
| [Coins #1](https://bigsoundbank.com/coins-1-s0193.html) (`bsb_0193`) | Joseph Sardin | CC0 1.0 | `coins` |
| [Couinement jouet #1](https://bigsoundbank.com/couinement-jouet-1-s3331.html) (`bsb_3331`) | Joseph Sardin | CC0 1.0 | `gumberoo_boing`, `gumberoo_squeak` |
| [Couinement jouet #3](https://bigsoundbank.com/couinement-jouet-3-s3333.html) (`bsb_3333`) | Joseph Sardin | CC0 1.0 | `gumberoo_deflate`, `gumberoo_squeak` |
| [Couinement jouet #6](https://bigsoundbank.com/couinement-jouet-6-s3336.html) (`bsb_3336`) | Joseph Sardin | CC0 1.0 | `gumberoo_deflate`, `gumberoo_squeak` |
| [Creaking Door #2](https://bigsoundbank.com/creaking-door-2-s3205.html) (`bsb_3205`) | Joseph Sardin | CC0 1.0 | `door_creak_open` |
| [Creaking door #3](https://bigsoundbank.com/creaking-door-3-s3206.html) (`bsb_3206`) | Joseph Sardin | CC0 1.0 | `door_creak_close` |
| [Creaking Door #4](https://bigsoundbank.com/creaking-door-4-s3207.html) (`bsb_3207`) | Joseph Sardin | CC0 1.0 | `door_creak_close` |
| [Creaking door #5](https://bigsoundbank.com/creaking-door-5-s3208.html) (`bsb_3208`) | Joseph Sardin | CC0 1.0 | `door_creak_open` |
| [Cries of bats](https://bigsoundbank.com/cries-of-bats-s0458.html) (`bsb_0458`) | Joseph Sardin | CC0 1.0 | `creature_distant_scream`, `dingbat_screech` |
| [Cry of Pain](https://bigsoundbank.com/cry-of-pain-s2361.html) (`bsb_2361`) | Joseph Sardin | CC0 1.0 | `hurt` |
| [Cutting board, zucchini #1](https://bigsoundbank.com/cutting-board-zucchini-1-s2068.html) (`bsb_2068`) | Joseph Sardin | CC0 1.0 | `knife_chop` |
| [Cutting Board, Zucchini #3](https://bigsoundbank.com/cutting-board-zucchini-3-s2070.html) (`bsb_2070`) | Joseph Sardin | CC0 1.0 | `knife_chop` |
| [Damaged muffler 1 (Moving car)](https://bigsoundbank.com/damaged-muffler-1-moving-car-s0676.html) (`bsb_0676`) | Joseph Sardin | CC0 1.0 | `veh_drive` |
| [Damaged muffler 2 (parked car)](https://bigsoundbank.com/damaged-muffler-2-parked-car-s0674.html) (`bsb_0674`) | Joseph Sardin | CC0 1.0 | `veh_idle`, `veh_stop` |
| [Dogs Breathing](https://bigsoundbank.com/dogs-breathing-s1547.html) (`bsb_1547`) | Joseph Sardin | CC0 1.0 | `hound_pant` |
| [Drumsticks #1](https://bigsoundbank.com/drumsticks-1-s1488.html) (`bsb_1488`) | Joseph Sardin | CC0 1.0 | `wood_stack` |
| [Eat a Rusk](https://bigsoundbank.com/eat-a-rusk-s0407.html) (`bsb_0407`) | Joseph Sardin | CC0 1.0 | `eat_crunch` |
| [Eating potato chips #1](https://bigsoundbank.com/eating-potato-chips-1-s1430.html) (`bsb_1430`) | Joseph Sardin | CC0 1.0 | `eat_chew` |
| [Electronic switch](https://bigsoundbank.com/electronic-switch-s0025.html) (`bsb_0025`) | Joseph Sardin | CC0 1.0 | `flashlight_click` |
| [Feet in Leaves #1](https://bigsoundbank.com/feet-in-leaves-s0137.html) (`bsb_0137`) | Joseph Sardin | CC0 1.0 | `bigfoot_step`, `foot_forest` |
| [Feet in leaves #2](https://bigsoundbank.com/feet-in-leaves-2-s2889.html) (`bsb_2889`) | Joseph Sardin | CC0 1.0 | `foliage_rustle`, `log_drag` |
| [Fireplace #3](https://bigsoundbank.com/fireplace-3-s2855.html) (`bsb_2855`) | Joseph Sardin | CC0 1.0 | `fire_camp`, `fire_ember_pop`, `fire_ignite` |
| [Flag #1](https://bigsoundbank.com/flag-1-s1787.html) (`bsb_1787`) | Joseph Sardin | CC0 1.0 | `dingbat_flutter` |
| [Flight Bird #1](https://bigsoundbank.com/flight-bird-1-s2891.html) (`bsb_2891`) | Joseph Sardin | CC0 1.0 | `dingbat_flutter` |
| [Flight of a pigeon](https://bigsoundbank.com/flight-of-a-pigeon-s0476.html) (`bsb_0476`) | Joseph Sardin | CC0 1.0 | `dingbat_flutter` |
| [Floating Floor Squeaks](https://bigsoundbank.com/floating-floor-squeaks-s0518.html) (`bsb_0518`) | Joseph Sardin | CC0 1.0 | `floor_creak` |
| [Footstep in the Snow #1](https://bigsoundbank.com/on-snow-s0208.html) (`bsb_0208`) | Joseph Sardin | CC0 1.0 | `foot_snow` |
| [Footsteps on gravels #1](https://bigsoundbank.com/steps-on-gravels-s0510.html) (`bsb_0510`) | Joseph Sardin | CC0 1.0 | `foot_gravel` |
| [Footsteps on Gravels #4](https://bigsoundbank.com/footsteps-on-gravels-4-s3216.html) (`bsb_3216`) | Joseph Sardin | CC0 1.0 | `foot_gravel` |
| [Frying bath #3](https://bigsoundbank.com/frying-bath-3-s2507.html) (`bsb_2507`) | Joseph Sardin | CC0 1.0 | `pan_fry` |
| [Frying pan #2](https://bigsoundbank.com/frying-pan-2-s0144.html) (`bsb_0144`) | Joseph Sardin | CC0 1.0 | `pan_fry` |
| [Gasoline fire #1](https://bigsoundbank.com/gasoline-fire-1-s1340.html) (`bsb_1340`) | Joseph Sardin | CC0 1.0 | `fire_ignite` |
| [Gavel, 3 Blows](https://bigsoundbank.com/gavel-3-blows-s1590.html) (`bsb_1590`) | Joseph Sardin | CC0 1.0 | `wood_stack` |
| [Great Page that Turns #1](https://bigsoundbank.com/great-page-that-turns-1-s0362.html) (`bsb_0362`) | Joseph Sardin | CC0 1.0 | `page_turn` |
| [Great page that turns #1](https://bigsoundbank.com/great-page-that-turns-1-s0363.html) (`bsb_0363`) | Joseph Sardin | CC0 1.0 | `page_turn` |
| [Growling cat #1](https://bigsoundbank.com/growling-cat-1-s1885.html) (`bsb_1885`) | Joseph Sardin | CC0 1.0 | `hound_growl`, `hound_snarl` |
| [Growling cat #3](https://bigsoundbank.com/growling-cat-3-s1887.html) (`bsb_1887`) | Joseph Sardin | CC0 1.0 | `hound_growl` |
| [Growling cat #4](https://bigsoundbank.com/growling-cat-4-s1888.html) (`bsb_1888`) | Joseph Sardin | CC0 1.0 | `hound_growl` |
| [Hand brake](https://bigsoundbank.com/hand-brake-s0091.html) (`bsb_0091`) | Joseph Sardin | CC0 1.0 | `veh_handbrake_off`, `veh_handbrake_on` |
| [Handbrake #3](https://bigsoundbank.com/handbrake-3-s3509.html) (`bsb_3509`) | Joseph Sardin | CC0 1.0 | `veh_handbrake_on` |
| [Handbrake, activated #1](https://bigsoundbank.com/handbrake-activated-1-s3100.html) (`bsb_3100`) | Joseph Sardin | CC0 1.0 | `veh_handbrake_on` |
| [Handbrake, released #1](https://bigsoundbank.com/handbrake-released-1-s3104.html) (`bsb_3104`) | Joseph Sardin | CC0 1.0 | `veh_handbrake_off` |
| [Horse chewing hay](https://bigsoundbank.com/horse-chewing-hay-s0497.html) (`bsb_0497`) | Joseph Sardin | CC0 1.0 | `hound_chew` |
| [Horse eats carrot #1](https://bigsoundbank.com/horse-eats-carrot-s0862.html) (`bsb_0862`) | Joseph Sardin | CC0 1.0 | `hound_chew` |
| [Jumping on dirt road #1](https://bigsoundbank.com/jumping-on-dirt-road-1-s1837.html) (`bsb_1837`) | Joseph Sardin | CC0 1.0 | `foot_land` |
| [Jumping on dirt road #2](https://bigsoundbank.com/jumping-on-dirt-road-2-s1838.html) (`bsb_1838`) | Joseph Sardin | CC0 1.0 | `foot_land` |
| [Jumping on Grass #1](https://bigsoundbank.com/jumping-on-grass-1-s1839.html) (`bsb_1839`) | Joseph Sardin | CC0 1.0 | `foot_land` |
| [Jumping on grass #2](https://bigsoundbank.com/jumping-on-grass-2-s1840.html) (`bsb_1840`) | Joseph Sardin | CC0 1.0 | `foot_land` |
| [Jumping on wooden pontoon #1](https://bigsoundbank.com/jumping-on-wooden-pontoon-1-s1841.html) (`bsb_1841`) | Joseph Sardin | CC0 1.0 | `foot_land_wood` |
| [Jumping on wooden pontoon #2](https://bigsoundbank.com/jumping-on-wooden-pontoon-2-s1842.html) (`bsb_1842`) | Joseph Sardin | CC0 1.0 | `foot_land_wood` |
| [Man Breathing](https://bigsoundbank.com/man-breathing-s2195.html) (`bsb_2195`) | Joseph Sardin | CC0 1.0 | `breath_cold` |
| [Man sniffing](https://bigsoundbank.com/man-sniffing-s1095.html) (`bsb_1095`) | Joseph Sardin | CC0 1.0 | `hound_sniff` |
| [Match #1](https://bigsoundbank.com/match-s0004.html) (`bsb_0004`) | Joseph Sardin | CC0 1.0 | `match_strike` |
| [Match #2](https://bigsoundbank.com/match-2-s1271.html) (`bsb_1271`) | Joseph Sardin | CC0 1.0 | `match_strike` |
| [Metal drawer #1](https://bigsoundbank.com/metal-drawers-1-s0792.html) (`bsb_0792`) | Joseph Sardin | CC0 1.0 | `cash_register` |
| [Metal grinding #2](https://bigsoundbank.com/metal-grinding-2-s0857.html) (`bsb_0857`) | Joseph Sardin | CC0 1.0 | `stove_door_close`, `stove_door_open` |
| [Microwave Bell](https://bigsoundbank.com/microwave-bell-s1631.html) (`bsb_1631`) | Joseph Sardin | CC0 1.0 | `cash_register` |
| [Mountain stream #1](https://bigsoundbank.com/mountain-stream-1-s2754.html) (`bsb_2754`) | Joseph Sardin | CC0 1.0 | `amb_creek` |
| [Mouth Noises #1](https://bigsoundbank.com/mouth-noises-1-s0352.html) (`bsb_0352`) | Joseph Sardin | CC0 1.0 | `drink_gulp` |
| [Mouth noises #2](https://bigsoundbank.com/mouth-noises-2-s0353.html) (`bsb_0353`) | Joseph Sardin | CC0 1.0 | `drink_gulp` |
| [Newspaper page](https://bigsoundbank.com/newspaper-page-s0669.html) (`bsb_0669`) | Joseph Sardin | CC0 1.0 | `paper_rustle` |
| [Old car horn #1](https://bigsoundbank.com/old-car-horn-1-s0254.html) (`bsb_0254`) | Joseph Sardin | CC0 1.0 | `veh_horn` |
| [Old car horn #2](https://bigsoundbank.com/old-car-horn-2-s0255.html) (`bsb_0255`) | Joseph Sardin | CC0 1.0 | `veh_horn` |
| [Old car horn #3](https://bigsoundbank.com/old-car-horn-3-s0256.html) (`bsb_0256`) | Joseph Sardin | CC0 1.0 | `veh_horn` |
| [Old dog barking #2](https://bigsoundbank.com/old-dog-barking-2-s2353.html) (`bsb_2353`) | Joseph Sardin | CC0 1.0 | `hound_whine`, `hound_yip` |
| [Old switch](https://bigsoundbank.com/old-switch-s0540.html) (`bsb_0540`) | Joseph Sardin | CC0 1.0 | `flashlight_click` |
| [Pack of chips, manipulation #1](https://bigsoundbank.com/pack-of-chips-manipulation-1-s1433.html) (`bsb_1433`) | Joseph Sardin | CC0 1.0 | `bag_rustle` |
| [Pack of chips, manipulation #2](https://bigsoundbank.com/pack-of-chips-manipulation-2-s1434.html) (`bsb_1434`) | Joseph Sardin | CC0 1.0 | `bag_rustle` |
| [Pack of chips, opening](https://bigsoundbank.com/pack-of-chips-opening-s1431.html) (`bsb_1431`) | Joseph Sardin | CC0 1.0 | `bag_rustle` |
| [Paella pan, outside](https://bigsoundbank.com/paella-pan-outside-s1581.html) (`bsb_1581`) | Joseph Sardin | CC0 1.0 | `stove_door_close`, `stove_door_open` |
| [Pages that turn #3](https://bigsoundbank.com/pages-that-turn-3-s2210.html) (`bsb_2210`) | Joseph Sardin | CC0 1.0 | `page_turn` |
| [Pages that Turn #5](https://bigsoundbank.com/pages-that-turn-5-s2212.html) (`bsb_2212`) | Joseph Sardin | CC0 1.0 | `page_turn` |
| [Pages that turn #7](https://bigsoundbank.com/pages-that-turn-7-s2214.html) (`bsb_2214`) | Joseph Sardin | CC0 1.0 | `page_turn` |
| [Pencil #1](https://bigsoundbank.com/pencil-s0221.html) (`bsb_0221`) | Joseph Sardin | CC0 1.0 | `pencil_scribble` |
| [Pencil #2](https://bigsoundbank.com/pencil-2-s3233.html) (`bsb_3233`) | Joseph Sardin | CC0 1.0 | `pencil_scribble` |
| [Plant a wooden picket](https://bigsoundbank.com/plant-a-wooden-picket-s1389.html) (`bsb_1389`) | Joseph Sardin | CC0 1.0 | `axe_chop_hard`, `bigfoot_wood_knock`, `log_roll`, `log_thud`, `wood_stack` |
| [Rain and thunder in a tent](https://bigsoundbank.com/rain-and-storm-in-a-tent-s0820.html) (`bsb_0820`) | Joseph Sardin | CC0 1.0 | `amb_rain_roof` |
| [Rain on car roof](https://bigsoundbank.com/rain-on-car-roof-s1293.html) (`bsb_1293`) | Joseph Sardin | CC0 1.0 | `amb_rain_roof` |
| [Rain on Puddle](https://bigsoundbank.com/rain-on-puddle-s1290.html) (`bsb_1290`) | Joseph Sardin | CC0 1.0 | `amb_rain` |
| [Raw carrot crunched #1](https://bigsoundbank.com/raw-carrot-crunched-1-s1594.html) (`bsb_1594`) | Joseph Sardin | CC0 1.0 | `eat_crunch` |
| [Repetitive squeaking #1](https://bigsoundbank.com/repetitive-squeaking-1-s3323.html) (`bsb_3323`) | Joseph Sardin | CC0 1.0 | `gumberoo_squeak` |
| [Running in the tall grass](https://bigsoundbank.com/running-in-the-tall-grass-s1844.html) (`bsb_1844`) | Joseph Sardin | CC0 1.0 | `branch_swish`, `foliage_rustle` |
| [Running in the Tall Grass](https://bigsoundbank.com/running-in-the-tall-grass-s1843.html) (`bsb_1843`) | Joseph Sardin | CC0 1.0 | `branch_swish`, `foliage_rustle` |
| [Saw Wood](https://bigsoundbank.com/saw-wood-s0559.html) (`bsb_0559`) | Joseph Sardin | CC0 1.0 | `saw_hand` |
| [Shoes in the Water](https://bigsoundbank.com/shoes-in-the-water-s0690.html) (`bsb_0690`) | Joseph Sardin | CC0 1.0 | `foot_mud` |
| [Sigh by the Mouth](https://bigsoundbank.com/sigh-by-the-mouth-s1405.html) (`bsb_1405`) | Joseph Sardin | CC0 1.0 | `sigh_satisfied` |
| [Sigh by the nose](https://bigsoundbank.com/sigh-by-the-nose-s1404.html) (`bsb_1404`) | Joseph Sardin | CC0 1.0 | `sigh_satisfied` |
| [Small bell](https://bigsoundbank.com/small-bell-s0010.html) (`bsb_0010`) | Joseph Sardin | CC0 1.0 | `shop_bell` |
| [Small waves and beach #1](https://bigsoundbank.com/small-waves-and-beach-1-s1446.html) (`bsb_1446`) | Joseph Sardin | CC0 1.0 | `amb_lake` |
| [Sniff](https://bigsoundbank.com/sniff-s0784.html) (`bsb_0784`) | Joseph Sardin | CC0 1.0 | `hound_sniff` |
| [Sound Atmosphere in a House](https://bigsoundbank.com/sound-atmosphere-in-a-house-s2458.html) (`bsb_2458`) | Joseph Sardin | CC0 1.0 | `amb_cabin`, `amb_store` |
| [Squeaker toy #2](https://bigsoundbank.com/squeaker-toy-2-s0879.html) (`bsb_0879`) | Joseph Sardin | CC0 1.0 | `gumberoo_squeak` |
| [Squeaking parquet #1](https://bigsoundbank.com/squeaking-parquet-1-s3051.html) (`bsb_3051`) | Joseph Sardin | CC0 1.0 | `axe_stuck`, `floor_creak` |
| [Squeaking Parquet #10](https://bigsoundbank.com/squeaking-parquet-10-s3060.html) (`bsb_3060`) | Joseph Sardin | CC0 1.0 | `axe_pull`, `axe_stuck`, `tree_creak` |
| [Squeaking parquet #3](https://bigsoundbank.com/squeaking-parquet-3-s3053.html) (`bsb_3053`) | Joseph Sardin | CC0 1.0 | `axe_stuck`, `floor_creak` |
| [Squeaking parquet #5](https://bigsoundbank.com/squeaking-parquet-5-s3055.html) (`bsb_3055`) | Joseph Sardin | CC0 1.0 | `axe_pull`, `floor_creak` |
| [Squeaking parquet #7](https://bigsoundbank.com/squeaking-parquet-7-s3057.html) (`bsb_3057`) | Joseph Sardin | CC0 1.0 | `axe_pull`, `floor_creak` |
| [Squeaks of trailer handbrake](https://bigsoundbank.com/squeaks-of-trailer-handbrake-s1231.html) (`bsb_1231`) | Joseph Sardin | CC0 1.0 | `veh_door_open`, `veh_suspension` |
| [Steps in the Grass, Slow](https://bigsoundbank.com/steps-in-the-grass-slow-s1253.html) (`bsb_1253`) | Joseph Sardin | CC0 1.0 | `foot_grass` |
| [Steps in the Mud](https://bigsoundbank.com/steps-in-the-mud-s0495.html) (`bsb_0495`) | Joseph Sardin | CC0 1.0 | `foot_mud` |
| [Steps in the short grass](https://bigsoundbank.com/steps-in-the-short-grass-s0854.html) (`bsb_0854`) | Joseph Sardin | CC0 1.0 | `foot_grass` |
| [Steps in the snow #3](https://bigsoundbank.com/steps-in-the-snow-3-s3363.html) (`bsb_3363`) | Joseph Sardin | CC0 1.0 | `foot_snow` |
| [Steps in the tall grass](https://bigsoundbank.com/steps-in-the-tall-grass-s1024.html) (`bsb_1024`) | Joseph Sardin | CC0 1.0 | `branch_swish`, `foot_grass` |
| [Steps on a Wooden Floor #1](https://bigsoundbank.com/steps-on-a-wooden-floor-1-s1515.html) (`bsb_1515`) | Joseph Sardin | CC0 1.0 | `foot_wood` |
| [Steps on a wooden floor #2](https://bigsoundbank.com/steps-on-a-wooden-floor-2-s1516.html) (`bsb_1516`) | Joseph Sardin | CC0 1.0 | `foot_wood` |
| [Steps on a wooden floor #4](https://bigsoundbank.com/steps-on-a-wooden-floor-4-s1518.html) (`bsb_1518`) | Joseph Sardin | CC0 1.0 | `foot_wood` |
| [Steps on the Twigs](https://bigsoundbank.com/steps-on-the-twigs-s1301.html) (`bsb_1301`) | Joseph Sardin | CC0 1.0 | `foot_forest` |
| [Strangled man #1](https://bigsoundbank.com/strangled-man-1-s1639.html) (`bsb_1639`) | Joseph Sardin | CC0 1.0 | `grunt_effort`, `hurt` |
| [Strong Wind #1](https://bigsoundbank.com/strong-wind-1-s0146.html) (`bsb_0146`) | Joseph Sardin | CC0 1.0 | `amb_wind` |
| [Strong wind and trees #1](https://bigsoundbank.com/strong-wind-and-trees-1-s1450.html) (`bsb_1450`) | Joseph Sardin | CC0 1.0 | `amb_wind` |
| [Switch](https://bigsoundbank.com/switch-s0780.html) (`bsb_0780`) | Joseph Sardin | CC0 1.0 | `flashlight_click` |
| [Switch desk lamp](https://bigsoundbank.com/switch-desk-lamp-s0036.html) (`bsb_0036`) | Joseph Sardin | CC0 1.0 | `flashlight_click` |
| [Sword Through the Air](https://bigsoundbank.com/sword-through-the-air-s0128.html) (`bsb_0128`) | Joseph Sardin | CC0 1.0 | `axe_glance`, `axe_pull`, `axe_whoosh`, `branch_swish`, `hound_snarl`, `tree_fall_small` |
| [Thunder #1](https://bigsoundbank.com/thunder-s2718.html) (`bsb_2718`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #2](https://bigsoundbank.com/thunder-2-s3113.html) (`bsb_3113`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #3](https://bigsoundbank.com/thunder-3-s3114.html) (`bsb_3114`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #4](https://bigsoundbank.com/thunder-4-s3115.html) (`bsb_3115`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #5](https://bigsoundbank.com/thunder-5-s3116.html) (`bsb_3116`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #6](https://bigsoundbank.com/thunder-6-s3179.html) (`bsb_3179`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #7](https://bigsoundbank.com/thunder-7-s3180.html) (`bsb_3180`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Thunder #8](https://bigsoundbank.com/thunder-8-s3181.html) (`bsb_3181`) | Joseph Sardin | CC0 1.0 | `weather_thunder` |
| [Torn and creased page #1](https://bigsoundbank.com/torn-and-creased-page-1-s1225.html) (`bsb_1225`) | Joseph Sardin | CC0 1.0 | `paper_rustle` |
| [Truck engine, big accelerations](https://bigsoundbank.com/truck-engine-big-accelerations-s1147.html) (`bsb_1147`) | Joseph Sardin | CC0 1.0 | `veh_rev` |
| [Turned Page](https://bigsoundbank.com/turned-page-s0164.html) (`bsb_0164`) | Joseph Sardin | CC0 1.0 | `page_turn` |
| [Walk on Pontoon](https://bigsoundbank.com/walk-on-pontoon-s1845.html) (`bsb_1845`) | Joseph Sardin | CC0 1.0 | `foot_porch` |
| [Whistling kettle #1](https://bigsoundbank.com/whistling-kettle-1-s1351.html) (`bsb_1351`) | Joseph Sardin | CC0 1.0 | `kettle_whistle` |
| [Whoosh #4](https://bigsoundbank.com/whoosh-4-s1796.html) (`bsb_1796`) | Joseph Sardin | CC0 1.0 | `axe_whoosh`, `branch_swish` |
| [Whoosh #5](https://bigsoundbank.com/whoosh-5-s1797.html) (`bsb_1797`) | Joseph Sardin | CC0 1.0 | `axe_glance`, `axe_whoosh`, `branch_swish`, `tree_fall_small` |
| [Wind from inside #1](https://bigsoundbank.com/wind-from-inside-1-s1714.html) (`bsb_1714`) | Joseph Sardin | CC0 1.0 | `amb_cabin` |
| [Wind in the Trees](https://bigsoundbank.com/forest-wind-in-the-trees-s0904.html) (`bsb_0904`) | Joseph Sardin | CC0 1.0 | `amb_forest_day`, `amb_forest_dusk`, `amb_forest_night` |
| [Wood stove "devil"](https://bigsoundbank.com/wood-stove-devil-s0217.html) (`bsb_0217`) | Joseph Sardin | CC0 1.0 | `fire_stove` |
| [Wooden barn door](https://bigsoundbank.com/wooden-barn-door-s0538.html) (`bsb_0538`) | Joseph Sardin | CC0 1.0 | `door_shut` |
| [Wooden drawer #1](https://bigsoundbank.com/wooden-drawer-1-s1267.html) (`bsb_1267`) | Joseph Sardin | CC0 1.0 | `drawer_close`, `drawer_open` |
| [Wooden drawer, closing](https://bigsoundbank.com/wooden-drawer-closing-s1500.html) (`bsb_1500`) | Joseph Sardin | CC0 1.0 | `drawer_close` |
| [Wooden drawer, opening](https://bigsoundbank.com/wooden-drawer-opening-s1499.html) (`bsb_1499`) | Joseph Sardin | CC0 1.0 | `drawer_open` |
| [Zip #1](https://bigsoundbank.com/zip-1-s0014.html) (`bsb_0014`) | Joseph Sardin | CC0 1.0 | `zip` |
| [Zip #5](https://bigsoundbank.com/zip-5-s0626.html) (`bsb_0626`) | Joseph Sardin | CC0 1.0 | `zip` |
| [Zip #6](https://bigsoundbank.com/zip-6-s1861.html) (`bsb_1861`) | Joseph Sardin | CC0 1.0 | `zip` |
| [Zip #7](https://bigsoundbank.com/zip-7-s1862.html) (`bsb_1862`) | Joseph Sardin | CC0 1.0 | `zip` |
| [Zip #8](https://bigsoundbank.com/zip-8-s1863.html) (`bsb_1863`) | Joseph Sardin | CC0 1.0 | `zip` |

### nps.gov

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Boreal Chorus Frogs (yell-ChorusFrogs.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-chorusfrogs.htm) (`nps_chorusfrogs`) | NPS/Neal Herbert | Public domain (US NPS) | `animal_frogs` |
| [Bull Elk Bugling (yell-YELLLakeElkRut20160913T004ms1.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-elk.htm) (`nps_lakeelkrut20160913t004ms1`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `bigfoot_whoop`, `creature_distant_scream` |
| [Chopping Kindling (yell-YELLChopKindling20160913T0011.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-soundscapes.htm) (`nps_chopkindling20160913t0011`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `wood_chop_kindling`, `wood_split` |
| [Chorus of Wolves (yell-YELLWolves20160111T20ms2.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-wolves.htm) (`nps_wolves20160111t20ms2`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `animal_wolves` |
| [Common Raven (nri-CommonRavenGRTE.mp3)](https://www.nps.gov/subjects/sound/sounds-common-raven.htm) (`nps_commonravengrte`) | NPS | Public domain (US NPS) | `bird_raven` |
| [Common Raven (yell-RavenBlackSandBasin.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-raven.htm) (`nps_ravenblacksandbasin`) | NPS/David Restivo | Public domain (US NPS) | `bird_raven` |
| [Coyotes Howling (yell-Coyotes.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-coyote.htm) (`nps_coyotes`) | NPS/Neal Herbert | Public domain (US NPS) | `animal_coyotes` |
| [Coyotes Howling (yell-YELLCoyotes150315.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-coyote.htm) (`nps_coyotes150315`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `animal_coyotes`, `bigfoot_whoop` |
| [Grizzly Bear (vocalizations) (yell-YELLGrizzlyBearVocalizations20160520Android1.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/grizzlysounds.htm) (`nps_grizzlybearvocalizations2016`) | NPS/Dan Bergum | Public domain (US NPS) | `bigfoot_grunt` |
| [Grizzly Bear Eating (yell-YELLgrizzlyB20160624SM3031431.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/grizzlysounds.htm) (`nps_grizzlyb20160624sm3031431`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `hound_chew` |
| [Maple Fire, late afternoon (yell-YELLMapleFire20160814T12ms.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-fire.htm) (`nps_maplefire20160814t12ms`) | NPS/Jennifer Jerrett | Public domain (US NPS) | `fire_camp` |
| [Northern Flicker (nri-NorthernFlickerYOSE.mp3)](https://www.nps.gov/subjects/sound/sounds-northern-flicker.htm) (`nps_northernflickeryose`) | NPS | Public domain (US NPS) | `bird_woodpecker` |
| [Red Fox (yell-YELLMJ23200837redfox.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-redfox.htm) (`nps_mj23200837redfox`) | NPS / Shan Burson | Public domain (US NPS) | `creature_distant_scream` |
| [Red Squirrel (yell-YELLSGYredsquirrel2004320.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-redsquirrel.htm) (`nps_sgyredsquirrel2004320`) | NPS / Shan Burson | Public domain (US NPS) | `animal_red_squirrel` |
| [Ruffed Grouse (yell-RuffedGrouse.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-ruffedgrouse.htm) (`nps_ruffedgrouse`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `bird_grouse_drum` |
| [Singing Lake (yell-YellowstoneLakeSings.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-singinglake.htm) (`nps_yellowstonelakesings`) | NPS/Jennifer Jerrett | Public domain (US NPS) | `amb_drone` |
| [Soundscape - Lake (yell-YELLLakeSoundscape20160913T01ms.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-soundscapes.htm) (`nps_lakesoundscape20160913t01ms`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `amb_lake` |
| [Splitting Wood (yell-YELLSplitLogs20160913T002.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-soundscapes.htm) (`nps_splitlogs20160913t002`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `wood_split` |
| [Spotted Bat (nri-SpottedBatYOSE.mp3)](https://www.nps.gov/subjects/sound/sounds-spotted-bat.htm) (`nps_spottedbatyose`) | NPS | Public domain (US NPS) | `dingbat_screech` |
| [Spotted Owl (nri-SpottedOwlYOSE.mp3)](https://www.nps.gov/subjects/sound/sounds-spotted-owl.htm) (`nps_spottedowlyose`) | NPS | Public domain (US NPS) | `bird_owl_barred` |
| [Squirrel (nri-SquirrelYELL.mp3)](https://www.nps.gov/subjects/sound/sounds-squirrel.htm) (`nps_squirrelyell`) | NPS | Public domain (US NPS) | `animal_red_squirrel` |
| [Wolves (yell-YELLWolvesDec252013.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-wolves.htm) (`nps_wolvesdec252013`) | NPS & MSU Acoustic Atlas/Jennifer Jerrett | Public domain (US NPS) | `animal_wolves` |
| [Woodstove (yell-YELLPealeCabinWoodstove20160914T15ms.mp3)](https://www.nps.gov/yell/learn/photosmultimedia/sounds-soundscapes.htm) (`nps_pealecabinwoodstove20160914t`) | NPS & MSU Acoustic Atlas | Public domain (US NPS) | `fire_stove` |

### opengameart.org

| Source | Author | Licence | Used by |
|---|---|---|---|
| [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) (`oga_rd_creature`) | rubberduck | CC0 1.0 | `hound_whine` |
| [80 CC0 creture SFX #2](https://opengameart.org/content/80-cc0-creture-sfx-2) (`oga_rd_creature2`) | rubberduck | CC0 1.0 | `grunt_effort` |

Licences: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/); Public Domain Mark 1.0 (https://creativecommons.org/publicdomain/mark/1.0/); US federal government works (NPS, USFWS) are in the public domain in the US (17 U.S.C. 105). BigSoundBank: every sound used is marked "License CC0 (public domain)" on its page (https://bigsoundbank.com/licenses.html).

## Creatures

All creature and wildlife models, textures and animations (`src/creatures/`) are generated procedurally at runtime;
no third-party model, texture or sound files are used.

| what | source | author | licence |
|---|---|---|---|
| Anatomy library (`src/creatures/anatomy/`: control cages, Catmull-Clark creases, chart packing, pixel painter, limbs, locks) | ported from the ODDWORLD project (`src/life/anatomy`, `kit.ts`, `cage.ts`, `art/palette.ts`) | the BUSHED project owner (own code) | project-internal |
| The Axehandle Hound, Gumberoo and Bigfoot lore | William T. Cox, *Fearsome Creatures of the Lumberwoods* (1910); North American folklore | William T. Cox | public domain |

## Humans

* `src/humans/` (people: lofted skinned bodies, hands, heads, rig, NPC animation, painted clothing) and
  `src/player/arms.ts` (first-person arms) are ported from the author's own earlier games:
  **Limbophobia** (`automatic-disco/src/limbo/entities/`: humanModel.ts body / head / hand / foot lofts and
  faceRelief, humanRig.ts skeleton conventions, humanIK.ts two-bone IK, humanPaint.ts face and hair painting,
  gfx/pixel.ts) by way of the cleaned-up port in **Blobfish** (`ubiquitous-happiness/src/humans/` rig.ts, body.ts,
  head.ts beards and hair shells, anim.ts pose-channel animation; `src/gfx/loft.ts`, `src/gfx/px.ts`). Same author,
  no third-party assets. Redesigned for BUSHED: realistic proportions, per-finger bones, clavicles and forearm
  twist, and all-new procedurally painted Canadian bush clothing (no image files).
* The arms viewer on `humans.html?arms=1` loads the props listed above (`wooden_axe.glb`, `hatchet.glb`,
  `sledgehammer_01.glb`, `vintage_flashlight.glb`, `wine_bottle_bordeaux.glb`, `handsaw_wood.glb`) when present.

## Forest

Trees, ground cover and their textures (`src/trees/`, `src/world/forest.ts`, `src/world/groundcover.ts`, `src/world/veg/`). All third-party sources are **CC0 1.0** from [Poly Haven](https://polyhaven.com) (credit appreciated, not required). Everything else (tree / plant / log / rock geometry, birch bark, cedar sprays, dead twigs, beard lichen, flowers, mushrooms, end grain) is procedural. Textures are re-made as high-resolution pixel art by `tools/forest/*.py` (download -> flatten light -> k-means photo palette -> quantise); models are converted with **lowpix** (`python -m lowpix convert polyhaven:<id> --style realistic`) and their atlases pixelised by `tools/forest/models.py`.

### Textures (`public/assets/textures/trees/`, `public/assets/textures/veg/`)

| Used for | Source | Author | Licence |
|---|---|---|---|
| `bark_spruce.png` (+ `_n`) | [Bark Platanus](https://polyhaven.com/a/bark_platanus) | Dimitrios Savva | CC0 |
| `bark_fir.png` (+ `_n`) | [Chinese Hackberry Bark](https://polyhaven.com/a/chinese_hackberry_bark) (+ procedural resin blisters, lichen) | Charlotte Baglioni | CC0 |
| `bark_pine.png` (+ `_n`) | [Pine Bark](https://polyhaven.com/a/pine_bark) | Dimitrios Savva | CC0 |
| `bark_cedar.png` (+ `_n`) | [Metasequoia Bark](https://polyhaven.com/a/metasequoia_bark) | Charlotte Baglioni | CC0 |
| `bark_birch.png` (+ `_n`) | procedural, surface detail from [Japanese Sycamore](https://polyhaven.com/a/japanese_sycamore) | Charlotte Baglioni | CC0 |
| `foliage_spruce/fir.png`, `veg_atlas.png` (juniper) | needle sprigs from [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) twig maps | Rob Tuytel, Rico Cilliers | CC0 |
| `foliage_pine.png` | needle sprig from [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) twig maps | Rob Tuytel, Rico Cilliers | CC0 |
| `foliage_birch.png` | leaf colour / veins from [Shrub 01](https://polyhaven.com/a/shrub_01) | Rico Cilliers | CC0 |
| `veg_atlas.png` (sword fern, bracken) | fronds from [Fern 02](https://polyhaven.com/a/fern_02) | Rob Tuytel, Rico Cilliers | CC0 |
| `veg_atlas.png` (alder, blueberry) | leaves from [Shrub 03](https://polyhaven.com/a/shrub_03), [Shrub 04](https://polyhaven.com/a/shrub_04) | Rico Cilliers | CC0 |
| `veg/moss.png` | colour from [Concrete Moss](https://polyhaven.com/a/concrete_moss) (+ procedural cushions) | Rob Tuytel | CC0 |
| `veg/forest_floor.png` (+ `_n`, test page ground) | [Forest Leaves 02](https://polyhaven.com/a/forest_leaves_02) | Rob Tuytel | CC0 |
| `veg/mossy_rock.png` (+ `_n`, boulders) | [Mossy Rock](https://polyhaven.com/a/mossy_rock) | Rob Tuytel | CC0 |
| `veg/litter.png` | [Forrest Ground 03](https://polyhaven.com/a/forrest_ground_03) | Rob Tuytel | CC0 |

### Models (`public/assets/models/nature/`, converted with lowpix, atlases pixelised)

| File | Source | Author | Licence |
|---|---|---|---|
| `tree_stump_01.glb`, `tree_stump_02.glb` | [Tree Stump 01](https://polyhaven.com/a/tree_stump_01), [Tree Stump 02](https://polyhaven.com/a/tree_stump_02) | Rob Tuytel | CC0 |
| `dead_tree_trunk.glb` | [Dead Tree Trunk](https://polyhaven.com/a/dead_tree_trunk) | Rob Tuytel | CC0 |
| `dead_tree_trunk_02.glb` | [Dead Tree Trunk 02](https://polyhaven.com/a/dead_tree_trunk_02) | Jenelle van Heerden, Rico Cilliers | CC0 |
| `dry_branches_medium_01.glb` | [Dry Branches Medium 01](https://polyhaven.com/a/dry_branches_medium_01) | Rico Cilliers | CC0 |
| `bark_debris_01.glb` | [Bark Debris 01](https://polyhaven.com/a/bark_debris_01) | Greg Zaal, Jenelle van Heerden | CC0 |
| `boulder_01.glb` | [Boulder 01](https://polyhaven.com/a/boulder_01) | Rico Cilliers | CC0 |
| `rock_07.glb`, `rock_09.glb` | [Rock 07](https://polyhaven.com/a/rock_07), [Rock 09](https://polyhaven.com/a/rock_09) | Jenelle van Heerden | CC0 |
| `stone_01.glb` | [Stone 01](https://polyhaven.com/a/stone_01) | Dario Barresi, Rico Cilliers | CC0 |
| `rock_moss_set_01.glb`, `rock_moss_set_02.glb` | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01), [Rock Moss Set 02](https://polyhaven.com/a/rock_moss_set_02) | Kless Gyzen | CC0 |

## Fonts (`public/assets/fonts`)

| Font | Author | Licence |
|---|---|---|
| Caveat | Impallari Type | SIL OFL 1.1 (`Caveat-OFL.txt`) |
| Patrick Hand | Patrick Wagesreiter | SIL OFL 1.1 (`PatrickHand-OFL.txt`) |
| IM Fell English | Igino Marini | SIL OFL 1.1 (`IMFell-OFL.txt`) |
| Special Elite | Astigmatic | Apache 2.0 (`SpecialElite-LICENSE.txt`) |
| Homemade Apple | Font Diner | Apache 2.0 (`HomemadeApple-LICENSE.txt`) |

All downloaded from the Google Fonts repository (github.com/google/fonts).

## Code

* Rendering: [three.js](https://threejs.org) (MIT). Physics: [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`, Apache 2.0).
* The renderer, post chain, sky, terrain, chopping (notches, hinge felling, limbing, bucking, splitting), wood pieces,
  physics props, hands, survival, Jeep driving and game flow were written for BUSHED.
* Human builder and first-person arms: ported from the user's **Limbophobia** (see "Humans").
  Creature anatomy: ported from the user's **ODDWORLD** (see "Creatures"). Props converted with the user's **lowpix**.


## Places

The cabin, the woodyard and Pruneau's General Store (`src/places/`). Building and furniture textures in
`public/assets/textures/places/` are made by `src/places/tools/make_textures.py` from the Poly Haven (CC0) photo
textures below (downsampled to 256 px/m, lighting flattened, quantised onto photo palettes, procedural layouts for
shakes, end grain, siding paint, plaid wool, grime). Signs, posters, labels and product surfaces (`signs.png`,
`labels.png`) are original pixel art drawn by `src/places/tools/make_print.py`; every brand, slogan and character on
them is invented. Their text is set in DejaVu Serif/Sans (Bitstream Vera licence), Caladea and Carlito (SIL OFL 1.1)
and FreeSerif (GPL with font exception), rasterised to pixels. Firewood bark (`bark_light`) is the trees module's
`textures/trees/bark_spruce.png` (Poly Haven `bark_platanus`, Dimitrios Savva, CC0) brightened. Furniture props (stools, lanterns, rocker, register, barrels, crates...) are the
converted Poly Haven models credited with the props.

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Brown Leather](https://polyhaven.com/a/brown_leather) (`brown_leather`) | Rob Tuytel | CC0 1.0 | `leather` |
| [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) (`fine_grained_wood`) | Rob Tuytel | CC0 1.0 | `board_warm`, `wood_fresh` |
| [Mossy Rock](https://polyhaven.com/a/mossy_rock) (`mossy_rock`) | Rob Tuytel | CC0 1.0 | `shakes` |
| [Old Stone Wall](https://polyhaven.com/a/old_stone_wall) (`old_stone_wall`) | Charlotte Baglioni | CC0 1.0 | `stone` |
| [Old Wood Floor](https://polyhaven.com/a/old_wood_floor) (`old_wood_floor`) | Guillaume Monsergent | CC0 1.0 | `floor` |
| [Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone) (`poly_wool_herringbone`) | colormass, Rico Cilliers | CC0 1.0 | `blanket`, `wool_grey` |
| [Rough Wood](https://polyhaven.com/a/rough_wood) (`rough_wood`) | Rob Tuytel | CC0 1.0 | `log_ext`, `shakes` |
| [Rust Coarse 01](https://polyhaven.com/a/rust_coarse_01) (`rust_coarse_01`) | Dimitrios Savva, Rico Cilliers | CC0 1.0 | `galv`, `iron` |
| [Rusty Corrugated Iron](https://polyhaven.com/a/rusty_corrugated_iron) (`rusty_corrugated_iron`) | Charlotte Baglioni | CC0 1.0 | `corrugated` |
| [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal) (`rusty_painted_metal`) | Amal Kumar | CC0 1.0 | `rusty_red` |
| [Weathered Plank Siding](https://polyhaven.com/a/weathered_plank_siding) (`weathered_plank_siding`) | Dimitrios Savva | CC0 1.0 | `siding_red` |
| [Weathered Planks](https://polyhaven.com/a/weathered_planks) (`weathered_planks`) | Dario Barresi, Dimitrios Savva | CC0 1.0 | `boards_green`, `trim_cream` |
| [White Rough Plaster](https://polyhaven.com/a/white_rough_plaster) (`white_rough_plaster`) | Rob Tuytel | CC0 1.0 | `chink` |
| [Wood Chips](https://polyhaven.com/a/wood_chips) (`wood_chips`) | eye-candy.xyz | CC0 1.0 | `woodchips` |
| [Wood Planks Grey](https://polyhaven.com/a/wood_planks_grey) (`wood_planks_grey`) | Rob Tuytel | CC0 1.0 | `planks_grey` |
| [Wood Table Worn](https://polyhaven.com/a/wood_table_worn) (`wood_table_worn`) | Dimitrios Savva, Rico Cilliers | CC0 1.0 | `board_grey`, `board_warm`, `log_int` |
