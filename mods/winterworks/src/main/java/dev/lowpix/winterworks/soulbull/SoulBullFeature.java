package dev.lowpix.winterworks.soulbull;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.util.random.WeightedRandomList;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import org.jetbrains.annotations.Nullable;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.predicates.LootItemRandomChanceCondition;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;

/**
 * The Soul Bull (docs/FIXES_0_4.md "The Soul Bull"): attributes, spawning, the Wither Skeleton's Wither Bone (25%), and
 * the creative tab entries (the bone itself is listed in WWItems' tab). Registered in WWEntities/WWBlocks/WWItems/WWSounds
 * under "0.4 fixes: Soul Bull".
 * <ul>
 * <li>Soul Sand Valleys: unarmoured wild bulls in herds of 1-3 (a biome spawn); Wither Skeletons ride these.</li>
 * <li>With piglins: armoured bulls spawn in and around the structures tagged {@link #PIGLIN_LANDS} (bastion remnants and
 * Hex Fortresses), added to the monster spawns there (mixin.SoulBullNaturalSpawnerMixin), sometimes with a piglin or brute
 * riding. Structures can place them in pens with {@link SoulBull#createPenBull}.</li>
 * </ul>
 */
public final class SoulBullFeature {
    /** Weight among the Soul Sand Valley's monsters (skeletons 20, ghasts 50, endermen 1). */
    public static final int SPAWN_WEIGHT = 12;
    /** Structures whose piglins keep armoured Soul Bulls about (data/winterworks/tags/worldgen/structure). */
    public static final TagKey<Structure> PIGLIN_LANDS = TagKey.create(Registries.STRUCTURE, Winterworks.id("soul_bull_piglin_lands"));
    /** How far round such a structure's bounds the armoured bulls roam. */
    public static final int PIGLIN_LANDS_MARGIN = 8;
    /** The monster spawn added in piglin lands (one instance: the spawner checks the list contains this very entry). */
    public static final MobSpawnSettings.SpawnerData PIGLIN_LANDS_SPAWN = new MobSpawnSettings.SpawnerData(WWEntities.SOUL_BULL, 10, 1, 2);
    /** A Wither Skeleton's chance to drop a Wither Bone. */
    public static final float WITHER_BONE_CHANCE = 0.25f;

    private SoulBullFeature() {}

    /** In or around a bastion remnant or Hex Fortress (anything tagged {@link #PIGLIN_LANDS}). */
    public static boolean inPiglinLands(ServerLevel level, BlockPos pos) {
        StructureManager structures = level.structureManager();
        if (!structures.hasAnyStructureAt(pos)) {
            return false;
        }
        Registry<Structure> reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
        for (StructureStart start : structures.startsForStructure(new ChunkPos(pos),
                s -> reg.getHolder(reg.getId(s)).map(h -> h.is(PIGLIN_LANDS)).orElse(false))) {
            if (start.isValid() && start.getBoundingBox().inflatedBy(PIGLIN_LANDS_MARGIN).isInside(pos)) {
                return true;
            }
        }
        return false;
    }

    /** The monster spawns at `pos` with the armoured bulls added in piglin lands (null: unchanged). */
    @Nullable
    public static WeightedRandomList<MobSpawnSettings.SpawnerData> withPiglinBulls(ServerLevel level, BlockPos pos,
                                                                                  WeightedRandomList<MobSpawnSettings.SpawnerData> spawns) {
        if (spawns.unwrap().contains(PIGLIN_LANDS_SPAWN) || !inPiglinLands(level, pos)) {
            return null;
        }
        List<MobSpawnSettings.SpawnerData> list = new ArrayList<>(spawns.unwrap());
        list.add(PIGLIN_LANDS_SPAWN);
        return WeightedRandomList.create(list);
    }

    public static void init() {
        FabricDefaultAttributeRegistry.register(WWEntities.SOUL_BULL, SoulBull.createAttributes());
        SpawnPlacements.register(WWEntities.SOUL_BULL, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                SoulBull::checkSoulBullSpawnRules);
        BiomeModifications.addSpawn(BiomeSelectors.includeByKey(Biomes.SOUL_SAND_VALLEY), MobCategory.MONSTER, WWEntities.SOUL_BULL,
                SPAWN_WEIGHT, 1, 3);
        LootTableEvents.MODIFY.register((key, table, source, registries) -> {
            if (source.isBuiltin() && key.equals(EntityType.WITHER_SKELETON.getDefaultLootTable())) {
                table.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(LootItem.lootTableItem(WWItems.WITHER_BONE))
                        .when(LootItemRandomChanceCondition.randomChance(WITHER_BONE_CHANCE)));
            }
        });
        ResourceKey<CreativeModeTab> tab = ResourceKey.create(Registries.CREATIVE_MODE_TAB, Winterworks.id("main"));
        ItemGroupEvents.modifyEntriesEvent(tab).register(entries -> {
            for (Item i : new Item[]{WWItems.SOUL_BULL_SKULL, WWItems.SOUL_BULL_SPAWN_EGG}) {
                if (entries.getDisplayStacks().stream().noneMatch(s -> s.is(i))) {
                    entries.accept(i);
                }
            }
        });
    }
}
