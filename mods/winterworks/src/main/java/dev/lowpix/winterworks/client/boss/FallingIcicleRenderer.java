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
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;

/**
 * Draws a falling icicle as its icicle block model, like the vanilla falling-block renderer. A thrown one flies
 * point-first: the model's tip (its bottom) is turned to face along its flight.
 */
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
        if (e.isThrown()) {
            Vec3 v = e.getDeltaMovement();
            if (v.lengthSqr() < 1e-6) {
                v = new Vec3(e.getX() - e.xo, e.getY() - e.yo, e.getZ() - e.zo);
            }
            if (v.lengthSqr() > 1e-6) {
                v = v.normalize();
                pose.translate(0, 0.45, 0);   // turn about the middle of its box
                pose.mulPose(new Quaternionf().rotationTo(0f, -1f, 0f, (float) v.x, (float) v.y, (float) v.z));
                pose.translate(0, -0.5, 0);
            }
        }
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
