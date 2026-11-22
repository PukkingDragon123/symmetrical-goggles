"""Data for the cold, fur armour gameplay and the Ice Caves (docs/COLD_UPDATE.md sections 1, 2, 5)."""
import json
import os


# Ice Caves features, per generation step. Built from vanilla's dripstone caves list (same relative order, so no
# feature-order cycles) minus dripstone and surface plants, plus our decoration at the end of its step.
FEATURES = [
    [],
    ["minecraft:lake_lava_underground", "minecraft:lake_lava_surface"],
    ["minecraft:amethyst_geode"],
    ["minecraft:monster_room", "minecraft:monster_room_deep"],
    [],
    [],
    ["minecraft:ore_dirt", "minecraft:ore_gravel", "minecraft:ore_granite_upper", "minecraft:ore_granite_lower",
     "minecraft:ore_diorite_upper", "minecraft:ore_diorite_lower", "minecraft:ore_andesite_upper",
     "minecraft:ore_andesite_lower", "minecraft:ore_tuff", "minecraft:ore_coal_upper", "minecraft:ore_coal_lower",
     "minecraft:ore_iron_upper", "minecraft:ore_iron_middle", "minecraft:ore_iron_small", "minecraft:ore_gold",
     "minecraft:ore_gold_lower", "minecraft:ore_redstone", "minecraft:ore_redstone_lower", "minecraft:ore_diamond",
     "minecraft:ore_diamond_medium", "minecraft:ore_diamond_large", "minecraft:ore_diamond_buried", "minecraft:ore_lapis",
     "minecraft:ore_lapis_buried", "minecraft:ore_copper_large", "minecraft:underwater_magma", "minecraft:disk_sand",
     "minecraft:disk_clay", "minecraft:disk_gravel"],
    [],
    ["minecraft:spring_water", "minecraft:spring_lava"],
    ["minecraft:glow_lichen", "minecraft:brown_mushroom_normal", "minecraft:red_mushroom_normal"],
    ["minecraft:freeze_top_layer"],
]


def spawn(t, w, lo, hi):
    return {"type": t, "weight": w, "minCount": lo, "maxCount": hi}


def biome(ctx, extra_features):
    feats = [list(step) for step in FEATURES]
    for step, ids in extra_features.items():
        feats[step] += ids
    ctx.write(os.path.join(ctx.D, ctx.M, "worldgen", "biome", "ice_caves.json"), {
        "has_precipitation": True,
        "temperature": -0.7,
        "downfall": 0.5,
        "effects": {
            "fog_color": 0xB8D4F0,
            "sky_color": 0x8CB4E6,
            "water_color": 0x3938C9,
            "water_fog_color": 0x050533,
            "particle": {"options": {"type": f"{ctx.M}:blizzard_flake"}, "probability": 0.0035},
            "ambient_sound": f"{ctx.M}:ambient.ice_caves.loop",
            "additions_sound": {"sound": f"{ctx.M}:ambient.ice_caves.additions", "tick_chance": 0.0111},
            "mood_sound": {"sound": f"{ctx.M}:ambient.ice_caves.mood", "tick_delay": 6000, "block_search_extent": 8,
                           "offset": 2.0},
            "music": {"sound": "minecraft:music.overworld.frozen_peaks", "min_delay": 12000, "max_delay": 24000,
                      "replace_current_music": False},
        },
        "spawners": {
            "monster": [spawn(f"{ctx.M}:frost_zombie", 80, 1, 3), spawn("minecraft:stray", 50, 2, 4),
                        spawn(f"{ctx.M}:zombie_polar_bear", 12, 1, 1), spawn("minecraft:skeleton", 20, 1, 3),
                        spawn("minecraft:creeper", 30, 1, 2), spawn("minecraft:spider", 15, 1, 2),
                        spawn("minecraft:enderman", 8, 1, 1)],
            "ambient": [spawn("minecraft:bat", 10, 8, 8)],
            "underground_water_creature": [spawn("minecraft:glow_squid", 10, 4, 6)],
            "creature": [], "water_creature": [], "water_ambient": [], "misc": [], "axolotls": [],
        },
        "spawn_costs": {},
        "carvers": {"air": ["minecraft:cave", "minecraft:cave_extra_underground", "minecraft:canyon"]},
        "features": feats,
    })
    tag = lambda path, values: ctx.write(os.path.join(ctx.D, *path) + ".json", {"replace": False, "values": values})  # noqa
    tag(["minecraft", "tags", "worldgen", "biome", "spawns_cold_variant_frogs"], [f"{ctx.M}:ice_caves"])
    tag([ctx.M, "tags", "worldgen", "biome", "has_frozen_tomb"], [f"{ctx.M}:ice_caves"])


def worldgen(ctx):
    """The Ice Caves decoration feature and the frozen tomb structure."""
    W = os.path.join(ctx.D, ctx.M, "worldgen")
    ctx.write(os.path.join(W, "configured_feature", "ice_cave_surface.json"), {"type": f"{ctx.M}:ice_cave_surface", "config": {}})
    # no placement modifiers: runs once per chunk and checks the biome itself, block by block
    ctx.write(os.path.join(W, "placed_feature", "ice_cave_surface.json"), {"feature": f"{ctx.M}:ice_cave_surface", "placement": []})
    ctx.write(os.path.join(W, "structure", "frozen_tomb.json"), {
        "type": f"{ctx.M}:frozen_tomb", "biomes": f"#{ctx.M}:has_frozen_tomb", "step": "underground_structures",
        "spawn_overrides": {}, "terrain_adaptation": "none"})
    ctx.write(os.path.join(W, "structure_set", "frozen_tomb.json"), {
        "structures": [{"structure": f"{ctx.M}:frozen_tomb", "weight": 1}],
        "placement": {"type": "minecraft:random_spread", "spacing": 28, "separation": 10, "salt": 20261115}})
    return {10: [f"{ctx.M}:ice_cave_surface"]}   # after freeze_top_layer, the last step


def run(ctx, extra_features=None):
    feats = worldgen(ctx)
    feats.update(extra_features or {})
    biome(ctx, feats)
    # damage types
    ctx.write(os.path.join(ctx.D, ctx.M, "damage_type", "overheat.json"),
              {"message_id": f"{ctx.M}.overheat", "scaling": "never", "exhaustion": 0.0, "effects": "burning"})
    ctx.write(os.path.join(ctx.D, ctx.M, "damage_type", "falling_icicle.json"),
              {"message_id": f"{ctx.M}.falling_icicle", "scaling": "when_caused_by_living_non_player", "exhaustion": 0.1})
    t = os.path.join(ctx.D, "minecraft", "tags", "damage_type")
    ctx.write(os.path.join(t, "bypasses_armor.json"), {"replace": False, "values": [f"{ctx.M}:overheat"]})
    ctx.write(os.path.join(t, "no_knockback.json"), {"replace": False, "values": [f"{ctx.M}:overheat"]})
    ctx.write(os.path.join(t, "damages_helmet.json"), {"replace": False, "values": [f"{ctx.M}:falling_icicle"]})
    # fur armour: freeze immune like leather
    fur = [f"{ctx.M}:fur_hood", f"{ctx.M}:fur_coat", f"{ctx.M}:fur_leggings", f"{ctx.M}:fur_boots"]
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "item", "freeze_immune_wearables.json"), {"replace": False, "values": fur})
    ctx.write(os.path.join(ctx.L, "cold.json"), {
        "biome.winterworks.ice_caves": "Ice Caves",
        "effect.winterworks.frostbite": "Frostbite",
        "effect.winterworks.cold": "Cold",
        "death.attack.winterworks.overheat": "%1$s overheated in their fur",
        "death.attack.winterworks.overheat.player": "%1$s overheated in their fur while fighting %2$s",
        "death.attack.winterworks.falling_icicle": "%1$s was skewered by a falling icicle",
        "death.attack.winterworks.falling_icicle.player": "%1$s was skewered by a falling icicle while fighting %2$s",
        "item.winterworks.fur.tip": "Warm: no freezing, no Slowness. Strength in the cold, the more pieces the stronger. Too hot for the Nether!",
    })
