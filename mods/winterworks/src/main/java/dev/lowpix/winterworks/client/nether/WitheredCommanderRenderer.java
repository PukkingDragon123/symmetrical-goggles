package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.nether.WitheredCommander;
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
 * The Withered Commander: lowpix model `withered_commander` (textures/entity/withered_commander.png, the glow texture
 * over the eye embers and the armour cracks), its spear in its right fist (the `spear` bone). Clips: `ride` while it
 * sits its Soul Bull, `walk` and `idle` on foot, the one-shots `lunge`, `spin` and `war_cry` from its synced move, and
 * `death` played out in full (no vanilla tip-over). The head follows its look.
 */
public class WitheredCommanderRenderer extends MobRenderer<WitheredCommander, WitheredCommanderRenderer.Model> {
    public WitheredCommanderRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(NetherClient.WITHERED_COMMANDER)), 0.8f);
        addLayer(new GlowLayer(this));
    }

    @Override
    public ResourceLocation getTextureLocation(WitheredCommander e) {
        return model.texture;
    }

    @Override
    protected float getFlipDegrees(WitheredCommander e) {
        return 0f;   // the death clip lays it down
    }

    public static class Model extends WWModel<WitheredCommander> {
        Model(ModelPart root) {
            super(root, "withered_commander");
        }

        @Override
        public void setupAnim(WitheredCommander e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isPassenger()) {
                clip("ride", age / 20f);
            } else {
                walk("walk", limbSwing, limbAmount, 2.0f, 2.5f);
                play(e.idleState, "idle", age, 1f);
            }
            play(e.lungeState, "lunge", age, 1f);
            play(e.spinState, "spin", age, 1f);
            play(e.warCryState, "war_cry", age, 1f);
            play(e.deathState, "death", age, 1f);
            show("spear", !e.getMainHandItem().isEmpty());
            if (!e.deathState.isStarted()) {
                float yaw = Mth.clamp(headYaw, -60f, 60f) * Mth.DEG_TO_RAD, pitch = headPitch * Mth.DEG_TO_RAD;
                get("head").ifPresent(p -> {
                    p.yRot += yaw * 0.7f;
                    p.xRot += pitch * 0.6f;
                });
            }
        }
    }

    static class GlowLayer extends RenderLayer<WitheredCommander, Model> {
        GlowLayer(RenderLayerParent<WitheredCommander, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, WitheredCommander e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (!e.isInvisible() && m.hasGlow) {
                float flicker = 0.85f + 0.15f * Mth.sin(age * 0.37f + e.getId());
                int c = (int) (255 * flicker);
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                        0xFF000000 | (c << 16) | (c << 8) | c);
            }
        }
    }
}
