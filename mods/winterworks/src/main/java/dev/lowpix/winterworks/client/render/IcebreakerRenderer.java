package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
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

    private static final ResourceLocation[] COATS = new ResourceLocation[IcebreakerEntity.VARIANTS.length];

    static {
        for (int i = 0; i < COATS.length; i++) {
            COATS[i] = dev.lowpix.winterworks.Winterworks.id("textures/entity/icebreaker_" + IcebreakerEntity.VARIANTS[i] + ".png");
        }
    }

    private static final ResourceLocation ALPHA_COAT = dev.lowpix.winterworks.Winterworks.id("textures/entity/icebreaker_alpha.png");
    /** How far (blocks) the swim clip raises the body: 9 px on the adult; 4.5 px on the cub model, drawn at 0.6. */
    private static final float SWIM_LIFT = 9f / 16f, SWIM_LIFT_CUB = 4.5f * 0.6f / 16f;

    @Override
    public ResourceLocation getTextureLocation(IcebreakerEntity e) {
        return e.isBaby() ? cub.texture : e.isAlpha() ? ALPHA_COAT : COATS[e.variant()];
    }

    @Override
    public void render(IcebreakerEntity e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model = e.isBaby() ? cub : adult;   // cubs are their own fluffy white model (drawn at half size)
        shadowRadius = e.isBaby() ? 0.53f : 1.2f;   // 0.75 size (docs/FIXES_0_4.md)
        model.partial = partial;
        super.render(e, yaw, partial, pose, buffers, light);
    }

    /**
     * Swimming (docs/FIXES_0_4.md): the whole body pitches with the dive and the surfacing (and the arc of a
     * porpoising leap), and rolls into its turns, with a barrel roll now and then; about the middle of the body.
     */
    @Override
    protected void setupRotations(IcebreakerEntity e, PoseStack pose, float bob, float bodyYaw, float partial, float scale) {
        super.setupRotations(e, pose, bob, bodyYaw, partial, scale);
        float k = e.swimBlend(partial);
        if (k <= 0f || e.isDeadOrDying()) {
            return;
        }
        float pitch = Mth.lerp(partial, e.xRotO, e.getXRot());
        float turn = Mth.wrapDegrees(e.yBodyRot - e.yBodyRotO);   // banking into the turn
        float roll = Mth.clamp(turn * 2.5f, -30f, 30f) + e.rollAngle(partial);
        float mid = e.getBbHeight() * 0.5f / Math.max(0.01f, scale);
        if (e.isInWater()) {   // the swim clip lifts the body (made for bobbing on top): in the water, swim in it
            pose.translate(0f, -(e.isBaby() ? SWIM_LIFT_CUB : SWIM_LIFT) * scale * k, 0f);
        }
        pose.translate(0f, mid, 0f);
        pose.mulPose(Axis.XP.rotationDegrees(pitch * k));
        pose.mulPose(Axis.ZP.rotationDegrees(roll * k));
        pose.translate(0f, -mid, 0f);
    }

    /** Adults are drawn 1.3x; babies use the cub model (drawn at twice its in-game size; 1.21.1 doesn't shrink babies). */
    @Override
    protected void scale(IcebreakerEntity e, PoseStack pose, float partial) {
        float k = e.isBaby() ? 0.6f : 1.0f;   // the adult model is already huge; the cub model is drawn at twice its size
        pose.scale(k, k, k);
    }

    public static class Model extends WWModel<IcebreakerEntity> {
        float partial;

        Model(ModelPart root, String name) {
            super(root, name);
        }

        private static final String[] HORN = {"horn", "horn_1", "horn_2", "horn_3"};
        private static final String[] ALPHA_PARTS = {"alpha_mane0", "alpha_mane1", "alpha_mane2", "alpha_mane3", "alpha_mane4",
                "alpha_mane5", "alpha_mane6", "alpha_beard", "alpha_ruff"};

        @Override
        public void setupAnim(IcebreakerEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            boolean swimming = e.isSwimmingPose();
            if (swimming) {
                // faster strokes when it is really going (a chase, a porpoising run)
                float speed = (float) e.getDeltaMovement().length();
                play(e.swimState, "swim", age, Mth.clamp(0.8f + speed * 3.5f, 0.8f, 2.2f));
            } else if (e.isAsleep()) {
                play(e.sleepState, "sleep", age, 1f);
            } else if (e.isCharging()) {
                play(e.chargeState, "charge", age, 1.1f);
            } else if (e.isSliding()) {
                play(e.slideState, "slide", age, 1f);
            } else {
                walk("walk", limbSwing, limbAmount, 2.4f, 2.2f);
                play(e.idleState, "idle", age, 1f);
            }
            if (!e.isCharging()) {   // the charge already aims the horns: no ram on top of it
                play(e.ramState, "ram", age, 1f);
            }
            play(e.happyState, "happy", age, 1f);
            play(e.eatState, "eat", age, 1f);
            play(e.bellySlapState, "belly_slap", age, 1f);
            play(e.tailSlapState, "tail_slap", age, 1f);
            if (!e.isAsleep()) {
                play(e.barkState, "bark", age, 1f);
            }
            float sinceBite = age - e.biteTick;
            if (sinceBite >= 0f && sinceBite < 14f) {   // the bite: jaws snap shut and it shakes the catch side to side
                float k = 1f - sinceBite / 14f;
                float shake = Mth.sin(sinceBite * 1.9f) * 0.55f * k;
                get("neck").ifPresent(p -> p.yRot += shake * 0.6f);
                get("head").ifPresent(p -> {
                    p.yRot += shake;
                    p.zRot += shake * 0.5f;
                });
                get("jaw").ifPresent(p -> p.xRot += sinceBite < 2f ? 0.5f * (1f - sinceBite / 2f) : 0f);
            }
            if (!e.isAsleep() || swimming) {   // asleep, the head rests where the clip lays it
                float yaw = headYaw * Mth.DEG_TO_RAD, pitch = swimming ? 0f : headPitch * Mth.DEG_TO_RAD;   // swimming: the body pitches
                get("neck").ifPresent(p -> p.yRot += yaw * 0.4f);
                get("head").ifPresent(p -> {
                    p.yRot += yaw * 0.5f;
                    p.xRot += pitch * 0.5f;
                });
            }
            // the belly is a spring: footfalls, landings and hits make it jiggle and settle
            float j = e.bellyJiggle(partial);
            get("belly_under").ifPresent(p -> {
                p.yScale *= 1f - j;
                p.xScale *= 1f + j * 0.55f;
                p.zScale *= 1f + j * 0.35f;
            });
            get("chest_under").ifPresent(p -> p.yScale *= 1f - j * 0.4f);
            get("belly").ifPresent(p -> p.yScale *= 1f - j * 0.1f);
            if (e.isBaby()) {
                return;   // the cub model has its own little horn bud
            }
            boolean alpha = e.isAlpha();   // the Alpha's mane, beard and chest ruff
            for (String n : ALPHA_PARTS) {
                show(n, alpha);
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
