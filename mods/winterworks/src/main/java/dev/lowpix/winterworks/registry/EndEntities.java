package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

/** The Living End's entities (docs/END_UPDATE.md). Spawn rules and biome spawns belong to the owning feature. */
public final class EndEntities {
    public static final EntityType<dev.lowpix.winterworks.endmob.Enderfly> ENDERFLY = reg("enderfly",
            EntityType.Builder.of(dev.lowpix.winterworks.endmob.Enderfly::new, MobCategory.MONSTER).sized(0.7f, 0.6f)
                    .clientTrackingRange(8));
    public static final EntityType<dev.lowpix.winterworks.endmob.Endling> ENDLING = reg("endling",
            EntityType.Builder.of(dev.lowpix.winterworks.endmob.Endling::new, MobCategory.CREATURE).sized(0.5f, 0.9f)
                    .clientTrackingRange(8));
    public static final EntityType<dev.lowpix.winterworks.endmob.Gucker> GUCKER = reg("gucker",
            EntityType.Builder.of(dev.lowpix.winterworks.endmob.Gucker::new, MobCategory.MONSTER).sized(1.6f, 0.9f)
                    .clientTrackingRange(10));
    public static final EntityType<dev.lowpix.winterworks.endmob.GuckerSpit> GUCKER_SPIT = reg("gucker_spit",
            EntityType.Builder.<dev.lowpix.winterworks.endmob.GuckerSpit>of(dev.lowpix.winterworks.endmob.GuckerSpit::new,
                    MobCategory.MISC).sized(0.4f, 0.4f).clientTrackingRange(6).updateInterval(2));
    public static final EntityType<dev.lowpix.winterworks.endmob.Obolisk> OBOLISK = reg("obolisk",
            EntityType.Builder.of(dev.lowpix.winterworks.endmob.Obolisk::new, MobCategory.MONSTER).sized(2.0f, 4.0f)
                    .eyeHeight(2.8f).fireImmune().clientTrackingRange(10));   // the 2 x 4 block; eyes carved at 45 px
    public static final EntityType<dev.lowpix.winterworks.endboss.Monolith> MONOLITH = reg("monolith",
            EntityType.Builder.of(dev.lowpix.winterworks.endboss.Monolith::new, MobCategory.MONSTER).sized(3.0f, 7.0f)
                    .fireImmune().clientTrackingRange(16));
    public static final EntityType<dev.lowpix.winterworks.endboss.DragonLightBeam> DRAGON_LIGHT_BEAM = reg("dragon_light_beam",
            EntityType.Builder.<dev.lowpix.winterworks.endboss.DragonLightBeam>of(dev.lowpix.winterworks.endboss.DragonLightBeam::new,
                    MobCategory.MISC).sized(0.5f, 0.5f).fireImmune().clientTrackingRange(16).updateInterval(1));
    public static final EntityType<dev.lowpix.winterworks.endgear.Dragonling> DRAGONLING = reg("dragonling",
            EntityType.Builder.of(dev.lowpix.winterworks.endgear.Dragonling::new, MobCategory.CREATURE).sized(0.8f, 0.7f)
                    .fireImmune().clientTrackingRange(10));
    // ---- section 16: falling meteorites (end.FallingMeteorite, end.MeteorShower)
    public static final EntityType<dev.lowpix.winterworks.end.FallingMeteorite> FALLING_METEORITE = reg("falling_meteorite",
            EntityType.Builder.<dev.lowpix.winterworks.end.FallingMeteorite>of(dev.lowpix.winterworks.end.FallingMeteorite::new,
                    MobCategory.MISC).sized(1.0f, 1.0f).fireImmune().clientTrackingRange(16).updateInterval(2));

    private EndEntities() {}

    private static <T extends Entity> EntityType<T> reg(String name, EntityType.Builder<T> b) {
        return Registry.register(BuiltInRegistries.ENTITY_TYPE, Winterworks.id(name), b.build(Winterworks.id(name).toString()));
    }

    public static void init() {
        FabricDefaultAttributeRegistry.register(ENDERFLY, dev.lowpix.winterworks.endmob.Enderfly.createAttributes());
        FabricDefaultAttributeRegistry.register(ENDLING, dev.lowpix.winterworks.endmob.Endling.createAttributes());
        FabricDefaultAttributeRegistry.register(GUCKER, dev.lowpix.winterworks.endmob.Gucker.createAttributes());
        FabricDefaultAttributeRegistry.register(OBOLISK, dev.lowpix.winterworks.endmob.Obolisk.createAttributes());
        FabricDefaultAttributeRegistry.register(MONOLITH, dev.lowpix.winterworks.endboss.Monolith.createAttributes());
        FabricDefaultAttributeRegistry.register(DRAGONLING, dev.lowpix.winterworks.endgear.Dragonling.createAttributes());
    }
}
