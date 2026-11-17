#!/usr/bin/env python3
"""Generate PROP_META in games/bushed/src/places/props.ts from the actual prop .glb files.

    python games/bushed/tools/gen_prop_meta.py

Measures each public/assets/models/<id>.glb (size, triangle count, convex hull <= 32 points, light position from
its `flame` / `glass` node) and merges in the hand-written tables below (display name, realistic mass in kg,
general-store price, description, collider kind). Rewrites only the block between // <PROP_META> and // </PROP_META>.
"""
from __future__ import annotations

import json
import os
import re
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
MODELS = os.path.join(GAME, "public", "assets", "models")
TS = os.path.join(GAME, "src", "places", "props.ts")
PREVIEW = os.path.join(GAME, "..", "..", "out", "bushed", "props")
NOT_PROPS = {"jeep", "npc_pickup", "trailer"}

# id: (display name, mass kg, price $ or None, collider, description)
B, H = "box", "hull"
TABLE: dict[str, tuple[str, float, float | None, str, str]] = {
    # tools
    "wooden_axe": ("Felling axe", 2.2, 45, H, "A long-handled felling axe. The bit is rusty and chipped but it still bites."),
    "wooden_axe_02": ("Old axe", 2.4, 38, H, "A heavy, well-worn axe with a pale ash handle."),
    "wooden_axe_03": ("Camp axe", 1.9, 35, H, "A camp axe with a dark handle and a scarred head."),
    "hatchet": ("Hatchet", 0.8, 22, H, "A one-hand hatchet for kindling and limbing."),
    "handsaw_wood": ("Handsaw", 0.7, 18, H, "A wooden-handled crosscut handsaw."),
    "sledgehammer_01": ("Sledgehammer", 5.0, 40, H, "Eight pounds of steel on a hickory handle. Drives wedges."),
    "rusted_spade_01": ("Spade", 2.0, 20, H, "A rusty garden spade."),
    "picke_dirty_01": ("Pickaxe", 3.2, 35, H, "A dirty pickaxe for rocky ground."),
    "crowbar_01": ("Crowbar", 1.4, 14, H, "A short pry bar."),
    "machete": ("Machete", 0.6, 20, H, "A long machete for clearing brush."),
    "fish_knife": ("Fillet knife", 0.12, 12, H, "A thin fillet knife."),
    "wooden_hammer_01": ("Wooden mallet", 0.4, 9, H, "A carpenter's wooden mallet."),
    "rusted_hacksaw": ("Hacksaw", 0.6, 12, H, "A rusty hacksaw for metal."),
    "hand_plane_no4": ("Hand plane", 1.8, 30, H, "A No. 4 smoothing plane."),
    "measuring_tape_01": ("Tape measure", 0.3, 8, H, "A steel tape measure."),
    "pliers": ("Pliers", 0.25, 9, H, "Combination pliers."),
    "bolt_cutters_01": ("Bolt cutters", 3.5, 28, H, "Long-handled bolt cutters."),
    # light
    "Lantern_01": ("Hurricane lantern", 0.9, 22, H, "A brass kerosene hurricane lantern."),
    "vintage_oil_lamp": ("Oil lamp", 1.6, 30, H, "A tall table oil lamp with a glass chimney."),
    "wooden_lantern_01": ("Wooden lantern", 1.2, 18, H, "A candle lantern in a wooden frame."),
    "vintage_flashlight": ("Flashlight", 0.6, 15, H, "An old right-angle flashlight. Takes D cells."),
    "signal_flashlight": ("Signal flashlight", 0.35, 12, H, "A small flashlight with red, green and blue filters."),
    "caged_hanging_light": ("Caged work light", 1.5, None, H, "A caged bulb on a hanging bracket."),
    "industrial_wall_lamp": ("Wall lamp", 1.8, None, H, "An enamel wall lamp with a glass globe."),
    "street_lamp_01": ("Lamp post", 80, None, H, "A cast-iron lamp post."),
    # cabin
    "barrel_stove": ("Barrel stove", 40, 120, H, "A wood stove made from an old steel drum."),
    "WoodenTable_01": ("Long table", 28, None, B, "A long, low plank table."),
    "WoodenTable_02": ("Side table", 6, None, H, "A small round side table."),
    "WoodenTable_03": ("Desk", 35, None, B, "A desk with drawers and a cupboard door."),
    "WoodenChair_01": ("High-back chair", 12, None, H, "A carved high-backed chair. Too fancy for a cabin."),
    "Rockingchair_01": ("Rocking chair", 10, None, H, "A wooden rocking chair."),
    "wooden_stool_01": ("Stool", 4, None, H, "A three-legged wooden stool."),
    "wooden_stool_02": ("Footstool", 2, None, H, "A small wooden footstool."),
    "old_bed_frame": ("Bed frame", 45, None, B, "An old bed frame."),
    "vintage_day_bed": ("Day bed", 35, None, B, "A day bed with a thin mattress."),
    "wooden_bookshelf_worn": ("Bookshelf", 40, None, B, "A worn wooden bookshelf."),
    "vintage_cabinet_01": ("Glass cabinet", 90, None, B, "A tall cabinet with glazed doors."),
    "painted_wooden_cabinet": ("Painted cabinet", 45, None, B, "A painted cabinet with two drawers."),
    "wooden_bucket_01": ("Wooden bucket", 3, 8, H, "A coopered bucket with a rope handle."),
    "wooden_bucket_02": ("Wash tub", 5, 10, H, "A wide coopered wash tub."),
    "wicker_basket_01": ("Wicker basket", 0.6, 6, H, "A shallow wicker basket."),
    "wicker_basket_02": ("Lidded basket", 0.8, 7, H, "A wicker basket with a lid."),
    "wooden_bowl_01": ("Wooden bowl", 0.5, 4, H, "A turned wooden bowl."),
    "wooden_bowl_02": ("Small bowl", 0.15, 2, H, "A small wooden bowl."),
    "wooden_spoon": ("Wooden spoon", 0.05, 1, H, "A wooden spoon."),
    "wooden_cutting_board": ("Cutting board", 0.9, 5, H, "A wooden cutting board."),
    "pot_enamel_01": ("Enamel pot", 1.2, 12, H, "A chipped enamel cooking pot with a lid."),
    "brass_pot_01": ("Brass pot", 1.5, 14, H, "A dented brass pot."),
    "brass_pan_01": ("Brass pan", 1.0, 12, H, "A brass frying pan."),
    "metal_jug": ("Metal jug", 0.8, 8, H, "A metal water jug."),
    "jug_01": ("Stoneware jug", 1.2, 6, H, "A stoneware jug."),
    "vintage_radio_transceiver": ("Radio set", 12, None, B, "A valve radio transceiver with a morse key and microphone."),
    "mantel_clock_01": ("Mantel clock", 3, None, H, "A wooden mantel clock."),
    "wall_clock": ("Wall clock", 1.2, None, H, "A round wall clock."),
    "vintage_suitcase": ("Suitcase", 3, None, B, "A battered leather suitcase."),
    "vintage_suitcase_02": ("Old suitcase", 3, None, B, "Another battered suitcase."),
    "wooden_candlestick": ("Candlestick", 0.3, 4, H, "A turned wooden candlestick."),
    "painted_wooden_bench": ("Bench", 12, None, B, "A painted wooden bench."),
    "wooden_picnic_table": ("Picnic table", 60, None, B, "A weathered picnic table with fixed benches."),
    "wooden_ladder": ("Ladder", 8, 30, H, "A wooden step ladder."),
    "fishermans_hat": ("Fisherman's hat", 0.15, 8, H, "A waxed fisherman's hat."),
    "rubber_boots": ("Rubber boots", 2.4, 25, H, "A muddy pair of rubber boots."),
    "rubber_boots_clean": ("New rubber boots", 2.2, 28, H, "A pair of rubber boots."),
    "garden_gloves_01": ("Work gloves", 0.15, 4, H, "A pair of cloth work gloves."),
    "binoculars": ("Binoculars", 0.9, 45, H, "Old field binoculars."),
    "seadogs_compass": ("Compass", 0.25, 20, H, "A brass pocket compass."),
    "vintage_lighter": ("Lighter", 0.06, 6, H, "A petrol lighter."),
    "mousetrap": ("Mousetrap", 0.03, 1.5, H, "A spring mousetrap."),
    "stone_fire_pit": ("Fire pit", 300, None, H, "A ring of stones around old ashes."),
    # storage / outdoor
    "wooden_crate_01": ("Crate", 8, None, B, "A wooden crate with a hinged lid."),
    "wooden_crate_02": ("Large crate", 12, None, B, "A large wooden crate."),
    "Barrel_01": ("Wooden barrel", 30, None, H, "An oak barrel."),
    "Barrel_02": ("Old barrel", 30, None, H, "A weathered oak barrel."),
    "barrel_03": ("Barrel", 28, None, H, "A wooden barrel."),
    "metal_jerrycan": ("Jerrycan", 4, 15, H, "A steel jerrycan. 20 litres, about 19 kg when full."),
    "propane_tank": ("Propane tank", 18, 35, H, "A propane cylinder."),
    "small_lpg_tank": ("Small LPG tank", 12, 22, H, "A small LPG cylinder."),
    "old_tyre": ("Old tyre", 10, None, H, "A bald truck tyre."),
    "metal_trash_can": ("Trash can", 6, 12, H, "A galvanised trash can with a lid."),
    "metal_trash_can_rust": ("Rusty trash can", 6, None, H, "A rusted-through trash can."),
    "portable_generator": ("Generator", 45, 380, B, "A petrol generator. Loud."),
    "tire_pump": ("Tire pump", 1.5, 12, H, "A floor pump."),
    "wooden_pier_section_01": ("Pier end with ladder", 450, None, B, "A dock section on posts."),
    "wooden_pier_section_02": ("Pier section", 400, None, B, "A dock section on posts."),
    "wooden_pier_section_03": ("Pier section (worn)", 400, None, B, "A dock section on posts."),
    "wooden_pier_section_04": ("Pier section (broken)", 380, None, B, "A dock section on posts."),
    "wooden_pier_section_05": ("Pier walkway", 300, None, B, "A long, narrow dock walkway."),
    "electricity_pole_01": ("Power pole", 700, None, H, "A wooden power pole with a transformer."),
    "electricity_pole_02": ("Power pole (plain)", 650, None, H, "A wooden power pole."),
    "electricity_pole_03": ("Power pole (fuse)", 700, None, H, "A wooden power pole with a fuse and transformer."),
    # store
    "CashRegister_01": ("Cash register", 15, None, B, "A mechanical cash register."),
    "Shelf_01": ("Wall shelf", 20, None, B, "A tall wooden shelf unit."),
    "wooden_display_shelves_01": ("Display shelves", 30, None, B, "Store display shelves with drawers."),
    "steel_frame_shelves_01": ("Steel shelves", 25, None, B, "Steel-framed shelving."),
    "worn_metal_rack": ("Metal rack", 20, None, B, "A worn metal storage rack."),
    "drawer_cabinet": ("Drawer cabinet", 60, None, B, "A cabinet of drawers."),
    "vintage_wooden_drawer_01": ("Chest of drawers", 50, None, B, "A wide chest of drawers."),
    "CheeseBox_01": ("Cheese box", 0.6, 5, H, "A round wooden box of cheese."),
    "cardboard_box_01": ("Cardboard box", 0.8, None, B, "A cardboard box."),
    "ammo_box": ("Ammo can", 2.5, 25, B, "A steel ammunition can."),
    "wooden_military_crate": ("Army crate", 15, None, B, "An old army surplus crate."),
    "oil_tin": ("Lamp oil", 2.0, 6, H, "A tin of kerosene for lamps."),
    "cleaner_tin_01": ("Cleaner tin", 0.6, 4, H, "A tin of cleaner."),
    "small_oil_can_01": ("Oil can", 0.5, 5, H, "A small oil can with a spout."),
    "plastic_bottle_gallon": ("Water jug", 3.9, 3, H, "A gallon jug of water."),
    "medical_box": ("First aid kit", 1.5, 18, B, "A first aid box."),
    "medical_tape": ("Medical tape", 0.05, 2, H, "A roll of medical tape."),
    "can_rusted": ("Rusty can", 0.4, None, H, "A rusty tin can. Whatever was in it is long gone."),
    "long_life_food_milk": ("Milk carton", 1.05, 2, B, "Long-life milk."),
    "long_life_food_tomatoes": ("Canned tomatoes", 0.45, 1.5, H, "A can of tomatoes."),
    "long_life_food_beans": ("Canned beans", 0.45, 1.5, H, "A can of beans."),
    "long_life_food_sardines": ("Sardines", 0.13, 1.25, B, "A tin of sardines."),
    "wine_bottle_bordeaux": ("Red wine", 1.3, 9, H, "A bottle of red."),
    "wine_bottle_alsace": ("White wine", 1.3, 9, H, "A tall bottle of white."),
    "wine_bottle_burgundy": ("Burgundy", 1.3, 10, H, "A bottle of burgundy."),
    "wine_bottle_champagne": ("Sparkling wine", 1.5, 14, H, "A bottle of fizz."),
}
CATEGORY_FALLBACK = "store"
LIGHT_OVERRIDE = {  # local light position for lights without glass/flame nodes, as fractions of the bounds
    "caged_hanging_light": (0.5, 0.25, 0.5),
}


def read_glb(path: str):
    b = open(path, "rb").read()
    jl = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack_from("<I", b, off)[0]
    bin_ = b[off + 8: off + 8 + bl]

    def acc(i, n):
        a = js["accessors"][i]
        bv = js["bufferViews"][a["bufferView"]]
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32}[a["componentType"]]
        return np.frombuffer(bin_, dt, a["count"] * n, bv.get("byteOffset", 0) + a.get("byteOffset", 0)).reshape(-1, n)

    parts = {}

    def walk(ni, T):
        nd = js["nodes"][ni]
        T = T + np.array(nd.get("translation", [0, 0, 0]))
        if "mesh" in nd:
            P, tri = [], 0
            for p in js["meshes"][nd["mesh"]]["primitives"]:
                P.append(acc(p["attributes"]["POSITION"], 3).astype(np.float64) + T)
                tri += js["accessors"][p["indices"]]["count"] // 3
            parts[nd.get("name", str(ni))] = (np.concatenate(P), tri)
        for c in nd.get("children", []):
            walk(c, T)
    for r in js["scenes"][js.get("scene", 0)]["nodes"]:
        walk(r, np.zeros(3))
    return js, parts


def fib_dirs(n: int) -> np.ndarray:
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = np.pi * (1 + 5 ** 0.5) * i
    return np.stack([np.cos(th) * np.sin(phi), np.cos(phi), np.sin(th) * np.sin(phi)], 1)


def hull_points(P: np.ndarray, k: int = 32) -> np.ndarray:
    """<= k points on the convex hull: extreme vertices along many directions (plus the 8 box corners' nearest),
    reduced by farthest-point sampling. Rapier builds the hull from them."""
    D = np.concatenate([fib_dirs(96), np.array([[sx, sy, sz] for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]) / 3 ** 0.5])
    idx = np.unique(np.argmax(P @ D.T, axis=0))
    C = P[idx]
    if len(C) <= k:
        return C
    sel = [int(np.argmax(np.linalg.norm(C - C.mean(0), axis=1)))]
    d = np.linalg.norm(C - C[sel[0]], axis=1)
    while len(sel) < k:
        j = int(np.argmax(d))
        sel.append(j)
        d = np.minimum(d, np.linalg.norm(C - C[j], axis=1))
    return C[sel]


def fmt(v: float, nd: int = 3) -> str:
    s = f"{v:.{nd}f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def main():
    entries = []
    ids = sorted(f[:-4] for f in os.listdir(MODELS) if f.endswith(".glb") and f[:-4] not in NOT_PROPS)
    missing = [i for i in ids if i not in TABLE]
    if missing:
        print("no table entry for:", missing)
    for pid in ids:
        js, parts = read_glb(os.path.join(MODELS, f"{pid}.glb"))
        P = np.concatenate([p for p, _ in parts.values()])
        tris = sum(t for _, t in parts.values())
        lo, hi = P.min(0), P.max(0)
        size = hi - lo
        root_extras = js["nodes"][0].get("extras", {})
        rep_p = os.path.join(PREVIEW, pid, "report.json")
        rep = json.load(open(rep_p)) if os.path.exists(rep_p) else {}
        name, mass, price, coll, desc = TABLE.get(pid, (rep.get("name", pid), 1.0, None, H, ""))
        cat = rep.get("category", CATEGORY_FALLBACK)
        light = None
        for k in ("flame", "glass"):
            if k in parts and pid not in ("vintage_cabinet_01", "CashRegister_01", "mantel_clock_01", "wall_clock",
                                          "binoculars", "portable_generator"):
                q = parts[k][0]
                light = (q.min(0) + q.max(0)) / 2
                break
        if pid in LIGHT_OVERRIDE:
            light = lo + size * np.array(LIGHT_OVERRIDE[pid])
        rough = 0.85
        for m in js.get("materials", []):
            if (m.get("extras") or {}).get("kind") == "body":
                rough = m["pbrMetallicRoughness"].get("roughnessFactor", 0.85)
        e = [f"name: {json.dumps(name)}", f"category: '{cat}'", f"mass: {fmt(mass)}",
             f"size: [{', '.join(fmt(v) for v in size)}]", f"collider: '{coll}'"]
        if coll == "hull":
            h = hull_points(P)
            e.append("hull: [" + ", ".join(fmt(v) for v in h.reshape(-1)) + "]")
        if price is not None:
            e.append(f"price: {fmt(price, 2)}")
        if desc:
            e.append(f"desc: {json.dumps(desc)}")
        e.append(f"tris: {tris}")
        if light is not None:
            e.append(f"light: [{', '.join(fmt(v) for v in light)}]")
        e.append(f"rough: {fmt(rough, 2)}")
        e.append(f"source: {json.dumps(root_extras.get('source', ''))}")
        key = pid if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", pid) else json.dumps(pid)
        entries.append(f"  {key}: {{ " + ", ".join(e) + " },")
    block = ("// <PROP_META> generated by tools/gen_prop_meta.py\nexport const PROP_META: Record<string, PropMeta> = {\n"
             + "\n".join(entries) + "\n};\n// </PROP_META>")
    ts = open(TS).read()
    ts2 = re.sub(r"// <PROP_META>.*?// </PROP_META>", lambda _: block, ts, flags=re.S)
    open(TS, "w").write(ts2)
    print(f"{len(entries)} props -> {os.path.relpath(TS)}")


if __name__ == "__main__":
    main()
