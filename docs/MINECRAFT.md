# Minecraft mod maker (`lowpix mc`)

lowpix can build the models, textures and animations of a Minecraft Java mod and drop them into **any** mod
project (Fabric, NeoForge or Forge: the output is plain vanilla client code). `mods/winterworks/` in this repo is a
complete Fabric 1.21.1 mod made this way.

## The loop

1. Write a box spec in Minecraft pixel units (16 per block): `examples/src/icebreaker.py` writes
   `examples/icebreaker.json`. Only `box` parts (no chamfer) and `bone` parts export, because entity models are cuboids.
   Box sizes times `density` must be whole numbers. `density: 1` is vanilla texel size; use 2 for held items and small
   props seen up close.
2. Build and look: `python -m lowpix build examples/icebreaker.json -o out/ice`, open `out/ice/icebreaker_sheet.png`.
3. Export into the mod:

   ```bash
   python -m lowpix mc export examples/icebreaker.json --mod path/to/your/mod --modid yourmod \
       --package com.you.yourmod.client.lowpix -o out/ice
   ```

   Look at `out/ice/icebreaker_mc.png`: it is rendered from the exported cubes and texture, so it is what the game draws.
4. In the mod, register the layer and use the runtime model (see below).

MCP: the `lowpix_mc_export` tool does step 3 and returns the preview image.

**Variants** (coats, colours): keep the parts identical and change only paint, then export each with
`--texture-only --name <model>_<variant>`. Identical parts pack to the identical box-UV layout, so every variant
texture fits the one model; pick the texture in your renderer. `examples/src/icebreaker.py` writes six coats to
`examples/variants/`.

## What gets written

| file | what |
|---|---|
| `src/main/java/<package>/<Name>Model.java` | `createBodyLayer()` (MeshDefinition / CubeListBuilder / PartPose, Mojang names), part-name constants, texture size, glow and tint part lists |
| `src/main/java/<package>/LowpixGeometry.java` | builds the same LayerDefinition from `<name>.geo.json` at runtime, so you can register models by name |
| `src/main/java/<package>/LowpixAnimations.java` | loads `<name>.anim.json` into vanilla `AnimationDefinition`s (the Warden/Sniffer keyframe system) |
| `src/main/java/<package>/LowpixEntityModel.java` | a `HierarchicalModel` base: `part(name)`, `play(state, clip, age, speed)`, `walk(clip, ...)`, `poseAt(clip, seconds)` |
| `assets/<modid>/textures/entity/<name>.png` | the painted texture in box-UV layout |
| `assets/<modid>/textures/entity/<name>_glow.png` | only the emissive texels (draw with `RenderType.eyes`) |
| `assets/<modid>/textures/entity/<name>_tint.png` | only the dyeable texels, removed from the base (draw multiplied by a colour) |
| `assets/<modid>/lowpix/<name>.anim.json` | every clip baked to keyframes: rotation degrees, position pixels (Y down), scale |
| `assets/<modid>/lowpix/<name>.geo.json` | the part tree as data |

The runtime files are copied from `lowpix/mc_runtime/` on every export (with your package name), so edit them there.

## The spec's `minecraft` block

```json
"minecraft": {"fps": 12, "glow_parts": ["core"], "glow_ramps": ["lava"], "tint_parts": ["trim", "seat"],
              "alpha_parts": {"glass": 0.35}}
```

* `fps`: keyframes per second when baking clips (Catmull-Rom between them).
* `glow_parts` / `glow_ramps`: texels that also go into the `_glow` layer.
* `tint_parts`: dyeable parts. Paint them in a light neutral ramp; the game multiplies them by the dye colour.
* `alpha_parts`: per-part opacity for glass and ice (render those parts with `RenderType.entityTranslucent`).

## Coordinates

lowpix is Y up, faces +Z, ground y=0. Minecraft model space is Y down, faces -Z, ground y=24. The export maps
(x, y, z) to (x, 24 - y, -z), which is a rotation, so nothing is mirrored and painted text reads the right way.
Euler rotations use Minecraft's order (Z, then Y, then X: `rotationZYX`). Every lowpix part becomes a ModelPart of the
same name (mirrored copies get `_mirror`), so clip tracks and Java code address parts by their spec ids.

## Using it in a mod (Fabric)

```java
public static final ModelLayerLocation SEAL = new ModelLayerLocation(id("seal"), "main");
EntityModelLayerRegistry.registerModelLayer(SEAL, () -> LowpixGeometry.layer("yourmod", "seal"));

public class SealModel extends LowpixEntityModel<SealEntity> {
    public SealModel(ModelPart root) { super(root, "yourmod", "seal"); }
    @Override public void setupAnim(SealEntity e, float limb, float amount, float age, float yaw, float pitch) {
        resetPose();
        walk("walk", limb, amount, 2f, 2f);
        play(e.idleState, "idle", age, 1f);
        part("head").yRot += yaw * Mth.DEG_TO_RAD;
    }
}
```

For carts, items (BuiltinItemRenderer) and block entities, pose the model with `poseAt(clip, seconds)` and draw it
yourself; `mods/winterworks/src/main/java/dev/lowpix/winterworks/client/render/` has examples of all three.

## Testing a mod headlessly

`mods/winterworks` runs its Fabric GameTests on a headless server (`./gradlew runGametest`), and
`./gradlew runShowcase` under `xvfb-run` boots the real client, builds scenes with commands and saves in-game
screenshots to `run/showcase/screenshots/`.
