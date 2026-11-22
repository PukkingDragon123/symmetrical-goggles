"""Data for the Harvester and the Amber Age plant fixes (docs/FIXES_0_4.md "The Harvester" and "Torchflowers, pitcher
plants, mosquitoes and sniffers"). Called by gen_data.py with ctx = gen_data.Ctx.

The Harvester Egg's blockstate and models, item models, loot tables (the egg, the Harvester's leather), the bee-flower
tag, the runtime glow masks for torchflowers and pitcher plants (assets/minecraft/atlases/blocks.json: the
winterworks:glow_mask source makes them from the game's own textures, client/harvester/GlowMaskSource), a GameTest
field and lang/harvester.json. Its sound events are mapped in tools/sound_map.json. The egg in archaeology loot is in
data_archaeology.py, the amber egg inclusion's blockstate in data_amber.py.
"""
import os


def run(ctx):
    M = ctx.M
    w = ctx.write
    A, D = ctx.A, ctx.D

    # ---------------------------------------------------------------------------------------- the egg
    # block models harvester_egg_{not_cracked,slightly_cracked,very_cracked} come from the art pass
    stages = ("not_cracked", "slightly_cracked", "very_cracked")
    w(os.path.join(A, "blockstates", "harvester_egg.json"), {"variants": {
        f"hatch={h},waterlogged={wl}": {"model": f"{M}:block/harvester_egg_{stages[h]}"}
        for h in range(3) for wl in ("false", "true")}})
    w(os.path.join(A, "models", "item", "harvester_egg.json"),
      {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/harvester_egg"}})
    w(os.path.join(A, "models", "item", "harvester_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})

    # ---------------------------------------------------------------------------------------- loot
    w(os.path.join(D, M, "loot_table", "blocks", "harvester_egg.json"), {"type": "minecraft:block", "pools": [{
        "rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:item", "name": f"{M}:harvester_egg"}],
        "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
    # nothing special: 1-3 leather (+ looting)
    w(os.path.join(D, M, "loot_table", "entities", "harvester.json"), {"type": "minecraft:entity", "pools": [{
        "rolls": 1, "bonus_rolls": 0, "entries": [{"type": "minecraft:item", "name": "minecraft:leather", "functions": [
            {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 1, "max": 3}},
            {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
             "count": {"type": "minecraft:uniform", "min": 0, "max": 1}}]}]}]})

    # ---------------------------------------------------------------------------------------- tags
    # pitcher plants count as flowers for bees (the grown plant already is one; the crop, grown or growing, now too)
    w(os.path.join(D, "minecraft", "tags", "block", "flowers.json"), {"replace": False, "values": ["minecraft:pitcher_crop"]})

    # ---------------------------------------------------------------------------------------- the glow
    # Glow masks made at load time from vanilla's own textures (no texture files shipped): the torchflower's flame
    # petals (warm hues) and the pitcher plant's pitcher (cyan to violet; its leaves are yellow-green and stay dark).
    pitcher = ["pitcher_crop_top_stage_3", "pitcher_crop_top_stage_4", "pitcher_crop_bottom_stage_3", "pitcher_crop_bottom_stage_4"]
    w(os.path.join(ctx.RES, "assets", "minecraft", "atlases", "blocks.json"), {"sources": [
        {"type": f"{M}:glow_mask", "textures": ["minecraft:block/torchflower", "minecraft:block/torchflower_crop_stage1"],
         "hue_min": 330, "hue_max": 70, "min_saturation": 0.45, "min_value": 0.55, "boost": 1.1},
        {"type": f"{M}:glow_mask", "textures": [f"minecraft:block/{t}" for t in pitcher],
         "hue_min": 150, "hue_max": 330, "min_saturation": 0.15, "min_value": 0.35, "boost": 1.15}]})

    # ---------------------------------------------------------------------------------------- GameTests
    # an empty 20x10x20 field: room for a Harvester (head 3 wide, 4.9 long), its farm and a herd (test.HarvesterTests)
    path = os.path.join(D, M, "gametest", "structure", "harvester_field.snbt")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write('{\n    DataVersion: 3955,\n    size: [20, 10, 20],\n    data: [\n'
                 '        {pos: [0, 0, 0], state: "minecraft:air"}\n    ],\n    entities: [],\n'
                 '    palette: [\n        "minecraft:air"\n    ]\n}\n')

    # ---------------------------------------------------------------------------------------- lang
    w(os.path.join(ctx.L, "harvester.json"), {
        "entity.winterworks.harvester": "Harvester",
        "block.winterworks.harvester_egg": "Harvester Egg",
        "block.winterworks.harvester_egg.tip": "Hatches only underwater",
        "item.winterworks.harvester_spawn_egg": "Harvester Spawn Egg",
        "block.winterworks.amber_block.inclusion.egg": "A Harvester Egg is sealed inside",
        "message.winterworks.harvester.order.follow": "The Harvester follows you",
        "message.winterworks.harvester.order.sit": "The Harvester sits",
        "message.winterworks.harvester.order.harvest": "The Harvester stays and crops the fields here",
    })


if __name__ == "__main__":
    raise SystemExit("run tools/gen_data.py")
