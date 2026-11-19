# BUSHED credits

## Sound

Every file in `public/assets/sfx/` is made by `tools/sounds/build_sounds.py` from the recordings below (trimmed, layered, re-pitched, filtered, reverberated, loudness-normalised; recipes in `tools/sounds/recipes.json`), plus a little procedural synthesis (numpy noise, tones, thumps). Only CC0 and public-domain sources are used. Rebuild: `python3 tools/sounds/build_sounds.py fetch` then `... build` (downloads are checked against the sha256 in recipes.json).

### bigsoundbank.com

| Source | Author | Licence | Used by |
|---|---|---|---|
| [Blow hard #1](https://bigsoundbank.com/blow-hard-1-s1602.html) (`bsb_1602`) | Joseph Sardin | CC0 1.0 | `deer_snort` |
| [Body Fall #1](https://bigsoundbank.com/body-fall-1-s2452.html) (`bsb_2452`) | Joseph Sardin | CC0 1.0 | `bullet_hit`, `deer_stomp` |
| [Bread knife #1](https://bigsoundbank.com/bread-knife-1-s1247.html) (`bsb_1247`) | Joseph Sardin | CC0 1.0 | `field_dress` |
| [Breath horse #4](https://bigsoundbank.com/breath-horse-4-s1543.html) (`bsb_1543`) | Joseph Sardin | CC0 1.0 | `deer_snort` |
| [Breath of a horse #1](https://bigsoundbank.com/breath-of-a-horse-1-s0285.html) (`bsb_0285`) | Joseph Sardin | CC0 1.0 | `deer_snort` |
| [Breath of a horse #2](https://bigsoundbank.com/breath-of-a-horse-2-s0286.html) (`bsb_0286`) | Joseph Sardin | CC0 1.0 | `deer_snort` |
| [Bullet case 7.62mm on concrete #1](https://bigsoundbank.com/bullet-case-7-62mm-on-concrete-1-s1367.html) (`bsb_1367`) | Joseph Sardin | CC0 1.0 | `shell_drop` |
| [Bullet case 7.62mm on concrete #2](https://bigsoundbank.com/bullet-case-7-62mm-on-concrete-2-s1368.html) (`bsb_1368`) | Joseph Sardin | CC0 1.0 | `shell_drop` |
| [Cow moos](https://bigsoundbank.com/cow-moos-s0546.html) (`bsb_0546`) | Joseph Sardin | CC0 1.0 | `moose_call`, `moose_grunt` |
| [Gun loading #1](https://bigsoundbank.com/gun-loading-1-s1988.html) (`bsb_1988`) | Joseph Sardin | CC0 1.0 | `rifle_load` |
| [Pistol cocking #1](https://bigsoundbank.com/pistol-cocking-1-s1984.html) (`bsb_1984`) | Joseph Sardin | CC0 1.0 | `rifle_bolt_close`, `rifle_bolt_open` |
| [Pistol cocking #2](https://bigsoundbank.com/pistol-cocking-2-s1985.html) (`bsb_1985`) | Joseph Sardin | CC0 1.0 | `rifle_bolt_open` |
| [Pistol disarming hammer #1](https://bigsoundbank.com/pistol-disarming-hammer-1-s1994.html) (`bsb_1994`) | Joseph Sardin | CC0 1.0 | `rifle_bolt_close`, `rifle_dry` |
| [Rifle shot #1](https://bigsoundbank.com/rifle-shot-1-s2853.html) (`bsb_2853`) | Joseph Sardin | CC0 1.0 | `rifle_echo`, `rifle_shot` |
| [Rifle shot #2](https://bigsoundbank.com/rifle-shot-2-s2854.html) (`bsb_2854`) | Joseph Sardin | CC0 1.0 | `rifle_echo`, `rifle_shot` |
| [Shot of Winchester Magnum XTR](https://bigsoundbank.com/shot-of-winchester-magnum-xtr-s0397.html) (`bsb_0397`) | Joseph Sardin | CC0 1.0 | `rifle_shot` |

Licences: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/); Public Domain Mark 1.0 (https://creativecommons.org/publicdomain/mark/1.0/); US federal government works (NPS, USFWS) are in the public domain in the US (17 U.S.C. 105). BigSoundBank: every sound used is marked "License CC0 (public domain)" on its page (https://bigsoundbank.com/licenses.html).

## Creatures

All creature and wildlife models, textures and animations (`src/creatures/`) are generated procedurally at runtime;
no third-party model, texture or sound files are used.

| what | source | author | licence |
|---|---|---|---|
| Anatomy library (`src/creatures/anatomy/`: control cages, Catmull-Clark creases, chart packing, pixel painter, limbs, locks) | ported from the ODDWORLD project (`src/life/anatomy`, `kit.ts`, `cage.ts`, `art/palette.ts`) | the BUSHED project owner (own code) | project-internal |
| The Axehandle Hound, Gumberoo and Bigfoot lore | William T. Cox, *Fearsome Creatures of the Lumberwoods* (1910); North American folklore | William T. Cox | public domain |
| Dingbats (`dingbat.ts`, `dingbat/`) and Granny Tamarack (`granny.ts`, `granny/`): models, painted pages, card atlases for feathers, bark strips, lichen and larch needles (`cards.ts`), dithered fog dissolve (`fade.ts`), clips and AI | procedural, written for BUSHED; the dingbat after lumber-camp "fearsome critter" yarns, Granny Tamarack an original character | the BUSHED project (own code) | project-internal |
| The six cryptids (`cryptids/`: Hodag, Squonk, Hidebehind, Agropelter and its snag, Teakettler, Snow Wasset): models, painted pages, fur pages, clips, AI | procedural, written for BUSHED; original designs | the BUSHED project (own code) | project-internal |
| Cryptid lore: Squonk, Agropelter, Snow Wasset, Hidebehind; Hodag; Teakettler | William T. Cox, *Fearsome Creatures of the Lumberwoods* (1910); the Rhinelander (Wisconsin) Hodag yarns of Eugene Shepard (1893); Henry H. Tryon, *Fearsome Critters* (1939) and lumber-camp folklore | Cox, Shepard, Tryon; oral tradition | Cox 1910 and the 1893 newspaper yarns public domain; Tryon used for folklore only (no text or art copied) |

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
| Alagard (the game's typeface: all UI and floating text) | Hewett Tsoi | free for personal and commercial use (supplied by the user) |
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

## Models and textures

Made by `tools/convert_props.py`, `tools/make_textures.py` and `tools/make_vehicle.py`: every model is converted to BUSHED's pixel-art look with lowpix (re-meshed, re-textured, rescaled), every texture is re-sampled and palette-quantised from the scans named here.

### Props (`public/assets/models/<id>.glb`) from Poly Haven

All CC0 1.0 (public domain). Thank you, Poly Haven and its artists.

| Prop id(s) | Source | Author(s) | Licence |
|---|---|---|---|
| `ammo_box` | [ammo_box](https://polyhaven.com/a/ammo_box) | DanKit | CC0 1.0 |
| `Barrel_01` | [Barrel_01](https://polyhaven.com/a/Barrel_01) | Jorge Camacho | CC0 1.0 |
| `Barrel_02` | [Barrel_02](https://polyhaven.com/a/Barrel_02) | Jorge Camacho | CC0 1.0 |
| `barrel_03` | [barrel_03](https://polyhaven.com/a/barrel_03) | Serhii Khromov | CC0 1.0 |
| `barrel_stove` | [barrel_stove](https://polyhaven.com/a/barrel_stove) | MP | CC0 1.0 |
| `binoculars` | [binoculars](https://polyhaven.com/a/binoculars) | Derek Wight | CC0 1.0 |
| `bolt_cutters_01` | [bolt_cutters_01](https://polyhaven.com/a/bolt_cutters_01) | Yann Kervran, Antanas Kep | CC0 1.0 |
| `brass_pan_01` | [brass_pan_01](https://polyhaven.com/a/brass_pan_01) | Rico Cilliers | CC0 1.0 |
| `brass_pot_01` | [brass_pot_01](https://polyhaven.com/a/brass_pot_01) | Rico Cilliers | CC0 1.0 |
| `caged_hanging_light` | [caged_hanging_light](https://polyhaven.com/a/caged_hanging_light) | Ulan Cabanilla | CC0 1.0 |
| `can_rusted` | [can_rusted](https://polyhaven.com/a/can_rusted) | Rahul Chaudhary | CC0 1.0 |
| `cardboard_box_01` | [cardboard_box_01](https://polyhaven.com/a/cardboard_box_01) | Rahul Chaudhary | CC0 1.0 |
| `CashRegister_01` | [CashRegister_01](https://polyhaven.com/a/CashRegister_01) | Joe Seabuhr | CC0 1.0 |
| `CheeseBox_01` | [CheeseBox_01](https://polyhaven.com/a/CheeseBox_01) | Gabriel Radić | CC0 1.0 |
| `cleaner_tin_01` | [cleaner_tin_01](https://polyhaven.com/a/cleaner_tin_01) | Tom Phillips | CC0 1.0 |
| `crowbar_01` | [crowbar_01](https://polyhaven.com/a/crowbar_01) | Alexander Otterbeck | CC0 1.0 |
| `drawer_cabinet` | [drawer_cabinet](https://polyhaven.com/a/drawer_cabinet) | Ulan Cabanilla | CC0 1.0 |
| `electricity_pole_01`, `electricity_pole_02`, `electricity_pole_03` | [modular_electricity_poles](https://polyhaven.com/a/modular_electricity_poles) | James Ray Cock | CC0 1.0 |
| `fish_knife` | [fish_knife](https://polyhaven.com/a/fish_knife) | Mateusz Sadek | CC0 1.0 |
| `fishermans_hat` | [fishermans_hat](https://polyhaven.com/a/fishermans_hat) | PierreB3D | CC0 1.0 |
| `garden_gloves_01` | [garden_gloves_01](https://polyhaven.com/a/garden_gloves_01) | Satyaki Mandal | CC0 1.0 |
| `hand_plane_no4` | [hand_plane_no4](https://polyhaven.com/a/hand_plane_no4) | Satyaki Mandal | CC0 1.0 |
| `handsaw_wood` | [handsaw_wood](https://polyhaven.com/a/handsaw_wood) | Konrad Szałankiewicz | CC0 1.0 |
| `hatchet` | [hatchet](https://polyhaven.com/a/hatchet) | James Ray Cock, Ulan Cabanilla | CC0 1.0 |
| `industrial_wall_lamp` | [industrial_wall_lamp](https://polyhaven.com/a/industrial_wall_lamp) | Kuutti Siitonen | CC0 1.0 |
| `jug_01` | [jug_01](https://polyhaven.com/a/jug_01) | Kuutti Siitonen | CC0 1.0 |
| `Lantern_01` | [Lantern_01](https://polyhaven.com/a/Lantern_01) | Rajil Jose Macatangay | CC0 1.0 |
| `long_life_food_beans`, `long_life_food_milk`, `long_life_food_sardines`, `long_life_food_tomatoes` | [long_life_food](https://polyhaven.com/a/long_life_food) | Mia Pecina Zorko | CC0 1.0 |
| `machete` | [machete](https://polyhaven.com/a/machete) | Ulan Cabanilla | CC0 1.0 |
| `mantel_clock_01` | [mantel_clock_01](https://polyhaven.com/a/mantel_clock_01) | Yann Kervran, Rico Cilliers | CC0 1.0 |
| `measuring_tape_01` | [measuring_tape_01](https://polyhaven.com/a/measuring_tape_01) | Kuutti Siitonen | CC0 1.0 |
| `medical_box` | [medical_box](https://polyhaven.com/a/medical_box) | Ulan Cabanilla | CC0 1.0 |
| `medical_tape` | [medical_tape](https://polyhaven.com/a/medical_tape) | Miroslav Turura | CC0 1.0 |
| `metal_jerrycan` | [metal_jerrycan](https://polyhaven.com/a/metal_jerrycan) | Sean Buckley | CC0 1.0 |
| `metal_jug` | [metal_jug](https://polyhaven.com/a/metal_jug) | Anzor Lezhava | CC0 1.0 |
| `metal_trash_can`, `metal_trash_can_rust` | [metal_trash_can](https://polyhaven.com/a/metal_trash_can) | GurJas Studios | CC0 1.0 |
| `mousetrap` | [mousetrap](https://polyhaven.com/a/mousetrap) | GreenPixel | CC0 1.0 |
| `oil_tin` | [oil_tin](https://polyhaven.com/a/oil_tin) | Niklas | CC0 1.0 |
| `old_bed_frame` | [old_bed_frame](https://polyhaven.com/a/old_bed_frame) | Luca B | CC0 1.0 |
| `old_tyre` | [old_tyre](https://polyhaven.com/a/old_tyre) | MP | CC0 1.0 |
| `painted_wooden_bench` | [painted_wooden_bench](https://polyhaven.com/a/painted_wooden_bench) | Kirill Sannikov | CC0 1.0 |
| `painted_wooden_cabinet` | [painted_wooden_cabinet](https://polyhaven.com/a/painted_wooden_cabinet) | Kirill Sannikov | CC0 1.0 |
| `picke_dirty_01` | [picke_dirty_01](https://polyhaven.com/a/picke_dirty_01) | Dennis Halbeck | CC0 1.0 |
| `plastic_bottle_gallon` | [plastic_bottle_gallon](https://polyhaven.com/a/plastic_bottle_gallon) | Rahul Chaudhary | CC0 1.0 |
| `pliers` | [pliers](https://polyhaven.com/a/pliers) | PierreB3D | CC0 1.0 |
| `portable_generator` | [portable_generator](https://polyhaven.com/a/portable_generator) | James Ray Cock | CC0 1.0 |
| `pot_enamel_01` | [pot_enamel_01](https://polyhaven.com/a/pot_enamel_01) | Kuutti Siitonen | CC0 1.0 |
| `propane_tank` | [propane_tank](https://polyhaven.com/a/propane_tank) | Slinc | CC0 1.0 |
| `Rockingchair_01` | [Rockingchair_01](https://polyhaven.com/a/Rockingchair_01) | Jorge Camacho | CC0 1.0 |
| `rubber_boots`, `rubber_boots_clean` | [rubber_boots](https://polyhaven.com/a/rubber_boots) | L | CC0 1.0 |
| `rusted_hacksaw` | [rusted_hacksaw](https://polyhaven.com/a/rusted_hacksaw) | Dabou Master | CC0 1.0 |
| `rusted_spade_01` | [rusted_spade_01](https://polyhaven.com/a/rusted_spade_01) | Blemonade | CC0 1.0 |
| `seadogs_compass` | [seadogs_compass](https://polyhaven.com/a/seadogs_compass) | Benny Weimer | CC0 1.0 |
| `Shelf_01` | [Shelf_01](https://polyhaven.com/a/Shelf_01) | Gabriel Radić | CC0 1.0 |
| `signal_flashlight` | [signal_flashlight](https://polyhaven.com/a/signal_flashlight) | Jiří Ptáček | CC0 1.0 |
| `sledgehammer_01` | [sledgehammer_01](https://polyhaven.com/a/sledgehammer_01) | Dylan Guzman | CC0 1.0 |
| `small_lpg_tank` | [small_lpg_tank](https://polyhaven.com/a/small_lpg_tank) | Ulan Cabanilla | CC0 1.0 |
| `small_oil_can_01` | [small_oil_can_01](https://polyhaven.com/a/small_oil_can_01) | Raven van de Werken | CC0 1.0 |
| `steel_frame_shelves_01` | [steel_frame_shelves_01](https://polyhaven.com/a/steel_frame_shelves_01) | James Ray Cock | CC0 1.0 |
| `stone_fire_pit` | [stone_fire_pit](https://polyhaven.com/a/stone_fire_pit) | Sebastian Platen | CC0 1.0 |
| `street_lamp_01` | [street_lamp_01](https://polyhaven.com/a/street_lamp_01) | Josh Dean | CC0 1.0 |
| `tire_pump` | [tire_pump](https://polyhaven.com/a/tire_pump) | Garrison Gager | CC0 1.0 |
| `vintage_cabinet_01` | [vintage_cabinet_01](https://polyhaven.com/a/vintage_cabinet_01) | Rico Cilliers | CC0 1.0 |
| `vintage_day_bed` | [vintage_day_bed](https://polyhaven.com/a/vintage_day_bed) | Aron Łyczek | CC0 1.0 |
| `vintage_flashlight` | [vintage_flashlight](https://polyhaven.com/a/vintage_flashlight) | Omar M. El-Safy | CC0 1.0 |
| `vintage_lighter` | [vintage_lighter](https://polyhaven.com/a/vintage_lighter) | Slinc | CC0 1.0 |
| `vintage_oil_lamp` | [vintage_oil_lamp](https://polyhaven.com/a/vintage_oil_lamp) | Monsta3D | CC0 1.0 |
| `vintage_radio_transceiver` | [vintage_radio_transceiver](https://polyhaven.com/a/vintage_radio_transceiver) | Mateusz Sadek | CC0 1.0 |
| `vintage_suitcase`, `vintage_suitcase_02` | [vintage_suitcase](https://polyhaven.com/a/vintage_suitcase) | Maximilian Schuster | CC0 1.0 |
| `vintage_wooden_drawer_01` | [vintage_wooden_drawer_01](https://polyhaven.com/a/vintage_wooden_drawer_01) | James Ray Cock | CC0 1.0 |
| `wall_clock` | [wall_clock](https://polyhaven.com/a/wall_clock) | PierreB3D | CC0 1.0 |
| `wicker_basket_01` | [wicker_basket_01](https://polyhaven.com/a/wicker_basket_01) | Kuutti Siitonen | CC0 1.0 |
| `wicker_basket_02` | [wicker_basket_02](https://polyhaven.com/a/wicker_basket_02) | Kuutti Siitonen | CC0 1.0 |
| `wine_bottle_alsace`, `wine_bottle_bordeaux`, `wine_bottle_burgundy`, `wine_bottle_champagne` | [wine_bottles_01](https://polyhaven.com/a/wine_bottles_01) | Rico Cilliers, Jurita Burger | CC0 1.0 |
| `wooden_axe` | [wooden_axe](https://polyhaven.com/a/wooden_axe) | Ulan Cabanilla | CC0 1.0 |
| `wooden_axe_02` | [wooden_axe_02](https://polyhaven.com/a/wooden_axe_02) | Ulan Cabanilla | CC0 1.0 |
| `wooden_axe_03` | [wooden_axe_03](https://polyhaven.com/a/wooden_axe_03) | Ulan Cabanilla | CC0 1.0 |
| `wooden_bookshelf_worn` | [wooden_bookshelf_worn](https://polyhaven.com/a/wooden_bookshelf_worn) | Ulan Cabanilla | CC0 1.0 |
| `wooden_bowl_01` | [wooden_bowl_01](https://polyhaven.com/a/wooden_bowl_01) | Oliver Harries | CC0 1.0 |
| `wooden_bowl_02` | [wooden_bowl_02](https://polyhaven.com/a/wooden_bowl_02) | Kuutti Siitonen | CC0 1.0 |
| `wooden_bucket_01` | [wooden_bucket_01](https://polyhaven.com/a/wooden_bucket_01) | James Ray Cock | CC0 1.0 |
| `wooden_bucket_02` | [wooden_bucket_02](https://polyhaven.com/a/wooden_bucket_02) | James Ray Cock | CC0 1.0 |
| `wooden_candlestick` | [wooden_candlestick](https://polyhaven.com/a/wooden_candlestick) | Josh Dean | CC0 1.0 |
| `wooden_crate_01` | [wooden_crate_01](https://polyhaven.com/a/wooden_crate_01) | James Ray Cock | CC0 1.0 |
| `wooden_crate_02` | [wooden_crate_02](https://polyhaven.com/a/wooden_crate_02) | James Ray Cock, Jurita Burger | CC0 1.0 |
| `wooden_cutting_board` | [wooden_cutting_board](https://polyhaven.com/a/wooden_cutting_board) | Kuutti Siitonen | CC0 1.0 |
| `wooden_display_shelves_01` | [wooden_display_shelves_01](https://polyhaven.com/a/wooden_display_shelves_01) | James Ray Cock | CC0 1.0 |
| `wooden_hammer_01` | [wooden_hammer_01](https://polyhaven.com/a/wooden_hammer_01) | James Ray Cock | CC0 1.0 |
| `wooden_ladder` | [wooden_ladder](https://polyhaven.com/a/wooden_ladder) | Miroslav Turura | CC0 1.0 |
| `wooden_lantern_01` | [wooden_lantern_01](https://polyhaven.com/a/wooden_lantern_01) | James Ray Cock | CC0 1.0 |
| `wooden_military_crate` | [wooden_military_crate](https://polyhaven.com/a/wooden_military_crate) | Prabhjinder Singh | CC0 1.0 |
| `wooden_picnic_table` | [wooden_picnic_table](https://polyhaven.com/a/wooden_picnic_table) | Ulan Cabanilla | CC0 1.0 |
| `wooden_pier_section_01`, `wooden_pier_section_02`, `wooden_pier_section_03`, `wooden_pier_section_04`, `wooden_pier_section_05` | [modular_wooden_pier](https://polyhaven.com/a/modular_wooden_pier) | Rico Cilliers | CC0 1.0 |
| `wooden_spoon` | [wooden_spoon](https://polyhaven.com/a/wooden_spoon) | Ronnie Barter | CC0 1.0 |
| `wooden_stool_01` | [wooden_stool_01](https://polyhaven.com/a/wooden_stool_01) | Kuutti Siitonen | CC0 1.0 |
| `wooden_stool_02` | [wooden_stool_02](https://polyhaven.com/a/wooden_stool_02) | Kuutti Siitonen | CC0 1.0 |
| `WoodenChair_01` | [WoodenChair_01](https://polyhaven.com/a/WoodenChair_01) | Jake Mobley | CC0 1.0 |
| `WoodenTable_01` | [WoodenTable_01](https://polyhaven.com/a/WoodenTable_01) | Ethan Place | CC0 1.0 |
| `WoodenTable_02` | [WoodenTable_02](https://polyhaven.com/a/WoodenTable_02) | Fran Calvente | CC0 1.0 |
| `WoodenTable_03` | [WoodenTable_03](https://polyhaven.com/a/WoodenTable_03) | Gabriel Radić | CC0 1.0 |
| `worn_metal_rack` | [worn_metal_rack](https://polyhaven.com/a/worn_metal_rack) | Luca B | CC0 1.0 |

### Tiling textures (`public/assets/textures/`) from Poly Haven

| Texture | Source scan(s) | Author(s) | Licence |
|---|---|---|---|
| `terrain/forest_floor` | [forrest_ground_03](https://polyhaven.com/a/forrest_ground_03) | Rob Tuytel | CC0 1.0 |
| `terrain/dead_leaves` | [forest_leaves_02](https://polyhaven.com/a/forest_leaves_02) | Rob Tuytel | CC0 1.0 |
| `terrain/moss` | [sparse_grass](https://polyhaven.com/a/sparse_grass) | Amal Kumar | CC0 1.0 |
| `terrain/grass` | [forrest_ground_01](https://polyhaven.com/a/forrest_ground_01) | Rob Tuytel | CC0 1.0 |
| `terrain/dirt` | [dirt](https://polyhaven.com/a/dirt) | Charlotte Baglioni | CC0 1.0 |
| `terrain/mud` | [brown_mud_02](https://polyhaven.com/a/brown_mud_02) | Rob Tuytel | CC0 1.0 |
| `terrain/mud_ruts` | [muddy_tracks](https://polyhaven.com/a/muddy_tracks) | Amal Kumar | CC0 1.0 |
| `terrain/gravel_road` | [rocky_trail](https://polyhaven.com/a/rocky_trail) | Amal Kumar | CC0 1.0 |
| `terrain/granite` | [rock_08](https://polyhaven.com/a/rock_08) | Rob Tuytel | CC0 1.0 |
| `terrain/lichen_rock` | [lichen_rock](https://polyhaven.com/a/lichen_rock) | Rico Cilliers | CC0 1.0 |
| `terrain/pebbles` | [ganges_river_pebbles](https://polyhaven.com/a/ganges_river_pebbles) | Amal Kumar | CC0 1.0 |
| `terrain/gravel_road_ruts` | [rocky_trail](https://polyhaven.com/a/rocky_trail), [dirt](https://polyhaven.com/a/dirt), [forrest_ground_01](https://polyhaven.com/a/forrest_ground_01) | Amal Kumar, Charlotte Baglioni, Rob Tuytel | CC0 1.0 |
| `building/log_wall` | [wood_trunk_wall](https://polyhaven.com/a/wood_trunk_wall) | Amal Kumar | CC0 1.0 |
| `building/rough_planks` | [weathered_planks](https://polyhaven.com/a/weathered_planks) | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `building/floor_boards` | [wood_floor_worn](https://polyhaven.com/a/wood_floor_worn) | Dimitrios Savva | CC0 1.0 |
| `building/corrugated_rust` | [rusty_corrugated_iron](https://polyhaven.com/a/rusty_corrugated_iron) | Charlotte Baglioni | CC0 1.0 |
| `building/fieldstone` | [stone_wall](https://polyhaven.com/a/stone_wall) | Dario Barresi, Charlotte Baglioni | CC0 1.0 |
| `building/painted_siding` | [distressed_painted_planks](https://polyhaven.com/a/distressed_painted_planks) | Rob Tuytel | CC0 1.0 |
| `building/concrete` | [concrete_floor_02](https://polyhaven.com/a/concrete_floor_02) | Rob Tuytel | CC0 1.0 |
| `building/cedar_shakes` | [weathered_planks](https://polyhaven.com/a/weathered_planks) | Dario Barresi, Dimitrios Savva | CC0 1.0 |
| `building/window_grime` | [dirty_concrete](https://polyhaven.com/a/dirty_concrete) | Rob Tuytel | CC0 1.0 |

### Vehicles from Sketchfab (CC BY 4.0, attribution required)

Converted, re-meshed, re-textured, split into parts (wheels, steering wheel, glass) and rescaled; the Jeep's insignia and the modeller's stencilled signature painted out. Changes were made.

| File | Source | Author | Licence |
|---|---|---|---|
| `jeep.glb` | [willys-jeep-d6e73ec5537e49269ec92b8ab78230c2](https://sketchfab.com/3d-models/willys-jeep-d6e73ec5537e49269ec92b8ab78230c2) | snjvsngh_negi | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `npc_pickup.glb` | [1962-willys-jeep-pick-up-43394652043a4387be183ef75d7af5a1](https://sketchfab.com/3d-models/1962-willys-jeep-pick-up-43394652043a4387be183ef75d7af5a1) | LxNazarov | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |
| `trailer.glb` | [trailer-5a53a60a27144183ab825f559ed73a80](https://sketchfab.com/3d-models/trailer-5a53a60a27144183ab825f559ed73a80) | svartfilin | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |

Required attribution (reproduce it wherever the game's credits are shown):

* `jeep.glb`: This work is based on "Willys Jeep" (https://sketchfab.com/3d-models/willys-jeep-d6e73ec5537e49269ec92b8ab78230c2) by snjvsngh_negi (https://sketchfab.com/snjvsngh_negi) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Modified for BUSHED (converted to pixel art, re-meshed, split into parts, markings painted out).
* `npc_pickup.glb`: This work is based on "1962 Willys Jeep Pick-Up" (https://sketchfab.com/3d-models/1962-willys-jeep-pick-up-43394652043a4387be183ef75d7af5a1) by LxNazarov (https://sketchfab.com/LxNazarov) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Modified for BUSHED (converted to pixel art, re-meshed, split into parts).
* `trailer.glb`: This work is based on "Trailer" (https://sketchfab.com/3d-models/trailer-5a53a60a27144183ab825f559ed73a80) by svartfilin (https://sketchfab.com/svartfilin) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Modified for BUSHED (converted to pixel art, re-meshed, split into parts).
