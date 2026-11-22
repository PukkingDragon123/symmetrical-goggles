package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.nether.PiglinWitch;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The Piglin Witch: lowpix model `piglin_witch` (textures/entity/piglin_witch.png, plus piglin_witch_glow.png over the
 * parts flagged glow), her clips driven by the entity (walk, idle, trade loop; drink, hiccup, rummage, refuse, cackle,
 * throw one-shots) with a drunken sway, a jiggling belly and flopping ears on top; whatever she holds (flask, potion,
 * a trinket from the backpack) is drawn at the hand_r bone. Missing art draws nothing; missing clips are no-ops.
 */
public class PiglinWitchRenderer extends MobRenderer<PiglinWitch, PiglinWitchRenderer.Model> {
    public PiglinWitchRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(NetherClient.PIGLIN_WITCH)), 0.7f);
        addLayer(new GlowLayer(this));
        addLayer(new HeldItemLayer(this, ctx.getItemInHandRenderer()));
    }

    @Override
    public ResourceLocation getTextureLocation(PiglinWitch e) {
        return model.texture;
    }

    public static class Model extends WWModel<PiglinWitch> {
        final BoneChain hand;

        Model(ModelPart root) {
            super(root, "piglin_witch");
            hand = new BoneChain(root, "piglin_witch", "hand_r", this::get);
        }

        @Override
        public void setupAnim(PiglinWitch e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            if (e.isTradingSynced()) {
                play(e.tradeState, "trade", age, 1f);
            } else {
                walk("walk", limbSwing, limbAmount, 2.0f, 2.5f);
                play(e.idleState, "idle", age, 1f);
            }
            play(e.drinkState, "drink", age, 1f);
            play(e.hiccupState, "hiccup", age, 1f);
            play(e.rummageState, "rummage", age, 1f);
            play(e.refuseState, "refuse", age, 1f);
            play(e.cackleState, "cackle", age, 1f);
            play(e.throwState, "throw", age, 1f);
            // procedural touches: a drunk's slow sway, a belly that jiggles with her step, ears that flop
            float sway = Mth.sin(age * 0.07f) * 0.05f + Mth.sin(age * 0.023f) * 0.03f;
            get("body").ifPresent(p -> p.zRot += sway);
            float step = Mth.cos(limbSwing * 1.3f) * Mth.clamp(limbAmount, 0f, 1f);
            get("belly").ifPresent(p -> {
                p.yScale *= 1f + step * 0.04f;
                p.xScale *= 1f - step * 0.02f;
            });
            get("ear_l").ifPresent(p -> p.zRot += -0.1f + step * 0.25f + sway);
            get("ear_r").ifPresent(p -> p.zRot += 0.1f - step * 0.25f + sway);
            float k = e.rummageState.isStarted() || e.drinkState.isStarted() ? 0.3f : 1f;
            float yaw = Mth.clamp(headYaw, -50f, 50f) * Mth.DEG_TO_RAD * k, pitch = headPitch * Mth.DEG_TO_RAD * k;
            get("head").ifPresent(p -> {
                p.yRot += yaw * 0.8f;
                p.xRot += pitch * 0.6f;
                p.zRot -= sway * 0.6f;   // she keeps her head (more or less) level while the body sways
            });
        }
    }

    /** The emissive layer, when the art has one (piglin_witch_glow.png and parts flagged glow). */
    static class GlowLayer extends RenderLayer<PiglinWitch, Model> {
        GlowLayer(RenderLayerParent<PiglinWitch, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PiglinWitch e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (!e.isInvisible() && m.hasGlow) {
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
            }
        }
    }

    /** Her main-hand item at the hand_r bone. */
    static class HeldItemLayer extends RenderLayer<PiglinWitch, Model> {
        private final ItemInHandRenderer items;

        HeldItemLayer(RenderLayerParent<PiglinWitch, Model> parent, ItemInHandRenderer items) {
            super(parent);
            this.items = items;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PiglinWitch e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            ItemStack held = e.getMainHandItem();
            Model m = getParentModel();
            if (held.isEmpty() || e.isInvisible() || !m.hand.present()) {
                return;
            }
            pose.pushPose();
            m.hand.apply(pose);
            // as vanilla's held-item layer does from the arm, without the arm's length: hand_r is at the palm
            pose.mulPose(Axis.XP.rotationDegrees(-90f));
            pose.mulPose(Axis.YP.rotationDegrees(180f));
            pose.translate(1f / 16f, 0.0625f, 0f);
            items.renderItem(e, held, ItemDisplayContext.THIRD_PERSON_RIGHT_HAND, false, pose, buffers, light);
            pose.popPose();
        }
    }
}
