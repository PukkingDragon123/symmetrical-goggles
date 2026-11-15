package dev.lowpix.winterworks.boss;

import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.WorldGenLevel;

/** Builds a frozen tomb (docs/COLD_UPDATE.md section 5/7): called by world.FrozenTombStructure during world generation. */
public final class FrozenTomb {
    private FrozenTomb() {}

    /** Carve the chamber around `centre`, raise the ancient-ice block with spikes and freeze a dormant Frost Mauler inside. */
    public static void build(WorldGenLevel level, BlockPos centre, RandomSource random) {}
}
