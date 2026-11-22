package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.render.WWModel;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;
import org.joml.Vector4f;

/**
 * One of the gear's lowpix models (client.endgear.GearLayers), or its stand-in while the export isn't in the mod yet:
 * the model, its textures, its clips and its measured bounds in lowpix space (blocks, Y up, facing +Z) for fitting it
 * into hands, slots and item frames.
 */
public final class GearModel {
    public final String name;
    public final Model model;
    /** True while the lowpix export is missing: a box stand-in with a vanilla texture. */
    public final boolean standIn;
    public final ResourceLocation texture;
    @Nullable public final ResourceLocation glow;
    /** Drawn with entityTranslucent (see-through membranes) instead of cutout. */
    public boolean translucent;
    /** Bounds {min, max} of the whole model, lowpix space. */
    public final Vector3f min = new Vector3f(), max = new Vector3f();
    private final List<Vector3f[]> partBounds = new ArrayList<>();
    private final List<String> partNames = new ArrayList<>();

    public GearModel(ModelLayerLocation layer, String name, ResourceLocation standInTexture) {
        this.name = name;
        this.model = new Model(Minecraft.getInstance().getEntityModels().bakeLayer(layer), name);
        this.standIn = !GearLayers.exported(name);
        this.texture = standIn ? standInTexture : model.texture;
        // the glow pass comes from the _glow texture (some exports flag no glow parts and glow through the texture alone)
        this.glow = !standIn && Minecraft.getInstance().getResourceManager().getResource(model.glowTexture).isPresent()
                ? model.glowTexture : null;
        measure();
    }

    private void measure() {
        model.reset();
        min.set(Float.MAX_VALUE);
        max.set(-Float.MAX_VALUE);
        model.root().visit(new PoseStack(), (p, path, index, cube) -> {
            Vector3f lo = new Vector3f(Float.MAX_VALUE), hi = new Vector3f(-Float.MAX_VALUE);
            for (int c = 0; c < 8; c++) {
                float x = ((c & 1) == 0 ? cube.minX : cube.maxX) / 16f;
                float y = ((c & 2) == 0 ? cube.minY : cube.maxY) / 16f;
                float z = ((c & 4) == 0 ? cube.minZ : cube.maxZ) / 16f;
                Vector4f v = p.pose().transform(new Vector4f(x, y, z, 1f));
                Vector3f l = new Vector3f(v.x(), 1.5f - v.y(), -v.z());   // Minecraft model space -> lowpix space
                lo.min(l);
                hi.max(l);
            }
            min.min(lo);
            max.max(hi);
            partBounds.add(new Vector3f[]{lo, hi});
            partNames.add(path.substring(path.lastIndexOf('/') + 1));
        });
        if (partBounds.isEmpty()) {
            min.set(-0.5f, 0f, -0.5f);
            max.set(0.5f, 1f, 0.5f);
        }
    }

    public Vector3f size() {
        return new Vector3f(max).sub(min);
    }

    public Vector3f center() {
        return new Vector3f(min).add(max).mul(0.5f);
    }

    /** The same point in Minecraft model space (blocks, Y down, front -Z), where the exports are authored. */
    public static Vector3f toModelSpace(Vector3f lowpix) {
        return new Vector3f(lowpix.x, 1.5f - lowpix.y, -lowpix.z);
    }

    /** Centre of the parts whose name matches (cubes directly on those parts), or null if none. */
    @Nullable
    public Vector3f centerOf(Predicate<String> parts) {
        Vector3f lo = new Vector3f(Float.MAX_VALUE), hi = new Vector3f(-Float.MAX_VALUE);
        boolean any = false;
        for (int i = 0; i < partNames.size(); i++) {
            if (parts.test(partNames.get(i))) {
                lo.min(partBounds.get(i)[0]);
                hi.max(partBounds.get(i)[1]);
                any = true;
            }
        }
        return any ? lo.add(hi).mul(0.5f) : null;
    }

    public float length(String clip) {
        return model.length(clip);
    }

    /** Poses a one-shot clip at a fraction (0..1) of its length; missing clips are no-ops. */
    public void at(String clip, float fraction) {
        float len = length(clip);
        if (len > 0) {
            model.clip(clip, Math.max(0f, Math.min(1f, fraction)) * len);
        }
    }

    /** Poses a looping clip at time t (seconds); missing clips are no-ops. */
    public void loop(String clip, float t) {
        float len = length(clip);
        if (len > 0) {
            model.clip(clip, t % len);
        }
    }

    /**
     * Draws the model with the pose already in lowpix space (Y up, ground at 0, facing +Z): base (with glint if
     * `foil`), then the glow pass. `tint` multiplies the base colour (stand-ins use it).
     */
    public void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, boolean foil, int tint) {
        pose.pushPose();
        pose.translate(0f, 1.5f, 0f);   // lowpix space -> Minecraft model space (Y down, ground at 24 px)
        pose.scale(1f, -1f, -1f);
        drawModelSpace(pose, buffers, light, overlay, foil, tint);
        pose.popPose();
    }

    /** Draws the model with the pose already in Minecraft model space (blocks; parts are in pixels, Y down, front -Z). */
    public void drawModelSpace(PoseStack pose, MultiBufferSource buffers, int light, int overlay, boolean foil, int tint) {
        RenderType base = translucent ? RenderType.entityTranslucent(texture) : RenderType.entityCutoutNoCull(texture);
        VertexConsumer vc = foil ? ItemRenderer.getFoilBufferDirect(buffers, base, false, true) : buffers.getBuffer(base);
        model.renderToBuffer(pose, vc, light, overlay, tint);
        if (glow != null) {
            model.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(glow)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        }
    }

    /** For logs and the screenshot harness. */
    @Override
    public String toString() {
        return name + (standIn ? " (stand-in)" : "") + " size " + size() + " centre " + center();
    }

    /** The exported model, with its clip lengths. */
    public static final class Model extends WWModel<Entity> {
        Model(ModelPart root, String name) {
            super(root, name);
        }

        public float length(String clip) {
            AnimationDefinition def = clips.get(clip);
            return def == null ? 0f : def.lengthInSeconds();
        }
    }

    static ResourceLocation vanilla(String path) {
        return ResourceLocation.withDefaultNamespace(path);
    }

    static ResourceLocation mod(String path) {
        return Winterworks.id(path);
    }
}
