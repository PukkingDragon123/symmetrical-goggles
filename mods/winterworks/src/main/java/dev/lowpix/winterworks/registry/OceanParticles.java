package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

/**
 * The Tides & Treasures world's particles (docs/OCEAN_UPDATE.md section 11): {@code vent_smoke} (the black-smoker
 * plume of a hydrothermal vent) and {@code bioluminescence} (glowing motes in the abyss and round tube worms). Their
 * providers are in client.ocean.OceanWorldClient. The whale's, the boss's and the mobs' particles are registered by
 * their own areas.
 */
public final class OceanParticles {
    public static final SimpleParticleType VENT_SMOKE = reg("vent_smoke");
    public static final SimpleParticleType BIOLUMINESCENCE = reg("bioluminescence");

    private OceanParticles() {}

    private static SimpleParticleType reg(String name) {
        return Registry.register(BuiltInRegistries.PARTICLE_TYPE, Winterworks.id(name), FabricParticleTypes.simple());
    }

    public static void init() {}
}
