package dev.lowpix.winterworks.client.end;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/**
 * The Living End's world particles: {@code end_spore} (Chorus Meadows' drifting violet spores), {@code end_dust} (the
 * Dead End's fine grey dust on the wind) and {@code meteor_spark} (sparks spitting off meteorites).
 */
public class EndParticle extends TextureSheetParticle {
    public enum Kind {
        /** A glowing spore: drifts slowly, bobs, swirls, fades in and out. Animated, full bright. */
        SPORE,
        /** A grain of dust: blown along on a steady breeze, tiny and faint. A random still frame. */
        DUST,
        /** A meteor spark: spits out, falls, flickers out. Animated, full bright. */
        SPARK
    }

    private final Kind kind;
    private final SpriteSet sprites;
    private final float baseSize, phase;

    protected EndParticle(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, Kind kind, SpriteSet sprites) {
        super(level, x, y, z);
        this.kind = kind;
        this.sprites = sprites;
        this.hasPhysics = false;
        this.phase = random.nextFloat() * Mth.TWO_PI;
        switch (kind) {
            case SPORE -> {
                lifetime = 120 + random.nextInt(100);
                baseSize = 0.05f + random.nextFloat() * 0.05f;
                xd = (random.nextFloat() - 0.5f) * 0.012;
                yd = 0.004 + random.nextFloat() * 0.006;
                zd = (random.nextFloat() - 0.5f) * 0.012;
                friction = 0.99f;
                gravity = 0f;
            }
            case DUST -> {
                lifetime = 80 + random.nextInt(60);
                baseSize = 0.025f + random.nextFloat() * 0.03f;
                xd = 0.035 + random.nextFloat() * 0.02;   // the Dead End's wind blows east
                yd = (random.nextFloat() - 0.4f) * 0.006;
                zd = 0.012 + (random.nextFloat() - 0.5f) * 0.02;
                friction = 1f;
                gravity = 0f;
            }
            default -> {
                lifetime = 10 + random.nextInt(14);
                baseSize = 0.04f + random.nextFloat() * 0.04f;
                xd = dx == 0 ? (random.nextFloat() - 0.5f) * 0.12 : dx;
                yd = dy == 0 ? 0.08 + random.nextFloat() * 0.1 : dy;
                zd = dz == 0 ? (random.nextFloat() - 0.5f) * 0.12 : dz;
                friction = 0.92f;
                gravity = 0.6f;
                hasPhysics = true;
            }
        }
        quadSize = baseSize;
        if (kind == Kind.DUST) {
            pickSprite(sprites);
        } else {
            setSpriteFromAge(sprites);
        }
    }

    @Override
    public void tick() {
        super.tick();
        float t = age / (float) lifetime;
        switch (kind) {
            case SPORE -> {
                setSpriteFromAge(sprites);
                xd += Mth.sin(age * 0.05f + phase) * 0.0006;
                zd += Mth.cos(age * 0.043f + phase) * 0.0006;
                yd += Mth.sin(age * 0.09f + phase) * 0.0003;
                alpha = Mth.clamp(Math.min(t * 6, (1 - t) * 3), 0, 1) * 0.85f;
                quadSize = baseSize * (0.9f + 0.1f * Mth.sin(age * 0.2f + phase));
            }
            case DUST -> alpha = Mth.sin(t * Mth.PI) * 0.55f;
            default -> {
                setSpriteFromAge(sprites);
                alpha = 1 - t * t;
                quadSize = baseSize * (1 - t * 0.6f);
            }
        }
    }

    @Override
    protected int getLightColor(float partialTick) {
        return kind == Kind.DUST ? super.getLightColor(partialTick) : 0xF000F0;
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    public record Provider(SpriteSet sprites, Kind kind) implements ParticleProvider<SimpleParticleType> {
        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double dx, double dy,
                                       double dz) {
            return new EndParticle(level, x, y, z, dx, dy, dz, kind, sprites);
        }
    }
}
