package dev.lowpix.winterworks.client.particle;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.Mth;

/**
 * The Cold Zone's 2D pixel-art particles (docs/COLD_UPDATE.md section 10). One class, one behaviour per {@link Kind}.
 * Spawn them with the usual (x, y, z, dx, dy, dz): the velocity is used as given (roar_wave and frost_burst take
 * dx as their final size in blocks; frost_slash takes dx as its roll in radians).
 */
public class ColdParticle extends TextureSheetParticle {
    public enum Kind {
        /** Vapour puff: drifts with its velocity, rises a little, swells and fades. Animated. */
        FROST_BREATH,
        /** Ice debris: falls, tumbles, bounces once. A random still frame. */
        ICE_SHARD,
        /** Expanding frost burst: grows to dx blocks (default 3). Animated, full bright. */
        FROST_BURST,
        /** Shockwave ring: grows to dx blocks (default 6). Animated, full bright. */
        ROAR_WAVE,
        /** Icy slash arc: still, quick, rolled by dx radians. Animated, full bright. */
        FROST_SLASH,
        /** Icy crit sparkle: bursts out and slows. Animated, full bright. */
        ICE_CRIT,
        /** Fur tuft: drifts down and sways. A random still frame. */
        FUR_TUFT,
        /** Wind-blown snow: flies with its velocity. A random still frame. */
        BLIZZARD_FLAKE,
        /** Landing/slam puff: spreads out, rises and fades. Animated. */
        SNOW_PUFF,
        /** Low mist: big, slow, very faint. A random still frame. */
        COLD_MIST,
        /** A drop of blood: falls and fades. A random still frame. */
        BLOOD_DRIP,
        /** A glint of amber light: twinkles in place. Animated, full bright. */
        AMBER_GLINT,
        /** Drifting cave dust (Dead Caves): tiny, slow, faint. A random still frame. */
        CAVE_DUST
    }

    private final Kind kind;
    private final SpriteSet sprites;
    private final boolean animated;
    private float baseSize, endSize, baseAlpha, spin;
    private boolean bounced;

    protected ColdParticle(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, Kind kind, SpriteSet sprites) {
        super(level, x, y, z);
        this.kind = kind;
        this.sprites = sprites;
        this.xd = dx;
        this.yd = dy;
        this.zd = dz;
        this.hasPhysics = false;
        this.gravity = 0f;
        this.friction = 0.96f;
        this.baseAlpha = 1f;
        boolean anim = true;
        switch (kind) {
            case FROST_BREATH -> {
                lifetime = 18 + random.nextInt(10);
                baseSize = 0.12f;
                endSize = 0.32f;
                baseAlpha = 0.7f;
                gravity = -0.01f;
                friction = 0.9f;
            }
            case ICE_SHARD -> {
                lifetime = 22 + random.nextInt(18);
                baseSize = endSize = 0.06f + random.nextFloat() * 0.06f;
                gravity = 0.9f;
                hasPhysics = true;
                friction = 0.98f;
                spin = (random.nextFloat() - 0.5f) * 0.6f;
                anim = false;
            }
            case FROST_BURST -> {
                lifetime = 12;
                baseSize = 0.3f;
                endSize = dx > 0 ? (float) dx * 0.5f : 1.5f;
                xd = yd = zd = 0;
            }
            case ROAR_WAVE -> {
                lifetime = 14;
                baseSize = 0.5f;
                endSize = dx > 0 ? (float) dx * 0.5f : 3f;
                baseAlpha = 0.8f;
                xd = yd = zd = 0;
            }
            case FROST_SLASH -> {
                lifetime = 7;
                baseSize = endSize = 0.55f;
                roll = oRoll = (float) dx;
                xd = yd = zd = 0;
            }
            case ICE_CRIT -> {
                lifetime = 10 + random.nextInt(8);
                baseSize = 0.1f;
                endSize = 0.04f;
                friction = 0.75f;
            }
            case FUR_TUFT -> {
                lifetime = 40 + random.nextInt(25);
                baseSize = endSize = 0.08f + random.nextFloat() * 0.04f;
                gravity = 0.04f;
                friction = 0.92f;
                spin = (random.nextFloat() - 0.5f) * 0.15f;
                anim = false;
            }
            case BLIZZARD_FLAKE -> {
                lifetime = 50 + random.nextInt(40);
                baseSize = endSize = 0.05f + random.nextFloat() * 0.05f;
                gravity = 0.02f;
                friction = 1f;
                spin = (random.nextFloat() - 0.5f) * 0.2f;
                anim = false;
            }
            case SNOW_PUFF -> {
                lifetime = 10 + random.nextInt(6);
                baseSize = 0.2f;
                endSize = 0.5f;
                gravity = -0.02f;
                friction = 0.82f;
            }
            case BLOOD_DRIP -> {
                lifetime = 18 + random.nextInt(10);
                baseSize = endSize = 0.05f + random.nextFloat() * 0.03f;
                gravity = 0.6f;
                hasPhysics = true;
                anim = false;
            }
            case AMBER_GLINT -> {
                lifetime = 10 + random.nextInt(8);
                baseSize = 0.08f;
                endSize = 0.02f;
                friction = 0.8f;
            }
            case CAVE_DUST -> {
                lifetime = 80 + random.nextInt(60);
                baseSize = endSize = 0.03f + random.nextFloat() * 0.03f;
                baseAlpha = 0.6f;
                gravity = 0.002f;
                friction = 0.99f;
                xd = (random.nextFloat() - 0.5f) * 0.01f;
                zd = (random.nextFloat() - 0.5f) * 0.01f;
                anim = false;
            }
            case COLD_MIST -> {
                lifetime = 70 + random.nextInt(50);
                baseSize = endSize = 0.9f + random.nextFloat() * 0.8f;
                baseAlpha = 0.28f;
                friction = 0.99f;
                anim = false;
            }
        }
        this.animated = anim;
        this.quadSize = baseSize;
        this.alpha = kind == Kind.COLD_MIST ? 0f : baseAlpha;
        sprite(true);
    }

    /** Missing textures (an incomplete resource pack) must not crash the game: such a particle just vanishes. */
    private void sprite(boolean first) {
        try {
            if (animated) {
                setSpriteFromAge(sprites);
            } else if (first) {
                pickSprite(sprites);
            }
        } catch (RuntimeException e) {
            remove();
        }
    }

    @Override
    public void tick() {
        super.tick();
        if (removed) {
            return;
        }
        float t = (float) age / lifetime;
        quadSize = Mth.lerp(t, baseSize, endSize);
        sprite(false);
        oRoll = roll;
        roll += spin;
        switch (kind) {
            case FROST_BREATH, SNOW_PUFF, ROAR_WAVE -> alpha = baseAlpha * (1f - t * t);
            case COLD_MIST, CAVE_DUST -> alpha = baseAlpha * Mth.sin(t * Mth.PI);
            case FUR_TUFT -> xd += Mth.sin((age + (float) x * 7f) * 0.25f) * 0.004f;
            case ICE_SHARD -> {
                if (onGround && !bounced) {
                    bounced = true;
                    yd = 0.12f;
                    xd *= 0.5f;
                    zd *= 0.5f;
                } else if (onGround) {
                    spin = 0;
                }
                alpha = t > 0.75f ? (1f - t) * 4f : 1f;
            }
            default -> {
            }
        }
    }

    @Override
    protected int getLightColor(float partial) {
        return switch (kind) {
            case FROST_BURST, ROAR_WAVE, FROST_SLASH, ICE_CRIT, AMBER_GLINT -> 0xF000F0;
            default -> super.getLightColor(partial);
        };
    }

    @Override
    public void render(com.mojang.blaze3d.vertex.VertexConsumer buffer, net.minecraft.client.Camera camera, float partial) {
        if (sprite != null) {
            super.render(buffer, camera, partial);
        }
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    /** A provider for one kind. */
    public record Provider(SpriteSet sprites, Kind kind) implements ParticleProvider<SimpleParticleType> {
        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z,
                                       double dx, double dy, double dz) {
            return new ColdParticle(level, x, y, z, dx, dy, dz, kind, sprites);
        }
    }
}
