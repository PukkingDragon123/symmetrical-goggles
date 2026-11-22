package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.HashMap;
import java.util.Map;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.registry.FabricBrewingRecipeRegistryBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.levelgen.Heightmap;
import org.jetbrains.annotations.Nullable;

/**
 * The Living End's creatures (docs/END_UPDATE.md sections 2, 4, 6-9): spawn rules, the Potion of Recall, the End Blooms
 * following the eclipse, and the Endlings' void rescue. Biome spawn entries are the world area's (its biome files).
 */
public final class EndMobFeature {
    /** Plants an Endling can wear on its head (flowers, saplings, mushrooms, ferns, grass, End plants). */
    public static final TagKey<Item> ENDLING_HEAD_PLANTS = TagKey.create(Registries.ITEM, Winterworks.id("endling_head_plants"));
    /** Blocks an Obolisk's slam never breaks (besides anything with hardness 50 or more). */
    public static final TagKey<Block> OBOLISK_UNBREAKABLE = TagKey.create(Registries.BLOCK, Winterworks.id("obolisk_unbreakable"));

    /** Below the world's floor by this much, a tamed Endling within {@link #RESCUE_RANGE} saves you. */
    public static final int VOID_DEPTH = 10;
    public static final double RESCUE_RANGE = 128.0;

    private static final Map<ResourceKey<Level>, Boolean> ECLIPSE_SEEN = new HashMap<>();

    private EndMobFeature() {}

    public static void init() {
        SpawnPlacements.register(EndEntities.ENDERFLY, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Monster::checkMonsterSpawnRules);
        SpawnPlacements.register(EndEntities.ENDLING, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Endling::checkEndlingSpawnRules);
        SpawnPlacements.register(EndEntities.GUCKER, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Monster::checkMonsterSpawnRules);
        SpawnPlacements.register(EndEntities.OBOLISK, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
                Monster::checkMonsterSpawnRules);
        FabricBrewingRecipeRegistryBuilder.BUILD.register(b -> b.addMix(Potions.AWKWARD, EndItems.ENDERFLY_WING, EndEffects.RECALL_POTION));
        ServerTickEvents.END_WORLD_TICK.register(EndMobFeature::worldTick);
    }

    private static void worldTick(ServerLevel level) {
        voidRescue(level);
        if (level.getGameTime() % 20 == 0) {
            boolean eclipse = Eclipse.isActive(level);
            Boolean before = ECLIPSE_SEEN.put(level.dimension(), eclipse);
            if (before != null && before != eclipse) {
                updateBlooms(level, eclipse, 5);   // the eclipse came or went: every bloom round every player follows it
            } else if (level.getGameTime() % 200 == 0) {
                updateBlooms(level, eclipse, 3);   // and now and then, blooms players walked up to since
            }
        }
    }

    // ----------------------------------------------------------------------------------------- End Blooms

    /** Schedules a tick (spread over 3 s, so they open one by one) for every bloom near a player that is out of step. */
    static void updateBlooms(ServerLevel level, boolean eclipse, int chunkRadius) {
        Block bloom = EndBlocks.END_BLOOM;
        RandomSource r = level.random;
        for (ServerPlayer p : level.players()) {
            SectionPos at = SectionPos.of(p.blockPosition());
            for (int cx = at.x() - chunkRadius; cx <= at.x() + chunkRadius; cx++) {
                for (int cz = at.z() - chunkRadius; cz <= at.z() + chunkRadius; cz++) {
                    LevelChunk chunk = level.getChunkSource().getChunkNow(cx, cz);
                    if (chunk == null) {
                        continue;
                    }
                    LevelChunkSection[] sections = chunk.getSections();
                    for (int i = 0; i < sections.length; i++) {
                        LevelChunkSection s = sections[i];
                        if (s.hasOnlyAir() || !s.maybeHas(st -> st.is(bloom) && st.getValue(EndBloomBlock.OPEN) != eclipse)) {
                            continue;
                        }
                        int baseY = SectionPos.sectionToBlockCoord(chunk.getSectionYFromSectionIndex(i));
                        for (int y = 0; y < 16; y++) {
                            for (int z = 0; z < 16; z++) {
                                for (int x = 0; x < 16; x++) {
                                    BlockState st = s.getBlockState(x, y, z);
                                    if (st.is(bloom) && st.getValue(EndBloomBlock.OPEN) != eclipse) {
                                        BlockPos pos = new BlockPos((cx << 4) + x, baseY + y, (cz << 4) + z);
                                        if (!level.getBlockTicks().hasScheduledTick(pos, bloom)) {
                                            level.scheduleTick(pos, bloom, 1 + r.nextInt(60));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /** The nearest open End Bloom within `radius` blocks of `center` (loaded chunks only), or null. */
    @Nullable
    public static BlockPos findOpenBloom(ServerLevel level, BlockPos center, int radius) {
        Block bloom = EndBlocks.END_BLOOM;
        BlockPos best = null;
        double bestD = (double) radius * radius;
        int r = Math.floorDiv(radius, 16) + 1;
        SectionPos at = SectionPos.of(center);
        for (int cx = at.x() - r; cx <= at.x() + r; cx++) {
            for (int cz = at.z() - r; cz <= at.z() + r; cz++) {
                LevelChunk chunk = level.getChunkSource().getChunkNow(cx, cz);
                if (chunk == null) {
                    continue;
                }
                LevelChunkSection[] sections = chunk.getSections();
                for (int i = 0; i < sections.length; i++) {
                    LevelChunkSection s = sections[i];
                    int baseY = SectionPos.sectionToBlockCoord(chunk.getSectionYFromSectionIndex(i));
                    if (baseY + 16 < center.getY() - radius || baseY > center.getY() + radius || s.hasOnlyAir()
                            || !s.maybeHas(st -> st.is(bloom) && st.getValue(EndBloomBlock.OPEN))) {
                        continue;
                    }
                    for (int y = 0; y < 16; y++) {
                        for (int z = 0; z < 16; z++) {
                            for (int x = 0; x < 16; x++) {
                                BlockState st = s.getBlockState(x, y, z);
                                if (st.is(bloom) && st.getValue(EndBloomBlock.OPEN)) {
                                    BlockPos pos = new BlockPos((cx << 4) + x, baseY + y, (cz << 4) + z);
                                    double d = pos.distSqr(center);
                                    if (d < bestD) {
                                        bestD = d;
                                        best = pos;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return best;
    }

    // ----------------------------------------------------------------------------------------- void rescue

    /** A player who fell below the floor - 10 is saved by the nearest tamed Endling of theirs within 128 blocks. */
    private static void voidRescue(ServerLevel level) {
        double floor = level.getMinBuildHeight() - VOID_DEPTH;
        for (ServerPlayer p : level.players()) {
            if (p.getY() >= floor || !p.isAlive() || p.isSpectator()) {
                continue;
            }
            Endling best = null;
            double bestD = RESCUE_RANGE * RESCUE_RANGE;
            for (Endling e : level.getEntitiesOfClass(Endling.class, p.getBoundingBox().inflate(RESCUE_RANGE),
                    e -> e.isAlive() && e.isTame() && e.isOwnedBy(p) && !e.isSacrificing())) {
                double d = e.distanceToSqr(p);
                if (d <= bestD) {
                    bestD = d;
                    best = e;
                }
            }
            if (best != null) {
                best.sacrifice(p);
            }
        }
    }

    /** Survival or adventure, not a spectator: who an Obolisk notices and what Guckers and Endlings react to. */
    public static boolean isSurvivalLike(Player p) {
        return p.isAlive() && !p.isSpectator() && !p.getAbilities().instabuild;
    }
}
