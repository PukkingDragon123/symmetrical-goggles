"""Data for the nether area of Hexes & Havoc (docs/HEXES_UPDATE.md sections 1, 6, 7 and 8): the Hex Fortress
(structure, structure set, biome tag, chest loot), the Piglin Witch and Golden Piglin (entity loot, golden piglin
bartering), Cursed Elixir in #minecraft:piglin_loved, placeholder sounds and the gold glint particle when no art or
sound map provides them, and lang/nether.json. Called by gen_data.py with ctx = gen_data.Ctx."""
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


EMPTY = lambda weight: {"type": "minecraft:empty", "weight": weight}  # noqa: E731


def loot(ctx, path, typ, pools):
    ctx.write(os.path.join(ctx.D, ctx.M, "loot_table", *path.split("/")) + ".json", {"type": typ, "pools": pools})


# placeholder sounds (re-pitched vanilla files) for events nothing else defines yet: name -> ([(file, pitch)], subtitle)
SOUNDS = {
    "entity.piglin_witch.ambient": ([("entity/witch/ambient1", 0.7), ("entity/witch/ambient3", 0.7), ("mob/piglin/idle2", 0.75),
                                     ("mob/piglin/idle4", 0.7)], "Piglin Witch mutters"),
    "entity.piglin_witch.hiccup": ([("random/burp", 1.9), ("mob/piglin/idle1", 1.6)], "Piglin Witch hiccups"),
    "entity.piglin_witch.drink": ([("entity/witch/drink1", 0.8), ("entity/witch/drink2", 0.8), ("random/drink", 0.7)],
                                  "Piglin Witch drinks"),
    "entity.piglin_witch.burp": ([("random/burp", 0.6), ("random/burp", 0.75)], "Piglin Witch burps"),
    "entity.piglin_witch.rummage": ([("item/bundle/remove_one1", 0.7), ("item/bundle/insert2", 0.6), ("item/bundle/drop_contents1", 0.8)],
                                    "Piglin Witch rummages"),
    "entity.piglin_witch.refuse": ([("mob/piglin/jealous2", 0.7), ("mob/piglin/jealous4", 0.75)], "Piglin Witch refuses"),
    "entity.piglin_witch.cackle": ([("entity/witch/celebrate", 0.75), ("entity/witch/ambient5", 0.8)], "Piglin Witch cackles"),
    "entity.piglin_witch.hurt": ([("entity/witch/hurt1", 0.75), ("entity/witch/hurt2", 0.75), ("mob/piglin/hurt2", 0.7)],
                                 "Piglin Witch hurts"),
    "entity.piglin_witch.death": ([("entity/witch/death1", 0.7), ("entity/witch/death2", 0.7)], "Piglin Witch dies"),
    "entity.piglin_witch.trade": ([("mob/piglin/admire1", 0.75), ("mob/piglin/admire2", 0.7)], "Piglin Witch trades"),
    "entity.golden_piglin.groan": ([("mob/piglin/retreat1", 0.5), ("mob/piglin/retreat3", 0.45), ("mob/piglin/angry2", 0.4)],
                                   "Golden Piglin groans"),
    "entity.golden_piglin.creak": ([("block/chain/step2", 0.5), ("block/netherite/step3", 0.45), ("mob/zombie/metal2", 1.3)],
                                   "Golden Piglin creaks"),
    "entity.golden_piglin.hurt": ([("mob/piglin/hurt1", 0.55), ("item/armor/equip_gold2", 0.7)], "Golden Piglin hurts"),
    "entity.golden_piglin.death": ([("mob/piglin/death2", 0.5), ("random/anvil_land", 1.4)], "Golden Piglin crumbles"),
}


def sounds(ctx):
    """Adds placeholders to sounds.json only for events nobody else (gen_data's list, the sound map) has defined;
    returns their subtitles for lang/nether.json, so no subtitle key is ever defined twice."""
    path = os.path.join(ctx.A, "sounds.json")
    with open(path, encoding="utf-8") as fh:
        defs = json.load(fh)
    subs = {}
    for name, (files, subtitle) in SOUNDS.items():
        if name in defs:
            continue
        defs[name] = {"sounds": [{"name": "minecraft:" + f, "pitch": p} for f, p in files],
                      "subtitle": f"subtitles.{ctx.M}.{name}"}
        subs[f"subtitles.{ctx.M}.{name}"] = subtitle
    ctx.write(path, defs)
    return subs


def particles(ctx):
    """The gold glint: the art's frames (textures/particle/gold_glint_N.png) if there are any, else vanilla glitter."""
    tex = os.path.join(ctx.A, "textures", "particle")
    frames = sorted(f[:-4] for f in os.listdir(tex) if f.startswith("gold_glint_") and f.endswith(".png")) if os.path.isdir(tex) else []
    names = [f"{ctx.M}:{f}" for f in frames] or [f"minecraft:glitter_{i}" for i in range(7, -1, -1)]
    ctx.write(os.path.join(ctx.A, "particles", "gold_glint.json"), {"textures": names})


def run(ctx):
    M = ctx.M
    W = os.path.join(ctx.D, M, "worldgen")
    # ---- the Hex Fortress: any Nether biome, spacing 32, separation 12, clear of fortresses and bastions
    ctx.write(os.path.join(ctx.D, M, "tags", "worldgen", "biome", "has_hex_fortress.json"),
              {"replace": False, "values": ["#minecraft:is_nether"]})
    ctx.write(os.path.join(W, "structure", "hex_fortress.json"), {
        "type": f"{M}:hex_fortress", "biomes": f"#{M}:has_hex_fortress", "step": "underground_decoration",
        "spawn_overrides": {}, "terrain_adaptation": "none"})
    ctx.write(os.path.join(W, "structure_set", "hex_fortress.json"), {
        "structures": [{"structure": f"{M}:hex_fortress", "weight": 1}],
        "placement": {"type": "minecraft:random_spread", "spacing": 32, "separation": 12, "salt": 1170936,
                      "exclusion_zone": {"other_set": "minecraft:nether_complexes", "chunk_count": 4}}})
    # ---- loot
    loot(ctx, "chests/hex_fortress", "minecraft:chest", [
        {"rolls": {"type": "minecraft:uniform", "min": 3, "max": 6}, "entries": [
            item("minecraft:gold_ingot", 12, (2, 6)), item("minecraft:gold_nugget", 10, (4, 12)), item("minecraft:soul_sand", 10, (2, 8)),
            item("minecraft:nether_wart", 10, (2, 6)), item("minecraft:blaze_rod", 6, (1, 3)), item(f"{M}:elixir_bottle", 6, (1, 2)),
            item(f"{M}:soul_elixir", 6, (1, 3)), item("minecraft:ghast_tear", 4, (1, 2)), item("minecraft:crying_obsidian", 5, (1, 3)),
            item("minecraft:gold_block", 2), item("minecraft:glass_bottle", 5, (1, 3)), item("minecraft:blaze_powder", 4, (1, 4))]},
        {"rolls": 1, "entries": [EMPTY(17), item(f"{M}:elixir_of_greed", 3)]}])
    loot(ctx, "entities/golden_piglin", "minecraft:entity", [
        {"rolls": 1, "entries": [item("minecraft:gold_block", 1, (2, 4))]}])
    looting = lambda lo, hi: {"function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting",  # noqa: E731
                              "count": {"type": "minecraft:uniform", "min": lo, "max": hi}}
    loot(ctx, "entities/piglin_witch", "minecraft:entity", [
        {"rolls": 1, "entries": [item("minecraft:gold_nugget", 1, (2, 6), [looting(0, 2)])]},
        {"rolls": 1, "entries": [item("minecraft:glass_bottle", 1, (0, 2))]},
        {"rolls": 1, "entries": [item("minecraft:nether_wart", 1, (0, 3), [looting(0, 1)])]},
        {"rolls": 1, "entries": [EMPTY(3), item(f"{M}:soul_elixir", 1)]}])
    fire_res = {"function": "minecraft:set_potion", "id": "minecraft:fire_resistance"}
    soul_speed = {"function": "minecraft:enchant_randomly", "options": "minecraft:soul_speed"}
    loot(ctx, "gameplay/golden_piglin_bartering", "minecraft:barter", [{"rolls": 1, "entries": [
        item("minecraft:gold_block", 10), item("minecraft:diamond", 8, (1, 2)), item("minecraft:netherite_scrap", 5),
        item("minecraft:ancient_debris", 4), item("minecraft:golden_apple", 8), item("minecraft:enchanted_golden_apple", 1),
        item("minecraft:netherite_upgrade_smithing_template", 1), item("minecraft:crying_obsidian", 20, (2, 4)),
        item("minecraft:ender_pearl", 20, (4, 8)), item("minecraft:blaze_rod", 15, (2, 4)), item("minecraft:ghast_tear", 10, (1, 2)),
        item("minecraft:golden_carrot", 10, (3, 6)), item("minecraft:potion", 10, functions=[fire_res]),
        item("minecraft:splash_potion", 6, functions=[fire_res]), item("minecraft:book", 8, functions=[soul_speed]),
        item(f"{M}:soul_elixir", 12, (1, 3)), item(f"{M}:elixir_bottle", 8), item(f"{M}:elixir_of_greed", 3)]}])
    # ---- piglins want Cursed Elixir like gold
    for egg in ("piglin_witch_spawn_egg", "golden_piglin_spawn_egg"):
        ctx.write(os.path.join(ctx.A, "models", "item", egg + ".json"), {"parent": "minecraft:item/template_spawn_egg"})
    ctx.write(os.path.join(ctx.D, "minecraft", "tags", "item", "piglin_loved.json"), {"replace": False, "values": [f"{M}:cursed_elixir"]})
    # ---- assets nobody else provides yet
    subs = sounds(ctx)
    particles(ctx)
    # ---- lang
    lang = {
        "entity.winterworks.piglin_witch": "Piglin Witch",
        "entity.winterworks.golden_piglin": "Golden Piglin",
        "item.winterworks.piglin_witch_spawn_egg": "Piglin Witch Spawn Egg",
        "item.winterworks.golden_piglin_spawn_egg": "Golden Piglin Spawn Egg",
        "effect.winterworks.golden": "Golden",
        "message.winterworks.piglin_witch.refuse": "The Piglin Witch shakes her head and burps. She's thirsty for something golden...",
        "message.winterworks.piglin_witch.busy": "The Piglin Witch waves you off: she's busy.",
        "message.winterworks.hexfortress.built": "Built a Hex Fortress at %s, %s, %s (%s x %s blocks)",
    }
    lang.update(subs)
    ctx.write(os.path.join(ctx.L, "nether.json"), lang)
