package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.HexingTableMenu;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;

/**
 * THE REGION MAP of the Hexing Table screen, in one place. It follows the sheet textures/gui/hexing_table.png
 * (256 x 256), whose map is the top docstring of examples/src/winterworks_hex_art.py. "at" is where the screen draws a
 * sprite, relative to the GUI's top-left; sprites are (u, v, w, h) on the sheet.
 *
 * <pre>
 * element            sheet (u, v, w, h)          at / notes
 * panel              0, 0, 176, 166              0, 0; title 8,6 (0xE6C77A), "Inventory" 8,72 (0xB8A58A)
 * book slot          (panel)                     item 34,47     Soul Elixir slot (panel): item 56,47
 * player inventory   (panel)                     8 + 18c, 84 + 18r; hotbar y 142
 * tank fill strip    176, 0, 16, 80              h = 48 * souls / capacity: (176, scroll + 48 - h, 16, h) at
 *                                                9, 65 - h; scroll = (ticks / 2) % 32
 * tank surface       176, 80, 16, 3              9, 64 - h (not when h = 0 or 48)
 * tank glass         176, 84, 16, 48             9, 17, over the fill
 * swirling souls     192 + 16(i%4), 16(i/4), 16  frame (ticks / 3) % 8 at 9, 65 - h + (h - 16) / 2 while h >= 16,
 *                                                clipped to the fill
 * option rows        88 x 19                     80, 14 + 19i: 0 lesser hex, 1 sin hex, 2 the hidden curse (locked)
 *   normal 0,166  hovered 0,185  disabled 0,204  locked 0,223 (no cost icon or text on a locked row)
 * cost icons         192 + 16(n-1), 32 (v 48     row + (1, 1); n Soul Elixir
 *                    when unaffordable), 16x16
 * glyph text         glyph i: 6i, 243, 6, 8      row + (20, 6), 16 glyphs, 6 px advance, tinted
 * ghost icons        240,32 book; 240,48 elixir  in the empty slots
 * HEX button         32 x 28                     37, 14: normal 96,166  hover 128,166  pressed 160,166
 *                                                disabled 192,166; halo 224,166 (behind, while hovered or hexing)
 * ignition 0..7      96 + 32(i%5), 194 + 28(i/5) about 3 ticks a frame; 7 is the lit end state
 * </pre>
 * Without the sheet the screen draws the same regions with fill() calls ({@link #fallback()}).
 */
final class HexGui {
    static final ResourceLocation TEXTURE = Winterworks.id("textures/gui/hexing_table.png");
    static final int W = 176, H = 166;

    record Rect(int x, int y, int w, int h) {
        boolean contains(double mx, double my) {
            return mx >= x && my >= y && mx < x + w && my < y + h;
        }

        int cx() {
            return x + w / 2;
        }

        int cy() {
            return y + h / 2;
        }
    }

    record Sprite(int u, int v, int w, int h) {}

    // ---- where things go on screen
    static final int TITLE_X = 8, TITLE_Y = 6, INV_LABEL_X = 8, INV_LABEL_Y = 72;
    static final int TITLE_COLOR = 0xE6C77A, LABEL_COLOR = 0xB8A58A;
    static final Rect TANK = new Rect(9, 17, 16, 48);
    static final int TANK_BOTTOM = 65;
    static final int ROW_X = 80, ROW_Y = 14, ROW_W = 88, ROW_H = 19, ROWS = 3;
    static final int COST_DX = 1, COST_DY = 1, TEXT_DX = 20, TEXT_DY = 6;
    static final Rect HEX_BUTTON = new Rect(37, 14, 32, 28);
    static final Rect BOOK_SLOT = new Rect(HexingTableMenu.BOOK_X - 1, HexingTableMenu.BOOK_Y - 1, 18, 18);
    static final Rect ELIXIR_SLOT = new Rect(HexingTableMenu.ELIXIR_X - 1, HexingTableMenu.ELIXIR_Y - 1, 18, 18);

    static Rect row(int i) {
        return new Rect(ROW_X, ROW_Y + ROW_H * i, ROW_W, ROW_H);
    }

    // ---- the sheet
    static final Sprite PANEL = new Sprite(0, 0, W, H);
    static final Sprite TANK_FILL = new Sprite(176, 0, 16, 80);
    static final int TANK_SCROLL = 32;
    static final Sprite TANK_SURFACE = new Sprite(176, 80, 16, 3);
    static final Sprite TANK_GLASS = new Sprite(176, 84, 16, 48);
    static final int SWIRL_U = 192, SWIRL_V = 0, SWIRL_SIZE = 16, SWIRL_FRAMES = 8;
    static final Sprite ROW_NORMAL = new Sprite(0, 166, ROW_W, ROW_H);
    static final Sprite ROW_HOVER = new Sprite(0, 185, ROW_W, ROW_H);
    static final Sprite ROW_DISABLED = new Sprite(0, 204, ROW_W, ROW_H);
    static final Sprite ROW_LOCKED = new Sprite(0, 223, ROW_W, ROW_H);
    static final int COST_U = 192, COST_V = 32, COST_V_OFF = 48, COST_SIZE = 16;
    static final int GLYPH_U = 0, GLYPH_V = 243, GLYPH_W = 6, GLYPH_H = 8, GLYPHS = 16;
    static final Sprite GHOST_BOOK = new Sprite(240, 32, 16, 16);
    static final Sprite GHOST_ELIXIR = new Sprite(240, 48, 16, 16);
    static final Sprite BUTTON = new Sprite(96, 166, 32, 28);
    static final Sprite BUTTON_HOVER = new Sprite(128, 166, 32, 28);
    static final Sprite BUTTON_PRESSED = new Sprite(160, 166, 32, 28);
    static final Sprite BUTTON_OFF = new Sprite(192, 166, 32, 28);
    static final Sprite BUTTON_HALO = new Sprite(224, 166, 32, 28);
    static final int IGNITE_U = 96, IGNITE_V = 194, IGNITE_FRAMES = 8, IGNITE_TICKS = 3;

    static Sprite ignition(int frame) {
        int i = Math.max(0, Math.min(IGNITE_FRAMES - 1, frame));
        return new Sprite(IGNITE_U + 32 * (i % 5), IGNITE_V + 28 * (i / 5), 32, 28);
    }

    static Sprite cost(int n, boolean affordable) {
        return new Sprite(COST_U + COST_SIZE * (Math.max(1, Math.min(3, n)) - 1), affordable ? COST_V : COST_V_OFF, COST_SIZE, COST_SIZE);
    }

    static Sprite swirl(int frame) {
        int i = Math.floorMod(frame, SWIRL_FRAMES);
        return new Sprite(SWIRL_U + SWIRL_SIZE * (i % 4), SWIRL_V + SWIRL_SIZE * (i / 4), SWIRL_SIZE, SWIRL_SIZE);
    }

    // ---- colours (soul fire, gold, crimson)
    static final int SOUL = 0x4FE3E0, SOUL_PALE = 0xB4FFF5, SOUL_DEEP = 0x11507A, SOUL_INK = 0x0A1230;
    static final int GLYPH_IDLE = 0x6FC4CC, GLYPH_LIT = 0xC8FFF8, GLYPH_DIM = 0x35565C;
    static final int CRIMSON = 0xE0574F, CRIMSON_LIT = 0xFF9A7A, GOLD = 0xFAD55A, HIDDEN = 0xA77BFF, BAD = 0xFF6B6B;
    static final int TEXT = 0xC9EEF5, TEXT_DIM = 0x8AA6AE;

    private static Boolean hasTexture;

    private HexGui() {}

    /** True while the sheet isn't in the resources: the screen draws with fill() instead. */
    static boolean fallback() {
        if (hasTexture == null) {
            hasTexture = Minecraft.getInstance().getResourceManager().getResource(TEXTURE).isPresent();
        }
        return !hasTexture;
    }

    static void forgetTexture() {
        hasTexture = null;
    }

    static void blit(GuiGraphics g, int x, int y, Sprite s) {
        g.blit(TEXTURE, x, y, s.u(), s.v(), s.w(), s.h());
    }

    static void blit(GuiGraphics g, int x, int y, Sprite s, float r, float gr, float b, float a) {
        RenderSystem.enableBlend();
        g.setColor(r, gr, b, a);
        blit(g, x, y, s);
        g.setColor(1f, 1f, 1f, 1f);
    }

    static void blitAlpha(GuiGraphics g, int x, int y, Sprite s, float a) {
        blit(g, x, y, s, 1f, 1f, 1f, a);
    }

    /** One cursed glyph from the sheet, tinted. */
    static void glyph(GuiGraphics g, int x, int y, int index, int rgb, float a) {
        RenderSystem.enableBlend();
        g.setColor(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, a);
        g.blit(TEXTURE, x, y, GLYPH_U + GLYPH_W * Math.floorMod(index, GLYPHS), GLYPH_V, GLYPH_W, GLYPH_H);
        g.setColor(1f, 1f, 1f, 1f);
    }

    // ---- fill() drawing for the fallback: vanilla-shaped bevels in netherite and soul-fire colours
    static final int PANEL_BG = 0xFF221B24, PANEL_HI = 0xFF4A3E44, PANEL_LO = 0xFF0D0A10, WELL = 0xFF17121A;

    static void panel(GuiGraphics g, int x, int y, int w, int h) {
        g.fill(x + 1, y, x + w - 1, y + h, 0xFF000000);
        g.fill(x, y + 1, x + w, y + h - 1, 0xFF000000);
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, PANEL_BG);
        g.fill(x + 1, y + 1, x + w - 2, y + 3, PANEL_HI);
        g.fill(x + 1, y + 1, x + 3, y + h - 2, PANEL_HI);
        g.fill(x + 2, y + h - 3, x + w - 1, y + h - 1, PANEL_LO);
        g.fill(x + w - 3, y + 2, x + w - 1, y + h - 1, PANEL_LO);
    }

    /** A sunken well (slot, tank, rows): dark top-left, light bottom-right, like vanilla's slots. */
    static void well(GuiGraphics g, int x, int y, int w, int h, int fill) {
        g.fill(x, y, x + w, y + h, PANEL_HI);
        g.fill(x, y, x + w - 1, y + h - 1, PANEL_LO);
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, fill);
    }

    static void border(GuiGraphics g, int x, int y, int w, int h, int argb) {
        g.fill(x, y, x + w, y + 1, argb);
        g.fill(x, y + h - 1, x + w, y + h, argb);
        g.fill(x, y + 1, x + 1, y + h - 1, argb);
        g.fill(x + w - 1, y + 1, x + w, y + h - 1, argb);
    }

    static int argb(float alpha, int rgb) {
        return ((int) (Math.max(0f, Math.min(1f, alpha)) * 255) << 24) | (rgb & 0xFFFFFF);
    }

    static int mix(float t, int a, int b) {
        return HexRender.lerpRgb(t, a, b);
    }
}
