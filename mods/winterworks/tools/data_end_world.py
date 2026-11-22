"""Data for the world (docs/END_UPDATE.md sections 1-3): biomes, terrain features, structures, the new blocks' models, recipes, loot and tags, End City loot, and lang/end_world.json. Called by gen_data.py with ctx = gen_data.Ctx.

Blockstates, block and item models for every block in section 2 except end_bloom and chorus_cocoon (the mobs
area's), with the texture paths of section 15; their loot tables, recipes and tags; Chorus Meadows and the Dead End
(biomes, their placed features, biome tags); the Obsidian Ruins, End Shrine and Monolith Tower (structures, structure
sets, chest and archaeology loot); the end_spore / end_dust / meteor_spark particle definitions; and the lang.
"""
import os

M = "winterworks"

# ---------------------------------------------------------------------------------------------- the blocks
# the obsidian set, like deepslate: base block -> (texture, stairs, slab, wall) where it has them
OBSIDIAN_SET = {
    "polished_obsidian": ("polished_obsidian", "polished_obsidian"),
    "obsidian_bricks": ("obsidian_bricks", "obsidian_brick"),
    "obsidian_tiles": ("obsidian_tiles", "obsidian_tile"),
}
METEORITE_SET = {"meteorite_bricks": ("meteorite_bricks", "meteorite_brick")}
CUBES = ["end_moss_block", "end_sand", "meteorite", "meteorite_core", "polished_meteorite", "meteorite_bricks", "polished_obsidian",
         "obsidian_bricks", "cracked_obsidian_bricks", "obsidian_tiles", "cracked_obsidian_tiles"]
SHAPED_SETS = {**OBSIDIAN_SET, **METEORITE_SET}

OBSIDIAN_BLOCKS = ["polished_obsidian", "polished_obsidian_stairs", "polished_obsidian_slab", "polished_obsidian_wall",
                   "obsidian_bricks", "obsidian_brick_stairs", "obsidian_brick_slab", "obsidian_brick_wall", "cracked_obsidian_bricks",
                   "obsidian_tiles", "obsidian_tile_stairs", "obsidian_tile_slab", "obsidian_tile_wall", "cracked_obsidian_tiles",
                   "chiseled_obsidian"]
METEORITE_BLOCKS = ["meteorite", "meteorite_core", "polished_meteorite", "meteorite_bricks", "meteorite_brick_stairs",
                    "meteorite_brick_slab", "meteorite_brick_wall"]

# the stairs blockstate: (facing, half, shape) -> (model suffix, x, y, uvlock), as vanilla's
STAIRS = {}
for _f, _y0 in (("east", 0), ("south", 90), ("west", 180), ("north", 270)):
    for _half in ("bottom", "top"):
        _x = 180 if _half == "top" else 0
        for _shape in ("straight", "inner_left", "inner_right", "outer_left", "outer_right"):
            _m = "" if _shape == "straight" else "_" + _shape.split("_")[0]
            _rot = _y0
            if _half == "bottom" and _shape.endswith("left"):
                _rot = _y0 - 90
            if _half == "top" and _shape.endswith("right"):
                _rot = _y0 + 90
            _rot %= 360
            STAIRS[f"facing={_f},half={_half},shape={_shape}"] = (_m, _x, _rot, not (_x == 0 and _rot == 0))

LANG_BLOCKS = {
    "end_grass_block": "End Grass Block", "end_grass": "End Grass", "tall_end_grass": "Tall End Grass",
    "end_moss_block": "End Moss Block", "end_moss_carpet": "End Moss Carpet", "chorus_stem": "Chorus Stem",
    "chorus_roots": "Chorus Roots", "chorus_fruit_block": "Block of Chorus Fruit", "end_sand": "End Sand",
    "suspicious_end_sand": "Suspicious End Sand", "dry_end_bush": "Dry End Bush", "meteorite": "Meteorite",
    "meteorite_core": "Meteorite Core", "polished_meteorite": "Polished Meteorite", "meteorite_bricks": "Meteorite Bricks",
    "meteorite_brick_stairs": "Meteorite Brick Stairs", "meteorite_brick_slab": "Meteorite Brick Slab",
    "meteorite_brick_wall": "Meteorite Brick Wall", "polished_obsidian": "Polished Obsidian",
    "polished_obsidian_stairs": "Polished Obsidian Stairs", "polished_obsidian_slab": "Polished Obsidian Slab",
    "polished_obsidian_wall": "Polished Obsidian Wall", "obsidian_bricks": "Obsidian Bricks",
    "obsidian_brick_stairs": "Obsidian Brick Stairs", "obsidian_brick_slab": "Obsidian Brick Slab",
    "obsidian_brick_wall": "Obsidian Brick Wall", "cracked_obsidian_bricks": "Cracked Obsidian Bricks",
    "obsidian_tiles": "Obsidian Tiles", "obsidian_tile_stairs": "Obsidian Tile Stairs", "obsidian_tile_slab": "Obsidian Tile Slab",
    "obsidian_tile_wall": "Obsidian Tile Wall", "cracked_obsidian_tiles": "Cracked Obsidian Tiles",
    "chiseled_obsidian": "Chiseled Obsidian",
}


def spawn(t, w, lo, hi):
    return {"type": t, "weight": w, "minCount": lo, "maxCount": hi}


def item(name, weight=1, count=None, functions=()):
    e = {"type": "minecraft:item", "name": name, "weight": weight}
    fs = []
    if count:
        fs.append({"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": count[0], "max": count[1]}})
    fs.extend(functions)
    if fs:
        e["functions"] = fs
    return e


def empty(weight):
    return {"type": "minecraft:empty", "weight": weight}


def run(ctx):
    w = ctx.write
    A, D = ctx.A, ctx.D

    def bs(name, obj):
        w(os.path.join(A, "blockstates", name + ".json"), obj)

    def bm(name, obj):
        w(os.path.join(A, "models", "block", name + ".json"), obj)

    def im(name, obj):
        w(os.path.join(A, "models", "item", name + ".json"), obj)

    def tex(name):
        return f"{M}:block/{name}"

    def ref(model, **kw):
        return dict({"model": f"{M}:block/{model}"}, **kw)

    def single(name, model=None):
        bs(name, {"variants": {"": ref(model or name)}})

    def cube(name, texture=None):
        bm(name, {"parent": "minecraft:block/cube_all", "textures": {"all": tex(texture or name)}})

    def block_item(name, model=None):
        im(name, {"parent": f"{M}:block/{model or name}"})

    def flat_item(name, texture):
        im(name, {"parent": "minecraft:item/generated", "textures": {"layer0": tex(texture)}})

    # ---------------------------------------------------------------------------------------- models
    # plain cubes
    for c in CUBES:
        cube(c)
        if c not in ("end_moss_block",):
            single(c)
        block_item(c)
    single("end_moss_block")
    # end grass: top, side, end stone bottom; turned at random like grass
    bm("end_grass_block", {"parent": "minecraft:block/cube_bottom_top", "textures": {
        "top": tex("end_grass_block_top"), "side": tex("end_grass_block_side"), "bottom": "minecraft:block/end_stone",
        "particle": tex("end_grass_block_side")}})
    bs("end_grass_block", {"variants": {"": [ref("end_grass_block", y=r) if r else ref("end_grass_block") for r in (0, 90, 180, 270)]}})
    block_item("end_grass_block")
    # plants
    for name, texture in (("end_grass", "end_grass"), ("dry_end_bush", "dry_end_bush")):
        bm(name, {"parent": "minecraft:block/cross", "textures": {"cross": tex(texture)}})
        single(name)
        flat_item(name, texture)
    bm("tall_end_grass_bottom", {"parent": "minecraft:block/cross", "textures": {"cross": tex("tall_end_grass_bottom")}})
    bm("tall_end_grass_top", {"parent": "minecraft:block/cross", "textures": {"cross": tex("tall_end_grass_top")}})
    bs("tall_end_grass", {"variants": {"half=lower": ref("tall_end_grass_bottom"), "half=upper": ref("tall_end_grass_top")}})
    flat_item("tall_end_grass", "tall_end_grass_top")
    # moss carpet
    bm("end_moss_carpet", {"parent": "minecraft:block/carpet", "textures": {"wool": tex("end_moss_block")}})
    single("end_moss_carpet")
    block_item("end_moss_carpet")
    # pillars
    for name, side, end in (("chorus_stem", "chorus_stem", "chorus_stem_top"), ("chorus_roots", "chorus_roots", "chorus_roots_top")):
        t = {"end": tex(end), "side": tex(side)}
        bm(name, {"parent": "minecraft:block/cube_column", "textures": t})
        bm(name + "_horizontal", {"parent": "minecraft:block/cube_column_horizontal", "textures": t})
        bs(name, {"variants": {"axis=x": ref(name + "_horizontal", x=90, y=90), "axis=y": ref(name),
                               "axis=z": ref(name + "_horizontal", x=90)}})
        block_item(name)
    for name, side, end in (("chorus_fruit_block", "chorus_fruit_block", "chorus_fruit_block_top"),
                            ("chiseled_obsidian", "chiseled_obsidian", "chiseled_obsidian_top")):
        bm(name, {"parent": "minecraft:block/cube_column", "textures": {"end": tex(end), "side": tex(side)}})
        single(name)
        block_item(name)
    # suspicious end sand: brushed like suspicious sand
    for d in range(4):
        cube(f"suspicious_end_sand_{d}")
    bs("suspicious_end_sand", {"variants": {f"dusted={d}": ref(f"suspicious_end_sand_{d}") for d in range(4)}})
    block_item("suspicious_end_sand", "suspicious_end_sand_0")
    # stairs, slabs and walls
    for base, (texture, prefix) in SHAPED_SETS.items():
        t = tex(texture)
        three = {"bottom": t, "side": t, "top": t}
        bm(prefix + "_stairs", {"parent": "minecraft:block/stairs", "textures": three})
        bm(prefix + "_stairs_inner", {"parent": "minecraft:block/inner_stairs", "textures": three})
        bm(prefix + "_stairs_outer", {"parent": "minecraft:block/outer_stairs", "textures": three})
        v = {}
        for key, (suffix, x, y, uv) in STAIRS.items():
            e = ref(prefix + "_stairs" + suffix)
            if x:
                e["x"] = x
            if y:
                e["y"] = y
            if uv:
                e["uvlock"] = True
            v[key] = e
        bs(prefix + "_stairs", {"variants": v})
        block_item(prefix + "_stairs")
        bm(prefix + "_slab", {"parent": "minecraft:block/slab", "textures": three})
        bm(prefix + "_slab_top", {"parent": "minecraft:block/slab_top", "textures": three})
        bs(prefix + "_slab", {"variants": {"type=bottom": ref(prefix + "_slab"), "type=double": ref(base),
                                           "type=top": ref(prefix + "_slab_top")}})
        block_item(prefix + "_slab")
        for part in ("post", "side", "side_tall"):
            bm(f"{prefix}_wall_{part}", {"parent": f"minecraft:block/template_wall_{part}", "textures": {"wall": t}})
        bm(prefix + "_wall_inventory", {"parent": "minecraft:block/wall_inventory", "textures": {"wall": t}})
        mp = [{"apply": ref(prefix + "_wall_post"), "when": {"up": "true"}}]
        for kind, model in (("low", "_wall_side"), ("tall", "_wall_side_tall")):
            for side, y in (("north", 0), ("east", 90), ("south", 180), ("west", 270)):
                a = ref(prefix + model, uvlock=True)
                if y:
                    a["y"] = y
                mp.append({"apply": a, "when": {side: kind}})
        bs(prefix + "_wall", {"multipart": mp})
        im(prefix + "_wall", {"parent": f"{M}:block/{prefix}_wall_inventory"})

    # ---------------------------------------------------------------------------------------- loot
    def loot(path, obj):
        w(os.path.join(D, M, "loot_table", *path.split("/")) + ".json", obj)

    def block_loot(name, pools):
        loot("blocks/" + name, {"type": "minecraft:block", "pools": pools})

    survives = [{"condition": "minecraft:survives_explosion"}]
    shears = {"condition": "minecraft:match_tool", "predicate": {"items": "minecraft:shears"}}
    silk = {"condition": "minecraft:match_tool", "predicate": {"predicates": {"minecraft:enchantments": [
        {"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}

    def drops_self(name):
        block_loot(name, [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:item", "name": f"{M}:{name}"}],
                           "conditions": survives}])

    for b in (["end_moss_block", "end_moss_carpet", "chorus_stem", "chorus_roots", "chorus_fruit_block", "end_sand"]
              + [b for b in OBSIDIAN_BLOCKS + METEORITE_BLOCKS if not b.endswith("_slab")]):
        drops_self(b)
    for prefix in [p for _, p in SHAPED_SETS.values()]:
        slab = prefix + "_slab"
        block_loot(slab, [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:item", "name": f"{M}:{slab}", "functions": [
            {"function": "minecraft:set_count", "count": 2, "add": False, "conditions": [
                {"condition": "minecraft:block_state_property", "block": f"{M}:{slab}", "properties": {"type": "double"}}]},
            {"function": "minecraft:explosion_decay"}]}]}])
    block_loot("end_grass_block", [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:alternatives", "children": [
        {"type": "minecraft:item", "name": f"{M}:end_grass_block", "conditions": [silk]},
        {"type": "minecraft:item", "name": "minecraft:end_stone", "conditions": survives}]}]}])
    block_loot("end_grass", [{"rolls": 1, "bonus_rolls": 0, "entries": [
        {"type": "minecraft:item", "name": f"{M}:end_grass", "conditions": [shears]}]}])
    block_loot("tall_end_grass", [{"rolls": 1, "bonus_rolls": 0, "conditions": [
        {"condition": "minecraft:block_state_property", "block": f"{M}:tall_end_grass", "properties": {"half": "lower"}}, shears],
        "entries": [{"type": "minecraft:item", "name": f"{M}:tall_end_grass"}]}])
    block_loot("dry_end_bush", [{"rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:alternatives", "children": [
        {"type": "minecraft:item", "name": f"{M}:dry_end_bush", "conditions": [shears]},
        {"type": "minecraft:item", "name": "minecraft:stick", "functions": [
            {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 0, "max": 2}, "add": False},
            {"function": "minecraft:explosion_decay"}]}]}]}])
    block_loot("suspicious_end_sand", [])   # like suspicious sand: only brushing gets anything out

    # chests (the void rod: ruins 25%, tower 50%)
    enchant = {"function": "minecraft:enchant_randomly", "options": "#minecraft:on_random_loot"}
    enchant30 = {"function": "minecraft:enchant_with_levels", "levels": {"type": "minecraft:uniform", "min": 20, "max": 39},
                 "options": "#minecraft:on_random_loot"}
    rod = lambda weight_empty: {"rolls": 1, "entries": [empty(weight_empty), item(f"{M}:void_rod", 1)]}  # noqa: E731
    loot("chests/obsidian_ruins", {"type": "minecraft:chest", "pools": [
        {"rolls": {"type": "minecraft:uniform", "min": 3, "max": 6}, "entries": [
            item(f"{M}:obsidian_shard", 12, (1, 4)), item("minecraft:obsidian", 8, (1, 3)), item("minecraft:crying_obsidian", 6, (1, 2)),
            item("minecraft:ender_pearl", 8, (1, 2)), item("minecraft:chorus_fruit", 8, (2, 6)), item("minecraft:gold_ingot", 6, (1, 4)),
            item("minecraft:iron_ingot", 6, (1, 4)), item(f"{M}:polished_obsidian", 4, (2, 6)), item("minecraft:diamond", 2),
            item("minecraft:experience_bottle", 3, (1, 3)), item(f"{M}:meteorite", 1), item("minecraft:book", 2, functions=[enchant])]},
        rod(3)]})
    loot("chests/end_shrine", {"type": "minecraft:chest", "pools": [
        {"rolls": {"type": "minecraft:uniform", "min": 3, "max": 6}, "entries": [
            item("minecraft:chorus_fruit", 12, (2, 8)), item("minecraft:popped_chorus_fruit", 8, (2, 6)),
            item("minecraft:ender_pearl", 10, (1, 3)), item("minecraft:end_rod", 6, (1, 4)), item("minecraft:purpur_block", 6, (2, 6)),
            item("minecraft:gold_ingot", 6, (1, 4)), item("minecraft:emerald", 5, (1, 3)), item(f"{M}:end_grass", 4, (2, 6)),
            item(f"{M}:end_moss_block", 4, (1, 4)), item("minecraft:experience_bottle", 4, (1, 3)),
            item("minecraft:book", 3, functions=[enchant]), item("minecraft:shulker_shell", 1)]}]})
    loot("chests/monolith_tower", {"type": "minecraft:chest", "pools": [
        {"rolls": {"type": "minecraft:uniform", "min": 4, "max": 7}, "entries": [
            item(f"{M}:obsidian_shard", 12, (2, 6)), item("minecraft:ender_pearl", 10, (2, 4)), item("minecraft:gold_ingot", 8, (2, 6)),
            item("minecraft:iron_ingot", 8, (2, 6)), item("minecraft:diamond", 4, (1, 2)), item("minecraft:emerald", 5, (2, 4)),
            item("minecraft:crying_obsidian", 6, (1, 3)), item(f"{M}:meteorite", 2), item(f"{M}:polished_meteorite", 2, (1, 3)),
            item("minecraft:experience_bottle", 5, (1, 3)), item("minecraft:iron_sword", 2, functions=[enchant30]),
            item("minecraft:diamond_pickaxe", 1, functions=[enchant30]), item("minecraft:book", 3, functions=[enchant])]},
        rod(1)]})
    loot("chests/monolith_tower_treasure", {"type": "minecraft:chest", "pools": [
        {"rolls": {"type": "minecraft:uniform", "min": 5, "max": 8}, "entries": [
            item("minecraft:diamond", 10, (2, 5)), item("minecraft:emerald", 8, (4, 8)), item(f"{M}:meteorite", 6, (1, 3)),
            item(f"{M}:obsidian_shard", 8, (4, 10)), item("minecraft:golden_apple", 4), item("minecraft:enchanted_golden_apple", 1),
            item("minecraft:shulker_shell", 3, (1, 2)), item("minecraft:netherite_scrap", 2), item("minecraft:ender_eye", 4, (1, 3)),
            item("minecraft:book", 6, functions=[enchant30]), item("minecraft:diamond_sword", 3, functions=[enchant30]),
            item("minecraft:diamond_chestplate", 2, functions=[enchant30])]},
        rod(1)]})

    def archaeology(name, entries):
        loot("archaeology/" + name, {"type": "minecraft:archaeology", "pools": [{"rolls": 1, "bonus_rolls": 0, "entries": entries}]})

    archaeology("dead_end", [item(f"{M}:obsidian_shard", 6), item("minecraft:chorus_fruit", 5), item("minecraft:popped_chorus_fruit", 3),
                             item("minecraft:ender_pearl", 3), item("minecraft:gold_nugget", 4), item("minecraft:iron_nugget", 4),
                             item("minecraft:end_rod", 2), item(f"{M}:meteorite", 1), item("minecraft:shulker_shell", 1)])
    archaeology("obsidian_ruins", [item(f"{M}:obsidian_shard", 8), item("minecraft:crying_obsidian", 4), item(f"{M}:polished_obsidian", 3),
                                   item(f"{M}:chiseled_obsidian", 2), item("minecraft:ender_pearl", 3), item("minecraft:gold_ingot", 3),
                                   item("minecraft:diamond", 1), item(f"{M}:meteorite", 1), item("minecraft:experience_bottle", 2)])

    # ---------------------------------------------------------------------------------------- recipes
    R = os.path.join(D, M, "recipe")

    def recipe(name, obj):
        w(os.path.join(R, name + ".json"), obj)

    def shaped(name, pattern, key, result, count=1, category="building"):
        recipe(name, {"type": "minecraft:crafting_shaped", "category": category, "pattern": pattern,
                      "key": {c: {"item": v} for c, v in key.items()}, "result": {"id": result, "count": count}})

    def cutting(src, dst, count=1):
        recipe(f"{dst.split(':')[1]}_from_{src.split(':')[1]}_stonecutting", {"type": "minecraft:stonecutting",
               "ingredient": {"item": src}, "result": {"id": dst, "count": count}})

    def smelt(src, dst):
        recipe(dst.split(":")[1], {"type": "minecraft:smelting", "category": "blocks", "cookingtime": 200, "experience": 0.1,
                                    "ingredient": {"item": src}, "result": {"id": dst}})

    def shapes(base, prefix):
        b = f"{M}:{base}"
        shaped(prefix + "_stairs", ["#  ", "## ", "###"], {"#": b}, f"{M}:{prefix}_stairs", 4)
        shaped(prefix + "_slab", ["###"], {"#": b}, f"{M}:{prefix}_slab", 6)
        shaped(prefix + "_wall", ["###", "###"], {"#": b}, f"{M}:{prefix}_wall", 6, "misc")

    # 2x2 chains: obsidian -> polished -> bricks -> tiles, meteorite -> polished -> bricks
    chain = [("minecraft:obsidian", "polished_obsidian"), (f"{M}:polished_obsidian", "obsidian_bricks"),
             (f"{M}:obsidian_bricks", "obsidian_tiles"), (f"{M}:meteorite", "polished_meteorite"),
             (f"{M}:polished_meteorite", "meteorite_bricks")]
    for src, dst in chain:
        shaped(dst, ["SS", "SS"], {"S": src}, f"{M}:{dst}", 4)
    for base, (_, prefix) in SHAPED_SETS.items():
        shapes(base, prefix)
    shaped("chiseled_obsidian", ["#", "#"], {"#": f"{M}:obsidian_brick_slab"}, f"{M}:chiseled_obsidian")
    smelt(f"{M}:obsidian_bricks", f"{M}:cracked_obsidian_bricks")
    smelt(f"{M}:obsidian_tiles", f"{M}:cracked_obsidian_tiles")
    # the stonecutter: everything down the chain, like deepslate
    down = {
        "minecraft:obsidian": ["polished_obsidian", "obsidian_bricks", "obsidian_tiles", "chiseled_obsidian", ("polished_obsidian", "polished_obsidian"),
                               ("obsidian_bricks", "obsidian_brick"), ("obsidian_tiles", "obsidian_tile")],
        f"{M}:polished_obsidian": ["obsidian_bricks", "obsidian_tiles", ("polished_obsidian", "polished_obsidian"),
                                   ("obsidian_bricks", "obsidian_brick"), ("obsidian_tiles", "obsidian_tile")],
        f"{M}:obsidian_bricks": ["obsidian_tiles", ("obsidian_bricks", "obsidian_brick"), ("obsidian_tiles", "obsidian_tile")],
        f"{M}:obsidian_tiles": [("obsidian_tiles", "obsidian_tile")],
        f"{M}:meteorite": ["polished_meteorite", "meteorite_bricks", ("meteorite_bricks", "meteorite_brick")],
        f"{M}:polished_meteorite": ["meteorite_bricks", ("meteorite_bricks", "meteorite_brick")],
        f"{M}:meteorite_bricks": [("meteorite_bricks", "meteorite_brick")],
    }
    for src, outs in down.items():
        for o in outs:
            if isinstance(o, tuple):
                _, prefix = o
                cutting(src, f"{M}:{prefix}_stairs")
                cutting(src, f"{M}:{prefix}_slab", 2)
                cutting(src, f"{M}:{prefix}_wall")
            else:
                cutting(src, f"{M}:{o}")
    # dye, fruit
    recipe("purple_dye_from_end_grass", {"type": "minecraft:crafting_shapeless", "category": "misc", "group": "purple_dye",
                                         "ingredients": [{"item": f"{M}:end_grass"}], "result": {"id": "minecraft:purple_dye", "count": 1}})
    recipe("purple_dye_from_tall_end_grass", {"type": "minecraft:crafting_shapeless", "category": "misc", "group": "purple_dye",
                                              "ingredients": [{"item": f"{M}:tall_end_grass"}],
                                              "result": {"id": "minecraft:purple_dye", "count": 2}})
    shaped("chorus_fruit_block", ["###", "###", "###"], {"#": "minecraft:chorus_fruit"}, f"{M}:chorus_fruit_block")
    recipe("chorus_fruit_from_block", {"type": "minecraft:crafting_shapeless", "category": "misc",
                                       "ingredients": [{"item": f"{M}:chorus_fruit_block"}],
                                       "result": {"id": "minecraft:chorus_fruit", "count": 9}})

    # ---------------------------------------------------------------------------------------- tags
    def tag(path, values):
        w(os.path.join(D, *path) + ".json", {"replace": False, "values": values})

    ids = lambda names: [f"{M}:{n}" for n in names]  # noqa: E731
    stairs = ids([p + "_stairs" for _, p in SHAPED_SETS.values()])
    slabs = ids([p + "_slab" for _, p in SHAPED_SETS.values()])
    walls = ids([p + "_wall" for _, p in SHAPED_SETS.values()])
    for kind in ("block", "item"):
        tag(["minecraft", "tags", kind, "stairs"], stairs)
        tag(["minecraft", "tags", kind, "slabs"], slabs)
        tag(["minecraft", "tags", kind, "walls"], walls)
    tag(["minecraft", "tags", "block", "mineable", "pickaxe"], ids(["end_grass_block"] + METEORITE_BLOCKS + OBSIDIAN_BLOCKS))
    tag(["minecraft", "tags", "block", "mineable", "shovel"], ids(["end_sand", "suspicious_end_sand"]))
    tag(["minecraft", "tags", "block", "mineable", "hoe"], ids(["end_moss_block", "end_moss_carpet"]))
    tag(["minecraft", "tags", "block", "mineable", "axe"], ids(["chorus_stem", "chorus_roots", "chorus_fruit_block"]))
    tag(["minecraft", "tags", "block", "needs_diamond_tool"], ids(["meteorite", "meteorite_core"] + OBSIDIAN_BLOCKS))
    tag(["minecraft", "tags", "block", "dragon_immune"], ids(OBSIDIAN_BLOCKS))
    tag(["minecraft", "tags", "block", "replaceable"], ids(["end_grass", "tall_end_grass", "dry_end_bush"]))
    tag(["minecraft", "tags", "block", "replaceable_by_trees"], ids(["end_grass", "tall_end_grass", "dry_end_bush"]))
    tag(["minecraft", "tags", "block", "sword_efficient"], ids(["end_grass", "tall_end_grass", "dry_end_bush"]))
    tag([M, "tags", "block", "end_moss_replaceable"], ["minecraft:end_stone", f"{M}:end_grass_block"])

    # ---------------------------------------------------------------------------------------- biomes and features
    W = os.path.join(D, M, "worldgen")
    for f in ("end_surface", "floating_islands", "end_rocks", "end_vegetation"):
        w(os.path.join(W, "configured_feature", f + ".json"), {"type": f"{M}:{f}", "config": {}})
        # no modifiers: once a chunk, checking the biome column by column
        w(os.path.join(W, "placed_feature", f + ".json"), {"feature": f"{M}:{f}", "placement": []})
    # End Moss's bone meal: a vegetation patch, like moss
    w(os.path.join(W, "configured_feature", "end_moss_patch_bonemeal.json"), {"type": "minecraft:vegetation_patch", "config": {
        "depth": 1, "extra_bottom_block_chance": 0.0, "extra_edge_column_chance": 0.75,
        "ground_state": {"type": "minecraft:simple_state_provider", "state": {"Name": f"{M}:end_moss_block"}},
        "replaceable": f"#{M}:end_moss_replaceable", "surface": "floor", "vegetation_chance": 0.6,
        "vegetation_feature": {"feature": {"type": "minecraft:simple_block", "config": {"to_place": {
            "type": "minecraft:weighted_state_provider", "entries": [
                {"weight": 25, "data": {"Name": f"{M}:end_moss_carpet"}},
                {"weight": 25, "data": {"Name": f"{M}:end_grass"}},
                {"weight": 8, "data": {"Name": f"{M}:tall_end_grass", "Properties": {"half": "lower"}}}]}}}, "placement": []},
        "vertical_range": 5, "xz_radius": {"type": "minecraft:uniform", "min_inclusive": 1, "max_inclusive": 2}}})

    def features():
        return [[f"{M}:end_surface", f"{M}:floating_islands"], [], [f"{M}:end_rocks"], [], ["minecraft:end_gateway_return"],
                [], [], [], [], [f"{M}:end_vegetation"]]

    def biome(name, particle, probability, creatures, monsters):
        w(os.path.join(W, "biome", name + ".json"), {
            "has_precipitation": False, "temperature": 0.5, "downfall": 0.5,
            "effects": {"fog_color": 10518688, "sky_color": 0, "water_color": 4159204, "water_fog_color": 329011,
                        "particle": {"options": {"type": f"{M}:{particle}"}, "probability": probability},
                        "mood_sound": {"sound": "minecraft:ambient.cave", "tick_delay": 6000, "block_search_extent": 8, "offset": 2.0}},
            "spawners": {"creature": creatures, "monster": monsters, "ambient": [], "axolotls": [], "misc": [],
                         "underground_water_creature": [], "water_ambient": [], "water_creature": []},
            "spawn_costs": {}, "carvers": {}, "features": features()})

    biome("chorus_meadows", "end_spore", 0.004, [spawn(f"{M}:endling", 10, 2, 4)],
          [spawn(f"{M}:enderfly", 8, 1, 3), spawn(f"{M}:gucker", 4, 1, 1), spawn("minecraft:enderman", 10, 1, 4)])
    biome("dead_end", "end_dust", 0.007, [],
          [spawn(f"{M}:gucker", 6, 1, 2), spawn(f"{M}:obolisk", 2, 1, 1), spawn(f"{M}:enderfly", 2, 1, 2),
           spawn("minecraft:enderman", 10, 1, 4)])
    both = [f"{M}:chorus_meadows", f"{M}:dead_end"]
    tag(["minecraft", "tags", "worldgen", "biome", "is_end"], both)
    tag(["minecraft", "tags", "worldgen", "biome", "has_structure", "end_city"], both)   # End Cities still rise in them
    tag([M, "tags", "worldgen", "biome", "has_obsidian_ruins"], [f"{M}:dead_end"])
    tag([M, "tags", "worldgen", "biome", "has_end_shrine"], [f"{M}:chorus_meadows"])
    tag([M, "tags", "worldgen", "biome", "has_monolith_tower"], [f"{M}:dead_end"])

    # ---------------------------------------------------------------------------------------- structures
    for name, spacing, separation, salt, exclusion in (
            ("obsidian_ruins", 28, 10, 20261201, (f"{M}:monolith_tower", 3)),
            ("end_shrine", 32, 12, 20261202, ("minecraft:end_cities", 3)),
            ("monolith_tower", 48, 20, 20261203, ("minecraft:end_cities", 5))):
        w(os.path.join(W, "structure", name + ".json"), {
            "type": f"{M}:{name}", "biomes": f"#{M}:has_{name}", "step": "surface_structures",
            "spawn_overrides": {}, "terrain_adaptation": "none"})
        w(os.path.join(W, "structure_set", name + ".json"), {
            "structures": [{"structure": f"{M}:{name}", "weight": 1}],
            "placement": {"type": "minecraft:random_spread", "spacing": spacing, "separation": separation, "salt": salt,
                          "exclusion_zone": {"other_set": exclusion[0], "chunk_count": exclusion[1]}}})

    # ---------------------------------------------------------------------------------------- particles
    texdir = os.path.join(A, "textures", "particle")
    fallback = {"end_spore": [f"minecraft:glitter_{i}" for i in range(7, -1, -1)],
                "end_dust": [f"minecraft:generic_{i}" for i in range(8)],
                "meteor_spark": [f"minecraft:spark_{i}" for i in range(8)]}
    for name, fb in fallback.items():
        frames = []
        if os.path.isdir(texdir):
            frames = sorted((f[:-4] for f in os.listdir(texdir) if f.startswith(name + "_") and f[len(name) + 1:-4].isdigit()
                             and f.endswith(".png")), key=lambda f: int(f.rsplit("_", 1)[1]))
        w(os.path.join(A, "particles", name + ".json"), {"textures": [f"{M}:{f}" for f in frames] or fb})

    # ---------------------------------------------------------------------------------------- lang
    lang = {"itemGroup.winterworks.end": "Winterworks: The Living End",
            "biome.winterworks.chorus_meadows": "Chorus Meadows", "biome.winterworks.dead_end": "The Dead End",
            "structure.winterworks.obsidian_ruins": "Obsidian Ruins", "structure.winterworks.end_shrine": "End Shrine",
            "structure.winterworks.monolith_tower": "Monolith Tower",
            "message.winterworks.endstructure.built": "Built %s at %s, %s, %s"}
    for b, name in LANG_BLOCKS.items():
        lang[f"block.winterworks.{b}"] = name
    w(os.path.join(ctx.L, "end_world.json"), lang)
