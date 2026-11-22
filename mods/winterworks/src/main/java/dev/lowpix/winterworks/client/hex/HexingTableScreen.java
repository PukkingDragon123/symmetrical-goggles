package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.hex.Hexing;
import dev.lowpix.winterworks.hex.HexingTableMenu;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import it.unimi.dsi.fastutil.objects.Object2IntMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.Holder;
import net.minecraft.core.IdMap;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import org.jetbrains.annotations.Nullable;

/**
 * The Hexing screen (docs/HEXES_UPDATE.md section 2), built on the sheet textures/gui/hexing_table.png (region map:
 * {@link HexGui}). Left, the Soul Tank gauge: souls rise in the fill and a swirl of them turns inside it. Right, the
 * hexes: the lesser hex, the sin hex and, chained shut, the hidden curse. Each hex names its curse in cursed glyphs that
 * resolve into the real name while you hover it; click one to choose it. In the middle the HEX rune button ignites
 * when pressed and the souls drain into it. Sounds on hover, click and hex.
 */
public class HexingTableScreen extends AbstractContainerScreen<HexingTableMenu> {
    private static final Hexing.Kind[] KINDS = {Hexing.Kind.LESSER, Hexing.Kind.SIN};
    private static final int HIDDEN_ROW = 2, HOVER_BUTTON = 3;
    private static final int PRESS_TICKS = 2, IGNITE_END = PRESS_TICKS + HexGui.IGNITE_FRAMES * HexGui.IGNITE_TICKS, FADE = 12;

    private final RandomSource random = RandomSource.create();
    private final float[] reveal = new float[3], oReveal = new float[3];
    private final List<Soul> souls = new ArrayList<>();
    private int selected;
    private int hovered = -1;
    private int ticks;
    private int igniteAt = -1000, deniedAt = -1000, successAt = -1000, hiddenAt = -1000;
    private int lastHexes = -1;
    private float fill, oFill;
    private boolean fillKnown;

    /** A soul drifting over the screen: drained from the tank into the rune, orbiting it, or bursting from the book. */
    private static final class Soul {
        static final int ORBIT = 0, DRAIN = 1, BURST = 2;
        final int kind, life;
        float x, y, ox, oy, vx, vy, angle, radius, spin, sx, sy;
        int age;

        Soul(int kind, float x, float y, int life) {
            this.kind = kind;
            this.x = this.ox = this.sx = x;
            this.y = this.oy = this.sy = y;
            this.life = life;
        }
    }

    public HexingTableScreen(HexingTableMenu menu, Inventory inventory, Component title) {
        super(menu, inventory, title);
        imageWidth = HexGui.W;
        imageHeight = HexGui.H;
    }

    @Override
    protected void init() {
        super.init();
        titleLabelX = HexGui.TITLE_X;
        titleLabelY = HexGui.TITLE_Y;
        inventoryLabelX = HexGui.INV_LABEL_X;
        inventoryLabelY = HexGui.INV_LABEL_Y;
        HexGui.forgetTexture();
    }

    // ------------------------------------------------------------------------------------------------ state

    /** The hex makes sense for this book (it may still lack souls, elixir or a tank). */
    private boolean exists(int i) {
        if (i < 0 || i >= KINDS.length) {
            return false;
        }
        int p = menu.problem(KINDS[i]);
        return p == Hexing.OK || p == Hexing.NO_TANK || p == Hexing.NO_ELIXIR || p == Hexing.NO_SOULS || p == Hexing.NO_BLOOD;
    }

    private boolean ready(int i) {
        return i >= 0 && i < KINDS.length && menu.problem(KINDS[i]) == Hexing.OK;
    }

    private boolean creative() {
        return minecraft != null && minecraft.player != null && minecraft.player.getAbilities().instabuild;
    }

    @Nullable
    private Holder<Enchantment> holder(int id) {
        if (id < 0 || minecraft == null || minecraft.level == null) {
            return null;
        }
        IdMap<Holder<Enchantment>> ids = minecraft.level.registryAccess().registryOrThrow(Registries.ENCHANTMENT).asHolderIdMap();
        return ids.byId(id);
    }

    /** The curse a hex binds: the planned lesser curse, or the sin. */
    @Nullable
    private Holder<Enchantment> curse(int i) {
        return i == 0 ? holder(menu.lesserCurseId()) : i == 1 ? holder(menu.sinId()) : null;
    }

    private static String shortName(String name) {
        return name.startsWith("Curse of ") ? name.substring("Curse of ".length()) : name;
    }

    private long seed(int i) {
        return menu.seed() * 31L + i * 977L;
    }

    @Override
    protected void containerTick() {
        super.containerTick();
        ticks++;
        for (int i = 0; i < reveal.length; i++) {
            oReveal[i] = reveal[i];
            boolean on = hovered == i && (i == HIDDEN_ROW || exists(i) && curse(i) != null);
            float max = i == HIDDEN_ROW ? 0.3f : 1f;   // the hidden curse never quite gives up its name
            reveal[i] = on ? Math.min(max, reveal[i] + 0.055f) : Math.max(0f, reveal[i] - 0.09f);
        }
        float target = menu.capacity() <= 0 ? 0f : Mth.clamp(menu.souls() / (float) menu.capacity(), 0f, 1f);
        oFill = fill;
        if (!fillKnown) {
            fill = oFill = target;
            fillKnown = menu.capacity() > 0;
        } else {
            fill += (target - fill) * 0.12f;
        }
        if (!exists(selected) && exists(1 - selected)) {
            selected = 1 - selected;
        }
        if (menu.hexes() != lastHexes) {
            if (lastHexes >= 0) {
                success();
            }
            lastHexes = menu.hexes();
        }
        tickSouls();
    }

    private void success() {
        successAt = ticks;
        if (menu.lastHexHidHidden()) {
            hiddenAt = ticks;
            sound(WWSounds.HEXED_BOOK_WHISPER, 0.5f, 0.9f);
        }
        sound(SoundEvents.SOUL_ESCAPE.value(), 0.6f, 1f);
        for (int k = 0; k < 16; k++) {
            Soul s = new Soul(Soul.BURST, HexGui.BOOK_SLOT.cx(), HexGui.BOOK_SLOT.cy(), 14 + random.nextInt(12));
            float a = random.nextFloat() * Mth.TWO_PI, v = 0.8f + random.nextFloat() * 1.5f;
            s.vx = Mth.cos(a) * v;
            s.vy = Mth.sin(a) * v - 1.0f;
            souls.add(s);
        }
    }

    // ------------------------------------------------------------------------------------------------ souls

    private float tankTop() {
        return HexGui.TANK_BOTTOM - HexGui.TANK.h() * fill;
    }

    private void tickSouls() {
        float bx = HexGui.HEX_BUTTON.cx(), by = HexGui.HEX_BUTTON.cy();
        int since = ticks - igniteAt;
        if (since >= 0 && since < IGNITE_END && fill > 0.01f) {   // the souls drain into the rune
            for (int k = 0; k < 2; k++) {
                Soul s = new Soul(Soul.DRAIN, HexGui.TANK.x() + 3 + random.nextFloat() * 10, tankTop() + 2, 14 + random.nextInt(6));
                s.vx = (random.nextFloat() - 0.5f) * 6f;
                souls.add(s);
            }
        }
        boolean lure = hovered == HOVER_BUTTON && ready(selected);
        long orbiting = souls.stream().filter(s -> s.kind == Soul.ORBIT).count();
        if ((lure || since >= 0 && since < IGNITE_END) && orbiting < 10 && random.nextFloat() < 0.4f) {
            Soul s = new Soul(Soul.ORBIT, bx, by, 24 + random.nextInt(20));
            s.angle = random.nextFloat() * Mth.TWO_PI;
            s.radius = 18f + random.nextFloat() * 4f;
            s.spin = (0.09f + random.nextFloat() * 0.05f) * (random.nextBoolean() ? 1 : -1);
            souls.add(s);
        }
        for (Iterator<Soul> it = souls.iterator(); it.hasNext(); ) {
            Soul s = it.next();
            s.ox = s.x;
            s.oy = s.y;
            s.age++;
            float t = s.age / (float) s.life;
            switch (s.kind) {
                case Soul.ORBIT -> {
                    s.angle += s.spin;
                    s.radius = Math.max(3f, s.radius - 0.45f);
                    s.x = bx + Mth.cos(s.angle) * s.radius;
                    s.y = by + Mth.sin(s.angle) * s.radius * 0.7f;
                }
                case Soul.DRAIN -> {   // up out of the tank, arcing over into the rune
                    float e = t * t * (3 - 2 * t);
                    float cx = (s.sx + bx) / 2 + s.vx, cy = Math.min(s.sy, by) - 14;
                    float u = 1 - e;
                    s.x = u * u * s.sx + 2 * u * e * cx + e * e * bx;
                    s.y = u * u * s.sy + 2 * u * e * cy + e * e * by;
                }
                default -> {
                    s.x += s.vx;
                    s.y += s.vy;
                    s.vx *= 0.9f;
                    s.vy = s.vy * 0.9f - 0.05f;
                }
            }
            if (s.age >= s.life) {
                it.remove();
            }
        }
    }

    private void drawSouls(GuiGraphics g, int x0, int y0, float partial) {
        for (Soul s : souls) {
            float life = (s.age + partial) / s.life;
            float a = Mth.clamp(Math.min(life / 0.2f, (1f - life) / 0.3f), 0f, 1f);
            int ix = Math.round(x0 + Mth.lerp(partial, s.ox, s.x)), iy = Math.round(y0 + Mth.lerp(partial, s.oy, s.y));
            float tx = s.ox - s.x, ty = s.oy - s.y;
            g.fill(ix + Math.round(tx * 2), iy + Math.round(ty * 2), ix + Math.round(tx * 2) + 1, iy + Math.round(ty * 2) + 1,
                    HexGui.argb(a * 0.45f, HexGui.SOUL));
            g.fill(ix - 2, iy - 1, ix + 2, iy + 1, HexGui.argb(a * 0.3f, HexGui.SOUL));
            g.fill(ix - 1, iy - 2, ix + 1, iy + 2, HexGui.argb(a * 0.3f, HexGui.SOUL));
            g.fill(ix - 1, iy - 1, ix + 1, iy + 1, HexGui.argb(a, HexGui.SOUL_PALE));
        }
    }

    // ------------------------------------------------------------------------------------------------ drawing

    @Override
    protected void renderBg(GuiGraphics g, float partial, int mouseX, int mouseY) {
        int x = leftPos, y = topPos;
        float t = ticks + partial;
        boolean sheet = !HexGui.fallback();
        if (sheet) {
            HexGui.blit(g, x, y, HexGui.PANEL);
        } else {
            drawFallbackPanel(g, x, y);
        }
        drawTank(g, x, y, t, partial, sheet);
        drawGhosts(g, x, y, t, sheet);
        for (int i = 0; i < HexGui.ROWS; i++) {
            drawRow(g, x, y, i, t, partial, sheet);
        }
        drawButton(g, x, y, t, sheet);
        drawSouls(g, x, y, partial);
        int sinceSuccess = ticks - successAt;
        if (sinceSuccess >= 0 && sinceSuccess < 10) {   // the book flares as the hex takes hold
            HexGui.Rect b = HexGui.BOOK_SLOT;
            g.fill(x + b.x() + 1, y + b.y() + 1, x + b.x() + b.w() - 1, y + b.y() + b.h() - 1,
                    HexGui.argb((1f - sinceSuccess / 10f) * 0.6f, HexGui.SOUL_PALE));
        }
        int sinceHidden = ticks - hiddenAt;   // a hidden curse slipped in: the table goes dark for a few flickers
        if (sinceHidden >= 0 && sinceHidden < 20 && (sinceHidden < 3 || (sinceHidden >= 7 && sinceHidden < 9) || sinceHidden == 14)) {
            g.fill(x + 3, y + 3, x + imageWidth - 3, y + 70, 0xC0050308);
        }
    }

    private void drawFallbackPanel(GuiGraphics g, int x, int y) {
        HexGui.panel(g, x, y, imageWidth, imageHeight);
        HexGui.Rect tank = HexGui.TANK;
        HexGui.well(g, x + tank.x() - 1, y + tank.y() - 1, tank.w() + 2, tank.h() + 2, 0xFF0A1230);
        g.fill(x + tank.x() - 3, y + tank.y() - 4, x + tank.x() + tank.w() + 3, y + tank.y() - 2, 0xFFC97E1B);
        g.fill(x + tank.x() - 3, y + HexGui.TANK_BOTTOM + 1, x + tank.x() + tank.w() + 3, y + HexGui.TANK_BOTTOM + 3, 0xFFC97E1B);
        for (HexGui.Rect r : new HexGui.Rect[]{HexGui.BOOK_SLOT, HexGui.ELIXIR_SLOT, HexGui.BLOOD_SLOT}) {
            HexGui.border(g, x + r.x() - 1, y + r.y() - 1, r.w() + 2, r.h() + 2, 0xFFC97E1B);
            HexGui.well(g, x + r.x(), y + r.y(), r.w(), r.h(), HexGui.WELL);
        }
        HexGui.well(g, x + HexGui.ROW_X - 1, y + HexGui.ROW_Y - 1, HexGui.ROW_W + 2, HexGui.ROW_H * HexGui.ROWS + 2, 0xFF100C12);
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                HexGui.well(g, x + HexingTableMenu.INV_X - 1 + col * 18, y + HexingTableMenu.INV_Y - 1 + row * 18, 18, 18, HexGui.WELL);
            }
        }
        for (int col = 0; col < 9; col++) {
            HexGui.well(g, x + HexingTableMenu.INV_X - 1 + col * 18, y + HexingTableMenu.HOTBAR_Y - 1, 18, 18, HexGui.WELL);
        }
    }

    private void drawTank(GuiGraphics g, int x, int y, float t, float partial, boolean sheet) {
        HexGui.Rect r = HexGui.TANK;
        int h = Math.round(r.h() * Mth.lerp(partial, oFill, fill));
        int tx = x + r.x(), bottom = y + HexGui.TANK_BOTTOM;
        if (h > 0) {
            if (sheet) {
                int scroll = (ticks / 2) % HexGui.TANK_SCROLL;
                HexGui.Sprite f = HexGui.TANK_FILL;
                g.blit(HexGui.TEXTURE, tx, bottom - h, f.u(), f.v() + scroll + r.h() - h, f.w(), h);
                if (h >= HexGui.SWIRL_SIZE) {
                    g.enableScissor(tx, bottom - h, tx + r.w(), bottom);
                    HexGui.blit(g, tx, bottom - h + (h - HexGui.SWIRL_SIZE) / 2, HexGui.swirl(ticks / 3));
                    g.disableScissor();
                }
                if (h < r.h()) {
                    HexGui.blit(g, tx, bottom - h - 1, HexGui.TANK_SURFACE);
                }
            } else {
                g.fillGradient(tx, bottom - h, tx + r.w(), bottom, 0xFF4FE3E0, 0xFF0F2A55);
                for (int c = 0; c < r.w(); c++) {
                    int dy = Mth.sin(t * 0.22f + c * 0.9f) > 0.35f ? -1 : 0;
                    g.fill(tx + c, bottom - h + dy, tx + c + 1, bottom - h + dy + 1, 0xFFB4FFF5);
                }
            }
        }
        if (menu.tanks() == 0) {   // nothing to draw from: a dead tank and a flickering glyph
            g.fill(tx, y + r.y(), tx + r.w(), bottom, 0x70000000);
            if (((int) (t / 6)) % 3 != 0) {
                if (sheet) {
                    HexGui.glyph(g, tx + 5, y + r.y() + r.h() / 2 - 4, (int) (t / 18), HexGui.SOUL_DEEP, 0.9f);
                } else {
                    g.drawString(font, Component.literal("x").withStyle(CursedGlyphs.ALT), tx + 5, y + r.y() + r.h() / 2 - 4,
                            HexGui.argb(0.9f, HexGui.SOUL_DEEP), false);
                }
            }
        }
        if (sheet) {
            HexGui.blit(g, tx, y + r.y(), HexGui.TANK_GLASS);
        } else {
            for (int k = 1; k < 6; k++) {
                int ty = bottom - k * r.h() / 6;
                g.fill(tx + r.w() - 3, ty, tx + r.w(), ty + 1, 0x90C97E1B);
            }
            g.fill(tx + 1, y + r.y() + 1, tx + 2, bottom - 1, 0x30FFFFFF);
        }
    }

    private void drawGhosts(GuiGraphics g, int x, int y, float t, boolean sheet) {
        float a = 0.55f + 0.2f * Mth.sin(t * 0.12f);
        if (menu.book().isEmpty()) {
            int bx = x + HexingTableMenu.BOOK_X, by = y + HexingTableMenu.BOOK_Y;
            if (sheet) {
                HexGui.blitAlpha(g, bx, by, HexGui.GHOST_BOOK, a);
            } else {
                g.fill(bx + 4, by + 3, bx + 12, by + 13, HexGui.argb(a * 0.5f, HexGui.SOUL_DEEP));
            }
        }
        if (menu.elixir().isEmpty()) {
            int ex = x + HexingTableMenu.ELIXIR_X, ey = y + HexingTableMenu.ELIXIR_Y;
            if (sheet) {
                HexGui.blitAlpha(g, ex, ey, HexGui.GHOST_ELIXIR, a);
            } else {
                g.fill(ex + 7, ey + 2, ex + 9, ey + 5, HexGui.argb(a * 0.5f, HexGui.SOUL_DEEP));
                g.fill(ex + 4, ey + 5, ex + 12, ey + 14, HexGui.argb(a * 0.5f, HexGui.SOUL_DEEP));
            }
        }
        if (menu.bloodStack().isEmpty()) {
            int bx = x + HexingTableMenu.BLOOD_X, by = y + HexingTableMenu.BLOOD_Y;
            if (sheet) {
                HexGui.blitAlpha(g, bx, by, HexGui.GHOST_BLOOD, a);
            } else {
                g.fill(bx + 7, by + 2, bx + 9, by + 6, HexGui.argb(a * 0.5f, 0x5A1A1E));
                g.fill(bx + 4, by + 6, bx + 12, by + 14, HexGui.argb(a * 0.5f, 0x5A1A1E));
            }
        }
    }

    private void drawRow(GuiGraphics g, int x, int y, int i, float t, float partial, boolean sheet) {
        HexGui.Rect r = HexGui.row(i);
        int rx = x + r.x(), ry = y + r.y();
        boolean locked = i == HIDDEN_ROW || !exists(i);
        boolean ready = ready(i);
        boolean lit = !locked && (selected == i || hovered == i);
        HexGui.Sprite s = locked ? HexGui.ROW_LOCKED : !ready ? HexGui.ROW_DISABLED : lit ? HexGui.ROW_HOVER : HexGui.ROW_NORMAL;
        if (sheet) {
            HexGui.blit(g, rx, ry, s);
        } else {
            int fill = locked ? 0xFF120E14 : !ready ? 0xFF1A1520 : lit ? 0xFF16303A : 0xFF221B24;
            g.fill(rx, ry, rx + r.w(), ry + r.h(), fill);
            HexGui.border(g, rx, ry, r.w(), r.h(), lit && ready ? 0xFF1CB4C4 : 0xFF3A2F37);
            g.fill(rx + 1, ry + 1, rx + 18, ry + r.h() - 1, 0xFF0D0A10);
            if (locked) {   // a chain across a locked row
                for (int k = 0; k < 9; k++) {   // 9 links in the 73 px row
                    g.fill(rx + 21 + k * 5, ry + 9, rx + 25 + k * 5, ry + 11, 0xFF5F5153);
                }
                g.fill(rx + 6, ry + 7, rx + 12, ry + 14, 0xFFC97E1B);
            }
        }
        if (locked) {
            return;   // no cost icon or text on a locked row
        }
        Hexing.Kind k = KINDS[i];
        boolean affordable = creative() || menu.elixir().getCount() >= k.elixir();
        if (sheet) {
            HexGui.blit(g, rx + HexGui.COST_DX, ry + HexGui.COST_DY, HexGui.cost(k.elixir(), affordable));
        } else {
            for (int n = 0; n < k.elixir(); n++) {
                g.fill(rx + 4 + n * 4, ry + 8, rx + 7 + n * 4, ry + 12, affordable ? 0xFF4FE3E0 : 0xFF3A2F37);
            }
        }
        Holder<Enchantment> h = curse(i);
        String name = h == null ? "??????" : shortName(h.value().description().getString());
        boolean sin = i == 1;
        float pulse = selected == i ? 0.75f + 0.25f * Mth.sin(t * 0.2f) : 1f;
        int glyph = !ready ? HexGui.GLYPH_DIM : HexGui.mix(lit ? pulse : 0f, sin ? HexGui.SIN_GLYPH_IDLE : HexGui.GLYPH_IDLE, sin ? HexGui.SIN_GLYPH_LIT : HexGui.GLYPH_LIT);
        int letters = sin ? HexGui.CRIMSON_LIT : HexGui.GLYPH_LIT;
        CursedGlyphs.draw(g, font, name, rx + HexGui.TEXT_DX, ry + HexGui.TEXT_DY, r.w() - HexGui.TEXT_DX - 3, glyph, letters,
                Mth.lerp(partial, oReveal[i], reveal[i]), t, seed(i), ready ? 1f : 0.7f, sheet);
    }

    private void drawButton(GuiGraphics g, int x, int y, float t, boolean sheet) {
        HexGui.Rect r = HexGui.HEX_BUTTON;
        boolean enabled = ready(selected);
        boolean hover = hovered == HOVER_BUTTON;
        int since = ticks - igniteAt, denied = ticks - deniedAt;
        boolean igniting = since >= 0 && since < IGNITE_END + FADE;
        int shake = denied >= 0 && denied < 8 ? Math.round(Mth.sin(denied * 2.4f) * 2f) : 0;
        int bx = x + r.x() + shake, by = y + r.y();
        if (sheet) {
            if (hover && enabled || igniting) {
                float halo = igniting ? 1f : 0.7f + 0.3f * Mth.sin(t * 0.2f);
                HexGui.blitAlpha(g, bx, by, HexGui.BUTTON_HALO, halo);
            }
            if (since >= 0 && since < PRESS_TICKS || denied >= 0 && denied < 3) {
                HexGui.blit(g, bx, by, HexGui.BUTTON_PRESSED);
            } else if (since >= PRESS_TICKS && since < IGNITE_END) {
                HexGui.blit(g, bx, by, HexGui.ignition((since - PRESS_TICKS) / HexGui.IGNITE_TICKS));
            } else {
                HexGui.blit(g, bx, by, !enabled ? HexGui.BUTTON_OFF : hover ? HexGui.BUTTON_HOVER : HexGui.BUTTON);
                if (since >= IGNITE_END && since < IGNITE_END + FADE) {   // the lit rune fades back
                    HexGui.blitAlpha(g, bx, by, HexGui.ignition(HexGui.IGNITE_FRAMES - 1), 1f - (since - IGNITE_END) / (float) FADE);
                }
            }
        } else {
            float breathe = 0.5f + 0.5f * Mth.sin(t * 0.14f);
            boolean lit = since >= 0 && since < IGNITE_END;
            int rim = lit ? 0xFFFFFFFF : !enabled ? 0xFF3A2F37 : 0xFF000000 | HexGui.mix(hover ? 1f : breathe * 0.6f, 0xC97E1B, 0xFAD55A);
            int core = lit ? 0xFF4FE3E0 : !enabled ? 0xFF17121A : hover ? 0xFF16404D : 0xFF102A33;
            int cx = bx + r.w() / 2, cy = by + r.h() / 2;
            hexagon(g, cx, cy, 15, 13, rim);
            hexagon(g, cx, cy, 13, 11, core);
            Component word = Component.translatable("container.winterworks.hexing_table.button").withStyle(ChatFormatting.BOLD);
            int wc = lit ? 0xFF0A1230 : !enabled ? 0xFF4A3E44 : 0xFF000000 | HexGui.mix(hover ? 1f : breathe, HexGui.SOUL, 0xFFFFFF);
            g.drawString(font, word, cx - font.width(word) / 2 + 1, cy - 3, wc, false);
        }
    }

    /** A flat-topped hexagon of fills (the fallback's HEX rune). */
    private static void hexagon(GuiGraphics g, int cx, int cy, int halfW, int halfH, int color) {
        for (int dy = -halfH; dy < halfH; dy++) {
            int ady = dy < 0 ? -dy - 1 : dy;
            int inset = Math.max(0, (ady - halfH / 2) * halfW / (halfH * 2));
            g.fill(cx - halfW + inset, cy + dy, cx + halfW - inset, cy + dy + 1, color);
        }
    }

    @Override
    protected void renderLabels(GuiGraphics g, int mouseX, int mouseY) {
        g.drawString(font, title, titleLabelX, titleLabelY, 0xFF000000 | HexGui.TITLE_COLOR, false);
        g.drawString(font, playerInventoryTitle, inventoryLabelX, inventoryLabelY, 0xFF000000 | HexGui.LABEL_COLOR, false);
    }

    // ------------------------------------------------------------------------------------------------ tooltips and sounds

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        double mx = mouseX - leftPos, my = mouseY - topPos;
        int now = -1;
        for (int i = 0; i < HexGui.ROWS; i++) {
            if (HexGui.row(i).contains(mx, my)) {
                now = i;
            }
        }
        if (HexGui.HEX_BUTTON.contains(mx, my)) {
            now = HOVER_BUTTON;
        }
        if (now != hovered) {
            if (now == HOVER_BUTTON && ready(selected)) {
                sound(SoundEvents.SOUL_ESCAPE.value(), 1.3f, 0.6f);
            } else if (now == HIDDEN_ROW) {
                sound(WWSounds.HEXING_TABLE_WHISPER, 0.7f, 0.4f);
            } else if (now >= 0 && now < KINDS.length && exists(now)) {
                sound(WWSounds.HEXING_TABLE_WHISPER, 1.3f + 0.25f * now, 0.45f);
            }
            hovered = now;
        }
        super.render(g, mouseX, mouseY, partial);
        renderTooltip(g, mouseX, mouseY);
        if (hoveredSlot != null && hoveredSlot.hasItem()) {
            return;
        }
        List<Component> tip = null;
        if (HexGui.TANK.contains(mx, my)) {
            tip = tankTooltip();
        } else if (hovered == HIDDEN_ROW) {
            tip = hiddenTooltip(partial);
        } else if (hovered >= 0 && hovered < KINDS.length) {
            tip = hexTooltip(hovered, partial);
        } else if (hovered == HOVER_BUTTON) {
            tip = buttonTooltip();
        }
        if (tip != null) {
            g.renderComponentTooltip(font, tip, mouseX, mouseY);
        }
    }

    private List<Component> tankTooltip() {
        if (menu.tanks() == 0) {
            return List.of(Component.translatable("container.winterworks.hexing_table.problem.5").withColor(HexGui.BAD));
        }
        List<Component> tip = new ArrayList<>();
        tip.add(Component.translatable("container.winterworks.hexing_table.souls", menu.souls(), menu.capacity()).withColor(HexGui.SOUL));
        if (menu.tanks() > 1) {
            tip.add(Component.translatable("container.winterworks.hexing_table.tanks", menu.tanks()).withColor(HexGui.TEXT_DIM));
        }
        return tip;
    }

    private List<Component> buttonTooltip() {
        Hexing.Kind k = KINDS[selected];
        int p = menu.problem(k);
        if (p != Hexing.OK) {
            return List.of(problemText(k, p).copy().withColor(HexGui.BAD));
        }
        return List.of(Component.translatable("container.winterworks.hexing_table.button.ready").withColor(HexGui.SOUL_PALE),
                Component.translatable("container.winterworks.hexing_table." + (selected == 0 ? "lesser" : "sin"))
                        .withColor(selected == 0 ? HexGui.SOUL : HexGui.CRIMSON));
    }

    private List<Component> hiddenTooltip(float partial) {
        float rv = Mth.lerp(partial, oReveal[HIDDEN_ROW], reveal[HIDDEN_ROW]);
        return List.of(Component.translatable("container.winterworks.hexing_table.hidden").withColor(HexGui.HIDDEN),
                CursedGlyphs.component("Curse of the Unseen", rv, ticks + partial, seed(HIDDEN_ROW), 0x6A5A88, HexGui.HIDDEN),
                Component.translatable("container.winterworks.hexing_table.hidden.desc").withColor(HexGui.TEXT_DIM),
                Component.translatable("container.winterworks.hexing_table.hidden.nameless").withStyle(ChatFormatting.ITALIC)
                        .withColor(0x7A5FA8));
    }

    private List<Component> hexTooltip(int i, float partial) {
        Hexing.Kind k = KINDS[i];
        List<Component> tip = new ArrayList<>();
        tip.add(Component.translatable("container.winterworks.hexing_table." + (i == 0 ? "lesser" : "sin"))
                .withColor(i == 0 ? HexGui.SOUL : HexGui.CRIMSON));
        int p = menu.problem(k);
        if (!exists(i)) {
            tip.add(problemText(k, p).copy().withColor(0x8A86A0));
            return tip;
        }
        ItemEnchantments stored = Hexing.stored(menu.book());
        Holder<Enchantment> h = curse(i);
        float rv = Mth.lerp(partial, oReveal[i], reveal[i]);
        Component name = h == null ? Component.literal("?") : CursedGlyphs.component(h.value().description().getString(), rv,
                ticks + partial, seed(i) + 5, i == 0 ? HexGui.GLYPH_IDLE : 0xB0463F, i == 0 ? HexGui.SOUL : HexGui.CRIMSON);
        if (i == 0) {
            tip.add(Component.translatable("container.winterworks.hexing_table.lesser.desc").withColor(HexGui.TEXT_DIM));
            for (Object2IntMap.Entry<Holder<Enchantment>> e : stored.entrySet()) {
                int to = Hexing.upgradeLevel(e.getKey(), e.getIntValue());
                if (to != e.getIntValue()) {
                    tip.add(Component.literal("  ").append(Enchantment.getFullname(e.getKey(), e.getIntValue()).copy().withColor(0xB8C4CC))
                            .append(Component.literal(" → ").withColor(HexGui.SOUL))
                            .append(Component.translatable("enchantment.level." + to).withColor(HexGui.SOUL_PALE)));
                }
            }
            tip.add(Component.translatable("container.winterworks.hexing_table.power", Hexing.levelsGained(stored)).withColor(HexGui.TEXT));
            tip.add(Component.translatable("container.winterworks.hexing_table.attaches", name).withColor(HexGui.TEXT_DIM));
        } else {
            Holder<Enchantment> src = holder(menu.sinSourceId());
            tip.add(Component.translatable("container.winterworks.hexing_table.sin.desc",
                    src == null ? Component.literal("?") : src.value().description()).withColor(HexGui.TEXT_DIM));
            tip.add(Component.translatable("container.winterworks.hexing_table.becomes", name).withColor(HexGui.TEXT_DIM));
        }
        tip.add(Component.translatable("container.winterworks.hexing_table.hidden_chance").withStyle(ChatFormatting.ITALIC).withColor(0x7A5FA8));
        tip.add(CommonComponents.EMPTY);
        tip.add(costLine(k));
        int minutes = k == Hexing.Kind.SIN ? Hexing.SIN_MINUTES : Hexing.lesserMinutes(stored);
        String tier = k == Hexing.Kind.LESSER ? "lesser" : "sin";
        if (menu.spares(k)) {
            tip.add(Component.translatable("container.winterworks.hexing_table.spared." + tier).withColor(HexGui.BLOOD));
        } else {
            tip.add(Component.translatable("container.winterworks.hexing_table.hexed", minutes).withColor(0x4FA3B5));
            tip.add(Component.translatable("container.winterworks.hexing_table.spare_with." + tier)
                    .withStyle(ChatFormatting.ITALIC).withColor(0x9A4A50));
        }
        if (p != Hexing.OK) {
            tip.add(problemText(k, p).copy().withColor(HexGui.BAD));
        } else if (selected != i) {
            tip.add(Component.translatable("container.winterworks.hexing_table.select").withColor(HexGui.TEXT_DIM));
        }
        return tip;
    }

    private Component costLine(Hexing.Kind k) {
        boolean free = creative();
        boolean elixirOk = free || menu.elixir().getCount() >= k.elixir();
        boolean soulsOk = free || menu.souls() >= k.souls();
        MutableComponent c = Component.translatable("container.winterworks.hexing_table.cost.elixir", k.elixir())
                .withColor(elixirOk ? 0xA0A0A0 : HexGui.BAD);
        c.append(Component.literal(", ").withColor(0x808080));
        c.append(Component.translatable("container.winterworks.hexing_table.cost.souls", k.souls()).withColor(soulsOk ? 0xA0A0A0 : HexGui.BAD));
        if (k.blood() > 0) {
            boolean bloodOk = free || menu.blood() >= k.blood();
            c.append(Component.literal(", ").withColor(0x808080));
            c.append(Component.translatable("container.winterworks.hexing_table.cost.blood", k.blood()).withColor(bloodOk ? 0xA0A0A0 : HexGui.BAD));
        }
        return c;
    }

    private Component problemText(Hexing.Kind k, int p) {
        String base = "container.winterworks.hexing_table.";
        String tier = k == Hexing.Kind.LESSER ? "lesser" : "sin";
        return switch (p) {
            case Hexing.NO_BOOK -> Component.translatable(base + "problem.1");
            case Hexing.NOT_A_BOOK -> Component.translatable(menu.book().is(WWItems.HEXED_BOOK) ? base + "already" : base + "problem.2");
            case Hexing.NOTHING_TO_HEX -> Component.translatable(base + "problem.3." + tier);
            case Hexing.NO_CURSE -> Component.translatable(base + "problem.4." + tier);
            case Hexing.NO_TANK -> Component.translatable(base + "problem.5");
            case Hexing.NO_ELIXIR -> Component.translatable(base + "problem.6", k.elixir());
            case Hexing.NO_SOULS -> Component.translatable(base + "problem.7", k.souls());
            case Hexing.NO_BLOOD -> Component.translatable(base + "problem.8", k.blood());
            default -> Component.empty();
        };
    }

    private void sound(SoundEvent event, float pitch, float volume) {
        if (minecraft != null) {
            minecraft.getSoundManager().play(SimpleSoundInstance.forUI(event, pitch, volume));
        }
    }

    // ------------------------------------------------------------------------------------------------ input

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0) {
            double mx = mouseX - leftPos, my = mouseY - topPos;
            for (int i = 0; i < HexGui.ROWS; i++) {
                if (HexGui.row(i).contains(mx, my)) {
                    if (i < KINDS.length && exists(i)) {
                        if (selected != i) {
                            selected = i;
                            sound(SoundEvents.UI_BUTTON_CLICK.value(), i == 0 ? 0.8f : 0.6f, 0.35f);
                            sound(WWSounds.HEXING_TABLE_WHISPER, 0.9f, 0.5f);
                        }
                    } else {
                        sound(SoundEvents.CHAIN_HIT, 0.7f, 0.6f);   // chained shut
                    }
                    return true;
                }
            }
            if (HexGui.HEX_BUTTON.contains(mx, my)) {
                hex();
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    private void hex() {
        if (minecraft == null || minecraft.player == null || minecraft.gameMode == null) {
            return;
        }
        int since = ticks - igniteAt;
        if (since >= 0 && since < IGNITE_END) {
            return;   // already burning
        }
        if (ready(selected) && menu.clickMenuButton(minecraft.player, selected)) {
            minecraft.gameMode.handleInventoryButtonClick(menu.containerId, selected);
            igniteAt = ticks;
            sound(SoundEvents.FIRECHARGE_USE, 0.55f, 0.45f);
            sound(SoundEvents.SOUL_ESCAPE.value(), 0.7f, 1f);
        } else {
            deniedAt = ticks;
            sound(SoundEvents.DISPENSER_FAIL, 0.5f, 0.5f);
        }
    }

    int leftPos() {
        return leftPos;
    }

    int topPos() {
        return topPos;
    }

    @Override
    public void removed() {
        super.removed();
        souls.clear();
    }
}
