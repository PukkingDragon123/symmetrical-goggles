"""Data for the amber area of the Amber Age update (docs/AMBER_UPDATE.md sections 4-8, docs/HEXES_UPDATE.md section 10,
docs/FIXES_0_4.md "Amber"): amber, shards, fossils, amber sand and gravel, the Amberwood wood set (and its blooms, which
are its saplings), blood, mosquitoes and sniffers. Called by gen_data.py with ctx = gen_data.Ctx.

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

# the Amberwood wood set (docs/FIXES_0_4.md): id -> English name, in vanilla's creative order
WOOD_SET = {
    "amberwood_log": "Amberwood Log", "amberwood_wood": "Amberwood Wood", "stripped_amberwood_log": "Stripped Amberwood Log",
    "stripped_amberwood_wood": "Stripped Amberwood Wood", "amberwood_planks": "Amberwood Planks",
    "amberwood_stairs": "Amberwood Stairs", "amberwood_slab": "Amberwood Slab", "amberwood_fence": "Amberwood Fence",
    "amberwood_fence_gate": "Amberwood Fence Gate", "amberwood_door": "Amberwood Door", "amberwood_trapdoor": "Amberwood Trapdoor",
    "amberwood_pressure_plate": "Amberwood Pressure Plate", "amberwood_button": "Amberwood Button",
    "amberwood_sign": "Amberwood Sign", "amberwood_wall_sign": "Amberwood Wall Sign",
    "amberwood_hanging_sign": "Amberwood Hanging Sign", "amberwood_wall_hanging_sign": "Amberwood Wall Hanging Sign",
}

# what the 0.4 fixes removed: their generated files are deleted on every run
REMOVED = [("assets", "models", "block", "amberwood_leaves"), ("assets", "models", "block", "amberwood_sapling"),
           ("assets", "blockstates", "amberwood_leaves"), ("assets", "blockstates", "amberwood_sapling"),
           ("assets", "models", "item", "amber_chunk"), ("assets", "models", "item", "amberwood_seed"),
           ("assets", "models", "item", "amberwood_leaves"),
           ("data", "loot_table", "blocks", "amberwood_leaves"), ("data", "loot_table", "blocks", "amberwood_sapling"),
           ("data", "tags", "block", "leaves"), ("data", "tags", "item", "leaves")]


def run(ctx):
    M = ctx.M
    w = ctx.write
    A, D = ctx.A, ctx.D

    for kind, *rest in REMOVED:
        if kind == "assets":
            p = os.path.join(A, *rest) + ".json"
        elif rest[0] == "tags":
            p = os.path.join(D, "minecraft", *rest) + ".json"
        else:
            p = os.path.join(D, M, *rest) + ".json"
        if os.path.exists(p):
            os.remove(p)

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
                                            "inclusion=mosquito": ref("amber_block_mosquito"),
                                            # 0.4 fixes: a Harvester Egg (drawn in 3D by client/amber/AmberInclusionRenderer)
                                            "inclusion=egg": ref("amber_block")}})
    # amber fossil, amber sand, amber gravel: brushed like suspicious gravel / sand (4 dusting stages)
    for b in ("amber_fossil", "amber_sand", "amber_gravel"):
        for d in range(4):
            cube(f"{b}_{d}")
        blockstate(b, {"variants": {f"dusted={d}": ref(f"{b}_{d}") for d in range(4)}})

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

    # the glowing flowers on top of every Amberwood column, and its sapling (stage 0/1 like vanilla saplings)
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
    blockstate("amberwood_bloom", {"variants": {f"stage={s}": ref("amberwood_bloom") for s in (0, 1)}})
    block_model("potted_amberwood_bloom", {"parent": "minecraft:block/flower_pot_cross",
                                           "textures": {"plant": f"{M}:block/amberwood_bloom"}})
    blockstate("potted_amberwood_bloom", {"variants": {"": ref("potted_amberwood_bloom")}})

    # blood stain: a single face just above the floor, turned at random
    block_model("blood_stain", {
        "ambientocclusion": False,
        "textures": {"particle": f"{M}:block/blood_stain", "stain": f"{M}:block/blood_stain"},
        "elements": [{"from": [0, 0.25, 0], "to": [16, 0.25, 16], "shade": False, "faces": {
            "up": {"uv": [0, 0, 16, 16], "texture": "#stain"},
            "down": {"uv": [0, 16, 16, 0], "texture": "#stain", "cullface": "down"}}}]})
    blockstate("blood_stain", {"variants": {"": [ref("blood_stain"), ref("blood_stain", y=90), ref("blood_stain", y=180),
                                                 ref("blood_stain", y=270)]}})

    wood_set_models(ctx, block_model, blockstate, ref)

    # ---------------------------------------------------------------------------------------- item models
    for name in ("amber_shard", "amberwood_bloom", "amberwood_door", "amberwood_sign", "amberwood_hanging_sign", "amberwood_boat",
                 "amberwood_chest_boat"):
        item_model(name, {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/{name}"}})
    item_model("mosquito_spawn_egg", {"parent": "minecraft:item/template_spawn_egg"})
    for item, model in (("amber_block", "amber_block"), ("amber_fossil", "amber_fossil_0"), ("amber_sand", "amber_sand_0"),
                        ("amber_gravel", "amber_gravel_0"), ("petrified_log", "petrified_log"), ("amberwood_log", "amberwood_log"),
                        ("amberwood_wood", "amberwood_wood"), ("stripped_amberwood_log", "stripped_amberwood_log"),
                        ("stripped_amberwood_wood", "stripped_amberwood_wood"), ("amberwood_planks", "amberwood_planks"),
                        ("amberwood_stairs", "amberwood_stairs"), ("amberwood_slab", "amberwood_slab"),
                        ("amberwood_fence", "amberwood_fence_inventory"), ("amberwood_fence_gate", "amberwood_fence_gate"),
                        ("amberwood_trapdoor", "amberwood_trapdoor_bottom"), ("amberwood_pressure_plate", "amberwood_pressure_plate"),
                        ("amberwood_button", "amberwood_button_inventory")):
        item_model(item, {"parent": f"{M}:block/{model}"})

    # ---------------------------------------------------------------------------------------- recipes
    def recipe(name, obj):
        w(os.path.join(D, M, "recipe", name + ".json"), obj)

    def ing(v):
        return {"tag": v[1:]} if v.startswith("#") else {"item": v}

    def shaped(name, pattern, key, result, count=1, category="building", group=None):
        r = {"type": "minecraft:crafting_shaped", "category": category, "pattern": pattern,
             "key": {k: ing(v) for k, v in key.items()}, "result": {"id": result, "count": count}}
        if group:
            r["group"] = group
        recipe(name, r)

    def shapeless(name, items, result, count=1, category="building", group=None):
        r = {"type": "minecraft:crafting_shapeless", "category": category, "ingredients": [ing(v) for v in items],
             "result": {"id": result, "count": count}}
        if group:
            r["group"] = group
        recipe(name, r)

    # 9 shards <-> 1 amber block
    shaped("amber_block", ["###", "###", "###"], {"#": f"{M}:amber_shard"}, f"{M}:amber_block")
    shapeless("amber_shard", [f"{M}:amber_block"], f"{M}:amber_shard", 9, category="misc")
    # the Amberwood set, as vanilla's cherry recipes
    P, S = f"{M}:amberwood_planks", "minecraft:stick"
    shapeless("amberwood_planks", [f"#{M}:amberwood_logs"], P, 4, group="planks")
    shaped("amberwood_wood", ["##", "##"], {"#": f"{M}:amberwood_log"}, f"{M}:amberwood_wood", 3, group="bark")
    shaped("stripped_amberwood_wood", ["##", "##"], {"#": f"{M}:stripped_amberwood_log"}, f"{M}:stripped_amberwood_wood", 3,
           group="bark")
    shaped("amberwood_stairs", ["#  ", "## ", "###"], {"#": P}, f"{M}:amberwood_stairs", 4, group="wooden_stairs")
    shaped("amberwood_slab", ["###"], {"#": P}, f"{M}:amberwood_slab", 6, group="wooden_slab")
    shaped("amberwood_fence", ["W#W", "W#W"], {"#": S, "W": P}, f"{M}:amberwood_fence", 3, category="misc", group="wooden_fence")
    shaped("amberwood_fence_gate", ["#W#", "#W#"], {"#": S, "W": P}, f"{M}:amberwood_fence_gate", 1, category="redstone",
           group="wooden_fence_gate")
    shaped("amberwood_door", ["##", "##", "##"], {"#": P}, f"{M}:amberwood_door", 3, category="redstone", group="wooden_door")
    shaped("amberwood_trapdoor", ["###", "###"], {"#": P}, f"{M}:amberwood_trapdoor", 2, category="redstone", group="wooden_trapdoor")
    shapeless("amberwood_button", [P], f"{M}:amberwood_button", 1, category="redstone", group="wooden_button")
    shaped("amberwood_pressure_plate", ["##"], {"#": P}, f"{M}:amberwood_pressure_plate", 1, category="redstone",
           group="wooden_pressure_plate")
    shaped("amberwood_sign", ["###", "###", " X "], {"#": P, "X": S}, f"{M}:amberwood_sign", 3, category="misc", group="wooden_sign")
    shaped("amberwood_hanging_sign", ["X X", "###", "###"], {"#": f"{M}:stripped_amberwood_log", "X": "minecraft:chain"},
           f"{M}:amberwood_hanging_sign", 6, category="misc", group="hanging_sign")
    shaped("amberwood_boat", ["# #", "###"], {"#": P}, f"{M}:amberwood_boat", 1, category="misc", group="boat")
    shapeless("amberwood_chest_boat", ["minecraft:chest", f"{M}:amberwood_boat"], f"{M}:amberwood_chest_boat", 1, category="misc",
              group="chest_boat")

    # ---------------------------------------------------------------------------------------- loot tables
    def block_loot(name, pools):
        w(os.path.join(D, M, "loot_table", "blocks", name + ".json"), {"type": "minecraft:block", "pools": pools,
                                                                       "random_sequence": f"{M}:blocks/{name}"})

    def drops(item, cond=None):
        e = {"type": "minecraft:item", "name": item}
        if cond:
            e["conditions"] = [cond]
        return [{"rolls": 1, "bonus_rolls": 0, "entries": [e], "conditions": [{"condition": "minecraft:survives_explosion"}]}]

    silk = {"condition": "minecraft:match_tool", "predicate": {"predicates": {"minecraft:enchantments": [
        {"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}
    # amber needs Silk Touch: with it, the block (its inclusion kept in the item's block_state; plain amber stays plain so it
    # stacks with crafted blocks); without it, 2-4 shards (and amber.AmberBlock lets the inclusion out)
    block_loot("amber_block", [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:alternatives", "children": [
        {"type": "minecraft:item", "name": f"{M}:amber_block", "conditions": [silk, {
            "condition": "minecraft:block_state_property", "block": f"{M}:amber_block", "properties": {"inclusion": "none"}}]},
        {"type": "minecraft:item", "name": f"{M}:amber_block", "conditions": [silk], "functions": [
            {"function": "minecraft:copy_state", "block": f"{M}:amber_block", "properties": ["inclusion"]}]},
        {"type": "minecraft:item", "name": f"{M}:amber_shard", "functions": [
            {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 2, "max": 4}},
            {"function": "minecraft:explosion_decay"}]}]}]}])
    for b in ("petrified_log", "amberwood_log", "amberwood_wood", "stripped_amberwood_log", "stripped_amberwood_wood",
              "amberwood_planks", "amberwood_stairs", "amberwood_fence", "amberwood_fence_gate", "amberwood_trapdoor",
              "amberwood_button", "amberwood_pressure_plate", "amberwood_sign", "amberwood_hanging_sign", "amberwood_bloom"):
        block_loot(b, drops(f"{M}:{b}"))   # logs lose their resin
    block_loot("amberwood_door", drops(f"{M}:amberwood_door", {"condition": "minecraft:block_state_property",
                                                              "block": f"{M}:amberwood_door", "properties": {"half": "lower"}}))
    block_loot("amberwood_slab", [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:item", "name": f"{M}:amberwood_slab",
                                                                             "functions": [
        {"function": "minecraft:set_count", "add": False, "count": 2, "conditions": [{
            "condition": "minecraft:block_state_property", "block": f"{M}:amberwood_slab", "properties": {"type": "double"}}]},
        {"function": "minecraft:explosion_decay"}]}]}])
    # a potted bloom drops the pot and the bloom, as vanilla's potted saplings
    block_loot("potted_amberwood_bloom", drops("minecraft:flower_pot") + drops(f"{M}:amberwood_bloom"))
    for b in ("amber_fossil", "amber_sand", "amber_gravel", "blood_stain"):
        block_loot(b, [])   # like suspicious sand and gravel: only brushing gets anything out
    w(os.path.join(D, M, "loot_table", "entities", "mosquito.json"), {"type": "minecraft:entity", "pools": []})

    # sniffer digging gains these (amber.AmberFeature adds the table to minecraft:gameplay/sniffer_digging); 0.4: sherds at
    # about a fifth of their old weight, more amber
    def item(name, weight, count=None):
        e = {"type": "minecraft:item", "name": name, "weight": weight}
        if count:
            e["functions"] = [{"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": count[0],
                                                                             "max": count[1]}}]
        return e

    w(os.path.join(D, M, "loot_table", "gameplay", "sniffer_finds.json"), {"type": "minecraft:gift", "pools": [
        {"rolls": 1, "bonus_rolls": 0, "entries": [
            item(f"{M}:amberwood_bloom", 30), item(f"{M}:amber_shard", 50, (1, 3)), item("minecraft:bone", 40, (1, 3))]
         + [item(f"minecraft:{s}_pottery_sherd", 1) for s in ("blade", "miner", "archer", "howl", "danger", "skull")]}]})

    # ---------------------------------------------------------------------------------------- tags
    def tag(path, values):
        w(os.path.join(D, *path) + ".json", {"replace": False, "values": values})

    def merge_tag(path, values):
        """Tags another module also writes (mineable/pickaxe from gen_data.tags): add ours to what is there."""
        p = os.path.join(D, *path) + ".json"
        old = json.load(open(p, encoding="utf-8")).get("values", []) if os.path.exists(p) else []
        w(p, {"replace": False, "values": old + [x for x in values if x not in old]})

    logs = [f"{M}:amberwood_log", f"{M}:amberwood_wood", f"{M}:stripped_amberwood_log", f"{M}:stripped_amberwood_wood"]
    wooden = {"planks": "amberwood_planks", "wooden_stairs": "amberwood_stairs", "wooden_slabs": "amberwood_slab",
              "wooden_fences": "amberwood_fence", "fence_gates": "amberwood_fence_gate", "wooden_doors": "amberwood_door",
              "wooden_trapdoors": "amberwood_trapdoor", "wooden_buttons": "amberwood_button",
              "wooden_pressure_plates": "amberwood_pressure_plate", "saplings": "amberwood_bloom"}
    for kind in ("block", "item"):
        tag([M, "tags", kind, "amberwood_logs"], logs)
        tag(["minecraft", "tags", kind, "logs_that_burn"], [f"#{M}:amberwood_logs"])
        for t, b in wooden.items():
            tag(["minecraft", "tags", kind, t], [f"{M}:{b}"])
    tag(["minecraft", "tags", "block", "standing_signs"], [f"{M}:amberwood_sign"])
    tag(["minecraft", "tags", "block", "wall_signs"], [f"{M}:amberwood_wall_sign"])
    tag(["minecraft", "tags", "block", "ceiling_hanging_signs"], [f"{M}:amberwood_hanging_sign"])
    tag(["minecraft", "tags", "block", "wall_hanging_signs"], [f"{M}:amberwood_wall_hanging_sign"])
    tag(["minecraft", "tags", "item", "signs"], [f"{M}:amberwood_sign"])
    tag(["minecraft", "tags", "item", "hanging_signs"], [f"{M}:amberwood_hanging_sign"])
    tag(["minecraft", "tags", "item", "boats"], [f"{M}:amberwood_boat"])
    tag(["minecraft", "tags", "block", "flower_pots"], [f"{M}:potted_amberwood_bloom"])
    tag(["minecraft", "tags", "item", "chest_boats"], [f"{M}:amberwood_chest_boat"])
    tag(["minecraft", "tags", "block", "mineable", "axe"], [f"{M}:amberwood_log", f"{M}:amberwood_planks"])
    tag(["minecraft", "tags", "block", "mineable", "hoe"], [f"{M}:amberwood_bloom"])
    tag(["minecraft", "tags", "block", "mineable", "shovel"], [f"{M}:amber_fossil", f"{M}:amber_sand", f"{M}:amber_gravel"])
    merge_tag(["minecraft", "tags", "block", "mineable", "pickaxe"], [f"{M}:amber_block", f"{M}:petrified_log"])
    tag([M, "tags", "entity_type", "bloodless"], BLOODLESS)

    # ---------------------------------------------------------------------------------------- the Amberwood
    # a saguaro-like column with arms and blooms on top: the Java feature winterworks:amberwood (amber.AmberwoodFeature),
    # grown from a planted bloom
    W = os.path.join(D, M, "worldgen")
    w(os.path.join(W, "configured_feature", "amberwood.json"), {"type": f"{M}:amberwood", "config": {}})
    w(os.path.join(W, "placed_feature", "amberwood.json"), {"feature": f"{M}:amberwood", "placement": [
        {"type": "minecraft:block_predicate_filter", "predicate": {
            "type": "minecraft:would_survive", "state": {"Name": f"{M}:amberwood_bloom", "Properties": {"stage": "0"}}}}]})

    # ---------------------------------------------------------------------------------------- sounds and lang
    subtitles = placeholder_sounds(ctx)
    lang = {
        "block.winterworks.amber_block": "Block of Amber",
        "block.winterworks.amber_block.inclusion.seed": "An Amberwood seed is sealed inside",
        "block.winterworks.amber_block.inclusion.mosquito": "A mosquito is trapped inside",
        "block.winterworks.amber_fossil": "Amber Fossil",
        "block.winterworks.amber_sand": "Amber Sand",
        "block.winterworks.amber_gravel": "Amber Gravel",
        "block.winterworks.petrified_log": "Petrified Log",
        "block.winterworks.amberwood_bloom": "Amberwood Bloom",
        "block.winterworks.potted_amberwood_bloom": "Potted Amberwood Bloom",
        "block.winterworks.blood_stain": "Blood Stain",
        "item.winterworks.amber_shard": "Amber Shard",
        "item.winterworks.amberwood_boat": "Amberwood Boat",
        "item.winterworks.amberwood_chest_boat": "Amberwood Boat with Chest",
        "entity.winterworks.amberwood_boat": "Amberwood Boat",
        "entity.winterworks.amberwood_chest_boat": "Amberwood Boat with Chest",
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
    lang.update({f"block.winterworks.{b}": n for b, n in WOOD_SET.items()})
    lang.update(subtitles)
    w(os.path.join(ctx.L, "amber.json"), lang)


def wood_set_models(ctx, block_model, blockstate, ref):
    """The Amberwood wood set's models and blockstates, variant for variant as vanilla's (BlockModelGenerators)."""
    M = ctx.M
    T = lambda n: f"{M}:block/{n}"  # noqa: E731
    planks = T("amberwood_planks")

    def tmpl(name, parent, **textures):
        block_model(name, {"parent": f"minecraft:block/{parent}", "textures": textures})

    def rot(model, x=0, y=0, uvlock=False):
        v = ref(model)
        if uvlock:
            v["uvlock"] = True
        if x:
            v["x"] = x
        if y:
            v["y"] = y
        return v

    # wood and stripped wood: bark on every face (cube_column turned like vanilla's *_wood)
    for name, tex in (("amberwood_wood", "amberwood_log"), ("stripped_amberwood_wood", "stripped_amberwood_log")):
        tmpl(name, "cube_column", end=T(tex), side=T(tex))
        blockstate(name, {"variants": {"axis=x": rot(name, 90, 90), "axis=y": rot(name), "axis=z": rot(name, 90)}})
    # stripped log: like the log
    tex = {"end": T("stripped_amberwood_log_top"), "side": T("stripped_amberwood_log")}
    tmpl("stripped_amberwood_log", "cube_column", **tex)
    tmpl("stripped_amberwood_log_horizontal", "cube_column_horizontal", **tex)
    blockstate("stripped_amberwood_log", {"variants": {"axis=x": rot("stripped_amberwood_log_horizontal", 90, 90),
                                                      "axis=y": rot("stripped_amberwood_log"),
                                                      "axis=z": rot("stripped_amberwood_log_horizontal", 90)}})
    block_model("amberwood_planks", {"parent": "minecraft:block/cube_all", "textures": {"all": planks}})
    blockstate("amberwood_planks", {"variants": {"": ref("amberwood_planks")}})

    # stairs
    for suffix, parent in (("", "stairs"), ("_inner", "inner_stairs"), ("_outer", "outer_stairs")):
        tmpl("amberwood_stairs" + suffix, parent, bottom=planks, top=planks, side=planks)
    facing_y = {"east": 0, "north": 270, "south": 90, "west": 180}
    v = {}
    for f, fy in facing_y.items():
        for half in ("bottom", "top"):
            for shape in ("inner_left", "inner_right", "outer_left", "outer_right", "straight"):
                model = "amberwood_stairs" + ("_inner" if shape.startswith("inner") else "_outer" if shape.startswith("outer") else "")
                y = fy
                if half == "bottom" and shape.endswith("left"):
                    y -= 90
                if half == "top" and shape.endswith("right"):
                    y += 90
                y %= 360
                x = 180 if half == "top" else 0
                v[f"facing={f},half={half},shape={shape}"] = rot(model, x, y, uvlock=bool(x or y))
    blockstate("amberwood_stairs", {"variants": v})

    # slab
    tmpl("amberwood_slab", "slab", bottom=planks, top=planks, side=planks)
    tmpl("amberwood_slab_top", "slab_top", bottom=planks, top=planks, side=planks)
    blockstate("amberwood_slab", {"variants": {"type=bottom": ref("amberwood_slab"), "type=double": ref("amberwood_planks"),
                                               "type=top": ref("amberwood_slab_top")}})

    # fence
    tmpl("amberwood_fence_post", "fence_post", texture=planks)
    tmpl("amberwood_fence_side", "fence_side", texture=planks)
    tmpl("amberwood_fence_inventory", "fence_inventory", texture=planks)
    blockstate("amberwood_fence", {"multipart": [{"apply": ref("amberwood_fence_post")}] + [
        {"apply": rot("amberwood_fence_side", 0, y, uvlock=True), "when": {d: "true"}}
        for d, y in (("north", 0), ("east", 90), ("south", 180), ("west", 270))]})

    # fence gate
    for suffix in ("", "_open", "_wall", "_wall_open"):
        tmpl("amberwood_fence_gate" + suffix, "template_fence_gate" + suffix, texture=planks)
    gate_y = {"east": 270, "north": 180, "south": 0, "west": 90}
    v = {}
    for f, y in gate_y.items():
        for wall in ("false", "true"):
            for op in ("false", "true"):
                model = "amberwood_fence_gate" + ("_wall" if wall == "true" else "") + ("_open" if op == "true" else "")
                v[f"facing={f},in_wall={wall},open={op}"] = rot(model, 0, y, uvlock=True)
    blockstate("amberwood_fence_gate", {"variants": v})

    # door
    for part in ("bottom_left", "bottom_left_open", "bottom_right", "bottom_right_open", "top_left", "top_left_open", "top_right",
                 "top_right_open"):
        tmpl("amberwood_door_" + part, "door_" + part, bottom=T("amberwood_door_bottom"), top=T("amberwood_door_top"))
    door_y = {"east": 0, "north": 270, "south": 90, "west": 180}
    v = {}
    for f, fy in door_y.items():
        for half, hm in (("lower", "bottom"), ("upper", "top")):
            for hinge in ("left", "right"):
                for op in ("false", "true"):
                    y = fy
                    if op == "true":
                        y += 90 if hinge == "left" else 270
                    y %= 360
                    model = f"amberwood_door_{hm}_{hinge}" + ("_open" if op == "true" else "")
                    v[f"facing={f},half={half},hinge={hinge},open={op}"] = rot(model, 0, y)
    blockstate("amberwood_door", {"variants": v})

    # trapdoor (orientable, like vanilla's wooden trapdoors)
    for part in ("bottom", "top", "open"):
        tmpl("amberwood_trapdoor_" + part, "template_orientable_trapdoor_" + part, texture=T("amberwood_trapdoor"))
    trap_y = {"east": 90, "north": 0, "south": 180, "west": 270}
    v = {}
    for f, y in trap_y.items():
        for half in ("bottom", "top"):
            for op in ("false", "true"):
                if op == "true":
                    model, x, yy = "amberwood_trapdoor_open", (180 if half == "top" else 0), ((y + 180) % 360 if half == "top" else y)
                else:
                    model, x, yy = f"amberwood_trapdoor_{half}", 0, y
                v[f"facing={f},half={half},open={op}"] = rot(model, x, yy)
    blockstate("amberwood_trapdoor", {"variants": v})

    # button
    tmpl("amberwood_button", "button", texture=planks)
    tmpl("amberwood_button_pressed", "button_pressed", texture=planks)
    tmpl("amberwood_button_inventory", "button_inventory", texture=planks)
    v = {}
    face_x = {"ceiling": 180, "floor": 0, "wall": 90}
    for face, x in face_x.items():
        for f in ("east", "north", "south", "west"):
            if face == "ceiling":
                y = {"east": 270, "north": 180, "south": 0, "west": 90}[f]
            else:
                y = {"east": 90, "north": 0, "south": 180, "west": 270}[f]
            for powered in ("false", "true"):
                model = "amberwood_button" + ("_pressed" if powered == "true" else "")
                v[f"face={face},facing={f},powered={powered}"] = rot(model, x, y, uvlock=(face == "wall"))
    blockstate("amberwood_button", {"variants": v})

    # pressure plate
    tmpl("amberwood_pressure_plate", "pressure_plate_up", texture=planks)
    tmpl("amberwood_pressure_plate_down", "pressure_plate_down", texture=planks)
    blockstate("amberwood_pressure_plate", {"variants": {"powered=false": ref("amberwood_pressure_plate"),
                                                         "powered=true": ref("amberwood_pressure_plate_down")}})

    # signs: drawn by vanilla's sign renderers from entity/signs(/hanging)/amberwood (the WoodType); the block models only
    # give the breaking particles
    block_model("amberwood_sign", {"textures": {"particle": planks}})
    block_model("amberwood_hanging_sign", {"textures": {"particle": T("stripped_amberwood_log")}})
    for b, model in (("amberwood_sign", "amberwood_sign"), ("amberwood_wall_sign", "amberwood_sign"),
                     ("amberwood_hanging_sign", "amberwood_hanging_sign"), ("amberwood_wall_hanging_sign", "amberwood_hanging_sign")):
        blockstate(b, {"variants": {"": ref(model)}})


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
