package dev.lowpix.winterworks.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;

/** Cartoon dizzy stars circling a stunned mob's head. Spawned with velocity (entity id, phase, 0). */
public class StunStarParticle extends TextureSheetParticle {
    private final Entity target;
    private final SpriteSet sprites;
    private final float phase;

    StunStarParticle(ClientLevel level, double x, double y, double z, Entity target, float phase, SpriteSet sprites) {
        super(level, x, y, z);
        this.target = target;
        this.phase = phase;
        this.sprites = sprites;
        lifetime = 26;
        quadSize = 0.12f;
        hasPhysics = false;
        setSpriteFromAge(sprites);
    }

    @Override
    public void tick() {
        xo = x;
        yo = y;
        zo = z;
        if (age++ >= lifetime || target == null || !target.isAlive()) {
            remove();
            return;
        }
        float a = phase + age * 0.35f;
        double r = target.getBbWidth() * 0.55 + 0.15;
        x = target.getX() + Mth.cos(a) * r;
        z = target.getZ() + Mth.sin(a) * r;
        y = target.getY() + target.getBbHeight() + 0.15 + Mth.sin(age * 0.5f) * 0.04;
        setSpriteFromAge(sprites);
        alpha = age > lifetime - 6 ? (lifetime - age) / 6f : 1f;
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
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z,
                                       double id, double phase, double unused) {
            Entity e = level.getEntity((int) id);
            if (e == null) {
                return null;
            }
            return new StunStarParticle(level, x, y, z, e, (float) phase, sprites);
        }
    }
}
