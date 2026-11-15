package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

public final class WWParticles {
    /** Tiny flakes swirling inside a snow globe. Spawn with velocity = the globe centre (x, y, z). */
    public static final SimpleParticleType GLOBE_SNOW = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("globe_snow"), FabricParticleTypes.simple(true));
    /** Dizzy stars circling a stunned mob's head. Spawn with velocity = (entity id, 0, 0). */
    public static final SimpleParticleType STUN_STAR = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("stun_star"), FabricParticleTypes.simple(true));

    private WWParticles() {}

    public static void init() {}
}
