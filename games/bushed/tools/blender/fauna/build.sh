#!/bin/bash
# Rebuild every real animal: downloads (python -m lowpix sketchfab fetch <uid> -o $DL/<uid>), Blender passes,
# then copy the .glb (+ its .json stats) into public/assets/models/creatures/<kind>/.
#   tools/blender/fauna/build.sh [downloads dir] [work dir]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
GAME=$(cd "$HERE/../../.." && pwd)
DL=${1:-/tmp/fauna_dl}; WORK=${2:-/tmp/fauna_out}
mkdir -p "$DL" "$WORK"
for uid in f798cc7ee1214ddcb3417329636c4433 b6172618aa304473a4cf7b9246c0a218 33ce37106a24493ba4a6a6e2a9433bb6 \
           414a3970c7674bc0bedbab32350f56b6 b492079385ff407ab68aa7f72c88f828 e7213589744d436b9d96e2dbb31198a5; do
  [ -f "$DL/$uid/sketchfab_$uid/scene.gltf" ] || (cd "$GAME/../.." && python -m lowpix sketchfab fetch "$uid" -o "$DL/$uid")
done
blender -b --python "$HERE/cervids.py" -- "$DL" "$WORK"
blender -b --python "$HERE/dog.py" -- "$DL" "$WORK"
blender -b --python "$HERE/small.py" -- "$DL" "$WORK"
for k in dog deer moose squirrel hare; do
  mkdir -p "$GAME/public/assets/models/creatures/$k"
  cp "$WORK/$k/"*.glb "$WORK/$k/"*.json "$GAME/public/assets/models/creatures/$k/"
done
