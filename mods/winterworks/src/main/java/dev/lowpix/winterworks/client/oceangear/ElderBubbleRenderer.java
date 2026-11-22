package dev.lowpix.winterworks.client.oceangear;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.oceangear.ElderBubble;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;

/**
 * The Elder Guardian's bubble: a full-bright billboard ({@code entity/elder_bubble.png}, 4 shimmer frames stacked in
 * 32x128) that wobbles as it drifts; once it catches someone it swells round them, quivering harder as it nears
 * popping.
 */
public class ElderBubbleRenderer extends EntityRenderer<ElderBubble> {
    public static final ResourceLocation TEXTURE = Winterworks.id("textures/entity/elder_bubble.png");

    public ElderBubbleRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        shadowRadius = 0f;
    }

    @Override
    public ResourceLocation getTextureLocation(ElderBubble e) {
        return TEXTURE;
    }

    @Override
    public void render(ElderBubble e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        float age = e.tickCount + partial;
        Entity held = e.trapped();
        float size;
        float cy;
        float quiver;
        if (held != null) {
            float k = Math.min(1f, (e.tickCount + partial) / 4f);   // it swells round them
            size = Mth.lerp(k, 0.9f, Math.max(held.getBbWidth(), held.getBbHeight()) * 1.25f);
            cy = e.getBbHeight() * 0.5f;
            quiver = 0.04f + 0.08f * Math.min(1f, e.trapTicks() / (float) ElderBubble.TRAP_TICKS);
        } else {
            size = 0.95f;
            cy = 0.4f;
            quiver = 0.06f;
        }
        float sx = size * (1f + quiver * Mth.sin(age * 0.9f)), sy = size * (1f - quiver * Mth.sin(age * 0.9f + 0.6f));
        int frame = ((e.tickCount + e.getId()) / 3) & 3;
        float v0 = frame / 4f, v1 = v0 + 0.25f;
        pose.pushPose();
        pose.translate(0, cy, 0);
        pose.mulPose(entityRenderDispatcher.cameraOrientation());
        pose.scale(sx, sy, 1f);
        PoseStack.Pose p = pose.last();
        VertexConsumer vc = buffers.getBuffer(RenderType.entityTranslucent(TEXTURE));
        int a = held != null ? 235 : 255;
        quad(vc, p, -0.5f, -0.5f, 0f, v1, a);
        quad(vc, p, 0.5f, -0.5f, 1f, v1, a);
        quad(vc, p, 0.5f, 0.5f, 1f, v0, a);
        quad(vc, p, -0.5f, 0.5f, 0f, v0, a);
        pose.popPose();
        super.render(e, yaw, partial, pose, buffers, light);
    }

    private static void quad(VertexConsumer vc, PoseStack.Pose p, float x, float y, float u, float v, int a) {
        vc.addVertex(p, x, y, 0f).setColor(255, 255, 255, a).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(0xF000F0)
                .setNormal(p, 0f, 1f, 0f);
    }
}
