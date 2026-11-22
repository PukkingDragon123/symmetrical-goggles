package dev.lowpix.winterworks.client.endboss;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/**
 * `eclipse_mote`: a glowing violet-gold mote that drifts and wavers, twinkling as it goes (the eclipse's air, the
 * Monolith's gaze, the light beam's landing). Drawn at full brightness; its frames play over its life.
 */
public class EclipseMoteParticle extends TextureSheetParticle {
    private final SpriteSet sprites;
    private final float spin, phase;

    EclipseMoteParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites) {
        super(level, x, y, z, vx, vy, vz);
        this.sprites = sprites;
        xd = vx + (random.nextDouble() - 0.5) * 0.01;
        yd = vy + (random.nextDouble() - 0.5) * 0.01;
        zd = vz + (random.nextDouble() - 0.5) * 0.01;
        lifetime = 50 + random.nextInt(70);
        quadSize = 0.07f + random.nextFloat() * 0.09f;
        hasPhysics = false;
        friction = 0.97f;
        gravity = -0.002f;
        spin = (random.nextFloat() - 0.5f) * 0.12f;
        phase = random.nextFloat() * Mth.TWO_PI;
        boolean gold = random.nextInt(3) == 0;
        rCol = gold ? 1.0f : 0.92f;
        gCol = gold ? 0.86f : 0.74f;
        bCol = gold ? 0.62f : 1.0f;
        setSpriteFromAge(sprites);
    }

    @Override
    public void tick() {
        super.tick();
        if (removed) {
            return;
        }
        xd += Mth.sin(age * 0.11f + phase) * 0.0015;
        zd += Mth.cos(age * 0.09f + phase) * 0.0015;
        oRoll = roll;
        roll += spin;
        setSpriteFromAge(sprites);
        float in = Math.min(1f, age / 10f), out = Math.min(1f, (lifetime - age) / 15f);
        alpha = in * out * (0.75f + 0.25f * Mth.sin(age * 0.6f + phase));
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    @Override
    protected int getLightColor(float partial) {
        return 0xF000F0;
    }

    public record Provider(SpriteSet sprites) implements ParticleProvider<SimpleParticleType> {
        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double vx, double vy, double vz) {
            return new EclipseMoteParticle(level, x, y, z, vx, vy, vz, sprites);
        }
    }
}
