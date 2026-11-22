"""Data for the boss area of the Cold Zone update (docs/COLD_UPDATE.md sections 6-8): ancient ice, icicles, the Frost
Mauler skull, the Frost Mauler (models, blockstates, loot, tags, lang) and the GameTest arena structure.
Called by gen_data.py with ctx = gen_data.Ctx (ctx.write, ctx.shaped, ctx.shapeless, ctx.A assets dir, ctx.D data dir,
ctx.M mod id, ctx.L lang fragments dir). Lang goes to os.path.join(ctx.L, "boss.json").
"""
import json
import os


def _tag(ctx, path, values):
    """Adds values to a tag file, keeping what other areas (or gen_data itself) already put there."""
    f = os.path.join(ctx.D, *path) + ".json"
    old = []
    if os.path.exists(f):
        with open(f, encoding="utf-8") as fh:
            old = json.load(fh).get("values", [])
    ctx.write(f, {"replace": False, "values": old + [v for v in values if v not in old]})


def models(ctx):
    A, M = ctx.A, ctx.M
    blk = lambda n: os.path.join(A, "models", "block", n + ".json")  # noqa: E731
    itm = lambda n: os.path.join(A, "models", "item", n + ".json")  # noqa: E731
    # ancient ice: a translucent cube (render layer set in client.boss.BossClient)
    ctx.write(blk("ancient_ice"), {"parent": "minecraft:block/cube_all", "textures": {"all": f"{M}:block/ancient_ice"}})
    ctx.write(itm("ancient_ice"), {"parent": f"{M}:block/ancient_ice"})
    ctx.write(os.path.join(A, "blockstates", "ancient_ice.json"), {"variants": {"": {"model": f"{M}:block/ancient_ice"}}})
    # icicles: crossed planes, a thick base and a sharp tip
    for part in ("tip", "base"):
        ctx.write(blk("icicle_" + part), {"parent": "minecraft:block/cross", "textures": {"cross": f"{M}:block/icicle_{part}"}})
    ctx.write(os.path.join(A, "blockstates", "icicle.json"), {"variants": {
        "tip=true": {"model": f"{M}:block/icicle_tip"}, "tip=false": {"model": f"{M}:block/icicle_base"}}})
    ctx.write(itm("icicle"), {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/icicle"}})
    # the skull: drawn by FrostMaulerSkullRenderer (block entity + builtin item renderer); the block model only gives
    # the breaking particles. In the GUI the item renderer draws the 2D icon model instead.
    ctx.write(blk("frost_mauler_skull"), {"textures": {"particle": "minecraft:block/bone_block_side"}})
    ctx.write(os.path.join(A, "blockstates", "frost_mauler_skull.json"),
              {"variants": {"": {"model": f"{M}:block/frost_mauler_skull"}}})
    ctx.write(itm("frost_mauler_skull"), {
        "parent": "minecraft:builtin/entity", "gui_light": "front",
        "textures": {"particle": "minecraft:block/bone_block_side"},
        "display": {
            "gui": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.5, 0.5, 0.5]},
            "fixed": {"rotation": [0, 180, 0], "translation": [0, 2, 0], "scale": [0.9, 0.9, 0.9]},
            "head": {"rotation": [0, 180, 0], "translation": [0, 4, 0], "scale": [1.1, 1.1, 1.1]},
            "thirdperson_righthand": {"rotation": [45, 45, 0], "translation": [0, 2.5, 0], "scale": [0.45, 0.45, 0.45]},
            "thirdperson_lefthand": {"rotation": [45, 45, 0], "translation": [0, 2.5, 0], "scale": [0.45, 0.45, 0.45]},
            "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 2.5, 0], "scale": [0.5, 0.5, 0.5]},
            "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 2.5, 0], "scale": [0.5, 0.5, 0.5]},
        }})
    ctx.write(itm("frost_mauler_skull_icon"),
              {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/frost_mauler_skull"}})
    ctx.write(itm("frost_mauler_spawn_egg"), {"parent": "minecraft:item/template_spawn_egg"})


def loot(ctx):
    D, M = ctx.D, ctx.M
    lt = lambda *p: os.path.join(D, M, "loot_table", *p) + ".json"  # noqa: E731
    silk = {"condition": "minecraft:match_tool", "predicate": {"predicates": {"minecraft:enchantments": [
        {"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}
    ctx.write(lt("blocks", "ancient_ice"), {"type": "minecraft:block", "pools": [{
        "rolls": 1, "conditions": [silk], "entries": [{"type": "minecraft:item", "name": f"{M}:ancient_ice"}]}],
        "random_sequence": f"{M}:blocks/ancient_ice"})
    for b in ("icicle", "frost_mauler_skull"):
        ctx.write(lt("blocks", b), {"type": "minecraft:block", "pools": [{
            "rolls": 1, "conditions": [{"condition": "minecraft:survives_explosion"}],
            "entries": [{"type": "minecraft:item", "name": f"{M}:{b}"}]}], "random_sequence": f"{M}:blocks/{b}"})
    uniform = lambda lo, hi: {"type": "minecraft:uniform", "min": lo, "max": hi}  # noqa: E731
    ctx.write(lt("entities", "frost_mauler"), {"type": "minecraft:entity", "pools": [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:frost_mauler_skull"}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:mauler_fang",
                                  "functions": [{"function": "minecraft:set_count", "count": 2}]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": "minecraft:bone", "functions": [
            {"function": "minecraft:set_count", "count": uniform(0, 6)},
            {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting", "count": uniform(0, 1)}]}]},
        {"rolls": 1, "conditions": [{"condition": "minecraft:random_chance", "chance": 0.35}],
         "entries": [{"type": "minecraft:item", "name": f"{M}:ancient_ice",
                      "functions": [{"function": "minecraft:set_count", "count": uniform(1, 3)}]}]}],
        "random_sequence": f"{M}:entities/frost_mauler"})


def tags(ctx):
    _tag(ctx, ["minecraft", "tags", "block", "mineable", "axe"], [f"{ctx.M}:ancient_ice"])


def gametest_arena(ctx):
    """An empty 32x20x32 GameTest structure: room to build a whole frozen tomb (test.BossTests)."""
    path = os.path.join(ctx.D, ctx.M, "gametest", "structure", "boss_arena.snbt")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('{\n    DataVersion: 3955,\n    size: [32, 20, 32],\n    data: [\n'
                 '        {pos: [0, 0, 0], state: "minecraft:air"}\n    ],\n    entities: [],\n'
                 '    palette: [\n        "minecraft:air"\n    ]\n}\n')


def lang(ctx):
    ctx.write(os.path.join(ctx.L, "boss.json"), {
        "block.winterworks.ancient_ice": "Ancient Ice",
        "block.winterworks.ancient_ice.tip": "Bitterly cold: touch it and you get Frostbite, break it and it bursts. "
                                             "Only Silk Touch keeps it whole.",
        "block.winterworks.icicle": "Icicle",
        "block.winterworks.frost_mauler_skull": "Frost Mauler Skull",
        "block.winterworks.frost_mauler_skull.tip": "Encase it in ancient ice on all six sides, then offer it a Nether Star...",
        "entity.winterworks.frost_mauler": "Frost Mauler",
        "entity.winterworks.falling_icicle": "Falling Icicle",
        "item.winterworks.frost_mauler_spawn_egg": "Frost Mauler Spawn Egg",
        "message.winterworks.skull.encase": "The skull must be encased in ancient ice on all six sides",
        "message.winterworks.skull.ignite": "The skull's eye flares with a cold blue light...",
        "message.winterworks.tomb.awakening": "The ancient ice groans. Something inside it is waking up!",
        "message.winterworks.tomb.built": "Built a frozen tomb at %s, %s, %s",
        "message.winterworks.mauler.sealed": "It is sealed in ancient ice. Break the ice around it to wake it...",
    })


def run(ctx):
    models(ctx)
    loot(ctx)
    tags(ctx)
    gametest_arena(ctx)
    lang(ctx)
