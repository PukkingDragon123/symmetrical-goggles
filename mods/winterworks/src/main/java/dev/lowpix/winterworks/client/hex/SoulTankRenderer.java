package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.hex.HexComponents;
import dev.lowpix.winterworks.hex.SoulTankBlock;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;

/**
 * The Soul Tank from the lowpix model {@code soul_tank}. The {@code souls} bone (and children) spins about its pivot
 * (the bottom centre of the tank's inside) and scales with the fill: full height when full, gone when empty; they glow
 * and pulse. The {@code needle} bone turns about Z from -70 degrees (empty) to +70 (full) on its gauge; {@code glass*}
 * parts draw translucent. Clip {@code idle} loops always.
 */
public class SoulTankRenderer implements BlockEntityRenderer<SoulTankBlockEntity> {
    static final float NEEDLE_SWING = 70f * Mth.DEG_TO_RAD;
    private static HexModel model;

    public SoulTankRenderer(BlockEntityRendererProvider.Context ctx) {
        model = new HexModel(HexLayers.SOUL_TANK, "soul_tank");
    }

    static HexModel model() {
        if (model == null) {
            model = new HexModel(HexLayers.SOUL_TANK, "soul_tank");
        }
        return model;
    }

    @Override
    public void render(SoulTankBlockEntity tank, float partial, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        float time = (tank.getLevel() == null ? 0 : tank.getLevel().getGameTime()) + partial;
        float yRot = tank.getBlockState().hasProperty(SoulTankBlock.FACING) ? -tank.getBlockState().getValue(SoulTankBlock.FACING).toYRot() : 0f;
        draw(pose, buffers, light, overlay, time, yRot, Mth.lerp(partial, tank.oShownFill, tank.shownFill));
    }

    static void draw(PoseStack pose, MultiBufferSource buffers, int light, int overlay, float time, float yRot, float fill) {
        HexModel m = model();
        if (m.missing()) {
            HexRender.standIn(Blocks.TINTED_GLASS.defaultBlockState(), pose, buffers, light, overlay);
            return;
        }
        m.reset();
        m.loop("idle", time / 20f);
        ModelPart souls = m.get("souls").orElse(null);
        if (souls != null) {
            souls.yRot += time * (0.03f + 0.05f * fill);
            float wobble = 1f + 0.04f * Mth.sin(time * 0.15f);
            souls.xScale *= (0.55f + 0.45f * fill) * wobble;
            souls.zScale *= (0.55f + 0.45f * fill) * wobble;
            souls.yScale *= Math.max(0.001f, fill);
            souls.visible = fill > 0.005f;
        }
        m.get("needle").ifPresent(n -> n.zRot += Mth.lerp(fill, -NEEDLE_SWING, NEEDLE_SWING) + 0.02f * Mth.sin(time * 0.7f) * fill);
        pose.pushPose();
        HexRender.enterModel(pose, yRot);
        m.mask(n -> !HexRender.isGlass(n) && !n.startsWith("souls"));
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        if (souls != null && souls.visible) {
            m.mask(n -> n.startsWith("souls"));
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), 0xF000F0, overlay, 0xD0FFFFFF);
            float pulse = 0.45f + 0.25f * Mth.sin(time * 0.11f);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.texture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    HexRender.argb(255, HexRender.scale(HexRender.SOUL_BLUE, pulse)));
        }
        m.mask(HexRender::isGlass);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), light, overlay, 0xFFFFFFFF);
        m.unmask();
        HexRender.glow(m, pose, buffers);
        pose.popPose();
    }

    @Override
    public boolean shouldRenderOffScreen(SoulTankBlockEntity tank) {
        return false;
    }

    /** The tank as an item: as full as the souls it kept when it was broken. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            Minecraft mc = Minecraft.getInstance();
            float time = mc.level == null ? 0 : mc.level.getGameTime() + mc.getTimer().getGameTimeDeltaPartialTick(false);
            float fill = stack.getOrDefault(HexComponents.SOULS, 0) / (float) SoulTankBlockEntity.CAPACITY;
            draw(pose, buffers, light, overlay, time, 0f, fill);
        }
    }
}
