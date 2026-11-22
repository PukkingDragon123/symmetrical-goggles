package dev.lowpix.winterworks.client.endmob;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.endmob.GuckerSpit;
import net.minecraft.client.model.LlamaSpitModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/** The Gucker's spit: a clump of grey-violet dust (vanilla's llama spit model, bigger and tinted), trailing dust. */
public class GuckerSpitRenderer extends EntityRenderer<GuckerSpit> {
    private static final ResourceLocation TEXTURE = ResourceLocation.withDefaultNamespace("textures/entity/llama/spit.png");
    private final LlamaSpitModel<GuckerSpit> model;

    public GuckerSpitRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        this.model = new LlamaSpitModel<>(ctx.bakeLayer(ModelLayers.LLAMA_SPIT));
    }

    @Override
    public void render(GuckerSpit e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        pose.pushPose();
        pose.translate(0f, 0.2f, 0f);
        pose.mulPose(Axis.YP.rotationDegrees(Mth.lerp(partial, e.yRotO, e.getYRot()) - 90f));
        pose.mulPose(Axis.ZP.rotationDegrees((e.tickCount + partial) * 25f));
        pose.scale(2.4f, 2.4f, 2.4f);
        model.setupAnim(e, partial, 0f, -0.1f, 0f, 0f);
        model.renderToBuffer(pose, buffers.getBuffer(model.renderType(TEXTURE)), light, OverlayTexture.NO_OVERLAY, 0xFFB4A8C4);
        pose.popPose();
        super.render(e, yaw, partial, pose, buffers, light);
    }

    @Override
    public ResourceLocation getTextureLocation(GuckerSpit e) {
        return TEXTURE;
    }
}
