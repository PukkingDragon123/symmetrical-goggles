package dev.lowpix.winterworks.client.bear;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.bear.ZombiePolarBear;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;

/** The zombie polar bear: the `polar_bear` model with its zombie_* parts, the zombie texture and glowing eyes. */
public class ZombiePolarBearRenderer extends MobRenderer<ZombiePolarBear, BearModel<ZombiePolarBear>> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/zombie_polar_bear.png");
    public static final ResourceLocation GLOW = Winterworks.id("textures/entity/zombie_polar_bear_glow.png");

    public ZombiePolarBearRenderer(EntityRendererProvider.Context ctx) {
        super(ctx, new BearModel<>(ctx.bakeLayer(BearClient.POLAR_BEAR), "polar_bear"), 0.9f);
        if (BearClient.exists(GLOW)) {
            addLayer(new GlowEyesLayer<>(this, GLOW));
        }
    }

    @Override
    public ResourceLocation getTextureLocation(ZombiePolarBear bear) {
        return TEXTURE;
    }

    @Override
    protected void scale(ZombiePolarBear bear, PoseStack pose, float partial) {
        float k = RemadePolarBearRenderer.ADULT_SCALE;   // the same model as the living bear
        pose.scale(k, k, k);
    }
}
