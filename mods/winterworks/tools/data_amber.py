"""Data for the amber area of the Amber Age update (docs/AMBER_UPDATE.md sections 4-8, docs/HEXES_UPDATE.md section 10):
amber, fossils, Amberwood (and its blooms), blood, mosquitoes and sniffers. Called by gen_data.py with ctx = gen_data.Ctx.

Blockstates and models, item models, recipes, loot tables, tags, the Amberwood features, placeholder sounds for
the amber sound events that sounds.json doesn't map yet, and lang/amber.json.
"""
import json
import os

LOGS = ("amberwood_log", "petrified_log")

# entities whose blood a mosquito can't drink (undead are skipped by #minecraft:undead)
BLOODLESS = ["minecraft:iron_golem", "minecraft:snow_golem", "minecraft:slime", "minecraft:magma_cube", "minecraft:blaze",
             "minecraft:breeze", "minecraft:enderman", "minecraft:endermite", "minecraft:shulker", "minecraft:vex",
             "minecraft:allay", "minecraft:armor_stand", "winterworks:pot_golem", "winterworks:frost_mauler"]

# Re-pitched vanilla sounds for the amber events, used only while sounds.json has no entry for them
# (gen_data.S / tools/sound_map.json win as soon as they map one): name -> ([(file, pitch)], subtitle)
PLACEHOLDER_SOUNDS = {
    "entity.mosquito.buzz": ([("mob/bee/loop1", 1.9), ("mob/bee/loop2", 2.0), ("mob/bee/loop3", 1.95)], "Mosquito whines"),
    "entity.mosquito.stab": ([("mob/bee/sting", 1.5)], "Mosquito stabs"),
    "entity.mosquito.drink": ([("item/bottle/drink_honey1", 1.6), ("item/bottle/drink_honey2", 1.7)], "Mosquito drinks"),
    "entity.mosquito.spit": ([("mob/llama/spit1", 1.6), ("mob/llama/spit2", 1.7)], "Mosquito spits amber"),
    "entity.mosquito.hurt": ([("mob/bee/hurt1", 1.8), ("mob/bee/hurt2", 1.8), ("mob/bee/hurt3", 1.9)], "Mosquito hurts"),
    "entity.mosquito.death": ([("mob/bee/death1", 1.8), ("mob/bee/death2", 1.8)], "Mosquito dies"),
    "block.amber.release": ([("block/amethyst/break1", 0.7), ("block/amethyst/break2", 0.75), ("random/glass2", 0.8)],
                            "Amber cracks open"),
    "item.blood.splash": ([("block/honeyblock/break1", 0.6), ("block/honeyblock/break2", 0.6), ("mob/slime/small1", 0.6)],
                          "Blood splashes"),
    "entity.sniffer.tame": ([("mob/sniffer/happy1", 1.0), ("mob/sniffer/happy2", 1.05), ("mob/sniffer/happy3", 0.95)],
                            "Sniffer is tamed"),
}


def run(ctx):
    M = ctx.M
    w = ctx.write
    A, D = ctx.A, ctx.D

    def block_model(name, obj):
        w(os.path.join(A, "models", "block", name + ".json"), obj)

    def blockstate(name, obj):
        w(os.path.join(A, "blockstates", name + ".json"), obj)

    def item_model(name, obj):
        w(os.path.join(A, "models", "item", name + ".json"), obj)

    def cube(name, tex=None):
        block_model(name, {"parent": "minecraft:block/cube_all", "textures": {"all": f"{M}:block/{tex or name}"}})

    def ref(name, **rot):
        return dict({"model": f"{M}:block/{name}"}, **rot)

    # ---------------------------------------------------------------------------------------- blockstates and models
    # amber: you can see what's inside
    for inc, tex in (("none", "amber_block"), ("seed", "amber_block_seed"), ("mosquito", "amber_block_mosquito")):
        cube(tex)
    blockstate("amber_block", {"variants": {"inclusion=none": ref("amber_block"), "inclusion=seed": ref("amber_block_seed"),
                                            "inclusion=mosquito": ref("amber_block_mosquito")}})
    # amber fossil: brushed like suspicious gravel
    for d in range(4):
        cube(f"amber_fossil_{d}")
    blockstate("amber_fossil", {"variants": {f"dusted={d}": ref(f"amber_fossil_{d}") for d in range(4)}})

    # pillars: petrified and amberwood logs (the amberwood one oozes resin)
    def pillar(model, side, end):
        tex = {"end": f"{M}:block/{end}", "side": f"{M}:block/{side}"}
        block_model(model, {"parent": "minecraft:block/cube_column", "textures": tex})
        block_model(model + "_horizontal", {"parent": "minecraft:block/cube_column_horizontal", "textures": tex})

    def axes(model):
        return {"x": ref(model + "_horizontal", x=90, y=90), "y": ref(model), "z": ref(model + "_horizontal", x=90)}

    pillar("petrified_log", "petrified_log", "petrified_log_top")
    blockstate("petrified_log", {"variants": {f"axis={a}": v for a, v in axes("petrified_log").items()}})
    pillar("amberwood_log", "amberwood_log", "amberwood_log_top")
    pillar("amberwood_log_resin", "amberwood_log_resin", "amberwood_log_top")
    v = {}
    for resin, model in (("false", "amberwood_log"), ("true", "amberwood_log_resin")):
        for a, var in axes(model).items():
            v[f"axis={a},resin={resin}"] = var
    blockstate("amberwood_log", {"variants": v})

    # glowing amber-gold leaves: no foliage tint, so cube_all rather than block/leaves
    cube("amberwood_leaves")
    blockstate("amberwood_leaves", {"variants": {"": ref("amberwood_leaves")}})
    block_model("amberwood_sapling", {"parent": "minecraft:block/cross", "textures": {"cross": f"{M}:block/amberwood_sapling"}})
    blockstate("amberwood_sapling", {"variants": {"": ref("amberwood_sapling")}})
    # the glowing flowers on top of every Amberwood column
    # (vanilla's cross, plus a flat crown seen from above: block/amberwood_bloom_top)
    cross = lambda frm, to, faces: {"from": frm, "to": to, "shade": False,  # noqa: E731
                                    "rotation": {"origin": [8, 8, 8], "axis": "y", "angle": 45, "rescale": True},
                                    "faces": {f: {"uv": [0, 0, 16, 16], "texture": "#cross"} for f in faces}}
    block_model("amberwood_bloom", {
        "ambientocclusion": False,
        "textures": {"particle": f"{M}:block/amberwood_bloom", "cross": f"{M}:block/amberwood_bloom",
                     "top": f"{M}:block/amberwood_bloom_top"},
        "elements": [cross([0.8, 0, 8], [15.2, 16, 8], ("north", "south")), cross([8, 0, 0.8], [8, 16, 15.2], ("west", "east")),
                     {"from": [1, 12, 1], "to": [15, 12, 15], "shade": False, "faces": {
                         "up": {"uv": [0, 0, 16, 16], "texture": "#top"}, "down": {"uv": [0, 16, 16, 0], "texture": "#top"}}}]})
    blockstate("amberwood_bloom", {"variants": {"": ref("amberwood_bloom")}})
    cube("amberwood_planks")
    blockstate("amberwood_planks", {"variants": {"": ref("amberwood_planks")}})

    # blood stain: a single face just above the floor, turned at random
    block_model("blood_stain", {
        "ambientocclusion": False,
        "textures": {"particle": f"{M}:block/blood_stain", "stain": f"{M}:block/blood_stain"},
        "elements": [{"from": [0, 0.25, 0], "to": [16, 0.25, 16], "shade": False, "faces": {
            "up": {"uv": [0, 0, 16, 16], "texture": "#stain"},
            "down": {"uv": [0, 16, 16, 0], "texture": "#stain", "cullface": "down"}}}]})
    blockstate("blood_stain", {"variants": {"": [ref("blood_stain"), ref("blood_stain", y=90), ref("blood_stain", y=180),
                                                 ref("blood_stain", y=270)]}})

    # ---------------------------------------------------------------------------------------- item models
    for name in ("amber_chunk", "amberwood_seed"):
        item_model(name, {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/{name}"}})
    item_model("amberwood_bloom", {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/amberwood_bloom"}})
    item_model("mosquito_spawn_egg", {"parent": "minecraft:item/template_spawn_egg"})
    for item, model in (("amber_block", "amber_block"), ("amber_fossil", "amber_fossil_0"), ("petrified_log", "petrified_log"),
                        ("amberwood_log", "amberwood_log"), ("amberwood_leaves", "amberwood_leaves"),
                        ("amberwood_planks", "amberwood_planks")):
        item_model(item, {"parent": f"{M}:block/{model}"})

    # ---------------------------------------------------------------------------------------- recipes
    ctx.shaped("amber_block", ["##", "##"], {"#": f"{M}:amber_chunk"}, f"{M}:amber_block")
    ctx.shapeless("amberwood_planks", [f"{M}:amberwood_log"], f"{M}:amberwood_planks", 4)

    # ---------------------------------------------------------------------------------------- loot tables
    def block_loot(name, pools):
        w(os.path.join(D, M, "loot_table", "blocks", name + ".json"), {"type": "minecraft:block", "pools": pools})

    def drops(item):
        return [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:item", "name": item}],
                 "conditions": [{"condition": "minecraft:survives_explosion"}]}]

    for b in ("amber_block", "petrified_log", "amberwood_log", "amberwood_planks"):
        block_loot(b, drops(f"{M}:{b}"))   # amber drops as plain amber; logs lose their resin
    block_loot("amberwood_sapling", drops(f"{M}:amberwood_seed"))
    block_loot("amberwood_bloom", drops(f"{M}:amberwood_bloom"))
    block_loot("amber_fossil", [])   # like suspicious gravel: only brushing gets anything out
    block_loot("blood_stain", [])
    shears_or_silk = {"condition": "minecraft:any_of", "terms": [
        {"condition": "minecraft:match_tool", "predicate": {"items": "minecraft:shears"}},
        {"condition": "minecraft:match_tool", "predicate": {"predicates": {"minecraft:enchantments": [
            {"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}]}
    block_loot("amberwood_leaves", [
        {"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:alternatives", "children": [
            {"type": "minecraft:item", "name": f"{M}:amberwood_leaves", "conditions": [shears_or_silk]},
            {"type": "minecraft:item", "name": f"{M}:amberwood_seed", "conditions": [
                {"condition": "minecraft:survives_explosion"},
                {"condition": "minecraft:table_bonus", "enchantment": "minecraft:fortune",
                 "chances": [0.05, 0.0625, 0.083333336, 0.1]}]}]}]},
        {"rolls": 1, "bonus_rolls": 0, "conditions": [{"condition": "minecraft:inverted", "term": shears_or_silk}], "entries": [
            {"type": "minecraft:item", "name": "minecraft:stick", "conditions": [
                {"condition": "minecraft:table_bonus", "enchantment": "minecraft:fortune",
                 "chances": [0.02, 0.022222223, 0.025, 0.033333335, 0.1]}],
             "functions": [{"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 1, "max": 2}},
                           {"function": "minecraft:explosion_decay"}]}]}])
    w(os.path.join(D, M, "loot_table", "entities", "mosquito.json"), {"type": "minecraft:entity", "pools": []})

    # sniffer digging gains these (amber.AmberFeature adds the table to minecraft:gameplay/sniffer_digging)
    def item(name, weight, count=None):
        e = {"type": "minecraft:item", "name": name, "weight": weight}
        if count:
            e["functions"] = [{"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": count[0],
                                                                             "max": count[1]}}]
        return e

    w(os.path.join(D, M, "loot_table", "gameplay", "sniffer_finds.json"), {"type": "minecraft:gift", "pools": [
        {"rolls": 1, "bonus_rolls": 0, "entries": [
            item(f"{M}:amberwood_seed", 6), item(f"{M}:amber_chunk", 8, (1, 2)), item("minecraft:bone", 8, (1, 3))]
         + [item(f"minecraft:{s}_pottery_sherd", 1) for s in ("blade", "miner", "archer", "howl", "danger", "skull")]}]})

    # ---------------------------------------------------------------------------------------- tags
    def tag(path, values):
        w(os.path.join(D, *path) + ".json", {"replace": False, "values": values})

    def merge_tag(path, values):
        """Tags another module also writes (mineable/pickaxe from gen_data.tags): add ours to what is there."""
        p = os.path.join(D, *path) + ".json"
        old = json.load(open(p, encoding="utf-8")).get("values", []) if os.path.exists(p) else []
        w(p, {"replace": False, "values": old + [x for x in values if x not in old]})

    for kind in ("block", "item"):
        tag(["minecraft", "tags", kind, "logs_that_burn"], [f"{M}:amberwood_log"])
        tag(["minecraft", "tags", kind, "leaves"], [f"{M}:amberwood_leaves"])
        tag(["minecraft", "tags", kind, "planks"], [f"{M}:amberwood_planks"])
    tag(["minecraft", "tags", "block", "saplings"], [f"{M}:amberwood_sapling"])
    tag(["minecraft", "tags", "item", "saplings"], [f"{M}:amberwood_seed"])
    tag(["minecraft", "tags", "block", "mineable", "axe"], [f"{M}:amberwood_log", f"{M}:amberwood_planks"])
    tag(["minecraft", "tags", "block", "mineable", "hoe"], [f"{M}:amberwood_leaves", f"{M}:amberwood_bloom"])
    tag(["minecraft", "tags", "block", "mineable", "shovel"], [f"{M}:amber_fossil"])
    merge_tag(["minecraft", "tags", "block", "mineable", "pickaxe"], [f"{M}:amber_block", f"{M}:petrified_log"])
    tag([M, "tags", "entity_type", "bloodless"], BLOODLESS)

    # ---------------------------------------------------------------------------------------- the Amberwood
    # a saguaro-like column with arms and blooms on top: the Java feature winterworks:amberwood (amber.AmberwoodFeature)
    W = os.path.join(D, M, "worldgen")
    w(os.path.join(W, "configured_feature", "amberwood.json"), {"type": f"{M}:amberwood", "config": {}})
    w(os.path.join(W, "placed_feature", "amberwood.json"), {"feature": f"{M}:amberwood", "placement": [
        {"type": "minecraft:block_predicate_filter", "predicate": {
            "type": "minecraft:would_survive", "state": {"Name": f"{M}:amberwood_sapling", "Properties": {"stage": "0"}}}}]})

    # ---------------------------------------------------------------------------------------- sounds and lang
    subtitles = placeholder_sounds(ctx)
    lang = {
        "block.winterworks.amber_block": "Block of Amber",
        "block.winterworks.amber_fossil": "Amber Fossil",
        "block.winterworks.petrified_log": "Petrified Log",
        "block.winterworks.amberwood_log": "Amberwood Log",
        "block.winterworks.amberwood_leaves": "Amberwood Leaves",
        "block.winterworks.amberwood_sapling": "Amberwood Sapling",
        "block.winterworks.amberwood_planks": "Amberwood Planks",
        "block.winterworks.amberwood_bloom": "Amberwood Bloom",
        "block.winterworks.blood_stain": "Blood Stain",
        "item.winterworks.amber_chunk": "Amber Chunk",
        "item.winterworks.amberwood_seed": "Amberwood Seed",
        "item.winterworks.mosquito_spawn_egg": "Mosquito Spawn Egg",
        "entity.winterworks.mosquito": "Mosquito",
        "effect.winterworks.immunity": "Immunity",
        "item.minecraft.potion.effect.blood": "Potion of Blood",
        "item.minecraft.splash_potion.effect.blood": "Splash Potion of Blood",
        "item.minecraft.lingering_potion.effect.blood": "Lingering Potion of Blood",
        "item.minecraft.tipped_arrow.effect.blood": "Arrow of Blood",
        "item.minecraft.potion.effect.immunity": "Potion of Immunity",
        "item.minecraft.splash_potion.effect.immunity": "Splash Potion of Immunity",
        "item.minecraft.lingering_potion.effect.immunity": "Lingering Potion of Immunity",
        "item.minecraft.tipped_arrow.effect.immunity": "Arrow of Immunity",
    }
    lang.update(subtitles)
    w(os.path.join(ctx.L, "amber.json"), lang)


def placeholder_sounds(ctx):
    """Adds the amber sound events that sounds.json doesn't have yet; returns the subtitles for those (only)."""
    path = os.path.join(ctx.A, "sounds.json")
    sounds = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    subs = {}
    added = False
    for name, (files, subtitle) in PLACEHOLDER_SOUNDS.items():
        if name in sounds:
            continue
        sounds[name] = {"sounds": [{"name": "minecraft:" + f, "pitch": p} for f, p in files],
                        "subtitle": f"subtitles.{ctx.M}.{name}"}
        subs[f"subtitles.{ctx.M}.{name}"] = subtitle
        added = True
    if added:
        ctx.write(path, sounds)
    return subs
