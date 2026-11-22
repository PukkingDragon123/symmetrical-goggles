package dev.lowpix.winterworks.client.nether;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.render.WWModel;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.ItemRenderer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The Netherite Spear in 3D everywhere (in hand, on the ground, in frames, as its slot icon): the lowpix model
 * `netherite_spear`, its grip at the item origin and the blade up, posed by the item model's display transforms
 * (models/item/netherite_spear.json, written by tools/data_nether.py); the pennant flutters (its `idle` clip).
 */
public class NetheriteSpearRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    private WWModel<Entity> model;

    private WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(NetherClient.NETHERITE_SPEAR), "netherite_spear");
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        Minecraft mc = Minecraft.getInstance();
        WWModel<Entity> m = model();
        float time = (mc.level == null ? 0 : mc.level.getGameTime()) + mc.getTimer().getGameTimeDeltaPartialTick(false);
        m.reset();
        m.clip("idle", (time / 20f) % 2f);
        pose.pushPose();
        pose.translate(0.5f, 0.5f, 0.5f);
        pose.scale(1f, -1f, -1f);
        RenderType base = RenderType.entityCutoutNoCull(m.texture);
        m.renderToBuffer(pose, ItemRenderer.getFoilBufferDirect(buffers, base, false, stack.hasFoil()), light, overlay, 0xFFFFFFFF);
        pose.popPose();
    }
}
