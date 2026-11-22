package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;

/** Shared bits of the hex renderers: the lowpix block transform, colours, 2D icons and the vanilla stand-in. */
final class HexRender {
    static final int SOUL_BLUE = 0x5FD8EE;
    static final ResourceLocation JAR_ICON = Winterworks.id("item/elixir_jar_icon");
    static final ResourceLocation TANK_ICON = Winterworks.id("item/soul_tank_icon");
    static final ResourceLocation TABLE_ICON = Winterworks.id("item/hexing_table_icon");

    private HexRender() {}

    /** Into lowpix model space for a block at the origin, front toward `yRot` degrees (like SnowGlobeRenderer). */
    static void enterModel(PoseStack pose, float yRot) {
        pose.translate(0.5, 0, 0.5);
        pose.mulPose(Axis.YP.rotationDegrees(yRot + 180f));
        pose.translate(0, 1.5, 0);
        pose.scale(-1f, -1f, 1f);
    }

    /** While a lowpix export is missing: a vanilla block in its place, so the block is never invisible. */
    static void standIn(BlockState state, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        Minecraft.getInstance().getBlockRenderer().renderSingleBlock(state, pose, buffers, light, overlay);
    }

    /** A hex item's 2D icon, while its 3D model is missing. */
    static void icon(ResourceLocation iconModel, ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers,
                     int light, int overlay) {
        Minecraft mc = Minecraft.getInstance();
        BakedModel icon = mc.getModelManager().getModel(iconModel);
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);
        mc.getItemRenderer().render(stack, mode == ItemDisplayContext.GUI ? mode : ItemDisplayContext.NONE, false, pose, buffers, light,
                overlay, icon);
        pose.popPose();
    }

    static float clientTime() {
        Minecraft mc = Minecraft.getInstance();
        return mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
    }

    static int argb(int alpha, int rgb) {
        return (Mth.clamp(alpha, 0, 255) << 24) | (rgb & 0xFFFFFF);
    }

    static int lerpRgb(float t, int a, int b) {
        t = Mth.clamp(t, 0f, 1f);
        int r = (int) Mth.lerp(t, (a >> 16) & 255, (b >> 16) & 255);
        int g = (int) Mth.lerp(t, (a >> 8) & 255, (b >> 8) & 255);
        int bl = (int) Mth.lerp(t, a & 255, b & 255);
        return (r << 16) | (g << 8) | bl;
    }

    static int scale(int rgb, float k) {
        int r = (int) Mth.clamp(((rgb >> 16) & 255) * k, 0, 255);
        int g = (int) Mth.clamp(((rgb >> 8) & 255) * k, 0, 255);
        int b = (int) Mth.clamp((rgb & 255) * k, 0, 255);
        return (r << 16) | (g << 8) | b;
    }

    static void glow(HexModel m, PoseStack pose, MultiBufferSource buffers) {
        if (m.hasGlow) {
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        }
    }

    static boolean isGlass(String part) {
        return part.startsWith("glass");
    }
}
