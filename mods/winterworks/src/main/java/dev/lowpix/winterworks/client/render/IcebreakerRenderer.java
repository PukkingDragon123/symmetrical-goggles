package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.WWLayers;
import dev.lowpix.winterworks.icebreaker.IcebreakerEntity;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

public class IcebreakerRenderer extends MobRenderer<IcebreakerEntity, IcebreakerRenderer.Model> {
    private final Model adult, cub;

    public IcebreakerRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(WWLayers.ICEBREAKER), "icebreaker"), 1.15f);
        adult = model;
        cub = new Model(ctx.bakeLayer(WWLayers.ICEBREAKER_CUB), "icebreaker_cub");
    }

    @Override
    public ResourceLocation getTextureLocation(IcebreakerEntity e) {
        return model.texture;
    }

    @Override
    public void render(IcebreakerEntity e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model = e.isBaby() ? cub : adult;   // cubs are their own fluffy white model (drawn at half size)
        shadowRadius = e.isBaby() ? 0.6f : 1.15f;
        model.partial = partial;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    public static class Model extends WWModel<IcebreakerEntity> {
        float partial;

        Model(ModelPart root, String name) {
            super(root, name);
        }

        private static final String[] HORN = {"horn", "horn_1", "horn_2", "horn_3"};

        @Override
        public void setupAnim(IcebreakerEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isInWater()) {
                play(e.swimState, "swim", age, 1f);
            } else if (e.isCharging()) {
                play(e.chargeState, "charge", age, 1.1f);
            } else if (e.isSliding()) {
                play(e.slideState, "slide", age, 1f);
            } else {
                walk("walk", limbSwing, limbAmount, 2.4f, 2.2f);
                play(e.idleState, "idle", age, 1f);
            }
            play(e.ramState, "ram", age, 1f);
            play(e.happyState, "happy", age, 1f);
            play(e.bellySlapState, "belly_slap", age, 1f);
            play(e.tailSlapState, "tail_slap", age, 1f);
            float yaw = headYaw * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
            get("neck").ifPresent(p -> p.yRot += yaw * 0.4f);
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.5f;
                p.xRot += pitch * 0.5f;
            });
            // the belly is a spring: footfalls, landings and hits make it jiggle and settle
            float j = e.bellyJiggle(partial);
            get("belly").ifPresent(p -> {
                p.yScale *= 1f - j;
                p.xScale *= 1f + j * 0.55f;
                p.zScale *= 1f + j * 0.35f;
            });
            get("body").ifPresent(p -> p.yScale *= 1f - j * 0.12f);
            if (e.isBaby()) {
                return;   // the cub model has its own little horn bud
            }
            // the horn grows in stages; the newest segment pops in with a little overshoot
            int stage = e.hornStage();
            for (int i = 0; i < HORN.length; i++) {
                show(HORN[i], i < stage);
            }
            if (stage > 0 && e.hornGrowFx < 1f) {
                float k = e.hornGrowFx, c = 1.7f;
                float s = 1f + (c + 1f) * (float) Math.pow(k - 1f, 3) + c * (float) Math.pow(k - 1f, 2);   // ease-out-back
                get(HORN[stage - 1]).ifPresent(p -> {
                    p.xScale *= s;
                    p.yScale *= s;
                    p.zScale *= s;
                });
            }
        }
    }
}
