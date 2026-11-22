package dev.lowpix.winterworks.client.hex;

import com.mojang.blaze3d.systems.RenderSystem;
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
import net.minecraft.locale.Language;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import org.jetbrains.annotations.Nullable;

/**
 * The Hexing screen (docs/HEXES_UPDATE.md section 2), soul-fire blue throughout. Left, a live gauge of the souls in
 * reach; right, the two hexes (lesser and sin) written in cursed glyphs that resolve into the curse's real name while
 * you hover them (click one to choose it); below, the book and Soul Elixir slots, what the chosen hex will do, and the
 * big HEX rune button that ignites when pressed. Souls swirl round the button and rise in the gauge. Layout and
 * texture sprites: {@link HexGui} (a fill() fallback draws the same regions while the texture is missing).
 */
public class HexingTableScreen extends AbstractContainerScreen<HexingTableMenu> {
    private static final Hexing.Kind[] KINDS = {Hexing.Kind.LESSER, Hexing.Kind.SIN};
    private static final HexGui.Rect[] ROWS = {HexGui.OPTION_LESSER, HexGui.OPTION_SIN};
    private static final int HOVER_BUTTON = 2;

    private final RandomSource random = RandomSource.create();
    private final float[] reveal = new float[2], oReveal = new float[2];
    private final List<Soul> souls = new ArrayList<>();
    private int selected;
    private int hovered = -1;
    private int ticks;
    private int igniteAt = -100, deniedAt = -100, successAt = -100, hiddenAt = -100;
    private int lastHexes = -1;
    private float fill, oFill;
    private boolean fillKnown;

    /** A soul sprite floating over the screen. */
    private static final class Soul {
        static final int ORBIT = 0, RISE = 1, BURST = 2, DRIFT = 3;
        final int kind;
        float x, y, ox, oy, vx, vy, angle, radius, spin;
        int age;
        final int life;
        final float size;

        Soul(int kind, float x, float y, int life, float size) {
            this.kind = kind;
            this.x = this.ox = x;
            this.y = this.oy = y;
            this.life = life;
            this.size = size;
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

    private Hexing.Kind kind(int i) {
        return KINDS[i];
    }

    /** The option makes sense for this book (it may still lack souls, elixir or a tank). */
    private boolean exists(int i) {
        int p = menu.problem(kind(i));
        return p == Hexing.OK || p == Hexing.NO_TANK || p == Hexing.NO_ELIXIR || p == Hexing.NO_SOULS;
    }

    private boolean ready(int i) {
        return menu.problem(kind(i)) == Hexing.OK;
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

    @Nullable
    private Holder<Enchantment> curse(int i) {
        return holder(i == 0 ? menu.lesserCurseId() : menu.sinId());
    }

    private int tierColor(int i) {
        return i == 0 ? HexGui.SOUL : HexGui.CRIMSON;
    }

    private float time(float partial) {
        return ticks + partial;
    }

    @Override
    protected void containerTick() {
        super.containerTick();
        ticks++;
        for (int i = 0; i < 2; i++) {
            oReveal[i] = reveal[i];
            boolean on = hovered == i && exists(i) && curse(i) != null;
            reveal[i] = on ? Math.min(1f, reveal[i] + 0.055f) : Math.max(0f, reveal[i] - 0.09f);
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
        float bx = HexGui.BOOK_SLOT.cx(), by = HexGui.BOOK_SLOT.cy();
        for (int k = 0; k < 18; k++) {
            Soul s = new Soul(Soul.BURST, bx, by, 16 + random.nextInt(14), 0.8f + random.nextFloat() * 0.4f);
            float a = random.nextFloat() * Mth.TWO_PI;
            float v = 0.8f + random.nextFloat() * 1.6f;
            s.vx = Mth.cos(a) * v;
            s.vy = Mth.sin(a) * v - 1.2f;
            souls.add(s);
        }
    }

    // ------------------------------------------------------------------------------------------------ souls

    private void tickSouls() {
        boolean tank = menu.tanks() > 0;
        boolean live = tank && ready(selected);
        float bx = HexGui.HEX_BUTTON.cx(), by = HexGui.HEX_BUTTON.cy();
        int orbiting = 0;
        for (Soul s : souls) {
            if (s.kind == Soul.ORBIT) {
                orbiting++;
            }
        }
        if (tank && orbiting < (live ? 14 : 6) && random.nextFloat() < (live ? 0.35f : 0.12f)) {
            Soul s = new Soul(Soul.ORBIT, bx, by, 50 + random.nextInt(40), 0.7f + random.nextFloat() * 0.5f);
            s.angle = random.nextFloat() * Mth.TWO_PI;
            s.radius = 19f + random.nextFloat() * 6f;
            s.spin = (0.06f + random.nextFloat() * 0.05f) * (random.nextBoolean() ? 1 : -1);
            souls.add(s);
        }
        if (fill > 0.02f && random.nextFloat() < 0.1f + 0.25f * fill) {
            HexGui.Rect g = HexGui.GAUGE_FILL;
            Soul s = new Soul(Soul.RISE, g.x() + 2 + random.nextFloat() * (g.w() - 4), g.y() + g.h() - 1, 30 + random.nextInt(30), 0.5f);
            s.vy = -(0.4f + random.nextFloat() * 0.5f);
            souls.add(s);
        }
        if (tank && random.nextFloat() < 0.06f) {
            Soul s = new Soul(Soul.DRIFT, 28 + random.nextFloat() * 138, 58, 60 + random.nextInt(40), 0.6f + random.nextFloat() * 0.3f);
            s.vy = -(0.25f + random.nextFloat() * 0.2f);
            s.vx = (random.nextFloat() - 0.5f) * 0.2f;
            s.spin = random.nextFloat() * Mth.TWO_PI;
            souls.add(s);
        }
        float liquidTop = HexGui.GAUGE_FILL.y() + HexGui.GAUGE_FILL.h() * (1f - fill);
        for (Iterator<Soul> it = souls.iterator(); it.hasNext(); ) {
            Soul s = it.next();
            s.ox = s.x;
            s.oy = s.y;
            s.age++;
            switch (s.kind) {
                case Soul.ORBIT -> {
                    boolean lit = ticks - igniteAt < 12;
                    s.angle += s.spin * (lit ? 3f : 1f);
                    s.radius = Math.max(4f, s.radius - (live ? 0.18f : 0.08f));
                    s.x = bx + Mth.cos(s.angle) * s.radius;
                    s.y = by + Mth.sin(s.angle) * s.radius * 0.55f - s.age * 0.06f;
                }
                case Soul.RISE -> {
                    s.y += s.vy;
                    s.x += Mth.sin((s.age + s.life) * 0.3f) * 0.25f;
                    if (s.y < liquidTop) {
                        s.age = Math.max(s.age, s.life - 3);
                    }
                }
                case Soul.DRIFT -> {
                    s.y += s.vy;
                    s.x += s.vx + Mth.sin(s.age * 0.08f + s.spin) * 0.15f;
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
        boolean tex = !HexGui.fallback();
        RenderSystem.enableBlend();
        for (Soul s : souls) {
            float life = (s.age + partial) / s.life;
            float a = Mth.clamp(Math.min(life / 0.2f, (1f - life) / 0.3f), 0f, 1f) * (s.kind == Soul.DRIFT ? 0.45f : 0.9f);
            float sx = x0 + Mth.lerp(partial, s.ox, s.x), sy = y0 + Mth.lerp(partial, s.oy, s.y);
            if (s.kind == Soul.RISE) {
                HexGui.Rect r = HexGui.GAUGE_FILL;
                g.enableScissor(x0 + r.x(), y0 + r.y(), x0 + r.x() + r.w(), y0 + r.y() + r.h());
            }
            if (tex) {
                g.pose().pushPose();
                g.pose().translate(sx, sy, 0);
                g.pose().scale(s.size, s.size, 1f);
                g.setColor(1f, 1f, 1f, a);
                HexGui.frame(g, -4, -4, HexGui.SOUL_FRAME, (s.age / 4) + (int) (s.size * 7));
                g.setColor(1f, 1f, 1f, 1f);
                g.pose().popPose();
            } else {
                int ix = Math.round(sx), iy = Math.round(sy);
                int r = s.size > 0.9f ? 2 : 1;
                g.fill(ix - r - 1, iy - r, ix + r + 1, iy + r, HexGui.argb(a * 0.35f, HexGui.SOUL));
                g.fill(ix - r, iy - r - 1, ix + r, iy + r + 1, HexGui.argb(a * 0.35f, HexGui.SOUL));
                g.fill(ix - 1, iy - 1, ix + 1, iy + 1, HexGui.argb(a, HexGui.SOUL_PALE));
                if (s.kind == Soul.ORBIT || s.kind == Soul.BURST) {   // a little tail
                    float tx = s.ox - s.x, ty = s.oy - s.y;
                    g.fill(ix + Math.round(tx * 2) - 1, iy + Math.round(ty * 2) - 1, ix + Math.round(tx * 2), iy + Math.round(ty * 2),
                            HexGui.argb(a * 0.5f, HexGui.SOUL));
                }
            }
            if (s.kind == Soul.RISE) {
                g.disableScissor();
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ drawing

    @Override
    protected void renderBg(GuiGraphics g, float partial, int mouseX, int mouseY) {
        int x = leftPos, y = topPos;
        float t = time(partial);
        boolean tex = !HexGui.fallback();
        if (tex) {
            g.blit(HexGui.TEXTURE, x, y, 0, 0, imageWidth, imageHeight);
        } else {
            drawFallbackPanel(g, x, y);
        }
        drawGauge(g, x, y, t, partial, tex);
        drawSlotHints(g, x, y, t, tex);
        for (int i = 0; i < 2; i++) {
            drawOption(g, x, y, i, mouseX, mouseY, t, partial, tex);
        }
        drawInfo(g, x, y, t);
        drawButton(g, x, y, mouseX, mouseY, t, tex);
        drawSouls(g, x, y, partial);
        // a hidden curse slipped in: the whole table goes dark for a few flickers
        int sinceHidden = ticks - hiddenAt;
        if (sinceHidden >= 0 && sinceHidden < 20 && (sinceHidden < 3 || (sinceHidden >= 7 && sinceHidden < 9) || sinceHidden == 14)) {
            g.fill(x + 2, y + 2, x + imageWidth - 2, y + 92, 0xC0050308);
        }
    }

    private void drawFallbackPanel(GuiGraphics g, int x, int y) {
        HexGui.panel(g, x, y, imageWidth, imageHeight);
        // a soul-blue rule under the title, with rivets
        g.fill(x + 7, y + 14, x + imageWidth - 7, y + 15, HexGui.argb(0.35f, HexGui.SOUL));
        for (int[] p : new int[][]{{4, 4}, {imageWidth - 6, 4}, {4, imageHeight - 6}, {imageWidth - 6, imageHeight - 6}}) {
            g.fill(x + p[0], y + p[1], x + p[0] + 2, y + p[1] + 2, 0xFF6A5A2E);
        }
        HexGui.Rect gg = HexGui.GAUGE;
        HexGui.well(g, x + gg.x(), y + gg.y(), gg.w(), gg.h(), 0xFF07161C);
        for (HexGui.Rect r : new HexGui.Rect[]{HexGui.BOOK_SLOT, HexGui.ELIXIR_SLOT}) {
            HexGui.well(g, x + r.x(), y + r.y(), r.w(), r.h(), 0xFF15131D);
        }
        HexGui.Rect info = HexGui.INFO;
        HexGui.well(g, x + info.x(), y + info.y(), info.w(), info.h(), 0xFF0C0B11);
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                HexGui.well(g, x + HexingTableMenu.INV_X - 1 + col * 18, y + HexingTableMenu.INV_Y - 1 + row * 18, 18, 18, 0xFF15131D);
            }
        }
        for (int col = 0; col < 9; col++) {
            HexGui.well(g, x + HexingTableMenu.INV_X - 1 + col * 18, y + HexingTableMenu.HOTBAR_Y - 1, 18, 18, 0xFF15131D);
        }
    }

    private void drawGauge(GuiGraphics g, int x, int y, float t, float partial, boolean tex) {
        HexGui.Rect r = HexGui.GAUGE_FILL;
        int gx = x + r.x(), gy = y + r.y();
        float f = Mth.lerp(partial, oFill, fill);
        int h = Math.round(r.h() * f);
        if (h > 0) {
            if (tex) {
                HexGui.Sprite s = HexGui.GAUGE_LIQUID;
                g.blit(HexGui.TEXTURE, gx, gy + r.h() - h, s.u(), s.v() + r.h() - h, r.w(), h);
            } else {
                g.fillGradient(gx, gy + r.h() - h, gx + r.w(), gy + r.h(), 0xFF8FEAF7, 0xFF16566A);
            }
            // a restless surface
            int top = gy + r.h() - h;
            for (int c = 0; c < r.w(); c++) {
                int dy = Mth.sin(t * 0.22f + c * 0.9f) > 0.35f ? -1 : 0;
                g.fill(gx + c, top + dy, gx + c + 1, top + dy + 1, HexGui.argb(0.9f, HexGui.SOUL_PALE));
            }
            float glow = 0.12f + 0.08f * Mth.sin(t * 0.1f);
            g.fill(gx, gy + r.h() - h, gx + r.w(), gy + r.h(), HexGui.argb(glow, HexGui.SOUL_PALE));
        }
        if (menu.tanks() == 0) {   // nothing to draw from: a dead tube and a flickering glyph
            g.fill(gx, gy, gx + r.w(), gy + r.h(), 0x60000000);
            if (((int) (t / 6)) % 3 != 0) {
                g.drawString(font, Component.literal("x").withStyle(CursedGlyphs.ALT), gx + 2, gy + r.h() / 2 - 4,
                        HexGui.argb(0.8f, HexGui.SOUL_DEEP), false);
            }
        }
        HexGui.Rect tube = HexGui.GAUGE;
        if (tex) {
            HexGui.blit(g, x + tube.x(), y + tube.y(), HexGui.GAUGE_GLASS);
        } else {
            for (int k = 1; k < 7; k++) {
                int ty = gy + r.h() - k * r.h() / 7;
                g.fill(gx + r.w() - 3, ty, gx + r.w(), ty + 1, k % 2 == 0 ? 0x90A8F2FF : 0x50A8F2FF);
            }
            g.fill(gx + 1, gy + 1, gx + 2, gy + r.h() - 1, 0x30FFFFFF);
        }
    }

    private void drawSlotHints(GuiGraphics g, int x, int y, float t, boolean tex) {
        float a = 0.35f + 0.15f * Mth.sin(t * 0.12f);
        if (menu.book().isEmpty()) {
            if (tex) {
                HexGui.blitAlpha(g, x + HexingTableMenu.BOOK_X, y + HexingTableMenu.BOOK_Y, HexGui.ICON_BOOK, a);
            } else {
                int bx = x + HexingTableMenu.BOOK_X, by = y + HexingTableMenu.BOOK_Y;
                g.fill(bx + 4, by + 3, bx + 12, by + 13, HexGui.argb(a, HexGui.SOUL_DEEP));
                g.fill(bx + 5, by + 4, bx + 11, by + 12, HexGui.argb(a, HexGui.SOUL_DARK));
                g.fill(bx + 7, by + 6, bx + 9, by + 10, HexGui.argb(a, HexGui.SOUL));
            }
        }
        if (menu.elixir().isEmpty()) {
            if (tex) {
                HexGui.blitAlpha(g, x + HexingTableMenu.ELIXIR_X, y + HexingTableMenu.ELIXIR_Y, HexGui.ICON_ELIXIR, a);
            } else {
                int ex = x + HexingTableMenu.ELIXIR_X, ey = y + HexingTableMenu.ELIXIR_Y;
                g.fill(ex + 7, ey + 2, ex + 9, ey + 5, HexGui.argb(a, HexGui.SOUL_DEEP));
                g.fill(ex + 4, ey + 5, ex + 12, ey + 14, HexGui.argb(a, HexGui.SOUL_DEEP));
                g.fill(ex + 5, ey + 9, ex + 11, ey + 13, HexGui.argb(a, HexGui.SOUL));
            }
        }
    }

    private void drawOption(GuiGraphics g, int x, int y, int i, int mouseX, int mouseY, float t, float partial, boolean tex) {
        HexGui.Rect r = ROWS[i];
        int rx = x + r.x(), ry = y + r.y();
        boolean exists = exists(i);
        boolean hover = r.contains(mouseX - x, mouseY - y);
        boolean chosen = selected == i && exists;
        if (tex) {
            HexGui.Sprite s = chosen ? HexGui.OPTION_SELECTED : hover && exists ? HexGui.OPTION_HOVER : HexGui.OPTION;
            if (!exists) {
                g.setColor(0.45f, 0.45f, 0.5f, 1f);
            }
            HexGui.blit(g, rx, ry, s);
            g.setColor(1f, 1f, 1f, 1f);
        } else {
            int edge = !exists ? 0xFF1E1C26 : chosen ? 0xFF000000 | HexGui.mix(0.5f + 0.5f * Mth.sin(t * 0.15f), HexGui.SOUL_DEEP, HexGui.SOUL)
                    : hover ? 0xFF2A7F93 : 0xFF2B2838;
            int fillc = !exists ? 0xFF0E0D12 : chosen ? 0xFF132A33 : hover ? 0xFF161E28 : HexGui.WELL;
            g.fill(rx, ry, rx + r.w(), ry + r.h(), fillc);
            HexGui.border(g, rx, ry, r.w(), r.h(), edge);
            if (chosen) {
                g.fill(rx + 1, ry + 1, rx + r.w() - 1, ry + 2, HexGui.argb(0.25f, HexGui.SOUL_PALE));
            }
        }
        // the tier icon
        int ix = rx + 2, iy = ry + 2;
        if (tex) {
            HexGui.blitAlpha(g, ix, iy, i == 0 ? HexGui.ICON_LESSER : HexGui.ICON_SIN, exists ? 1f : 0.35f);
        } else {
            int c = exists ? tierColor(i) : 0x3A3646;
            float pulse = exists ? 0.75f + 0.25f * Mth.sin(t * 0.2f + i) : 1f;
            int cc = 0xFF000000 | HexRender.scale(c, pulse);
            for (int k = 0; k < 7; k++) {   // a diamond rune
                g.fill(ix + 8 - k, iy + 1 + k, ix + 8 + k, iy + 2 + k, k == 6 ? cc : 0xFF000000 | HexRender.scale(c, 0.35f));
                g.fill(ix + 8 - k, iy + 14 - k, ix + 8 + k, iy + 15 - k, k == 6 ? cc : 0xFF000000 | HexRender.scale(c, 0.35f));
            }
            g.fill(ix + 7, iy + 3, ix + 9, iy + 13, cc);
            g.fill(ix + 4, iy + 7, ix + 12, iy + 9, cc);
        }
        // line 1: the curse (or sin) in glyphs, resolving while hovered
        int tx = rx + 21, ty1 = ry + 2, ty2 = ry + 11;
        Holder<Enchantment> h = curse(i);
        float rv = Mth.lerp(partial, oReveal[i], reveal[i]);
        long seed = menu.seed() * 31L + i * 977L;
        if (h != null && exists) {
            String name = h.value().description().getString();
            CursedGlyphs.draw(g, font, name, tx, ty1, tierColor(i), rv, t, seed, chosen || hover ? 1f : 0.8f);
        } else {
            CursedGlyphs.noise(g, font, 15, tx, ty1, t, seed, exists ? 0.7f : 0.35f);
        }
        if (exists && i == 0) {   // the power, right-aligned
            String plus = "+" + Hexing.levelsGained(Hexing.stored(menu.book()));
            g.drawString(font, plus, rx + r.w() - 3 - font.width(plus), ty1, 0xFF000000 | HexGui.SOUL_PALE, false);
        } else if (exists) {
            String sigil = "☠";
            g.drawString(font, sigil, rx + r.w() - 3 - font.width(sigil), ty1,
                    0xFF000000 | HexGui.mix(0.5f + 0.5f * Mth.sin(t * 0.25f), HexGui.CRIMSON, HexGui.GOLD), false);
        }
        // line 2: what it costs, or why it can't be
        Component line2 = exists ? costLine(kind(i)) : problemText(kind(i), menu.problem(kind(i))).copy().withColor(0x4A4658);
        g.drawString(font, line2, tx, ty2, 0xFF000000 | HexGui.TEXT_DIM, false);
    }

    private Component costLine(Hexing.Kind k) {
        boolean free = creative();
        boolean elixirOk = free || menu.elixir().getCount() >= k.elixir();
        boolean soulsOk = free || menu.souls() >= k.souls();
        MutableComponent c = Component.translatable("container.winterworks.hexing_table.cost.elixir", k.elixir())
                .withColor(elixirOk ? HexGui.TEXT_DIM : HexGui.BAD);
        c.append(Component.literal(" · ").withColor(0x46525A));
        c.append(Component.translatable("container.winterworks.hexing_table.cost.souls", k.souls())
                .withColor(soulsOk ? HexGui.TEXT_DIM : HexGui.BAD));
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
            default -> Component.empty();
        };
    }

    private int minutes(Hexing.Kind k) {
        return k == Hexing.Kind.SIN ? Hexing.SIN_MINUTES : Hexing.lesserMinutes(Hexing.stored(menu.book()));
    }

    private void drawInfo(GuiGraphics g, int x, int y, float t) {
        HexGui.Rect r = HexGui.INFO;
        int ix = x + r.x() + 3, iy = y + r.y() + 2, w = r.w() - 6;
        int since = ticks - successAt;
        List<FormattedCharSequence> lines;
        int color;
        if (since >= 0 && since < 50) {
            lines = font.split(Component.translatable("container.winterworks.hexing_table.done"), w);
            color = HexGui.mix(Mth.clamp(since / 25f, 0f, 1f), 0xFFFFFF, HexGui.SOUL_PALE);
        } else {
            Hexing.Kind k = kind(selected);
            int p = menu.problem(k);
            if (!exists(selected) || p == Hexing.NO_TANK) {
                lines = font.split(problemText(k, p), w);
                color = p == Hexing.NO_TANK ? HexGui.mix(0.5f + 0.5f * Mth.sin(t * 0.15f), 0x6F8A94, HexGui.SOUL) : 0x6E6A80;
            } else {
                List<Component> parts = new ArrayList<>();
                parts.add(Component.translatable("container.winterworks.hexing_table." + (selected == 0 ? "lesser" : "sin"))
                        .withColor(tierColor(selected)));
                if (selected == 0) {
                    parts.add(Component.translatable("container.winterworks.hexing_table.power",
                            Hexing.levelsGained(Hexing.stored(menu.book()))).withColor(HexGui.TEXT));
                } else {
                    Holder<Enchantment> src = holder(menu.sinSourceId());
                    parts.add(src == null ? Component.empty() : src.value().description().copy().withColor(HexGui.TEXT));
                }
                parts.add(Component.literal(minutes(k) + " min").withColor(HexGui.TEXT_DIM));
                for (int n = 0; n < parts.size(); n++) {
                    g.drawString(font, ellipsize(parts.get(n), w), ix, iy + n * 9, 0xFFFFFFFF, false);
                }
                return;
            }
        }
        for (int n = 0; n < Math.min(3, lines.size()); n++) {
            g.drawString(font, lines.get(n), ix, iy + n * 9, 0xFF000000 | color, false);
        }
    }

    private FormattedCharSequence ellipsize(Component c, int w) {
        if (font.width(c) <= w) {
            return c.getVisualOrderText();
        }
        FormattedText cut = font.substrByWidth(c, w - font.width("..."));
        return Language.getInstance().getVisualOrder(FormattedText.composite(cut, FormattedText.of("...")));
    }

    private void drawButton(GuiGraphics g, int x, int y, int mouseX, int mouseY, float t, boolean tex) {
        HexGui.Rect r = HexGui.HEX_BUTTON;
        boolean enabled = ready(selected);
        boolean hover = r.contains(mouseX - x, mouseY - y);
        int sinceIgnite = ticks - igniteAt;
        boolean lit = sinceIgnite >= 0 && sinceIgnite < 16;
        int sinceDenied = ticks - deniedAt;
        int shake = sinceDenied >= 0 && sinceDenied < 8 ? Math.round(Mth.sin(sinceDenied * 2.4f) * 2f) : 0;
        int bx = x + r.x() + shake, by = y + r.y();
        int cx = bx + r.w() / 2, cy = by + r.h() / 2;
        float breathe = 0.5f + 0.5f * Mth.sin(t * 0.14f);

        // soul flames dance round the rune
        int flames = 6;
        for (int k = 0; k < flames; k++) {
            float a = t * (lit ? 0.16f : enabled ? 0.05f : 0.02f) + k * Mth.TWO_PI / flames;
            float rad = 18.5f + (lit ? sinceIgnite * 0.6f : 0f);
            int fx = Math.round(cx + Mth.cos(a) * rad), fy = Math.round(cy + Mth.sin(a) * rad * 0.9f);
            float alpha = lit ? 1f - sinceIgnite / 16f : enabled ? (hover ? 0.95f : 0.55f + 0.3f * breathe) : 0.18f;
            if (tex) {
                RenderSystem.enableBlend();
                g.setColor(1f, 1f, 1f, alpha);
                HexGui.frame(g, fx - 4, fy - 6, HexGui.FLAME_FRAME, (ticks / 3) + k);
                g.setColor(1f, 1f, 1f, 1f);
            } else {
                int flick = ((ticks / 2 + k * 3) % 5);
                g.fill(fx - 1, fy - 2 - flick % 2, fx + 1, fy + 1, HexGui.argb(alpha, HexGui.SOUL));
                g.fill(fx, fy - 3 - flick % 3, fx + 1, fy - 1, HexGui.argb(alpha, HexGui.SOUL_PALE));
            }
        }

        if (tex) {
            HexGui.Sprite s = lit ? HexGui.BUTTON_LIT : !enabled ? HexGui.BUTTON_OFF : hover ? HexGui.BUTTON_HOVER : HexGui.BUTTON;
            HexGui.blit(g, bx, by, s);
            if (enabled && !lit && !hover) {   // the rune breathes
                HexGui.blitAlpha(g, bx, by, HexGui.BUTTON_LIT, 0.12f + 0.18f * breathe);
            }
        } else {
            int rim = lit ? 0xFFFFFFFF : !enabled ? 0xFF2A2735 : 0xFF000000 | HexGui.mix(hover ? 1f : breathe * 0.6f, HexGui.SOUL_DEEP, HexGui.SOUL_PALE);
            int core = lit ? 0xFF8FEAF7 : !enabled ? 0xFF121018 : hover ? 0xFF16404D : 0xFF102A33;
            octagon(g, cx, cy, 16, 0xFF000000);
            octagon(g, cx, cy, 15, rim);
            octagon(g, cx, cy, 13, core);
            // the hexagram: two triangles of soul fire
            int rc = lit ? 0xFFFFFFFF : !enabled ? 0xFF3A3646 : 0xFF000000 | HexGui.mix(breathe, HexGui.SOUL, HexGui.SOUL_PALE);
            for (int k = 0; k < 9; k++) {
                g.fill(cx - k, cy - 9 + k * 2, cx - k + 1, cy - 8 + k * 2, rc);
                g.fill(cx + k - 1, cy - 9 + k * 2, cx + k, cy - 8 + k * 2, rc);
                g.fill(cx - k, cy + 8 - k * 2, cx - k + 1, cy + 9 - k * 2, rc);
                g.fill(cx + k - 1, cy + 8 - k * 2, cx + k, cy + 9 - k * 2, rc);
            }
            g.fill(cx - 8, cy + 7, cx + 8, cy + 8, rc);
            g.fill(cx - 8, cy - 8, cx + 8, cy - 7, rc);
        }
        // the word on the rune (vanilla keeps text out of GUI textures)
        Component word = Component.translatable("container.winterworks.hexing_table.button").withStyle(ChatFormatting.BOLD);
        int wc = lit ? 0xFFFFFFFF : !enabled ? 0xFF4A4658 : 0xFF000000 | HexGui.mix(hover ? 1f : breathe, HexGui.SOUL, 0xFFFFFF);
        g.drawString(font, word, cx - font.width(word) / 2 + 1, cy - 3, wc, enabled || lit);

        if (lit) {   // ignition: a ring bursts out and the rune flashes white
            float k = sinceIgnite / 16f;
            if (tex) {
                g.pose().pushPose();
                g.pose().translate(cx, cy, 0);
                float sc = 1f + 1.1f * k;
                g.pose().scale(sc, sc, 1f);
                HexGui.blitAlpha(g, -16, -16, HexGui.IGNITE_RING, 1f - k);
                g.pose().popPose();
            } else {
                int rad = 14 + Math.round(k * 16);
                HexGui.border(g, cx - rad, cy - rad, rad * 2, rad * 2, HexGui.argb(1f - k, HexGui.SOUL_PALE));
                HexGui.border(g, cx - rad + 2, cy - rad + 2, rad * 2 - 4, rad * 2 - 4, HexGui.argb((1f - k) * 0.5f, HexGui.SOUL));
            }
            g.fill(bx + 2, by + 2, bx + r.w() - 2, by + r.h() - 2, HexGui.argb((1f - k) * 0.55f, 0xFFFFFF));
        }
    }

    private static void octagon(GuiGraphics g, int cx, int cy, int r, int color) {
        int cut = Math.round(r * 0.42f);
        for (int dy = -r; dy < r; dy++) {
            int ady = dy < 0 ? -dy - 1 : dy;
            int half = ady < r - cut ? r : r - (ady - (r - cut)) - 1;
            g.fill(cx - half, cy + dy, cx + half, cy + dy + 1, color);
        }
    }

    @Override
    protected void renderLabels(GuiGraphics g, int mouseX, int mouseY) {
        g.drawString(font, title, titleLabelX, titleLabelY, 0xFF000000 | HexGui.mix(0.5f + 0.5f * Mth.sin(ticks * 0.05f), 0x7FE3F0, 0xB8F4FF), false);
        g.drawString(font, playerInventoryTitle, inventoryLabelX, inventoryLabelY, 0xFF6FA9B7, false);
    }

    // ------------------------------------------------------------------------------------------------ tooltips and sounds

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        int now = -1;
        for (int i = 0; i < 2; i++) {
            if (ROWS[i].contains(mouseX - leftPos, mouseY - topPos)) {
                now = i;
            }
        }
        if (HexGui.HEX_BUTTON.contains(mouseX - leftPos, mouseY - topPos)) {
            now = HOVER_BUTTON;
        }
        if (now != hovered) {
            if (now == HOVER_BUTTON && ready(selected)) {
                sound(SoundEvents.SOUL_ESCAPE.value(), 1.3f, 0.6f);
            } else if (now >= 0 && now < 2 && exists(now)) {
                sound(WWSounds.HEXING_TABLE_WHISPER, 1.4f + 0.2f * now, 0.45f);
            }
            hovered = now;
        }
        super.render(g, mouseX, mouseY, partial);
        renderTooltip(g, mouseX, mouseY);
        if (hoveredSlot != null && hoveredSlot.hasItem()) {
            return;
        }
        List<Component> tip = null;
        if (HexGui.GAUGE.contains(mouseX - leftPos, mouseY - topPos)) {
            tip = gaugeTooltip();
        } else if (hovered >= 0 && hovered < 2) {
            tip = optionTooltip(hovered);
        } else if (hovered == HOVER_BUTTON) {
            int p = menu.problem(kind(selected));
            tip = List.of(p == Hexing.OK ? Component.translatable("container.winterworks.hexing_table.button.ready").withColor(HexGui.SOUL_PALE)
                    : problemText(kind(selected), p).copy().withColor(HexGui.BAD));
        }
        if (tip != null) {
            g.renderComponentTooltip(font, tip, mouseX, mouseY);
        }
    }

    private List<Component> gaugeTooltip() {
        List<Component> tip = new ArrayList<>();
        if (menu.tanks() == 0) {
            tip.add(Component.translatable("container.winterworks.hexing_table.problem.5").withColor(HexGui.BAD));
            return tip;
        }
        tip.add(Component.translatable("container.winterworks.hexing_table.souls", menu.souls(), menu.capacity()).withColor(HexGui.SOUL));
        if (menu.tanks() > 1) {
            tip.add(Component.translatable("container.winterworks.hexing_table.tanks", menu.tanks()).withColor(HexGui.TEXT_DIM));
        }
        return tip;
    }

    private List<Component> optionTooltip(int i) {
        Hexing.Kind k = kind(i);
        List<Component> tip = new ArrayList<>();
        tip.add(Component.translatable("container.winterworks.hexing_table." + (i == 0 ? "lesser" : "sin")).withColor(tierColor(i)));
        int p = menu.problem(k);
        if (!exists(i)) {
            tip.add(problemText(k, p).copy().withColor(0x8A86A0));
            return tip;
        }
        ItemEnchantments stored = Hexing.stored(menu.book());
        Holder<Enchantment> h = curse(i);
        boolean known = reveal[i] >= 0.999f;
        Component name = h == null ? Component.literal("?") : known ? h.value().description().copy()
                : Component.literal(h.value().description().getString()).withStyle(ChatFormatting.OBFUSCATED);
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
            tip.add(Component.translatable("container.winterworks.hexing_table.attaches", name.copy().withColor(HexGui.SOUL)).withColor(HexGui.TEXT_DIM));
        } else {
            Holder<Enchantment> src = holder(menu.sinSourceId());
            tip.add(Component.translatable("container.winterworks.hexing_table.sin.desc",
                    src == null ? Component.literal("?") : src.value().description()).withColor(HexGui.TEXT_DIM));
            tip.add(Component.translatable("container.winterworks.hexing_table.becomes", name.copy().withColor(HexGui.CRIMSON)).withColor(HexGui.TEXT_DIM));
        }
        tip.add(Component.translatable("container.winterworks.hexing_table.hidden_chance").withStyle(ChatFormatting.ITALIC).withColor(0x7A5FA8));
        tip.add(CommonComponents.EMPTY);
        tip.add(costLine(k));
        tip.add(Component.translatable("container.winterworks.hexing_table.hexed", minutes(k)).withColor(0x4FA3B5));
        if (p != Hexing.OK) {
            tip.add(problemText(k, p).copy().withColor(HexGui.BAD));
        } else if (selected != i) {
            tip.add(Component.translatable("container.winterworks.hexing_table.select").withColor(HexGui.TEXT_DIM));
        }
        return tip;
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
            for (int i = 0; i < 2; i++) {
                if (ROWS[i].contains(mx, my)) {
                    if (exists(i)) {
                        if (selected != i) {
                            selected = i;
                            sound(SoundEvents.UI_BUTTON_CLICK.value(), i == 0 ? 0.8f : 0.6f, 0.35f);
                            sound(WWSounds.HEXING_TABLE_WHISPER, 0.9f, 0.5f);
                        }
                    } else {
                        sound(SoundEvents.DISPENSER_FAIL, 0.6f, 0.4f);
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
        if (ready(selected) && menu.clickMenuButton(minecraft.player, selected)) {
            minecraft.gameMode.handleInventoryButtonClick(menu.containerId, selected);
            igniteAt = ticks;
            sound(SoundEvents.FIRECHARGE_USE, 0.55f, 0.45f);
            sound(SoundEvents.SOUL_ESCAPE.value(), 0.7f, 1f);
            float bx = HexGui.HEX_BUTTON.cx(), by = HexGui.HEX_BUTTON.cy();
            for (int k = 0; k < 26; k++) {
                Soul s = new Soul(Soul.BURST, bx, by, 14 + random.nextInt(12), 0.7f + random.nextFloat() * 0.6f);
                float a = random.nextFloat() * Mth.TWO_PI;
                float v = 1.5f + random.nextFloat() * 2.2f;
                s.vx = Mth.cos(a) * v;
                s.vy = Mth.sin(a) * v - 0.6f;
                souls.add(s);
            }
        } else {
            deniedAt = ticks;
            sound(SoundEvents.DISPENSER_FAIL, 0.5f, 0.5f);
        }
    }

    @Override
    public void removed() {
        super.removed();
        souls.clear();
    }
}
