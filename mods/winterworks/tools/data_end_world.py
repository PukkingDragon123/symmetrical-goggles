"""Data for the world (docs/END_UPDATE.md sections 1-3): biomes, terrain features, structures, the new blocks' models, recipes, loot and tags, End City loot, and lang/end_world.json. Called by gen_data.py with ctx = gen_data.Ctx."""
import os


def run(ctx):
    ctx.write(os.path.join(ctx.L, "end_world.json"), {"itemGroup.winterworks.end": "Winterworks: The Living End"})
