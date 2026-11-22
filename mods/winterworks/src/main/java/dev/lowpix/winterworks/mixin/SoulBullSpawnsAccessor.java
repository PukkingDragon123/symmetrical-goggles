package dev.lowpix.winterworks.mixin;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.random.WeightedRandomList;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.level.NaturalSpawner;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.chunk.ChunkGenerator;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/** For the GameTests: the natural spawner's own list of what may spawn at a spot (test.SoulBullTests). */
@Mixin(NaturalSpawner.class)
public interface SoulBullSpawnsAccessor {
    @Invoker("mobsAt")
    static WeightedRandomList<MobSpawnSettings.SpawnerData> ww$mobsAt(ServerLevel level, StructureManager structures, ChunkGenerator generator,
                                                                      MobCategory category, BlockPos pos, @Nullable Holder<Biome> biome) {
        throw new AssertionError();
    }
}
