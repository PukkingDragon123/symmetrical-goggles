package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endgear.Dragonling;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import org.jetbrains.annotations.Nullable;

/**
 * The Dragonling (docs/END_UPDATE.md section 13): the lowpix models {@code dragonling_baby} and {@code dragonling_teen}
 * by stage, with their glow passes, the teen's {@code saddle} part only when saddled, and its horse armour drawn by
 * swapping in the armour texture variant {@code dragonling_teen_armor_<iron|gold|diamond>} (the armour shells are
 * transparent in the base texture). Clips: idle, walk, fly, glide, sit and the
 * one-shots eat, breath and (baby) hatch; the head follows the look.
 */
public class DragonlingRenderer extends MobRenderer<Dragonling, DragonlingRenderer.Model> {
    private static final Map<String, Boolean> TEXTURE_EXISTS = new HashMap<>();

    public DragonlingRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(), 0.45f);
        addLayer(new StandInArmorLayer(this));
        addLayer(new GlowLayer(this));
    }

    /** The armour textures are the teen's texture with the armour shells (transparent in the base) painted in. */
    @Override
    public ResourceLocation getTextureLocation(Dragonling e) {
        GearModel g = model.pick(e);
        ResourceLocation armor = armorTexture(e);
        return armor != null && !g.standIn && exists(armor) ? armor : g.texture;
    }

    @Nullable
    static ResourceLocation armorTexture(Dragonling e) {
        String variant = e.armorVariant();
        return variant == null || !e.isTeen() ? null : Winterworks.id("textures/entity/dragonling_teen_armor_" + variant + ".png");
    }

    @Override
    public void render(Dragonling e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        shadowRadius = e.isTeen() ? 1.05f : 0.42f;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    static boolean exists(ResourceLocation tex) {
        return TEXTURE_EXISTS.computeIfAbsent(tex.toString(), k -> Minecraft.getInstance().getResourceManager().getResource(tex).isPresent());
    }

    // ------------------------------------------------------------------------------------------------ model

    /** Both stages' models; draws the one for the entity being rendered. */
    public static class Model extends EntityModel<Dragonling> {
        @Nullable private GearModel baby, teen;
        private GearModel current;

        Model() {
            super(RenderType::entityCutoutNoCull);
        }

        GearModel pick(Dragonling e) {
            if (baby == null) {
                baby = new GearModel(GearLayers.DRAGONLING_BABY, "dragonling_baby", GearModel.vanilla("textures/block/purpur_block.png"));
                teen = new GearModel(GearLayers.DRAGONLING_TEEN, "dragonling_teen", GearModel.vanilla("textures/block/purpur_block.png"));
                Winterworks.LOG.info("dragonling models: {}; {}", baby, teen);
            }
            return e.isTeen() ? teen : baby;
        }

        GearModel current() {
            return current;
        }

        @Override
        public void setupAnim(Dragonling e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            GearModel g = pick(e);
            current = g;
            GearModel.Model m = g.model;
            m.reset();
            float t = age / 20f;
            if (e.isInSittingPose()) {
                g.loop("sit", t);
            } else if (e.isFlying()) {
                double dy = e.getY() - e.yo;
                double dh = Math.sqrt((e.getX() - e.xo) * (e.getX() - e.xo) + (e.getZ() - e.zo) * (e.getZ() - e.zo));
                g.loop(dy < -0.03 && dh > 0.12 ? "glide" : "fly", t);
            } else {
                g.loop("idle", t);
                m.walk("walk", limbSwing, limbAmount, e.isTeen() ? 1.5f : 2.5f, e.isTeen() ? 2.0f : 3.0f);
            }
            m.play(e.eatState, "eat", age, 1f);
            m.play(e.breathState, "breath", age, 1f);
            if (!e.isTeen()) {
                m.play(e.hatchState, "hatch", age, 1f);
            }
            float look = e.isVehicle() ? 0.3f : 0.6f;
            m.maybePart("head").ifPresent(p -> {
                p.yRot += headYaw * Mth.DEG_TO_RAD * look;
                p.xRot += headPitch * Mth.DEG_TO_RAD * look;
            });
            m.maybePart("saddle").ifPresent(p -> p.visible = e.isSaddled());
        }

        @Override
        public void renderToBuffer(PoseStack pose, VertexConsumer vc, int light, int overlay, int color) {
            if (current != null) {
                current.model.renderToBuffer(pose, vc, light, overlay, current.standIn ? mul(color, 0xFF7A5A9A) : color);
            }
        }

        static int mul(int a, int b) {
            int r = ((a >> 16) & 255) * ((b >> 16) & 255) / 255, g = ((a >> 8) & 255) * ((b >> 8) & 255) / 255,
                    bl = (a & 255) * (b & 255) / 255, al = ((a >>> 24) * (b >>> 24)) / 255;
            return (al << 24) | (r << 16) | (g << 8) | bl;
        }
    }

    // ------------------------------------------------------------------------------------------------ layers

    /** The emissive pass (eyes and whatever the art marks glow). */
    static final class GlowLayer extends RenderLayer<Dragonling, Model> {
        GlowLayer(RenderLayerParent<Dragonling, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, Dragonling e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            GearModel g = getParentModel().current();
            if (g != null && g.glow != null && !e.isInvisible()) {
                g.model.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(g.glow)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
            }
        }
    }

    /** Stand-in models only (no armour shells): the body again, tinted in the metal's colour. */
    static final class StandInArmorLayer extends RenderLayer<Dragonling, Model> {
        StandInArmorLayer(RenderLayerParent<Dragonling, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, Dragonling e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            String variant = e.armorVariant();
            GearModel g = getParentModel().current();
            if (variant == null || !e.isTeen() || g == null || !g.standIn || e.isInvisible()) {
                return;
            }
            int tint = switch (variant) {
                case "gold" -> 0xFFF2C14E;
                case "diamond" -> 0xFF5FE3E0;
                default -> 0xFFC8C8D0;
            };
            int overlay = LivingEntityRenderer.getOverlayCoords(e, 0f);
            g.model.maybePart("body").ifPresent(body -> body.render(pose,
                    buffers.getBuffer(RenderType.entityCutoutNoCull(GearModel.vanilla("textures/block/iron_block.png"))), light, overlay, tint));
        }
    }
}
