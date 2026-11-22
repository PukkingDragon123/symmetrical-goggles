package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;

/**
 * The Living End's particles (docs/END_UPDATE.md). Client providers: end_spore, end_dust, meteor_spark (world);
 * blinding_dust, gucker_breath, enderfly_scale (mobs); obsidian_crack (gear); eclipse_mote (bosses).
 */
public final class EndParticles {
    public static final SimpleParticleType END_SPORE = reg("end_spore");
    public static final SimpleParticleType END_DUST = reg("end_dust");
    public static final SimpleParticleType ECLIPSE_MOTE = reg("eclipse_mote");
    public static final SimpleParticleType BLINDING_DUST = reg("blinding_dust");
    public static final SimpleParticleType GUCKER_BREATH = reg("gucker_breath");
    public static final SimpleParticleType ENDERFLY_SCALE = reg("enderfly_scale");
    public static final SimpleParticleType OBSIDIAN_CRACK = reg("obsidian_crack");
    public static final SimpleParticleType METEOR_SPARK = reg("meteor_spark");

    private EndParticles() {}

    private static SimpleParticleType reg(String name) {
        return Registry.register(BuiltInRegistries.PARTICLE_TYPE, Winterworks.id(name), FabricParticleTypes.simple());
    }

    public static void init() {}
}
