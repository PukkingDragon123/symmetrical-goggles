#!/bin/bash
# Rebuild the low-poly cryptids: fetch the sources, run the Blender passes (each writes its .glb straight into
# public/assets/models/creatures/cryptids/ and its textures + stats into _build/), then optionally shoot the contact
# sheets on a running dev server.
#   tools/blender/lowpoly/build.sh [downloads dir] [dev-server port for the sheets]
# Sketchfab downloads go through the API (https://api.sketchfab.com/v3/models/<uid>/download). Here the network proxy
# authenticates them; elsewhere add your token: SKETCHFAB_AUTH="Authorization: Token <token>".
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
GAME=$(cd "$HERE/../../.." && pwd)
REPO=$(cd "$GAME/../.." && pwd)
DL=${1:-/tmp/lowpoly_dl}
mkdir -p "$DL"

sketchfab() {  # uid, destination .glb
  [ -f "$2" ] && return
  mkdir -p "$(dirname "$2")"
  url=$(curl -sf ${SKETCHFAB_AUTH:+-H "$SKETCHFAB_AUTH"} "https://api.sketchfab.com/v3/models/$1/download" | python3 -c 'import sys, json; print(json.load(sys.stdin)["glb"]["url"])')
  curl -sf -o "$2" "$url"
}
sketchfab aff6767399cf4daca1a82b43ccaa1252 "$DL/aff67673/scene.glb"   # lynx (Paleo Modelist, CC-BY): the splinter cat
sketchfab df9dfe0920d54faf99f94e88b33d7a8d "$DL/bauru/bauru.glb"      # Animated Baurusuchus (Anees Animates, CC-BY): the hodag
[ -f "$DL/bull_head/bull_head_2k.gltf" ] || (cd "$REPO" && python3 -c "from lowpix.convert import polyhaven_fetch; polyhaven_fetch('bull_head', '$DL/bull_head', res='2k')")

for who in splintercat hodag; do
  t0=$(date +%s)
  blender -b --python "$HERE/$who.py" -- "$DL" 2>&1 | grep -E "LOWPOLY|DONE|EXPORTED|Error|Traceback" || true
  echo "$who: $(( $(date +%s) - t0 )) s"
done

if [ -n "$2" ]; then
  mkdir -p "$HERE/_build/sheets"
  for who in splintercat hodag; do
    (cd "$GAME" && node "$HERE/sheet.cjs" "$who" "$2" "$HERE/_build/sheets" | tail -1 && python3 "$HERE/sheet.py" "$who" "$HERE/_build/sheets")
  done
fi
