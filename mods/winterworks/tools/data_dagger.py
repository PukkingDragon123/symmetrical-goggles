"""Data for the dagger area of the Cold Zone update (docs/COLD_UPDATE.md sections 2 and 9): Fang Dagger and Polar Bear
Fur item models, recipes, enchantability tags and lang.
Called by gen_data.py with ctx = gen_data.Ctx (ctx.write, ctx.shaped, ctx.shapeless, ctx.A assets dir, ctx.D data dir,
ctx.M mod id, ctx.L lang fragments dir). Lang goes to os.path.join(ctx.L, "dagger.json").
"""
import os

FUR = ["fur_hood", "fur_coat", "fur_leggings", "fur_boots"]

# Vanilla item/handheld (+ item/generated) display transforms: FangDaggerRenderer lays the 3D dagger along the sprite
# diagonal, so it is held like a sword in either hand, first person included (0.4 fixes; a little higher there: a dagger
# is shorter than a sword). GUI stays identity: the renderer poses its own 3D icon there.
HANDHELD = {
    "gui": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
    "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [0.5, 0.5, 0.5]},
    "fixed": {"rotation": [0, 180, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
    "head": {"rotation": [0, 180, 0], "translation": [0, 13, 7], "scale": [1, 1, 1]},
    "thirdperson_righthand": {"rotation": [0, -90, 55], "translation": [0, 4.0, 0.5], "scale": [0.85, 0.85, 0.85]},
    "thirdperson_lefthand": {"rotation": [0, 90, -55], "translation": [0, 4.0, 0.5], "scale": [0.85, 0.85, 0.85]},
    "firstperson_righthand": {"rotation": [0, -90, 25], "translation": [1.13, 6.0, 1.13], "scale": [0.68, 0.68, 0.68]},
    "firstperson_lefthand": {"rotation": [0, 90, -25], "translation": [1.13, 6.0, 1.13], "scale": [0.68, 0.68, 0.68]},
}


def item_models(ctx):
    models = os.path.join(ctx.A, "models", "item")
    for n in FUR + ["polar_bear_fur", "mauler_fang"]:
        ctx.write(os.path.join(models, n + ".json"), {"parent": "minecraft:item/generated", "textures": {"layer0": f"{ctx.M}:item/{n}"}})
    ctx.write(os.path.join(models, "fang_dagger_icon.json"),
              {"parent": "minecraft:item/handheld", "textures": {"layer0": f"{ctx.M}:item/fang_dagger"}})
    ctx.write(os.path.join(models, "fang_dagger.json"), {
        "parent": "minecraft:builtin/entity", "gui_light": "front",
        "textures": {"particle": f"{ctx.M}:item/fang_dagger"},
        "display": HANDHELD})


def recipe(ctx, name, pattern, key):
    k = {c: ({"tag": v[1:]} if v.startswith("#") else {"item": v}) for c, v in key.items()}
    ctx.write(os.path.join(ctx.D, ctx.M, "recipe", name + ".json"), {
        "type": "minecraft:crafting_shaped", "category": "equipment", "pattern": pattern, "key": k,
        "result": {"id": f"{ctx.M}:{name}", "count": 1}})


def recipes(ctx):
    fur, wool = f"{ctx.M}:polar_bear_fur", "#minecraft:wool"
    recipe(ctx, "fang_dagger", ["M", "F", "S"], {"M": f"{ctx.M}:mauler_fang", "F": fur, "S": "minecraft:stick"})
    recipe(ctx, "fur_hood", ["FWF", "F F"], {"F": fur, "W": wool})
    recipe(ctx, "fur_coat", ["F F", "FWF", "FFF"], {"F": fur, "W": wool})
    recipe(ctx, "fur_leggings", ["FWF", "F F", "F F"], {"F": fur, "W": wool})
    recipe(ctx, "fur_boots", ["F F", "W W"], {"F": fur, "W": wool})


def tags(ctx):
    """Enchantability: fur pieces join the vanilla armour slot tags (Protection, Unbreaking, Mending...), the dagger the
    sword enchantment tags (Sharpness, Smite, Fire Aspect, Looting, Knockback, Unbreaking, Mending)."""
    def tag(path, values):
        ctx.write(os.path.join(ctx.D, "minecraft", "tags", "item", *path) + ".json", {"replace": False, "values": values})
    for piece, slot in zip(FUR, ["head_armor", "chest_armor", "leg_armor", "foot_armor"]):
        tag([slot], [f"{ctx.M}:{piece}"])
    for t in ("sword", "sharp_weapon", "durability"):
        tag(["enchantable", t], [f"{ctx.M}:fang_dagger"])


def lang(ctx):
    ctx.write(os.path.join(ctx.L, "dagger.json"), {
        "item.winterworks.fang_dagger": "Fang Daggers",
        "item.winterworks.fang_dagger.tip": "A dagger in each hand (keep your off hand free): left click strikes left, right click strikes right",
        "item.winterworks.fang_dagger.tip2": "Sneak + jump to pounce. Tired? A falling hit is a Fang Crit (2x, Frostbite)",
        "item.winterworks.polar_bear_fur": "Polar Bear Fur",
        "item.winterworks.fur_hood": "Fur Hood",
        "item.winterworks.fur_coat": "Fur Coat",
        "item.winterworks.fur_leggings": "Fur Leggings",
        "item.winterworks.fur_boots": "Fur Boots",
        "item.winterworks.mauler_fang": "Frost Mauler Fang",
    })


def run(ctx):
    item_models(ctx)
    recipes(ctx)
    tags(ctx)
    lang(ctx)
