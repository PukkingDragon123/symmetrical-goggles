package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.WWLayers;
import dev.lowpix.winterworks.launcher.SnowballLauncherItem;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The launcher in hand: the animated 3D model (spinning drum, recoil kick, charging piston, heat needle, overheat
 * shake). In inventory slots it draws the 2D pixel-art icon instead.
 */
public class LauncherItemRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    public static final ResourceLocation ICON_MODEL = Winterworks.id("item/snowball_launcher_icon");
    private WWModel<Entity> model;
    private float drumAngle, drumSpeed;
    private long lastFrame;

    private WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(WWLayers.LAUNCHER), "snowball_launcher");
        }
        return model;
    }

    public void reload() {
        model = null;
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        Minecraft mc = Minecraft.getInstance();
        if (mode == ItemDisplayContext.GUI) {
            BakedModel icon = mc.getModelManager().getModel(ICON_MODEL);
            pose.pushPose();
            pose.translate(0.5f, 0.5f, 0.5f);
            mc.getItemRenderer().render(stack, mode, false, pose, buffers, light, overlay, icon);
            pose.popPose();
            return;
        }
        WWModel<Entity> m = model();
        LocalPlayer player = mc.player;
        float partial = mc.getTimer().getGameTimeDeltaPartialTick(false);
        long now = mc.level == null ? 0 : mc.level.getGameTime();
        float t = now + partial;
        boolean firstPerson = mode.firstPerson();
        boolean using = player != null && player.isUsingItem() && player.getUseItem() == stack;
        long[] fx = player == null ? null : SnowballLauncherItem.FX.get(player);
        float sinceShot = fx == null ? 999f : (t - fx[0]) / 20f;
        boolean heavy = fx != null && fx[1] == 1;
        int heat = SnowballLauncherItem.heat(stack);
        boolean over = SnowballLauncherItem.overheated(stack);
        int modeId = SnowballLauncherItem.mode(stack);

        // drum: spins up while firing, coasts down after
        long frame = System.nanoTime();
        float dt = lastFrame == 0 ? 0f : Math.min(0.1f, (frame - lastFrame) / 1.0e9f);
        lastFrame = frame;
        float targetSpeed = (firstPerson && sinceShot < 0.25f && !heavy) ? 26f : 0f;
        drumSpeed += (targetSpeed - drumSpeed) * Math.min(1f, dt * (targetSpeed > drumSpeed ? 10f : 2.2f));
        drumAngle = (drumAngle + drumSpeed * dt) % (Mth.TWO_PI);

        m.reset();
        m.clip("idle", (t / 20f) % 2.0f);
        if (over) {
            m.clip("overheat", (t / 20f) % 0.8f);
        }
        if (firstPerson && using && modeId == SnowballLauncherItem.MODE_COBBLE && player != null) {
            m.clip("charge", Math.min(1f, player.getTicksUsingItem() / (float) SnowballLauncherItem.CHARGE_TICKS));
        }
        if (firstPerson && sinceShot < 0.3f) {
            m.clip("fire", sinceShot * (heavy ? 0.7f : 1f));
        }
        m.get("drum").ifPresent(p -> p.zRot += drumAngle);
        m.get("needle").ifPresent(p -> p.xRot -= heat / 100f * 2.3f + (over ? Mth.sin(t * 2.1f) * 0.12f : 0f));
        m.get("crank").ifPresent(p -> p.xRot += drumAngle * 0.5f);
        m.show("snowballs", modeId == SnowballLauncherItem.MODE_SNOW);
        m.show("cobble", modeId == SnowballLauncherItem.MODE_COBBLE);

        pose.pushPose();
        if (firstPerson && sinceShot < 0.2f) {   // extra kick of the whole gun into the hand
            float k = (1f - sinceShot / 0.2f) * (heavy ? 0.12f : 0.035f);
            pose.translate(0, k * 0.4f, k);
            pose.mulPose(com.mojang.math.Axis.XP.rotationDegrees(-k * 90f));
        }
        if (over) {
            pose.translate(Mth.sin(t * 3.7f) * 0.006f, Mth.cos(t * 4.3f) * 0.006f, 0);
        }
        pose.translate(0.5f, 1.5f, 0.5f);
        pose.scale(-1f, -1f, 1f);
        m.renderAll(pose, buffers, light, overlay, 0xFFFFFF, 0xFFFFFF, RenderType.entityCutoutNoCull(m.texture));
        pose.popPose();
    }
}
