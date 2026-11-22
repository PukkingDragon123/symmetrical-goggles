package dev.lowpix.winterworks.client.endmob;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import org.joml.Vector3f;

/**
 * A box stand-in for a lowpix model that hasn't landed yet: parts named like the contract's bones, each a flat colour
 * (drawn with vanilla's white texture, tinted), some of them glowing, and a few simple clips under the contract's clip
 * names, so the renderers drive it exactly like the export. Minecraft model space: pixels, Y down, front at -Z, feet at
 * y = 24.
 */
final class StandIn {
    private final MeshDefinition mesh = new MeshDefinition();
    private final Map<String, PartDefinition> defs = new HashMap<>();
    final Map<String, String> parents = new LinkedHashMap<>();
    final Map<String, Integer> colors = new LinkedHashMap<>();
    final Map<String, Integer> glows = new LinkedHashMap<>();
    final Map<String, AnimationDefinition> clips = new HashMap<>();

    /** A part: pivot (px, py, pz) in its parent, rotated (radians), with boxes {x, y, z, w, h, d} round the pivot. */
    StandIn part(String name, String parent, float px, float py, float pz, float rx, float ry, float rz, int color, float[]... boxes) {
        CubeListBuilder cubes = CubeListBuilder.create();
        for (float[] b : boxes) {
            cubes.texOffs(0, 0).addBox(b[0], b[1], b[2], b[3], b[4], b[5], CubeDeformation.NONE);
        }
        PartDefinition p = parent == null ? mesh.getRoot() : defs.get(parent);
        if (p == null) {
            throw new IllegalArgumentException("stand-in part " + name + ": no parent " + parent);
        }
        defs.put(name, p.addOrReplaceChild(name, cubes, PartPose.offsetAndRotation(px, py, pz, rx, ry, rz)));
        parents.put(name, parent);
        if (boxes.length > 0) {
            colors.put(name, color);
        }
        return this;
    }

    StandIn part(String name, String parent, float px, float py, float pz, int color, float[]... boxes) {
        return part(name, parent, px, py, pz, 0f, 0f, 0f, color, boxes);
    }

    /** An empty pivot (a locator, or a bone that only holds others). */
    StandIn bone(String name, String parent, float px, float py, float pz) {
        return part(name, parent, px, py, pz, 0f, 0f, 0f, 0);
    }

    /** Marks a part as glowing in `color` (drawn again, emissive). */
    StandIn glow(String name, int color) {
        glows.put(name, color);
        return this;
    }

    static float[] box(float x, float y, float z, float w, float h, float d) {
        return new float[]{x, y, z, w, h, d};
    }

    LayerDefinition layer() {
        return LayerDefinition.create(mesh, 16, 16);
    }

    // ------------------------------------------------------------------------------------------- clips

    /** Starts a clip; add channels with {@link Clip#rot}, {@link Clip#pos} and {@link Clip#scale}, then {@link Clip#done}. */
    Clip clip(String name, float seconds, boolean loop) {
        return new Clip(name, seconds, loop);
    }

    final class Clip {
        private final String name;
        private final AnimationDefinition.Builder b;

        private Clip(String name, float seconds, boolean loop) {
            this.name = name;
            this.b = AnimationDefinition.Builder.withLength(seconds);
            if (loop) {
                b.looping();
            }
        }

        /** Rotation keys for `bone`: {t, x, y, z} in seconds and degrees. */
        Clip rot(String bone, float[]... keys) {
            return channel(bone, AnimationChannel.Targets.ROTATION, keys, (float) (Math.PI / 180), 0f);
        }

        /** Position keys: {t, x, y, z} in model pixels, Y down. */
        Clip pos(String bone, float[]... keys) {
            return channel(bone, AnimationChannel.Targets.POSITION, keys, 1f, 0f);
        }

        /** Scale keys: {t, x, y, z} as multipliers. */
        Clip scale(String bone, float[]... keys) {
            return channel(bone, AnimationChannel.Targets.SCALE, keys, 1f, -1f);
        }

        private Clip channel(String bone, AnimationChannel.Target target, float[][] keys, float mul, float add) {
            List<Keyframe> frames = new ArrayList<>();
            for (float[] k : keys) {
                frames.add(new Keyframe(k[0], new Vector3f(k[1] * mul + add, k[2] * mul + add, k[3] * mul + add),
                        AnimationChannel.Interpolations.CATMULLROM));
            }
            b.addAnimation(bone, new AnimationChannel(target, frames.toArray(new Keyframe[0])));
            return this;
        }

        StandIn done() {
            clips.put(name, b.build());
            return StandIn.this;
        }
    }

    static float[] k(float t, float x, float y, float z) {
        return new float[]{t, x, y, z};
    }
}
