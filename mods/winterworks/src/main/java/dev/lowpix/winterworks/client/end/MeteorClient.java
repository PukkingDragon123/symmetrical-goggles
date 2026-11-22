package dev.lowpix.winterworks.client.end;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.client.boss.CameraShake;
import dev.lowpix.winterworks.client.lowpix.LowpixGeometry;
import dev.lowpix.winterworks.end.FallingMeteorite;
import dev.lowpix.winterworks.end.MeteorImpact;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndParticles;
import java.util.HashMap;
import java.util.Map;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/**
 * Client side of falling meteorites (docs/END_UPDATE.md section 16): the renderer (FallingMeteoriteRenderer), the rising
 * whistle that follows each one down (MeteorWhistle), its trail of flames, sparks and lingering smoke, and the crash:
 * an explosion of fire, sparks, molten splashes and dust racing out along the ground, a white flash over the whole
 * screen (brighter the nearer and the more in view), a camera shake nearby, and smoke rising from the fresh crater for
 * as long as the meteor smoulders. The dev screenshot harness is MeteorShots.
 */
public final class MeteorClient {
    public static final ModelLayerLocation LAYER = new ModelLayerLocation(Winterworks.id("falling_meteorite"), "main");
    /** Each meteor's last flight direction (kept for the trail left hanging after the crash). */
    private static final Map<Integer, Vec3> DIRS = new HashMap<>();
    /** The screen flash: its strength 0..1 and the game time it started. */
    private static float flash;
    private static long flashAt = -1000;
    private static final int FLASH_TICKS = 14;

    private MeteorClient() {}

    public static void init() {
        EntityModelLayerRegistry.registerModelLayer(LAYER, () -> {
            try {
                return LowpixGeometry.layer(Winterworks.MOD_ID, "falling_meteorite");
            } catch (RuntimeException e) {
                Winterworks.LOG.error("model falling_meteorite is missing: {}", e.getMessage());
                return LayerDefinition.create(new MeshDefinition(), 16, 16);
            }
        });
        EntityRendererRegistry.register(EndEntities.FALLING_METEORITE, FallingMeteoriteRenderer::new);
        FallingMeteorite.clientTick = MeteorClient::tick;
        FallingMeteorite.clientImpact = MeteorClient::impact;
        ClientEntityEvents.ENTITY_LOAD.register((entity, level) -> {
            if (entity instanceof FallingMeteorite m && m.flying()) {
                Minecraft.getInstance().getSoundManager().play(new MeteorWhistle(m));
            }
        });
        ClientEntityEvents.ENTITY_UNLOAD.register((entity, level) -> DIRS.remove(entity.getId()));
        HudRenderCallback.EVENT.register((graphics, tick) -> drawFlash(graphics, tick.getGameTimeDeltaPartialTick(false)));
        MeteorShots.init();
    }

    /** The way it's flying (or was, once down). */
    public static Vec3 direction(FallingMeteorite m) {
        Vec3 v = m.getDeltaMovement();
        if (v.lengthSqr() > 1e-6) {
            return v.normalize();
        }
        return DIRS.getOrDefault(m.getId(), new Vec3(0, -1, 0));
    }

    private static void add(ClientLevel level, ParticleOptions p, Vec3 at, double vx, double vy, double vz) {
        level.addParticle(p, true, at.x, at.y, at.z, vx, vy, vz);
    }

    /** Every client tick: flames, sparks and smoke along the flight; smoke and the odd spark from the crater after. */
    private static void tick(FallingMeteorite m) {
        ClientLevel level = (ClientLevel) m.level();
        RandomSource r = level.random;
        if (m.flying()) {
            Vec3 v = m.getDeltaMovement();
            if (v.lengthSqr() > 1e-6) {
                DIRS.put(m.getId(), v.normalize());
            }
            Vec3 from = new Vec3(m.xo, m.yo, m.zo), to = m.position();
            for (int i = 0; i < 5; i++) {
                Vec3 p = from.lerp(to, r.nextDouble()).add(r.nextGaussian() * 0.5, r.nextGaussian() * 0.5, r.nextGaussian() * 0.5);
                add(level, ParticleTypes.FLAME, p, v.x * 0.05 + r.nextGaussian() * 0.04, v.y * 0.05 + r.nextGaussian() * 0.04,
                        v.z * 0.05 + r.nextGaussian() * 0.04);
                add(level, EndParticles.METEOR_SPARK, p, r.nextGaussian() * 0.15, r.nextGaussian() * 0.15, r.nextGaussian() * 0.15);
            }
            for (int i = 0; i < 2; i++) {
                Vec3 p = from.lerp(to, r.nextDouble()).add(r.nextGaussian() * 0.6, r.nextGaussian() * 0.6, r.nextGaussian() * 0.6);
                add(level, ParticleTypes.LARGE_SMOKE, p, r.nextGaussian() * 0.02, 0.02, r.nextGaussian() * 0.02);
            }
            if (m.tickCount % 2 == 0) {   // a column of smoke that lingers in the sky after it has passed
                Vec3 p = from.lerp(to, r.nextDouble());
                add(level, ParticleTypes.CAMPFIRE_COSY_SMOKE, p, r.nextGaussian() * 0.01, 0.01, r.nextGaussian() * 0.01);
            }
            if (r.nextInt(3) == 0) {
                add(level, ParticleTypes.LAVA, to, 0, 0, 0);
            }
            return;
        }
        if (m.state() != FallingMeteorite.CRASHED) {
            return;
        }
        // the fresh crater smokes, the hotter the more, for as long as it smoulders
        int age = m.sinceImpact();
        float heat = 1f - age / (float) FallingMeteorite.SMOULDER;
        Vec3 c = m.impact();
        if (r.nextFloat() < 0.35f + 0.5f * heat) {
            double a = r.nextDouble() * Math.PI * 2, d = r.nextDouble() * 5.0;
            Vec3 p = c.add(Math.cos(a) * d, r.nextDouble() * 1.5 - 1.0, Math.sin(a) * d);
            add(level, ParticleTypes.CAMPFIRE_COSY_SMOKE, p, r.nextGaussian() * 0.005, 0.03 + 0.03 * heat, r.nextGaussian() * 0.005);
        }
        if (age < 120 && r.nextInt(2) == 0) {
            Vec3 p = c.add(r.nextGaussian() * 2.5, r.nextDouble(), r.nextGaussian() * 2.5);
            add(level, ParticleTypes.LARGE_SMOKE, p, 0, 0.05, 0);
        }
        if (r.nextFloat() < 0.25f * heat) {
            Vec3 p = c.add(r.nextGaussian() * 2.0, 0.5, r.nextGaussian() * 2.0);
            add(level, EndParticles.METEOR_SPARK, p, r.nextGaussian() * 0.08, 0.1 + r.nextDouble() * 0.15, r.nextGaussian() * 0.08);
        }
    }

    /** The crash, once, as it is seen: the blast, the flash on the screen and a shake if near. */
    private static void impact(FallingMeteorite m) {
        Minecraft mc = Minecraft.getInstance();
        ClientLevel level = (ClientLevel) m.level();
        RandomSource r = level.random;
        Vec3 c = m.impact();
        boolean crater = m.state() == FallingMeteorite.CRASHED;
        add(level, ParticleTypes.EXPLOSION_EMITTER, c.add(0, 1, 0), 0, 0, 0);
        for (int i = 0; i < 70; i++) {   // sparks and molten splashes thrown up and out
            double a = r.nextDouble() * Math.PI * 2, s = 0.25 + r.nextDouble() * 0.6;
            add(level, EndParticles.METEOR_SPARK, c.add(0, 0.5, 0), Math.cos(a) * s, 0.3 + r.nextDouble() * 0.7, Math.sin(a) * s);
        }
        for (int i = 0; i < 30; i++) {
            add(level, crater ? ParticleTypes.LAVA : ParticleTypes.FLAME, c.add(r.nextGaussian(), 0.5, r.nextGaussian()), 0, 0, 0);
            double a = r.nextDouble() * Math.PI * 2, s = 0.1 + r.nextDouble() * 0.3;
            add(level, ParticleTypes.FLAME, c.add(0, 1, 0), Math.cos(a) * s, r.nextDouble() * 0.3, Math.sin(a) * s);
        }
        for (int i = 0; i < 48; i++) {   // the shockwave's dust racing out along the ground
            double a = i * Math.PI * 2 / 48, s = 0.9 + r.nextDouble() * 0.3;
            add(level, ParticleTypes.POOF, c.add(Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5), Math.cos(a) * s, 0.02, Math.sin(a) * s);
            if (i % 2 == 0) {
                add(level, ParticleTypes.LARGE_SMOKE, c.add(Math.cos(a), 0.5, Math.sin(a)), Math.cos(a) * s * 0.5, 0.05, Math.sin(a) * s * 0.5);
            }
        }
        for (int i = 0; i < 16; i++) {
            add(level, ParticleTypes.CAMPFIRE_COSY_SMOKE, c.add(r.nextGaussian() * 2, 0.5, r.nextGaussian() * 2), 0, 0.06, 0);
        }
        // the flash on the screen: brighter the nearer, dimmer when it's behind you
        if (mc.player != null) {
            Vec3 eye = mc.gameRenderer.getMainCamera().getPosition();
            double d = eye.distanceTo(c);
            Vec3 look = new Vec3(mc.gameRenderer.getMainCamera().getLookVector());
            double facing = c.subtract(eye).normalize().dot(look);
            float s = (float) Mth.clamp(1.15 - d / 140.0, 0.2, 1.0) * (facing > 0.3 ? 1f : 0.45f);
            if (s > flash * fade(level.getGameTime(), 0f)) {
                flash = s;
                flashAt = level.getGameTime();
            }
            if (d < 80) {
                CameraShake.add((float) (5.0 * (1 - d / 80.0)) + 0.5f, 25);
            }
            if (crater && d < MeteorImpact.SHOCK_RADIUS * 2) {
                CameraShake.add(4f, 20);
            }
        }
    }

    private static float fade(long now, float partial) {
        float age = now - flashAt + partial;
        if (age < 0 || age > FLASH_TICKS) {
            return 0f;
        }
        float k = 1f - age / FLASH_TICKS;
        return k * k;
    }

    private static void drawFlash(GuiGraphics g, float partial) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) {
            return;
        }
        float a = flash * fade(mc.level.getGameTime(), partial);
        if (a <= 0.01f) {
            return;
        }
        int alpha = (int) (Math.min(0.85f, a) * 255);
        g.fill(0, 0, g.guiWidth(), g.guiHeight(), (alpha << 24) | 0xFFF0D8);
    }
}
