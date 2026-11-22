"""Data for the hex area of Hexes & Havoc (docs/HEXES_UPDATE.md sections 1-2). Called by gen_data.py with ctx = gen_data.Ctx.

Blockstates and block models (the Elixir Jar, Soul Tank and Hexing Table are drawn by their block-entity renderers from
the lowpix models elixir_jar, soul_tank and hexing_table, so their block models only name a particle texture), item
models (3D block items, the elixirs, the hex core, the Hexed Book with its tier overrides), recipes, loot tables, tags,
placeholder sounds for any hex event that sounds.json doesn't map yet, and lang/hex.json. (The curse and sin
enchantments and the hex_rune particle belong to the curses area: data_curses.py.)
"""
import json
import os

# Re-pitched vanilla sounds for the hex events, used only while sounds.json has no entry for them:
# name -> ([(file, pitch)], subtitle)
PLACEHOLDER_SOUNDS = {
    "block.elixir_jar.bubble": ([("block/bubble_column/bubble1", 0.7), ("block/bubble_column/bubble2", 0.75),
                                 ("block/bubble_column/bubble3", 0.65), ("liquid/lavapop", 1.3)], "Elixir bubbles"),
    "block.elixir_jar.fill": ([("item/bottle/fill1", 0.8), ("item/bottle/fill2", 0.85), ("item/bottle/fill3", 0.75)],
                              "Bottle fills with elixir"),
    "block.elixir_jar.brewed": ([("block/brewing_stand/brew1", 0.8), ("block/brewing_stand/brew2", 0.75),
                                 ("block/amethyst/resonate1", 0.7)], "Elixir is ready"),
    "block.soul_tank.absorb": ([("block/soul_sand/break1", 0.5), ("ambient/nether/soulsand_valley/sand1", 1.4),
                                ("ambient/nether/soulsand_valley/whisper1", 1.3)], "Soul Tank absorbs a soul"),
    "block.soul_tank.hum": ([("block/beacon/ambient", 0.5), ("block/respawn_anchor/ambient1", 0.6)], "Soul Tank hums"),
    "block.hexing_table.hex": ([("block/respawn_anchor/charge1", 0.7), ("block/respawn_anchor/charge2", 0.65),
                                ("mob/wither/spawn", 1.6)], "Book is hexed"),
    "block.hexing_table.whisper": ([("ambient/nether/soulsand_valley/whisper2", 0.9), ("ambient/nether/soulsand_valley/whisper3", 0.85),
                                    ("ambient/nether/soulsand_valley/voices1", 1.2)], "Hexing Table whispers"),
    "item.hexed_book.whisper": ([("ambient/nether/soulsand_valley/whisper4", 1.1), ("ambient/nether/soulsand_valley/whisper5", 1.2),
                                 ("ambient/nether/soulsand_valley/whisper6", 1.0), ("ambient/nether/soulsand_valley/whisper7", 1.15)],
                                "Hexed Book whispers"),
    "item.elixir.drink": ([("random/drink", 0.8)], "Elixir is drunk"),
    "item.elixir_of_greed.shatter": ([("random/glass1", 0.8), ("random/glass2", 0.75), ("random/glass3", 0.85)],
                                     "Elixir of Greed shatters"),
}

def run(ctx):
    M = ctx.M
    w = ctx.write
    A, D = ctx.A, ctx.D

    def block_model(name, obj):
        w(os.path.join(A, "models", "block", name + ".json"), obj)

    def blockstate(name, obj):
        w(os.path.join(A, "blockstates", name + ".json"), obj)

    def item_model(name, obj):
        w(os.path.join(A, "models", "item", name + ".json"), obj)

    def has_texture(path):
        return os.path.exists(os.path.join(A, "textures", path + ".png"))

    # ---------------------------------------------------------------------------------------- blocks: drawn by their renderers
    particles = {"elixir_jar": "minecraft:block/glass", "soul_tank": "minecraft:block/netherite_block",
                 "hexing_table": "minecraft:block/crying_obsidian"}
    for name, tex in particles.items():
        if has_texture("block/" + name):
            tex = f"{M}:block/{name}"
        block_model(name, {"textures": {"particle": tex}})
    facing = {"north": 0, "east": 90, "south": 180, "west": 270}
    for name in ("elixir_jar", "soul_tank"):
        blockstate(name, {"variants": {f"facing={f}": ({"model": f"{M}:block/{name}", "y": y} if y else {"model": f"{M}:block/{name}"})
                                       for f, y in facing.items()}})
    blockstate("hexing_table", {"variants": {"": {"model": f"{M}:block/hexing_table"}}})

    # 3D block items (client.hex renderers draw the lowpix models, or a vanilla stand-in while they are missing)
    def builtin(name, particle, gui_scale=0.625, gui_y=0.0):
        item_model(name, {
            "parent": "minecraft:builtin/entity", "gui_light": "side",
            "textures": {"particle": particle},
            "display": {
                "gui": {"rotation": [30, 225, 0], "translation": [0, gui_y, 0], "scale": [gui_scale] * 3},
                "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": [0.25] * 3},
                "fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [0.5] * 3},
                "head": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
                "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.375] * 3},
                "thirdperson_lefthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": [0.375] * 3},
                "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 0, 0], "scale": [0.4] * 3},
                "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 0, 0], "scale": [0.4] * 3},
            }})

    builtin("elixir_jar", particles["elixir_jar"], 0.85, 1.0)
    builtin("soul_tank", particles["soul_tank"])
    builtin("hexing_table", particles["hexing_table"])

    # ---------------------------------------------------------------------------------------- items
    for name in ("elixir_bottle", "soul_elixir", "elixir_of_greed", "cursed_elixir"):
        item_model(name, {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/{name}"}})
    # the hex core: a 3D hexagon in hand (client.hex.HexCoreRenderer), its 2D icon while the model is missing
    item_model("hex_core_icon", {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/hex_core"}})
    item_model("hex_core", {
        "parent": "minecraft:builtin/entity", "gui_light": "front",
        "textures": {"particle": f"{M}:item/hex_core"},
        "display": {
            "gui": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
            "ground": {"rotation": [0, 0, 0], "translation": [0, 2, 0], "scale": [0.5] * 3},
            "fixed": {"rotation": [0, 180, 0], "translation": [0, 0, 0], "scale": [1, 1, 1]},
            "thirdperson_righthand": {"rotation": [0, 0, 0], "translation": [0, 3, 1], "scale": [0.55] * 3},
            "thirdperson_lefthand": {"rotation": [0, 0, 0], "translation": [0, 3, 1], "scale": [0.55] * 3},
            "firstperson_righthand": {"rotation": [0, -90, 25], "translation": [1.13, 3.2, 1.13], "scale": [0.68] * 3},
            "firstperson_lefthand": {"rotation": [0, 90, -25], "translation": [1.13, 3.2, 1.13], "scale": [0.68] * 3},
            "head": {"rotation": [0, 180, 0], "translation": [0, 13, 7], "scale": [1, 1, 1]},
        }})
    # Hexed Books: winterworks:hex_tier is 0 lesser, 0.5 sin, 1 hidden (client.hex.HexClient)
    for tier in ("sin", "hidden"):
        item_model(f"hexed_book_{tier}", {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/hexed_book_{tier}"}})
    item_model("hexed_book", {"parent": "minecraft:item/generated", "textures": {"layer0": f"{M}:item/hexed_book_lesser"},
                              "overrides": [{"predicate": {f"{M}:hex_tier": 0.5}, "model": f"{M}:item/hexed_book_sin"},
                                            {"predicate": {f"{M}:hex_tier": 1.0}, "model": f"{M}:item/hexed_book_hidden"}]})

    # ---------------------------------------------------------------------------------------- recipes
    ctx.shaped("elixir_bottle", [" G ", "GBG", " G "], {"G": "minecraft:gold_ingot", "B": "minecraft:glass_bottle"},
               f"{M}:elixir_bottle")
    ctx.shaped("elixir_jar", [" C ", "GPG", " G "], {"C": "minecraft:chain", "G": "minecraft:gold_ingot",
               "P": "minecraft:glass"}, f"{M}:elixir_jar")
    ctx.shaped("soul_tank", ["GNG", "PSP", "GPG"], {"G": "minecraft:gold_ingot", "N": "minecraft:netherite_ingot",
               "P": "minecraft:glass", "S": "minecraft:soul_sand"}, f"{M}:soul_tank")
    # 4 netherite ingots, an enchanting table, the hex core, 2 netherite blocks and crying obsidian: ten items don't
    # fit a 3x3 grid, so one crying obsidian sits under the table
    ctx.shaped("hexing_table", ["NHN", "BEB", "NCN"], {"N": "minecraft:netherite_ingot", "H": f"{M}:hex_core",
               "B": "minecraft:netherite_block", "E": "minecraft:enchanting_table", "C": "minecraft:crying_obsidian"},
               f"{M}:hexing_table")

    # ---------------------------------------------------------------------------------------- loot tables and tags
    def block_loot(name, functions=None):
        entry = {"type": "minecraft:item", "name": f"{M}:{name}"}
        if functions:
            entry["functions"] = functions
        w(os.path.join(D, M, "loot_table", "blocks", name + ".json"), {"type": "minecraft:block", "pools": [{
            "rolls": 1, "bonus_rolls": 0, "entries": [entry], "conditions": [{"condition": "minecraft:survives_explosion"}]}]})

    block_loot("elixir_jar")
    block_loot("soul_tank", [{"function": "minecraft:copy_components", "source": "block_entity", "include": [f"{M}:souls"]}])
    block_loot("hexing_table")
    w(os.path.join(D, "minecraft", "tags", "block", "mineable", "pickaxe.json"),
      {"replace": False, "values": [f"{M}:elixir_jar", f"{M}:soul_tank", f"{M}:hexing_table"]})
    w(os.path.join(D, "minecraft", "tags", "block", "needs_diamond_tool.json"), {"replace": False, "values": [f"{M}:soul_tank"]})

    # ---------------------------------------------------------------------------------------- sounds and lang
    subtitles = placeholder_sounds(ctx)
    lang = {
        "block.winterworks.elixir_jar": "Elixir Jar",
        "block.winterworks.soul_tank": "Soul Tank",
        "block.winterworks.hexing_table": "Hexing Table",
        "item.winterworks.elixir_bottle": "Elixir Bottle",
        "item.winterworks.soul_elixir": "Soul Elixir",
        "item.winterworks.elixir_of_greed": "Elixir of Greed",
        "item.winterworks.cursed_elixir": "Cursed Elixir",
        "item.winterworks.hex_core": "Hex Core",
        "item.winterworks.hexed_book": "Hexed Book",
        "effect.winterworks.hexed": "Hexed",
        # the Elixir Jar
        "block.winterworks.elixir_jar.none": "Nothing",
        "block.winterworks.elixir_jar.soul": "Soul Elixir",
        "block.winterworks.elixir_jar.greed": "Elixir of Greed",
        "block.winterworks.elixir_jar.cursed": "Cursed Elixir",
        "block.winterworks.elixir_jar.cold": "The jar needs heat beneath it: fire, a campfire, lava or magma",
        "block.winterworks.elixir_jar.full": "That won't mix with what's in the jar",
        "block.winterworks.elixir_jar.brewing": "Let it bubble...",
        "block.winterworks.elixir_jar.empty": "An empty jar. Set it over heat and drop in soul sand or a block of gold",
        "block.winterworks.elixir_jar.empty_hot": "The jar is hot. Drop in soul sand or a block of gold",
        "block.winterworks.elixir_jar.bubbling": "%s bubbling: %s%%",
        "block.winterworks.elixir_jar.holds": "%s: %s of %s doses. Fill an Elixir Bottle",
        # the Soul Tank
        "block.winterworks.soul_tank.souls": "Souls: %s / %s",
        "block.winterworks.soul_tank.full": "The tank can hold no more souls",
        "item.winterworks.soul_tank.souls": "Souls: %s / %s",
        # the Hexing Table and its screen
        "container.winterworks.hexing_table": "Hexing Table",
        "container.winterworks.hexing_table.no_tank": "The Hexing Table hungers: place a Soul Tank within 3 blocks",
        "container.winterworks.hexing_table.lesser": "Lesser Hex",
        "container.winterworks.hexing_table.sin": "Sin Hex",
        "container.winterworks.hexing_table.lesser.desc": "Every enchantment +1 level (up to VI)",
        "container.winterworks.hexing_table.sin.desc": "%s becomes a deadly sin",
        "container.winterworks.hexing_table.attaches": "Binds: %s",
        "container.winterworks.hexing_table.becomes": "Becomes: %s",
        "container.winterworks.hexing_table.power": "Power +%s",
        "container.winterworks.hexing_table.cost": "%s Soul Elixir, %s souls",
        "container.winterworks.hexing_table.cost.elixir": "%s Soul Elixir",
        "container.winterworks.hexing_table.cost.souls": "%s souls",
        "container.winterworks.hexing_table.hexed": "Hexed for %s minutes",
        "container.winterworks.hexing_table.hidden_chance": "...and something may hide in the pages",
        "container.winterworks.hexing_table.souls": "Souls: %s / %s",
        "container.winterworks.hexing_table.tanks": "%s Soul Tanks within reach",
        "container.winterworks.hexing_table.button": "HEX",
        "container.winterworks.hexing_table.button.ready": "Hex the book",
        "container.winterworks.hexing_table.select": "Click to choose this hex",
        "container.winterworks.hexing_table.problem.1": "Place an enchanted book",
        "container.winterworks.hexing_table.problem.2": "Only enchanted books can be hexed",
        "container.winterworks.hexing_table.problem.3.lesser": "Nothing on this book can grow stronger",
        "container.winterworks.hexing_table.problem.3.sin": "No sin sleeps in this book",
        "container.winterworks.hexing_table.problem.4.lesser": "No curse can take hold of this book",
        "container.winterworks.hexing_table.problem.4.sin": "This sin is not known to the world",
        "container.winterworks.hexing_table.problem.5": "No Soul Tank within 3 blocks",
        "container.winterworks.hexing_table.problem.6": "Needs %s Soul Elixir",
        "container.winterworks.hexing_table.problem.7": "Needs %s souls",
        "container.winterworks.hexing_table.already": "This book is already hexed",
        "container.winterworks.hexing_table.done": "The hex takes hold",
        # Hexed Books
        "item.winterworks.hexed_book.lesser": "Lesser Hex",
        "item.winterworks.hexed_book.sin": "Sin Hex",
        "item.winterworks.hexed_book.whispers": "Something whispers in the pages...",
        "hex.winterworks.discovered": "A hidden curse reveals itself: %s",
    }
    lang.update(subtitles)
    w(os.path.join(ctx.L, "hex.json"), lang)


def placeholder_sounds(ctx):
    """Adds the hex sound events that sounds.json doesn't have yet; returns the subtitles for those (only)."""
    path = os.path.join(ctx.A, "sounds.json")
    sounds = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    subs = {}
    added = False
    for name, (files, subtitle) in PLACEHOLDER_SOUNDS.items():
        if name in sounds:
            continue
        sounds[name] = {"sounds": [{"name": "minecraft:" + f, "pitch": p} for f, p in files],
                        "subtitle": f"subtitles.{ctx.M}.{name}"}
        subs[f"subtitles.{ctx.M}.{name}"] = subtitle
        added = True
    if added:
        ctx.write(path, sounds)
    return subs
