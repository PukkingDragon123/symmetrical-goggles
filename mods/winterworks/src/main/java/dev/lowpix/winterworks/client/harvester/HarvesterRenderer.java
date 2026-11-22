package dev.lowpix.winterworks.client.harvester;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.harvester.HarvesterEntity;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * The Harvester (lowpix `harvester`, client.lowpix.HarvesterModel; vanilla style, density 1: texture 256x256 on
 * 256x256 UVs, drawn entityCutoutNoCull). Clips: idle, walk, run (by speed), sit, and graze / chomp / shove on cue. The saddle and the two
 * chests show when it wears them. Babies are drawn half size.
 */
public class HarvesterRenderer extends MobRenderer<HarvesterEntity, HarvesterRenderer.Model> {
    public HarvesterRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(HarvesterClient.HARVESTER)), 1.5f);
    }

    @Override
    public ResourceLocation getTextureLocation(HarvesterEntity e) {
        return model.texture;
    }

    @Override
    protected void scale(HarvesterEntity e, PoseStack pose, float partial) {
        float k = e.getAgeScale();
        pose.scale(k, k, k);
    }

    @Override
    protected float getShadowRadius(HarvesterEntity e) {
        return super.getShadowRadius(e) * e.getAgeScale();
    }

    public static class Model extends WWModel<HarvesterEntity> {
        Model(ModelPart root) {
            super(root, "harvester");
        }

        @Override
        public void setupAnim(HarvesterEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            show("saddle", e.isSaddled());
            show("chest_l", e.hasChest());
            show("chest_r", e.hasChest());
            if (e.isSitting()) {
                play(e.sitState, "sit", age, 1f);
            } else {
                if (limbAmount < 0.15f) {
                    play(e.idleState, "idle", age, 1f);
                }
                if (limbAmount > 0.7f) {
                    walk("run", limbSwing, limbAmount, 2.0f, 2.0f);
                } else {
                    walk("walk", limbSwing, limbAmount, 2.6f, 2.5f);
                }
                play(e.grazeState, "graze", age, 1f);
            }
            play(e.chompState, "chomp", age, 1f);
            play(e.shoveState, "shove", age, 1f);
            // it looks where it looks, mostly with its long neck
            float yaw = Mth.clamp(headYaw, -40f, 40f) * Mth.DEG_TO_RAD, pitch = Mth.clamp(headPitch, -25f, 25f) * Mth.DEG_TO_RAD;
            get("neck").ifPresent(p -> {
                p.yRot += yaw * 0.6f;
                p.xRot += pitch * 0.4f;
            });
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.4f;
                p.xRot += pitch * 0.4f;
            });
        }
    }
}
