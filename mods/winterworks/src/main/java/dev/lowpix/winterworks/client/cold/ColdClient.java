package dev.lowpix.winterworks.client.cold;

import dev.lowpix.winterworks.client.particle.ColdParticle;
import dev.lowpix.winterworks.client.particle.ColdParticle.Kind;
import dev.lowpix.winterworks.registry.WWParticles;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.minecraft.core.particles.SimpleParticleType;

/** Client side of the cold: the Cold Zone particles, breath vapour. */
public final class ColdClient {
    private ColdClient() {}

    public static void init() {
        particle(WWParticles.FROST_BREATH, Kind.FROST_BREATH);
        particle(WWParticles.ICE_SHARD, Kind.ICE_SHARD);
        particle(WWParticles.FROST_BURST, Kind.FROST_BURST);
        particle(WWParticles.ROAR_WAVE, Kind.ROAR_WAVE);
        particle(WWParticles.FROST_SLASH, Kind.FROST_SLASH);
        particle(WWParticles.ICE_CRIT, Kind.ICE_CRIT);
        particle(WWParticles.FUR_TUFT, Kind.FUR_TUFT);
        particle(WWParticles.BLIZZARD_FLAKE, Kind.BLIZZARD_FLAKE);
        particle(WWParticles.SNOW_PUFF, Kind.SNOW_PUFF);
        particle(WWParticles.COLD_MIST, Kind.COLD_MIST);
    }

    private static void particle(SimpleParticleType type, Kind kind) {
        ParticleFactoryRegistry.getInstance().register(type, sprites -> new ColdParticle.Provider(sprites, kind));
    }
}
