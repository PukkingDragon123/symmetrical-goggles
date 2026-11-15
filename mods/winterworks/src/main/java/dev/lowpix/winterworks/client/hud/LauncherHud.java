package dev.lowpix.winterworks.client.hud;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.launcher.SnowballLauncherItem;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;

/**
 * The launcher's mechanical HUD, right of the hotbar: an ammo counter (LED digits), the ammo type, a charge bar for
 * cobble shots, a heat bar and a heat dial with a live needle, an OVERHEAT plate that flashes and puffs steam.
 * It slides up when you pull the launcher out and shakes when you fire.
 */
public final class LauncherHud {
    private static final ResourceLocation TEX = Winterworks.id("textures/gui/launcher_hud.png");
    private static float shown;     // 0..1 slide-in
    private static float shownO;

    private LauncherHud() {}

    public static void render(GuiGraphics g, DeltaTracker delta) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = mc.player;
        if (p == null || mc.options.hideGui) {
            return;
        }
        ItemStack stack = p.getMainHandItem().getItem() instanceof SnowballLauncherItem ? p.getMainHandItem()
                : p.getOffhandItem().getItem() instanceof SnowballLauncherItem ? p.getOffhandItem() : ItemStack.EMPTY;
        float partial = delta.getGameTimeDeltaPartialTick(false);
        shownO = shown;
        shown = Mth.clamp(shown + (stack.isEmpty() ? -0.08f : 0.08f), 0f, 1f);
        float s = Mth.lerp(0.5f, shownO, shown);
        if (s <= 0f || stack.isEmpty()) {
            return;
        }
        float ease = 1f - (1f - s) * (1f - s) * (1f - s);
        float t = (mc.level == null ? 0 : mc.level.getGameTime()) + partial;
        int mode = SnowballLauncherItem.mode(stack);
        int heat = SnowballLauncherItem.heat(stack);
        boolean over = SnowballLauncherItem.overheated(stack);
        long[] fx = SnowballLauncherItem.FX.get(p);
        float since = fx == null ? 99f : (t - fx[0]);
        int shakeX = 0, shakeY = 0;
        if (since < 4f) {   // firing judder
            shakeX = Math.round(Mth.sin(t * 9f) * (fx[1] == 1 ? 2f : 1f));
            shakeY = fx[1] == 1 ? 1 : 0;
        }
        if (over) {
            shakeX += Math.round(Mth.sin(t * 5.3f));
        }
        int x = g.guiWidth() / 2 + 91 + 8 + shakeX;
        int y = g.guiHeight() - Math.round(36 * ease) - 2 + Math.round((1 - ease) * 4) + shakeY;
        if (x + 120 > g.guiWidth()) {   // narrow window: sit above the hotbar instead
            x = g.guiWidth() / 2 - 60 + shakeX;
            y -= 40;
        }

        g.blit(TEX, x, y, 0, 0, 120, 34);
        // ammo: three LED digits, unlit segments behind
        int ammo = p.getAbilities().instabuild ? 999 : Math.min(999, SnowballLauncherItem.countAmmo(p, mode));
        String digits = String.format("%03d", ammo);
        for (int i = 0; i < 3; i++) {
            int dx = x + 6 + 3 + i * 10, dy = y + 6 + 2;
            g.blit(TEX, dx, dy, 8 * 6, 48, 5, 7);   // "8" unlit as the segment ghost
            int d = digits.charAt(i) - '0';
            boolean lead = i < 2 && ammo < (i == 0 ? 100 : 10);
            if (!lead) {
                g.blit(TEX, dx, dy, d * 6, 40, 5, 7);
            }
        }
        // mode icon
        g.blit(TEX, x + 44 + 1, y + 6 + 1, mode == SnowballLauncherItem.MODE_SNOW ? 0 : 12, 76, 10, 10);
        // charge (cobble shots)
        if (mode == SnowballLauncherItem.MODE_COBBLE && p.isUsingItem() && p.getUseItem() == stack) {
            float c = Math.min(1f, (p.getTicksUsingItem() + partial) / (float) SnowballLauncherItem.FULL_CHARGE);
            int w = Math.round(64 * c);
            g.blit(TEX, x + 6 + 1, y + 22 + 1, 0, 58, w, 6);
            if (p.getTicksUsingItem() >= SnowballLauncherItem.CHARGE_TICKS && ((int) t / 3) % 2 == 0) {
                g.fill(x + 6 + 1, y + 22 + 1, x + 6 + 1 + w, y + 22 + 7, 0x40FFFFFF);   // ready: it pulses
            }
        }
        // heat bar + dial needle
        int hw = Math.round(36 * heat / 100f);
        g.blit(TEX, x + 76 + 1, y + 22 + 1, 0, 66, hw, 6);
        float ang = Mth.lerp(heat / 100f, -2.35f, 2.35f) + (over ? Mth.sin(t * 2.9f) * 0.08f : 0f);
        float cx = x + 88 + 9f, cy = y + 2 + 9f;
        int col = heat > 80 ? 0xFFFF4020 : 0xFFE8E0D0;
        for (int i = 1; i <= 7; i++) {
            int px = Math.round(cx + Mth.sin(ang) * i - 0.5f), py = Math.round(cy - Mth.cos(ang) * i - 0.5f);
            g.fill(px, py, px + 1, py + 1, col);
        }
        g.fill(Math.round(cx) - 1, Math.round(cy) - 1, Math.round(cx) + 1, Math.round(cy) + 1, 0xFF2A2420);
        // overheat: flashing plate and steam puffs from the dial
        if (over) {
            boolean lit = ((int) (t / 4)) % 2 == 0;
            g.blit(TEX, x + 6, y - 13, lit ? 24 : 60, 76, 34, 12);
            for (int k = 0; k < 3; k++) {
                float life = ((t + k * 7) % 21) / 21f;
                int frame = Math.min(2, (int) (life * 3));
                int px = x + 92 + Math.round(Mth.sin(t * 0.2f + k) * 3) + k * 4 - 4;
                int py = y - Math.round(life * 16);
                g.blit(TEX, px, py, frame * 10, 90, 8, 8);
            }
        }
    }
}
