package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The Hex Core in 3D from the lowpix model {@code hex_core}: the {@code cage}, the {@code souls} and the {@code core}
 * (three roots on one pivot) turn and swirl in its {@code idle} clip; the souls glow (its glow texture). About a block
 * tall, standing on the item's floor. In slots (and while the model is missing) it shows the 2D icon.
 */
public class HexCoreRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    public static final ResourceLocation ICON_MODEL = Winterworks.id("item/hex_core_icon");
    private HexModel model;

    private HexModel model() {
        if (model == null) {
            model = new HexModel(HexLayers.HEX_CORE, "hex_core");
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        HexModel m = model();
        if (m.missing() || mode == ItemDisplayContext.GUI) {
            HexRender.icon(ICON_MODEL, stack, mode, pose, buffers, light, overlay);
            return;
        }
        m.reset();
        m.loop("idle", HexRender.clientTime() / 20f);
        pose.pushPose();
        pose.translate(0.5f, 1.5f - 0.75f / 16f, 0.5f);   // 17.5 px tall: centred on the 16 px item cell
        pose.scale(-1f, -1f, 1f);
        m.renderToBuffer(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(m.texture)), light, overlay, 0xFFFFFFFF);
        HexRender.glow(m, pose, buffers);
        pose.popPose();
    }
}
