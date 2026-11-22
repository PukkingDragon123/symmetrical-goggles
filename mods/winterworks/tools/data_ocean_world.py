"""Data for the world (docs/OCEAN_UPDATE.md sections 1, 2, 6, 7). Called by gen_data.py with ctx = gen_data.Ctx.

Blockstates, block and item models for Ash Sand, the ashstone set and barnacles (the vent's, tube worms' and the horn's
are the art's, and stay as they are); loot tables, recipes and tags of the world's blocks; the volcanic depths and the
abyssal trench (biomes, their placed features, biome tags); the carving, vent and reef features; the deep shipwreck,
sunken treasure and whale skeleton (structures, structure sets, biome tags); the chest loot of those and of the
reworked ocean monuments; and lang/ocean_world.json.
"""
import os

M = "winterworks"

# the ashstone set: base block -> (texture, prefix of its stairs/slab/wall)
SHAPED = {
    "ashstone": ("ashstone", "ashstone"),
    "polished_ashstone": ("polished_ashstone", "polished_ashstone"),
    "ashstone_bricks": ("ashstone_bricks", "ashstone_brick"),
}
CUBES = ["ash_sand", "ashstone", "polished_ashstone", "ashstone_bricks", "cracked_ashstone_bricks"]
ASHSTONE_BLOCKS = ["ashstone", "ashstone_stairs", "ashstone_slab", "ashstone_wall", "polished_ashstone", "polished_ashstone_stairs",
                   "polished_ashstone_slab", "polished_ashstone_wall", "ashstone_bricks", "ashstone_brick_stairs", "ashstone_brick_slab",
                   "ashstone_brick_wall", "cracked_ashstone_bricks", "chiseled_ashstone"]

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
    "hydrothermal_vent": "Hydrothermal Vent", "tube_worms": "Tube Worms", "ash_sand": "Ash Sand", "ashstone": "Ashstone",
    "ashstone_stairs": "Ashstone Stairs", "ashstone_slab": "Ashstone Slab", "ashstone_wall": "Ashstone Wall",
    "polished_ashstone": "Polished Ashstone", "polished_ashstone_stairs": "Polished Ashstone Stairs",
    "polished_ashstone_slab": "Polished Ashstone Slab", "polished_ashstone_wall": "Polished Ashstone Wall",
    "ashstone_bricks": "Ashstone Bricks", "ashstone_brick_stairs": "Ashstone Brick Stairs", "ashstone_brick_slab": "Ashstone Brick Slab",
    "ashstone_brick_wall": "Ashstone Brick Wall", "cracked_ashstone_bricks": "Cracked Ashstone Bricks",
    "chiseled_ashstone": "Chiseled Ashstone", "barnacles": "Barnacles",
}

# ------------------------------------------------------------------------------------------------ the biomes
# Vanilla's deep ocean feature lists, per generation step (OverworldBiomes.ocean / lukeWarmOcean with deep = true,
# same order, so no feature-order cycles). The carving (ocean_depths) comes in through the Fabric biome API, like
# every other ocean biome (ocean.OceanWorldFeature).
ORES = ["minecraft:ore_dirt", "minecraft:ore_gravel", "minecraft:ore_granite_upper", "minecraft:ore_granite_lower",
        "minecraft:ore_diorite_upper", "minecraft:ore_diorite_lower", "minecraft:ore_andesite_upper", "minecraft:ore_andesite_lower",
        "minecraft:ore_tuff", "minecraft:ore_coal_upper", "minecraft:ore_coal_lower", "minecraft:ore_iron_upper",
        "minecraft:ore_iron_middle", "minecraft:ore_iron_small", "minecraft:ore_gold", "minecraft:ore_gold_lower",
        "minecraft:ore_redstone", "minecraft:ore_redstone_lower", "minecraft:ore_diamond", "minecraft:ore_diamond_medium",
        "minecraft:ore_diamond_large", "minecraft:ore_diamond_buried", "minecraft:ore_lapis", "minecraft:ore_lapis_buried",
        "minecraft:ore_copper", "minecraft:underwater_magma", "minecraft:disk_sand", "minecraft:disk_clay", "minecraft:disk_gravel"]
VEG = ["minecraft:glow_lichen", "minecraft:trees_water", "minecraft:flower_default", "minecraft:patch_grass_badlands",
       "minecraft:brown_mushroom_normal", "minecraft:red_mushroom_normal", "minecraft:patch_sugar_cane", "minecraft:patch_pumpkin"]


def ocean_features(seagrass, kelp, local=()):
    return [[], ["minecraft:lake_lava_underground", "minecraft:lake_lava_surface"], ["minecraft:amethyst_geode"] + list(local),
            ["minecraft:monster_room", "minecraft:monster_room_deep"], [], [], list(ORES), [],
            ["minecraft:spring_water", "minecraft:spring_lava"], VEG + [seagrass, "minecraft:seagrass_simple", kelp],
            ["minecraft:freeze_top_layer"]]


def spawn(t, w, lo, hi):
    return {"type": t, "weight": w, "minCount": lo, "maxCount": hi}


# vanilla's common monsters (BiomeDefaultFeatures.commonSpawns) and the drowned of the oceans
MONSTERS = [spawn("minecraft:spider", 100, 4, 4), spawn("minecraft:zombie", 95, 4, 4), spawn("minecraft:zombie_villager", 5, 1, 1),
            spawn("minecraft:skeleton", 100, 4, 4), spawn("minecraft:creeper", 100, 4, 4), spawn("minecraft:slime", 100, 4, 4),
            spawn("minecraft:enderman", 10, 1, 4), spawn("minecraft:witch", 5, 1, 1), spawn("minecraft:drowned", 5, 1, 1)]


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

    def block_item(name, model=None):
        im(name, {"parent": f"{M}:block/{model or name}"})

    # ---------------------------------------------------------------------------------------- models
    for c in CUBES:
        bm(c, {"parent": "minecraft:block/cube_all", "textures": {"all": tex(c)}})
        bs(c, {"variants": {"": ref(c)}})
        block_item(c)
    bm("chiseled_ashstone", {"parent": "minecraft:block/cube_column", "textures": {"end": tex("chiseled_ashstone_top"),
                                                                                   "side": tex("chiseled_ashstone")}})
    bs("chiseled_ashstone", {"variants": {"": ref("chiseled_ashstone")}})
    block_item("chiseled_ashstone")
    # barnacles: a crust that tiles in any turn
    bm("barnacles", {"parent": "minecraft:block/cube_all", "textures": {"all": tex("barnacles")}})
    bs("barnacles", {"variants": {"": [ref("barnacles", y=r) if r else ref("barnacles") for r in (0, 90, 180, 270)]}})
    block_item("barnacles")
    for base, (texture, prefix) in SHAPED.items():
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

    # ---------------------------------------------------------------------------------------- block loot
    def loot(path, obj):
        w(os.path.join(D, M, "loot_table", *path.split("/")) + ".json", obj)

    survives = [{"condition": "minecraft:survives_explosion"}]
    silk = {"condition": "minecraft:match_tool", "predicate": {"predicates": {"minecraft:enchantments": [
        {"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}

    def drops_self(name):
        loot("blocks/" + name, {"type": "minecraft:block", "pools": [{"rolls": 1, "bonus_rolls": 0, "entries": [
            {"type": "minecraft:item", "name": f"{M}:{name}"}], "conditions": survives}]})

    for b in [b for b in ASHSTONE_BLOCKS if not b.endswith("_slab")] + ["ash_sand", "barnacles", "hydrothermal_vent"]:
        drops_self(b)
    for _, prefix in SHAPED.values():
        slab = prefix + "_slab"
        loot("blocks/" + slab, {"type": "minecraft:block", "pools": [{"rolls": 1, "bonus_rolls": 0, "entries": [
            {"type": "minecraft:item", "name": f"{M}:{slab}", "functions": [
                {"function": "minecraft:set_count", "count": 2, "add": False, "conditions": [
                    {"condition": "minecraft:block_state_property", "block": f"{M}:{slab}", "properties": {"type": "double"}}]},
                {"function": "minecraft:explosion_decay"}]}]}]})
    # tube worms: only Silk Touch gets them out whole
    loot("blocks/tube_worms", {"type": "minecraft:block", "pools": [{"rolls": 1, "bonus_rolls": 0, "conditions": [silk],
                                                                      "entries": [{"type": "minecraft:item", "name": f"{M}:tube_worms"}]}]})

    # ---------------------------------------------------------------------------------------- chest loot
    ench = {"function": "minecraft:enchant_randomly", "options": "#minecraft:on_random_loot"}
    sea_books = {"function": "minecraft:enchant_randomly", "options": [
        "minecraft:depth_strider", "minecraft:respiration", "minecraft:aqua_affinity", "minecraft:impaling", "minecraft:riptide",
        "minecraft:loyalty", "minecraft:frost_walker", "minecraft:luck_of_the_sea", "minecraft:lure"]}
    ench30 = {"function": "minecraft:enchant_with_levels", "levels": {"type": "minecraft:uniform", "min": 20, "max": 39},
              "options": "#minecraft:on_random_loot"}
    worn = {"function": "minecraft:set_damage", "damage": {"type": "minecraft:uniform", "min": 0.25, "max": 0.7}}

    def chest(name, rolls, entries, *extra):
        loot("chests/" + name, {"type": "minecraft:chest", "pools": [
            {"rolls": {"type": "minecraft:uniform", "min": rolls[0], "max": rolls[1]}, "entries": entries}] + list(extra)})

    chest("deep_shipwreck_supply", (4, 8), [
        item("minecraft:bread", 8, (1, 4)), item("minecraft:potato", 7, (2, 6)), item("minecraft:carrot", 7, (3, 8)),
        item("minecraft:wheat", 6, (6, 18)), item("minecraft:coal", 6, (2, 8)), item("minecraft:rotten_flesh", 5, (4, 16)),
        item("minecraft:paper", 6, (2, 10)), item("minecraft:gunpowder", 4, (1, 5)), item("minecraft:tnt", 1, (1, 2)),
        item("minecraft:dried_kelp", 5, (3, 10)), item("minecraft:leather_helmet", 2, functions=[ench]),
        item("minecraft:leather_chestplate", 2, functions=[ench]), item("minecraft:leather_boots", 2, functions=[ench]),
        item("minecraft:emerald", 3, (1, 3)), item("minecraft:nautilus_shell", 2), item(f"{M}:turtle_shell_shard", 2, (1, 2))])
    chest("deep_shipwreck_cargo", (3, 6), [
        item("minecraft:iron_ingot", 10, (2, 6)), item("minecraft:gold_ingot", 6, (1, 4)), item("minecraft:copper_ingot", 8, (3, 9)),
        item("minecraft:emerald", 6, (1, 4)), item("minecraft:lapis_lazuli", 6, (4, 10)), item("minecraft:amethyst_shard", 4, (2, 6)),
        item("minecraft:glass_bottle", 4, (2, 5)), item("minecraft:sugar", 4, (3, 9)), item("minecraft:cocoa_beans", 4, (3, 8)),
        item("minecraft:gunpowder", 4, (2, 6)), item("minecraft:leather", 5, (2, 6)), item("minecraft:string", 4, (2, 6)),
        item("minecraft:honey_bottle", 2), item("minecraft:spyglass", 1)])
    chest("deep_shipwreck_treasure", (4, 7), [
        item("minecraft:gold_ingot", 10, (3, 8)), item("minecraft:gold_block", 2, (1, 2)), item("minecraft:diamond", 5, (1, 4)),
        item("minecraft:emerald", 8, (3, 8)), item("minecraft:lapis_lazuli", 4, (3, 9)), item("minecraft:experience_bottle", 5, (1, 4)),
        item("minecraft:book", 6, functions=[sea_books]), item("minecraft:diamond_sword", 2, functions=[ench30]),
        item("minecraft:golden_apple", 3), item("minecraft:enchanted_golden_apple", 1), item("minecraft:nautilus_shell", 4, (1, 2)),
        item("minecraft:trident", 1, functions=[worn])])
    chest("sunken_treasure", (3, 6), [
        item("minecraft:gold_ingot", 10, (2, 6)), item("minecraft:diamond", 5, (1, 3)), item("minecraft:emerald", 6, (2, 6)),
        item("minecraft:prismarine_crystals", 5, (2, 8)), item("minecraft:iron_ingot", 8, (2, 6)), item("minecraft:nautilus_shell", 3),
        item("minecraft:book", 3, functions=[sea_books]), item("minecraft:golden_apple", 2), item("minecraft:tnt", 2, (1, 2)),
        item("minecraft:gold_block", 1)],
        {"rolls": 1, "entries": [empty(3), item("minecraft:heart_of_the_sea", 1)]})   # the Heart of the Sea, one in four
    chest("whale_skeleton", (3, 5), [
        item("minecraft:bone", 10, (3, 9)), item("minecraft:bone_meal", 8, (4, 12)), item("minecraft:cod", 6, (1, 4)),
        item("minecraft:salmon", 5, (1, 3)), item("minecraft:ink_sac", 5, (1, 4)), item("minecraft:nautilus_shell", 4, (1, 2)),
        item("minecraft:prismarine_shard", 5, (1, 6)), item("minecraft:gold_nugget", 6, (3, 12)), item("minecraft:iron_nugget", 6, (3, 12)),
        item(f"{M}:angler_lure", 2), item("minecraft:experience_bottle", 2, (1, 2)), item("minecraft:emerald", 3, (1, 3))])
    chest("monument_treasure", (4, 7), [
        item("minecraft:gold_ingot", 10, (2, 7)), item("minecraft:gold_block", 3, (1, 2)), item("minecraft:prismarine_crystals", 8, (3, 9)),
        item("minecraft:prismarine_shard", 8, (3, 9)), item("minecraft:wet_sponge", 6, (1, 3)), item("minecraft:sea_lantern", 5, (1, 4)),
        item("minecraft:diamond", 4, (1, 3)), item("minecraft:emerald", 5, (2, 5)), item("minecraft:book", 5, functions=[sea_books]),
        item(f"{M}:guardian_scale", 6, (1, 3)), item("minecraft:experience_bottle", 4, (1, 3))])
    chest("monument_wing", (3, 6), [
        item("minecraft:prismarine_shard", 10, (2, 8)), item("minecraft:prismarine_crystals", 8, (2, 6)),
        item("minecraft:wet_sponge", 6, (1, 2)), item("minecraft:sea_lantern", 4, (1, 3)), item("minecraft:gold_ingot", 6, (1, 4)),
        item("minecraft:cooked_cod", 5, (2, 5)), item(f"{M}:guardian_scale", 6, (1, 2)), item("minecraft:book", 3, functions=[sea_books]),
        item("minecraft:iron_ingot", 5, (1, 4)), item("minecraft:nautilus_shell", 2)])
    chest("monument_core", (5, 8), [
        item("minecraft:gold_block", 6, (1, 3)), item("minecraft:gold_ingot", 10, (4, 10)), item("minecraft:diamond", 6, (2, 5)),
        item("minecraft:emerald", 6, (3, 8)), item("minecraft:prismarine_crystals", 6, (4, 12)), item("minecraft:heart_of_the_sea", 1),
        item("minecraft:enchanted_golden_apple", 1), item("minecraft:trident", 2, functions=[ench30]),
        item("minecraft:diamond_chestplate", 2, functions=[ench30]), item("minecraft:diamond_helmet", 2, functions=[ench30]),
        item("minecraft:book", 4, functions=[ench30]), item(f"{M}:guardian_scale", 8, (2, 5)), item("minecraft:sponge", 4, (2, 4)),
        item("minecraft:experience_bottle", 6, (2, 6))])

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

    def smelt(name, src, dst, xp=0.1):
        recipe(name, {"type": "minecraft:smelting", "category": "blocks", "cookingtime": 200, "experience": xp,
                      "ingredient": {"item": src}, "result": {"id": dst}})

    smelt("ashstone", f"{M}:ash_sand", f"{M}:ashstone")
    smelt("cracked_ashstone_bricks", f"{M}:ashstone_bricks", f"{M}:cracked_ashstone_bricks")
    shaped("polished_ashstone", ["SS", "SS"], {"S": f"{M}:ashstone"}, f"{M}:polished_ashstone", 4)
    shaped("ashstone_bricks", ["SS", "SS"], {"S": f"{M}:polished_ashstone"}, f"{M}:ashstone_bricks", 4)
    shaped("chiseled_ashstone", ["#", "#"], {"#": f"{M}:ashstone_brick_slab"}, f"{M}:chiseled_ashstone")
    for base, (_, prefix) in SHAPED.items():
        b = f"{M}:{base}"
        shaped(prefix + "_stairs", ["#  ", "## ", "###"], {"#": b}, f"{M}:{prefix}_stairs", 4)
        shaped(prefix + "_slab", ["###"], {"#": b}, f"{M}:{prefix}_slab", 6)
        shaped(prefix + "_wall", ["###", "###"], {"#": b}, f"{M}:{prefix}_wall", 6, "misc")
    # the stonecutter: everything down the chain, like deepslate (a tuple is a prefix: its stairs, slab and wall)
    down = {
        "ashstone": ["polished_ashstone", "ashstone_bricks", "chiseled_ashstone", ("ashstone",), ("polished_ashstone",), ("ashstone_brick",)],
        "polished_ashstone": ["ashstone_bricks", "chiseled_ashstone", ("polished_ashstone",), ("ashstone_brick",)],
        "ashstone_bricks": ["chiseled_ashstone", ("ashstone_brick",)],
    }
    for src, outs in down.items():
        for o in outs:
            if isinstance(o, tuple):
                cutting(f"{M}:{src}", f"{M}:{o[0]}_stairs")
                cutting(f"{M}:{src}", f"{M}:{o[0]}_slab", 2)
                cutting(f"{M}:{src}", f"{M}:{o[0]}_wall")
            else:
                cutting(f"{M}:{src}", f"{M}:{o}")

    # ---------------------------------------------------------------------------------------- block tags
    def tag(path, values):
        w(os.path.join(D, *path) + ".json", {"replace": False, "values": values})

    ids = lambda names: [f"{M}:{n}" for n in names]  # noqa: E731
    for kind in ("block", "item"):
        tag(["minecraft", "tags", kind, "stairs"], ids([p + "_stairs" for _, p in SHAPED.values()]))
        tag(["minecraft", "tags", kind, "slabs"], ids([p + "_slab" for _, p in SHAPED.values()]))
        tag(["minecraft", "tags", kind, "walls"], ids([p + "_wall" for _, p in SHAPED.values()]))
    tag(["minecraft", "tags", "block", "mineable", "pickaxe"], ids(ASHSTONE_BLOCKS + ["barnacles", "hydrothermal_vent"]))
    tag(["minecraft", "tags", "block", "mineable", "shovel"], ids(["ash_sand"]))
    tag(["minecraft", "tags", "block", "needs_stone_tool"], ids(["barnacles"]))
    tag(["minecraft", "tags", "block", "sword_efficient"], ids(["tube_worms"]))

    # ---------------------------------------------------------------------------------------- features
    W = os.path.join(D, M, "worldgen")
    for f in ("ocean_depths", "volcanic_vents"):
        w(os.path.join(W, "configured_feature", f + ".json"), {"type": f"{M}:{f}", "config": {}})
        # no modifiers: once a chunk, checking the biome column by column
        w(os.path.join(W, "placed_feature", f + ".json"), {"feature": f"{M}:{f}", "placement": []})
    w(os.path.join(W, "configured_feature", "reef_sponges.json"), {"type": f"{M}:reef_sponges", "config": {}})
    floor = [{"type": "minecraft:in_square"}, {"type": "minecraft:heightmap", "heightmap": "OCEAN_FLOOR_WG"}, {"type": "minecraft:biome"}]
    w(os.path.join(W, "placed_feature", "reef_sponges.json"), {"feature": f"{M}:reef_sponges", "placement": [
        {"type": "minecraft:rarity_filter", "chance": 3}] + floor})
    # reefs get denser seagrass, kelp and sea pickles (vanilla's own configured features, placed more often)
    w(os.path.join(W, "placed_feature", "reef_seagrass.json"), {"feature": "minecraft:seagrass_tall", "placement": [
        floor[0], floor[1], {"type": "minecraft:count", "count": 40}, floor[2]]})
    w(os.path.join(W, "placed_feature", "reef_kelp.json"), {"feature": "minecraft:kelp", "placement": [
        {"type": "minecraft:noise_based_count", "noise_to_count_ratio": 40, "noise_factor": 80.0, "noise_offset": 0.0}] + floor})
    w(os.path.join(W, "placed_feature", "reef_sea_pickle.json"), {"feature": "minecraft:sea_pickle", "placement": [
        {"type": "minecraft:rarity_filter", "chance": 4}] + floor})

    # ---------------------------------------------------------------------------------------- the biomes
    def biome(name, temp, water, fog, creatures, ambient, features, particle=None):
        effects = {"fog_color": 12638463, "sky_color": 8103167, "water_color": water, "water_fog_color": fog,
                   "mood_sound": {"sound": "minecraft:ambient.cave", "tick_delay": 6000, "block_search_extent": 8, "offset": 2.0}}
        if particle:
            effects["particle"] = particle
        w(os.path.join(W, "biome", name + ".json"), {
            "has_precipitation": True, "temperature": temp, "downfall": 0.5, "effects": effects,
            "spawners": {"monster": MONSTERS, "creature": [], "ambient": [spawn("minecraft:bat", 10, 8, 8)],
                         "water_creature": creatures, "water_ambient": ambient,
                         "underground_water_creature": [spawn("minecraft:glow_squid", 10, 4, 6)], "axolotls": [], "misc": []},
            "spawn_costs": {}, "carvers": {"air": ["minecraft:cave", "minecraft:cave_extra_underground", "minecraft:canyon"]},
            "features": features})

    # what lives where (section 1): anglerfish in the deep and the abyss (their spawn rules sort males from
    # females by depth), nautiluses in deep oceans; whales come in through the whale's own spawn settings
    biome("volcanic_depths", 0.8, 0x3E5A5C, 0x1A1714,
          [spawn("minecraft:squid", 6, 1, 4), spawn("minecraft:dolphin", 1, 1, 2), spawn(f"{M}:nautilus", 2, 1, 1),
           spawn(f"{M}:anglerfish", 5, 1, 2)],
          [spawn("minecraft:tropical_fish", 20, 8, 8), spawn("minecraft:pufferfish", 5, 1, 3), spawn("minecraft:cod", 8, 3, 6)],
          ocean_features("minecraft:seagrass_deep_warm", "minecraft:kelp_warm", [f"{M}:volcanic_vents"]))
    biome("abyssal_trench", 0.5, 0x1F3A66, 0x02060F,
          [spawn("minecraft:squid", 4, 1, 4), spawn(f"{M}:anglerfish", 6, 1, 2), spawn(f"{M}:nautilus", 2, 1, 1)],
          [spawn("minecraft:cod", 10, 3, 6), spawn("minecraft:salmon", 5, 1, 5)],
          ocean_features("minecraft:seagrass_deep", "minecraft:kelp_cold"),
          {"options": {"type": f"{M}:bioluminescence"}, "probability": 0.004})
    both = [f"{M}:volcanic_depths", f"{M}:abyssal_trench"]
    tag(["minecraft", "tags", "worldgen", "biome", "is_ocean"], both)
    tag(["minecraft", "tags", "worldgen", "biome", "is_deep_ocean"], both)

    # ---------------------------------------------------------------------------------------- structures
    for name, spacing, separation, salt in (("deep_shipwreck", 22, 8, 20261211), ("sunken_treasure", 14, 5, 20261212),
                                            ("whale_skeleton", 20, 7, 20261213)):
        tag([M, "tags", "worldgen", "biome", "has_" + name], ["#minecraft:is_deep_ocean"])
        w(os.path.join(W, "structure", name + ".json"), {
            "type": f"{M}:{name}", "biomes": f"#{M}:has_{name}", "step": "surface_structures",
            "spawn_overrides": {}, "terrain_adaptation": "none"})
        w(os.path.join(W, "structure_set", name + ".json"), {
            "structures": [{"structure": f"{M}:{name}", "weight": 1}],
            "placement": {"type": "minecraft:random_spread", "spacing": spacing, "separation": separation, "salt": salt,
                          "exclusion_zone": {"other_set": "minecraft:ocean_monuments", "chunk_count": 4}}})

    # ---------------------------------------------------------------------------------------- lang
    lang = {"itemGroup.winterworks.ocean": "Winterworks: Tides & Treasures",
            "biome.winterworks.volcanic_depths": "Volcanic Depths", "biome.winterworks.abyssal_trench": "Abyssal Trench",
            "structure.winterworks.deep_shipwreck": "Deep Shipwreck", "structure.winterworks.sunken_treasure": "Sunken Treasure",
            "structure.winterworks.whale_skeleton": "Whale Skeleton",
            "message.winterworks.oceanstructure.built": "Built %s at %s, %s, %s",
            "message.winterworks.oceanstructure.no_floor": "There's no sea floor in front of you"}
    for b, name in LANG_BLOCKS.items():
        lang[f"block.winterworks.{b}"] = name
    w(os.path.join(ctx.L, "ocean_world.json"), lang)
