"""Data for the Soul Bull (docs/FIXES_0_4.md "The Soul Bull"): the Soul Bull Skull (blockstate, block and 3D item
models, loot), the Soul Bull (spawn egg model, loot: its skull and 1-3 Wither Bones), tags (undead, pickaxe-mineable
skull, the piglin structures where armoured bulls spawn) and lang/soulbull.json. The biome spawn and the Wither Skeleton's Wither Bone are added in code
(soulbull.SoulBullFeature); the sounds are mapped in tools/sound_map.json. The Wither Bone's own item model and name
come from data_hex.py.
Called by gen_data.py with ctx = gen_data.Ctx."""
import os


def loot(ctx, path, typ, pools):
    ctx.write(os.path.join(ctx.D, ctx.M, "loot_table", *path.split("/")) + ".json", {"type": typ, "pools": pools})


def run(ctx):
    A, D, M = ctx.A, ctx.D, ctx.M
    blk = lambda n: os.path.join(A, "models", "block", n + ".json")  # noqa: E731
    itm = lambda n: os.path.join(A, "models", "item", n + ".json")  # noqa: E731

    # ---- the skull: drawn by client.soulbull.SoulBullSkullRenderer (block entity + builtin item renderer), the 3D model
    # everywhere; the block model only gives the breaking particles. Facing and `lit` are the renderer's business.
    ctx.write(blk("soul_bull_skull"), {"textures": {"particle": "minecraft:block/blackstone"}})
    ctx.write(os.path.join(A, "blockstates", "soul_bull_skull.json"), {"variants": {"": {"model": f"{M}:block/soul_bull_skull"}}})
    ctx.write(itm("soul_bull_skull"), {
        "parent": "minecraft:builtin/entity", "gui_light": "side",
        "textures": {"particle": "minecraft:block/blackstone"},
        "display": {
            "gui": {"rotation": [22, 35, 0], "translation": [0, 1.5, 0], "scale": [1.05, 1.05, 1.05]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.45, 0.45, 0.45]},
            "fixed": {"rotation": [0, 180, 0], "translation": [0, 1, 0], "scale": [0.9, 0.9, 0.9]},
            "head": {"rotation": [0, 180, 0], "translation": [0, 4, 0], "scale": [1.1, 1.1, 1.1]},
            "thirdperson_righthand": {"rotation": [45, 45, 0], "translation": [0, 2, 0], "scale": [0.4, 0.4, 0.4]},
            "thirdperson_lefthand": {"rotation": [45, 45, 0], "translation": [0, 2, 0], "scale": [0.4, 0.4, 0.4]},
            "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [2, 2, 0], "scale": [0.3, 0.3, 0.3]},
            "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [-2, 2, 0], "scale": [0.3, 0.3, 0.3]},
        }})
    loot(ctx, "blocks/soul_bull_skull", "minecraft:block", [{
        "rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:soul_bull_skull"}],
        "conditions": [{"condition": "minecraft:survives_explosion"}]}])

    # ---- the bull
    ctx.write(itm("soul_bull_spawn_egg"), {"parent": "minecraft:item/template_spawn_egg"})
    loot(ctx, "entities/soul_bull", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:soul_bull_skull"}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:wither_bone", "functions": [
            {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 1, "max": 3}},
            {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
             "count": {"type": "minecraft:uniform", "min": 0, "max": 1}}]}]}])

    # ---- the piglins' structures, where armoured bulls spawn (soulbull.SoulBullFeature.PIGLIN_LANDS)
    ctx.write(os.path.join(D, M, "tags", "worldgen", "structure", "soul_bull_piglin_lands.json"), {"replace": False, "values": [
        "minecraft:bastion_remnant", {"id": f"{M}:hex_fortress", "required": False}]})

    # ---- tags: a skeleton (smite, inverted healing and harm, no poison or regeneration); its skull mines with a pickaxe
    ctx.write(os.path.join(D, "minecraft", "tags", "entity_type", "undead.json"), {"replace": False, "values": [f"{M}:soul_bull"]})
    ctx.write(os.path.join(D, "minecraft", "tags", "block", "mineable", "pickaxe.json"),
              {"replace": False, "values": [f"{M}:soul_bull_skull"]})

    # ---- lang (the sounds' subtitles come from tools/sound_map.json)
    ctx.write(os.path.join(ctx.L, "soulbull.json"), {
        "entity.winterworks.soul_bull": "Soul Bull",
        "item.winterworks.soul_bull_spawn_egg": "Soul Bull Spawn Egg",
        "block.winterworks.soul_bull_skull": "Soul Bull Skull",
        "block.winterworks.soul_bull_skull.tip": "Set it on soul sand in a ring of soul fire, then give it Wither Bones",
        "message.winterworks.soul_bull_skull.cold": "The skull is cold. Set it on soul sand with soul fire burning on all four sides.",
        "message.winterworks.soul_bull_skull.bones": "The bones gather round the skull: %s of %s",
        "message.winterworks.soul_bull.milk_refused": "Its soul fire burns too low to spare a drop",
        "message.winterworks.soul_bull.ram_weak": "Not enough soul energy to ram",
    })
