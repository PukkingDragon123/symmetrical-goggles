package dev.lowpix.winterworks.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.WWLayers;
import dev.lowpix.winterworks.launcher.SnowballLauncherItem;
import net.fabricmc.fabric.api.client.rendering.v1.BuiltinItemRendererRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;

/**
 * The launcher in hand, with no HUD: everything you need to know is on the gun.
 * The hopper shows the loaded snowballs (or cobble balls) one by one; firing pops them off the top, refilling drops
 * them in with a bounce, swapping ammo tips the old load out and the new one in. The drum spins up while firing,
 * the crank turns with it, the needle reads the heat, the barrels glow red-hot as heat builds, the vent opens,
 * and the whole thing judders when it overheats. In inventory slots it shows the 2D pixel-art icon.
 */
public class LauncherItemRenderer implements BuiltinItemRendererRegistry.DynamicItemRenderer {
    public static final ResourceLocation ICON_MODEL = Winterworks.id("item/snowball_launcher_icon");
    private static final int SNOW_BALLS = 6, COBBLE_BALLS = 3;
    private WWModel<Entity> model;
    private float drumAngle, drumSpeed;
    private long lastFrame;
    // magazine animation state (the local player's launcher)
    private int lastMode = -1, lastLoaded = -1, swapOldMode, swapOldLoaded;
    private float swapStart = -100f, loadStart = -100f;

    private WWModel<Entity> model() {
        if (model == null) {
            model = new WWModel<>(Minecraft.getInstance().getEntityModels().bakeLayer(WWLayers.LAUNCHER), "snowball_launcher");
        }
        return model;
    }

    private static boolean isBarrel(String n) {
        return n.startsWith("barrel") || n.startsWith("deco_muzzle");
    }

    @Override
    public void render(ItemStack stack, ItemDisplayContext mode, PoseStack pose, MultiBufferSource buffers, int light, int overlay) {
        Minecraft mc = Minecraft.getInstance();

        WWModel<Entity> m = model();
        LocalPlayer player = mc.player;
        float partial = mc.getTimer().getGameTimeDeltaPartialTick(false);
        float t = (mc.level == null ? 0 : mc.level.getGameTime()) + partial;
        boolean firstPerson = mode.firstPerson();
        boolean using = player != null && player.isUsingItem() && player.getUseItem() == stack;
        long[] fx = player == null ? null : SnowballLauncherItem.FX.get(player);
        float sinceShot = fx == null ? 999f : (t - fx[0]) / 20f;
        boolean heavy = fx != null && fx[1] == 1;
        float heat = SnowballLauncherItem.heat(stack) / 100f;
        boolean over = SnowballLauncherItem.overheated(stack);
        int ammoMode = SnowballLauncherItem.mode(stack);
        int loaded = SnowballLauncherItem.loaded(stack);

        // magazine events (first person only: that's the stack we can follow from frame to frame)
        if (firstPerson) {
            if (lastMode >= 0 && ammoMode != lastMode) {
                swapStart = t;
                swapOldMode = lastMode;
                swapOldLoaded = lastLoaded;
            } else if (lastLoaded >= 0 && loaded > lastLoaded && ammoMode == lastMode) {
                loadStart = t;
            }
            lastMode = ammoMode;
            lastLoaded = loaded;
        }
        float sinceSwap = (t - swapStart) / 20f, sinceLoad = (t - loadStart) / 20f;

        // drum: spins up while firing, coasts down after
        long frame = System.nanoTime();
        float dt = lastFrame == 0 ? 0f : Math.min(0.1f, (frame - lastFrame) / 1.0e9f);
        lastFrame = frame;
        float targetSpeed = (firstPerson && sinceShot < 0.25f && !heavy) ? 26f : (firstPerson && sinceSwap < 0.6f ? -12f : 0f);
        drumSpeed += (targetSpeed - drumSpeed) * Math.min(1f, dt * (Math.abs(targetSpeed) > Math.abs(drumSpeed) ? 10f : 2.2f));
        drumAngle = (drumAngle + drumSpeed * dt) % Mth.TWO_PI;

        m.reset();
        m.clip("idle", (t / 20f) % 2.0f);
        if (over) {
            m.clip("overheat", (t / 20f) % 0.8f);
        }
        if (firstPerson && using && ammoMode == SnowballLauncherItem.MODE_COBBLE && player != null) {
            m.clip("charge", Math.min(1f, player.getTicksUsingItem() / (float) SnowballLauncherItem.CHARGE_TICKS));
        }
        if (firstPerson && sinceShot < 0.3f) {
            m.clip("fire", sinceShot * (heavy ? 0.7f : 1f));
        }
        boolean swapping = firstPerson && sinceSwap < 0.9f;
        if (swapping) {
            m.clip("swap", sinceSwap);
        } else if (firstPerson && sinceLoad < 0.25f) {
            m.clip("load", sinceLoad);
        }
        // which ammo shows: during the first half of a swap the old load is still flying out
        int showMode = swapping && sinceSwap < 0.45f ? swapOldMode : ammoMode;
        int showCount = swapping && sinceSwap < 0.45f ? swapOldLoaded : loaded;
        m.show("snowballs", showMode == SnowballLauncherItem.MODE_SNOW);
        m.show("cobble", showMode == SnowballLauncherItem.MODE_COBBLE);
        for (int k = 0; k < SNOW_BALLS; k++) {
            m.show("ammo_s" + k, k >= SNOW_BALLS - showCount);   // the top balls go first
        }
        for (int k = 0; k < COBBLE_BALLS; k++) {
            m.show("ammo_c" + k, k >= COBBLE_BALLS - showCount);
        }
        // the newest ball pops in with a little overshoot
        if (!swapping && sinceLoad < 0.25f) {
            float k = sinceLoad / 0.25f, c = 2.2f;
            float s = 1f + (c + 1f) * (float) Math.pow(k - 1f, 3) + c * (float) Math.pow(k - 1f, 2);
            int idx = (ammoMode == SnowballLauncherItem.MODE_SNOW ? SNOW_BALLS : COBBLE_BALLS) - loaded;
            m.get((ammoMode == SnowballLauncherItem.MODE_SNOW ? "ammo_s" : "ammo_c") + idx).ifPresent(p -> {
                p.xScale *= s;
                p.yScale *= s;
                p.zScale *= s;
            });
        }
        m.get("drum").ifPresent(p -> p.zRot += drumAngle);
        m.get("crank").ifPresent(p -> p.xRot += drumAngle * 0.5f);
        m.get("needle").ifPresent(p -> p.xRot += heat * 2.3f + (over ? Mth.sin(t * 2.1f) * 0.12f : 0f));
        m.get("vent").ifPresent(p -> p.xRot += heat * 0.9f);
        if (player != null && firstPerson) {   // the hopper sloshes as you walk
            float walk = player.walkDist + (player.walkDist - player.walkDistO) * partial;
            float amt = Mth.clamp((player.walkDist - player.walkDistO) * 4f, 0f, 1f);
            m.get("hopper").ifPresent(p -> p.zRot += Mth.sin(walk * 2.2f) * 0.08f * amt);
            m.get("snowballs").ifPresent(p -> p.y -= Math.abs(Mth.cos(walk * 2.2f)) * 0.5f * amt);
            m.get("cobble").ifPresent(p -> p.y -= Math.abs(Mth.cos(walk * 2.2f)) * 0.4f * amt);
        }

        pose.pushPose();
        if (firstPerson && sinceShot < 0.2f) {   // extra kick of the whole gun into the hand
            float k = (1f - sinceShot / 0.2f) * (heavy ? 0.12f : 0.035f);
            pose.translate(0, k * 0.4f, k);
            pose.mulPose(Axis.XP.rotationDegrees(-k * 90f));
        }
        if (over) {
            pose.translate(Mth.sin(t * 3.7f) * 0.006f, Mth.cos(t * 4.3f) * 0.006f, 0);
        }
        if (mode == ItemDisplayContext.GUI) {   // the inventory icon is the 3D launcher, three-quarter view
            pose.translate(0.5f, 0.5f, 0.5f);
            pose.mulPose(Axis.XP.rotationDegrees(25f));
            pose.mulPose(Axis.YP.rotationDegrees(-135f));
            pose.scale(0.55f, 0.55f, 0.55f);
            pose.translate(-0.5f, -0.5f, -0.5f);
        }
        pose.translate(0.5f, 1.5f, 0.5f);
        pose.scale(-1f, -1f, 1f);
        RenderType base = RenderType.entityCutoutNoCull(m.texture);
        m.mask(n -> !isBarrel(n));
        m.renderToBuffer(pose, buffers.getBuffer(base), light, overlay, 0xFFFFFFFF);
        // the barrels heat up: tinted toward orange, then glowing red-hot
        int g = (int) (255 * (1f - 0.45f * heat)), b = (int) (255 * (1f - 0.7f * heat));
        m.mask(LauncherItemRenderer::isBarrel);
        m.renderToBuffer(pose, buffers.getBuffer(base), light, overlay, 0xFF000000 | (255 << 16) | (g << 8) | b);
        if (heat > 0.45f) {
            float hot = Math.min(1f, (heat - 0.45f) / 0.55f) * (over ? 0.85f + 0.15f * Mth.sin(t * 1.3f) : 1f);
            int r = (int) (255 * hot), gg = (int) (90 * hot);
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.texture)), 0xF000F0, OverlayTexture.NO_OVERLAY,
                    0xFF000000 | (r << 16) | (gg << 8));
        }
        m.unmask();
        if (m.hasGlow) {
            m.renderToBuffer(pose, buffers.getBuffer(RenderType.eyes(m.glowTexture)), 0xF000F0, OverlayTexture.NO_OVERLAY, 0xFFFFFFFF);
        }
        pose.popPose();
    }
}
