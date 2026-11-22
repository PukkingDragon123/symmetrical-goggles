package dev.lowpix.winterworks.client.hex;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * Unreadable cursed glyph text: vanilla's galactic alphabet (the {@code minecraft:alt} font, as on the enchanting
 * table), shimmering soul blue, its letters shifting and swaying. With {@code reveal} rising from 0 to 1 the glyphs
 * resolve, letter by letter in a ragged order, into the real words (the curse's name).
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
    private static float threshold(long seed, int i, int len) {
        float jitter = (hash(seed, i, 7) % 1000) / 1000f;
        return Mth.clamp((i + jitter * 2.2f) / (len + 2.2f), 0f, 0.98f);
    }

    /** The glyph shown for letter i at this time: it changes every few ticks. */
    private static char glyph(long seed, int i, float time) {
        int step = (int) (time / (5 + (hash(seed, i, 3) % 5)));
        return (char) ('a' + hash(seed, i, 11 + step) % 26);
    }

    /**
     * Draws `real` as cursed glyphs that turn into the real letters as `reveal` goes 0 -> 1. Returns the width drawn.
     * `color` is the revealed colour (RGB); the glyphs shimmer between soul blue and pale cyan scaled by `bright`.
     */
    static int draw(GuiGraphics g, Font font, String real, int x, int y, int color, float reveal, float time, long seed, float bright) {
        int cx = x;
        int len = real.length();
        for (int i = 0; i < len; i++) {
            char c = real.charAt(i);
            if (c == ' ') {
                cx += font.width(" ");
                continue;
            }
            float th = threshold(seed, i, len);
            Component piece;
            int argb;
            int dy = 0;
            if (reveal > th) {
                float k = Mth.clamp((reveal - th) / 0.12f, 0f, 1f);   // a white-hot flash as the letter lands
                piece = Component.literal(String.valueOf(c));
                argb = 0xFF000000 | HexGui.mix(k, 0xFFFFFF, color);
            } else {
                boolean edge = reveal > 0.01f && reveal > th - 0.08f;   // the next letters flicker
                char gl = edge && ((int) (time * 1.7f + i) & 1) == 0 ? c : glyph(seed, i, time);
                piece = edge && gl == c ? Component.literal(String.valueOf(c)) : Component.literal(String.valueOf(gl)).withStyle(ALT);
                float wave = 0.5f + 0.5f * Mth.sin(time * 0.18f + i * 0.55f);
                int rgb = HexGui.mix(wave, HexGui.SOUL, HexGui.SOUL_PALE);
                argb = 0xFF000000 | HexRender.scale(rgb, bright * (0.75f + 0.25f * wave));
                dy = Math.round(Mth.sin(time * 0.13f + i * 0.8f) * 0.9f);
            }
            g.drawString(font, piece, cx, y + dy, argb, false);
            cx += font.width(piece);
        }
        return cx - x;
    }

    /** Pure glyph noise (nothing to reveal yet): `count` letters. */
    static void noise(GuiGraphics g, Font font, int count, int x, int y, float time, long seed, float bright) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < count; i++) {
            sb.append(hash(seed, i, 99) % 7 == 0 ? ' ' : 'x');
        }
        draw(g, font, sb.toString(), x, y, HexGui.SOUL, 0f, time, seed, bright);
    }

    /** The width the text will take once fully revealed (for laying it out). */
    static int width(Font font, String real) {
        return font.width(real);
    }
}
