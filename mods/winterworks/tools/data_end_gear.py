"""Data for the gear (docs/END_UPDATE.md sections 9, 11-13): End Glider, Obsidian Shield, Monolith Wand, petrification,
Dragon Egg cracking, Dragonling. Called by gen_data.py with ctx = gen_data.Ctx.

Item models (the shield, wand and glider are 3D everywhere, drawn by client.endgear's BuiltinItemRenderers; the shield
uses vanilla shield.json / shield_blocking.json transforms, the wand vanilla item/handheld's, the glider identity), the
cracked Dragon Egg item models and the override on minecraft:dragon_egg, recipes, the petrify_immune entity tag,
enchantability tags, the obsidian_crack particle, placeholder sounds for any gear event sounds.json doesn't map yet, and
lang/end_gear.json.
"""
import glob
import json
import os

# Re-pitched vanilla sounds for the gear's events, used only while sounds.json has no entry for them:
# name -> ([(file, pitch)], subtitle)
PLACEHOLDER_SOUNDS = {
    "item.end_glider.flap": ([("mob/phantom/flap1", 0.9), ("mob/phantom/flap2", 1.0), ("mob/phantom/flap3", 0.95)],
                             "Glider wings beat"),
    "item.end_glider.jet": ([("fire/fire", 1.6), ("fire/ignite", 1.8), ("mob/blaze/breathe1", 1.4)], "Glider jets roar"),
    "item.end_glider.boost": ([("fireworks/launch1", 0.8), ("mob/breeze/shoot", 0.7)], "Glider boosts"),
    "item.obsidian_shield.reflect": ([("random/anvil_land", 1.6), ("random/glass1", 0.6)], "Shield reflects"),
    "item.obsidian_shield.shockwave": ([("random/explode1", 1.4), ("mob/warden/sonic_boom1", 1.6)], "Shield shockwave"),
    "item.monolith_wand.petrify": ([("block/beacon/power1", 1.6), ("mob/evocation_illager/cast1", 0.6)], "Wand petrifies"),
    "effect.petrified.encase": ([("dig/stone1", 0.5), ("dig/stone2", 0.55), ("block/respawn_anchor/charge1", 0.6)],
                                "Encased in obsidian"),
    "effect.petrified.shatter": ([("random/glass1", 0.5), ("random/glass2", 0.45), ("random/glass3", 0.5)], "Obsidian shatters"),
    "entity.dragonling.ambient": ([("mob/enderdragon/growl1", 2.0), ("mob/enderdragon/growl2", 2.0), ("mob/enderdragon/growl3", 1.9)],
                                  "Dragonling chirrs"),
    "entity.dragonling.hurt": ([("mob/enderdragon/hit1", 1.8), ("mob/enderdragon/hit2", 1.8), ("mob/enderdragon/hit3", 1.9)],
                               "Dragonling hurts"),
    "entity.dragonling.death": ([("mob/enderdragon/end", 2.0)], "Dragonling dies"),
    "entity.dragonling.eat": ([("random/eat1", 1.2), ("random/eat2", 1.3), ("random/eat3", 1.2)], "Dragonling eats"),
    "entity.dragonling.roar": ([("mob/enderdragon/growl3", 1.4), ("mob/enderdragon/growl4", 1.3)], "Dragonling roars"),
    "entity.dragonling.flap": ([("mob/enderdragon/wings1", 1.6), ("mob/enderdragon/wings2", 1.6), ("mob/enderdragon/wings3", 1.5)],
                               "Dragonling flaps"),
    "entity.dragonling.breath": ([("mob/enderdragon/growl1", 1.1), ("mob/ghast/fireball4", 0.8), ("fire/ignite", 0.7)],
                                 "Dragonling breathes fire"),
    "entity.dragonling.hatch": ([("random/glass2", 0.6), ("mob/turtle/baby/egg_hatched1", 0.7), ("mob/turtle/baby/egg_hatched2", 0.7)],
                                "Dragonling hatches"),
    "item.dragon_egg.crack": ([("mob/turtle/egg/egg_crack1", 0.6), ("mob/turtle/egg/egg_crack2", 0.6), ("mob/turtle/egg/egg_crack3", 0.6)],
                              "Dragon Egg cracks"),
}

# vanilla shield.json and shield_blocking.json
SHIELD = {
    "thirdperson_righthand": {"rotation": [0, 90, 0], "translation": [10, 6, -4], "scale": [1, 1, 1]},
    "thirdperson_lefthand": {"rotation": [0, 90, 0], "translation": [10, 6, 12], "scale": [1, 1, 1]},
    "firstperson_righthand": {"rotation": [0, 180, 5], "translation": [-10, 2, -10], "scale": [1.25, 1.25, 1.25]},
    "firstperson_lefthand": {"rotation": [0, 180, 5], "translation": [10, 0, -10], "scale": [1.25, 1.25, 1.25]},
    "gui": {"rotation": [15, -25, -5], "translation": [2, 3, 0], "scale": [0.65, 0.65, 0.65]},
    "fixed": {"rotation": [0, 180, 0], "translation": [-4.5, 4.5, -5], "scale": [0.55, 0.55, 0.55]},
    "ground": {"rotation": [0, 0, 0], "translation": [2, 4, 2], "scale": [0.25, 0.25, 0.25]},
}
SHIELD_BLOCKING = {
    "thirdperson_righthand": {"rotation": [45, 155, 0], "translation": [-3.49, 11, -2], "scale": [1, 1, 1]},
    "thirdperson_lefthand": {"rotation": [45, 155, 0], "translation": [11.51, 7, 2.5], "scale": [1, 1, 1]},
    "firstperson_righthand": {"rotation": [0, 180, -5], "translation": [-15, 5, -11], "scale": [1.25, 1.25, 1.25]},
    "firstperson_lefthand": {"rotation": [0, 180, -5], "translation": [5, 5, -11], "scale": [1.25, 1.25, 1.25]},
    "gui": {"rotation": [15, -25, -5], "translation": [2, 3, 0], "scale": [0.65, 0.65, 0.65]},
}
# vanilla item/handheld (+ item/generated): the wand is laid along the sprite diagonal (client.endgear.MonolithWandRenderer)
HANDHELD = {
    "gui": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
    "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [0.5, 0.5, 0.5]},
    "fixed": {"rotation": [0, 180, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
    "head": {"rotation": [0, 180, 0], "translation": [0, 13, 7], "scale": [1, 1, 1]},
    "thirdperson_righthand": {"rotation": [0, -90, 55], "translation": [0, 4.0, 0.5], "scale": [0.85, 0.85, 0.85]},
    "thirdperson_lefthand": {"rotation": [0, 90, -55], "translation": [0, 4.0, 0.5], "scale": [0.85, 0.85, 0.85]},
    "firstperson_righthand": {"rotation": [0, -90, 25], "translation": [1.13, 3.2, 1.13], "scale": [0.68, 0.68, 0.68]},
    "firstperson_lefthand": {"rotation": [0, 90, -25], "translation": [1.13, 3.2, 1.13], "scale": [0.68, 0.68, 0.68]},
}
IDENTITY = {k: {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]}
            for k in ("gui", "ground", "fixed", "head", "thirdperson_righthand", "thirdperson_lefthand",
                      "firstperson_righthand", "firstperson_lefthand")}


def has_texture(ctx, path):
    return os.path.exists(os.path.join(ctx.A, "textures", path + ".png"))


def item_models(ctx):
    M = ctx.M
    models = os.path.join(ctx.A, "models", "item")

    def item(name, obj):
        ctx.write(os.path.join(models, name + ".json"), obj)

    item("obsidian_shield", {"parent": "minecraft:builtin/entity", "gui_light": "front",
                             "textures": {"particle": "minecraft:block/obsidian"}, "display": SHIELD,
                             "overrides": [{"predicate": {"minecraft:blocking": 1}, "model": f"{M}:item/obsidian_shield_blocking"}]})
    item("obsidian_shield_blocking", {"parent": "minecraft:builtin/entity", "gui_light": "front",
                                      "textures": {"particle": "minecraft:block/obsidian"}, "display": SHIELD_BLOCKING})
    item("monolith_wand", {"parent": "minecraft:builtin/entity", "gui_light": "front",
                           "textures": {"particle": "minecraft:block/crying_obsidian"}, "display": HANDHELD})
    item("end_glider", {"parent": "minecraft:builtin/entity", "gui_light": "front",
                        "textures": {"particle": "minecraft:item/phantom_membrane"}, "display": IDENTITY})
    item("dragonling_spawn_egg", {"parent": "minecraft:item/template_spawn_egg"})
    # the cracked Dragon Egg: 2D icons (the uncracked egg stays the vanilla 3D block item)
    for n in (1, 2):
        tex = f"{M}:item/dragon_egg_cracked_{n}" if has_texture(ctx, f"item/dragon_egg_cracked_{n}") else "minecraft:block/dragon_egg"
        item(f"dragon_egg_cracked_{n}", {"parent": "minecraft:item/generated", "textures": {"layer0": tex}})
    ctx.write(os.path.join(ctx.RES, "assets", "minecraft", "models", "item", "dragon_egg.json"), {
        "parent": "minecraft:block/dragon_egg",
        "overrides": [{"predicate": {f"{M}:egg_cracks": 0.5}, "model": f"{M}:item/dragon_egg_cracked_1"},
                      {"predicate": {f"{M}:egg_cracks": 1.0}, "model": f"{M}:item/dragon_egg_cracked_2"}]})


def recipe(ctx, name, pattern, key):
    k = {c: ({"tag": v[1:]} if v.startswith("#") else {"item": v}) for c, v in key.items()}
    ctx.write(os.path.join(ctx.D, ctx.M, "recipe", name + ".json"), {
        "type": "minecraft:crafting_shaped", "category": "equipment", "pattern": pattern, "key": k,
        "result": {"id": f"{ctx.M}:{name}", "count": 1}})


def recipes(ctx):
    M = ctx.M
    recipe(ctx, "obsidian_shield", ["SIS", "SSS", " S "], {"S": f"{M}:obsidian_shard", "I": "minecraft:iron_ingot"})
    recipe(ctx, "monolith_wand", [" E ", "OCO", " R "], {"E": f"{M}:monolith_eye", "O": "minecraft:obsidian",
                                                          "C": f"{M}:meteorite_core", "R": f"{M}:void_rod"})
    recipe(ctx, "end_glider", ["WSW", "GMG", "PSP"], {"W": f"{M}:enderfly_wing", "S": "minecraft:shulker_shell",
                                                      "G": f"{M}:gucker_gland", "M": f"{M}:meteorite",
                                                      "P": "minecraft:phantom_membrane"})


def tags(ctx):
    M = ctx.M
    ctx.write(os.path.join(ctx.D, M, "tags", "entity_type", "petrify_immune.json"), {"replace": False, "values": [
        "minecraft:ender_dragon", "minecraft:wither", "minecraft:warden", f"{M}:monolith", f"{M}:frost_mauler"]})
    # Unbreaking and Mending
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "item", "enchantable", "durability.json"),
              {"replace": False, "values": [f"{M}:obsidian_shield", f"{M}:monolith_wand", f"{M}:end_glider"]})


def particles(ctx):
    frames = sorted(glob.glob(os.path.join(ctx.A, "textures", "particle", "obsidian_crack_*.png")),
                    key=lambda p: int(os.path.basename(p)[len("obsidian_crack_"):-4]))
    textures = [f"{ctx.M}:{os.path.basename(p)[:-4]}" for p in frames] or [f"minecraft:generic_{i}" for i in range(4)]
    ctx.write(os.path.join(ctx.A, "particles", "obsidian_crack.json"), {"textures": textures})


def placeholder_sounds(ctx):
    """Adds the gear sound events that sounds.json doesn't have yet; returns the subtitles for those (only)."""
    path = os.path.join(ctx.A, "sounds.json")
    sounds = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    subs = {}
    for name, (files, subtitle) in PLACEHOLDER_SOUNDS.items():
        if name in sounds:
            continue
        sounds[name] = {"sounds": [{"name": "minecraft:" + f, "pitch": p} for f, p in files],
                        "subtitle": f"subtitles.{ctx.M}.{name}"}
        subs[f"subtitles.{ctx.M}.{name}"] = subtitle
    if subs:
        ctx.write(path, sounds)
    return subs


def lang(ctx, subtitles):
    L = {
        "item.winterworks.obsidian_shield": "Obsidian Shield",
        "item.winterworks.obsidian_shield.tip": "Throws half of every blocked hit back at the attacker",
        "item.winterworks.obsidian_shield.tip2": "Sneak as you raise it: a knockback shockwave (5 s cooldown)",
        "item.winterworks.monolith_wand": "Monolith Wand",
        "item.winterworks.monolith_wand.tip": "Petrifies a creature in obsidian for 10 s. Bosses resist",
        "item.winterworks.end_glider": "End Glider",
        "item.winterworks.end_glider.tip": "Hold it while gliding on an Elytra: fly where you look, no fireworks",
        "item.winterworks.end_glider.tip2": "Hold use to boost (steering gets heavy)",
        "item.winterworks.dragonling_spawn_egg": "Dragonling Spawn Egg",
        "entity.winterworks.dragonling": "Dragonling",
        "effect.winterworks.petrified": "Petrified",
        "key.winterworks.dragon_breath": "Dragon Breath (riding a Dragonling)",
        "key.categories.winterworks": "Winterworks",
        "message.winterworks.dragonling.breath": "Dragon's breath: %s / %s",
        "message.winterworks.dragonling.no_breath": "Out of breath: feed it a bottle of Dragon's Breath",
    }
    L.update(subtitles)
    ctx.write(os.path.join(ctx.L, "end_gear.json"), L)


def run(ctx):
    item_models(ctx)
    recipes(ctx)
    tags(ctx)
    particles(ctx)
    lang(ctx, placeholder_sounds(ctx))
