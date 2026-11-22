package dev.lowpix.winterworks.client.express;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.CoasterLoopBlock;
import dev.lowpix.winterworks.express.LoopMotion;
import dev.lowpix.winterworks.express.RailPaint;
import java.util.function.Function;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.Sheets;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;

/**
 * The Coaster Loop: a full vertical loop of coaster track, 16 {@code coaster_rail_loop_segment} pieces round a circle
 * of radius 3 (LoopMotion.RADIUS) with the ride surface on the inside, the bottom piece on the loop block lined up
 * with the coaster rails either side. Each piece is lit by the light where it is; the sleepers take the rail's paint.
 */
public class CoasterLoopRenderer implements BlockEntityRenderer<CoasterLoopBlock.CoasterLoopBlockEntity> {
    public static final ResourceLocation SEGMENT = Winterworks.id("block/coaster_rail_loop_segment");
    public static final int SEGMENTS = 16;

    public CoasterLoopRenderer(BlockEntityRendererProvider.Context ctx) {}

    @Override
    public void render(CoasterLoopBlock.CoasterLoopBlockEntity be, float partial, PoseStack pose, MultiBufferSource buffers, int light,
                       int overlay) {
        Level level = be.getLevel();
        BlockState state = be.getBlockState();
        BlockPos origin = be.getBlockPos();
        draw(pose, buffers.getBuffer(Sheets.cutoutBlockSheet()), CoasterLoopBlock.alongX(state), RailPaint.tint(state), overlay,
                local -> level == null ? light : LevelRenderer.getLightColor(level, BlockPos.containing(Vec3.atLowerCornerOf(origin).add(local))));
    }

    /** Draws the loop in block-local coordinates (the loop block at 0..1). `lightAt` gets each piece's local centre. */
    static void draw(PoseStack pose, VertexConsumer vc, boolean alongX, int rgb, int overlay, Function<Vec3, Integer> lightAt) {
        Minecraft mc = Minecraft.getInstance();
        BakedModel model = mc.getModelManager().getModel(SEGMENT);
        var renderer = mc.getBlockRenderer().getModelRenderer();
        float r = (rgb >> 16 & 255) / 255f, g = (rgb >> 8 & 255) / 255f, b = (rgb & 255) / 255f;
        double ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
        Vec3 centre = new Vec3(0.5, LoopMotion.RIDE + LoopMotion.RADIUS, 0.5);
        for (int k = 0; k < SEGMENTS; k++) {
            float th = (float) (Math.PI * 2 * k / SEGMENTS);
            Vec3 up = new Vec3(-ax * Math.sin(th), Math.cos(th), -az * Math.sin(th));   // toward the loop's centre
            Vec3 at = centre.subtract(up.scale(LoopMotion.RADIUS));
            pose.pushPose();
            pose.translate(at.x, at.y, at.z);
            pose.mulPose(new Quaternionf().rotationAxis(th, (float) -az, 0f, (float) ax));
            if (alongX) {
                pose.mulPose(Axis.YP.rotationDegrees(90f));
            }
            pose.translate(-0.5f, -0.5f, -0.5f);   // the piece's ride surface is centred on (8, 8, 8)
            renderer.renderModel(pose.last(), vc, null, model, r, g, b, lightAt.apply(at), overlay);
            pose.popPose();
        }
    }

    /** Taller than its block: never culled with the loop block's chunk section. */
    @Override
    public boolean shouldRenderOffScreen(CoasterLoopBlock.CoasterLoopBlockEntity be) {
        return true;
    }

    @Override
    public int getViewDistance() {
        return 128;
    }

    /** The item: the whole loop in miniature. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            pose.pushPose();
            float s = 1f / 6.9f;
            pose.translate(0.5f, 0.03f, 0.5f);
            pose.scale(s, s, s);
            pose.translate(-0.5f, 0f, -0.5f);
            draw(pose, buffers.getBuffer(Sheets.cutoutBlockSheet()), false, 0x8A6B47, overlay, at -> light);
            pose.popPose();
        }
    }
}
