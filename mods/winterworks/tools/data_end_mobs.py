"""Data for the mobs of The Living End (docs/END_UPDATE.md sections 2, 4, 6-9): the Enderfly, Endling, Gucker and
Obolisk (loot, spawn egg models), the Chorus Cocoon and End Bloom (blockstates, models, loot), the End Bulb and the other
drops (item models, cooking), the Recall potion, the endling_head_plants and obolisk_unbreakable tags, placeholder sounds
where the sound map doesn't provide them yet, and lang/end_mobs.json. Called by gen_data.py with
ctx = gen_data.Ctx.

Art comes later from lowpix (entity models, block models of the cocoon, 32 x 32 textures): until a texture exists the
models here point at a vanilla stand-in, so re-run gen_data.py when the art lands."""
import json
import os


def _tex(ctx, kind, name, fallback):
    """`winterworks:<kind>/<name>` if the art has it, else the vanilla stand-in."""
    if os.path.exists(os.path.join(ctx.A, "textures", kind, name + ".png")):
        return f"{ctx.M}:{kind}/{name}"
    return fallback


# placeholder sounds (re-pitched vanilla files) for events nothing else defines yet: name -> ([(file, pitch)], subtitle)
SOUNDS = {
    "entity.enderfly.ambient": ([("mob/silverfish/say1", 1.6), ("mob/silverfish/say3", 1.7), ("mob/bat/idle2", 1.3)], "Enderfly chitters"),
    "entity.enderfly.flutter": ([("mob/phantom/flap1", 1.9), ("mob/phantom/flap3", 2.0), ("mob/parrot/fly2", 1.4)], "Enderfly flutters"),
    "entity.enderfly.hurt": ([("mob/silverfish/hit1", 1.4), ("mob/silverfish/hit2", 1.5)], "Enderfly hurts"),
    "entity.enderfly.death": ([("mob/silverfish/kill", 1.3), ("mob/bat/death", 1.2)], "Enderfly dies"),
    "entity.enderfly.teleport": ([("mob/endermen/portal", 1.7), ("mob/endermen/portal2", 1.8)], "Enderfly blinks away"),
    "entity.enderfly.dive": ([("mob/phantom/swoop1", 1.7), ("mob/phantom/swoop3", 1.8)], "Enderfly dives"),
    "entity.endling.ambient": ([("mob/endermen/idle1", 1.9), ("mob/endermen/idle3", 2.0), ("mob/allay/idle_without_item2", 1.3)],
                               "Endling warbles"),
    "entity.endling.hurt": ([("mob/endermen/hit1", 1.9), ("mob/endermen/hit3", 2.0)], "Endling hurts"),
    "entity.endling.death": ([("mob/endermen/death", 1.9)], "Endling dies"),
    "entity.endling.happy": ([("mob/allay/idle_with_item1", 1.4), ("mob/allay/idle_with_item3", 1.5)], "Endling chirps happily"),
    "entity.endling.scared": ([("mob/endermen/scream1", 2.0), ("mob/endermen/scream3", 2.0)], "Endling squeaks"),
    "entity.endling.teleport": ([("mob/endermen/portal", 1.8), ("mob/endermen/portal2", 1.9)], "Endling hops away"),
    "entity.endling.sacrifice": ([("block/beacon/activate", 1.4), ("block/respawn_anchor/set_spawn1", 1.2)], "Endling gives itself up"),
    "entity.gucker.ambient": ([("mob/hoglin/idle3", 0.6), ("mob/hoglin/idle7", 0.55), ("mob/frog/idle2", 0.5)], "Gucker croaks"),
    "entity.gucker.hurt": ([("mob/hoglin/hurt1", 0.6), ("mob/hoglin/hurt3", 0.6)], "Gucker hurts"),
    "entity.gucker.death": ([("mob/hoglin/death1", 0.55), ("mob/hoglin/death3", 0.55)], "Gucker dies"),
    "entity.gucker.breathe": ([("mob/warden/sniff_1", 1.3), ("mob/warden/sniff_3", 1.4)], "Gucker breathes"),
    "entity.gucker.burrow": ([("mob/warden/dig", 1.4)], "Gucker burrows"),
    "entity.gucker.emerge": ([("mob/warden/emerge", 1.5)], "Gucker bursts out"),
    "entity.gucker.inflate": ([("mob/frog/idle5", 0.4), ("item/bottle/fill_dragonbreath1", 0.5)], "Gucker swells"),
    "entity.gucker.spit": ([("mob/llama/spit1", 0.6), ("mob/llama/spit2", 0.6)], "Gucker spits"),
    "entity.gucker.bite": ([("mob/ravager/bite1", 1.1), ("mob/ravager/bite2", 1.1)], "Gucker bites"),
    "entity.gucker.step": ([("mob/hoglin/step1", 0.8), ("mob/hoglin/step3", 0.8)], None),
    "entity.obolisk.ambient": ([("mob/guardian/elder_idle1", 0.5), ("mob/guardian/elder_idle3", 0.5)], "Obolisk hums"),
    "entity.obolisk.rise": ([("block/basalt/break1", 0.5), ("mob/warden/emerge", 0.7)], "Obolisk rises"),
    "entity.obolisk.settle": ([("block/basalt/break3", 0.5), ("dig/stone2", 0.5)], "Obolisk settles"),
    "entity.obolisk.slam": ([("random/explode2", 0.6), ("mob/irongolem/hit2", 0.5)], "Obolisk slams"),
    "entity.obolisk.step": ([("mob/irongolem/walk1", 0.6), ("mob/irongolem/walk3", 0.6)], None),
    "entity.obolisk.hurt": ([("mob/irongolem/hit1", 0.6), ("block/basalt/break2", 0.7)], "Obolisk cracks"),
    "entity.obolisk.death": ([("mob/irongolem/death", 0.5), ("random/explode3", 0.8)], "Obolisk crumbles"),
    "block.end_bloom.open": ([("block/amethyst/resonate1", 1.4), ("block/amethyst/resonate3", 1.5)], "End Bloom opens"),
    "block.chorus_cocoon.crack": ([("mob/turtle/egg/egg_crack1", 0.8), ("mob/turtle/egg/egg_crack3", 0.8)], "Cocoon cracks"),
    "block.chorus_cocoon.hatch": ([("mob/turtle/egg/egg_break1", 0.9), ("block/chorus_flower/death2", 1.3)], "Cocoon hatches"),
    "effect.recall.teleport": ([("block/respawn_anchor/set_spawn2", 1.3), ("mob/endermen/portal", 0.8)], "Recalled home"),
}


def sounds(ctx):
    """Adds placeholders to sounds.json only for events nobody else (gen_data's list, the sound map) has defined;
    returns their subtitles, so no subtitle key is ever defined twice."""
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


# ------------------------------------------------------------------------------------------------ models
ITEMS = {   # item -> vanilla stand-in texture until the 32 x 32 icon lands
    "end_bulb": "minecraft:item/chorus_fruit",
    "enderfly_wing": "minecraft:item/phantom_membrane",
    "gucker_meat": "minecraft:item/mutton",
    "cooked_gucker_meat": "minecraft:item/cooked_mutton",
    "gucker_gland": "minecraft:item/slime_ball",
    "obsidian_shard": "minecraft:item/amethyst_shard",
}


def item_models(ctx):
    M = ctx.M
    for name, fallback in ITEMS.items():
        ctx.write(os.path.join(ctx.A, "models", "item", name + ".json"),
                  {"parent": "minecraft:item/generated", "textures": {"layer0": _tex(ctx, "item", name, fallback)}})
    for egg in ("enderfly", "endling", "gucker", "obolisk"):
        ctx.write(os.path.join(ctx.A, "models", "item", egg + "_spawn_egg.json"), {"parent": "minecraft:item/template_spawn_egg"})
    # the End Bloom's inventory icon
    ctx.write(os.path.join(ctx.A, "models", "item", "end_bloom.json"), {"parent": "minecraft:item/generated", "textures": {
        "layer0": _tex(ctx, "item", "end_bloom", _tex(ctx, "block", "end_bloom_closed", "minecraft:block/allium"))}})


def bloom(ctx):
    """Cross models: closed / open / open_bare, and the glow overlay (drawn emissive by client.endmob.BloomGlowModel)."""
    M = ctx.M
    closed = _tex(ctx, "block", "end_bloom_closed", "minecraft:block/allium")
    opened = _tex(ctx, "block", "end_bloom_open", "minecraft:block/lilac_top")
    bare = _tex(ctx, "block", "end_bloom_open_bare", "minecraft:block/lilac_bottom")
    glow = _tex(ctx, "block", "end_bloom_glow", opened)
    for name, tex in (("end_bloom_closed", closed), ("end_bloom_open", opened), ("end_bloom_open_bare", bare), ("end_bloom_glow", glow)):
        ctx.write(os.path.join(ctx.A, "models", "block", name + ".json"),
                  {"parent": "minecraft:block/cross", "textures": {"cross": tex}})
    v = {}
    for o in ("false", "true"):
        for b in ("false", "true"):
            model = "end_bloom_closed" if o == "false" else ("end_bloom_open" if b == "true" else "end_bloom_open_bare")
            v[f"bulb={b},open={o}"] = {"model": f"{M}:block/{model}"}
    ctx.write(os.path.join(ctx.A, "blockstates", "end_bloom.json"), {"variants": v})


def cocoon(ctx):
    """The 3D cocoon models come from the art (models/block/chorus_cocoon_age0..3.json); placeholders only for ages it lacks."""
    M = ctx.M
    blk = os.path.join(ctx.A, "models", "block")
    sizes = [(2.5, 6, 0), (3.5, 9, 1), (4, 12, 2), (5, 14, 2)]   # half width, height, stalk length
    variants = {}
    for age, (hw, h, stalk) in enumerate(sizes):
        art = os.path.exists(os.path.join(blk, f"chorus_cocoon_age{age}.json"))
        name = f"chorus_cocoon_age{age}" if art else f"chorus_cocoon_placeholder_age{age}"
        stale = os.path.join(blk, f"chorus_cocoon_placeholder_age{age}.json")
        if art and os.path.exists(stale):
            os.remove(stale)   # the art is in: the placeholder goes
        if not art:
            top = 16 - stalk
            els = [{"from": [8 - hw, top - h, 8 - hw], "to": [8 + hw, top, 8 + hw], "faces": {
                f: {"texture": "#body", "uv": [4, 2, 12, 14] if f not in ("up", "down") else [4, 4, 12, 12]}
                for f in ("north", "south", "east", "west", "up", "down")}},
                   {"from": [8 - hw + 1, top - h - 1, 8 - hw + 1], "to": [8 + hw - 1, top - h, 8 + hw - 1], "faces": {
                       f: {"texture": "#tip"} for f in ("north", "south", "east", "west", "down")}}]
            if stalk:
                els.append({"from": [7, top, 7], "to": [9, 16, 9], "faces": {
                    f: {"texture": "#stalk", "uv": [7, 0, 9, stalk]} for f in ("north", "south", "east", "west")}})
            ctx.write(os.path.join(blk, name + ".json"), {
                "parent": "minecraft:block/block",
                "textures": {"body": "minecraft:block/chorus_flower", "tip": "minecraft:block/chorus_flower_dead",
                             "stalk": "minecraft:block/chorus_plant", "particle": "minecraft:block/chorus_flower"},
                "elements": els})
        variants[f"age={age}"] = {"model": f"{M}:block/{name}"}
    ctx.write(os.path.join(ctx.A, "blockstates", "chorus_cocoon.json"), {"variants": variants})
    ctx.write(os.path.join(ctx.A, "models", "item", "chorus_cocoon.json"), {
        "parent": variants["age=2"]["model"],
        "display": {
            "gui": {"rotation": [30, 225, 0], "translation": [0, 1, 0], "scale": [0.7, 0.7, 0.7]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.25, 0.25, 0.25]},
            "fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [0.5, 0.5, 0.5]},
            "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.375, 0.375, 0.375]},
            "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 0, 0], "scale": [0.4, 0.4, 0.4]},
            "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 0, 0], "scale": [0.4, 0.4, 0.4]}}})


# ------------------------------------------------------------------------------------------------ data
def _loot(ctx, path, typ, pools):
    ctx.write(os.path.join(ctx.D, ctx.M, "loot_table", *path.split("/")) + ".json", {"type": typ, "pools": pools})


def _count(lo, hi):
    return {"function": "minecraft:set_count", "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}


def _looting(lo, hi):
    return {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",
            "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}


SILK = {"condition": "minecraft:match_tool", "predicate": {"predicates": {"minecraft:enchantments": [
    {"enchantments": "minecraft:silk_touch", "levels": {"min": 1}}]}}}


def loot(ctx):
    M = ctx.M
    _loot(ctx, "blocks/end_bloom", "minecraft:block", [{"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:end_bloom"}],
                                                        "conditions": [{"condition": "minecraft:survives_explosion"}]}])
    _loot(ctx, "blocks/chorus_cocoon", "minecraft:block", [{"rolls": 1, "entries": [{"type": "minecraft:alternatives", "children": [
        {"type": "minecraft:item", "name": f"{M}:chorus_cocoon", "conditions": [SILK]},
        {"type": "minecraft:item", "name": "minecraft:chorus_fruit", "functions": [_count(1, 2), {"function": "minecraft:explosion_decay"}]}]}]}])
    _loot(ctx, "entities/enderfly", "minecraft:entity", [{"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:enderfly_wing"}],
        "conditions": [{"condition": "minecraft:random_chance_with_enchanted_bonus", "enchantment": "minecraft:looting",
                        "unenchanted_chance": 0.25,
                        "enchanted_chance": {"type": "minecraft:linear", "base": 0.30, "per_level_above_first": 0.05}}]}])
    on_fire = {"condition": "minecraft:entity_properties", "entity": "this", "predicate": {"flags": {"is_on_fire": True}}}
    _loot(ctx, "entities/gucker", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:gucker_meat", "functions": [
            _count(1, 3), {"function": "minecraft:furnace_smelt", "conditions": [on_fire]}, _looting(0, 1)]}]},
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:gucker_gland", "functions": [_count(0, 1), _looting(0, 1)]}]}])
    _loot(ctx, "entities/obolisk", "minecraft:entity", [
        {"rolls": 1, "entries": [{"type": "minecraft:item", "name": f"{M}:obsidian_shard", "functions": [_count(2, 4), _looting(0, 1)]}]}])


def recipes(ctx):
    M = ctx.M
    for kind, time, suffix in (("smelting", 200, ""), ("smoking", 100, "_from_smoking"), ("campfire_cooking", 600, "_from_campfire_cooking")):
        ctx.write(os.path.join(ctx.D, M, "recipe", "cooked_gucker_meat" + suffix + ".json"), {
            "type": "minecraft:" + kind, "category": "food", "cookingtime": time, "experience": 0.35,
            "ingredient": {"item": f"{M}:gucker_meat"}, "result": {"id": f"{M}:cooked_gucker_meat"}})


def tags(ctx):
    M = ctx.M
    T = os.path.join(ctx.D, M, "tags")
    ctx.write(os.path.join(T, "item", "endling_head_plants.json"), {"replace": False, "values": [
        "#minecraft:small_flowers", "#minecraft:saplings", "minecraft:red_mushroom", "minecraft:brown_mushroom",
        "minecraft:crimson_fungus", "minecraft:warped_fungus", "minecraft:crimson_roots", "minecraft:warped_roots",
        "minecraft:fern", "minecraft:short_grass", "minecraft:dead_bush", "minecraft:chorus_flower",
        f"{M}:end_bloom", f"{M}:end_grass", f"{M}:dry_end_bush"]})
    ctx.write(os.path.join(T, "block", "obolisk_unbreakable.json"), {"replace": False, "values": [
        "#minecraft:wither_immune", "#minecraft:dragon_immune", "#minecraft:shulker_boxes", "minecraft:chest",
        "minecraft:trapped_chest", "minecraft:ender_chest", "minecraft:barrel", "minecraft:spawner", "minecraft:trial_spawner",
        "minecraft:vault", "minecraft:beacon", "minecraft:conduit", "minecraft:lodestone", "minecraft:respawn_anchor",
        "minecraft:crying_obsidian", "minecraft:end_portal_frame", "minecraft:suspicious_sand", "minecraft:suspicious_gravel",
        f"{M}:suspicious_end_sand"]})
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "block", "mineable", "axe.json"),
              {"replace": False, "values": [f"{M}:chorus_cocoon"]})


def lang(ctx, subs):
    M = ctx.M
    L = {
        "entity.winterworks.enderfly": "Enderfly",
        "entity.winterworks.endling": "Endling",
        "entity.winterworks.gucker": "Gucker",
        "entity.winterworks.gucker_spit": "Gucker Spit",
        "entity.winterworks.obolisk": "Obolisk",
        "item.winterworks.enderfly_spawn_egg": "Enderfly Spawn Egg",
        "item.winterworks.endling_spawn_egg": "Endling Spawn Egg",
        "item.winterworks.gucker_spawn_egg": "Gucker Spawn Egg",
        "item.winterworks.obolisk_spawn_egg": "Obolisk Spawn Egg",
        "block.winterworks.end_bloom": "End Bloom",
        "block.winterworks.chorus_cocoon": "Chorus Cocoon",
        "item.winterworks.end_bulb": "End Bulb",
        "item.winterworks.end_bulb.tip": "Eat it to glow softly for a while",
        "item.winterworks.enderfly_wing": "Enderfly Wing",
        "item.winterworks.gucker_meat": "Raw Gucker",
        "item.winterworks.cooked_gucker_meat": "Cooked Gucker",
        "item.winterworks.gucker_gland": "Gucker Gland",
        "item.winterworks.obsidian_shard": "Obsidian Shard",
        "effect.winterworks.end_glow": "End Glow",
        "block.winterworks.glow_light": "End Glow Light",
        "effect.winterworks.recall": "Recall",
        "item.minecraft.potion.effect.recall": "Potion of Recall",
        "item.minecraft.splash_potion.effect.recall": "Splash Potion of Recall",
        "item.minecraft.lingering_potion.effect.recall": "Lingering Potion of Recall",
        "item.minecraft.tipped_arrow.effect.recall": "Arrow of Recall",
    }
    L.update(subs)
    ctx.write(os.path.join(ctx.L, "end_mobs.json"), L)


def glow_light(ctx):
    """End Glow's invisible light block: no model geometry, only a particle texture (never broken in survival)."""
    ctx.write(os.path.join(ctx.A, "blockstates", "glow_light.json"), {"variants": {
        "waterlogged=false": {"model": f"{ctx.M}:block/glow_light"}, "waterlogged=true": {"model": f"{ctx.M}:block/glow_light"}}})
    ctx.write(os.path.join(ctx.A, "models", "block", "glow_light.json"), {"textures": {"particle": "minecraft:item/light_14"}})


def run(ctx):
    subs = sounds(ctx)
    glow_light(ctx)
    item_models(ctx)
    bloom(ctx)
    cocoon(ctx)
    loot(ctx)
    recipes(ctx)
    tags(ctx)
    lang(ctx, subs)
