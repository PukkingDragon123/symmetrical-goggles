package dev.lowpix.winterworks.client.soulbull;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.soulbull.SoulBull;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * The soul bar (docs/FIXES_0_4.md, art notes): while riding a Soul Bull it replaces the experience bar (and the horse's
 * jump bar) and shows its soul energy, its health. `gui/soul_bar.png` (182 x 25): the empty bar at v=0 and four animated
 * full-bar frames at v=5, 10, 15, 20, cropped to the energy; `gui/soul_bar_icon.png` (9 x 36, four frames) left of it.
 * Charging a ram, the soul it will burn flashes at the bar's end (red if it can't afford it); cooling down, the bar dims.
 */
public final class SoulBar {
    private static final ResourceLocation BAR = Winterworks.id("textures/gui/soul_bar.png");
    private static final ResourceLocation ICON = Winterworks.id("textures/gui/soul_bar_icon.png");
    private static final int W = 182;

    private SoulBar() {}

    public static boolean riding() {
        Minecraft mc = Minecraft.getInstance();
        return mc.player != null && mc.player.getVehicle() instanceof SoulBull;
    }

    /** Draws the bar at the experience bar's place (`x` = its left edge); false if the player isn't riding a Soul Bull. */
    public static boolean render(GuiGraphics g, int x) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || !(mc.player.getVehicle() instanceof SoulBull bull)) {
            return false;
        }
        int y = g.guiHeight() - 32 + 3;
        int ticks = mc.gui.getGuiTicks();
        int frame = (ticks / 3) % 4;
        float energy = bull.soulEnergy();
        int w = Mth.ceil(W * energy);
        RenderSystem.enableBlend();
        g.blit(BAR, x, y, 0, 0, W, 5, W, 25);
        if (w > 0) {
            g.blit(BAR, x, y, 0, 5 + 5 * frame, w, 5, W, 25);
        }
        float charge = mc.player.getJumpRidingScale();
        if (bull.getJumpCooldown() > 0 && !bull.isRamming()) {
            g.fill(x, y, x + W, y + 5, 0x70000000);
        } else if (charge > 0f && bull.isSaddled()) {   // the soul this ram will burn
            float p = SoulBull.ramPower(Mth.floor(charge * 100f));
            float cost = bull.ramCost(p) / bull.getMaxHealth();
            boolean afford = bull.canAffordRam(p);
            int from = Math.max(0, Mth.floor(W * (energy - cost)));
            float pulse = 0.5f + 0.5f * Mth.sin((ticks + mc.getTimer().getGameTimeDeltaPartialTick(false)) * 0.9f);
            int to = Math.max(from + 1, w);
            // the soul it will burn goes dark (red when it can't afford it), with a soul-fire cyan edge where the bar will end
            g.fill(x + from, y + 1, x + to, y + 4, ((int) (150 + 70 * pulse) << 24) | (afford ? 0x06282C : 0x5A0A0A));
            g.fill(x + from, y, x + from + 1, y + 5, ((int) (180 + 75 * pulse) << 24) | (afford ? 0x7DF9FF : 0xFF5040));
        }
        g.blit(ICON, x - 10, y - 2, 0, 9 * frame, 9, 9, 9, 36);
        RenderSystem.disableBlend();
        return true;
    }
}
