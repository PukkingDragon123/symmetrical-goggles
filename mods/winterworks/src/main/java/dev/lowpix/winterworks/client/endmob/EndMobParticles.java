package dev.lowpix.winterworks.client.endmob;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/**
 * The mobs' particles (docs/END_UPDATE.md sections 4 and 7): `blinding_dust` (the Gucker's spit and its cloud),
 * `gucker_breath` (the puffs from its vents) and `enderfly_scale` (scales an Enderfly sheds). They use the art's frames
 * (particles/*.json) when it has them, else vanilla sprites tinted to match (data_end_mobs.py lists those).
 */
public class EndMobParticles extends TextureSheetParticle {
    public enum Kind { BLINDING_DUST, GUCKER_BREATH, ENDERFLY_SCALE }

    private final Kind kind;
    private final SpriteSet sprites;
    private final float baseSize, endSize, baseAlpha;
    private final float swayPhase;

    EndMobParticles(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, Kind kind, SpriteSet sprites) {
        super(level, x, y, z);
        this.kind = kind;
        this.sprites = sprites;
        this.xd = dx;
        this.yd = dy;
        this.zd = dz;
        this.hasPhysics = false;
        this.swayPhase = random.nextFloat() * Mth.TWO_PI;
        switch (kind) {
            case BLINDING_DUST -> {
                lifetime = 30 + random.nextInt(25);
                baseSize = 0.22f + random.nextFloat() * 0.15f;
                endSize = baseSize * 2.2f;
                baseAlpha = 0.75f;
                gravity = -0.002f;
                friction = 0.92f;
            }
            case GUCKER_BREATH -> {
                lifetime = 16 + random.nextInt(10);
                baseSize = 0.08f + random.nextFloat() * 0.04f;
                endSize = baseSize * 2.6f;
                baseAlpha = 0.6f;
                gravity = -0.004f;
                friction = 0.9f;
            }
            default -> {
                lifetime = 30 + random.nextInt(30);
                baseSize = endSize = 0.05f + random.nextFloat() * 0.035f;
                baseAlpha = 1f;
                gravity = 0.006f;
                friction = 0.95f;
            }
        }
        quadSize = baseSize;
        alpha = baseAlpha;
        setSpriteFromAge(sprites);
        if ("minecraft".equals(sprite.contents().name().getNamespace())) {
            // vanilla stand-in sprites: tint them
            switch (kind) {
                case BLINDING_DUST -> setColor(0.72f + random.nextFloat() * 0.08f, 0.68f, 0.78f);
                case GUCKER_BREATH -> setColor(0.78f, 0.75f, 0.68f);
                default -> setColor(0.78f + random.nextFloat() * 0.2f, 0.45f + random.nextFloat() * 0.2f, 1.0f);
            }
        }
    }

    @Override
    public void tick() {
        super.tick();
        if (removed) {
            return;
        }
        setSpriteFromAge(sprites);
        float t = age / (float) lifetime;
        quadSize = Mth.lerp(t, baseSize, endSize);
        alpha = baseAlpha * (t < 0.15f ? t / 0.15f : 1f - Mth.clamp((t - 0.45f) / 0.55f, 0f, 1f));
        if (kind == Kind.ENDERFLY_SCALE) {
            // a scale flutters down, swinging side to side
            float s = Mth.sin(age * 0.35f + swayPhase) * 0.012f;
            xd += s;
            zd += Mth.cos(age * 0.31f + swayPhase) * 0.012f;
            roll = Mth.sin(age * 0.25f + swayPhase) * 0.8f;
            oRoll = roll;
        }
    }

    @Override
    protected int getLightColor(float partial) {
        return kind == Kind.ENDERFLY_SCALE ? 0xF000F0 : super.getLightColor(partial);
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    public record Provider(SpriteSet sprites, Kind kind) implements ParticleProvider<SimpleParticleType> {
        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double dx, double dy,
                                       double dz) {
            return new EndMobParticles(level, x, y, z, dx, dy, dz, kind, sprites);
        }
    }
}
