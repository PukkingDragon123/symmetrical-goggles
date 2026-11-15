package dev.lowpix.winterworks.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/** A tiny flake inside a snow globe: whirls round the globe's axis, slows, drifts down and settles on the scene. */
public class GlobeSnowParticle extends TextureSheetParticle {
    private static final double RADIUS = 0.27, FLOOR = -0.17;
    private final double cx, cy, cz;
    private double swirl;
    private boolean settled;

    GlobeSnowParticle(ClientLevel level, double x, double y, double z, double cx, double cy, double cz, SpriteSet sprites) {
        super(level, x, y, z);
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        pickSprite(sprites);
        quadSize = 0.008f + random.nextFloat() * 0.01f;
        lifetime = 110 + random.nextInt(80);
        swirl = (0.025 + random.nextDouble() * 0.03) * (random.nextBoolean() ? 1 : 1);
        xd = (random.nextDouble() - 0.5) * 0.02;
        yd = 0.01 + random.nextDouble() * 0.025;
        zd = (random.nextDouble() - 0.5) * 0.02;
        hasPhysics = false;
        gravity = 0f;
        float c = 0.92f + random.nextFloat() * 0.08f;
        setColor(c, c, 1f);
    }

    @Override
    public void tick() {
        xo = x;
        yo = y;
        zo = z;
        if (age++ >= lifetime) {
            remove();
            return;
        }
        if (settled) {
            if (lifetime - age < 20) {
                alpha = (lifetime - age) / 20f;
            }
            return;
        }
        double rx = x - cx, rz = z - cz;
        double r = Math.sqrt(rx * rx + rz * rz) + 1e-6;
        // whirl around the vertical axis, spiralling slightly outward, losing energy
        xd += (-rz / r) * swirl * 0.25 + rx / r * 0.0006;
        zd += (rx / r) * swirl * 0.25 + rz / r * 0.0006;
        swirl *= 0.965;
        yd -= 0.0009;      // sink, slowly
        xd *= 0.9;
        yd *= 0.94;
        zd *= 0.9;
        x += xd;
        y += yd;
        z += zd;
        // stay inside the glass
        double dx = x - cx, dy = y - cy, dz = z - cz;
        double d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > RADIUS) {
            double k = RADIUS / d;
            x = cx + dx * k;
            y = cy + dy * k;
            z = cz + dz * k;
            xd *= -0.3;
            zd *= -0.3;
        }
        if (y < cy + FLOOR) {
            y = cy + FLOOR + random.nextDouble() * 0.01;
            settled = swirl < 0.004 || random.nextInt(4) == 0;
            yd = 0;
        }
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
                                       double cx, double cy, double cz) {
            return new GlobeSnowParticle(level, x, y, z, cx, cy, cz, sprites);
        }
    }
}
