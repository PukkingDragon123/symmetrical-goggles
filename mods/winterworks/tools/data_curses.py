"""Data for the curses area of Hexes & Havoc (docs/HEXES_UPDATE.md 3-5). Called by gen_data.py with ctx = gen_data.Ctx.

Writes the 18 data-driven enchantments (data/winterworks/enchantment/), their tags, two damage types and
lang/curses.json. Vanilla effect components carry what they can (Wrath and Envy ignite, Lust's equipment drops,
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
    "enchantment.winterworks.narcissus.desc": "Do not linger over still water.",
    "enchantment.winterworks.icarus": "Curse of Icarus",
    "enchantment.winterworks.icarus.desc": "Fly too near the sun and your wings will burn.",
    "enchantment.winterworks.midas": "Curse of Midas",
    "enchantment.winterworks.midas.desc": "All you touch turns to gold, even your bread.",
    "enchantment.winterworks.orpheus": "Curse of Orpheus",
    "enchantment.winterworks.orpheus.desc": "Whoever follows you is lost if you look back.",
    "enchantment.winterworks.sisyphus": "Curse of Sisyphus",
    "enchantment.winterworks.sisyphus.desc": "The stone you dig always rolls back.",
    "enchantment.winterworks.tantalus": "Curse of Tantalus",
    "enchantment.winterworks.tantalus.desc": "Your food is always just out of reach.",
    "enchantment.winterworks.moth": "Curse of the Moth",
    "enchantment.winterworks.moth.desc": "At night the flame calls, and you go.",
    # ---- hidden curses
    "enchantment.winterworks.cain": "Curse of Cain",
    "enchantment.winterworks.cain.desc": "Your blows fall on those who love you.",
    "enchantment.winterworks.judas": "Curse of Judas",
    "enchantment.winterworks.judas.desc": "Every bargain is a betrayal.",
    "enchantment.winterworks.lots_wife": "Curse of Lot's Wife",
    "enchantment.winterworks.lots_wife.desc": "When you flee, never look back.",
    "enchantment.winterworks.leech": "Curse of the Leech",
    "enchantment.winterworks.leech.desc": "Your wounds give life to your enemies.",
    # ---- the seven sins
    "enchantment.winterworks.wrath": "Wrath",
    "enchantment.winterworks.wrath.desc": "Your foes burn with soul fire. Stay your hand and the rage turns on you.",
    "enchantment.winterworks.greed": "Greed",
    "enchantment.winterworks.greed.desc": "The earth gives up its gold. The Piglins want it back, and nothing you drop stays.",
    "enchantment.winterworks.lust": "Lust",
    "enchantment.winterworks.lust.desc": "Your kills spill riches, and everything that hunts can smell you.",
    "enchantment.winterworks.gluttony": "Gluttony",
    "enchantment.winterworks.gluttony.desc": "Your feasts mend your gear. You are never full.",
    "enchantment.winterworks.sloth": "Sloth",
    "enchantment.winterworks.sloth.desc": "Stone gives way at a touch. You can barely stay awake.",
    "enchantment.winterworks.envy": "Envy",
    "enchantment.winterworks.envy.desc": "What hurts you burns, and what they have is yours. Fear anyone with more.",
    "enchantment.winterworks.pride": "Pride",
    "enchantment.winterworks.pride.desc": "Untouchable while you stand tall. Pride comes before a fall.",
    # ---- the first time each one triggers (actionbar)
    "curse.winterworks.narcissus.trigger": "You cannot look away from your reflection...",
    "curse.winterworks.narcissus.warn": "Your reflection smiles back at you.",
    "curse.winterworks.icarus.trigger": "Too near the sun! Your wings are burning.",
    "curse.winterworks.midas.trigger": "Your food turns to gold in your hand.",
    "curse.winterworks.orpheus.trigger": "You looked back. %s is dragged down to the underworld.",
    "curse.winterworks.sisyphus.trigger": "The stone rolls back into place.",
    "curse.winterworks.tantalus.trigger": "Your food slips out of reach.",
    "curse.winterworks.moth.trigger": "The light is calling you...",
    "curse.winterworks.cain.trigger": "Your blow falls on your own companion.",
    "curse.winterworks.judas.trigger": "Your bargain is a betrayal. The golem turns on you.",
    "curse.winterworks.lots_wife.trigger": "You looked back, and turned to stone.",
    "curse.winterworks.leech.trigger": "Your blow feeds your foe.",
    "curse.winterworks.wrath.trigger": "Wrath: strike, or the rage turns on you.",
    "curse.winterworks.greed.trigger": "Greed: the Piglins can smell your gold.",
    "curse.winterworks.greed.vanish": "Greed will not let go: it is gone.",
    "curse.winterworks.lust.trigger": "Lust: everything that hunts can smell you.",
    "curse.winterworks.gluttony.trigger": "Gluttony: your gear feeds on your feast.",
    "curse.winterworks.sloth.trigger": "Sloth: your eyelids grow heavy...",
    "curse.winterworks.envy.trigger": "Envy: what they had is yours now.",
    "curse.winterworks.pride.trigger": "Pride: your pride shatters.",
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
