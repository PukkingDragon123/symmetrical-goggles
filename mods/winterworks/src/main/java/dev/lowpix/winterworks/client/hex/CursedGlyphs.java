package dev.lowpix.winterworks.client.hex;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * Unreadable cursed glyph text: the sheet's 16 cursed glyphs (or, without the sheet and in tooltips, vanilla's
 * galactic alphabet, the {@code minecraft:alt} font), tinted, shimmering, shifting and swaying. As {@code reveal}
 * rises from 0 to 1 the glyphs resolve, letter by letter in a ragged order, into the real words.
 */
final class CursedGlyphs {
    static final Style ALT = Style.EMPTY.withFont(ResourceLocation.withDefaultNamespace("alt"));

    private CursedGlyphs() {}

    private static int hash(long seed, int i, int salt) {
        long h = seed * 0x9E3779B97F4A7C15L + i * 0xBF58476D1CE4E5B9L + salt * 0x94D049BB133111EBL;
        h ^= h >>> 31;
        h *= 0xD6E8FEB86659FD3BL;
        return (int) (h ^ (h >>> 29)) & 0x7FFFFFFF;
    }

    /** The reveal point (0..1) of letter i: roughly left to right, a little ragged. */
    static float threshold(long seed, int i, int len) {
        float jitter = (hash(seed, i, 7) % 1000) / 1000f;
        return Mth.clamp((i + jitter * 2.2f) / (len + 2.2f), 0f, 0.98f);
    }

    /** The glyph shown for letter i at this time (it changes every few ticks). */
    static int glyph(long seed, int i, float time) {
        int step = (int) (time / (6 + (hash(seed, i, 3) % 6)));
        return hash(seed, i, 11 + step);
    }

    /**
     * Draws `real` as cursed glyphs that turn into its letters as `reveal` goes 0 -> 1, at most `maxW` px wide.
     * Glyphs shimmer between `glyphRgb` and pale; revealed letters land white-hot and cool to `letterRgb`.
     */
    static void draw(GuiGraphics g, Font font, String real, int x, int y, int maxW, int glyphRgb, int letterRgb, float reveal,
                     float time, long seed, float alpha, boolean sheet) {
        int cx = x;
        int len = real.length();
        for (int i = 0; i < len; i++) {
            char c = real.charAt(i);
            float th = threshold(seed, i, len);
            boolean shown = reveal > th;
            boolean flicker = !shown && reveal > 0.01f && reveal > th - 0.08f && ((int) (time * 1.7f + i) & 1) == 0;
            int adv;
            if (c == ' ') {
                adv = shown ? font.width(" ") : 4;
            } else if (shown || flicker) {
                Component piece = Component.literal(String.valueOf(c));
                float k = shown ? Mth.clamp((reveal - th) / 0.12f, 0f, 1f) : 0f;
                adv = font.width(piece);
                if (cx + adv - x > maxW) {
                    return;
                }
                g.drawString(font, piece, cx, y, HexGui.argb(alpha, HexGui.mix(k, 0xFFFFFF, letterRgb)), false);
            } else {
                float wave = 0.5f + 0.5f * Mth.sin(time * 0.18f + i * 0.55f);
                int rgb = HexGui.mix(wave * 0.6f, glyphRgb, 0xFFFFFF);
                int dy = Math.round(Mth.sin(time * 0.13f + i * 0.8f) * 0.6f);
                int gi = glyph(seed, i, time);
                if (sheet) {
                    adv = HexGui.GLYPH_W;
                    if (cx + adv - x > maxW) {
                        return;
                    }
                    HexGui.glyph(g, cx, y + dy, gi, rgb, alpha * (0.8f + 0.2f * wave));
                } else {
                    Component piece = Component.literal(String.valueOf((char) ('a' + gi % 26))).withStyle(ALT);
                    adv = font.width(piece);
                    if (cx + adv - x > maxW) {
                        return;
                    }
                    g.drawString(font, piece, cx, y + dy, HexGui.argb(alpha * (0.8f + 0.2f * wave), rgb), false);
                }
            }
            cx += adv;
        }
    }

    /** The same resolving text as a tooltip line: the revealed letters plus galactic glyphs for the rest. */
    static MutableComponent component(String real, float reveal, float time, long seed, int glyphRgb, int letterRgb) {
        MutableComponent out = Component.empty();
        int len = real.length();
        for (int i = 0; i < len; i++) {
            char c = real.charAt(i);
            if (c == ' ' || reveal > threshold(seed, i, len)) {
                out.append(Component.literal(String.valueOf(c)).withColor(letterRgb));
            } else {
                out.append(Component.literal(String.valueOf((char) ('a' + glyph(seed, i, time) % 26))).withStyle(ALT.withColor(glyphRgb)));
            }
        }
        return out;
    }
}
