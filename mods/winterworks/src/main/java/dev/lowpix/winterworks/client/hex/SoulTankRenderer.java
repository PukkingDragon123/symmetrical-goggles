package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.hex.HexComponents;
import dev.lowpix.winterworks.hex.SoulTankBlock;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;

/**
 * The Soul Tank from the lowpix model {@code soul_tank} (examples/src/soul_tank.py). The {@code souls} bone (pivot:
 * the tank floor's centre; the idle clip spins it) scales with the fill: full height when full, gone when empty. The {@code gauge_needle} turns about Z from its rest pose (empty) up to {@link #NEEDLE_SWING} clockwise
 * (full). {@code glass} is translucent; the souls glow (the model's glow texture). Clip {@code idle} loops.
 */
public class SoulTankRenderer implements BlockEntityRenderer<SoulTankBlockEntity> {
    static final float NEEDLE_SWING = 60f * Mth.DEG_TO_RAD;
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
        if (souls != null) {   // the idle clip already spins them
            float wobble = 1f + 0.04f * Mth.sin(time * 0.15f);
            souls.xScale *= (0.55f + 0.45f * fill) * wobble;
            souls.zScale *= (0.55f + 0.45f * fill) * wobble;
            souls.yScale *= Math.max(0.001f, fill);
            souls.visible = fill > 0.005f;
        }
        ModelPart needle = m.get("gauge_needle").or(() -> m.get("needle")).orElse(null);
        if (needle != null) {
            needle.zRot += fill * NEEDLE_SWING;
        }
        pose.pushPose();
        HexRender.enterModel(pose, yRot);
        m.mask(n -> !HexRender.isGlass(n));
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        m.mask(HexRender::isGlass);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(m.texture)), light, overlay, 0xFFFFFFFF);
        m.unmask();
        HexRender.glow(m, pose, buffers);
        pose.popPose();
        if (souls != null) {
            souls.visible = true;
        }
    }

    @Override
    public boolean shouldRenderOffScreen(SoulTankBlockEntity tank) {
        return false;
    }

    /** The tank as an item, in slots too (docs/FIXES_0_4.md "3D icons"): the 3D tank as full as the souls it kept. */
    public static class Item implements BuiltinItemRendererRegistry.DynamicItemRenderer {
        @Override
        public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
            if (model().missing()) {
                HexRender.icon(HexRender.TANK_ICON, stack, mode, pose, buffers, light, overlay);
                return;
            }
            float fill = stack.getOrDefault(HexComponents.SOULS, 0) / (float) SoulTankBlockEntity.CAPACITY;
            draw(pose, buffers, light, overlay, HexRender.clientTime(), 0f, fill);
        }
    }
}
