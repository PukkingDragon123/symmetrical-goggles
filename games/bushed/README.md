# BUSHED

A first-person lumberjack survival game in the Canadian bush, among the fearsome critters of old lumber-camp
folklore. Cut wood, keep the stove going, take jobs off the board at Pruneau's General Store, and learn the
rules of the things that live in the trees. The forest is terrifying at first. It gets familiar. Mostly.

```bash
cd games/bushed
npm install
npm run dev          # http://localhost:5173
```

Dev shortcuts: `?play` skips the porch menu and intro, `?test` also drops some rounds and a log to practise on,
`?hour=19.5` sets the time, `?x=..&z=..&yaw=..` places you. Test pages: `chop.html` (scripted felling),
`trees.html`, `humans.html`, `creatures.html`, `props.html`, `places.html`, `audio.html`.

## Controls

| | |
|---|---|
| Move / sprint / crouch / jump | WASD, Shift, Ctrl or C, Space |
| Use, open, pick up, talk | E (or click) |
| Swing (hold to wind up, release to strike) | Left mouse |
| Place what you carry / drop / throw | Left mouse, Q, right mouse |
| Rotate a carried object | hold R + mouse |
| Pocket a small carried item | B |
| Axe, hatchet, maul or saw, flashlight, empty hands | 1, 2, 3, 4, 0 |
| Flashlight on/off | F |
| Field journal (A/D to turn pages) | Tab |
| Drive: throttle, brake/reverse, steer, handbrake, headlights, get out | W, S, A/D, Space, H, E |

## How the wood works

* The axe lands where you aim. Strikes **on** a cut line drive the flat kerf; strikes a hand-width **above or
  below** it drive the angled kerf. Chips only pop out where the two meet, so alternate high and low. Hammering the
  same spot just bruises the wood.
* The notch opens wider as it deepens. The tree falls toward the notch (and its lean) once enough of the
  cross-section is gone; it creaks and sheds needles first. Don't stand where it's going.
* It falls on a hinge, lands on its branches, and can hit you. Limb it (branches come off as slash you can snap
  into kindling), buck it into logs and rounds, carry or drag them (heavy logs drag on a joint, light ones go in
  your arms), stand rounds on the block and split them from above, shave splits into kindling with the hatchet.
* Species matter: density, hardness, split ease and price differ (birch is hard and valuable, cedar splits like a
  dream and spits in the stove). Rotten trees cut fast and sell for nothing. Giants are beyond an axe.

## Survival without meters

Hunger (stomach growls, slower recovery), stamina (heavy breathing, sagging arms) and warmth (visible breath,
shivering hands, chattering teeth, the cold grade at the edges of your vision, the cabin thermometer). The stove
needs kindling, a match, then splits; it burns about 2 kg of wood an hour and the cabin holds heat through its logs.
Sleep in the bunk to end the day (and save).

## Credits

See `CREDITS.md`. Every sound is a real CC0 / public-domain recording; models and textures are CC0 (Poly Haven)
converted with lowpix, or built and painted in code; the human builder is ported from Limbophobia and the creature
anatomy from ODDWORLD; fonts are SIL OFL / Apache 2.0.
