package dev.lowpix.winterworks.client.endgear;

import com.mojang.blaze3d.vertex.PoseStack;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;
import org.joml.Vector3f;

/**
 * The Obsidian Shield, the lowpix model {@code obsidian_shield} (bones shield, handle, eye), in 3D everywhere, the GUI
 * included. It's fitted onto the vanilla shield's plate (12 x 22 px, front at z = -2 in the BEWLR shield space) so the
 * item model's display transforms, copied from vanilla shield.json and shield_blocking.json (the "blocking" override),
 * hold it exactly like a shield: at the side, raised when blocking, in either hand. The eye glances about.
 */
public class ObsidianShieldRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    /** The vanilla plate's height and the z of its front face, in pixels. */
    private static final float PLATE_HEIGHT = 22f, PLATE_FRONT = -2f;
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
        Vector3f size = m.size();
        // the face of the shield is the model's front (+Z in lowpix space); fit its height to the plate
        float s = PLATE_HEIGHT / 16f / Math.max(1e-3f, Math.max(size.y, size.x * 22f / 12f));
        Vector3f c = m.center();

        m.model.reset();
        m.loop("idle", now / 20f);
        m.model.get("eye").ifPresent(p -> {   // the eye looks about now and then
            float t = now * 0.05f;
            p.yRot += Mth.sin(t) * Mth.sin(t * 0.37f) * 0.25f;
            p.xRot += Mth.cos(t * 0.8f) * 0.12f;
        });

        pose.pushPose();
        pose.scale(1f, -1f, -1f);   // the BEWLR shield space (vanilla draws its ShieldModel here)
        // lowpix (Y up, front +Z) -> shield space (Y down, front -Z): flip y and z, centre on the plate, front at z = -2 px
        pose.translate(0f, 0f, PLATE_FRONT / 16f);
        pose.scale(s, -s, -s);
        pose.translate(-c.x, -c.y, -m.max.z);
        m.draw(pose, buffers, light, overlay, stack.hasFoil(), m.standIn ? 0xFF6A4E8A : 0xFFFFFFFF);
        pose.popPose();
    }
}
