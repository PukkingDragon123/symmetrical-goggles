package dev.lowpix.winterworks.client.endgear;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;

/**
 * {@code winterworks:obsidian_crack}: a chip of obsidian flying off a shell (petrification, the shield). It tumbles,
 * falls, bounces once off the ground and crumbles through its frames. Spawned with its velocity.
 */
public class ObsidianCrackParticle extends TextureSheetParticle {
    private final SpriteSet sprites;
    private final float spin;

    ObsidianCrackParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites) {
        super(level, x, y, z, vx, vy, vz);
        this.sprites = sprites;
        xd = vx + (random.nextDouble() - 0.5) * 0.05;
        yd = vy + random.nextDouble() * 0.06;
        zd = vz + (random.nextDouble() - 0.5) * 0.05;
        lifetime = 22 + random.nextInt(16);
        quadSize = 0.07f + random.nextFloat() * 0.08f;
        gravity = 0.9f;
        friction = 0.94f;
        hasPhysics = true;
        spin = (random.nextFloat() - 0.5f) * 0.6f;
        roll = random.nextFloat() * 6.28f;
        float shade = 0.75f + random.nextFloat() * 0.25f;
        setColor(shade, shade, shade);
        setSpriteFromAge(sprites);
    }

    @Override
    public void tick() {
        super.tick();
        oRoll = roll;
        if (!onGround) {
            roll += spin;
        }
        setSpriteFromAge(sprites);
        if (age > lifetime - 6) {
            alpha = (lifetime - age) / 6f;
        }
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    public record Provider(SpriteSet sprites) implements ParticleProvider<SimpleParticleType> {
        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double vx, double vy,
                                       double vz) {
            return new ObsidianCrackParticle(level, x, y, z, vx, vy, vz, sprites);
        }
    }
}
