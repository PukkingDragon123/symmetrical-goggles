package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

/** Tides & Treasures entities (docs/OCEAN_UPDATE.md). Spawn rules belong to the owning feature. */
public final class OceanEntities {
    public static final EntityType<dev.lowpix.winterworks.oceanmob.Anglerfish> ANGLERFISH = reg("anglerfish",
            EntityType.Builder.of(dev.lowpix.winterworks.oceanmob.Anglerfish::new, MobCategory.WATER_CREATURE).sized(0.9f, 0.6f)
                    .clientTrackingRange(10));
    public static final EntityType<dev.lowpix.winterworks.oceanmob.Lionfish> LIONFISH = reg("lionfish",
            EntityType.Builder.of(dev.lowpix.winterworks.oceanmob.Lionfish::new, MobCategory.WATER_AMBIENT).sized(0.6f, 0.5f)
                    .clientTrackingRange(6));
    public static final EntityType<dev.lowpix.winterworks.oceanmob.Nautilus> NAUTILUS = reg("nautilus",
            EntityType.Builder.of(dev.lowpix.winterworks.oceanmob.Nautilus::new, MobCategory.WATER_CREATURE).sized(1.4f, 1.2f)
                    .clientTrackingRange(10));
    public static final EntityType<dev.lowpix.winterworks.whale.Whale> WHALE = reg("whale",
            EntityType.Builder.of(dev.lowpix.winterworks.whale.Whale::new, MobCategory.WATER_CREATURE).sized(9f, 6f)
                    .clientTrackingRange(16).updateInterval(1));
    public static final EntityType<dev.lowpix.winterworks.oceangear.LionfishDart> LIONFISH_DART = reg("lionfish_dart",
            EntityType.Builder.<dev.lowpix.winterworks.oceangear.LionfishDart>of(dev.lowpix.winterworks.oceangear.LionfishDart::new,
                    MobCategory.MISC).sized(0.25f, 0.25f).clientTrackingRange(4).updateInterval(20));
    public static final EntityType<dev.lowpix.winterworks.whale.Cannonball> CANNONBALL = reg("cannonball",
            EntityType.Builder.<dev.lowpix.winterworks.whale.Cannonball>of(dev.lowpix.winterworks.whale.Cannonball::new,
                    MobCategory.MISC).sized(0.4f, 0.4f).clientTrackingRange(8).updateInterval(2));
    public static final EntityType<dev.lowpix.winterworks.oceangear.ElderBubble> ELDER_BUBBLE = reg("elder_bubble",
            EntityType.Builder.<dev.lowpix.winterworks.oceangear.ElderBubble>of(dev.lowpix.winterworks.oceangear.ElderBubble::new,
                    MobCategory.MISC).sized(0.8f, 0.8f).clientTrackingRange(8).updateInterval(2));

    private OceanEntities() {}

    private static <T extends Entity> EntityType<T> reg(String name, EntityType.Builder<T> b) {
        return Registry.register(BuiltInRegistries.ENTITY_TYPE, Winterworks.id(name), b.build(Winterworks.id(name).toString()));
    }

    public static void init() {
        FabricDefaultAttributeRegistry.register(ANGLERFISH, dev.lowpix.winterworks.oceanmob.Anglerfish.createAttributes());
        FabricDefaultAttributeRegistry.register(LIONFISH, dev.lowpix.winterworks.oceanmob.Lionfish.createAttributes());
        FabricDefaultAttributeRegistry.register(NAUTILUS, dev.lowpix.winterworks.oceanmob.Nautilus.createAttributes());
        FabricDefaultAttributeRegistry.register(WHALE, dev.lowpix.winterworks.whale.Whale.createAttributes());
    }
}
