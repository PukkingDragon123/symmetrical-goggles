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
            EntityType.Builder.of(IcebreakerEntity::new, MobCategory.CREATURE).sized(2.5f, 2.1f).eyeHeight(1.8f)
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


    // ---- Cold Zone update (docs/COLD_UPDATE.md)
    public static final EntityType<dev.lowpix.winterworks.boss.FrostMaulerEntity> FROST_MAULER = reg("frost_mauler",
            EntityType.Builder.of(dev.lowpix.winterworks.boss.FrostMaulerEntity::new, MobCategory.MONSTER).sized(2.4f, 2.6f)
                    .eyeHeight(2.1f).immuneTo(net.minecraft.world.level.block.Blocks.POWDER_SNOW).clientTrackingRange(10));
    public static final EntityType<dev.lowpix.winterworks.bear.FrostZombie> FROST_ZOMBIE = reg("frost_zombie",
            EntityType.Builder.<dev.lowpix.winterworks.bear.FrostZombie>of(dev.lowpix.winterworks.bear.FrostZombie::new,
                            MobCategory.MONSTER).sized(0.6f, 1.95f).eyeHeight(1.74f).passengerAttachments(2.0125f)
                    .ridingOffset(-0.7f).immuneTo(net.minecraft.world.level.block.Blocks.POWDER_SNOW).clientTrackingRange(8));
    public static final EntityType<dev.lowpix.winterworks.bear.ZombiePolarBear> ZOMBIE_POLAR_BEAR = reg("zombie_polar_bear",
            EntityType.Builder.of(dev.lowpix.winterworks.bear.ZombiePolarBear::new, MobCategory.MONSTER).sized(1.4f, 1.4f)
                    .immuneTo(net.minecraft.world.level.block.Blocks.POWDER_SNOW).clientTrackingRange(10));
    public static final EntityType<dev.lowpix.winterworks.boss.FallingIcicleEntity> FALLING_ICICLE = reg("falling_icicle",
            EntityType.Builder.<dev.lowpix.winterworks.boss.FallingIcicleEntity>of(dev.lowpix.winterworks.boss.FallingIcicleEntity::new,
                    MobCategory.MISC).sized(0.5f, 0.9f).clientTrackingRange(8).updateInterval(2));
    // ---- Amber Age update (docs/AMBER_UPDATE.md)
    public static final EntityType<dev.lowpix.winterworks.amber.MosquitoEntity> MOSQUITO = reg("mosquito",
            EntityType.Builder.of(dev.lowpix.winterworks.amber.MosquitoEntity::new, MobCategory.MONSTER).sized(0.5f, 0.4f)
                    .clientTrackingRange(8));
    public static final EntityType<dev.lowpix.winterworks.golem.PotGolemEntity> POT_GOLEM = reg("pot_golem",
            EntityType.Builder.of(dev.lowpix.winterworks.golem.PotGolemEntity::new, MobCategory.MISC).sized(1.4f, 2.7f)
                    .clientTrackingRange(10));

    private WWEntities() {}

    private static <T extends net.minecraft.world.entity.Entity> EntityType<T> reg(String name, EntityType.Builder<T> b) {
        return Registry.register(BuiltInRegistries.ENTITY_TYPE, Winterworks.id(name), b.build(Winterworks.id(name).toString()));
    }

    public static void init() {
        FabricDefaultAttributeRegistry.register(ICEBREAKER, IcebreakerEntity.createAttributes());
        FabricDefaultAttributeRegistry.register(FROST_MAULER, dev.lowpix.winterworks.boss.FrostMaulerEntity.createAttributes());
        FabricDefaultAttributeRegistry.register(FROST_ZOMBIE, dev.lowpix.winterworks.bear.FrostZombie.createAttributes());
        FabricDefaultAttributeRegistry.register(MOSQUITO, dev.lowpix.winterworks.amber.MosquitoEntity.createAttributes());
        FabricDefaultAttributeRegistry.register(POT_GOLEM, dev.lowpix.winterworks.golem.PotGolemEntity.createAttributes());
        FabricDefaultAttributeRegistry.register(ZOMBIE_POLAR_BEAR, dev.lowpix.winterworks.bear.ZombiePolarBear.createAttributes());
        SpawnPlacements.register(ICEBREAKER, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                IcebreakerEntity::checkIcebreakerSpawnRules);
        // frozen lakes, rivers and coasts
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.FROZEN_RIVER, Biomes.SNOWY_PLAINS, Biomes.ICE_SPIKES,
                        Biomes.SNOWY_BEACH, Biomes.FROZEN_OCEAN, Biomes.DEEP_FROZEN_OCEAN, Biomes.SNOWY_TAIGA),
                MobCategory.CREATURE, ICEBREAKER, 5, 1, 3);
    }
}
