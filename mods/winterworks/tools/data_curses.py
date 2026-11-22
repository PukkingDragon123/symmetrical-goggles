"""Data for the curses area of Hexes & Havoc (docs/HEXES_UPDATE.md 3-5). Called by gen_data.py with ctx = gen_data.Ctx.

Writes the 18 data-driven enchantments (data/winterworks/enchantment/), their tags, two damage types and
lang/curses.json. A curse is only its name: no description strings, and no trigger text (each curse plays its own screen
effect instead: client.curse.CurseScreenFx). Vanilla effect components carry what they can (Wrath and Envy ignite, Lust's equipment drops,
Gluttony's XP mending, Sloth's mining speed and slowness, Pride's protection above half health); everything else is
done in Java (curse/)."""
import os

# The curses: id -> (supported items, slots). "any" curses work in any equipment slot.
ANY = "#minecraft:enchantable/vanishing"
LESSER = {
    "narcissus": ("#minecraft:enchantable/head_armor", ["head"]),
    "icarus": ("#winterworks:enchantable/icarus", ["chest"]),
    "midas": (ANY, ["any"]),
    "orpheus": ("#minecraft:enchantable/armor", ["armor"]),
    "sisyphus": ("#minecraft:enchantable/mining", ["mainhand"]),
    "tantalus": (ANY, ["any"]),
    "moth": (ANY, ["any"]),
}
HIDDEN = {
    "cain": (ANY, ["any"]),
    "judas": (ANY, ["any"]),
    "lots_wife": (ANY, ["any"]),
    "leech": (ANY, ["any"]),
}

SIN_COLOUR = "#C43A3A"   # sins read crimson in tooltips (curses are vanilla red)


def lvl(base, per):
    return {"type": "minecraft:linear", "base": base, "per_level_above_first": per}


def curse(desc_id, supported, slots):
    return {
        "anvil_cost": 8,
        "description": {"translate": f"enchantment.winterworks.{desc_id}"},
        "max_cost": {"base": 50, "per_level_above_first": 0},
        "max_level": 1,
        "min_cost": {"base": 25, "per_level_above_first": 0},
        "slots": slots,
        "supported_items": supported,
        "weight": 1,
    }


def sins():
    """The seven sins, each shaped like the enchantment it replaces (its source)."""
    player_attacker = {"condition": "minecraft:entity_properties", "entity": "attacker",
                       "predicate": {"type": "minecraft:player"}}
    out = {
        # Fire Aspect: soul fire for 8 s (the soul flames, stronger burn and the build-ups are curse.Sins)
        "wrath": dict(supported_items="#minecraft:enchantable/fire_aspect", primary_items="#minecraft:enchantable/sword",
                      slots=["mainhand"], max_level=2, min_cost={"base": 10, "per_level_above_first": 20},
                      max_cost={"base": 60, "per_level_above_first": 20}, effects={
                          "minecraft:post_attack": [{
                              "affected": "victim", "enchanted": "attacker",
                              "effect": {"type": "minecraft:ignite", "duration": 8.0},
                              "requirements": {"condition": "minecraft:damage_source_properties",
                                               "predicate": {"is_direct": True}}}]}),
        # Fortune: counts as Fortune +2 (EnchantmentHelper mixin) and ores give gold nuggets and more XP
        "greed": dict(supported_items="#minecraft:enchantable/mining_loot", slots=["mainhand"], max_level=3,
                      min_cost={"base": 15, "per_level_above_first": 9}, max_cost={"base": 65, "per_level_above_first": 9},
                      effects={"minecraft:block_experience": [
                          {"effect": {"type": "minecraft:add", "value": lvl(2.0, 1.0)}}]}),
        # Looting: counts as Looting +3 (mixin), and mobs drop their gear far more often
        "lust": dict(supported_items="#minecraft:enchantable/sword", slots=["mainhand"], max_level=3,
                     min_cost={"base": 15, "per_level_above_first": 9}, max_cost={"base": 65, "per_level_above_first": 9},
                     effects={
                         "minecraft:equipment_drops": [{
                             "effect": {"type": "minecraft:add", "value": lvl(0.08, 0.04)},
                             "enchanted": "attacker", "requirements": player_attacker}],
                         "minecraft:mob_experience": [
                             {"effect": {"type": "minecraft:add", "value": lvl(2.0, 1.0)}}]}),
        # Mending: XP repairs as Mending does; food repairs too (curse.Sins.onEat)
        "gluttony": dict(supported_items="#minecraft:enchantable/durability", slots=["any"], max_level=1,
                         min_cost={"base": 25, "per_level_above_first": 25}, max_cost={"base": 75, "per_level_above_first": 25},
                         effects={"minecraft:repair_with_xp": [{"effect": {"type": "minecraft:multiply", "factor": 2.0}}]}),
        # Efficiency: mines almost instantly; you're slow while you hold it
        "sloth": dict(supported_items="#minecraft:enchantable/mining", slots=["mainhand"], max_level=5,
                      min_cost={"base": 1, "per_level_above_first": 10}, max_cost={"base": 51, "per_level_above_first": 10},
                      effects={"minecraft:attributes": [
                          {"amount": lvl(60.0, 20.0), "attribute": "minecraft:player.mining_efficiency",
                           "id": "winterworks:enchantment.sloth", "operation": "add_value"},
                          {"amount": -0.3, "attribute": "minecraft:generic.movement_speed",
                           "id": "winterworks:enchantment.sloth_slow", "operation": "add_multiplied_total"}]}),
        # Thorns: attackers catch soul fire (the damage back and the buff stealing are curse.Sins)
        "envy": dict(supported_items="#minecraft:enchantable/armor", primary_items="#minecraft:enchantable/chest_armor",
                     slots=["any"], max_level=3, min_cost={"base": 10, "per_level_above_first": 20},
                     max_cost={"base": 60, "per_level_above_first": 20}, effects={
                         "minecraft:post_attack": [{
                             "affected": "attacker", "enchanted": "victim",
                             "effect": {"type": "minecraft:ignite", "duration": 3.0}}]}),
        # Protection: three times the protection, but only above half health and never against falls
        "pride": dict(supported_items="#minecraft:enchantable/armor", slots=["armor"], max_level=4,
                      min_cost={"base": 1, "per_level_above_first": 11}, max_cost={"base": 12, "per_level_above_first": 11},
                      effects={"minecraft:damage_protection": [{
                          "effect": {"type": "minecraft:add", "value": lvl(3.0, 3.0)},
                          "requirements": {"condition": "minecraft:all_of", "terms": [
                              {"condition": "minecraft:damage_source_properties", "predicate": {"tags": [
                                  {"id": "minecraft:bypasses_invulnerability", "expected": False},
                                  {"id": "minecraft:is_fall", "expected": False}]}},
                              {"condition": "winterworks:above_half_health"}]}}]}),
    }
    exclusive = {
        "wrath": ["minecraft:fire_aspect"],
        "greed": ["#minecraft:exclusive_set/mining"],
        "lust": ["minecraft:looting"],
        "gluttony": ["#minecraft:exclusive_set/bow"],
        "sloth": ["minecraft:efficiency"],
        "envy": ["minecraft:thorns"],
        "pride": ["#minecraft:exclusive_set/armor"],
    }
    result = {}
    for name, d in out.items():
        e = {
            "anvil_cost": 8,
            "description": {"translate": f"enchantment.winterworks.{name}", "color": SIN_COLOUR},
            "exclusive_set": f"#winterworks:exclusive_set/{name}",
            "max_cost": d["max_cost"],
            "max_level": d["max_level"],
            "min_cost": d["min_cost"],
            "slots": d["slots"],
            "supported_items": d["supported_items"],
            "weight": 1,
        }
        if "primary_items" in d:
            e["primary_items"] = d["primary_items"]
        if d.get("effects"):
            e["effects"] = d["effects"]
        result[name] = (e, exclusive[name])
    return result


LANG = {
    # ---- lesser curses
    "enchantment.winterworks.narcissus": "Curse of Narcissus",
    "enchantment.winterworks.icarus": "Curse of Icarus",
    "enchantment.winterworks.midas": "Curse of Midas",
    "enchantment.winterworks.orpheus": "Curse of Orpheus",
    "enchantment.winterworks.sisyphus": "Curse of Sisyphus",
    "enchantment.winterworks.tantalus": "Curse of Tantalus",
    "enchantment.winterworks.moth": "Curse of the Moth",
    # ---- hidden curses
    "enchantment.winterworks.cain": "Curse of Cain",
    "enchantment.winterworks.judas": "Curse of Judas",
    "enchantment.winterworks.lots_wife": "Curse of Lot's Wife",
    "enchantment.winterworks.leech": "Curse of the Leech",
    # ---- the seven sins
    "enchantment.winterworks.wrath": "Wrath",
    "enchantment.winterworks.greed": "Greed",
    "enchantment.winterworks.lust": "Lust",
    "enchantment.winterworks.gluttony": "Gluttony",
    "enchantment.winterworks.sloth": "Sloth",
    "enchantment.winterworks.envy": "Envy",
    "enchantment.winterworks.pride": "Pride",
    # ---- deaths
    "death.attack.winterworks.narcissus": "%1$s fell in love with their own reflection",
    "death.attack.winterworks.narcissus.player": "%1$s fell in love with their own reflection while fighting %2$s",
    "death.attack.winterworks.cain": "%1$s was struck down by %2$s's curse",
    "death.attack.winterworks.cain.item": "%1$s was struck down by %2$s's curse using %3$s",
}


def run(ctx):
    E = os.path.join(ctx.D, ctx.M, "enchantment")
    T = os.path.join(ctx.D, ctx.M, "tags")
    MT = os.path.join(ctx.D, "minecraft", "tags")
    for name, (supported, slots) in {**LESSER, **HIDDEN}.items():
        ctx.write(os.path.join(E, f"{name}.json"), curse(name, supported, slots))
    for name, (data, exclusive) in sins().items():
        ctx.write(os.path.join(E, f"{name}.json"), data)
        ctx.write(os.path.join(T, "enchantment", "exclusive_set", f"{name}.json"), {"replace": False, "values": exclusive})
    ctx.write(os.path.join(T, "item", "enchantable", "icarus.json"),
              {"replace": False, "values": ["#minecraft:enchantable/chest_armor", "minecraft:elytra"]})
    curses = [f"{ctx.M}:{n}" for n in list(LESSER) + list(HIDDEN)]
    every = curses + [f"{ctx.M}:{n}" for n in sins()]
    # curses are curses (red, kept by grindstones); none of them come from the table, trades or loot: only from
    # hexing (they are in none of in_enchanting_table, tradeable, on_random_loot or on_traded_equipment)
    ctx.write(os.path.join(MT, "enchantment", "curse.json"), {"replace": False, "values": curses})
    ctx.write(os.path.join(MT, "enchantment", "treasure.json"), {"replace": False, "values": every})
    # damage types: wasting away over your reflection; your own curse wounding your pet
    ctx.write(os.path.join(ctx.D, ctx.M, "damage_type", "narcissus.json"),
              {"message_id": f"{ctx.M}.narcissus", "scaling": "never", "exhaustion": 0.0})
    ctx.write(os.path.join(ctx.D, ctx.M, "damage_type", "cain.json"),
              {"message_id": f"{ctx.M}.cain", "scaling": "never", "exhaustion": 0.0})
    dt = os.path.join(MT, "damage_type")
    narcissus, cain = f"{ctx.M}:narcissus", f"{ctx.M}:cain"
    ctx.write(os.path.join(dt, "bypasses_armor.json"), {"replace": False, "values": [narcissus, cain]})
    # you waste away a flat heart every 2 s: no Protection or Resistance; Cain's blow goes through wolf armour
    ctx.write(os.path.join(dt, "bypasses_enchantments.json"), {"replace": False, "values": [narcissus]})
    ctx.write(os.path.join(dt, "bypasses_effects.json"), {"replace": False, "values": [narcissus]})
    ctx.write(os.path.join(dt, "bypasses_wolf_armor.json"), {"replace": False, "values": [cain]})
    ctx.write(os.path.join(dt, "no_knockback.json"), {"replace": False, "values": [narcissus]})
    ctx.write(os.path.join(dt, "no_anger.json"), {"replace": False, "values": [cain]})
    ctx.write(os.path.join(ctx.L, "curses.json"), LANG)
