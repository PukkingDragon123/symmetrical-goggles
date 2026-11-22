"""Data for falling meteorites (docs/END_UPDATE.md section 16): the meteorite damage type (the shockwave's burn; blast
protection helps) and lang/end_meteor.json (the entity, death messages, /winterworks meteor). Called by gen_data.py with
ctx = gen_data.Ctx. The whistle and impact sounds are mapped in tools/sound_map.json (their subtitles come from there).
"""
import os


def run(ctx):
    M = ctx.M
    ctx.write(os.path.join(ctx.D, M, "damage_type", "meteorite.json"),
              {"message_id": f"{M}.meteorite", "scaling": "never", "exhaustion": 0.1, "effects": "burning"})
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "damage_type", "is_explosion.json"),
              {"replace": False, "values": [f"{M}:meteorite"]})
    ctx.write(os.path.join(ctx.L, "end_meteor.json"), {
        "entity.winterworks.falling_meteorite": "Falling Meteorite",
        "death.attack.winterworks.meteorite": "%1$s was struck down by a falling meteorite",
        "death.attack.winterworks.meteorite.player": "%1$s was struck down by a falling meteorite while fighting %2$s",
        "commands.winterworks.meteor.success": "A meteor is falling %s blocks ahead",
        "commands.winterworks.meteor.no_ground": "There is no ground ahead for a meteor to hit",
    })
