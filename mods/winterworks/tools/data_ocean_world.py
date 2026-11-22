"""Data for the world (docs/OCEAN_UPDATE.md sections 1, 2, 7). Called by gen_data.py with ctx = gen_data.Ctx."""
import os


def run(ctx):
    ctx.write(os.path.join(ctx.L, "ocean_world.json"), {"itemGroup.winterworks.ocean": "Winterworks: Tides & Treasures"})
