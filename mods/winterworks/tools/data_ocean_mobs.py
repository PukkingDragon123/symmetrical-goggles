"""Data for the creatures (docs/OCEAN_UPDATE.md sections 3, 4): the anglerfish, lionfish, nautilus and turtles (loot,
spawn egg models, cooking), the Angler Light (blockstate, cube_all model on its animated texture, loot), the turtle
helmet from 9 turtle shell shards, the aquatic entity tag, and lang/ocean_mobs.json. Called by gen_data.py with
ctx = gen_data.Ctx.

Item textures and models of the drops come from the art (examples/src/winterworks_ocean_art.py); this only writes the
models the art doesn't (spawn eggs, the Angler Light)."""
import os


def _loot(ctx, path, typ, pools):
    ctx.write(os.path.join(ctx.D, ctx.M, "loot_table", *path.split("/")) + ".json", {"type": typ, "pools": pools})


def _count(lo, hi):
    return {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}


def _looting(lo, hi):
    return {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
            "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}


ON_FIRE = {"condition": "minecraft:entity_properties", "entity": "this", "predicate": {"flags": {"is_on_fire": True}}}
SMELT = {"function": "minecraft:furnace_smelt", "conditions": [ON_FIRE]}
KILLED_BY_PLAYER = {"condition": "minecraft:killed_by_player"}


def _chance(base, per_level):
    return {"condition": "minecraft:random_chance_with_enchanted_bonus", "enchantment": "minecraft:looting",
            "unenchanted_chance": base, "enchanted_chance": {"type": "minecraft:linear", "base": base + per_level,
                                                             "per_level_above_first": per_level}}


def models(ctx):
    M = ctx.M
    for egg in ("anglerfish", "lionfish", "nautilus"):
        ctx.write(os.path.join(ctx.A, "models", "item", egg + "_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})
    # the Angler Light: a full cube on its animated 32 x 32 texture (8 frames, softly pulsing)
    ctx.write(os.path.join(ctx.A, "models", "block", "angler_light.json"),
              {"parent": "minecraft:block/cube_all", "textures": {"all": f"{M}:block/angler_light"}})
    ctx.write(os.path.join(ctx.A, "blockstates", "angler_light.json"), {"variants": {"": {"model": f"{M}:block/angler_light"}}})
    ctx.write(os.path.join(ctx.A, "models", "item", "angler_light.json"), {"parent": f"{M}:block/angler_light"})
    # drops: generated item models only where the art has not written one
    for item in ("raw_anglerfish", "cooked_anglerfish", "angler_lure", "anglerfish_bucket", "lionfish", "cooked_lionfish",
                 "turtle_shell_shard"):
        path = os.path.join(ctx.A, "models", "item", item + ".json")
        if not os.path.exists(path):
            ctx.write(path, {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/{item}"}})


def loot(ctx):
    M = ctx.M
    _loot(ctx, "blocks/angler_light", "minecraft:block", [{"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:angler_light"}],
                                                            "conditions": [{"condition": "minecraft:survives_explosion"}]}])
    # males: a fish and, half the time, the lure (Night Vision potions brew from it)
    _loot(ctx, "entities/anglerfish", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:raw_anglerfish", "functions": [SMELT, _looting(0, 1)]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:angler_lure"}], "conditions": [_chance(0.5, 0.1)]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:bone_meal"}],
         "conditions": [{"condition": "minecraft:random_chance", "chance": 0.05}]}])
    # females: lots of fish, the lure, and their light as a block a quarter of the time
    _loot(ctx, "entities/anglerfish_female", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:raw_anglerfish", "functions": [
            _count(3, 5), SMELT, _looting(0, 2)]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:angler_lure", "functions": [_count(1, 2), _looting(0, 1)]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:angler_light"}], "conditions": [_chance(0.25, 0.05)]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:bone", "functions": [_count(0, 3)]}]}])
    _loot(ctx, "entities/lionfish", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:lionfish", "functions": [SMELT]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:bone_meal"}],
         "conditions": [{"condition": "minecraft:random_chance", "chance": 0.05}]}])
    _loot(ctx, "entities/nautilus", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:nautilus_shell"}]}])


def recipes(ctx):
    M = ctx.M
    for raw, cooked in (("raw_anglerfish", "cooked_anglerfish"), ("lionfish", "cooked_lionfish")):
        for kind, time, suffix in (("smelting", 200, ""), ("smoking", 100, "_from_smoking"),
                                   ("campfire_cooking", 600, "_from_campfire_cooking")):
            ctx.write(os.path.join(ctx.D, M, "recipe", cooked + suffix + ".json"), {
                "type": "minecraft:" + kind, "category": "food", "cookingtime": time, "experience": 0.35,
                "ingredient": {"item": f"{M}:{raw}"}, "result": {"id": f"{M}:{cooked}"}})
    # 9 turtle shell shards make a Turtle Shell (vanilla turtle_helmet)
    ctx.shaped("turtle_helmet_from_shards", ["SSS", "SSS", "SSS"], {"S": f"{M}:turtle_shell_shard"}, "minecraft:turtle_helmet")


def tags(ctx):
    M = ctx.M
    T = os.path.join(ctx.D, "minecraft", "tags", "entity_type")
    mobs = [f"{M}:anglerfish", f"{M}:lionfish", f"{M}:nautilus"]
    ctx.write(os.path.join(T, "aquatic.json"), {"replace": False, "values": mobs})       # Impaling hurts them
    ctx.write(os.path.join(T, "axolotl_hunt_targets.json"), {"replace": False, "values": [f"{M}:lionfish"]})
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "block", "mineable", "pickaxe.json"),
              {"replace": False, "values": [f"{M}:angler_light"]})


def lang(ctx):
    L = {
        "entity.winterworks.anglerfish": "Anglerfish",
        "entity.winterworks.lionfish": "Lionfish",
        "entity.winterworks.nautilus": "Nautilus",
        "item.winterworks.anglerfish_spawn_egg": "Anglerfish Spawn Egg",
        "item.winterworks.lionfish_spawn_egg": "Lionfish Spawn Egg",
        "item.winterworks.nautilus_spawn_egg": "Nautilus Spawn Egg",
        "item.winterworks.raw_anglerfish": "Raw Anglerfish",
        "item.winterworks.cooked_anglerfish": "Cooked Anglerfish",
        "item.winterworks.angler_lure": "Angler Lure",
        "item.winterworks.anglerfish_bucket": "Bucket of Anglerfish",
        "item.winterworks.lionfish": "Lionfish",
        "item.winterworks.cooked_lionfish": "Cooked Lionfish",
        "item.winterworks.turtle_shell_shard": "Turtle Shell Shard",
        "block.winterworks.angler_light": "Angler Light",
    }
    ctx.write(os.path.join(ctx.L, "ocean_mobs.json"), L)


def run(ctx):
    models(ctx)
    loot(ctx)
    recipes(ctx)
    tags(ctx)
    lang(ctx)
