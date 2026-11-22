package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.HexingTableMenu;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;

/**
 * THE REGION MAP of the Hexing Table screen, in one place: where everything sits on screen (relative to the GUI's
 * top-left) and where each sprite sits on textures/gui/hexing_table.png (256 x 256). The background is drawn from
 * (0, 0) at the screen position (0, 0); every other sprite is drawn over it at its screen region.
 *
 * <pre>
 * screen (GUI 176 x 186)                       texture sprites (u, v, w, h)
 *  PANEL          0,   0, 176, 186             PANEL            0,   0, 176, 186  background, slot frames, wells
 *  title          8,   6                       OPTION           0, 186, 144,  20  option row, idle
 *  GAUGE          7,  16,  14,  74 tube        OPTION_HOVER     0, 206, 144,  20
 *  GAUGE_FILL     9,  18,  10,  70 liquid      OPTION_SELECTED  0, 226, 144,  20
 *  OPTION_LESSER 25,  16, 144,  20             (a row that can't be chosen: OPTION drawn darkened)
 *  OPTION_SIN    25,  38, 144,  20             BUTTON         176,   0,  32,  32  HEX rune, ready
 *  BOOK_SLOT     25,  62,  18,  18 (frame)     BUTTON_HOVER   208,   0,  32,  32
 *  ELIXIR_SLOT   45,  62,  18,  18 (frame)     BUTTON_LIT     176,  32,  32,  32  ignited
 *  INFO          66,  60,  68,  30             BUTTON_OFF     208,  32,  32,  32  can't hex
 *  HEX_BUTTON   137,  59,  32,  32             GAUGE_LIQUID   176,  64,  10,  70  soul liquid, drawn bottom up
 *  inventory      8,  93 label; slots 8,104;   GAUGE_GLASS    186,  64,  14,  74  glass and ticks over the liquid
 *                 hotbar 8,162                 SOUL_FRAME     200,  64,   8,   8  x4 frames to the right (200..232)
 *                                              FLAME_FRAME    200,  72,   8,   8  x4 frames to the right (soul flame)
 *                                              ICON_LESSER    176, 138,  16,  16  rune, in option rows
 *                                              ICON_SIN       192, 138,  16,  16  sin sigil
 *                                              ICON_BOOK      208, 138,  16,  16  empty book slot silhouette
 *                                              ICON_ELIXIR    224, 138,  16,  16  empty elixir slot silhouette
 *                                              IGNITE_RING    176, 154,  32,  32  flash ring when HEX is pressed
 * </pre>
 * Without the texture the screen draws the same regions with fill() calls ({@link #fallback()}).
 */
final class HexGui {
    static final ResourceLocation TEXTURE = Winterworks.id("textures/gui/hexing_table.png");
    static final int W = 176, H = 186;

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

    // ---- screen regions
    static final Rect PANEL = new Rect(0, 0, W, H);
    static final int TITLE_X = 8, TITLE_Y = 6, INV_LABEL_X = 8, INV_LABEL_Y = 93;
    static final Rect GAUGE = new Rect(7, 16, 14, 74);
    static final Rect GAUGE_FILL = new Rect(9, 18, 10, 70);
    static final Rect OPTION_LESSER = new Rect(25, 16, 144, 20);
    static final Rect OPTION_SIN = new Rect(25, 38, 144, 20);
    static final Rect BOOK_SLOT = new Rect(HexingTableMenu.BOOK_X - 1, HexingTableMenu.BOOK_Y - 1, 18, 18);
    static final Rect ELIXIR_SLOT = new Rect(HexingTableMenu.ELIXIR_X - 1, HexingTableMenu.ELIXIR_Y - 1, 18, 18);
    static final Rect INFO = new Rect(66, 60, 68, 30);
    static final Rect HEX_BUTTON = new Rect(137, 59, 32, 32);

    // ---- texture sprites
    static final Sprite OPTION = new Sprite(0, 186, 144, 20);
    static final Sprite OPTION_HOVER = new Sprite(0, 206, 144, 20);
    static final Sprite OPTION_SELECTED = new Sprite(0, 226, 144, 20);
    static final Sprite BUTTON = new Sprite(176, 0, 32, 32);
    static final Sprite BUTTON_HOVER = new Sprite(208, 0, 32, 32);
    static final Sprite BUTTON_LIT = new Sprite(176, 32, 32, 32);
    static final Sprite BUTTON_OFF = new Sprite(208, 32, 32, 32);
    static final Sprite GAUGE_LIQUID = new Sprite(176, 64, 10, 70);
    static final Sprite GAUGE_GLASS = new Sprite(186, 64, 14, 74);
    static final Sprite SOUL_FRAME = new Sprite(200, 64, 8, 8);
    static final Sprite FLAME_FRAME = new Sprite(200, 72, 8, 8);
    static final int FRAMES = 4;
    static final Sprite ICON_LESSER = new Sprite(176, 138, 16, 16);
    static final Sprite ICON_SIN = new Sprite(192, 138, 16, 16);
    static final Sprite ICON_BOOK = new Sprite(208, 138, 16, 16);
    static final Sprite ICON_ELIXIR = new Sprite(224, 138, 16, 16);
    static final Sprite IGNITE_RING = new Sprite(176, 154, 32, 32);

    // ---- soul-fire palette
    static final int SOUL = 0x5FD8EE, SOUL_PALE = 0xA8F2FF, SOUL_DEEP = 0x1E6F86, SOUL_DARK = 0x0D2E3A;
    static final int PANEL_BG = 0xFF1B1824, PANEL_HI = 0xFF3D3950, PANEL_LO = 0xFF0B0A10, WELL = 0xFF110F18;
    static final int CRIMSON = 0xE0364E, GOLD = 0xF2C14E, HIDDEN = 0xA77BFF, TEXT_DIM = 0x6E8C98, TEXT = 0xC9EEF5, BAD = 0xFF6B6B;

    private static Boolean hasTexture;

    private HexGui() {}

    /** True while textures/gui/hexing_table.png isn't in the resources: draw with fill() instead. */
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

    static void blit(GuiGraphics g, int x, int y, Sprite s, int w, int h) {
        g.blit(TEXTURE, x, y, s.u(), s.v(), w, h);
    }

    /** A sprite frame of an animation laid out left to right from s. */
    static void frame(GuiGraphics g, int x, int y, Sprite s, int frame) {
        g.blit(TEXTURE, x, y, s.u() + (frame % FRAMES) * s.w(), s.v(), s.w(), s.h());
    }

    static void blitAlpha(GuiGraphics g, int x, int y, Sprite s, float alpha) {
        RenderSystem.enableBlend();
        g.setColor(1f, 1f, 1f, alpha);
        blit(g, x, y, s);
        g.setColor(1f, 1f, 1f, 1f);
    }

    // ---- fill() drawing for the fallback: vanilla-shaped bevels in soul-fire colours

    static void panel(GuiGraphics g, int x, int y, int w, int h) {
        g.fill(x + 1, y, x + w - 1, y + h, 0xFF000000);
        g.fill(x, y + 1, x + w, y + h - 1, 0xFF000000);
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, PANEL_BG);
        g.fill(x + 1, y + 1, x + w - 2, y + 3, PANEL_HI);
        g.fill(x + 1, y + 1, x + 3, y + h - 2, PANEL_HI);
        g.fill(x + 2, y + h - 3, x + w - 1, y + h - 1, PANEL_LO);
        g.fill(x + w - 3, y + 2, x + w - 1, y + h - 1, PANEL_LO);
    }

    /** A sunken well (slot, gauge, info panel): dark top-left, light bottom-right, like vanilla's slots. */
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
