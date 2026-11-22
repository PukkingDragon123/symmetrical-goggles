package dev.lowpix.winterworks.client.curse;

import dev.lowpix.winterworks.curse.Curse;
import dev.lowpix.winterworks.curse.CurseFxPayload;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/**
 * Client side of the curses (docs/HEXES_UPDATE.md 3-5): the Narcissus and Lot's Wife camera lock (mixin.client.
 * CurseMouseHandlerMixin), Sloth's eyelids closing as you nod off, the Moth's pull, each curse's screen effect when it
 * triggers (CurseScreenFx) and a faint vignette in the sin's colour while you bear a sin. Fed by curse.CurseFxPayload;
 * the sin tint reads your own equipment. Soul fire: SoulFireClient.
 */
public final class CurseClient {
    private static final int LID_TICKS = 10;

    private static int lockKind;       // 0, TRANSFIX or STONE
    private static int lockTicks;      // remaining, -1: until released
    private static int lockTotal;
    private static LocalPlayer lockedFor;
    private static int nodTicks, nodTotal;
    private static int sinColour = -1;
    private static float sinAlpha, sinAlphaO;
    private static int ticks;
    private static LocalPlayer effectFor;

    private CurseClient() {}

    public static void init() {
        ClientPlayNetworking.registerGlobalReceiver(CurseFxPayload.TYPE, (payload, ctx) -> handle(payload));
        ClientTickEvents.END_CLIENT_TICK.register(mc -> tick());
        HudRenderCallback.EVENT.register(CurseClient::render);
        CurseScreenFx.init();
        SoulFireClient.init();
    }

    /** Is the camera held by a curse right now? */
    public static boolean cameraLocked() {
        return lockKind != 0 && Minecraft.getInstance().player != null && Minecraft.getInstance().player == lockedFor;
    }

    private static void handle(CurseFxPayload fx) {
        LocalPlayer player = Minecraft.getInstance().player;
        switch (fx.kind()) {
            case CurseFxPayload.RELEASE -> {
                lockKind = 0;
                nodTicks = 0;
            }
            case CurseFxPayload.TRANSFIX, CurseFxPayload.STONE -> {
                lockKind = fx.kind();
                lockTicks = fx.ticks();
                lockTotal = Math.max(1, fx.ticks());
                lockedFor = player;
            }
            case CurseFxPayload.NOD -> {
                nodTicks = fx.ticks();
                nodTotal = Math.max(1, fx.ticks());
            }
            case CurseFxPayload.PULL -> {
                if (player != null && !player.isSpectator()) {
                    player.push(fx.x(), fx.y(), fx.z());
                }
            }
            case CurseFxPayload.EFFECT -> {
                int i = Math.round(fx.x());
                if (i >= 0 && i < Curse.ALL.length) {
                    CurseScreenFx.start(Curse.ALL[i], fx.ticks());
                    effectFor = player;
                }
            }
            default -> {
            }
        }
    }

    private static void tick() {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer p = mc.player;
        ticks++;
        if (p == null || !p.isAlive() || lockKind != 0 && p != lockedFor) {
            lockKind = 0;
            nodTicks = 0;
        }
        if (lockKind != 0 && lockTicks > 0 && --lockTicks == 0) {
            lockKind = 0;
        }
        if (nodTicks > 0) {
            nodTicks--;
        }
        if (CurseScreenFx.active() && (p == null || !p.isAlive() || effectFor != null && p != effectFor)) {
            CurseScreenFx.stop();   // death, respawn, leaving the world
        }
        if (!mc.isPaused()) {
            CurseScreenFx.tick();
        }
        sinAlphaO = sinAlpha;
        if (p != null && ticks % 10 == 0) {
            sinColour = sinColour(p);
        }
        float target = sinColour >= 0 ? 1f : 0f;
        sinAlpha += (target - sinAlpha) * 0.08f;
    }

    /** The colour of the first sin borne by the player (each in its enchantment's slots), or -1. */
    private static int sinColour(LocalPlayer p) {
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            ItemStack stack = p.getItemBySlot(slot);
            ItemEnchantments en = stack.isEmpty() ? null : stack.get(DataComponents.ENCHANTMENTS);
            if (en == null || en.isEmpty()) {
                continue;
            }
            for (var e : en.entrySet()) {
                Holder<Enchantment> h = e.getKey();
                Curse c = Curse.of(h);
                if (c != null && c.sin() && h.value().matchingSlot(slot)) {
                    return colour(c);
                }
            }
        }
        return -1;
    }

    private static int colour(Curse c) {
        return switch (c) {
            case WRATH -> 0xD0341E;
            case GREED -> 0xE2B33A;
            case LUST -> 0xD03C7C;
            case GLUTTONY -> 0x8A9A2A;
            case SLOTH -> 0x5E6E92;
            case ENVY -> 0x3AA048;
            case PRIDE -> 0x9A4AC8;
            default -> 0x8040A0;
        };
    }

    private static void render(GuiGraphics g, DeltaTracker delta) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.options.hideGui) {
            return;
        }
        float partial = delta.getGameTimeDeltaPartialTick(false);
        int w = g.guiWidth(), h = g.guiHeight();
        float sin = Mth.lerp(partial, sinAlphaO, sinAlpha);
        if (sin > 0.01f && sinColour >= 0) {
            float pulse = 0.8f + 0.2f * Mth.sin((ticks + partial) * 0.07f);
            vignette(g, w, h, sinColour, 0.22f * sin * pulse, 14);
        }
        if (cameraLocked()) {
            if (lockKind == CurseFxPayload.TRANSFIX) {
                float ripple = 0.85f + 0.15f * Mth.sin((ticks + partial) * 0.15f);
                vignette(g, w, h, 0x2C6FB0, 0.45f * ripple, 20);
            } else {
                float k = lockTicks > 0 ? Mth.clamp((lockTicks - partial) / 10f, 0f, 1f) : 1f;
                vignette(g, w, h, 0xB8B4A6, 0.6f * k, 24);
                g.fill(0, 0, w, h, argb(0x9A968A, 0.18f * k));
            }
        }
        if (nodTicks > 0) {
            eyelids(g, w, h, nodTicks - partial);
        }
        CurseScreenFx.render(g, partial);
    }

    /** Sloth: the eyelids close, stay shut, then open. */
    private static void eyelids(GuiGraphics g, int w, int h, float left) {
        float elapsed = nodTotal - left;
        float closed;
        if (elapsed < LID_TICKS) {
            closed = elapsed / LID_TICKS;
        } else if (left < LID_TICKS) {
            closed = left / LID_TICKS;
        } else {
            closed = 1f;
        }
        closed = Mth.clamp(closed, 0f, 1f);
        closed = closed * closed * (3 - 2 * closed);
        int lid = (int) (h * 0.5f * closed) + 1;
        int edge = Math.max(4, h / 14);
        g.fill(0, 0, w, lid, 0xFF050308);
        g.fill(0, h - lid, w, h, 0xFF050308);
        g.fillGradient(0, lid, w, lid + edge, 0xC0050308, 0x00050308);
        g.fillGradient(0, h - lid - edge, w, h - lid, 0x00050308, 0xC0050308);
    }

    /** A soft frame of colour round the screen edges: bands of fading alpha. */
    private static void vignette(GuiGraphics g, int w, int h, int rgb, float alpha, int bands) {
        int t = Math.max(2, Math.min(w, h) / (bands * 5));
        for (int i = 0; i < bands; i++) {
            float k = 1f - (float) i / bands;
            int c = argb(rgb, alpha * k * k);
            if ((c >>> 24) == 0) {
                continue;
            }
            int a = i * t, b = (i + 1) * t;
            g.fill(a, a, w - a, b, c);
            g.fill(a, h - b, w - a, h - a, c);
            g.fill(a, b, b, h - b, c);
            g.fill(w - b, b, w - a, h - b, c);
        }
    }

    private static int argb(int rgb, float alpha) {
        int a = Mth.clamp((int) (alpha * 255), 0, 255);
        return a << 24 | rgb & 0xFFFFFF;
    }
}
