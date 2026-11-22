package dev.lowpix.winterworks.client.harvester;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/**
 * The pitcher plant's sweet scent (`sweet_scent`, docs/FIXES_0_4.md): a soft golden-pink wisp that drifts up, sways and
 * fades, its 5 frames played over its life (translucent, setSpriteFromAge). Glows a little in the dark.
 */
public class SweetScentParticle extends TextureSheetParticle {
    private final SpriteSet sprites;
    private final float phase;

    protected SweetScentParticle(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, SpriteSet sprites) {
        super(level, x, y, z, dx, dy, dz);
        this.sprites = sprites;
        this.xd = dx;
        this.yd = dy;
        this.zd = dz;
        this.gravity = -0.002f;
        this.friction = 0.96f;
        this.lifetime = 40 + random.nextInt(30);
        this.quadSize = 0.09f + random.nextFloat() * 0.06f;
        this.alpha = 0.0f;
        this.phase = random.nextFloat() * Mth.TWO_PI;
        this.hasPhysics = false;
        setSpriteFromAge(sprites);
    }

    @Override
    public void tick() {
        super.tick();
        if (!removed) {
            setSpriteFromAge(sprites);
            float t = age / (float) lifetime;
            alpha = t < 0.2f ? t / 0.2f * 0.8f : 0.8f * (1f - (t - 0.2f) / 0.8f);
            xd += Mth.sin(age * 0.18f + phase) * 0.0015;
            zd += Mth.cos(age * 0.15f + phase) * 0.0015;
            quadSize *= 1.006f;
        }
    }

    @Override
    protected int getLightColor(float partial) {
        int base = super.getLightColor(partial);
        int block = Math.max(base & 0xFF, 0xB0);   // faintly luminous
        return (base & 0xFF0000) | block;
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    public static class Provider implements ParticleProvider<SimpleParticleType> {
        private final SpriteSet sprites;

        public Provider(SpriteSet sprites) {
            this.sprites = sprites;
        }

        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double dx, double dy, double dz) {
            return new SweetScentParticle(level, x, y, z, dx, dy, dz, sprites);
        }
    }
}
