package dev.lowpix.winterworks.client.curse;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.boss.CameraShake;
import dev.lowpix.winterworks.curse.Curse;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.PostChain;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;

/**
 * Each curse's screen effect when it triggers (docs/FIXES_0_4.md "Curses"): a few seconds of its own colour, vignette,
 * distortion and sound, in the spirit of Sloth's nod-off. Three layers:
 * <ul>
 * <li>a post pass over the world (shaders/post/curse.json, program winterworks_curse): the view pulls in or away,
 * swirls, ripples or shimmers, splits its colours, doubles, drains into the curse's tint and darkens at the edges;
 * hidden curses flicker; run from mixin.client.hex.CurseFxRenderMixin just before the GUI is drawn;</li>
 * <li>a camera roll and shake (mixin.client.hex.CurseFxRenderMixin, client.boss.CameraShake);</li>
 * <li>pixel motes over the screen (coins, souls, wax, embers, moths, cracks...) drawn with the HUD.</li>
 * </ul>
 * Lesser curses are soul-blue-cold and soft, sins hot, saturated and pulsing like a heartbeat, hidden curses violet,
 * flickering and whispering; each has its own sound flavour (sounds curse.effect.lesser|sin|hidden, pitched per
 * curse). Every geometric distortion follows the "Distortion Effects" accessibility slider.
 */
public final class CurseScreenFx {
    private static final ResourceLocation CHAIN = Winterworks.id("shaders/post/curse.json");
    private static final int FADE_IN = 8, FADE_OUT = 26;

    /** How a mote looks and moves. */
    enum Mote { NONE, COIN, SILVER, SOUL, DRIP, BLOOD, DUST, RIPPLE, MOTH, EMBER, HEART, CRUMB, EYES, SALT, VEIN, CRACK, WATER, LIDS }

    /** One curse's look: the post-pass settings, its pulse, camera and motes. */
    static final class Look {
        final int colour;
        float wave, waveFreq = 10f, swirl, zoom, chroma, ghost, ghostX, ghostY, desat, tint, vignette, dark, flicker, glare;
        boolean rise;
        float pulseHz, pulseDepth, shake, roll, pitch = 1f;
        Mote mote = Mote.NONE;
        int moteRate = 1;

        Look(int colour) {
            this.colour = colour;
        }

        Look wave(float a, float freq) { wave = a; waveFreq = freq; return this; }
        Look haze(float a, float freq) { rise = true; return wave(a, freq); }
        Look swirl(float a) { swirl = a; return this; }
        Look zoom(float a) { zoom = a; return this; }
        Look chroma(float a) { chroma = a; return this; }
        Look ghost(float a, float x, float y) { ghost = a; ghostX = x; ghostY = y; return this; }
        Look desat(float a) { desat = a; return this; }
        Look tint(float a) { tint = a; return this; }
        Look vignette(float a) { vignette = a; return this; }
        Look dark(float a) { dark = a; return this; }
        Look flicker(float a) { flicker = a; return this; }
        Look glare(float a) { glare = a; return this; }
        Look pulse(float hz, float depth) { pulseHz = hz; pulseDepth = depth; return this; }
        Look shake(float deg) { shake = deg; return this; }
        Look roll(float deg) { roll = deg; return this; }
        Look pitch(float p) { pitch = p; return this; }
        Look mote(Mote m, int rate) { mote = m; moteRate = rate; return this; }
    }

    private static final Look[] LOOKS = new Look[Curse.ALL.length];

    static {
        // lesser curses: cold, soft, each one its own story
        look(Curse.NARCISSUS, new Look(0x2C6FB0).wave(0.012f, 16f).zoom(0.05f).chroma(0.004f).ghost(0.4f, 0f, 0.06f).desat(0.3f)
                .tint(0.4f).vignette(0.75f).roll(2.5f).pitch(1.15f).mote(Mote.RIPPLE, 6));
        look(Curse.ICARUS, new Look(0xFFA93A).haze(0.007f, 46f).zoom(-0.03f).chroma(0.003f).tint(0.35f).vignette(0.45f)
                .glare(0.7f).pitch(1.25f).mote(Mote.DRIP, 3));
        look(Curse.MIDAS, new Look(0xE8B830).swirl(0.2f).zoom(0.03f).chroma(0.002f).desat(0.65f).tint(0.7f).vignette(0.6f)
                .pitch(1.3f).mote(Mote.COIN, 2));
        look(Curse.ORPHEUS, new Look(0x7486B8).wave(0.004f, 8f).swirl(-0.3f).zoom(-0.07f).desat(0.9f).tint(0.3f).vignette(0.95f)
                .dark(0.6f).pitch(0.8f).mote(Mote.SOUL, 2));
        look(Curse.SISYPHUS, new Look(0x9A8C78).pulse(0.7f, 0.35f).zoom(0.07f).chroma(0.011f).desat(0.7f).tint(0.5f).vignette(0.85f)
                .dark(0.3f).shake(3.5f).pitch(0.7f).mote(Mote.DUST, 1));
        look(Curse.TANTALUS, new Look(0x3FA0A0).wave(0.009f, 9f).zoom(-0.1f).ghost(0.3f, 0f, -0.05f).desat(0.25f).tint(0.35f)
                .vignette(0.55f).pitch(1.0f).mote(Mote.WATER, 1));
        look(Curse.MOTH, new Look(0xF4E2A0).zoom(0.08f).swirl(0.12f).chroma(0.003f).desat(0.35f).tint(0.3f).vignette(1.0f)
                .dark(0.9f).glare(0.15f).pitch(1.4f).mote(Mote.MOTH, 4));
        // hidden curses: violet-black, flickering, whispering
        look(Curse.CAIN, new Look(0xB01414).pulse(1.25f, 0.45f).chroma(0.01f).ghost(0.25f, 0.025f, 0f).desat(0.55f).tint(0.8f)
                .vignette(1.0f).dark(0.4f).flicker(0.35f).pitch(0.75f).mote(Mote.BLOOD, 2));
        look(Curse.JUDAS, new Look(0xC4CCD6).ghost(0.35f, -0.035f, 0f).chroma(0.005f).desat(0.85f).tint(0.3f).vignette(0.75f)
                .flicker(0.4f).pitch(0.7f).mote(Mote.SILVER, 3));
        look(Curse.LOTS_WIFE, new Look(0xE8E2D0).zoom(0.03f).desat(1.0f).tint(0.3f).vignette(0.85f).flicker(0.3f)
                .pitch(0.6f).mote(Mote.SALT, 1));
        look(Curse.LEECH, new Look(0x6E9A2E).pulse(1.0f, 0.5f).wave(0.004f, 30f).chroma(0.005f).desat(0.45f).tint(0.5f)
                .vignette(0.85f).flicker(0.3f).pitch(0.65f).mote(Mote.VEIN, 1));
        // the sins: hot, saturated, heavy, pulsing
        look(Curse.WRATH, new Look(0xE0341A).pulse(1.6f, 0.4f).haze(0.008f, 34f).chroma(0.012f).desat(0.35f).tint(0.85f)
                .vignette(1.0f).dark(0.2f).shake(2f).pitch(0.85f).mote(Mote.EMBER, 1));
        look(Curse.GREED, new Look(0xE2B33A).pulse(0.9f, 0.3f).swirl(0.3f).zoom(0.04f).chroma(0.004f).desat(0.5f).tint(0.65f)
                .vignette(0.8f).pitch(0.95f).mote(Mote.COIN, 1));
        look(Curse.LUST, new Look(0xE0408A).pulse(1.3f, 0.4f).wave(0.006f, 12f).ghost(0.35f, 0.03f, 0f).chroma(0.008f).desat(0.2f)
                .tint(0.75f).vignette(0.95f).pitch(1.0f).mote(Mote.HEART, 2));
        look(Curse.GLUTTONY, new Look(0x9AA82A).pulse(0.8f, 0.5f).zoom(0.1f).wave(0.008f, 6f).desat(0.4f).tint(0.75f)
                .vignette(0.95f).dark(0.3f).roll(3f).pitch(0.6f).mote(Mote.CRUMB, 1));
        look(Curse.SLOTH, new Look(0x5E6E92).swirl(0.4f).ghost(0.45f, 0.035f, 0.012f).desat(0.6f).tint(0.45f).vignette(0.9f)
                .roll(4.5f).pitch(0.55f).mote(Mote.LIDS, 1));
        look(Curse.ENVY, new Look(0x3AA048).pulse(0.8f, 0.4f).ghost(0.4f, -0.035f, 0f).chroma(0.013f).desat(0.35f).tint(0.75f)
                .vignette(1.0f).dark(0.5f).pitch(0.8f).mote(Mote.EYES, 6));
        look(Curse.PRIDE, new Look(0x9A4AC8).zoom(-0.05f).chroma(0.016f).desat(0.35f).tint(0.5f).vignette(0.8f).shake(3.5f)
                .pitch(0.7f).mote(Mote.CRACK, 1));
    }

    private static void look(Curse c, Look l) {
        LOOKS[c.ordinal()] = l;
    }

    private static final class Particle {
        float x, y, ox, oy, vx, vy, spin, size;
        int age, life, seed;
        final List<float[]> path = new ArrayList<>();
    }

    private static Curse curse;
    private static Look look;
    private static int total, age;
    private static final List<Particle> MOTES = new ArrayList<>();
    private static final RandomSource RANDOM = RandomSource.create();
    private static PostChain chain;
    private static boolean chainFailed;
    private static int chainW = -1, chainH = -1;

    private CurseScreenFx() {}

    public static void init() {
        ResourceManagerHelper.get(PackType.CLIENT_RESOURCES).registerReloadListener(new SimpleSynchronousResourceReloadListener() {
            @Override
            public ResourceLocation getFabricId() {
                return Winterworks.id("curse_screen_fx");
            }

            @Override
            public void onResourceManagerReload(ResourceManager manager) {
                closeChain();
                chainFailed = false;
            }
        });
    }

    /** A curse triggered: start its effect for `ticks` (a newer one takes over). */
    public static void start(Curse c, int ticks) {
        curse = c;
        look = LOOKS[c.ordinal()];
        total = Math.max(FADE_IN + FADE_OUT, ticks);
        age = 0;
        MOTES.clear();
        Minecraft mc = Minecraft.getInstance();
        SoundEvent sound = c.sin() ? WWSounds.CURSE_EFFECT_SIN : c.hidden() ? WWSounds.CURSE_EFFECT_HIDDEN : WWSounds.CURSE_EFFECT_LESSER;
        mc.getSoundManager().play(SimpleSoundInstance.forUI(sound, look.pitch, c.sin() ? 0.9f : 0.75f));
        if (look.shake > 0) {
            CameraShake.add(look.shake, 24);
        }
        if (look.mote == Mote.VEIN || look.mote == Mote.CRACK) {
            seedPaths();
        }
    }

    /** Ends the current effect at once (respawn, leaving the world). */
    public static void stop() {
        curse = null;
        look = null;
        MOTES.clear();
    }

    /** Dev screenshots: the effect running, frozen at `atTick` (the peak is a little after the fade-in). */
    public static void hold(Curse c, int ticks, int atTick) {
        start(c, ticks);
        for (int i = 0; i < atTick; i++) {
            tick();
        }
    }

    public static boolean active() {
        return curse != null && age < total;
    }

    // ------------------------------------------------------------------------------------------------ timing

    /** The envelope: fade in, hold, fade out (0..1), times the pulse and a kick at the start. */
    static float strength(float partial) {
        if (!active()) {
            return 0f;
        }
        float t = age + partial, left = total - t;
        float env = Mth.clamp(Math.min(t / FADE_IN, left / FADE_OUT), 0f, 1f);
        env = env * env * (3f - 2f * env);
        float pulse = 1f;
        if (look.pulseHz > 0) {   // a heartbeat: two beats, then rest
            float ph = (t / 20f * look.pulseHz) % 1f;
            float beat = (float) (Math.exp(-Math.pow((ph - 0.08) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.28) / 0.05, 2)));
            pulse = 1f - look.pulseDepth + look.pulseDepth * Mth.clamp(0.25f + beat, 0f, 1f);
        }
        float kick = 1f + 0.35f * (float) Math.exp(-t / 5f);
        return Mth.clamp(env * pulse * kick, 0f, 1f);
    }

    private static float progress(float partial) {
        return Mth.clamp((age + partial) / total, 0f, 1f);
    }

    public static void tick() {
        if (curse == null) {
            return;
        }
        age++;
        if (age >= total) {
            stop();
            return;
        }
        tickMotes();
    }

    // ------------------------------------------------------------------------------------------------ the post pass

    /** GameRenderer.render, after the world is drawn and before the GUI: the distortion over the world. */
    public static void process(float partial) {
        float s = strength(partial);
        if (s <= 0.003f || chainFailed) {
            return;
        }
        Minecraft mc = Minecraft.getInstance();
        if (chain == null) {
            try {
                chain = new PostChain(mc.getTextureManager(), mc.getResourceManager(), mc.getMainRenderTarget(), CHAIN);
                chainW = chainH = -1;
            } catch (Exception e) {
                chainFailed = true;
                Winterworks.LOG.warn("Curse screen effect shader failed to load; overlays only", e);
                return;
            }
        }
        int w = mc.getMainRenderTarget().width, h = mc.getMainRenderTarget().height;
        if (w != chainW || h != chainH) {
            chain.resize(w, h);
            chainW = w;
            chainH = h;
        }
        Look l = look;
        float warp = mc.options.screenEffectScale().get().floatValue();
        chain.setUniform("Clock", (age + partial) / 20f);
        chain.setUniform("Strength", s);
        chain.setUniform("Warp", warp);
        chain.setUniform("Wave", l.wave);
        chain.setUniform("WaveFreq", l.waveFreq);
        chain.setUniform("Rise", l.rise ? 1f : 0f);
        chain.setUniform("Swirl", l.swirl);
        chain.setUniform("Zoom", l.zoom);
        chain.setUniform("Chroma", l.chroma);
        chain.setUniform("Ghost", l.ghost);
        chain.setUniform("GhostX", l.ghostX);
        chain.setUniform("GhostY", l.ghostY);
        chain.setUniform("Desat", l.desat);
        chain.setUniform("TintR", ((l.colour >> 16) & 255) / 255f);
        chain.setUniform("TintG", ((l.colour >> 8) & 255) / 255f);
        chain.setUniform("TintB", (l.colour & 255) / 255f);
        chain.setUniform("TintAmt", l.tint);
        chain.setUniform("Vignette", l.vignette);
        chain.setUniform("Dark", l.dark);
        chain.setUniform("Flicker", l.flicker);
        chain.setUniform("Glare", l.glare);
        RenderSystem.disableBlend();
        RenderSystem.disableDepthTest();
        RenderSystem.resetTextureMatrix();
        chain.process(mc.getTimer().getGameTimeDeltaTicks());
    }

    private static void closeChain() {
        if (chain != null) {
            chain.close();
            chain = null;
        }
    }

    /** GameRenderer.bobHurt: a slow, dizzy roll of the view while the curse holds you. */
    public static void camera(PoseStack pose, float partial) {
        if (!active() || look.roll <= 0) {
            return;
        }
        Minecraft mc = Minecraft.getInstance();
        float scale = mc.options.screenEffectScale().get().floatValue();
        float t = (age + partial) / 20f;
        float roll = look.roll * strength(partial) * scale * (Mth.sin(t * 2.1f) * 0.7f + Mth.sin(t * 3.3f + 1f) * 0.3f);
        if (Math.abs(roll) > 0.001f) {
            pose.mulPose(Axis.ZP.rotationDegrees(roll));
        }
    }

    // ------------------------------------------------------------------------------------------------ motes

    private static void seedPaths() {
        int n = look.mote == Mote.CRACK ? 8 : 10;
        float cx = 0.4f + RANDOM.nextFloat() * 0.2f, cy = 0.35f + RANDOM.nextFloat() * 0.25f;
        for (int i = 0; i < n; i++) {
            Particle p = new Particle();
            float x, y, dir;
            if (look.mote == Mote.CRACK) {   // a shatter: jagged cracks out from one point
                x = cx;
                y = cy;
                dir = (float) (i * Math.PI * 2 / n + RANDOM.nextFloat() * 0.5f);
            } else {                         // veins: creeping in from the edges
                int edge = i % 4;
                x = edge == 0 ? 0 : edge == 1 ? 1 : RANDOM.nextFloat();
                y = edge == 2 ? 0 : edge == 3 ? 1 : RANDOM.nextFloat();
                dir = (float) Math.atan2(0.5f - y, 0.5f - x);
            }
            int steps = look.mote == Mote.CRACK ? 9 + RANDOM.nextInt(6) : 14 + RANDOM.nextInt(10);
            for (int k = 0; k < steps; k++) {
                p.path.add(new float[]{x, y});
                dir += (RANDOM.nextFloat() - 0.5f) * (look.mote == Mote.CRACK ? 0.9f : 0.8f);
                float len = look.mote == Mote.CRACK ? 0.025f + RANDOM.nextFloat() * 0.035f : 0.012f + RANDOM.nextFloat() * 0.012f;
                x += Mth.cos(dir) * len;
                y += Mth.sin(dir) * len * 1.6f;
            }
            p.seed = RANDOM.nextInt();
            MOTES.add(p);
        }
    }

    private static void spawn() {
        Mote m = look.mote;
        if (m == Mote.NONE || m == Mote.VEIN || m == Mote.CRACK || m == Mote.WATER || m == Mote.LIDS) {
            return;
        }
        if (age % look.moteRate != 0 || age > total - FADE_OUT) {
            return;
        }
        Particle p = new Particle();
        p.seed = RANDOM.nextInt(1000);
        p.size = 1f + RANDOM.nextFloat();
        switch (m) {
            case COIN, SILVER, CRUMB, DUST -> {
                p.x = RANDOM.nextFloat();
                p.y = -0.05f;
                p.vx = (RANDOM.nextFloat() - 0.5f) * 0.004f;
                p.vy = 0.004f + RANDOM.nextFloat() * 0.01f;
                p.spin = RANDOM.nextFloat() * 6f;
                p.life = 60;
            }
            case SOUL, EMBER, HEART -> {
                boolean edge = m == Mote.HEART;
                p.x = edge ? (RANDOM.nextBoolean() ? RANDOM.nextFloat() * 0.25f : 0.75f + RANDOM.nextFloat() * 0.25f) : RANDOM.nextFloat();
                p.y = 1.05f;
                p.vx = (RANDOM.nextFloat() - 0.5f) * 0.003f;
                p.vy = -(0.006f + RANDOM.nextFloat() * 0.01f);
                p.life = 45 + RANDOM.nextInt(30);
            }
            case DRIP, BLOOD -> {
                p.x = 0.03f + RANDOM.nextFloat() * 0.94f;
                p.y = 0f;
                p.vy = 0.002f + RANDOM.nextFloat() * 0.004f;
                p.size = 2f + RANDOM.nextFloat() * 2f;
                p.life = 50 + RANDOM.nextInt(30);
            }
            case RIPPLE -> {
                p.x = 0.5f + (RANDOM.nextFloat() - 0.5f) * 0.3f;
                p.y = 0.6f + (RANDOM.nextFloat() - 0.5f) * 0.25f;
                p.life = 40;
            }
            case MOTH -> {
                float a = RANDOM.nextFloat() * Mth.TWO_PI;
                p.x = 0.5f + Mth.cos(a) * 0.6f;
                p.y = 0.5f + Mth.sin(a) * 0.6f;
                p.life = 50;
            }
            case EYES -> {
                boolean left = RANDOM.nextBoolean();
                p.x = left ? 0.04f + RANDOM.nextFloat() * 0.16f : 0.8f + RANDOM.nextFloat() * 0.16f;
                p.y = 0.1f + RANDOM.nextFloat() * 0.8f;
                p.life = 40 + RANDOM.nextInt(30);
            }
            case SALT -> {
                for (int k = 0; k < 3; k++) {   // the crust grows in from the edges and stays
                    Particle q = new Particle();
                    float d = (float) Math.pow(RANDOM.nextFloat(), 2.2) * 0.22f;
                    int edge = RANDOM.nextInt(4);
                    q.x = edge == 0 ? d : edge == 1 ? 1 - d : RANDOM.nextFloat();
                    q.y = edge == 2 ? d : edge == 3 ? 1 - d : RANDOM.nextFloat();
                    q.size = 1f + RANDOM.nextInt(3);
                    q.life = total;
                    q.seed = RANDOM.nextInt(1000);
                    MOTES.add(q);
                }
                return;
            }
            default -> {
                return;
            }
        }
        p.ox = p.x;
        p.oy = p.y;
        MOTES.add(p);
    }

    private static void tickMotes() {
        spawn();
        for (Iterator<Particle> it = MOTES.iterator(); it.hasNext(); ) {
            Particle p = it.next();
            p.ox = p.x;
            p.oy = p.y;
            p.age++;
            switch (look.mote) {
                case COIN, SILVER, CRUMB -> {
                    p.vy += 0.0009f;
                    p.spin += 0.35f;
                }
                case SOUL -> p.vx = Mth.sin((p.age + p.seed) * 0.15f) * 0.002f;
                case EMBER -> p.vx += (RANDOM.nextFloat() - 0.5f) * 0.001f;
                case MOTH -> {   // drawn in toward the light, fluttering
                    p.vx = (0.5f - p.x) * 0.02f + (RANDOM.nextFloat() - 0.5f) * 0.02f;
                    p.vy = (0.5f - p.y) * 0.02f + (RANDOM.nextFloat() - 0.5f) * 0.02f;
                }
                default -> {
                }
            }
            p.x += p.vx;
            p.y += p.vy;
            if (p.life > 0 && p.age >= p.life || p.y > 1.15f) {
                it.remove();
            }
        }
    }

    /** The HUD layer: the curse's motes over the screen, faded with the effect. */
    public static void render(GuiGraphics g, float partial) {
        if (!active()) {
            return;
        }
        float s = strength(partial);
        if (s <= 0.01f) {
            return;
        }
        int w = g.guiWidth(), h = g.guiHeight();
        float t = age + partial;
        float fade = Mth.clamp(Math.min((age + partial) / FADE_IN, (total - age - partial) / FADE_OUT), 0f, 1f);
        int col = look.colour;
        switch (look.mote) {
            case WATER -> water(g, w, h, t, fade);
            case LIDS -> lids(g, w, h, t, fade);
            case VEIN, CRACK -> paths(g, w, h, t, fade);
            default -> {
                for (Particle p : MOTES) {
                    float life = p.life <= 0 ? 1f : (p.age + partial) / p.life;
                    float a = fade * Mth.clamp(Math.min(life / 0.15f, (1f - life) / 0.3f), 0f, 1f);
                    if (look.mote == Mote.SALT) {
                        a = fade;
                    }
                    if (a <= 0.02f) {
                        continue;
                    }
                    int x = Math.round(Mth.lerp(partial, p.ox, p.x) * w), y = Math.round(Mth.lerp(partial, p.oy, p.y) * h);
                    mote(g, p, x, y, a, t, col);
                }
            }
        }
    }

    private static void mote(GuiGraphics g, Particle p, int x, int y, float a, float t, int col) {
        switch (look.mote) {
            case COIN, SILVER -> {   // a spinning coin
                boolean silver = look.mote == Mote.SILVER;
                int face = silver ? 0xC9D1DA : 0xF2C440, rim = silver ? 0x6F7884 : 0xA0651A, shine = 0xFFFBE6;
                int half = Math.max(0, Math.round(Math.abs(Mth.cos(p.spin)) * 2f));
                g.fill(x - half - 1, y - 2, x + half + 1, y + 3, argb(a, rim));
                g.fill(x - half, y - 2, x + half, y + 2, argb(a, face));
                if (half > 0) {
                    g.fill(x - half, y - 2, x - half + 1, y - 1, argb(a, shine));
                }
            }
            case SOUL -> {   // a pale soul with a wisp of tail
                g.fill(x - 1, y + 2, x + 1, y + 5, argb(a * 0.35f, 0x7FE8F4));
                g.fill(x - 2, y - 1, x + 2, y + 2, argb(a * 0.55f, 0x9FEFFF));
                g.fill(x - 1, y - 2, x + 1, y + 2, argb(a, 0xE6FFFF));
                g.fill(x - 1, y - 1, x, y, argb(a, 0x24425A));
                g.fill(x, y - 1, x + 1, y, argb(a, 0x24425A));
            }
            case DRIP, BLOOD -> {   // a streak running down from the top edge, a fat drop at its head
                int c = look.mote == Mote.BLOOD ? 0x7A0E12 : 0xE8A33A, head = look.mote == Mote.BLOOD ? 0xB31C1C : 0xFFD27A;
                int len = Math.round(p.y * g.guiHeight());
                int wd = Math.max(1, Math.round(p.size * 0.6f));
                g.fill(x, 0, x + wd, len, argb(a * 0.8f, c));
                g.fill(x - 1, len - 1, x + wd + 1, len + 2, argb(a, c));
                g.fill(x, len - 1, x + 1, len, argb(a, head));
            }
            case DUST, CRUMB -> {
                int c = look.mote == Mote.CRUMB ? ((p.seed & 1) == 0 ? 0xA8722E : 0xD9B25A) : ((p.seed & 1) == 0 ? 0x8C8478 : 0xB8AE9C);
                int sz = Math.round(p.size);
                g.fill(x, y, x + sz, y + sz, argb(a * 0.85f, c));
            }
            case RIPPLE -> {   // a ring spreading over still water
                float life = p.age / (float) Math.max(1, p.life);
                float r = 6 + life * 60;
                for (int k = 0; k < 48; k++) {
                    double ang = k * Math.PI * 2 / 48;
                    int px = x + (int) Math.round(Math.cos(ang) * r), py = y + (int) Math.round(Math.sin(ang) * r * 0.38);
                    g.fill(px, py, px + 2, py + 1, argb(a * (1f - life) * 0.5f, 0xBFE6FF));
                }
            }
            case MOTH -> {   // a dusky moth, wings beating
                boolean up = ((p.age + p.seed) / 2) % 2 == 0;
                int c = 0x2A2118, wing = 0x4A3B2A;
                g.fill(x, y - 1, x + 1, y + 3, argb(a, c));
                if (up) {
                    g.fill(x - 3, y - 2, x, y, argb(a, wing));
                    g.fill(x + 1, y - 2, x + 4, y, argb(a, wing));
                } else {
                    g.fill(x - 3, y + 1, x, y + 2, argb(a, wing));
                    g.fill(x + 1, y + 1, x + 4, y + 2, argb(a, wing));
                }
            }
            case EMBER -> {
                float fl = 0.6f + 0.4f * Mth.sin((t + p.seed) * 0.9f);
                g.fill(x, y, x + 2, y + 2, argb(a * fl, (p.seed & 1) == 0 ? 0xFF8A2A : 0xFFD050));
                g.fill(x, y + 2, x + 1, y + 4, argb(a * fl * 0.4f, 0xD0341E));
            }
            case HEART -> {   // a little heart, beating as it rises
                int c = 0xE85A9A, dark = 0x8E1E4E;
                int[] rows = {0b0110110, 0b1111111, 0b1111111, 0b0111110, 0b0011100, 0b0001000};
                for (int r = 0; r < rows.length; r++) {
                    for (int k = 0; k < 7; k++) {
                        if ((rows[r] >> (6 - k) & 1) != 0) {
                            boolean edge = r == rows.length - 1 || k == 0 || k == 6;
                            g.fill(x - 3 + k, y - 3 + r, x - 2 + k, y - 2 + r, argb(a, edge ? dark : c));
                        }
                    }
                }
            }
            case EYES -> {   // envious eyes in the dark at the edges, blinking
                boolean open = ((p.age + p.seed) % 37) > 3;
                if (open) {
                    g.fill(x - 4, y, x - 1, y + 2, argb(a, 0x7CFF6A));
                    g.fill(x + 1, y, x + 4, y + 2, argb(a, 0x7CFF6A));
                    g.fill(x - 3, y, x - 2, y + 2, argb(a, 0x0C2A0C));
                    g.fill(x + 2, y, x + 3, y + 2, argb(a, 0x0C2A0C));
                } else {
                    g.fill(x - 4, y + 1, x - 1, y + 2, argb(a * 0.6f, 0x3AA048));
                    g.fill(x + 1, y + 1, x + 4, y + 2, argb(a * 0.6f, 0x3AA048));
                }
            }
            case SALT -> {   // a salt-white crystal
                int sz = Math.round(p.size);
                g.fill(x, y, x + sz, y + sz, argb(a * 0.9f, (p.seed & 1) == 0 ? 0xF4F1E8 : 0xD6D0C0));
                if (sz > 1) {
                    g.fill(x, y, x + 1, y + 1, argb(a, 0xFFFFFF));
                }
            }
            default -> {
            }
        }
    }

    /** Leech veins creeping in from the edges, or Pride's cracks spreading from one point. */
    private static void paths(GuiGraphics g, int w, int h, float t, float fade) {
        boolean crack = look.mote == Mote.CRACK;
        float grow = Mth.clamp(t / (crack ? 6f : 30f), 0f, 1f);
        float beat = crack ? 1f : 0.65f + 0.35f * strength(0f);
        for (Particle p : MOTES) {
            int n = Math.max(1, Math.round(p.path.size() * grow));
            for (int k = 0; k + 1 < n; k++) {
                float[] a = p.path.get(k), b = p.path.get(k + 1);
                int x0 = Math.round(a[0] * w), y0 = Math.round(a[1] * h), x1 = Math.round(b[0] * w), y1 = Math.round(b[1] * h);
                int thick = crack ? 1 : Math.max(1, 3 - k / 6);
                line(g, x0 + 1, y0 + 1, x1 + 1, y1 + 1, thick, argb(fade * 0.7f, crack ? 0x1A0A26 : 0x16220A));
                line(g, x0, y0, x1, y1, thick, argb(fade * beat, crack ? 0xF4E8FF : 0x5E8A22));
            }
        }
    }

    private static void line(GuiGraphics g, int x0, int y0, int x1, int y1, int thick, int argb) {
        int steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (int i = 0; i <= steps; i++) {
            int x = steps == 0 ? x0 : x0 + (x1 - x0) * i / steps, y = steps == 0 ? y0 : y0 + (y1 - y0) * i / steps;
            g.fill(x, y, x + thick, y + thick, argb);
        }
    }

    /** Tantalus: the water you could drink, bobbing at the bottom of the view and sinking away. */
    private static void water(GuiGraphics g, int w, int h, float t, float fade) {
        float sink = progress(0f);
        int base = h - Math.round(h * 0.16f * (1f - sink * 0.85f));
        for (int x = 0; x < w; x += 2) {
            int top = base + Math.round(Mth.sin(x * 0.06f + t * 0.25f) * 3f + Mth.sin(x * 0.021f - t * 0.13f) * 2f);
            g.fill(x, top, x + 2, h, argb(fade * 0.45f, 0x2F8C92));
            g.fill(x, top, x + 2, top + 1, argb(fade * 0.8f, 0xA8F0E8));
        }
    }

    /** Sloth: the eyelids droop half shut and flutter, heavy. */
    private static void lids(GuiGraphics g, int w, int h, float t, float fade) {
        float droop = fade * (0.28f + 0.1f * Mth.sin(t * 0.18f));
        int lid = Math.round(h * 0.5f * droop);
        int edge = Math.max(4, h / 12);
        g.fill(0, 0, w, lid, argb(0.92f, 0x07060C));
        g.fill(0, h - lid, w, h, argb(0.92f, 0x07060C));
        g.fillGradient(0, lid, w, lid + edge, argb(0.7f, 0x07060C), 0);
        g.fillGradient(0, h - lid - edge, w, h - lid, 0, argb(0.7f, 0x07060C));
    }

    private static int argb(float alpha, int rgb) {
        int a = Mth.clamp((int) (alpha * 255), 0, 255);
        return a << 24 | rgb & 0xFFFFFF;
    }

    /** The current curse (dev screenshots), or null. */
    public static Curse current() {
        return active() ? curse : null;
    }
}
