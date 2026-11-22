package dev.lowpix.winterworks.client.bear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.bear.BearLike;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.animal.PolarBear;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * Every vanilla polar bear, drawn with the lowpix `polar_bear` (adults) and `polar_bear_cub` models: full fur, shorn
 * (short-fur texture, fur parts hidden) or cub textures, and the fish some carry in their mouths.
 */
public class RemadePolarBearRenderer extends MobRenderer<PolarBear, BearModel<PolarBear>> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/polar_bear.png");
    public static final ResourceLocation SHEARED = Winterworks.id("textures/entity/polar_bear_sheared.png");
    public static final ResourceLocation CUB = Winterworks.id("textures/entity/polar_bear_cub.png");
    /** Model scales: the adult model is bigger than the 1.4-block hitbox, the cub model is made at about twice in-game size. */
    public static final float ADULT_SCALE = 0.85f, CUB_SCALE = 0.55f;

    private final BearModel<PolarBear> adult, cub;
    private final ResourceLocation sheared;

    public RemadePolarBearRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new BearModel<>(ctx.bakeLayer(BearClient.POLAR_BEAR), "polar_bear"), 0.9f);
        adult = model;
        cub = BearClient.hasModel("polar_bear_cub") ? new BearModel<>(ctx.bakeLayer(BearClient.POLAR_BEAR_CUB), "polar_bear_cub") : adult;
        sheared = BearClient.exists(SHEARED) ? SHEARED : TEXTURE;
        addLayer(new CarriedFishLayer(this, ctx.getItemInHandRenderer()));
    }

    @Override
    public ResourceLocation getTextureLocation(PolarBear bear) {
        if (bear.isBaby() && cub != adult) {
            return CUB;
        }
        return ((BearLike) bear).ww$isShorn() ? sheared : TEXTURE;
    }

    @Override
    public void render(PolarBear bear, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        model = bear.isBaby() ? cub : adult;
        shadowRadius = bear.isBaby() ? 0.5f : 0.9f;
        super.render(bear, yaw, partial, pose, buffers, light);
    }

    @Override
    protected void scale(PolarBear bear, PoseStack pose, float partial) {
        float k = bear.isBaby() ? (cub != adult ? CUB_SCALE : ADULT_SCALE * 0.5f) : ADULT_SCALE;
        pose.scale(k, k, k);
    }

    /** The carried fish (salmon or cod), hanging from the jaws at the mouth_item locator (follows the head and jaw clips). */
    static class CarriedFishLayer extends RenderLayer<PolarBear, BearModel<PolarBear>> {
        private final ItemInHandRenderer items;

        CarriedFishLayer(RenderLayerParent<PolarBear, BearModel<PolarBear>> parent, ItemInHandRenderer items) {
            super(parent);
            this.items = items;
        }

        @Override
        public void render(PoseStack pose, MultiBufferSource buffers, int light, PolarBear bear, float limbSwing, float limbAmount,
                           float partial, float age, float headYaw, float headPitch) {
            BearModel<PolarBear> m = getParentModel();
            ItemStack fish = ((BearLike) bear).ww$carried();
            if (bear.isBaby() || fish.isEmpty() || !m.hasMouth()) {
                return;
            }
            pose.pushPose();
            m.toMouth(pose);
            // in profile, hanging forward and a little down out of the jaws: it reads best from the side, the usual view
            // (held straight across the jaws, a fish is edge-on from the side)
            pose.translate(0.0f, 0.08f, -0.16f);                // model space is Y down, -Z ahead: below and ahead of the locator
            pose.mulPose(Axis.ZP.rotationDegrees(180f));        // upright for the item renderer
            pose.mulPose(Axis.YP.rotationDegrees(90f));         // the sprite faces sideways
            pose.mulPose(Axis.ZP.rotationDegrees(-75f));        // the sprite is diagonal: level it, then droop the head 30 degrees
            items.renderItem(bear, fish, ItemDisplayContext.GROUND, false, pose, buffers, light);
            pose.popPose();
        }
    }
}
