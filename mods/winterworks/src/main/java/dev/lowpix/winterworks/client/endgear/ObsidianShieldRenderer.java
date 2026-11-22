package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;

/**
 * The Obsidian Shield, the lowpix model {@code obsidian_shield} (bones shield, handle, eye; the {@code idle} clip lets the
 * eye glance about), in 3D everywhere, the GUI included. The model is authored on the vanilla ShieldModel's layout (plate
 * front at z -2 px, handle from z -1 to 5), so it is drawn exactly where vanilla's BEWLR draws the shield, and the item
 * model's display transforms, copied from vanilla shield.json and shield_blocking.json (the "blocking" override), hold
 * it like a shield: at the side, raised when blocking, in either hand.
 */
public class ObsidianShieldRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    @Nullable private GearModel model;

    private GearModel model() {
        if (model == null) {
            model = new GearModel(GearLayers.OBSIDIAN_SHIELD, "obsidian_shield", GearModel.vanilla("textures/block/obsidian.png"));
        }
        return model;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        GearModel m = model();
        Minecraft mc = Minecraft.getInstance();
        float now = (mc.level == null ? 0 : mc.level.getGameTime()) + mc.getTimer().getGameTimeDeltaPartialTick(false);
        m.model.reset();
        m.loop("idle", now / 20f);
        pose.pushPose();
        pose.scale(1f, -1f, -1f);   // the BEWLR shield space: vanilla draws its ShieldModel here
        m.drawModelSpace(pose, buffers, light, overlay, stack.hasFoil(), 0xFFFFFFFF);
        pose.popPose();
    }
}
