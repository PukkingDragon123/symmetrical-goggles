package dev.lowpix.winterworks.client.endboss;

import dev.lowpix.winterworks.end.Eclipse;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;

/**
 * The eclipse's light (docs/END_UPDATE.md section 5): applied to each lightmap pixel as the light texture is rebuilt
 * (mixin.client.endboss.EclipseLightMixin). The End is lit brighter, its shadows lifted towards violet and its lit
 * places warmed towards gold, by the eclipse's fraction.
 */
public final class EclipseLight {
    private static final float LIFT = 0.30f;

    private EclipseLight() {}

    /** `abgr` is the lightmap colour for (block light, sky light); returns it under the eclipse. */
    public static int tint(int block, int sky, int abgr) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.level.dimension() != Level.END) {
            return abgr;
        }
        float f = Eclipse.fraction(mc.level);
        if (f <= 0f) {
            return abgr;
        }
        f = f * f * (3 - 2 * f);
        float r = (abgr & 0xFF) / 255f, g = (abgr >> 8 & 0xFF) / 255f, b = (abgr >> 16 & 0xFF) / 255f;
        float lum = 0.3f * r + 0.59f * g + 0.11f * b;
        // lift the darks towards a violet glow, warm the lit parts towards gold
        float lr = r + (1 - r) * LIFT * 0.95f, lg = g + (1 - g) * LIFT * 0.6f, lb = b + (1 - b) * LIFT * 1.15f;
        float k = Mth.clamp((lum - 0.35f) / 0.5f, 0f, 1f);
        float tr = Mth.lerp(k, 1.04f, 1.10f), tg = Mth.lerp(k, 0.74f, 0.96f), tb = Mth.lerp(k, 1.24f, 0.80f);
        r = Mth.clamp(Mth.lerp(f, r, lr * tr), 0f, 1f);
        g = Mth.clamp(Mth.lerp(f, g, lg * tg), 0f, 1f);
        b = Mth.clamp(Mth.lerp(f, b, lb * tb), 0f, 1f);
        return (abgr & 0xFF000000) | (int) (b * 255) << 16 | (int) (g * 255) << 8 | (int) (r * 255);
    }
}
