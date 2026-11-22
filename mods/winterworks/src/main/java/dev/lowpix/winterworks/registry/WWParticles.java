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

    // ---- Cold Zone update: simple particles (docs/COLD_UPDATE.md section 10)
    public static final SimpleParticleType FROST_BREATH = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("frost_breath"), FabricParticleTypes.simple());
    public static final SimpleParticleType ICE_SHARD = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("ice_shard"), FabricParticleTypes.simple());
    public static final SimpleParticleType FROST_BURST = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("frost_burst"), FabricParticleTypes.simple());
    public static final SimpleParticleType ROAR_WAVE = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("roar_wave"), FabricParticleTypes.simple());
    public static final SimpleParticleType FROST_SLASH = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("frost_slash"), FabricParticleTypes.simple());
    public static final SimpleParticleType ICE_CRIT = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("ice_crit"), FabricParticleTypes.simple());
    public static final SimpleParticleType FUR_TUFT = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("fur_tuft"), FabricParticleTypes.simple());
    public static final SimpleParticleType BLIZZARD_FLAKE = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("blizzard_flake"), FabricParticleTypes.simple());
    public static final SimpleParticleType SNOW_PUFF = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("snow_puff"), FabricParticleTypes.simple());
    public static final SimpleParticleType COLD_MIST = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("cold_mist"), FabricParticleTypes.simple());

    // ---- Amber Age update
    public static final SimpleParticleType BLOOD_DRIP = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("blood_drip"), FabricParticleTypes.simple());
    public static final SimpleParticleType AMBER_GLINT = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("amber_glint"), FabricParticleTypes.simple());
    public static final SimpleParticleType CAVE_DUST = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("cave_dust"), FabricParticleTypes.simple());

    // ---- Hexes & Havoc
    public static final SimpleParticleType HEX_RUNE = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("hex_rune"), FabricParticleTypes.simple());
    public static final SimpleParticleType GOLD_GLINT = Registry.register(BuiltInRegistries.PARTICLE_TYPE,
            Winterworks.id("gold_glint"), FabricParticleTypes.simple());

    private WWParticles() {}

    public static void init() {}
}
