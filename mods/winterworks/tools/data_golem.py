"""Data for the golem area of the Amber Age update (docs/AMBER_UPDATE.md section 9): the Pot Golem's spawn egg model,
its loot table (2-4 amber shards; the pot's sherds and the body shard are dropped in Java) and lang.
Called by gen_data.py with ctx = gen_data.Ctx. Lang goes to os.path.join(ctx.L, "golem.json")."""
import os


def item_models(ctx):
    ctx.write(os.path.join(ctx.A, "models", "item", "pot_golem_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})


def loot(ctx):
    ctx.write(os.path.join(ctx.D, ctx.M, "loot_table", "entities", "pot_golem.json"), {
        "type": "minecraft:entity",
        "pools": [{
            "rolls": 1,
            "entries": [{
                "type": "minecraft:item",
                "name": f"{ctx.M}:amber_shard",
                "functions": [{"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": 2, "max": 4}}],
            }],
        }],
    })


def lang(ctx):
    ctx.write(os.path.join(ctx.L, "golem.json"), {
        "entity.winterworks.pot_golem": "Pot Golem",
        "item.winterworks.pot_golem_spawn_egg": "Pot Golem Spawn Egg",
    })


def run(ctx):
    item_models(ctx)
    loot(ctx)
    lang(ctx)
