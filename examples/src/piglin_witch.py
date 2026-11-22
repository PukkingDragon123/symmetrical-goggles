"""Builds examples/piglin_witch.json: the Piglin Witch (Winterworks, Hexes & Havoc).

    python examples/src/piglin_witch.py examples/piglin_witch.json

An old, fat Piglin crone and a happy drunk: a hunched back, a huge belly sagging over a rope belt hung with gold
coins, short stubby legs in striped stockings, cloven hooves, a big red drinker's snout with a hairy wart, droopy
heavy-lidded eyes over baggy lower lids, saggy jowls, a grey hair bun skewered with a bone, a ragged plum shawl with
a gold brooch, gold bangles, a gold hoop earring and a gold-capped tusk, a pewter hip flask in her left fist.
Her left half (+X) is zombified: green rotting flesh down the left of her face, a torn jowl, the bare jaw bone and
teeth, a bitten-off ear tip, bare ribs through the torn dress, a rotten forearm with the bone showing.
On her back a HUGE, very old, patched rucksack towers over her head: a flap lid with a buckle, a red bedroll, a clay
pot and two potion bottles on the right, a femur and a little skull on the left, a witch's broom strapped across the
back, and a soul lantern hanging off a hook. Her eyes, the lantern and the gem in her brooch burn with soul fire
(glow: the eye and flame parts plus every soul-coloured texel).

Units are Minecraft pixels (16 per block), density 1, every box a whole number of pixels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Tatters, hair, ribs, teeth, coins and the chain are alpha-cut
cards. Faces +Z, ground at y = 0, "left" is +X.

Contract (mods/winterworks/docs/HEXES_UPDATE.md section 6): bones body (root, the hips), belly, head, snout, jaw,
ear_l, ear_r, arm_l, arm_r, hand_r (an empty locator at the right palm where Java draws held items: its -Y points
out of the fist like a vanilla arm), leg_l, leg_r, backpack, backpack_lid. Parts zombie_* are the rotten half.
Extra joints: chest (the hunched upper body), forearm_l/r, fist_l/r, flask (in the left fist), shin_l/r, hoof_l/r,
lid_l/r (droopy eyelids), cheek_r and zombie_cheek (jowls), earring_r, pot, lantern, skull.
Clips: idle, walk (drunken stumbling), drink (1.6 s), hiccup (0.6 s), rummage (2.0 s), refuse (1.2 s),
cackle (1.5 s), throw (0.8 s), trade (loop). Every clip starts and ends in the rest pose (they add on top of idle).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import (FLAME_SMALL, M, MR, ROOT, SOUL_KEY, Rig, add, both, chain, cycle, dump, ground_lock,  # noqa: E402
                     keys, osc, r, rest_on_ground, ring, sc, shake, side, spikes, tatters, timeline, wave)

R = Rig(density=1, bone_style="dress")
part, bone, card, wpos = R.part, R.bone, R.card, R.wpos

# ======================================================================= hips, skirt, legs
part("body", None, [13, 5, 10], "dress", at=(0, 9, 0), centre=(0, 9.5, 0.5))
part("skirt", "body", [15, 4, 12], "skirt", centre=(0, 6.0, 0.5))
card("hem_f", "skirt", tatters(15, 3, 3, min_len=0.3), "tatter_dress", rel=(0, -2.0, 6.05),
     offset=(0, -1.4, 0), rot=(-8, 0, 0))
card("hem_b", "skirt", tatters(15, 3, 4, min_len=0.3), "tatter_dress", rel=(0, -2.0, -5.05), offset=(0, -1.4, 0),
     rot=(8, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    card(f"hem_{n}", "skirt", tatters(12, 3, 5 + s, min_len=0.3), "tatter_dress", rel=(s * 7.55, -2.0, 0.5),
         offset=(0, -1.4, 0), plane="yz", rot=(0, 0, s * 8))
# the rope belt under the belly, hung with gold coins and a pouch
part("belt", "body", [14, 2, 11], "rope", centre=(0, 7.5, 0.5))
part("pouch", "belt", [3, 4, 2], "leather", centre=(-5.2, 5.6, 6.3), rot=(-6, 0, 6))
part("pouch_flap", "pouch", [3, 1, 3], "leather_dark", rel=(0, 1.8, 0.2))
COIN = [".gg.", "gGGg", "gGhg", ".gg."]
for k, (x, y, rz) in enumerate([(-2.2, 5.6, 8), (0.4, 5.0, -6), (2.8, 5.6, 12), (4.9, 5.9, -10)]):
    card(f"coin{k}", "belt", COIN if k % 2 == 0 else ["gg..", "gGg.", "gGg.", "gg.."], "coin",
         at=(x, 6.6, 6.1), offset=(0, y - 6.6 - 1.4, 0), rot=(-10, 0, rz))

for s in (1, -1):
    n = "l" if s > 0 else "r"
    leg = part(f"leg_{n}", "body", [5, 5, 5], "stocking_" + n, at=M((3.3, 8, 0.5), s), offset=(0, -2.5, 0),
               rot=(0, 0, s * 2))
    part(f"shin_{n}", leg["id"], [4, 4, 4], "stocking_" + n, at=M((3.4, 4.0, 0.5), s), offset=(0, -1.5, 0.2),
         wrot=(0, 0, 0))
    part(f"hoof_{n}", f"shin_{n}", [5, 2, 6], "hoof", at=M((3.4, 1.5, 0.7), s), offset=(0, -0.5, 0.6),
         wrot=(0, s * -8, 0))
# the left shin's stocking is torn: a lump of rotten flesh and the bare shin bone
part("zombie_shin", "shin_l", [1, 3, 2], "bone", rel=(2.05, -1.5, 0.6))
part("zombie_knee", "leg_l", [3, 2, 1], "rot", rel=(0.5, -3.6, 2.6))

# ======================================================================= the belly: huge, sagging over the belt
part("belly", "body", [10, 9, 7], "belly", at=(0, 14, 2), centre=(0, 11, 6))
part("belly_mid", "belly", [12, 5, 6], "belly", centre=(0, 11.2, 5.4))
part("belly_sag", "belly", [10, 3, 5], "belly", centre=(0, 7.5, 6.9))
part("belly_top", "belly", [10, 2, 5], "belly", centre=(0, 15.5, 5.6))
part("belly_patch", "belly", [5, 4, 1], "patch_canvas", centre=(-2.8, 12.4, 9.6), rot=(0, 0, -8))
# a torn hole in the dress, the left of the belly: rotting flesh and ribs (the zombified half)
part("zombie_belly", "belly", [3, 4, 4], "rot", centre=(5.4, 11.0, 6.4))

# ======================================================================= the hunched upper body
part("chest", "body", [12, 9, 9], "torso", at=(0, 12.5, -0.5), offset=(0, 4.5, -0.5), rot=(16, 0, 0))
# bare ribs through the torn left flank (lowpix face "right" is +X)
RIB = ["bb.....", ".bbb...", "...bbb.", ".....bb"]
for k in range(4):
    card(f"zombie_rib{k}", "chest", RIB, "rib", rel=(6.08, 6.6 - k * 1.6, 1.0), offset=(0, -1.5, 0), plane="yz",
         rot=(0, 0, 4))
part("shawl", "chest", [15, 4, 11], "shawl", rel=(0, 8.0, 0), rot=(-4, 0, 0))
card("shawl_fringe_b", "shawl", tatters(15, 5, 21, min_len=0.5), "tatter_shawl", rel=(0, -2.1, -5.55),
     offset=(0, -2.5, 0), rot=(10, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    # the two front lappets hanging down over the bosom, ragged at the ends
    lap = part(f"shawl_lap_{n}", "shawl", [5, 6, 1], "shawl", rel=(s * 3.6, -3.6, 5.2), rot=(10, 0, s * -10))
    card(f"shawl_lap_{n}_fringe", lap["id"], tatters(5, 4, 30 + s, min_len=0.5), "tatter_shawl", rel=(0, -3, 0),
         offset=(0, -2, 0))
    card(f"shawl_fringe_{n}", "shawl", tatters(10, 4, 40 + s, min_len=0.4), "tatter_shawl",
         rel=(s * 7.55, -2.1, 0), offset=(0, -2, 0), plane="yz", rot=(0, 0, s * 12))
part("brooch", "shawl", [3, 3, 1], "gold_gem", rel=(0, -1.2, 5.9), rot=(0, 0, 45))
# the rucksack straps over the shoulders
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"strap_{n}", "chest", [2, 1, 11], "leather_dark", rel=(s * 3.8, 10.4, 0))
    part(f"strap_{n}_front", "chest", [2, 6, 1], "leather_dark", rel=(s * 3.8, 7.0, 5.0), rot=(6, 0, s * 4))
part("strap_buckle_r", "strap_r_front", [2, 2, 1], "gold", rel=(0, -1.2, 0.4))

# ======================================================================= head
part("head", "chest", [10, 9, 8], "head", rel=(0, 9.8, 2.2), offset=(0, 4.0, 2.5), wrot=(4, 0, 0))
# the big red drinker's snout, a hairy wart on top, two nostrils
part("snout", "head", [5, 4, 2], "snout", rel=(0, 2.0, 6.0), offset=(0, 0, 1.0), rot=(-4, 0, 0))
part("wart", "snout", [1, 1, 1], "wart", rel=(-1.4, 2.2, 1.2))
card("wart_hair", "wart", ["h.h", ".h.", ".h."], "hair_card", rel=(0, 0.5, 0), offset=(0, 1.5, 0), rot=(0, 30, 0))
# droopy eyes: soul-fire glow under heavy lids, baggy lower lids, bushy grey brows sagging at the ends
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"eye_{n}", "head", [2, 2, 1], "eye", rel=(s * 3.0, 5.0, 6.3))
    part(f"lid_{n}", "head", [3, 1, 1], "lid_" + n, rel=(s * 3.0, 6.5, 6.6), offset=(0, -0.5, 0.2),
         rot=(0, 0, s * -8))
    part(f"bag_{n}", "head", [3, 1, 1], "bag_" + n, rel=(s * 3.0, 3.5, 6.75))
    part(f"brow_{n}", "head", [4, 1, 1], "brow", rel=(s * 3.2, 7.2, 6.7), rot=(0, 0, s * -14))
part("zombie_socket", "head", [3, 3, 1], "socket", rel=(3.0, 5.0, 6.15))
# saggy jowls (the left one rotten and torn open over the teeth)
part("cheek_r", "head", [2, 4, 4], "cheek", at=wpos("head", (-4.8, 2.6, 4.2)), offset=(-0.6, -1.8, 0),
     rot=(4, 0, -12))
part("zombie_cheek", "head", [2, 4, 4], "zombie_cheek", at=wpos("head", (4.8, 2.6, 4.2)), offset=(0.6, -1.8, 0),
     rot=(4, 0, 12))
# the jaw: an underbite with two tusks (the right one capped in gold); the left half bare bone and teeth
part("jaw", "head", [7, 2, 5], "jaw", rel=(0, 0.2, 3.4), offset=(0, -1, 2.4), rot=(4, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"tusk_{n}", "jaw", [1, 3, 1], "tusk", rel=(s * 2.6, 0.2, 4.6), offset=(0, 1.0, 0), rot=(-8, 0, s * 10))
part("tusk_cap", "tusk_r", [1, 1, 1], "gold", rel=(0, 2.1, 0))
part("zombie_jaw", "jaw", [2, 2, 5], "bone", rel=(3.6, -1.2, 2.4))
card("zombie_teeth", "zombie_jaw", ["t.tt.", "tt.tt"], "teeth", rel=(-0.2, 1.5, 0.2), plane="yz")
card("chin_hairs", "jaw", ["h..h.", "h..hh", ".h..h"], "hair_card", rel=(-1.0, -2.05, 3.0), offset=(0, -1.5, 0),
     rot=(-10, 0, 0))
# ears: big, old and droopy; the right one has a gold hoop, the left one's tip is bitten off
part("ear_r", "head", [1, 7, 5], "ear", rel=(-4.9, 7.4, 2.6), offset=(0, -3.5, 0), rot=(-10, 0, -48))
bone("earring_r", "ear_r", rel=(0, -6.6, 1.0))
card("earring_hoop", "earring_r", [".gg.", "g..g", "g..g", "h..g", ".gg."], "gold_card", rel=(0, 0, 0),
     offset=(0, -2.5, 0), plane="yz")
part("ear_l", "head", [1, 5, 5], "ear_rot", rel=(4.9, 7.4, 2.6), offset=(0, -2.5, 0), rot=(-10, 0, 48))
card("zombie_ear", "ear_l", ["b.bb.", "bbbbb", ".bb.b"], "ear_tear", rel=(0, -5.0, 0), offset=(0, -1.5, 0),
     plane="yz")
# a grey hair bun skewered with a bone, wisps escaping everywhere
part("bun", "head", [4, 3, 4], "hair", rel=(0.5, 9.0, 0.4), rot=(-18, 0, 8))
part("bun_top", "bun", [3, 1, 3], "hair", rel=(0, 2.0, 0))
part("bun_pin", "bun", [8, 1, 1], "bone", rel=(0, 0.8, 0), rot=(0, 30, -16))
card("hair_wisps", "head", spikes(10, 3, 51), "hair_card", rel=(0, 8.6, -1.6), offset=(0, 1.5, 0), rot=(-30, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    card(f"hair_side_{n}", "head", tatters(6, 4, 55 + s, min_len=0.5, tip="h", mid="h", body="H"), "hair_card",
         rel=(s * 5.08, 7.8, 0.6), offset=(0, -2, 0), plane="yz", rot=(0, 0, s * 16))

# ======================================================================= arms
for s in (1, -1):
    n = "l" if s > 0 else "r"
    arm = part(f"arm_{n}", "chest", [5, 6, 5], "sleeve", rel=(s * 7.2, 7.4, 0.6), offset=(s * 0.3, -2.5, 0),
               wrot=MR((-6, 0, 12), s))
    card(f"sleeve_{n}_fringe", arm["id"], tatters(5, 3, 60 + s, min_len=0.5), "tatter_dress", rel=(0, -5.55, 2.55),
         offset=(0, -1.5, 0), rot=(-10, 0, 0))
    fa = part(f"forearm_{n}", arm["id"], [4, 6, 4], "arm_" + n, rel=(s * 0.3, -5.2, 0), offset=(0, -2.8, 0.2),
              wrot=MR((-38, 0, 6), s))
    part(f"bangle_{n}", fa["id"], [5, 1, 5], "gold", rel=(0, -4.6, 0.2))
    part(f"fist_{n}", fa["id"], [4, 4, 4], "fist_" + n, rel=(0, -5.8, 0.2), offset=(0, -1.8, 0.2),
         wrot=MR((-20, 0, 0), s))
part("bangle_r2", "forearm_r", [5, 1, 5], "gold", rel=(0, -3.2, 0.2), rot=(0, 20, 8))
bone("hand_r", "fist_r", rel=(0, -2.6, 0.4))
# the rotten left forearm: the ulna showing through torn green flesh
part("zombie_arm", "forearm_l", [1, 5, 2], "bone", rel=(2.1, -2.8, 0.2))
part("zombie_flesh", "arm_l", [2, 3, 3], "rot", rel=(2.6, -2.0, 0.4), rot=(0, 0, 8))
# the pewter hip flask in the left fist, neck up
part("flask", "fist_l", [3, 5, 2], "flask", rel=(0, -1.6, 2.6), wrot=(0, 0, 0))
part("flask_neck", "flask", [1, 1, 1], "pewter", rel=(0, 3.0, 0))
part("flask_cap", "flask", [2, 1, 2], "gold", rel=(0, 4.0, 0))

# ======================================================================= the HUGE patched rucksack
part("backpack", "chest", [16, 20, 11], "pack", rel=(0, 7.6, -4.9), offset=(0, 3.0, -5.9), rot=(-7, 0, 0))
part("pack_pocket", "backpack", [11, 8, 3], "pack_pocket", rel=(0, -1.5, -12.6))
part("pack_pocket_flap", "pack_pocket", [11, 2, 4], "leather", rel=(0, 4.1, 0.2), rot=(-8, 0, 0))
part("pack_buckle", "pack_pocket_flap", [2, 2, 1], "gold", rel=(0, -1.2, -2.2))
part("bedroll", "backpack", [18, 5, 5], "bedroll", rel=(0, -8.4, -5.4))
for k, x in enumerate((-4.5, 4.5)):
    part(f"bedroll_tie{k}", "bedroll", [1, 6, 6], "leather_dark", rel=(x, 0, 0))
# the flap lid (hinged at the top edge nearest her back; +X rotation flips it open over her head)
part("backpack_lid", "backpack", [17, 2, 12], "lid", rel=(0, 13.0, -0.2), offset=(0, 1, -6.0))
part("lid_flap", "backpack_lid", [14, 7, 1], "lid", rel=(0, -0.4, -12.2), offset=(0, -2.5, 0), rot=(6, 0, 0))
part("lid_buckle", "lid_flap", [3, 2, 1], "gold", rel=(0, -5.0, -0.4))
part("lid_strap", "lid_flap", [2, 5, 1], "leather_dark", rel=(0, -2.5, -0.3))
# the right side: a clay pot on a rope, two potion bottles in a side pocket
part("pack_side_pocket", "backpack", [3, 7, 7], "pack_pocket", rel=(-9.0, -3.0, -5.6))
part("bottle0", "pack_side_pocket", [2, 5, 2], "bottle_g", rel=(-0.2, 3.8, 1.6), offset=(0, 0, 0), rot=(0, 0, 10))
part("bottle0_cork", "bottle0", [1, 1, 1], "cork", rel=(0, 3.0, 0))
part("bottle1", "pack_side_pocket", [2, 6, 2], "bottle_m", rel=(0.2, 4.0, -1.6), rot=(10, 0, -6))
part("bottle1_cork", "bottle1", [1, 1, 1], "cork", rel=(0, 3.5, 0))
bone("pot", "backpack", rel=(-8.2, 10.0, -6.0))
card("pot_rope", "pot", ["r", "r", "r"], "rope_card", rel=(-1.0, 0, 0), offset=(0, -1.5, 0), plane="yz")
part("pot_body", "pot", [5, 5, 5], "clay", rel=(-2.6, -5.5, 0))
part("pot_bulge", "pot_body", [6, 3, 6], "clay", rel=(0, -0.4, 0))
part("pot_neck", "pot_body", [3, 1, 3], "clay_dark", rel=(0, 3.0, 0))
part("pot_rim", "pot_neck", [4, 1, 4], "clay", rel=(0, 1.0, 0))
# the left side: a big femur strapped on, a little skull dangling from the top corner
part("femur", "backpack", [2, 11, 2], "bone", rel=(8.9, 1.0, -3.6), rot=(0, 0, -8))
for k, y in enumerate((5.6, -5.6)):
    part(f"femur_knob{k}", "femur", [3, 2, 3], "bone", rel=(0, y, 0))
part("femur_strap", "backpack", [1, 2, 4], "leather_dark", rel=(8.6, 2.0, -3.6))
bone("skull", "backpack", rel=(8.4, 12.0, -9.0))
card("skull_cord", "skull", ["r", "r"], "rope_card", rel=(0, 0, 0), offset=(0, -1, 0), plane="yz")
part("skull_head", "skull", [4, 3, 4], "skull", rel=(0.8, -3.5, 0), rot=(0, 20, 0))
part("skull_jaw", "skull_head", [3, 1, 2], "bone", rel=(0, -2.0, 0.9))
# a witch's broom strapped diagonally across the back, bristles out at the lower left
part("broom", "backpack", [1, 28, 1], "wood", rel=(0, 3.0, -11.9), rot=(0, 0, 52))
part("broom_head", "broom", [3, 5, 3], "straw", rel=(0, -15.0, 0), rot=(0, 20, 0))
card("broom_bristles", "broom_head", spikes(5, 4, 71)[::-1], "straw_card", rel=(0, -2.5, 0), offset=(0, -2, 0),
     plane="yz")
card("broom_bristles_b", "broom_head", spikes(5, 4, 72)[::-1], "straw_card", rel=(0, -2.5, 0), offset=(0, -2, 0))
part("broom_tie", "broom_head", [4, 1, 4], "rope", rel=(0, 2.0, 0))
# the soul lantern: a hook out of the top left corner, a short chain, an iron cage round a soul flame
part("lantern_hook", "backpack", [1, 1, 6], "iron", rel=(7.2, 12.0, -11.0), offset=(0, 0, -2.5), rot=(20, 0, 0))
bone("lantern", "lantern_hook", rel=(0, 0, -5.4))
card("lantern_chain", "lantern", chain(2), "chain", rel=(0, 0, 0), offset=(0, -2.5, 0))
part("lantern_cap", "lantern", [3, 1, 3], "iron", rel=(0, -5.0, 0))
part("lantern_cage", "lantern", [4, 5, 4], "lantern", rel=(0, -8.0, 0))
part("lantern_base", "lantern", [4, 1, 4], "iron", rel=(0, -11.0, 0))
card("lantern_flame", "lantern_cage", FLAME_SMALL, "soul_flame", rel=(0, -0.5, 0), plane="xy")

# ======================================================================= palette
ramps = {
    "skin": ["#2b1119", "#45202b", "#5f2f39", "#7a3f45", "#965252", "#b06862", "#c78174", "#d99b88", "#e8b49f",
             "#f3cdb9"],
    "flush": ["#3d0b14", "#5c1220", "#80192a", "#a52432", "#c8363a", "#e2564a", "#f27f66", "#fbab8e"],
    "rot": ["#141a0d", "#1f2b13", "#2c3d18", "#3b501e", "#4d6625", "#617d2e", "#78953b", "#91ad4d", "#abc466"],
    "bone": ["#2a2016", "#3e3122", "#56452f", "#6f5c40", "#8a7454", "#a48e6b", "#bea984", "#d4c29f", "#e6d8bc",
             "#f4ecdb"],
    "dress": ["#0f1119", "#181b27", "#232838", "#2f3549", "#3c435a", "#4b536b", "#5c657d", "#707a91"],
    "shawl": ["#16091a", "#240f2a", "#35173c", "#47204f", "#5a2a62", "#6e3675", "#834586", "#995b98"],
    "hoof": ["#120d0c", "#1f1714", "#2e231e", "#3e3029", "#4f3e35", "#634f43"],
    "gold": ["#3b1d06", "#5a2f09", "#7c440d", "#a05e12", "#c47d18", "#e0a020", "#f3c434", "#fde35a", "#fff3a3",
             "#fffbe0"],
    "metal": ["#14151b", "#1f2129", "#2c2f39", "#3b3f4b", "#4d525f", "#626877", "#7b8291", "#979eab", "#b6bcc6"],
    "leather": ["#1a0e08", "#2a170d", "#3c2213", "#4f2e19", "#643c20", "#7a4b28", "#905c31", "#a66e3d", "#ba824c"],
    "canvas": ["#231d14", "#352c1f", "#4a3e2b", "#605139", "#776548", "#8e7a59", "#a5906c", "#bba682", "#cdbb9a"],
    "wool": ["#2a0b0b", "#451213", "#631c1b", "#822724", "#a0342d", "#bb473a", "#d06350", "#e0866c"],
    "clay": ["#28120d", "#3f1c14", "#5b291b", "#783722", "#94472b", "#ad5a37", "#c27149", "#d38c63", "#e2aa86"],
    "glass": ["#1d2a30", "#2f454e", "#4a6874", "#76959f", "#b0c9cf", "#e4f1f3"],
    "potg": ["#0d260f", "#174419", "#246b24", "#3c9a33", "#68c552", "#a6ea84"],
    "potm": ["#25092a", "#431249", "#6c1d78", "#9b2fa5", "#cc55cc", "#f08ee8"],
    "soul": ["#06191d", "#0b2f36", "#0f4a52", "#136b72", "#1a9397", "#2cbdbb", "#5ee0d6", "#a4fcef", "#effffb"],
    "hair": ["#26252d", "#3c3b45", "#55545e", "#706f79", "#8d8c95", "#abaab1", "#c9c8cd", "#e3e2e5"],
    "straw": ["#2e1f0b", "#4a3311", "#6b4c18", "#8c6722", "#ab842e", "#c6a23e", "#dcbf58", "#ecd67e"],
    "wood": ["#1e120b", "#301d11", "#452a18", "#5c3a20", "#744b29", "#8d5e34", "#a77441"],
    "mouth": ["#1a070c", "#2e0d16", "#461623", "#5f2131"],
    "fungus": ["#2b0709", "#4d0d10", "#771619", "#a12423", "#c83b33", "#e06450"],
}

light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.6, "gradient": 0.35, "ao": 0.8, "ao_height": 8.0}
brush = {"flow": "long", "length": 2.6, "width": 1.0, "rough": 0.5, "overshoot": 0.3,
         "flows": {"canvas": "y", "leather": "horizontal", "shawl": "y", "dress": "y", "wood": "long",
                   "straw": "long"},
         "textures": {"skin": "organic", "rot": "organic", "bone": "organic", "leather": "leather",
                      "canvas": "cloth", "shawl": "cloth", "dress": "cloth", "wool": "cloth", "metal": "metal",
                      "gold": "metal", "clay": "stone", "wood": "wood", "straw": "wood", "hair": "fur"}}

RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4}
RIM_SOFT = {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.2}
NOISE = {"id": "clumps", "op": "noise", "scale": 0.8, "amount": 0.5}
STITCH = {"s": "canvas:7", "S": "canvas:2"}
# rot: a jagged-edged half of green rotting flesh with dark sores and pale mould (left side = +X)
ROT_HALF = {"id": "rot", "op": "band", "axis": "x", "from": 0.06, "to": 1.01, "wobble": 0.22, "wobble_scale": 0.35,
            "ramp": "rot", "tone": 5.0, "bevel": {"shadow_ramp": "mouth", "shadow_shift": 0, "highlight": 0}}
SORES = {"id": "sores", "op": "spots", "count": 4, "radius": [0.4, 0.9], "ramp": "rot", "tone": 1.6,
         "where": {"x": [0.15, 1.0]}, "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 2.5}}
MOULD = {"id": "mould", "op": "spots", "count": 3, "radius": [0.3, 0.6], "ramp": "rot", "tone": 8.0,
         "where": {"x": [0.2, 1.0]}}
GOLD_GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0, "density": 0.7,
              "shift": 2.0}

styles = {
    # --- fabric
    "dress": {"ramp": "dress", "tone": 3.4, "rim": RIM_SOFT, "brush": {"flow": "y"},
              "layers": [NOISE, {"id": "folds", "op": "stripes", "axis": "x", "period": 2.6, "width": 0.3,
                                 "shift": -0.9, "wobble": 0.5, "faces": ["sides"]}]},
    "skirt": {"ramp": "dress", "tone": 3.2, "rim": RIM_SOFT, "brush": {"flow": "y"},
              "layers": [NOISE, {"id": "folds", "op": "stripes", "axis": "x", "period": 2.2, "width": 0.35,
                                 "shift": -1.1, "wobble": 0.6, "faces": ["front", "back"]},
                         {"id": "folds_s", "op": "stripes", "axis": "z", "period": 2.2, "width": 0.35, "shift": -1.1,
                          "wobble": 0.6, "faces": ["left", "right"]},
                         {"id": "mud", "op": "band", "axis": "y", "from": -1.01, "to": -0.5, "wobble": 0.3,
                          "ramp": "hoof", "tone": 2.2, "faces": ["sides"]}],
              "stamps": [{"face": "front", "at": [9, 0], "art": ["SSSSS", "SpPpS", "SpppS", "SSSSS"],
                          "key": {"S": "canvas:6", "p": "shawl:4", "P": "shawl:2"}}]},
    "torso": {"ramp": "dress", "tone": 3.6, "rim": RIM_SOFT, "brush": {"flow": "y"},
              "layers": [NOISE,
                         # the torn left flank: a dark cavity behind the bare ribs, green flesh round the hole
                         {"id": "hole_rim", "op": "rect", "rect": [0.08, 0.1, 0.86, 0.78], "ramp": "rot", "tone": 4.6,
                          "faces": ["right"]},
                         {"id": "hole", "op": "rect", "rect": [0.18, 0.2, 0.76, 0.68], "ramp": "mouth", "tone": 0.6,
                          "faces": ["right"]}]},
    "belly": {"ramp": "dress", "tone": 4.0, "rim": RIM_SOFT, "brush": {"flow": "horizontal"},
              "layers": [NOISE,
                         {"id": "stretch", "op": "stripes", "axis": "y", "period": 2.4, "width": 0.25, "shift": -0.9,
                          "wobble": 0.4, "faces": ["front", "left", "right"]},
                         {"id": "sag", "op": "gradient", "axis": "y", "amount": 0.6},
                         {"id": "stains", "op": "spots", "count": 3, "radius": [0.6, 1.2], "ramp": "dress",
                          "tone": 1.6, "faces": ["front"]}],
              "stamps": [{"face": "front", "at": [7, 3], "art": [".kk.", "kSSk", "kSnk", ".kk."],
                          "key": {"k": "skin:3", "S": "skin:6", "n": "skin:2"}}]},
    "patch_canvas": {"ramp": "canvas", "tone": 5.6, "rim": RIM_SOFT,
                     "layers": [{"id": "weave", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.4,
                                 "shift": -0.7}],
                     "stamps": [{"face": "front", "at": "top-left", "art": ["s.s.s", ".....", "s...s", ".....",
                                                                          "s.s.s"][:4], "key": STITCH}]},
    "tatter_dress": {"ramp": "dress", "tone": 3.4, "brush": {"off": True},
                     "art_key": {"f": "dress:3", "m": "dress:2", "t": "dress:1"}},
    "shawl": {"ramp": "shawl", "tone": 4.6, "rim": RIM, "brush": {"flow": "y", "rough": 0.6},
              "layers": [NOISE,
                         {"id": "knit", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.4, "shift": -0.6},
                         {"id": "stripe", "op": "stripes", "axis": "y", "period": 4.0, "width": 0.25, "ramp": "gold",
                          "tone": 3.6, "faces": ["sides", "front", "back"]},
                         {"id": "holes", "op": "spots", "count": 3, "radius": [0.3, 0.6], "ramp": "shawl", "tone": 0.4,
                          "faces": ["top", "front"]}]},
    "tatter_shawl": {"ramp": "shawl", "tone": 4.0, "brush": {"off": True},
                     "art_key": {"f": "shawl:4", "m": "shawl:3", "t": "shawl:6"}},
    "sleeve": {"ramp": "dress", "tone": 3.6, "rim": RIM_SOFT, "brush": {"flow": "y"},
               "layers": [NOISE, {"id": "folds", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.3,
                                  "shift": -0.8, "wobble": 0.4}]},
    "stocking_r": {"ramp": "shawl", "tone": 3.0, "rim": RIM_SOFT, "brush": {"off": True},
                   "layers": [{"id": "stripes", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.5,
                               "ramp": "dress", "tone": 1.0, "faces": ["sides"]}]},
    "stocking_l": {"ramp": "shawl", "tone": 3.0, "rim": RIM_SOFT, "brush": {"off": True},
                   "layers": [{"id": "stripes", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.5,
                               "ramp": "dress", "tone": 1.0, "faces": ["sides"]},
                              {"id": "ladder", "op": "patches", "scale": 1.0, "threshold": 0.45, "ramp": "rot",
                               "tone": 4.4, "faces": ["right", "front"]}]},
    "hoof": {"ramp": "hoof", "tone": 2.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "split", "op": "band", "axis": "x", "from": -0.1, "to": 0.1, "ramp": "hoof",
                         "tone": 0.4, "faces": ["front", "top"]},
                        {"id": "wear", "op": "noise", "scale": 0.5, "amount": 0.6}]},
    "rope": {"ramp": "straw", "tone": 3.6, "rim": RIM_SOFT, "brush": {"off": True},
             "layers": [{"id": "twist", "op": "stripes", "axis": [1, 1, 0], "period": 1.4, "width": 0.5,
                         "shift": -1.2}]},
    "rope_card": {"ramp": "straw", "tone": 3.6, "brush": {"off": True}, "art_key": {"r": "straw:4"}},
    # --- skin, head
    "head": {"ramp": "skin", "tone": 6.0, "rim": RIM, "brush": {"flow": "horizontal", "rough": 0.5},
             "layers": [{"id": "mottle", "op": "noise", "scale": 0.7, "amount": 0.7},
                        {"id": "wrinkles", "op": "stripes", "axis": "y", "period": 1.6, "width": 0.25, "shift": -0.8,
                         "range": [0.2, 1.0], "faces": ["front", "left", "right"]},
                        {"id": "liver", "op": "spots", "count": 4, "radius": [0.3, 0.6], "ramp": "skin", "tone": 3.6,
                         "where": {"x": [-1.0, 0.0]}},
                        ROT_HALF, SORES, MOULD,
                        {"id": "skull", "op": "spots", "centers": [[3.6, 3.0, -1.0, 1.6], [4.2, 1.0, 1.4, 1.0]],
                         "ramp": "bone", "tone": 6.4, "faces": ["top", "right"],
                         "bevel": {"shadow_ramp": "rot", "shadow_shift": 0, "highlight": 0}},
                        {"id": "blush", "op": "spots", "centers": [[-3.4, -2.0, 4.0, 1.4]], "ramp": "flush",
                         "tone": 5.0, "faces": ["front"]}]},
    "snout": {"ramp": "flush", "tone": 4.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
              "brush": {"off": True},
              "layers": [{"id": "root", "op": "gradient", "axis": "z", "amount": -1.4},
                         {"id": "veins", "op": "stripes", "axis": [1, 0.4, 0], "period": 1.7, "width": 0.2,
                          "shift": -1.0, "wobble": 0.8, "faces": ["top", "left", "right"]},
                         {"id": "pores", "op": "spots", "count": 5, "radius": [0.25, 0.4], "ramp": "flush",
                          "tone": 3.0, "faces": ["front", "top"]},
                         {"id": "rot", "op": "band", "axis": "x", "from": 0.55, "to": 1.01, "wobble": 0.2,
                          "ramp": "rot", "tone": 4.6}],
              "stamps": [{"face": "front", "at": "top-left",
                          "art": [".h...", ".....", ".NsN.", ".nsn."],
                          "key": {"n": "mouth:0", "N": "mouth:1", "h": "flush:7", "s": "flush:5"}}]},
    "wart": {"ramp": "flush", "tone": 2.6, "rim": RIM, "brush": {"off": True}},
    "hair": {"ramp": "hair", "tone": 4.0, "rim": RIM, "brush": {"flow": "long", "rough": 0.8},
             "layers": [{"id": "strands", "op": "stripes", "axis": [1, 0.3, 0], "period": 1.0, "width": 0.4,
                         "shift": -1.2}]},
    "hair_card": {"ramp": "hair", "tone": 5.0, "brush": {"off": True},
                  "art_key": {"h": "hair:5", "H": "hair:3", "t": "hair:6", "m": "hair:4", "f": "hair:3"}},
    "brow": {"ramp": "hair", "tone": 4.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "bristle", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.5,
                         "shift": 1.2}]},
    "eye": {"ramp": "soul", "tone": 6.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "top-left", "art": ["Ee", "wW"],
                        "key": {"W": "soul:8", "w": "soul:6", "E": "soul:5", "e": "soul:4"}}]},
    "lid_r": {"ramp": "skin", "tone": 5.0, "rim": RIM, "brush": {"off": True},
              "layers": [{"id": "lash", "op": "band", "axis": "y", "from": -1.01, "to": -0.3, "ramp": "skin",
                          "tone": 2.0, "faces": ["front"]}]},
    "lid_l": {"ramp": "rot", "tone": 5.0, "rim": RIM, "brush": {"off": True},
              "layers": [{"id": "lash", "op": "band", "axis": "y", "from": -1.01, "to": -0.3, "ramp": "rot",
                          "tone": 1.6, "faces": ["front"]}]},
    "bag_r": {"ramp": "skin", "tone": 4.0, "rim": RIM, "brush": {"off": True},
              "layers": [{"id": "pouch", "op": "band", "axis": "y", "from": 0.0, "to": 1.01, "ramp": "shawl",
                          "tone": 5.0, "faces": ["front"]}]},
    "bag_l": {"ramp": "rot", "tone": 3.6, "rim": RIM, "brush": {"off": True}},
    "socket": {"ramp": "mouth", "tone": 0.6, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "cheek": {"ramp": "skin", "tone": 6.2, "rim": RIM, "brush": {"flow": "y"},
              "layers": [{"id": "sag", "op": "gradient", "axis": "y", "amount": 1.2},
                         {"id": "blush", "op": "spots", "count": 2, "radius": [0.6, 1.0], "ramp": "flush",
                          "tone": 5.2, "faces": ["front", "left"]},
                         {"id": "stubble", "op": "spots", "count": 3, "radius": [0.2, 0.3], "ramp": "skin",
                          "tone": 3.0}]},
    "zombie_cheek": {"ramp": "rot", "tone": 5.4, "rim": RIM, "brush": {"flow": "y"},
                     "layers": [{"id": "sag", "op": "gradient", "axis": "y", "amount": 1.2}, SORES, MOULD,
                                {"id": "tear", "op": "rect", "rect": [0.2, 0.0, 0.8, 0.45], "ramp": "mouth",
                                 "tone": 0.8, "faces": ["front", "right"],
                                 "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 2.0}}],
                     "stamps": [{"face": "right", "at": [1, 2], "art": ["t.t", "ttt"], "key": {"t": "bone:8"}}]},
    "jaw": {"ramp": "skin", "tone": 5.2, "rim": RIM, "brush": {"flow": "horizontal"},
            "layers": [{"id": "lip", "op": "band", "axis": "y", "from": 0.4, "to": 1.01, "ramp": "flush",
                        "tone": 3.6, "faces": ["front", "sides"]},
                       {"id": "mouth", "op": "fill", "ramp": "mouth", "tone": 2.0, "faces": ["top"]},
                       {"id": "rot", "op": "band", "axis": "x", "from": 0.2, "to": 1.01, "wobble": 0.2,
                        "ramp": "rot", "tone": 4.0}]},
    "tusk": {"ramp": "bone", "tone": 7.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "teeth": {"ramp": "bone", "tone": 8.0, "brush": {"off": True}, "art_key": {"t": "bone:7"}},
    "ear": {"ramp": "skin", "tone": 5.6, "rim": RIM, "brush": {"flow": "y"},
            "layers": [{"id": "inner", "op": "rect", "rect": [0.2, 0.15, 0.8, 0.85], "ramp": "flush", "tone": 3.4,
                        "faces": ["left", "right"], "bevel": {"shadow": 1, "highlight": 0}},
                       {"id": "tip", "op": "gradient", "axis": "y", "amount": 0.8},
                       {"id": "notch", "op": "spots", "count": 1, "radius": [0.4, 0.5], "ramp": "skin", "tone": 2.0}]},
    "ear_rot": {"ramp": "rot", "tone": 5.0, "rim": RIM, "brush": {"flow": "y"},
                "layers": [{"id": "inner", "op": "rect", "rect": [0.2, 0.15, 0.8, 0.85], "ramp": "mouth", "tone": 2.6,
                            "faces": ["left", "right"], "bevel": {"shadow": 1, "highlight": 0}}, SORES, MOULD]},
    "ear_tear": {"ramp": "rot", "tone": 4.0, "brush": {"off": True}, "art_key": {"b": "rot:3"}},
    "arm_r": {"ramp": "skin", "tone": 5.8, "rim": RIM, "brush": {"flow": "y"},
              "layers": [{"id": "mottle", "op": "noise", "scale": 0.7, "amount": 0.6},
                         {"id": "liver", "op": "spots", "count": 3, "radius": [0.3, 0.5], "ramp": "skin",
                          "tone": 3.8}]},
    "arm_l": {"ramp": "rot", "tone": 5.2, "rim": RIM, "brush": {"flow": "y"},
              "layers": [{"id": "mottle", "op": "noise", "scale": 0.7, "amount": 0.7}, dict(SORES, where={}),
                         dict(MOULD, where={}),
                         {"id": "torn", "op": "rect", "rect": [0.0, 0.25, 0.55, 0.85], "ramp": "mouth", "tone": 1.0,
                          "faces": ["right"], "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 2.0}}]},
    "fist_r": {"ramp": "skin", "tone": 6.0, "rim": RIM, "brush": {"off": True},
               "layers": [{"id": "knuckles", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3,
                           "shift": -1.0, "faces": ["front"]},
                          {"id": "nails", "op": "band", "axis": "y", "from": -1.01, "to": -0.6, "ramp": "hoof",
                           "tone": 3.6, "faces": ["front"]}],
               "stamps": [{"face": "front", "at": [0, 0], "art": ["...g"], "key": {"g": "gold:7"}}]},
    "fist_l": {"ramp": "rot", "tone": 5.4, "rim": RIM, "brush": {"off": True},
               "layers": [{"id": "knuckles", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3,
                           "shift": -1.2, "faces": ["front"]},
                          {"id": "bones", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "ramp": "bone",
                           "tone": 7.0, "faces": ["front"]}]},
    "rot": {"ramp": "rot", "tone": 4.8, "rim": RIM, "brush": {"flow": "y"},
            "layers": [{"id": "mottle", "op": "noise", "scale": 0.6, "amount": 0.8}, dict(SORES, where={}),
                       dict(MOULD, where={})]},
    "rib": {"ramp": "bone", "tone": 7.6, "brush": {"off": True}, "art_key": {"b": "bone:7"}},
    "bone": {"ramp": "bone", "tone": 7.0, "rim": RIM, "brush": {"flow": "long"},
             "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.8},
                        {"id": "cracks", "op": "cracks", "scale": 2.5, "width": 0.05, "shift": -2.0}]},
    "skull": {"ramp": "bone", "tone": 7.4, "rim": RIM, "brush": {"off": True},
              "stamps": [{"face": "front", "at": "top-left", "art": ["....", "ee.e", "e..e", "....", ".n.."][:3],
                          "key": {"e": "mouth:0", "n": "mouth:1"}}]},
    # --- gold, metal
    "gold": {"ramp": "gold", "tone": 5.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.8},
             "brush": {"off": True}, "layers": [GOLD_GLOSS]},
    "gold_gem": {"ramp": "gold", "tone": 5.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.8},
                 "brush": {"off": True},
                 "stamps": [{"face": "front", "at": "center", "art": ["s"], "key": {"s": "soul:6"}}]},
    "coin": {"ramp": "gold", "tone": 6.0, "brush": {"off": True},
             "art_key": {"g": "gold:4", "G": "gold:7", "h": "gold:9"}},
    "gold_card": {"ramp": "gold", "tone": 6.0, "brush": {"off": True}, "art_key": {"g": "gold:6", "h": "gold:9"}},
    "flask": {"ramp": "metal", "tone": 5.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.6},
              "brush": {"off": True},
              "layers": [{"id": "band", "op": "band", "axis": "y", "from": 0.4, "to": 0.62, "ramp": "gold",
                          "tone": 5.4, "faces": ["sides"]},
                         {"id": "dent", "op": "spots", "count": 2, "radius": [0.4, 0.6], "shift": -1.6,
                          "bevel": {"shadow": 1, "highlight": 1}},
                         {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                          "density": 0.6, "shift": 2.2}],
              "stamps": [{"face": "front", "at": [1, 3], "art": ["x"], "key": {"x": "mouth:0"}}]},
    "pewter": {"ramp": "metal", "tone": 4.6, "rim": RIM, "brush": {"off": True}},
    "iron": {"ramp": "metal", "tone": 2.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "rust", "op": "spots", "count": 2, "radius": [0.3, 0.5], "ramp": "leather",
                         "tone": 4.0}]},
    "chain": {"ramp": "metal", "tone": 4.0, "brush": {"off": True}, "art_key": {"c": "metal:5"}},
    "lantern": {"ramp": "metal", "tone": 2.4, "rim": RIM, "brush": {"off": True}, "light": 0.4,
                "layers": [{"id": "window", "op": "rect", "rect": [0.25, 0.2, 0.75, 0.8], "ramp": "soul",
                            "tone": 5.0, "faces": ["sides"]},
                           {"id": "core", "op": "rect", "rect": [0.25, 0.2, 0.75, 0.5], "ramp": "soul", "tone": 7.2,
                            "faces": ["sides"]}]},
    "soul_flame": {"ramp": "soul", "tone": 5.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                   "art_key": SOUL_KEY},
    # --- the rucksack
    "pack": {"ramp": "canvas", "tone": 4.6, "rim": RIM, "brush": {"flow": "y", "rough": 0.6},
             "layers": [NOISE,
                        {"id": "seams", "op": "stripes", "axis": "y", "period": 5.0, "width": 0.12, "shift": -1.4,
                         "faces": ["sides"]},
                        {"id": "grime", "op": "patches", "scale": 1.1, "threshold": 0.55, "shift": -1.2},
                        {"id": "under", "op": "gradient", "axis": "y", "amount": 0.7}],
             "stamps": [
                 # a sewn-on patchwork: purple wool, red wool, a leather square, rough stitches round each
                 {"face": "right", "at": [1, 2], "art": ["s.s.s.s", "SpppppS", ".pPpPp.", "SpppppS", ".pPpPp.",
                                                       "SpppppS", "s.s.s.s"],
                  "key": {"s": "canvas:7", "S": "canvas:2", "p": "shawl:4", "P": "shawl:3"}},
                 {"face": "left", "at": [4, 9], "art": ["s.s.s.", "SwwwwS", ".wWww.", "SwwwWS", "s.s.s."],
                  "key": {"s": "canvas:7", "S": "canvas:2", "w": "wool:4", "W": "wool:2"}},
                 {"face": "back", "at": [1, 1], "art": ["s.s.s", "SlllS", ".lLl.", "SlllS", "s.s.s"],
                  "key": {"s": "canvas:7", "S": "canvas:2", "l": "leather:5", "L": "leather:3"}},
                 {"face": "back", "at": [9, 11], "art": ["sSsS", "rrrr", "rRrr", "sSsS"],
                  "key": {"s": "canvas:7", "S": "canvas:2", "r": "rot:5", "R": "rot:3"}},
                 {"face": "top", "at": [2, 2], "art": ["s.s", ".x.", "s.s"], "key": {"s": "canvas:7",
                                                                                   "x": "canvas:1"}}]},
    "pack_pocket": {"ramp": "leather", "tone": 4.6, "rim": RIM, "brush": {"flow": "horizontal"},
                    "layers": [NOISE, {"id": "scuff", "op": "wear", "width": 1, "density": 0.2, "shift": 1.4},
                               {"id": "seam", "op": "band", "axis": "y", "from": 0.7, "to": 0.82, "shift": -1.4,
                                "faces": ["sides"]}],
                    "stamps": [{"face": "back", "at": [6, 3], "art": ["SpS", "pPp", "SpS"],
                                "key": {"S": "canvas:7", "p": "wool:4", "P": "wool:2"}}]},
    "leather": {"ramp": "leather", "tone": 4.6, "rim": RIM, "brush": {"flow": "horizontal"},
                "layers": [NOISE, {"id": "scuff", "op": "wear", "width": 1, "density": 0.2, "shift": 1.4}]},
    "leather_dark": {"ramp": "leather", "tone": 3.0, "rim": RIM, "brush": {"flow": "long"},
                     "layers": [{"id": "holes", "op": "stripes", "axis": "z", "period": 3.0, "width": 0.2,
                                 "shift": -1.4}]},
    "lid": {"ramp": "leather", "tone": 4.0, "rim": RIM, "brush": {"flow": "horizontal"},
            "layers": [NOISE, {"id": "scuff", "op": "wear", "width": 1, "density": 0.25, "shift": 1.6},
                       {"id": "cracks", "op": "cracks", "scale": 2.0, "width": 0.05, "shift": -1.4}],
            "stamps": [{"face": "top", "at": [9, 4], "art": ["s.s.s", "SwwwS", ".wWw.", "SwwwS", "s.s.s"],
                        "key": {"s": "canvas:7", "S": "canvas:2", "w": "rot:5", "W": "rot:3"}}]},
    "bedroll": {"ramp": "wool", "tone": 4.0, "rim": RIM, "brush": {"flow": "x"},
                "layers": [{"id": "roll", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.3, "shift": -1.4,
                            "faces": ["left", "right"]},
                           {"id": "check", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.34, "ramp": "canvas",
                            "tone": 6.0, "faces": ["front", "back", "top", "bottom"]}]},
    "clay": {"ramp": "clay", "tone": 5.0, "rim": RIM, "brush": {"flow": "horizontal"},
             "layers": [{"id": "band", "op": "band", "axis": "y", "from": 0.1, "to": 0.4, "ramp": "clay",
                         "tone": 2.0, "faces": ["sides"]},
                        {"id": "glyph", "op": "spots", "count": 2, "radius": [0.4, 0.6], "ramp": "gold", "tone": 5.0,
                         "faces": ["front", "left"]},
                        {"id": "chip", "op": "wear", "width": 1, "density": 0.2, "ramp": "clay", "tone": 2.4}]},
    "clay_dark": {"ramp": "clay", "tone": 3.4, "rim": RIM, "brush": {"off": True}},
    "bottle_g": {"ramp": "potg", "tone": 3.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.0},
                 "brush": {"off": True},
                 "layers": [{"id": "glass_top", "op": "band", "axis": "y", "from": 0.4, "to": 1.01, "ramp": "glass",
                             "tone": 3.0},
                            {"id": "glint", "op": "band", "axis": "x", "from": -1.01, "to": -0.4, "shift": 1.8,
                             "faces": ["front"]}]},
    "bottle_m": {"ramp": "potm", "tone": 3.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.0},
                 "brush": {"off": True},
                 "layers": [{"id": "glass_top", "op": "band", "axis": "y", "from": 0.25, "to": 1.01, "ramp": "glass",
                             "tone": 3.0},
                            {"id": "glint", "op": "band", "axis": "x", "from": -1.01, "to": -0.4, "shift": 1.8,
                             "faces": ["front"]}]},
    "cork": {"ramp": "straw", "tone": 3.0, "rim": RIM, "brush": {"off": True}},
    "fungus_cap": {"ramp": "fungus", "tone": 3.6, "rim": RIM, "brush": {"off": True},
                   "layers": [{"id": "dots", "op": "spots", "count": 2, "radius": [0.3, 0.4], "ramp": "gold",
                               "tone": 7.0, "faces": ["top", "sides"]}]},
    "fungus_stem": {"ramp": "fungus", "tone": 2.0, "brush": {"off": True}, "art_key": {"s": "fungus:2"}},
    "wood": {"ramp": "wood", "tone": 3.6, "rim": RIM, "brush": {"flow": "long"},
             "layers": [{"id": "grain", "op": "noise", "scale": 0.5, "amount": 0.6}]},
    "straw": {"ramp": "straw", "tone": 4.4, "rim": RIM, "brush": {"flow": "y", "rough": 0.8},
              "layers": [{"id": "stalks", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.4, "shift": -1.2}]},
    "straw_card": {"ramp": "straw", "tone": 4.0, "brush": {"off": True},
                   "art_key": {"t": "straw:6", "m": "straw:4", "f": "straw:3"}},
}

# ======================================================================= animation
# Pose helpers. Axes: +x tips a part's top forward (arms: -x raises them forward), +y turns it to her left,
# +z leans it to her right; side()/both() mirror y and z, so z > 0 is "outward" for a left/right pair.
def arm(s, a=0, out=0, twist=0, elbow=0, wrist=0, roll=0):
    """Shoulder pitch (- raises forward), abduction (+ out), twist; elbow (- bends the forearm up), wrist."""
    return add(side("arm", s, a, twist, out), side("forearm", s, elbow), side("fist", s, wrist, 0, roll))


def leg(s, a=0, knee=0, hoof=0, splay=0):
    """Hip pitch (- forward), knee (+ bends the shin back), hoof pitch, splay (+ out)."""
    return add(side("leg", s, a, 0, splay), side("shin", s, knee), side("hoof", s, hoof))


def lids(v):
    """Eyelids: +1 shuts the eyes, -0.6 opens them wide (scale offsets on the drooping lids)."""
    return add(sc("lid_l", 0, v, 0), sc("lid_r", 0, v, 0))


def ears(z=0, x=0):
    return both("ear", x, 0, z)


def jowls(v):
    """Puff (+) or suck in (-) the jowls."""
    return add(sc("cheek_r", v, v * 0.6, v), sc("zombie_cheek", v, v * 0.6, v))


DANGLE = [("lantern", 1.0), ("pot", 0.6), ("skull", 0.9), ("earring_r", 1.2)]


def dangles(t0, amp, freq=3.0, decay=3.0, end=None, axis=2):
    """Everything hanging off her swings and rings out after a jolt at t0 (lantern, pot, skull, earring)."""
    out = []
    for k, (p, g) in enumerate(DANGLE):
        out.append(ring(p, t0 + 0.03 * k, amp * g * (1 if k % 2 == 0 else -1), freq=freq, decay=decay, axis=axis,
                        end=end))
    return out


def sway_all(L, amp=1.0, cycles=1, phase=0.0):
    """Looping secondary motion: dangles swinging, fringes and jowls following through."""
    tr = [osc("lantern", "z", 9 * amp, cycles, phase + 0.3), osc("lantern", "x", 5 * amp, cycles, phase + 0.55),
          osc("pot", "z", -6 * amp, cycles, phase + 0.35), osc("skull", "z", 8 * amp, cycles, phase + 0.4),
          osc("skull", "x", 5 * amp, cycles, phase + 0.2), osc("earring_r", "x", 14 * amp, cycles, phase + 0.45),
          osc("earring_r", "z", 8 * amp, cycles, phase + 0.2),
          osc("hem_f", "x", -5 * amp, cycles, phase + 0.3), osc("hem_b", "x", 5 * amp, cycles, phase + 0.35),
          osc("hem_l", "z", 5 * amp, cycles, phase + 0.25), osc("hem_r", "z", -5 * amp, cycles, phase + 0.25),
          osc("shawl_lap_l", "x", -5 * amp, cycles, phase + 0.3), osc("shawl_lap_r", "x", -5 * amp, cycles, phase + 0.4),
          osc("cheek_r", "z", 4 * amp, cycles, phase + 0.3), osc("zombie_cheek", "z", -4 * amp, cycles, phase + 0.35)]
    for k in range(4):
        tr.append(osc(f"coin{k}", "x", (8 + 2 * k) * amp, cycles, phase + 0.2 + 0.07 * k))
    return tr


REST = {}
ANIM = {}

# ---------------------------------------------------------------- idle: swaying tipsily, dozing off and jerking awake
L = 4.0
DOZE = [[0, 0], [1.2, 0], [2.2, 10], [2.5, 14], [2.58, -6, "out"], [2.8, 2], [3.1, 0]]
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("body", "z", 2.2, 1), osc("body", "y", 1.5, 1, 0.25),
    osc("chest", "z", -1.6, 1, 0.12), osc("chest", "x", 1.4, 2, 0.1),
    osc("belly", None, [0.035, 0.02, 0.045], 2, 0.05, ch="scale"), osc("belly", "x", -1.5, 2, 0.12),
    osc("head", "z", 4, 1, 0.3),
    keys("head", "x", DOZE),
    keys("lid_l", None, [[0, [0, 0, 0]], [1.2, [0, 0, 0]], [2.4, [0, 0.9, 0]], [2.58, [0, -0.6, 0], "out"],
                         [2.9, [0, 0, 0]], [3.6, [0, 0, 0]], [3.68, [0, 1, 0]], [3.78, [0, 0, 0]]], ch="scale"),
    keys("lid_r", None, [[0, [0, 0, 0]], [1.2, [0, 0, 0]], [2.4, [0, 0.9, 0]], [2.58, [0, -0.6, 0], "out"],
                         [2.9, [0, 0, 0]], [3.6, [0, 0, 0]], [3.68, [0, 1, 0]], [3.78, [0, 0, 0]]], ch="scale"),
    keys("jaw", "x", [[0, 0], [1.4, 0], [2.4, 12], [2.58, 0, "out"], [4.0, 0]]),
    keys("ear_l", "z", [[0, 0], [2.5, 0], [2.6, 18, "out"], [3.0, 0]]),
    keys("ear_r", "z", [[0, 0], [2.52, 0], [2.62, -18, "out"], [3.05, 0]]),
    wave(["ear_r", "earring_r"], "x", 5, 1, 0.15, 1.6, 0.4),
    osc("arm_l", "z", 2, 1, 0.1), osc("arm_r", "z", -2, 1, 0.1),
    osc("forearm_l", "x", -3, 2, 0.3), osc("forearm_r", "x", -3, 2, 0.35),
    osc("backpack", "z", 1.2, 1, 0.2), osc("backpack_lid", "x", 1.5, 2, 0.4, bias=1.5),
] + sway_all(L, 1.0, 1, 0.0))

# ---------------------------------------------------------------- walk: a drunken, lurching, limping stumble
L = 2.0
STEP_R = [(0.0, (-26, 10, 14)), (0.22, (-8, 6, 4)), (0.5, (18, 8, -8)), (0.6, (8, 50, -16)), (0.78, (-30, 42, 0)),
          (0.9, (-32, 16, 12))]
DRAG_L = [(0.0, (-16, 4, 8)), (0.3, (-2, 2, 0)), (0.5, (16, 4, -4)), (0.66, (10, 16, 14)), (0.86, (-12, 12, 8))]


def walk_legs(L):
    tr = []
    for s, ph, ks in ((-1, 0.0, STEP_R), (1, 0.5, DRAG_L)):
        n = "l" if s > 0 else "r"
        for j, nm in enumerate(("leg", "shin", "hoof")):
            tr.append(cycle(f"{nm}_{n}", L, [(u, [v[j], 0, 0]) for u, v in ks], ph))
        tr.append(osc(f"leg_{n}", "z", 3, 1, ph + 0.25, bias=2))
    return tr


STUMBLE = [[0, 0], [1.0, 0], [1.12, 10, "out"], [1.3, 3], [1.5, -2], [1.7, 0]]
ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=walk_legs(L) + [
    osc("body", "z", 7, 1, 0.0), osc("body", "y", -6, 1, 0.1), osc("body", "z", 2, 3, 0.2),
    osc("chest", "z", -5, 1, 0.12), osc("chest", "y", 5, 1, 0.2),
    osc("chest", "x", 3, 2, 0.15, bias=3, shape="bounce"),
    keys("chest", "x", STUMBLE),
    osc("head", "z", 9, 1, 0.3), osc("head", "x", -4, 2, 0.25), osc("head", "y", -6, 1, 0.35),
    keys("head", "x", [[0, 0], [1.1, 0], [1.2, -10, "out"], [1.45, 4], [1.7, 0]]),
    # arms flail for balance: out when she lurches the other way, forearms flopping after
    osc("arm_l", "z", 14, 1, 0.5, bias=10), osc("arm_r", "z", -14, 1, 0.5, bias=10),
    osc("arm_l", "x", 14, 1, 0.0), osc("arm_r", "x", -14, 1, 0.0),
    osc("forearm_l", "x", -12, 1, 0.12, bias=-10), osc("forearm_r", "x", 12, 1, 0.12, bias=-10),
    keys("arm_l", "z", [[0, 0], [1.05, 0], [1.15, 28, "out"], [1.5, 0]]),
    keys("arm_r", "z", [[0, 0], [1.05, 0], [1.17, -28, "out"], [1.52, 0]]),
    osc("belly", None, [0.05, -0.06, 0.05], 2, 0.1, ch="scale", shape="bounce"), osc("belly", "x", 5, 2, 0.2),
    osc("backpack", "z", 5, 1, 0.22), osc("backpack", "x", 3, 2, 0.3),
    osc("backpack_lid", "x", 6, 2, 0.4, bias=6),
    osc("ear_l", "z", 12, 2, 0.3, bias=4), osc("ear_r", "z", -12, 2, 0.35, bias=-4),
    osc("jaw", "x", 4, 2, 0.4, bias=4),
] + sway_all(L, 2.0, 1, 0.1) + [osc("lantern", "x", 12, 2, 0.5)])

# ---------------------------------------------------------------- drink: a long, tipsy swig from the flask
LOOK = add(r("head", 14, 22, -6), arm(1, -36, -6, 0, -46, -10), lids(-0.5), r("chest", 4, 6))
RAISE = add(r("chest", -12, 4), r("body", -3), r("head", -26, 6), arm(1, -96, -30, 10, -62, -30), lids(0.8),
            r("jaw", 10), r("belly", -6), sc("belly", 0.04, 0, 0.05), ears(-10))
GLUG = add(r("chest", -18, 4), r("body", -5), r("head", -38, 4), arm(1, -122, -32, 10, -52, -56), lids(1.0),
           r("jaw", 14), r("belly", -8), sc("belly", 0.08, 0.02, 0.1), ears(-14))
AHH = add(r("chest", 8), r("head", 10, -4, 4), arm(1, -20, 6, 0, -30, 0), r("jaw", 30), lids(-0.4), ears(26),
          sc("belly", 0.1, 0.04, 0.12), jowls(0.15))
TIPSY = add(r("body", 0, 0, 7), r("chest", 4, 0, 5), r("head", 6, 0, 14), arm(1, -8, 10), arm(-1, 0, 14), lids(0.7),
            r("jaw", 8), ears(10), sc("belly", 0.06, 0, 0.08))
ANIM["drink"] = timeline(1.6, [
    (0.0, REST, None), (0.2, LOOK, "out"), (0.42, RAISE, "out_back"), (0.55, GLUG, "ease"),
    (1.02, add(GLUG, r("head", -4), arm(1, -6)), "ease"), (1.16, AHH, "out"),
    (1.36, TIPSY, "ease"), (1.48, add(TIPSY, r("body", 0, 0, -9), r("head", 0, 0, -16)), "ease"),
    (1.6, REST, "ease")],
    extra=[shake("zombie_cheek", 0.55, 1.05, [0.22, 0.12, 0.22], freq=5.5, ch="scale"),
           shake("cheek_r", 0.55, 1.05, [0.22, 0.12, 0.22], freq=5.5, ch="scale"),
           shake("head", 0.55, 1.05, 3.0, freq=5.5, axis=0),
           shake("chest", 1.16, 1.36, 2.5, freq=12, axis=2)] + dangles(1.16, 10) + dangles(1.4, 8))

# ---------------------------------------------------------------- hiccup: HIC! a jolt through her whole body
HIC = add(r("chest", -12), r("head", -16), lids(-0.7), jowls(0.3), r("jaw", -4), arm(1, -20, 26, 0, -30),
          arm(-1, -20, 26, 0, -30), ears(30, -10), sc("belly", -0.04, 0.12, -0.04), r("backpack", -6),
          r("backpack_lid", 28), leg(1, 0, 0, 10), leg(-1, 0, 0, 10))
LAND = add(r("chest", 8), r("head", 10), lids(0.4), sc("belly", 0.1, -0.08, 0.1), arm(1, 4, 6), arm(-1, 4, 6),
           ears(-8), r("backpack", 5), leg(1, -8, 16, -8), leg(-1, -8, 16, -8))
ANIM["hiccup"] = timeline(0.6, [
    (0.0, REST, None), (0.06, add(r("chest", 4), sc("belly", 0.03, -0.04, 0.03)), "ease"), (0.11, HIC, "out"),
    (0.2, LAND, "in"), (0.32, add(r("chest", -3), r("head", -4), lids(0.2)), "ease"), (0.6, REST, "ease")],
    lift=[[0, 0], [0.07, 0], [0.12, 2.2, "out"], [0.2, 0, "in"], [0.6, 0]],
    extra=dangles(0.12, 16, freq=4.0) + [ring("backpack_lid", 0.2, -10, freq=7, decay=7, axis=0),
                                         ring("belly", 0.2, [0.08, -0.08, 0.08], freq=6, decay=6, ch="scale"),
                                         ring("zombie_cheek", 0.2, 8, freq=7, axis=2),
                                         ring("cheek_r", 0.2, -8, freq=7, axis=2)])

# ---------------------------------------------------------------- rummage: twist round, dig in the pack, pull out a find
WIND_UP = add(r("body", 4, 8), r("chest", 6, 12), r("head", 6, 8), leg(1, -6, 12, -6), leg(-1, -6, 12, -6),
              arm(-1, -10, 8, 0, -20))
REACH = add(r("body", -2, -16, 2), r("chest", -8, -48, 8), r("head", -18, -34, 6), arm(-1, -168, 16, 0, -50, -20),
            arm(1, -10, 20, 0, -20), r("backpack_lid", 112), leg(1, -4, 6, -2), leg(-1, 4, 4, -4), lids(-0.4),
            ears(12))
DIG = add(REACH, r("chest", 4, -4), r("head", 6, -4), arm(-1, 14, 0, 0, -16))
YANK = add(r("body", -4, -12, 0), r("chest", -14, -40, 4), r("head", -22, -26, 0), arm(-1, -186, 22, 0, -10, 10),
           r("backpack_lid", 120), lids(-0.7), ears(28), sc("belly", 0.05, 0.08, 0.05))
LOOK_AT = add(r("body", 0, 6), r("chest", 4, 12), r("head", 16, 10, 16), arm(-1, -74, -14, 0, -66, -20, 10),
              arm(1, -6, 10), lids(-0.5), ears(16))
ANIM["rummage"] = timeline(2.0, [
    (0.0, REST, None), (0.18, WIND_UP, "ease"), (0.42, REACH, "out_back"), (0.56, DIG, "ease"),
    (0.7, REACH, "ease"), (0.84, DIG, "ease"), (0.96, REACH, "ease"), (1.06, DIG, "ease"),
    (1.2, YANK, "out"), (1.42, LOOK_AT, "out_back"), (1.76, add(LOOK_AT, r("head", 0, -6, -10), r("fist_r", 0, 30)),
                                                       "ease"), (2.0, REST, "ease")],
    extra=[shake("backpack", 0.45, 1.15, 2.5, freq=9, axis=2), shake("lantern", 0.45, 1.2, 10, freq=4, axis=2),
           shake("pot", 0.45, 1.2, 8, freq=5, axis=0), shake("skull", 0.45, 1.2, 10, freq=4.5, axis=2),
           shake("belly", 0.45, 1.1, [0.04, 0.06, 0.04], freq=9, ch="scale")]
    + dangles(1.42, 8) + [ring("backpack_lid", 1.6, -8, freq=6, decay=6, axis=0),
                          {"part": "backpack_lid", "axis": "x",
                           "keys": [[0, 0], [1.5, 0], [1.66, -112, "in"], [2.0, -112]], "ease": "ease"}])

# ---------------------------------------------------------------- refuse: chin up, a head shake, a wave-off ... and a burp
SNOOT = add(r("chest", -4, 18), r("head", -14, 18, -4), lids(0.6), arm(-1, -56, 34, 0, -60, 0, 20), ears(-6))
SHAKES = []
for k, t in enumerate((0.26, 0.38, 0.5, 0.62, 0.74)):
    a = 22 * (1 if k % 2 == 0 else -1) * (1.0 - 0.12 * k)
    SHAKES.append((t, add(SNOOT, r("head", 0, a, -a * 0.25), r("fist_r", 0, 0, -a * 1.4), r("forearm_r", 0, a * 0.8),
                          jowls(0.05)), "ease"))
BURP = add(r("chest", -10, 10), r("head", -18, 6), r("jaw", 26), lids(-0.4), jowls(0.3), sc("belly", 0.12, 0.04, 0.14),
           r("belly", -8), arm(-1, -10, 10), ears(22))
ANIM["refuse"] = timeline(1.2, [(0.0, REST, None), (0.16, SNOOT, "out")] + SHAKES + [
    (0.86, add(SNOOT, r("head", 0, 0, 0)), "ease"), (0.96, BURP, "out"), (1.06, add(BURP, r("jaw", -8)), "ease"),
    (1.2, REST, "ease")],
    extra=[shake("ear_l", 0.26, 0.86, 16, freq=4.2, axis=2), shake("ear_r", 0.26, 0.86, -16, freq=4.2, axis=2),
           shake("zombie_cheek", 0.26, 0.86, 10, freq=4.2, axis=1), shake("cheek_r", 0.26, 0.86, 10, freq=4.2, axis=1),
           shake("earring_r", 0.3, 0.9, 20, freq=4.2, axis=2)] + dangles(0.96, 7))

# ---------------------------------------------------------------- cackle: head thrown back, belly shaking with laughter
GATHER = add(r("chest", 10), r("head", 12), arm(1, -10, -6), arm(-1, -10, -6), lids(0.5), ears(-8),
             leg(1, -4, 8, -4), leg(-1, -4, 8, -4))
CACKLE = add(r("chest", -16), r("body", -4), r("head", -26), r("jaw", 34), lids(0.85), jowls(0.12),
             arm(1, -4, -22, 0, -52, -10), arm(-1, -4, -22, 0, -52, -10), ears(20), sc("belly", 0.06, 0.04, 0.08))
ANIM["cackle"] = timeline(1.5, [(0.0, REST, None), (0.14, GATHER, "ease"), (0.3, CACKLE, "out_back"),
                                (1.2, add(CACKLE, r("chest", 4), r("head", 6)), "ease"), (1.5, REST, "ease")],
                          extra=[shake("chest", 0.3, 1.25, 5, freq=6.5, axis=0),
                                 shake("head", 0.32, 1.27, 7, freq=6.5, axis=0),
                                 shake("jaw", 0.3, 1.25, 14, freq=6.5, axis=0),
                                 shake("belly", 0.3, 1.3, [0.08, -0.07, 0.08], freq=6.5, ch="scale"),
                                 shake("belly", 0.33, 1.3, 5, freq=6.5, axis=0),
                                 shake("arm_l", 0.3, 1.25, 6, freq=6.5, axis=0),
                                 shake("arm_r", 0.3, 1.25, 6, freq=6.5, axis=0),
                                 shake("ear_l", 0.34, 1.3, 16, freq=6.5, axis=2),
                                 shake("ear_r", 0.34, 1.3, -16, freq=6.5, axis=2),
                                 shake("zombie_cheek", 0.33, 1.3, [0.15, 0.1, 0.15], freq=6.5, ch="scale"),
                                 shake("cheek_r", 0.33, 1.3, [0.15, 0.1, 0.15], freq=6.5, ch="scale"),
                                 shake("backpack", 0.35, 1.3, 2.0, freq=6.5, axis=0),
                                 shake("backpack_lid", 0.35, 1.3, 7, freq=6.5, axis=0, phase=-1.0),
                                 shake("lantern", 0.35, 1.4, 10, freq=3.2, axis=2),
                                 shake("body", 0.3, 1.25, 3, freq=3.25, axis=2)],
                          lift=[[0, 0], [0.3, 0], [0.45, 0.6], [0.6, 0], [0.75, 0.6], [0.9, 0], [1.05, 0.5],
                                [1.2, 0], [1.5, 0]])

# ---------------------------------------------------------------- throw: wind up overhead, hurl, follow through
WIND = add(r("body", -4, -12), r("chest", -14, -26, -4), r("head", 4, 24, 4), arm(-1, -158, 18, 0, -64, -20),
           arm(1, -30, 24, 0, -20), leg(1, -18, 8, -6), leg(-1, 10, 10, -6), lids(-0.5), ears(-12),
           r("backpack", -4))
HURL = add(r("body", 6, 10), r("chest", 18, 22, 2), r("head", 6, -12), arm(-1, -52, 6, 0, -6, -20),
           arm(1, 10, 30, 0, -26), leg(1, -24, 16, -8), leg(-1, 14, 6, -6), lids(-0.7), ears(24), r("backpack", 8))
FOLLOW = add(r("body", 6, 14), r("chest", 22, 30, 4), r("head", 10, -18), arm(-1, 8, -12, 20, -16, 10),
             arm(1, 12, 30, 0, -26), leg(1, -24, 18, -8), leg(-1, 14, 6, -6), r("backpack", 6))
ANIM["throw"] = timeline(0.8, [(0.0, REST, None), (0.24, WIND, "out"), (0.3, add(WIND, arm(-1, -6)), "ease"),
                               (0.37, HURL, "in"), (0.46, FOLLOW, "out"), (0.8, REST, "ease")],
                         extra=dangles(0.4, 14) + [ring("belly", 0.4, 6, freq=6, axis=0),
                                                   ring("backpack_lid", 0.42, 14, freq=6, decay=6, axis=0)])

# ---------------------------------------------------------------- trade: holding something out, admiring it lovingly
L = 3.0
HOLD = add(arm(-1, -60, 24, 0, -16, -12), r("chest", -4, -10), r("head", 8, -24, 12), lids(-0.3), ears(10),
           r("jaw", 6), arm(1, -6, 8))
ANIM["trade"] = timeline(L, [(0.0, HOLD, None), (L, HOLD, None)], loop=True, extra=[
    osc("fist_r", "y", 26, 1, 0.0), osc("forearm_r", "x", -6, 2, 0.1),
    osc("head", "z", -9, 1, 0.12), osc("head", "y", -6, 1, 0.2), osc("head", "x", 3, 2, 0.3),
    osc("chest", "x", 2, 2, 0.0), osc("chest", "z", 3, 1, 0.1), osc("body", "z", 2, 1, 0.05),
    osc("belly", None, [0.04, 0.02, 0.05], 2, 0.1, ch="scale"),
    osc("ear_l", "z", 8, 2, 0.3), osc("ear_r", "z", -8, 2, 0.35),
    keys("lid_l", None, [[0, [0, 0, 0]], [1.9, [0, 0, 0]], [1.98, [0, 1.3, 0]], [2.08, [0, 0, 0]]], ch="scale"),
    keys("lid_r", None, [[0, [0, 0, 0]], [1.9, [0, 0, 0]], [1.98, [0, 1.3, 0]], [2.08, [0, 0, 0]]], ch="scale"),
    osc("arm_l", "z", 3, 1, 0.4),
] + sway_all(L, 0.8, 1, 0.2))

FEET = ["hoof_l", "hoof_r"]
spec = {
    "name": "Piglin Witch",
    "description": "The Winterworks Piglin Witch: an old, fat, half-zombified Piglin crone and happy drunk with a huge "
                   "belly, a red snout, droopy soul-fire eyes, saggy jowls, a ragged shawl, gold trinkets and a hip "
                   "flask, carrying a HUGE patched rucksack (pots, bottles, bones, a broom, a soul lantern). "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 3200, "colors": 160},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 20, "glow_parts": ["eye_l", "eye_r", "lantern_flame"], "glow_ramps": ["soul"]},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#2a1a1c", "hero": [-36, 16], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "piglin_witch.json")
    rest_on_ground(R.P, 1, FEET)
    ground_lock(spec, "body", FEET)
    dump(spec, out)
