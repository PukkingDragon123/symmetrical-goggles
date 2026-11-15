package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;

/** Data-driven damage types (data/winterworks/damage_type/*.json). */
public final class WWDamage {
    /** Wearing fur armour in the Nether. */
    public static final ResourceKey<DamageType> OVERHEAT = key("overheat");
    /** Hit by a falling icicle. */
    public static final ResourceKey<DamageType> FALLING_ICICLE = key("falling_icicle");

    private WWDamage() {}

    private static ResourceKey<DamageType> key(String name) {
        return ResourceKey.create(Registries.DAMAGE_TYPE, Winterworks.id(name));
    }

    public static DamageSource source(Level level, ResourceKey<DamageType> type) {
        return new DamageSource(level.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE).getHolderOrThrow(type));
    }

    public static DamageSource source(Level level, ResourceKey<DamageType> type, Entity direct) {
        return new DamageSource(level.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE).getHolderOrThrow(type), direct);
    }
}
