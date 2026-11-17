"""what the store buys, read from src/game/items.ts (sell prices) and TIMBER_PRICE, for the chalk price board"""
import os
import re

_src = open(os.path.join(os.path.dirname(__file__), "..", "..", "game", "items.ts"), encoding="utf-8").read()
_FR = {"berries": "BLEUETS", "chanterelle": "CHANTERELLES", "fish": "TRUITE", "kindling": "PETIT BOIS", "firewood": "BUCHE FENDUE", "bundle": "PAQUET DE BOIS"}
_EN = {"berries": "BLUEBERRIES", "chanterelle": "CHANTERELLES", "fish": "LAKE TROUT", "kindling": "KINDLING", "firewood": "SPLIT", "bundle": "BUNDLE"}
PRICES = []
for m in re.finditer(r"^\s*(\w+): \{ id: '\w+', name: '([^']+)'.*?sell: (\d+)", _src, re.M):
    k, name, sell = m.group(1), m.group(2), int(m.group(3))
    if k in _FR:
        PRICES.append((_FR[k], _EN[k], f"{sell}$"))
_t = re.search(r"TIMBER_PRICE[^=]*= \{([^}]*)\}", _src)
_TFR = {"spruce": "EPINETTE", "fir": "SAPIN", "pine": "PIN", "birch": "BOULEAU", "cedar": "CEDRE"}
if _t:
    for k, v in re.findall(r"(\w+): (\d+)", _t.group(1)):
        PRICES.append((_TFR.get(k, k.upper()), k.upper() + " LOGS", f"{v}$/M3"))
