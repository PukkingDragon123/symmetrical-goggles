package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.nether.PiglinGreed;
import net.minecraft.client.model.PiglinModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Mob;

/**
 * The golden shimmer of a piglin or brute that drank Cursed Elixir: the model drawn once more over itself in vanilla's
 * gold block texture, translucent, slowly pulsing. While it gilds (PiglinGreed.gilding, synced) the gold spreads up
 * its body: the legs first, then the body, the arms, and last the head, each part fading in as the gold reaches it.
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
        float g = PiglinGreed.gilding(mob);
        float pulse = 0.55f + 0.15f * Mth.sin((age + mob.getId() * 7) * 0.1f);
        PiglinModel<Mob> m = getParentModel();
        VertexConsumer vc = buffers.getBuffer(RenderType.entityTranslucent(GOLD));
        if (g >= 1f || m.young) {
            m.renderToBuffer(pose, vc, light, OverlayTexture.NO_OVERLAY, color(pulse));
            return;
        }
        part(m.rightLeg, pose, vc, light, pulse, g, 0.0f);
        part(m.leftLeg, pose, vc, light, pulse, g, 0.0f);
        part(m.body, pose, vc, light, pulse, g, 0.25f);
        part(m.rightArm, pose, vc, light, pulse, g, 0.45f);
        part(m.leftArm, pose, vc, light, pulse, g, 0.45f);
        part(m.head, pose, vc, light, pulse, g, 0.65f);
    }

    /** One part, fading in as the gold reaches it (at `from`, full a quarter of the way on). */
    private static void part(ModelPart p, PoseStack pose, VertexConsumer vc, int light, float pulse, float g, float from) {
        float k = Mth.clamp((g - from) / 0.25f, 0f, 1f);
        if (k > 0f && p.visible) {
            p.render(pose, vc, light, OverlayTexture.NO_OVERLAY, color(pulse * (0.3f + 0.7f * k)));
        }
    }

    private static int color(float alpha) {
        return ((int) (Mth.clamp(alpha, 0f, 1f) * 255f) << 24) | 0xFFFFFF;
    }
}
