"""Data for the bosses (sections 5, 10, 11): the eclipse, the Ender Dragon rework, the Monolith. Called by gen_data.py with ctx = gen_data.Ctx.

Writes: the Monolith's loot table (entities/monolith; its 3 Monolith Eyes and Meteorite Core drop from code), its spawn
egg model, the eclipse_mote particle (the art's frames when they exist, else vanilla glitter), placeholder sounds for the
eclipse, the Monolith and the dragon rework when nothing else (gen_data's list, the sound map) defines them, the
Monolith and the Ender Dragon in #winterworks:petrify_immune, and lang/end_boss.json.
"""
import json
import os


def item(name, weight=1, count=None, functions=()):
    e = {"type": "minecraft:item", "name": name, "weight": weight}
    fs = []
    if count:
        fs.append({"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": count[0], "max": count[1]}})
    fs.extend(functions)
    if fs:
        e["functions"] = fs
    return e


def looting(lo, hi):
    return {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
            "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}


# placeholder sounds (re-pitched vanilla files) for events nothing else defines yet: name -> ([(file, pitch)], subtitle)
SOUNDS = {
    "ambient.eclipse.begin": ([("block/beacon/activate", 0.55), ("block/amethyst/resonate1", 0.5)], "An eclipse rises"),
    "ambient.eclipse.end": ([("block/beacon/deactivate", 0.55), ("block/amethyst/resonate3", 0.6)], "The eclipse passes"),
    "ambient.eclipse.loop": ([("block/beacon/ambient", 0.5)], None),
    "entity.monolith.ambient": ([("block/respawn_anchor/ambient1", 0.5), ("block/respawn_anchor/ambient2", 0.45),
                                 ("block/respawn_anchor/ambient3", 0.5)], "The Monolith hums"),
    "entity.monolith.stare": ([("mob/warden/sonic_charge1", 0.6), ("mob/warden/sonic_charge3", 0.55)], "The Monolith stares"),
    "entity.monolith.slam": ([("item/mace/smash_ground_heavy", 0.6), ("random/explode2", 0.55)], "A stone hand slams down"),
    "entity.monolith.grab": ([("mob/irongolem/throw", 0.5), ("block/deepslate/break2", 0.5)], "A stone hand grabs"),
    "entity.monolith.clap": ([("item/mace/smash_ground_heavy", 0.75), ("entity/wind_charge/wind_burst1", 0.5)], "The Monolith claps"),
    "entity.monolith.summon": ([("mob/evocation_illager/prepare_summon", 0.5), ("block/respawn_anchor/charge2", 0.6)],
                               "The Monolith summons"),
    "entity.monolith.hurt": ([("block/ancient_debris/break1", 0.5), ("block/ancient_debris/break3", 0.45),
                              ("mob/irongolem/damage1", 0.45)], "The Monolith cracks"),
    "entity.monolith.death": ([("mob/warden/sonic_boom2", 0.5), ("random/explode3", 0.4)], "The Monolith crumbles"),
    "entity.ender_dragon.grab": ([("mob/enderdragon/growl3", 1.2), ("mob/enderdragon/hit2", 0.8)], "Ender Dragon grabs"),
    "entity.ender_dragon.throw": ([("mob/enderdragon/wings4", 0.7), ("mob/enderdragon/growl1", 1.1)], "Ender Dragon throws"),
    "entity.ender_dragon.beam_charge": ([("block/beacon/power2", 0.7), ("mob/warden/sonic_charge2", 1.2)], "Dragon gathers light"),
    "entity.ender_dragon.beam_fire": ([("mob/warden/sonic_boom1", 1.3), ("block/beacon/activate", 1.5)], "Dragon fires a light beam"),
    "entity.ender_dragon.crystal_regrow": ([("block/amethyst/resonate2", 0.6), ("block/respawn_anchor/charge3", 0.8)],
                                           "End Crystal regrows"),
    "entity.ender_dragon.tower_grow": ([("block/deepslate/break4", 0.45), ("ambient/cave/cave10", 0.6)], "Obsidian towers grind upwards"),
}


def sounds(ctx):
    """Adds placeholders to sounds.json only for events nobody else has defined; returns their subtitles."""
    path = os.path.join(ctx.A, "sounds.json")
    with open(path, encoding="utf-8") as fh:
        defs = json.load(fh)
    subs = {}
    for name, (files, subtitle) in SOUNDS.items():
        if name in defs:
            continue
        d = {"sounds": [{"name": "minecraft:" + f, "pitch": p} for f, p in files]}
        if subtitle:
            d["subtitle"] = f"subtitles.{ctx.M}.{name}"
            subs[f"subtitles.{ctx.M}.{name}"] = subtitle
        defs[name] = d
    ctx.write(path, defs)
    return subs


def particles(ctx):
    """eclipse_mote: the art's frames (textures/particle/eclipse_mote_N.png) if there are any, else vanilla glitter."""
    tex = os.path.join(ctx.A, "textures", "particle")
    frames = []
    if os.path.isdir(tex):
        frames = sorted((f[:-4] for f in os.listdir(tex) if f.startswith("eclipse_mote_") and f.endswith(".png")),
                        key=lambda n: int(n.rsplit("_", 1)[1]) if n.rsplit("_", 1)[1].isdigit() else 0)
    names = [f"{ctx.M}:{f}" for f in frames] or [f"minecraft:glitter_{i}" for i in range(7, -1, -1)]
    ctx.write(os.path.join(ctx.A, "particles", "eclipse_mote.json"), {"textures": names})


def run(ctx):
    M = ctx.M
    # ---- the Monolith: loot (the eyes and the meteorite core are dropped by the entity itself), spawn egg, petrify immunity
    ctx.write(os.path.join(ctx.D, M, "loot_table", "entities", "monolith.json"), {"type": "minecraft:entity", "pools": [
        {"rolls": 1, "entries": [item(f"{M}:obsidian_shard", 1, (6, 12), [looting(0, 3)])]},
        {"rolls": 1, "entries": [item("minecraft:crying_obsidian", 1, (3, 6))]},
        {"rolls": {"type": "minecraft:uniform", "min": 1, "max": 2}, "entries": [
            item("minecraft:ender_pearl", 4, (2, 4)), item(f"{M}:meteorite", 2, (1, 2)),
            item("minecraft:experience_bottle", 3, (3, 6)), item("minecraft:chorus_fruit", 3, (4, 8))]}]})
    ctx.write(os.path.join(ctx.A, "models", "item", "monolith_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})
    ctx.write(os.path.join(ctx.D, M, "tags", "entity_type", "petrify_immune.json"),
              {"replace": False, "values": [f"{M}:monolith", "minecraft:ender_dragon"]})
    # ---- assets nobody else provides yet
    subs = sounds(ctx)
    particles(ctx)
    # ---- lang
    lang = {
        "item.winterworks.monolith_eye": "Monolith Eye",
        "entity.winterworks.monolith": "The Monolith",
        "entity.winterworks.dragon_light_beam": "Light Beam",
        "item.winterworks.monolith_spawn_egg": "Monolith Spawn Egg",
        "commands.winterworks.eclipse.start": "An eclipse rises over the End (%s s)",
        "commands.winterworks.eclipse.stop": "The eclipse is over",
        "commands.winterworks.eclipse.no_end": "This world has no End",
    }
    lang.update(subs)
    ctx.write(os.path.join(ctx.L, "end_boss.json"), lang)
