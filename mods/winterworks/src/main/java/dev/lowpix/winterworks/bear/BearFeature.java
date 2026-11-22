package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.world.WWWorldgen;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.animal.PolarBear;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.functions.EnchantedCountIncreaseFunction;
import net.minecraft.world.level.storage.loot.functions.SetItemCountFunction;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;
import net.minecraft.world.level.storage.loot.providers.number.UniformGenerator;
import org.jetbrains.annotations.Nullable;

/**
 * Polar bears remade, zombie polar bears, frost zombies and polar bear jockeys (docs/COLD_UPDATE.md sections 3-4).
 * The bear itself is mixin.PolarBearMixin; this wires up spawns, spawn rules and loot.
 */
public final class BearFeature {
    /** Frost Zombies and Strays spawning naturally in the cold ride a polar bear this often. */
    public static final float JOCKEY_CHANCE = 0.12f;
    /** GameTests: every eligible rider gets a bear, wherever and however it spawns. */
    public static boolean forceJockeys;

    private BearFeature() {}

    public static void init() {
        // they spawn more: extra spawn entries in the snowy biomes (spawn rules: mixin.PolarBearMixin#ww$coldGround)
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.SNOWY_PLAINS, Biomes.ICE_SPIKES, Biomes.SNOWY_TAIGA,
                Biomes.SNOWY_SLOPES, Biomes.FROZEN_PEAKS, Biomes.FROZEN_RIVER, Biomes.SNOWY_BEACH), MobCategory.CREATURE,
                EntityType.POLAR_BEAR, 3, 1, 2);
        // the Ice Caves biome lists the undead in its spawners (data/winterworks/worldgen/biome/ice_caves.json)
        SpawnPlacements.register(WWEntities.FROST_ZOMBIE, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Monster::checkMonsterSpawnRules);
        SpawnPlacements.register(WWEntities.ZOMBIE_POLAR_BEAR, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                ZombiePolarBear::checkZombieBearSpawnRules);
        // death: 0-2 polar bear fur, +1 per looting level, on top of the vanilla fish
        LootTableEvents.MODIFY.register((key, table, source, registries) -> {
            if (source.isBuiltin() && key.equals(EntityType.POLAR_BEAR.getDefaultLootTable())) {
                table.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(LootItem.lootTableItem(WWItems.POLAR_BEAR_FUR)
                        .apply(SetItemCountFunction.setCount(UniformGenerator.between(0, 2)))
                        .apply(EnchantedCountIncreaseFunction.lootingMultiplier(registries, ConstantValue.exactly(1)))));
            }
        });
    }

    /** Fish a polar bear carries in its mouth; the synced carry id is the index + 1 (0: nothing). */
    private static final Item[] CARRIED_FISH = {Items.SALMON, Items.COD};
    private static ItemStack[] carriedStacks;

    public static int carryId(@Nullable Item fish) {
        for (int i = 0; i < CARRIED_FISH.length; i++) {
            if (CARRIED_FISH[i] == fish) {
                return i + 1;
            }
        }
        return 0;
    }

    /** The stack for a carry id (shared: don't modify it). */
    public static ItemStack carriedStack(int id) {
        if (carriedStacks == null) {
            ItemStack[] stacks = new ItemStack[CARRIED_FISH.length + 1];
            stacks[0] = ItemStack.EMPTY;
            for (int i = 0; i < CARRIED_FISH.length; i++) {
                stacks[i + 1] = new ItemStack(CARRIED_FISH[i]);
            }
            carriedStacks = stacks;
        }
        return id > 0 && id < carriedStacks.length ? carriedStacks[id] : ItemStack.EMPTY;
    }

    public static boolean isSalmon(ItemStack stack) {
        return stack.is(Items.SALMON) || stack.is(Items.COOKED_SALMON);
    }

    public static boolean holdsSalmon(Player player) {
        return player.isHolding(BearFeature::isSalmon);
    }

    /** The Ice Caves, or anywhere snow falls. */
    public static boolean isColdPlace(LevelReader level, BlockPos pos) {
        Holder<Biome> biome = level.getBiome(pos);
        return biome.is(WWWorldgen.ICE_CAVES) || biome.value().coldEnoughToSnow(pos);
    }

    /**
     * Called as a Frost Zombie or a Stray finishes spawning: 12% of those spawning naturally in the cold get a polar bear
     * to ride (always, with {@link #forceJockeys}). The bear does the walking and fights too; see PolarBearMixin.
     */
    public static void maybeJockey(Mob rider, ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason) {
        if (rider.isPassenger() || rider.isBaby()) {
            return;
        }
        if (!forceJockeys && ((reason != MobSpawnType.NATURAL && reason != MobSpawnType.CHUNK_GENERATION)
                || level.getRandom().nextFloat() >= JOCKEY_CHANCE || !isColdPlace(level, rider.blockPosition()))) {
            return;
        }
        spawnMount(rider, level, difficulty);
    }

    /** Puts `rider` on a new adult polar bear (if there is room for the pair). Returns the bear, or null. */
    @Nullable
    public static PolarBear spawnMount(Mob rider, ServerLevelAccessor level, DifficultyInstance difficulty) {
        PolarBear bear = EntityType.POLAR_BEAR.create(level.getLevel());
        if (bear == null) {
            return null;
        }
        bear.moveTo(rider.getX(), rider.getY(), rider.getZ(), rider.getYRot(), 0.0f);
        // room for a 1.4-block bear with the rider sitting on it?
        if (!level.noCollision(bear, bear.getBoundingBox())
                || !level.noCollision(rider, rider.getBoundingBox().move(0, bear.getBbHeight() * 0.6, 0))) {
            return null;
        }
        bear.finalizeSpawn(level, difficulty, MobSpawnType.JOCKEY, null);
        bear.setAge(0);
        ((RemadePolarBear) bear).ww$setJockeyMount(true);
        if (!rider.startRiding(bear, true)) {
            return null;
        }
        level.addFreshEntity(bear);
        Winterworks.LOG.debug("{} spawned riding a polar bear at {}", rider.getType().toShortString(), rider.blockPosition());
        return bear;
    }
}
