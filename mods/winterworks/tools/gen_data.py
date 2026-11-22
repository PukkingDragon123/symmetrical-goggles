"""Writes Winterworks' JSON resources (sounds, models, blockstates, recipes, loot, tags, particles, lang).

    python3 mods/winterworks/tools/gen_data.py

Textures and entity models come from lowpix (examples/src/*.py, `python -m lowpix mc export`) and
examples/src/winterworks_art.py; this script only writes the data that points at them.
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RES = os.path.join(ROOT, "src", "main", "resources")
A = os.path.join(RES, "assets", "winterworks")
D = os.path.join(RES, "data")
M = "winterworks"


_TAGS = {}   # tag files written in this run: several area modules may add to the same tag


def write(path, obj):
    if os.sep + "tags" + os.sep in path and isinstance(obj, dict) and "values" in obj:
        merged = _TAGS.setdefault(path, [])
        for v in obj["values"]:
            if v not in merged:
                merged.append(v)
        obj = dict(obj, values=list(merged))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2)
        fh.write("\n")


# ------------------------------------------------------------------------------------------------ sounds
# Re-pitched vanilla sound files (no new audio): name -> [(file, pitch, volume)], subtitle
S = {
    "entity.icebreaker.ambient": ([("mob/polarbear/idle1", 0.55), ("mob/polarbear/idle2", 0.6), ("mob/polarbear/idle3", 0.5),
                                   ("mob/polarbear/idle4", 0.6)], "Icebreaker grunts"),
    "entity.icebreaker.hurt": ([("mob/polarbear/hurt1", 0.6), ("mob/polarbear/hurt2", 0.6), ("mob/polarbear/hurt3", 0.55)],
                               "Icebreaker hurts"),
    "entity.icebreaker.death": ([("mob/polarbear/death1", 0.55), ("mob/polarbear/death2", 0.5)], "Icebreaker dies"),
    "entity.icebreaker.roar": ([("mob/ravager/roar1", 0.75), ("mob/ravager/roar2", 0.75), ("mob/polarbear/warning1", 0.5)],
                               "Icebreaker bellows"),
    "entity.icebreaker.ram": ([("entity/player/attack/knockback1", 0.6), ("mob/zombie/wood1", 0.5), ("mob/zombie/wood2", 0.5)],
                              "Icebreaker rams"),
    "entity.icebreaker.happy": ([("mob/dolphin/play1", 0.7), ("mob/dolphin/play2", 0.7), ("mob/dolphin/eat1", 0.8)],
                                "Icebreaker chirps"),
    "entity.icebreaker.step": ([("mob/polarbear/step1", 0.6), ("mob/polarbear/step2", 0.6), ("mob/polarbear/step3", 0.6)],
                               None),
    "entity.icebreaker.slap": ([("mob/zombie/wood3", 1.4), ("block/powder_snow/step1", 0.6), ("entity/player/attack/knockback2", 1.3)],
                               "Icebreaker slaps"),
    "entity.icebreaker.splash": ([("random/splash", 0.7)], "Icebreaker splashes"),
    "block.ice.crack": ([("random/glass1", 0.6), ("random/glass2", 0.55), ("random/glass3", 0.65)], "Ice cracks"),
    "entity.icebreaker.shear": ([("mob/sheep/shear", 0.7), ("block/amethyst/break1", 0.8)], "Horn sheared"),
    "entity.icebreaker.horn_regrow": ([("block/amethyst/place1", 0.8), ("block/amethyst/place2", 0.7)], "Horn grows"),
    "item.snowball_launcher.fire": ([("random/bow", 1.6), ("tile/piston/out", 1.9)], "Launcher fires"),
    "item.snowball_launcher.charge": ([("item/crossbow/loading_middle1", 0.8), ("item/crossbow/loading_middle2", 0.8),
                                       ("tile/piston/in", 1.2)], "Launcher charges"),
    "item.snowball_launcher.heavy": ([("random/explode1", 1.7), ("random/explode2", 1.7)], "Launcher booms"),
    "item.snowball_launcher.overheat": ([("random/fizz", 0.7)], "Launcher overheats"),
    "item.snowball_launcher.empty": ([("random/click", 1.6)], "Launcher clicks"),
    "item.snowball_launcher.mode": ([("random/click", 0.8), ("tile/piston/in", 1.6)], "Launcher switches ammo"),
    "item.snowball_launcher.load": ([("block/powder_snow/step1", 1.4), ("block/powder_snow/step2", 1.5), ("random/click", 1.9)],
                                    "Launcher loads a snowball"),
    "effect.ramming.charged": ([("mob/ravager/roar3", 1.4)], "Ram charged"),
    "effect.ramming.impact": ([("entity/player/attack/knockback3", 0.7), ("mob/zombie/metal1", 0.6)], "Ram impact"),
    "entity.locomotive.whistle": ([("note/flute", 1.25), ("note/flute", 1.5)], "Locomotive whistles"),
    "entity.locomotive.chuff": ([("tile/piston/in", 0.5), ("random/fizz", 1.6)], None),
    "entity.dragon_locomotive.roar": ([("mob/enderdragon/growl1", 1.4), ("mob/enderdragon/growl2", 1.5)], "Dragon engine roars"),
    "block.lift_rail.clank": ([("block/chain/step1", 0.8), ("block/chain/step2", 0.8), ("block/chain/step3", 0.9)], None),
    "block.booster_rail.boost": ([("fireworks/launch1", 1.2), ("block/beacon/power1", 2.0)], "Booster rail whooshes"),
    "entity.minecart.couple": ([("block/chain/break1", 1.0), ("block/chain/break2", 1.1)], "Carts coupled"),
    "block.snow_globe.shake": ([("block/amethyst/shimmer", 1.3), ("block/powder_snow/step2", 1.6)], "Snow globe shakes"),
    # ---- Cold Zone placeholders (tools/sound_map.json replaces them with real sounds)
    "ambient.ice_caves.loop": ([("ambient/cave/cave1", 0.6)], None),
    "ambient.ice_caves.additions": ([("block/amethyst/shimmer", 0.6), ("random/glass1", 0.4)], None),
    "ambient.ice_caves.mood": ([("ambient/cave/cave13", 0.6)], None),
    "entity.player.shiver": ([("block/powder_snow/step1", 1.8)], "Teeth chatter"),
    "entity.player.overheat": ([("random/fizz", 1.0)], "Fur sizzles"),
    "block.ancient_ice.break": ([("random/glass1", 0.5), ("random/glass2", 0.5)], None),
    "block.ancient_ice.step": ([("step/stone1", 0.8)], None),
    "block.ancient_ice.place": ([("dig/stone1", 0.7)], None),
    "block.ancient_ice.hit": ([("step/stone2", 0.7)], None),
    "block.ancient_ice.fall": ([("step/stone3", 0.7)], None),
    "block.ancient_ice.burst": ([("random/explode1", 1.4), ("random/glass3", 0.6)], "Ancient ice bursts"),
    "block.ancient_ice.crack": ([("random/glass1", 0.4), ("random/glass2", 0.35)], "Ancient ice cracks"),
    "block.icicle.fall": ([("block/pointed_dripstone/land1", 1.3)], "Icicle falls"),
    "block.icicle.shatter": ([("random/glass2", 1.2), ("random/glass3", 1.3)], "Icicle shatters"),
    "event.frozen_tomb.rumble": ([("ambient/cave/cave10", 0.5)], "The cave rumbles"),
    "entity.frost_mauler.ambient": ([("mob/ravager/idle1", 0.5), ("mob/ravager/idle2", 0.5)], "Frost Mauler growls"),
    "entity.frost_mauler.hurt": ([("mob/ravager/hurt1", 0.55), ("mob/ravager/hurt2", 0.55)], "Frost Mauler hurts"),
    "entity.frost_mauler.death": ([("mob/ravager/death1", 0.5)], "Frost Mauler dies"),
    "entity.frost_mauler.roar": ([("mob/ravager/roar1", 0.5), ("mob/ravager/roar2", 0.5)], "Frost Mauler roars"),
    "entity.frost_mauler.claw": ([("entity/player/attack/sweep1", 0.6), ("entity/player/attack/sweep2", 0.6)], "Frost Mauler claws"),
    "entity.frost_mauler.bite": ([("mob/ravager/bite1", 0.7), ("mob/ravager/bite2", 0.7)], "Frost Mauler bites"),
    "entity.frost_mauler.fury": ([("mob/wolf/growl1", 0.5), ("mob/wolf/growl2", 0.5)], "Frost Mauler snarls"),
    "entity.frost_mauler.stunned": ([("mob/ravager/stun1", 0.6), ("mob/ravager/stun2", 0.6)], "Frost Mauler is stunned"),
    "entity.frost_mauler.step": ([("mob/ravager/step1", 0.6), ("mob/ravager/step2", 0.6)], None),
    "entity.frost_mauler.wake": ([("random/glass1", 0.5), ("mob/ravager/roar3", 0.5)], "Frost Mauler awakens"),
    "entity.frost_mauler.breath": ([("mob/polarbear/idle1", 0.4)], None),
    "entity.frost_mauler.explode": ([("random/explode2", 0.7)], "Frost Mauler bursts"),
    "entity.polar_bear.roar": ([("mob/polarbear/warning1", 0.8), ("mob/polarbear/warning2", 0.8)], "Polar bear roars"),
    "entity.polar_bear.leap": ([("mob/polarbear/warning3", 1.1)], "Polar bear leaps"),
    "entity.polar_bear.slam": ([("mob/ravager/step3", 0.8)], "Polar bear slams down"),
    "entity.polar_bear.munch": ([("random/eat1", 0.7), ("random/eat2", 0.7)], "Polar bear eats"),
    "entity.polar_bear.calm": ([("mob/polarbear/idle2", 1.1)], "Polar bear calms down"),
    "entity.polar_bear.shear": ([("mob/sheep/shear", 0.8)], "Polar bear shorn"),
    "entity.zombie_polar_bear.ambient": ([("mob/polarbear/idle3", 0.6), ("mob/zombie/say1", 0.5)], "Zombie polar bear groans"),
    "entity.zombie_polar_bear.hurt": ([("mob/polarbear/hurt1", 0.6)], "Zombie polar bear hurts"),
    "entity.zombie_polar_bear.death": ([("mob/polarbear/death1", 0.6)], "Zombie polar bear dies"),
    "entity.frost_zombie.ambient": ([("mob/zombie/say1", 0.8), ("mob/zombie/say2", 0.8)], "Frost Zombie groans"),
    "entity.frost_zombie.hurt": ([("mob/zombie/hurt1", 0.85)], "Frost Zombie hurts"),
    "entity.frost_zombie.death": ([("mob/zombie/death", 0.85)], "Frost Zombie dies"),
    "entity.frost_zombie.step": ([("block/powder_snow/step1", 0.9)], None),
    "item.armor.equip_fur": ([("item/armor/equip_leather1", 0.8), ("item/armor/equip_leather2", 0.8)], "Fur armour rustles"),
    "item.fang_dagger.slash": ([("entity/player/attack/sweep1", 1.6), ("entity/player/attack/sweep2", 1.7)], "Fang dagger slashes"),
    "item.fang_dagger.pounce": ([("entity/player/attack/sweep3", 1.1)], "Pounce"),
    "item.fang_dagger.crit": ([("random/glass1", 1.4), ("entity/player/attack/crit1", 1.2)], "Fang crit"),
    "item.fang_dagger.tired": ([("random/click", 0.6)], "Daggers tire"),
    "item.fang_dagger.ready": ([("block/amethyst/shimmer", 1.6)], "Daggers ready"),
    "block.frost_mauler_skull.ignite": ([("block/beacon/activate", 0.7)], "Skull eye glows"),
    "block.frost_mauler_skull.revive": ([("random/explode3", 0.7), ("mob/ravager/roar1", 0.5)], "The Frost Mauler returns"),
}


def sounds():
    """Real sounds from tools/sound_map.json (tools/sounds/build_sounds.py) win; the rest use re-pitched vanilla files."""
    real = {}
    smap = os.path.join(ROOT, "tools", "sound_map.json")
    if os.path.exists(smap):
        real = json.load(open(smap, encoding="utf-8"))
    known = None
    idx = "/tmp/claude-0/sounds_121.json"
    if os.path.exists(idx):
        known = {s.replace("minecraft/sounds/", "").replace(".ogg", "") for s in json.load(open(idx))}
    out = {}
    for name, (files, subtitle) in S.items():
        entries = []
        for f, pitch in files:
            if known is not None and f not in known:
                print("unknown vanilla sound", f, file=sys.stderr)
                continue
            entries.append({"name": "minecraft:" + f, "pitch": pitch})
        if name in real:
            entries = real[name]["sounds"]
            subtitle = real[name].get("subtitle", subtitle) or subtitle
        d = {"sounds": entries}
        if subtitle:
            d["subtitle"] = f"subtitles.{M}.{name}"
        out[name] = d
        S[name] = (files, subtitle)
    for name, e in real.items():   # events that only the sound map knows (registered in Java's WWSounds)
        if name not in out:
            d = {"sounds": e["sounds"]}
            if e.get("subtitle"):
                d["subtitle"] = f"subtitles.{M}.{name}"
                S[name] = ([], e["subtitle"])
            out[name] = d
    write(os.path.join(A, "sounds.json"), out)
    return {f"subtitles.{M}.{n}": sub for n, (_, sub) in S.items() if sub}


# ------------------------------------------------------------------------------------------------ models
def builtin_3d(particle, gui_scale=0.625, gui_rot=(30, 225, 0)):
    """An item drawn by a BuiltinItemRenderer in the item's 0..1 cube, with vanilla block-like display transforms."""
    s = lambda k: [k, k, k]  # noqa: E731
    return {"parent": "minecraft:builtin/entity", "gui_light": "side", "textures": {"particle": particle},
            "display": {
                "gui": {"rotation": list(gui_rot), "translation": [0, 0, 0], "scale": s(gui_scale)},
                "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": s(0.25)},
                "fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": s(0.5)},
                "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": s(0.375)},
                "thirdperson_lefthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": s(0.375)},
                "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 0, 0], "scale": s(0.4)},
                "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 0, 0], "scale": s(0.4)},
            }}


def item_models():
    gen = ["cobble_ball", "icebreaker_horn"]
    for n in gen:
        write(os.path.join(A, "models", "item", n + ".json"),
              {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/{n}"}})
    # the locomotives and carts show their own 3D model (client/express/CartItemRenderer), turned like a block
    for n in ("locomotive", "dragon_locomotive", "fox_cart", "zombie_cart"):
        write(os.path.join(A, "models", "item", n + ".json"), builtin_3d(f"{M}:item/{n}", 0.95, (25, 30, 0)))
    write(os.path.join(A, "models", "item", "heavy_shears.json"),
          {"parent": "minecraft:item/handheld", "textures": {"layer0": f"{M}:item/heavy_shears"}})
    write(os.path.join(A, "models", "item", "icebreaker_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})
    write(os.path.join(A, "models", "item", "snowball_launcher_icon.json"),
          {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/snowball_launcher"}})
    # the 3D launcher (drawn by LauncherItemRenderer): identity in the GUI so the 2D icon sits right; held much bigger
    # (0.4 fixes): a heavy gun in both first and third person
    write(os.path.join(A, "models", "item", "snowball_launcher.json"), {
        "parent": "minecraft:builtin/entity", "gui_light": "front",
        "textures": {"particle": "minecraft:block/iron_block"},
        "display": {
            "gui": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.5, 0.5, 0.5]},
            "fixed": {"rotation": [0, 90, 0], "translation": [0, 0, 0], "scale": [0.8, 0.8, 0.8]},
            "thirdperson_righthand": {"rotation": [90, 0, 0], "translation": [0, 3, -2], "scale": [0.78, 0.78, 0.78]},
            "thirdperson_lefthand": {"rotation": [90, 0, 0], "translation": [0, 3, -2], "scale": [0.78, 0.78, 0.78]},
            "firstperson_righthand": {"rotation": [0, -6, 0], "translation": [-1.0, 6.0, -1.5], "scale": [0.66, 0.66, 0.66]},
            "firstperson_lefthand": {"rotation": [0, 6, 0], "translation": [1.0, 6.0, -1.5], "scale": [0.66, 0.66, 0.66]},
            "head": {"rotation": [0, 180, 0], "translation": [0, 8, 0], "scale": [1, 1, 1]},
        }})
    write(os.path.join(A, "models", "item", "snow_globe.json"), {
        "parent": "minecraft:builtin/entity", "gui_light": "side",
        "textures": {"particle": "minecraft:block/glass"},
        "display": {
            "gui": {"rotation": [25, 45, 0], "translation": [0, -1.5, 0], "scale": [0.85, 0.85, 0.85]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [0.5, 0.5, 0.5]},
            "fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [0.8, 0.8, 0.8]},
            "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.4, 0.4, 0.4]},
            "thirdperson_lefthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.4, 0.4, 0.4]},
            "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 2, 0], "scale": [0.5, 0.5, 0.5]},
            "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 2, 0], "scale": [0.5, 0.5, 0.5]},
        }})
    write(os.path.join(A, "models", "block", "snow_globe.json"), {"textures": {"particle": "minecraft:block/glass"}})
    write(os.path.join(A, "blockstates", "snow_globe.json"), {"variants": {"": {"model": f"{M}:block/snow_globe"}}})


def rail_models():
    """Two stacked layers per rail: sleepers (tint 0: paint or oak brown) under the metal."""
    def layer(y, tex, tint, rot=None):
        faces = {"up": {"uv": [0, 0, 16, 16], "texture": tex}, "down": {"uv": [0, 16, 16, 0], "texture": tex}}
        if tint:
            for f in faces.values():
                f["tintindex"] = 0
        e = {"from": [0, y, 0], "to": [16, y, 16], "faces": faces}
        if rot is not None:
            e["rotation"] = {"origin": [8, 9, 8], "axis": "x", "angle": rot, "rescale": True}
        return e

    templates = {
        "template_rail_flat": [layer(1, "#ties", True), layer(1.01, "#rail", False)],
        "template_rail_raised_ne": [layer(9, "#ties", True, 45), layer(9.01, "#rail", False, 45)],
        "template_rail_raised_sw": [layer(9, "#ties", True, -45), layer(9.01, "#rail", False, -45)],
    }
    for name, els in templates.items():
        write(os.path.join(A, "models", "block", name + ".json"),
              {"ambientocclusion": False, "textures": {"particle": "#rail"}, "elements": els})

    def model(name, rail, ties, template):
        write(os.path.join(A, "models", "block", name + ".json"),
              {"parent": f"{M}:block/{template}", "textures": {"rail": f"{M}:block/{rail}", "ties": f"{M}:block/{ties}"}})

    # coaster: a 3D roller-coaster track (rails, ties, a girder spine); its three models and textures are written by
    # examples/src/winterworks_coaster_track.py, which also owns this shape -> (model, y rotation) mapping
    m = lambda n, y=0: ({"model": f"{M}:block/{n}", "y": y} if y else {"model": f"{M}:block/{n}"})  # noqa: E731
    write(os.path.join(A, "blockstates", "coaster_rail.json"), {"variants": {
        "shape=north_south": m("coaster_rail_straight"), "shape=east_west": m("coaster_rail_straight", 90),
        "shape=ascending_north": m("coaster_rail_ascending"), "shape=ascending_east": m("coaster_rail_ascending", 90),
        "shape=ascending_south": m("coaster_rail_ascending", 180),
        "shape=ascending_west": m("coaster_rail_ascending", 270),
        "shape=south_east": m("coaster_rail_corner"), "shape=south_west": m("coaster_rail_corner", 90),
        "shape=north_west": m("coaster_rail_corner", 180), "shape=north_east": m("coaster_rail_corner", 270)}})
    for rail in ("booster_rail", "lift_rail", "trap_rail", "drop_rail"):
        ties = rail + "_ties"
        for on in ("", "_on"):
            tex = rail if (on and rail == "drop_rail") else rail + on
            model(rail + on, tex, ties, "template_rail_flat")
            model(rail + on + "_raised_ne", tex, ties, "template_rail_raised_ne")
            model(rail + on + "_raised_sw", tex, ties, "template_rail_raised_sw")
        v = {}
        for powered, on in (("false", ""), ("true", "_on")):
            v[f"powered={powered},shape=north_south"] = m(rail + on)
            v[f"powered={powered},shape=east_west"] = m(rail + on, 90)
            v[f"powered={powered},shape=ascending_east"] = m(rail + on + "_raised_ne", 90)
            v[f"powered={powered},shape=ascending_west"] = m(rail + on + "_raised_sw", 90)
            v[f"powered={powered},shape=ascending_north"] = m(rail + on + "_raised_ne")
            v[f"powered={powered},shape=ascending_south"] = m(rail + on + "_raised_sw")
        write(os.path.join(A, "blockstates", rail + ".json"), {"variants": v})
    # the open Drop Rail: a hazard-striped frame (tinted like the sleepers) round an empty hole
    write(os.path.join(A, "models", "block", "drop_rail_open.json"), {"ambientocclusion": False,
        "textures": {"frame": f"{M}:block/drop_rail_frame", "particle": f"{M}:block/drop_rail_frame"},
        "elements": [{"from": [0, 1, 0], "to": [16, 1, 16], "faces": {
            "up": {"uv": [0, 0, 16, 16], "texture": "#frame"}, "down": {"uv": [0, 16, 16, 0], "texture": "#frame"}}}]})
    write(os.path.join(A, "blockstates", "drop_rail_open.json"), {"variants": {
        "along_x=false": {"model": f"{M}:block/drop_rail_open"}, "along_x=true": {"model": f"{M}:block/drop_rail_open", "y": 90}}})
    for rail in ("coaster_rail", "booster_rail", "lift_rail", "trap_rail", "drop_rail"):
        write(os.path.join(A, "models", "item", rail + ".json"),
              {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:block/{rail}_ties", "layer1": f"{M}:block/{rail}"}})
    # ---- 0.4 fixes: rails
    # Coaster Loop: no block model of its own (client/express/CoasterLoopRenderer draws the loop), only break particles
    write(os.path.join(A, "models", "block", "coaster_loop.json"), {"textures": {"particle": f"{M}:block/coaster_track_rail"}})
    write(os.path.join(A, "blockstates", "coaster_loop.json"), {"variants": {
        "shape=north_south": m("coaster_loop"), "shape=east_west": m("coaster_loop", 90)}})
    write(os.path.join(A, "models", "item", "coaster_loop.json"), builtin_3d(f"{M}:block/coaster_track_rail", 0.95, (15, 120, 0)))
    # Switch Rail: the art's models are drawn toe-south (y 0); FACING points from the toe to the fork. The points
    # (SHAPE: straight on, or the curve onto the branch) pick the model: _on is set to the branch, lamp lit.
    # Multipart, so the shapes a switch can never take (express/SwitchRailBlock keeps them consistent) draw nothing.
    yrot = {"north": 0, "east": 90, "south": 180, "west": 270}
    opp = {"north": "south", "south": "north", "east": "west", "west": "east"}
    ccw = {"north": "west", "west": "south", "south": "east", "east": "north"}
    cw = {v: k for k, v in ccw.items()}
    parts = []
    for facing, y in yrot.items():
        for branch in ("left", "right"):
            toe, b = opp[facing], (ccw if branch == "left" else cw)[facing]
            n, e = "north" in (toe, b), "east" in (toe, b)
            curve = ("north_" if n else "south_") + ("east" if e else "west")
            straight = "north_south" if facing in ("north", "south") else "east_west"
            for shape, model in ((straight, f"switch_rail_{branch}"), (curve, f"switch_rail_{branch}_on")):
                parts.append({"when": {"facing": facing, "branch": branch, "shape": shape}, "apply": m(model, y)})
    write(os.path.join(A, "blockstates", "switch_rail.json"), {"multipart": parts})


def particles():
    write(os.path.join(A, "particles", "globe_snow.json"), {"textures": [f"{M}:globe_snow_{i}" for i in range(4)]})
    write(os.path.join(A, "particles", "stun_star.json"), {"textures": [f"{M}:stun_star_{i}" for i in range(4)]})


# ------------------------------------------------------------------------------------------------ data
def shaped(name, pattern, key, result, count=1, ns=M):
    k = {c: ({"tag": v[1:]} if v.startswith("#") else {"item": v}) for c, v in key.items()}
    write(os.path.join(D, ns, "recipe", name + ".json"), {"type": "minecraft:crafting_shaped", "category": "misc",
                                                         "pattern": pattern, "key": k,
                                                         "result": {"id": result, "count": count}})


def shapeless(name, items, result, count=1):
    ing = [({"tag": v[1:]} if v.startswith("#") else {"item": v}) for v in items]
    write(os.path.join(D, M, "recipe", name + ".json"), {"type": "minecraft:crafting_shapeless", "category": "misc",
                                                        "ingredients": ing, "result": {"id": result, "count": count}})


def recipes():
    shaped("snowball_launcher", ["RHR", "IDI", "IBI"], {"R": "minecraft:redstone", "H": "minecraft:hopper",
           "I": "minecraft:iron_ingot", "D": "minecraft:dispenser", "B": "minecraft:blaze_rod"}, f"{M}:snowball_launcher")
    shapeless("cobble_ball", ["minecraft:cobblestone"], f"{M}:cobble_ball", 2)
    shaped("heavy_shears", [" D ", "BSB", " D "], {"D": "minecraft:diamond", "B": "minecraft:iron_block",
           "S": "minecraft:shears"}, f"{M}:heavy_shears")
    shaped("coaster_rail", ["IGI", "ISI", "IGI"], {"I": "minecraft:iron_ingot", "G": "minecraft:gold_nugget",
           "S": "minecraft:stick"}, f"{M}:coaster_rail", 32)
    shaped("booster_rail", ["GRG", "GSG", "GRG"], {"G": "minecraft:gold_ingot", "R": "minecraft:redstone",
           "S": "minecraft:stick"}, f"{M}:booster_rail", 12)
    shaped("lift_rail", ["ICI", "IRI", "ICI"], {"I": "minecraft:iron_ingot", "C": "minecraft:chain",
           "R": "minecraft:redstone"}, f"{M}:lift_rail", 12)
    # cheaper vanilla rails (data-pack override of the vanilla recipes)
    shaped("rail", ["I I", "ISI", "I I"], {"I": "minecraft:iron_ingot", "S": "minecraft:stick"}, "minecraft:rail", 32, "minecraft")
    shaped("powered_rail", ["G G", "GSG", "GRG"], {"G": "minecraft:gold_ingot", "S": "minecraft:stick",
           "R": "minecraft:redstone"}, "minecraft:powered_rail", 12, "minecraft")
    shaped("trap_rail", ["IPI", "ISI", "IRI"], {"I": "minecraft:iron_ingot", "P": "minecraft:sticky_piston",
           "S": "minecraft:stick", "R": "minecraft:redstone"}, f"{M}:trap_rail", 6)
    shaped("drop_rail", ["ITI", "ISI", "IRI"], {"I": "minecraft:iron_ingot", "T": "minecraft:iron_trapdoor",
           "S": "minecraft:stick", "R": "minecraft:redstone"}, f"{M}:drop_rail", 6)
    shaped("locomotive", ["I  ", "FMF", "III"], {"I": "minecraft:iron_ingot", "F": "minecraft:furnace",
           "M": "minecraft:minecart"}, f"{M}:locomotive")
    shapeless("dragon_locomotive", [f"{M}:locomotive", "minecraft:blaze_powder", "minecraft:gold_ingot",
              "minecraft:fire_charge"], f"{M}:dragon_locomotive")
    shapeless("fox_cart", ["minecraft:minecart", "minecraft:orange_wool", "minecraft:white_wool", "minecraft:sweet_berries"],
              f"{M}:fox_cart")
    shapeless("zombie_cart", ["minecraft:minecart", "minecraft:rotten_flesh", "minecraft:rotten_flesh", "minecraft:rotten_flesh"],
              f"{M}:zombie_cart")
    shaped("snow_globe", ["GGG", "GSG", "SSS"], {"G": "minecraft:glass", "S": "minecraft:snowball"}, f"{M}:snow_globe")
    # ---- 0.4 fixes: rails
    shaped("coaster_loop", ["CCC", "CIC", "CCC"], {"C": f"{M}:coaster_rail", "I": "minecraft:iron_block"}, f"{M}:coaster_loop")
    shaped("switch_rail", ["I I", "IRI", "ITI"], {"I": "minecraft:iron_ingot", "R": "minecraft:rail",
           "T": "minecraft:redstone_torch"}, f"{M}:switch_rail", 2)


def loot():
    write(os.path.join(D, M, "loot_table", "blocks", "drop_rail_open.json"), {"type": "minecraft:block", "pools": [{
        "rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:drop_rail"}],
        "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
    for b in ("coaster_rail", "booster_rail", "lift_rail", "trap_rail", "drop_rail", "snow_globe", "coaster_loop", "switch_rail"):
        write(os.path.join(D, M, "loot_table", "blocks", b + ".json"), {"type": "minecraft:block", "pools": [{
            "rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:{b}"}],
            "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
    write(os.path.join(D, M, "loot_table", "entities", "icebreaker.json"), {"type": "minecraft:entity", "pools": [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:cod", "functions": [
            {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 1, "max": 3}},
            {"function": "minecraft:furnace_smelt", "conditions": [{"condition": "minecraft:entity_properties",
                                                                   "entity": "this", "predicate": {"flags": {"is_on_fire": True}}}]},
            {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
             "count": {"type": "minecraft:uniform", "min": 0, "max": 1}}]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:snowball", "functions": [
            {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 0, "max": 4}}]}]}]})


def tags():
    rails = [f"{M}:coaster_rail", f"{M}:booster_rail", f"{M}:lift_rail", f"{M}:trap_rail", f"{M}:drop_rail",
             f"{M}:coaster_loop", f"{M}:switch_rail"]
    write(os.path.join(D, "minecraft", "tags", "block", "rails.json"), {"replace": False, "values": rails})
    write(os.path.join(D, "minecraft", "tags", "item", "rails.json"), {"replace": False, "values": rails})
    write(os.path.join(D, "minecraft", "tags", "block", "mineable", "pickaxe.json"),
          {"replace": False, "values": rails + [f"{M}:drop_rail_open"]})


def lang(subtitles):
    L = os.path.join(ROOT, "lang")
    write(os.path.join(L, "sounds.json"), subtitles)
    write(os.path.join(L, "launcher.json"), {
        "item.winterworks.snowball_launcher": "Snowball Launcher",
        "item.winterworks.snowball_launcher.mode.0": "Ammo: packed snowballs (rapid fire, stuns)",
        "item.winterworks.snowball_launcher.mode.1": "Ammo: cobblestone balls (hold to charge, heavy)",
        "item.winterworks.snowball_launcher.tip": "Hold use to fire. Sneak + use switches ammo. Don't let it overheat!",
        "item.winterworks.cobble_ball": "Cobblestone Ball",
        "entity.winterworks.ice_shot": "Packed Snowball",
        "entity.winterworks.cobble_ball": "Cobblestone Ball",
        "effect.winterworks.stunned": "Stunned",
    })
    write(os.path.join(L, "icebreaker.json"), {
        "entity.winterworks.icebreaker": "Icebreaker",
        "item.winterworks.icebreaker_spawn_egg": "Icebreaker Spawn Egg",
        "item.winterworks.icebreaker_horn": "Icebreaker Horn",
        "item.winterworks.heavy_shears": "Heavy Shears",
        "item.winterworks.heavy_shears.tip": "Cuts whole canopies of leaves, gets more wool, and can take an Icebreaker's horn",
        "effect.winterworks.ramming": "Ramming",
        "item.minecraft.potion.effect.ramming": "Potion of Ramming",
        "item.minecraft.splash_potion.effect.ramming": "Splash Potion of Ramming",
        "item.minecraft.lingering_potion.effect.ramming": "Lingering Potion of Ramming",
        "item.minecraft.tipped_arrow.effect.ramming": "Arrow of Ramming",
    })
    write(os.path.join(L, "express.json"), {
        "item.winterworks.locomotive": "Iron Locomotive",
        "item.winterworks.dragon_locomotive": "Dragon-Head Locomotive",
        "item.winterworks.fox_cart": "Fox Cart",
        "item.winterworks.zombie_cart": "Zombie Cart",
        "entity.winterworks.locomotive": "Iron Locomotive",
        "entity.winterworks.dragon_locomotive": "Dragon-Head Locomotive",
        "entity.winterworks.fox_cart": "Fox Cart",
        "entity.winterworks.zombie_cart": "Zombie Cart",
        "entity.winterworks.locomotive.throttle.0": "Reverse",
        "entity.winterworks.locomotive.throttle.1": "Stopped",
        "entity.winterworks.locomotive.throttle.2": "Full steam ahead!",
        "block.winterworks.coaster_rail": "Coaster Rail",
        "block.winterworks.booster_rail": "Booster Rail",
        "block.winterworks.lift_rail": "Chain Lift Rail",
        "block.winterworks.trap_rail": "Trap Rail",
        "block.winterworks.drop_rail": "Drop Rail",
        "block.winterworks.drop_rail_open": "Open Drop Rail",
        "block.winterworks.coaster_loop": "Coaster Loop",
        "block.winterworks.switch_rail": "Switch Rail",
        "message.winterworks.couple.first": "Now click the cart behind it",
        "message.winterworks.couple.too_far": "Too far apart to couple",
        "message.winterworks.couple.taken": "That coupler is already in use",
        "message.winterworks.couple.loop": "Can't couple a train into a loop",
        "message.winterworks.couple.done": "Coupled! Train length: %s",
    })
    write(os.path.join(L, "globe.json"), {"block.winterworks.snow_globe": "Snow Globe"})


class Ctx:
    """What the per-area data modules (tools/data_*.py) get: paths and writers."""
    ROOT, RES, A, D, M = ROOT, RES, A, D, M
    L = os.path.join(ROOT, "lang")
    write = staticmethod(write)
    shaped = staticmethod(shaped)
    shapeless = staticmethod(shapeless)


def areas():
    """The Cold Zone areas each keep their data in their own module (docs/COLD_UPDATE.md)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import importlib
    for name in ("data_cold", "data_boss", "data_bear", "data_dagger", "data_archaeology", "data_amber", "data_golem", "data_hex", "data_curses", "data_nether",
                 "data_end_world", "data_end_mobs", "data_end_gear", "data_end_boss", "data_harvester"):
        importlib.import_module(name).run(Ctx)


if __name__ == "__main__":
    subs = sounds()
    item_models()
    rail_models()
    particles()
    recipes()
    loot()
    tags()
    lang(subs)
    areas()
    print("resources written")
