"""Data for archaeology worldgen (docs/AMBER_UPDATE.md sections 1-3): Dead Caves, cave deposits, Dig Sites, loot."""
import os

from data_cold import FEATURES, spawn


def item(name, weight=1, count=None):
    e = {"type": "minecraft:item", "name": name, "weight": weight}
    if count:
        e["functions"] = [{"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": count[0], "max": count[1]}}]
    return e


# 0.4 fixes: a Harvester Egg turns up in about 1 in 150 brushes of suspicious sand and gravel (docs/FIXES_0_4.md "The
# Harvester"): an entry as heavy as all the others together, kept only 2 times in 150 (random_chance), so 1 in 150 overall.
EGG_CHANCE = 1 / 150


def with_egg(ctx, entries):
    total = sum(e.get("weight", 1) for e in entries)
    egg = dict(item(f"{ctx.M}:harvester_egg", total),
               conditions=[{"condition": "minecraft:random_chance", "chance": round(2 * EGG_CHANCE, 6)}])
    return entries + [egg]


def archaeology(ctx, name, entries):
    if name in ("cave_amber", "cave_bones", "dead_cave", "dig_site"):   # the suspicious sand and gravel tables
        entries = with_egg(ctx, entries)
    ctx.write(os.path.join(ctx.D, ctx.M, "loot_table", "archaeology", name + ".json"),
              {"type": "minecraft:archaeology", "pools": [{"rolls": 1, "bonus_rolls": 0, "entries": entries}]})


def run(ctx):
    M = ctx.M
    W = os.path.join(ctx.D, M, "worldgen")
    # ---- features
    for f in ("cave_deposits", "dead_cave_surface"):
        ctx.write(os.path.join(W, "configured_feature", f + ".json"), {"type": f"{M}:{f}", "config": {}})
        ctx.write(os.path.join(W, "placed_feature", f + ".json"), {"feature": f"{M}:{f}", "placement": []})
    # ---- the Dead Caves biome
    feats = [list(s) for s in FEATURES]
    feats[10] = feats[10] + [f"{M}:dead_cave_surface"]
    ctx.write(os.path.join(W, "biome", "dead_caves.json"), {
        "has_precipitation": False, "temperature": 1.6, "downfall": 0.0,
        "effects": {"fog_color": 0xC9A27E, "sky_color": 0xD8B588, "water_color": 0x3F76E4, "water_fog_color": 0x050533,
                    "particle": {"options": {"type": f"{M}:cave_dust"}, "probability": 0.006},
                    "mood_sound": {"sound": "minecraft:ambient.cave", "tick_delay": 6000, "block_search_extent": 8, "offset": 2.0},
                    "music": {"sound": "minecraft:music.overworld.desert", "min_delay": 12000, "max_delay": 24000,
                              "replace_current_music": False}},
        "spawners": {"monster": [spawn("minecraft:husk", 60, 1, 3), spawn("minecraft:skeleton", 40, 1, 3),
                                 spawn("minecraft:spider", 30, 1, 2), spawn("minecraft:creeper", 25, 1, 2),
                                 spawn(f"{M}:mosquito", 25, 2, 4), spawn("minecraft:enderman", 8, 1, 1)],
                     "ambient": [spawn("minecraft:bat", 10, 8, 8)], "creature": [], "water_creature": [],
                     "underground_water_creature": [], "water_ambient": [], "misc": [], "axolotls": []},
        "spawn_costs": {},
        "carvers": {"air": ["minecraft:cave", "minecraft:cave_extra_underground", "minecraft:canyon"]},
        "features": feats})
    tag = lambda path, values: ctx.write(os.path.join(ctx.D, *path) + ".json", {"replace": False, "values": values})  # noqa
    tag(["minecraft", "tags", "worldgen", "biome", "is_overworld"], [f"{M}:ice_caves", f"{M}:dead_caves"])
    tag(["minecraft", "tags", "worldgen", "biome", "has_structure", "mineshaft"], [f"{M}:ice_caves", f"{M}:dead_caves"])
    tag([M, "tags", "worldgen", "biome", "has_dig_site"], ["#minecraft:has_structure/mineshaft", f"{M}:dead_caves"])
    # ---- the Dig Site
    ctx.write(os.path.join(W, "structure", "dig_site.json"), {
        "type": f"{M}:dig_site", "biomes": f"#{M}:has_dig_site", "step": "underground_structures",
        "spawn_overrides": {}, "terrain_adaptation": "none"})
    ctx.write(os.path.join(W, "structure_set", "dig_site.json"), {
        "structures": [{"structure": f"{M}:dig_site", "weight": 1}],
        "placement": {"type": "minecraft:random_spread", "spacing": 24, "separation": 8, "salt": 31415926}})
    # ---- loot (docs/FIXES_0_4.md): much more amber; sherds (and decorated pots, of which there are none here) at about
    # a fifth of their 0.3 weight, so a pot is a real find. Each sherd keeps weight 1; everything else is about five times
    # what it was, amber more than that.
    sherds = lambda *names: [item(f"minecraft:{n}_pottery_sherd") for n in names]  # noqa
    archaeology(ctx, "cave_amber", [item(f"{M}:amber_shard", 50, (1, 3)), item(f"{M}:amber_block", 8), item(f"{M}:amberwood_bloom", 8),
                                    item("minecraft:torchflower_seeds", 5), item("minecraft:pitcher_pod", 5),
                                    item("minecraft:emerald", 5)] + sherds("miner", "blade", "archer"))
    archaeology(ctx, "cave_bones", [item("minecraft:bone", 30), item("minecraft:bone_block", 10), item("minecraft:skeleton_skull", 4),
                                    item(f"{M}:amber_shard", 25, (1, 2)), item(f"{M}:amber_block", 2), item("minecraft:arrow", 6)]
                + sherds("skull", "howl", "danger"))
    dead = [item(f"{M}:amber_shard", 60, (1, 3)), item(f"{M}:amberwood_bloom", 12), item("minecraft:bone", 12),
            item("minecraft:dead_bush", 4), item("minecraft:torchflower_seeds", 4), item("minecraft:pitcher_pod", 4),
            item(f"{M}:amber_block", 10)] + sherds("blade", "miner", "archer", "howl", "danger", "skull", "explorer")
    archaeology(ctx, "dead_cave", dead)
    archaeology(ctx, "dig_site", dead + [item("minecraft:brush", 5), item("minecraft:echo_shard", 5)])
    # amber sand and amber gravel: amber shards mostly, sometimes a whole block, now and then with something sealed inside
    with_inclusion = lambda inc, weight: dict(item(f"{M}:amber_block", weight), functions=[  # noqa: E731
        {"function": "minecraft:set_components", "components": {"minecraft:block_state": {"inclusion": inc}}}])
    archaeology(ctx, "amber_deposit", [item(f"{M}:amber_shard", 40, (1, 3)), item(f"{M}:amber_shard", 12, (3, 5)),
                                       item(f"{M}:amber_block", 6), with_inclusion("seed", 1), with_inclusion("mosquito", 1)])
    ctx.write(os.path.join(ctx.D, M, "loot_table", "chests", "dig_site.json"), {"type": "minecraft:chest", "pools": [
        {"rolls": {"type": "minecraft:uniform", "min": 3, "max": 6}, "entries": [
            item(f"{M}:amber_shard", 14, (2, 8)), item("minecraft:bone", 8, (2, 6)), item("minecraft:gravel", 6, (2, 8)),
            item("minecraft:sand", 5, (2, 8)), item("minecraft:paper", 5, (1, 4)), item("minecraft:torch", 6, (2, 8)),
            item("minecraft:bread", 5, (1, 3)), item("minecraft:coal", 5, (2, 6)), item(f"{M}:amberwood_bloom", 3, (1, 2)),
            item("minecraft:map", 2), item("minecraft:string", 4, (1, 4)), item("minecraft:iron_ingot", 3, (1, 3))]},
        {"rolls": {"type": "minecraft:uniform", "min": 1, "max": 2}, "entries": [
            item("minecraft:brush", 24), item("minecraft:iron_shovel", 18), item("minecraft:iron_pickaxe", 6),
            item(f"{M}:amber_block", 24), item("minecraft:echo_shard", 6), item("minecraft:goat_horn", 6)]
            + sherds("blade", "miner", "archer", "howl", "danger", "skull", "explorer", "prize")}]})
    ctx.write(os.path.join(ctx.L, "archaeology.json"), {"biome.winterworks.dead_caves": "Dead Caves"})
