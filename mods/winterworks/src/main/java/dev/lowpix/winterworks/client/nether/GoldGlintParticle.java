package dev.lowpix.winterworks.client.nether;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleProvider;
import net.minecraft.client.particle.ParticleRenderType;
import net.minecraft.client.particle.SpriteSet;
import net.minecraft.client.particle.TextureSheetParticle;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * A gold glint: a little four-point twinkle that flares and fades, drifting up. Uses the art's frames
 * (particles/gold_glint.json) when there are any, else vanilla's glitter sprites tinted gold, so missing art is fine.
 */
public class GoldGlintParticle extends TextureSheetParticle {
    private final SpriteSet sprites;
    private final boolean own;

    GoldGlintParticle(ClientLevel level, double x, double y, double z, double vx, double vy, double vz, SpriteSet sprites) {
        super(level, x, y, z, vx, vy, vz);
        this.sprites = sprites;
        xd = vx + (random.nextDouble() - 0.5) * 0.01;
        yd = vy + 0.005 + random.nextDouble() * 0.01;
        zd = vz + (random.nextDouble() - 0.5) * 0.01;
        lifetime = 14 + random.nextInt(10);
        quadSize = 0.06f + random.nextFloat() * 0.05f;
        hasPhysics = false;
        gravity = 0f;
        friction = 0.9f;
        boolean ok;
        try {
            setSpriteFromAge(sprites);
            ok = true;
        } catch (RuntimeException e) {   // no frames listed for gold_glint at all: vanilla glitter
            ok = false;
            AbstractTexture atlas = Minecraft.getInstance().getTextureManager().getTexture(TextureAtlas.LOCATION_PARTICLES);
            if (atlas instanceof TextureAtlas a) {
                setSprite(a.getSprite(ResourceLocation.withDefaultNamespace("glitter_" + (3 + random.nextInt(5)))));
            }
        }
        own = ok;
        if (!ok || "minecraft".equals(sprite.contents().name().getNamespace())) {
            setColor(1.0f, 0.82f, 0.25f);   // vanilla's white glitter, made gold (the art's own frames are gold already)
        }
    }

    @Override
    public void tick() {
        super.tick();
        if (own && !removed) {
            setSpriteFromAge(sprites);
        }
        float t = age / (float) lifetime;
        alpha = t < 0.2f ? t / 0.2f : 1f - Mth.clamp((t - 0.5f) / 0.5f, 0f, 1f);
    }

    @Override
    public float getQuadSize(float partial) {
        float t = (age + partial) / lifetime;
        return quadSize * (0.6f + 0.6f * Mth.sin(t * Mth.PI));
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
        public Particle createParticle(SimpleParticleType type, ClientLevel level, double x, double y, double z, double vx, double vy,
                                       double vz) {
            return new GoldGlintParticle(level, x, y, z, vx, vy, vz, sprites);
        }
    }
}
