package dev.lowpix.winterworks.client.endmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.endmob.GuckerSpit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;

/**
 * The Gucker's spit: a ball of blinding dust, drawn as a camera-facing puff with the `blinding_dust` particle frames
 * (vanilla's generic smoke puffs, tinted, until that art is there), slowly turning, trailing dust (GuckerSpit).
 */
public class GuckerSpitRenderer extends EntityRenderer<GuckerSpit> {
    private static final int FRAMES = 4;
    private final ResourceLocation[] frames = new ResourceLocation[FRAMES];
    private final boolean own;

    public GuckerSpitRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        boolean art = Minecraft.getInstance().getResourceManager().getResource(Winterworks.id("textures/particle/blinding_dust_0.png")).isPresent();
        for (int i = 0; i < FRAMES; i++) {
            frames[i] = art ? Winterworks.id("textures/particle/blinding_dust_" + i + ".png")
                    : ResourceLocation.withDefaultNamespace("textures/particle/generic_" + (7 - i) + ".png");
        }
        own = art;
    }

    @Override
    public void render(GuckerSpit e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        float age = e.tickCount + partial;
        pose.pushPose();
        pose.translate(0f, e.getBbHeight() / 2f, 0f);
        pose.mulPose(entityRenderDispatcher.cameraOrientation());
        pose.mulPose(Axis.ZP.rotationDegrees(age * 12f));
        float s = 0.7f;
        pose.scale(s, s, s);
        int color = own ? 0xFFFFFFFF : 0xFFB8AECA;
        VertexConsumer vc = buffers.getBuffer(RenderType.entityTranslucent(frames[(e.tickCount / 3) % FRAMES]));
        PoseStack.Pose p = pose.last();
        vertex(vc, p, light, color, -0.5f, -0.5f, 0, 1);
        vertex(vc, p, light, color, 0.5f, -0.5f, 1, 1);
        vertex(vc, p, light, color, 0.5f, 0.5f, 1, 0);
        vertex(vc, p, light, color, -0.5f, 0.5f, 0, 0);
        pose.popPose();
        super.render(e, yaw, partial, pose, buffers, light);
    }

    private static void vertex(VertexConsumer vc, PoseStack.Pose p, int light, int color, float x, float y, float u, float v) {
        vc.addVertex(p, x, y, 0f).setColor(color).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(p, 0f, 1f, 0f);
    }

    @Override
    public ResourceLocation getTextureLocation(GuckerSpit e) {
        return frames[0];
    }
}
