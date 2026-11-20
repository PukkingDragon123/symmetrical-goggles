#!/bin/bash
# Rebuild every BUSHED bird and the insect atlas from the Sketchfab sources (all CC BY 4.0; credits in CREDITS.md).
#   bash build_all.sh <work dir>        downloads into <work dir>/dl (needs `python -m lowpix auth set sketchfab` or the
#                                       session proxy), writes public/assets/models/creatures/birds/ and models/bugs/
# Steps: songbird.py (the small-bird rig) -> paint_birds.py (coats) -> songbird.py again (the chickadee coat
# embedded); raven.py; scan_bird.py woodpecker | grouse; loon.py; bug_views.py per insect -> bugs_atlas.py.
set -e
W=${1:?work dir}
HERE=$(cd "$(dirname "$0")" && pwd)
GAME=$(cd "$HERE/../../.." && pwd)
REPO=$(cd "$GAME/../.." && pwd)
A=$GAME/public/assets/models/creatures/birds
B=$GAME/public/assets/models/bugs
mkdir -p "$W/dl" "$W/paint" "$W/coats" "$W/bugs" "$A" "$B"
fetch() { [ -d "$W/dl/$1" ] || (cd "$REPO" && python -m lowpix sketchfab fetch "$2" -o "$W/dl/$1"); ls "$W"/dl/$1/sketchfab_*/scene.gltf | head -1; }
ROBIN=$(fetch robin ec1c6e2250824c3987cde64ea29ccd52)        # "Robin_ Bird", Assets_Animated
CROW=$(fetch crow 0609852ae9084d8a8643517e4eae68e1)          # "Animated Crow", emptypen2477
WOODP=$(fetch hairywp c2347b204cfe45f8bc46886f006de9cd)      # "Hairy Woodpecker", oneillbeck
GROUSE=$(fetch grouse e0f2d244cdd74403a9a1796eb9951981)      # "Ruffed Grouse", Carnegie Museum of Natural History
LOON=$(fetch loon c9663fb0a6ed4cc7aa60045459d4fa54)          # "Common Loon", OSU.Multimedia
LOONF=$(fetch loonfly 55f2f4b8d84e48a482167368cf6f83ca)      # "Common Loon - in Flight", OSU.Multimedia (built, unused)
BL="blender -b --python"
# the small-bird rig, its coats, then the rig again with the chickadee coat inside
$BL "$HERE/songbird.py" -- "$ROBIN" "$W/songbird_plain.glb" "$W/paint/songbird" 4000
python3 "$HERE/paint_birds.py" "$W/paint/songbird" "$W/coats"
$BL "$HERE/songbird.py" -- "$ROBIN" "$A/songbird.glb" "$W/paint/songbird" 4000 "$W/coats/chickadee.png"
for c in chickadee jay woodpecker grouse; do python3 -c "from PIL import Image; Image.open('$W/coats/$c.png').save('$A/coat_$c.webp', quality=90, method=6)"; done
$BL "$HERE/raven.py" -- "$CROW" "$A/raven.glb"
$BL "$HERE/scan_bird.py" -- woodpecker "$WOODP" "$A/woodpecker.glb"
$BL "$HERE/scan_bird.py" -- grouse "$GROUSE" "$A/grouse.glb"
$BL "$HERE/loon.py" -- "$LOON" "$LOONF" "$W"
cp "$W/loon.glb" "$A/loon.glb"
rm -rf "$A/_tex"
# insects: top views of the real models, then the atlas
v() { $BL "$HERE/bug_views.py" -- "$(fetch "$1" "$2")" "$W/bugs/$1_top.png" 256 "$3" 0 "$4"; }
v monarch ed0a10f2aa4b41bb9b7a1bcb82cb369b top          # "Monarch Butterfly", dudecon
v swallowtail 4119ac2975e84a659f164b37025c558e front    # "Tiger Swallowtail", VirginiaTechUnivLibraries
v moth 67fb9bcd3bc94bd89089430e0590a3d4 front           # "Peppered Moth - Biston Betularia", wattinstitution
v darner d509ecdc7f114380819d1a682c82292f top Legs,Body,Eyes1,Wing   # "Blue Darner Dragonfly", EDIIIC
v bee aaf957992c1142bb8e3ad52c457ab014 top              # "Honey Bee", marlborobenz
v ant 6ea6dfb45845443b9f99b2fe4456f9a3 top              # "Ant", ergin3d.com
v carabus 138f12e0c10549bba03ec372e0e945dd top          # "Carabus auronitens", disc3d
python3 "$HERE/bugs_atlas.py" "$W/bugs" "$B/bugs_atlas.png"
echo "done: $A $B"
