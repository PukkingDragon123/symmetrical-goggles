package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.client.render.WWModel;
import dev.lowpix.winterworks.nether.GoldenPiglin;
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
 * The Golden Piglin: lowpix model `golden_piglin` (textures/entity/golden_piglin.png, glow if the art has one). Clips:
 * idle (strained trembling), walk (stiff, janky), barter (while it admires gold), hurt_groan (on each hit); on top, a
 * constant fine tremor and a head that barely turns. The gold it is admiring is drawn in its left hand (arm_l), as on a
 * vanilla piglin. Missing art draws nothing; missing clips are no-ops.
 */
public class GoldenPiglinRenderer extends MobRenderer<GoldenPiglin, GoldenPiglinRenderer.Model> {
    public GoldenPiglinRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new Model(ctx.bakeLayer(NetherClient.GOLDEN_PIGLIN)), 0.5f);
        addLayer(new GlowLayer(this));
        addLayer(new HandsLayer(this, ctx.getItemInHandRenderer()));
    }

    @Override
    public ResourceLocation getTextureLocation(GoldenPiglin e) {
        return model.texture;
    }

    public static class Model extends WWModel<GoldenPiglin> {
        final BoneChain armL, armR;

        Model(ModelPart root) {
            super(root, "golden_piglin");
            armL = new BoneChain(root, "golden_piglin", "arm_l", this::get);
            armR = new BoneChain(root, "golden_piglin", "arm_r", this::get);
        }

        @Override
        public void setupAnim(GoldenPiglin e, float limbSwing, float limbAmount, float age, float headYaw, float headPitch) {
            reset();
            // its speed is tiny (0.06), so the walk is driven hard to show at all
            walk("walk", limbSwing, Mth.clamp(limbAmount * 4f, 0f, 1f), 3.0f, 2.0f);
            play(e.idleState, "idle", age, 1f);
            play(e.barterState, "barter", age, 1f);
            play(e.hurtGroanState, "hurt_groan", age, 1f);
            float tremor = Mth.sin(age * 2.3f) * 0.012f + Mth.sin(age * 3.7f + 1.3f) * 0.008f;
            get("body").ifPresent(p -> {
                p.zRot += tremor;
                p.xRot += tremor * 0.5f;
            });
            get("head").ifPresent(p -> {
                p.yRot += Mth.clamp(headYaw, -30f, 30f) * Mth.DEG_TO_RAD * 0.35f;
                p.xRot += headPitch * Mth.DEG_TO_RAD * 0.3f;
                p.zRot -= tremor * 1.5f;
            });
            get("arm_l").ifPresent(p -> p.zRot += tremor * 2f);
            get("arm_r").ifPresent(p -> p.zRot -= tremor * 2f);
        }
    }

    static class GlowLayer extends RenderLayer<GoldenPiglin, Model> {
        GlowLayer(RenderLayerParent<GoldenPiglin, Model> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, GoldenPiglin e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            Model m = getParentModel();
            if (!e.isInvisible() && m.hasGlow) {
                m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
            }
        }
    }

    /** Held items as vanilla piglins hold them: from each arm's shoulder pivot, down the arm. */
    static class HandsLayer extends RenderLayer<GoldenPiglin, Model> {
        private final ItemInHandRenderer items;

        HandsLayer(RenderLayerParent<GoldenPiglin, Model> parent, ItemInHandRenderer items) {
            super(parent);
            this.items = items;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, GoldenPiglin e, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            if (e.isInvisible()) {
                return;
            }
            Model m = getParentModel();
            hand(pose, buffers, light, e, m.armL, e.getOffhandItem(), true);
            hand(pose, buffers, light, e, m.armR, e.getMainHandItem(), false);
        }

        private void hand(PoseStack pose, MultiBufferSource buffers, int light, GoldenPiglin e, BoneChain arm, ItemStack stack,
                          boolean left) {
            if (stack.isEmpty() || !arm.present()) {
                return;
            }
            pose.pushPose();
            arm.apply(pose);
            pose.mulPose(Axis.XP.rotationDegrees(-90f));
            pose.mulPose(Axis.YP.rotationDegrees(180f));
            pose.translate((left ? -1f : 1f) / 16f, 0.125f, -0.625f);
            items.renderItem(e, stack, left ? ItemDisplayContext.THIRD_PERSON_LEFT_HAND : ItemDisplayContext.THIRD_PERSON_RIGHT_HAND, left,
                    pose, buffers, light);
            pose.popPose();
        }
    }
}
