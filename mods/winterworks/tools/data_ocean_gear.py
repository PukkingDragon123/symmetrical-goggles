"""Data for the gear and the Elder Guardian boss (docs/OCEAN_UPDATE.md sections 4-6). Called by gen_data.py with
ctx = gen_data.Ctx.

Recipes (Turtle Shell armour, the Eye of the Ocean), the Eye's block loot and tool tag, lionfish darts in
#minecraft:arrows (bows and crossbows pick them as ammunition), the armour in the vanilla armour tags (enchanting,
Unbreaking, Mending), the Elder Guardian's stare damage type, and lang/ocean_gear.json. Guardian scales and the Elder
Guardian Eye are added to the vanilla loot tables in Java (oceangear.OceanGearFeature).
"""
import os


def recipe(ctx, name, pattern, key, count=1, category="equipment"):
    k = {c: ({"tag": v[1:]} if v.startswith("#") else {"item": v}) for c, v in key.items()}
    ctx.write(os.path.join(ctx.D, ctx.M, "recipe", name + ".json"), {
        "type": "minecraft:crafting_shaped", "category": category, "pattern": pattern, "key": k,
        "result": {"id": f"{ctx.M}:{name}", "count": count}})


def recipes(ctx):
    M = ctx.M
    shard, prism, shell = f"{M}:turtle_shell_shard", "minecraft:prismarine_shard", "minecraft:turtle_helmet"
    # the carapace is a whole Turtle Shell, bound with shards and prismarine
    recipe(ctx, "turtle_shell_chestplate", ["S S", "PTP", "SSS"], {"S": shard, "P": prism, "T": shell})
    recipe(ctx, "turtle_shell_leggings", ["SPS", "S S", "P P"], {"S": shard, "P": prism})
    recipe(ctx, "turtle_shell_boots", ["S S", "P P"], {"S": shard, "P": prism})
    recipe(ctx, "eye_of_the_ocean", ["GGG", "GEG", "GGG"], {"G": f"{M}:guardian_scale", "E": f"{M}:elder_guardian_eye"},
           category="misc")


def blocks(ctx):
    M = ctx.M
    ctx.write(os.path.join(ctx.D, M, "loot_table", "blocks", "eye_of_the_ocean.json"), {"type": "minecraft:block", "pools": [{
        "rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:eye_of_the_ocean"}],
        "conditions": [{"condition": "minecraft:survives_explosion"}]}]})
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "block", "mineable", "pickaxe.json"),
              {"replace": False, "values": [f"{M}:eye_of_the_ocean"]})


def tags(ctx):
    M = ctx.M
    t = os.path.join(ctx.D, "minecraft", "tags", "item")
    ctx.write(os.path.join(t, "arrows.json"), {"replace": False, "values": [f"{M}:lionfish_dart"]})
    ctx.write(os.path.join(t, "chest_armor.json"), {"replace": False, "values": [f"{M}:turtle_shell_chestplate"]})
    ctx.write(os.path.join(t, "leg_armor.json"), {"replace": False, "values": [f"{M}:turtle_shell_leggings"]})
    ctx.write(os.path.join(t, "foot_armor.json"), {"replace": False, "values": [f"{M}:turtle_shell_boots"]})


def damage(ctx):
    M = ctx.M
    ctx.write(os.path.join(ctx.D, M, "damage_type", "elder_stare.json"),
              {"message_id": f"{M}.elder_stare", "scaling": "when_caused_by_living_non_player", "exhaustion": 0.1})
    # a held beam: it burns, it doesn't shove
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "damage_type", "no_knockback.json"),
              {"replace": False, "values": [f"{M}:elder_stare"]})


def lang(ctx):
    ctx.write(os.path.join(ctx.L, "ocean_gear.json"), {
        "item.winterworks.lionfish_dart": "Lionfish Dart",
        "item.winterworks.lionfish_dart.tip": "Bow and crossbow ammunition: straight and fast underwater, poisons. Use to throw.",
        "entity.winterworks.lionfish_dart": "Lionfish Dart",
        "item.winterworks.turtle_shell_chestplate": "Turtle Shell Chestplate",
        "item.winterworks.turtle_shell_leggings": "Turtle Shell Leggings",
        "item.winterworks.turtle_shell_boots": "Turtle Shell Boots",
        "item.winterworks.turtle_shell_armor.swim": "+10% swim speed",
        "item.winterworks.turtle_shell_armor.retreat": "Full set with a Turtle Shell: sneak to retreat into your shell",
        "item.winterworks.guardian_scale": "Guardian Scale",
        "item.winterworks.elder_guardian_eye": "Elder Guardian Eye",
        "block.winterworks.eye_of_the_ocean": "Eye of the Ocean",
        "entity.winterworks.elder_bubble": "Elder Guardian Bubble",
        "death.attack.winterworks.elder_stare": "%1$s was disintegrated by %2$s's stare",
        "death.attack.winterworks.elder_stare.player": "%1$s was disintegrated by %2$s's stare while fighting %3$s",
        "commands.winterworks.trust.added": "You now trust %s: they can use your Eye of the Ocean and Nautilus Horn",
        "commands.winterworks.trust.already": "You already trust %s",
        "commands.winterworks.trust.removed": "You no longer trust %s",
        "commands.winterworks.trust.not_trusted": "You don't trust %s",
        "commands.winterworks.trust.self": "You always trust yourself",
        "commands.winterworks.trust.unknown": "There is no player called %s",
        "commands.winterworks.trust.list": "You trust: %s",
        "commands.winterworks.trust.none": "You don't trust anyone yet. Use /winterworks trust <player>",
    })


def run(ctx):
    recipes(ctx)
    blocks(ctx)
    tags(ctx)
    damage(ctx)
    lang(ctx)
