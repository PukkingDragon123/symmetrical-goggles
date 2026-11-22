package dev.lowpix.winterworks.client.oceanmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.oceanmob.Anglerfish;
import java.util.Set;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * The anglerfish (lowpix `anglerfish`, built at the female's size: females drawn at 1.0, males at 1/7). The body pitches
 * with its swimming; idle and swim loops blend by speed, `hold` while it has a player in its jaws, and `lunge`, `bite`,
 * `lure_flash` play on cue. The lure's glow (the `_glow` layer, full-bright, with the halo cards that only the glow pass
 * draws) breathes slowly, flickers now and then, and flares when she hunts.
 */
public class AnglerfishRenderer extends MobRenderer<Anglerfish, AnglerfishRenderer.Model> {
    static final Set<String> HALOS = Set.of("lure_halo_xy", "lure_halo_yz", "lure_halo_xz");

    public AnglerfishRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(OceanMobClient.ANGLERFISH)), 1.0f);
        addLayer(new LureGlow(this));
    }

    @Override
    public ResourceLocation getTextureLocation(Anglerfish e) {
        return model.texture;
    }

    @Override
    public void render(Anglerfish e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        shadowRadius = e.isFemale() ? 1.1f : 0.12f;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    @Override
    protected void scale(Anglerfish e, PoseStack pose, float partial) {
        float k = e.modelScale();
        pose.scale(k, k, k);
    }

    @Override
    protected void setupRotations(Anglerfish e, PoseStack pose, float bob, float yaw, float partial, float scale) {
        super.setupRotations(e, pose, bob, yaw, partial, scale);
        float s = e.modelScale();
        if (!e.isInWater() && e.deathTime <= 0) {   // flopping on its side
            pose.translate(0f, 1.15f * s, 0f);
            pose.mulPose(Axis.ZP.rotationDegrees(90f));
            return;
        }
        float pitch = Mth.lerp(partial, e.xRotO, e.getXRot());
        float pivot = (float) (Anglerfish.PIVOT_Y / 16.0) * s;
        pose.translate(0f, pivot, 0f);
        pose.mulPose(Axis.XP.rotationDegrees(-pitch));
        pose.translate(0f, -pivot, 0f);
    }

    @Override
    protected float getFlipDegrees(Anglerfish e) {
        return 180f;
    }

    /**
     * The lure's brightness now (about 0.3 .. 1.8): slow breaths of light, short irregular flickers, a quicker and brighter
     * pulse while it hunts or holds prey, and the flare of `lure_flash`.
     */
    static float lureBrightness(Anglerfish e, float age, float flash) {
        float t = age / 20f;
        int seed = e.getId() * 7919;
        float breath = 0.62f + 0.38f * (0.5f + 0.5f * Mth.sin(t * 1.55f + seed * 0.37f)) * (0.85f + 0.15f * Mth.sin(t * 0.43f + seed));
        int slot = (int) Math.floor(t * 9f);
        float h = hash(seed + slot);
        float flicker = h < 0.03f ? 0.2f : h < 0.055f ? 0.55f : h > 0.985f ? 1.25f : 1f;
        float hunt = e.isHunting() || e.isHolding() ? 0.35f + 0.2f * Mth.sin(t * 8.5f) : 0f;
        return breath * flicker + hunt + flash * 0.9f;
    }

    private static float hash(int n) {
        n = (n << 13) ^ n;
        n = n * (n * n * 15731 + 789221) + 1376312589;
        return (n & 0x7fffffff) / (float) 0x7fffffff;
    }

    public static class Model extends OceanModel<Anglerfish> {
        /** Set in setupAnim, read by the glow pass. */
        float brightness = 1f;

        Model(ModelPart root) {
            super(root, "anglerfish");
        }

        @Override
        public void setupAnim(Anglerfish e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            float t = age / 20f;
            float partial = age - e.tickCount;
            float sw = Mth.lerp(partial, e.swimBlendO, e.swimBlend);
            if (e.isHolding()) {
                blend("hold", t, 1f);
            } else {
                blend("idle", t, 1f - sw);
                blend("swim", t * (e.isFemale() ? 1f : 1.5f), sw);
            }
            oneShot(e.lungeState, "lunge", age);
            oneShot(e.biteState, "bite", age);
            boolean flashing = oneShot(e.flashState, "lure_flash", age);
            float flash = flashing ? Mth.sin(progress(e.flashState, "lure_flash") * Mth.PI) : 0f;
            brightness = lureBrightness(e, age, flash);
            float halo = 0.75f + 0.35f * Math.min(brightness, 1.6f);
            for (String h : HALOS) {
                scalePart(h, halo, halo, halo);
            }
        }

        /** The base pass leaves out the halo cards (they are light, drawn by the glow pass only). */
        @Override
        public void renderToBuffer(PoseStack pose, VertexConsumer buffer, int light, int overlay, int color) {
            mask(n -> !HALOS.contains(n));
            super.renderToBuffer(pose, buffer, light, overlay, color);
            unmask();
        }

        void renderGlow(PoseStack pose, MultiBufferSource buffers) {
            if (!hasGlow) {
                return;
            }
            VertexConsumer buf = buffers.getBuffer(RenderType.eyes(glowTexture));
            float b = Math.min(brightness, 1f);
            root.render(pose, buf, 0xF000F0, OverlayTexture.NO_OVERLAY, gray(b));
            // the halo cards once more: a bloom that reads from far off in dark water
            mask(HALOS::contains);
            root.render(pose, buf, 0xF000F0, OverlayTexture.NO_OVERLAY, gray(Math.min(1f, brightness * 0.9f)));
            if (brightness > 1f) {   // flaring: the bulb and halo again, additively
                mask(n -> HALOS.contains(n) || n.startsWith("lure_bulb") || n.equals("lure_core"));
                root.render(pose, buf, 0xF000F0, OverlayTexture.NO_OVERLAY, gray(Math.min(1f, brightness - 1f)));
            }
            unmask();
        }

        private static int gray(float v) {
            int c = Mth.clamp((int) (v * 255f), 0, 255);
            return 0xFF000000 | c << 16 | c << 8 | c;
        }
    }

    static final class LureGlow extends RenderLayer<Anglerfish, Model> {
        LureGlow(AnglerfishRenderer parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, Anglerfish e, float limbSwing, float limbAmount, float partial,
                           float age, float headYaw, float headPitch) {
            if (!e.isInvisible()) {
                getParentModel().renderGlow(pose, buffers);
            }
        }
    }
}
