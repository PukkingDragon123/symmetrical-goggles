package dev.lowpix.winterworks.client.boss;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.boss.FrostMaulerEntity;
import dev.lowpix.winterworks.client.render.WWModel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * Draws the Frost Mauler (lowpix model `frost_mauler`, texture textures/entity/frost_mauler.png) with its glowing
 * ice-blue eyes (the `_glow` texture, an emissive pass): dim while it sleeps in the ice, flickering as the tomb cracks,
 * blazing when enraged. Clips per state: frozen, wake, idle, walk/run, roar, claw_l, claw_r, fury, stunned, death.
 */
public class FrostMaulerRenderer extends MobRenderer<FrostMaulerEntity, FrostMaulerRenderer.Model> {
    public FrostMaulerRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(BossClient.MAULER_LAYER)), 1.7f);
        addLayer(new Eyes(this));
    }

    @Override
    public ResourceLocation getTextureLocation(FrostMaulerEntity e) {
        return model.texture;
    }

    @Override
    public void render(FrostMaulerEntity e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model.partial = partial;
        shadowRadius = e.isDormant() ? 0.6f : 1.7f;
        pose.pushPose();
        if (e.mode() == FrostMaulerEntity.MODE_AWAKENING) {   // it strains against the cracking ice
            float t = e.tickCount + partial;
            pose.translate(Mth.sin(t * 2.7f) * 0.03f, Mth.sin(t * 3.9f) * 0.015f, Mth.cos(t * 3.1f) * 0.03f);
        }
        super.render(e, yaw, partial, pose, buffers, light);
        pose.popPose();
    }

    /** Its death is the `death` clip, not the vanilla tip-over. */
    @Override
    protected float getFlipDegrees(FrostMaulerEntity e) {
        return 0f;
    }

    /** Glowing eyes (emissive): brightness by state. */
    static final class Eyes extends RenderLayer<FrostMaulerEntity, Model> {
        Eyes(RenderLayerParent<FrostMaulerEntity, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, FrostMaulerEntity e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (!m.hasGlow || e.isInvisible()) {
                return;
            }
            float k;
            if (e.isDeadOrDying()) {
                k = Math.max(0f, 1f - (e.deathTime + partial) / FrostMaulerEntity.DEATH_TICKS);
            } else if (e.isDormant()) {
                k = e.mode() == FrostMaulerEntity.MODE_AWAKENING ? 0.5f + 0.5f * Math.abs(Mth.sin(age * 0.9f)) : 0.28f;
            } else if (e.isStunned()) {
                k = 0.35f + 0.15f * Mth.sin(age * 0.5f);
            } else if (e.isEnraged()) {
                k = 0.85f + 0.15f * Mth.sin(age * 0.35f);
            } else {
                k = 0.8f;
            }
            int c = (int) (Mth.clamp(k, 0f, 1f) * 255);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | (c << 16) | (c << 8) | c);
        }
    }

    public static class Model extends WWModel<FrostMaulerEntity> {
        float partial;

        Model(ModelPart root) {
            super(root, "frost_mauler");
        }

        /** A held pose: the clip's last frame (or its only one). */
        private void hold(String clip) {
            AnimationDefinition d = clips.get(clip);
            if (d != null) {
                poseAt(clip, d.looping() ? 0f : d.lengthInSeconds());
            }
        }

        @Override
        public void setupAnim(FrostMaulerEntity e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isDormant()) {
                hold("frozen");   // frozen mid-roar
                return;
            }
            if (e.isDeadOrDying()) {
                play(e.deathState, "death", age, 1f);
                return;
            }
            byte mode = e.mode();
            if (mode == FrostMaulerEntity.MODE_WAKING) {
                play(e.wakeState, "wake", age, 1f);
                return;
            }
            switch (mode) {
                case FrostMaulerEntity.MODE_STUNNED -> play(e.stunnedState, "stunned", age, 1f);
                case FrostMaulerEntity.MODE_FURY_CHARGE -> play(e.furyState, "fury", age, 1.25f);
                case FrostMaulerEntity.MODE_FURY_BITE -> play(e.furyState, "fury", age, 10f / FrostMaulerEntity.BITE_INTERVAL);
                default -> {
                    // walk blends into run as it speeds up
                    float run = Mth.clamp((limbAmount - 0.55f) / 0.35f, 0f, 1f);
                    walk("walk", limbSwing, limbAmount * (1f - run), 1.6f, 2.0f);
                    walk("run", limbSwing, limbAmount * run, 1.4f, 1.5f);
                    play(e.idleState, "idle", age, 1f);
                }
            }
            play(e.roarState, "roar", age, 1f);
            play(e.clawLState, "claw_l", age, 1f);
            play(e.clawRState, "claw_r", age, 1f);
            if (mode == FrostMaulerEntity.MODE_FURY_WINDUP) {   // crouch, head low, about to spring
                float k = Mth.clamp((age - e.furyStart) / 6f, 0f, 1f);
                float snarl = Mth.sin(age * 1.7f) * 0.04f * k;
                get("neck").ifPresent(p -> p.xRot += 0.3f * k);
                get("head").ifPresent(p -> p.xRot += 0.15f * k + snarl);
                get("jaw").ifPresent(p -> p.xRot += 0.35f * k);
            }
            if (mode == FrostMaulerEntity.MODE_NONE && !e.roarState.isStarted()) {
                float yaw = headYaw * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
                get("neck").ifPresent(p -> p.yRot += yaw * 0.4f);
                get("head").ifPresent(p -> {
                    p.yRot += yaw * 0.5f;
                    p.xRot += pitch * 0.5f;
                });
            }
        }
    }
}
