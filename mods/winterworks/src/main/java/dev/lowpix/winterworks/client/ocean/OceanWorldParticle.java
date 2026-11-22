package dev.lowpix.winterworks.client.ocean;

import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;

/**
 * The Tides & Treasures world particles (docs/OCEAN_UPDATE.md section 11): {@code vent_smoke}, the black-smoker plume
 * over a hydrothermal vent (6 frames over its 40-60 tick life, rising, billowing out and fading, gone when it reaches
 * the surface), and {@code bioluminescence}, tiny full-bright motes drifting in the dark water (4 frames, twinkling;
 * only in water, so the abyss's ambient motes never show in the air over it).
 */
public class OceanWorldParticle extends TextureSheetParticle {
    public enum Kind { SMOKE, GLOW }

    private final Kind kind;
    private final SpriteSet sprites;
    private final boolean wet;
    private final float baseSize, phase;

    protected OceanWorldParticle(ClientLevel level, double x, double y, double z, double dx, double dy, double dz, Kind kind, SpriteSet sprites) {
        super(level, x, y, z);
        this.kind = kind;
        this.sprites = sprites;
        this.hasPhysics = false;
        this.wet = inWater();
        this.phase = random.nextFloat() * Mth.TWO_PI;
        if (kind == Kind.SMOKE) {
            lifetime = 40 + random.nextInt(21);
            baseSize = 0.16f + random.nextFloat() * 0.08f;
            xd = dx;
            yd = dy;
            zd = dz;
            friction = 0.97f;
            gravity = wet ? -0.006f : -0.002f;   // buoyant hot water
            setSpriteFromAge(sprites);
        } else {
            lifetime = 60 + random.nextInt(90);
            baseSize = 0.03f + random.nextFloat() * 0.04f;
            xd = dx + (random.nextFloat() - 0.5f) * 0.006;
            yd = dy + (random.nextFloat() - 0.5f) * 0.004;
            zd = dz + (random.nextFloat() - 0.5f) * 0.006;
            friction = 0.99f;
            gravity = 0f;
            setSprite(sprites.get(random.nextInt(4), 3));
            if (!wet) {
                remove();
            }
        }
        quadSize = baseSize;
    }

    private boolean inWater() {
        return level.getFluidState(BlockPos.containing(x, y, z)).is(FluidTags.WATER);
    }

    @Override
    public void tick() {
        super.tick();
        if (!isAlive()) {
            return;
        }
        float t = age / (float) lifetime;
        if (kind == Kind.SMOKE) {
            if (age % 3 == 0 && inWater() != wet) {
                remove();   // it reached the surface (or sank into the sea from the air)
                return;
            }
            setSpriteFromAge(sprites);
            quadSize = baseSize * (1 + t * 2.4f);
            alpha = Mth.clamp(Math.min(t * 8, (1 - t) * 2.2f), 0, 1) * 0.9f;
            xd += Mth.sin(age * 0.11f + phase) * 0.0012;
            zd += Mth.cos(age * 0.09f + phase) * 0.0012;
        } else {
            if (age % 5 == 0 && !inWater()) {
                remove();
                return;
            }
            int frame = (int) ((age / 6 + phase * 3) % 4);
            setSprite(sprites.get(frame, 3));
            xd += Mth.sin(age * 0.05f + phase) * 0.0004;
            zd += Mth.cos(age * 0.045f + phase) * 0.0004;
            alpha = Mth.clamp(Math.min(t * 5, (1 - t) * 3), 0, 1) * (0.65f + 0.35f * Mth.sin(age * 0.25f + phase));
        }
    }

    @Override
    protected int getLightColor(float partialTick) {
        return kind == Kind.GLOW ? 0xF000F0 : super.getLightColor(partialTick);
    }

    @Override
    public ParticleRenderType getRenderType() {
        return ParticleRenderType.PARTICLE_SHEET_TRANSLUCENT;
    }

    public record Provider(SpriteSet sprites, Kind kind) implements ParticleProvider<SimpleParticleType> {
        @Override
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double dx, double dy, double dz) {
            return new OceanWorldParticle(level, x, y, z, dx, dy, dz, kind, sprites);
        }
    }
}
