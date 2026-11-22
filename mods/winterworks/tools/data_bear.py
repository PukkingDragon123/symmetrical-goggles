"""Data for the bear area of the Cold Zone update (docs/COLD_UPDATE.md sections 3-4): loot, entity tags, spawn egg models, lang.
Called by gen_data.py with ctx = gen_data.Ctx (ctx.write, ctx.shaped, ctx.shapeless, ctx.A assets dir, ctx.D data dir,
ctx.M mod id, ctx.L lang fragments dir). Writes lang to os.path.join(ctx.L, "bear.json").

The vanilla polar bear's extra fur drop is added in code (bear.BearFeature, Fabric LootTableEvents), not here.
"""
import os


def looting(lo=0, hi=1):
    return {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
            "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}


def count(lo, hi):
    return {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": lo, "max": hi}, "add": False}


def chance(base, per_level, unenchanted):
    """A random chance that grows with looting (like vanilla's rare zombie drops)."""
    return {"condition": "minecraft:random_chance_with_enchanted_bonus", "enchantment": "minecraft:looting",
            "unenchanted_chance": unenchanted,
            "enchanted_chance": {"type": "minecraft:linear", "base": base, "per_level_above_first": per_level}}


def item(name, *functions, weight=None):
    e = {"type": "minecraft:item", "name": name}
    if functions:
        e["functions"] = list(functions)
    if weight is not None:
        e["weight"] = weight
    return e


def pool(*entries, conditions=None):
    p = {"rolls": 1, "bonus_rolls": 0, "entries": list(entries)}
    if conditions:
        p["conditions"] = conditions
    return p


def loot(ctx):
    M = ctx.M
    # zombie polar bear: rotten flesh, bones, and sometimes a scrap of its fur
    ctx.write(os.path.join(ctx.D, M, "loot_table", "entities", "zombie_polar_bear.json"), {
        "type": "minecraft:entity", "random_sequence": f"{M}:entities/zombie_polar_bear", "pools": [
            pool(item("minecraft:rotten_flesh", count(1, 3), looting())),
            pool(item("minecraft:bone", count(0, 2), looting())),
            pool(item(f"{M}:polar_bear_fur", looting()), conditions=[chance(0.35, 0.1, 0.25)]),
        ]})
    # frost zombie: rotten flesh, snowballs, and rarely a chunk of ice (killed by a player)
    ctx.write(os.path.join(ctx.D, M, "loot_table", "entities", "frost_zombie.json"), {
        "type": "minecraft:entity", "random_sequence": f"{M}:entities/frost_zombie", "pools": [
            pool(item("minecraft:rotten_flesh", count(0, 2), looting())),
            pool(item("minecraft:snowball", count(0, 2), looting())),
            pool(item("minecraft:ice", weight=3), item("minecraft:packed_ice", weight=1),
                 conditions=[{"condition": "minecraft:killed_by_player"}, chance(0.035, 0.01, 0.025)]),
        ]})


def tags(ctx):
    M = ctx.M
    tags = os.path.join(ctx.D, "minecraft", "tags", "entity_type")
    # undead: smite, inverted healing and harm, ignores poison and regeneration, wither friends
    ctx.write(os.path.join(tags, "undead.json"), {"replace": False, "values": [f"{M}:frost_zombie", f"{M}:zombie_polar_bear"]})
    ctx.write(os.path.join(tags, "zombies.json"), {"replace": False, "values": [f"{M}:frost_zombie"]})


def models(ctx):
    for egg in ("frost_zombie_spawn_egg", "zombie_polar_bear_spawn_egg"):
        ctx.write(os.path.join(ctx.A, "models", "item", egg + ".json"), {"parent": "minecraft:item/template_spawn_egg"})


def lang(ctx):
    ctx.write(os.path.join(ctx.L, "bear.json"), {
        "entity.winterworks.frost_zombie": "Frost Zombie",
        "entity.winterworks.zombie_polar_bear": "Zombie Polar Bear",
        "item.winterworks.frost_zombie_spawn_egg": "Frost Zombie Spawn Egg",
        "item.winterworks.zombie_polar_bear_spawn_egg": "Zombie Polar Bear Spawn Egg",
    })


def run(ctx):
    loot(ctx)
    tags(ctx)
    models(ctx)
    lang(ctx)
