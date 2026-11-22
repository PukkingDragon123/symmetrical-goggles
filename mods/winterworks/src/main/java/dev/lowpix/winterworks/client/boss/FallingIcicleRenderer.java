package dev.lowpix.winterworks.client.boss;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.boss.FallingIcicleEntity;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.block.BlockRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.resources.ResourceLocation;

/** Draws a falling icicle as its icicle block model, like the vanilla falling-block renderer. */
public class FallingIcicleRenderer extends EntityRenderer<FallingIcicleEntity> {
    private final BlockRenderDispatcher dispatcher;

    public FallingIcicleRenderer(EntityRendererProvider.Context ctx) {
        super(ctx);
        this.shadowRadius = 0.2f;
        this.dispatcher = ctx.getBlockRenderDispatcher();
    }

    @Override
    public void render(FallingIcicleEntity e, float yaw, float partial, PoseStack pose, MultiBufferSource buffers, int light) {
        pose.pushPose();
        pose.translate(-0.5, 0.0, -0.5);
        dispatcher.renderSingleBlock(e.blockState(), pose, buffers, light, OverlayTexture.NO_OVERLAY);
        pose.popPose();
        super.render(e, yaw, partial, pose, buffers, light);
    }

    @Override
    public ResourceLocation getTextureLocation(FallingIcicleEntity e) {
        return TextureAtlas.LOCATION_BLOCKS;
    }
}
