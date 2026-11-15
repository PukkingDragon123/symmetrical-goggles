package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.CartKind;
import dev.lowpix.winterworks.express.WWCart;
import dev.lowpix.winterworks.express.LocomotiveCart;
import dev.lowpix.winterworks.icebreaker.IcebreakerEntity;
import dev.lowpix.winterworks.launcher.CobbleBallEntity;
import dev.lowpix.winterworks.launcher.IceShotEntity;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.levelgen.Heightmap;

public final class WWEntities {
    public static final EntityType<IcebreakerEntity> ICEBREAKER = reg("icebreaker",
            EntityType.Builder.of(IcebreakerEntity::new, MobCategory.CREATURE).sized(1.8f, 1.6f).eyeHeight(1.35f)
                    .clientTrackingRange(10));
    public static final EntityType<IceShotEntity> ICE_SHOT = reg("ice_shot",
            EntityType.Builder.<IceShotEntity>of(IceShotEntity::new, MobCategory.MISC).sized(0.25f, 0.25f)
                    .clientTrackingRange(4).updateInterval(10));
    public static final EntityType<CobbleBallEntity> COBBLE_BALL = reg("cobble_ball",
            EntityType.Builder.<CobbleBallEntity>of(CobbleBallEntity::new, MobCategory.MISC).sized(0.4f, 0.4f)
                    .clientTrackingRange(6).updateInterval(5));
    public static final EntityType<LocomotiveCart> LOCOMOTIVE = reg("locomotive",
            EntityType.Builder.<LocomotiveCart>of((t, l) -> new LocomotiveCart(t, l, CartKind.LOCOMOTIVE), MobCategory.MISC)
                    .sized(0.98f, 0.7f).clientTrackingRange(8));
    public static final EntityType<LocomotiveCart> DRAGON_LOCOMOTIVE = reg("dragon_locomotive",
            EntityType.Builder.<LocomotiveCart>of((t, l) -> new LocomotiveCart(t, l, CartKind.DRAGON_LOCOMOTIVE), MobCategory.MISC)
                    .sized(0.98f, 0.7f).clientTrackingRange(8));
    public static final EntityType<WWCart> FOX_CART = reg("fox_cart",
            EntityType.Builder.<WWCart>of((t, l) -> new WWCart(t, l, CartKind.FOX_CART), MobCategory.MISC)
                    .sized(0.98f, 0.7f).clientTrackingRange(8));
    public static final EntityType<WWCart> ZOMBIE_CART = reg("zombie_cart",
            EntityType.Builder.<WWCart>of((t, l) -> new WWCart(t, l, CartKind.ZOMBIE_CART), MobCategory.MISC)
                    .sized(0.98f, 0.7f).clientTrackingRange(8));
    public static final EntityType<WWCart> TRAILER_CART = reg("trailer_cart",
            EntityType.Builder.<WWCart>of((t, l) -> new WWCart(t, l, CartKind.TRAILER_CART), MobCategory.MISC)
                    .sized(0.98f, 0.7f).clientTrackingRange(8));

    private WWEntities() {}

    private static <T extends net.minecraft.world.entity.Entity> EntityType<T> reg(String name, EntityType.Builder<T> b) {
        return Registry.register(BuiltInRegistries.ENTITY_TYPE, Winterworks.id(name), b.build(Winterworks.id(name).toString()));
    }

    public static void init() {
        FabricDefaultAttributeRegistry.register(ICEBREAKER, IcebreakerEntity.createAttributes());
        SpawnPlacements.register(ICEBREAKER, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                IcebreakerEntity::checkIcebreakerSpawnRules);
        // frozen lakes, rivers and coasts
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.FROZEN_RIVER, Biomes.SNOWY_PLAINS, Biomes.ICE_SPIKES,
                        Biomes.SNOWY_BEACH, Biomes.FROZEN_OCEAN, Biomes.DEEP_FROZEN_OCEAN, Biomes.SNOWY_TAIGA),
                MobCategory.CREATURE, ICEBREAKER, 5, 1, 3);
    }
}
