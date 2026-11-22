package dev.lowpix.winterworks.client.oceangear;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/**
 * {@code elder_bubble}: a small full-bright bubble that rises and wobbles, shimmering through frames 0-3, and shows
 * frame 4 (the pop) for its last two ticks.
 */
public class ElderBubbleParticle extends TextureSheetParticle {
    private final SpriteSet sprites;
    private final float phase;

    ElderBubbleParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites) {
        super(level, x, y, z, vx, vy, vz);
        this.sprites = sprites;
        xd = vx + (random.nextFloat() - 0.5f) * 0.02f;
        yd = vy + 0.01 + random.nextFloat() * 0.02f;
        zd = vz + (random.nextFloat() - 0.5f) * 0.02f;
        lifetime = 14 + random.nextInt(12);
        quadSize = 0.08f + random.nextFloat() * 0.12f;
        gravity = -0.015f;
        friction = 0.92f;
        phase = random.nextFloat() * Mth.TWO_PI;
        hasPhysics = false;
        setSprite(sprites.get(0, 4));
    }

    @Override
    public void tick() {
        super.tick();
        if (removed) {
            return;
        }
        xd += Mth.sin(age * 0.5f + phase) * 0.004f;
        zd += Mth.cos(age * 0.5f + phase) * 0.004f;
        int frame = age >= lifetime - 2 ? 4 : (age / 2) % 4;
        setSprite(sprites.get(frame, 4));
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    @Override
    protected int getLightColor(float partial) {
        return 0xF000F0;
    }

    public static final class Provider implements ParticleProvider<SimpleParticleType> {
        private final SpriteSet sprites;

        public Provider(SpriteSet sprites) {
            this.sprites = sprites;
        }

        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double vx, double vy, double vz) {
            return new ElderBubbleParticle(level, x, y, z, vx, vy, vz, sprites);
        }
    }
}
