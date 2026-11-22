package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.nether.PiglinGreed;
import net.minecraft.client.model.PiglinModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Mob;

/**
 * The golden shimmer of a piglin that drank Cursed Elixir: the piglin model drawn once more over itself in vanilla's
 * gold block texture, translucent, with the gold slowly pulsing. One extra pass of the same model: cheap.
 */
public class GoldenShimmerLayer extends RenderLayer<Mob, PiglinModel<Mob>> {
    private static final ResourceLocation GOLD = ResourceLocation.withDefaultNamespace("textures/block/gold_block.png");

    public GoldenShimmerLayer(RenderLayerParent<Mob, PiglinModel<Mob>> parent) {
        super(parent);
    }

    @Override
    public void render(PoseStack pose, MultiBufferSource buffers, int light, Mob mob, float limbSwing, float limbAmount, float partial,
                       float age, float headYaw, float headPitch) {
        if (mob.isInvisible() || !PiglinGreed.isGolden(mob)) {
            return;
        }
        float pulse = 0.55f + 0.15f * Mth.sin((age + mob.getId() * 7) * 0.1f);
        int color = ((int) (pulse * 255f) << 24) | 0xFFFFFF;
        getParentModel().renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(GOLD)), light, OverlayTexture.NO_OVERLAY,
                color);
    }
}
