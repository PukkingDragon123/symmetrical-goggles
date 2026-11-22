package dev.lowpix.winterworks.ocean;

import static dev.lowpix.winterworks.ocean.OceanGen.WATER;

import dev.lowpix.winterworks.registry.OceanBlocks;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.QuartPos;
import net.minecraft.core.SectionPos;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.FluidState;

/**
 * Carves a box of columns to the shape OceanDepths gives it (docs/OCEAN_UPDATE.md section 1): everything carved
 * becomes still water; formations stand in rock; the new floor gets the zone's sediment (gravel and clay, sand in warm
 * water, tuff and deepslate in the abyss, basalt, ash sand and magma in the volcanic depths); cliff faces get strata;
 * air pockets, lava and flowing fluids touching the new water are sealed in rock, and loose blocks over it are set
 * (sand to sandstone), so nothing leaks, falls or flows. Writes only the columns it is given; reads the area's border
 * columns from the shape, never from the world, so neighbouring chunks agree.
 */
public final class DepthCarver {
    /** Reads and writes blocks: a proto-chunk's sections in world generation, the level in tests and commands. */
    public interface Sink {
        BlockState get(int x, int y, int z);

        void set(int x, int y, int z, BlockState s);

        /** After a column: the highest y it changed (for the heightmaps). */
        default void columnDone(int x, int z, int topChanged) {}
    }

    private static final int SPAN = OceanDepths.TOP - OceanDepths.BOTTOM + 1;

    private DepthCarver() {}

    /**
     * Carves columns [x0, x1] x [z0, z1] of `a`, which must hold a one-column border round them. Returns how many
     * blocks changed.
     */
    public static int carve(OceanDepths.Area a, int x0, int z0, int x1, int z1, Sink sink) {
        if (!a.any()) {
            return 0;
        }
        // which cells of every area column are carved, and the lowest
        long[][] bits = new long[a.w * a.d][];
        int[] low = new int[a.w * a.d];
        for (int i = 0; i < a.w; i++) {
            for (int j = 0; j < a.d; j++) {
                int x = a.x0 + i, z = a.z0 + j;
                OceanDepths.Col col = a.col(x, z);
                low[i * a.d + j] = Integer.MAX_VALUE;
                if (!col.any()) {
                    continue;
                }
                long[] b = new long[(SPAN + 63) >> 6];
                for (int y = OceanDepths.TOP; y >= OceanDepths.BOTTOM; y--) {
                    if (a.carved(x, y, z)) {
                        int k = y - OceanDepths.BOTTOM;
                        b[k >> 6] |= 1L << (k & 63);
                        low[i * a.d + j] = y;
                    }
                }
                bits[i * a.d + j] = b;
            }
        }
        int changed = 0;
        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                changed += column(a, bits, low, x, z, sink);
            }
        }
        return changed;
    }

    private static boolean cut(OceanDepths.Area a, long[][] bits, int x, int y, int z) {
        if (y < OceanDepths.BOTTOM || y > OceanDepths.TOP || !a.inside(x, z)) {
            return false;
        }
        long[] b = bits[(x - a.x0) * a.d + (z - a.z0)];
        int k = y - OceanDepths.BOTTOM;
        return b != null && (b[k >> 6] & 1L << (k & 63)) != 0;
    }

    private static boolean nextToCut(OceanDepths.Area a, long[][] bits, int x, int y, int z) {
        return cut(a, bits, x, y + 1, z) || cut(a, bits, x, y - 1, z) || sideCut(a, bits, x, y, z);
    }

    private static boolean sideCut(OceanDepths.Area a, long[][] bits, int x, int y, int z) {
        return cut(a, bits, x + 1, y, z) || cut(a, bits, x - 1, y, z) || cut(a, bits, x, y, z + 1) || cut(a, bits, x, y, z - 1);
    }

    private static int column(OceanDepths.Area a, long[][] bits, int[] low, int x, int z, Sink sink) {
        int idx = (x - a.x0) * a.d + (z - a.z0);
        OceanDepths.Col col = a.col(x, z);
        boolean forms = a.form[idx] != null;
        int lowest = low[idx];
        for (Direction dir : Direction.Plane.HORIZONTAL) {
            int nx = x + dir.getStepX(), nz = z + dir.getStepZ();
            if (a.inside(nx, nz)) {
                lowest = Math.min(lowest, low[(nx - a.x0) * a.d + (nz - a.z0)]);
            }
        }
        if (lowest == Integer.MAX_VALUE && !forms) {
            return 0;
        }
        int bottom = forms ? OceanDepths.BOTTOM - 1 : Math.max(OceanDepths.BOTTOM - 1, lowest - 1);
        int changed = 0, top = Integer.MIN_VALUE;
        boolean removedAbove = false;   // the cell above was solid rock, now carved: this one is new floor
        int dress = 0;                  // sediment layers still to lay going down
        BlockState sub = null;
        for (int y = OceanDepths.TOP + 1; y >= bottom; y--) {
            boolean cv = cut(a, bits, x, y, z);
            BlockState s = sink.get(x, y, z);
            if (cv) {
                dress = 0;
                FluidState fs = s.getFluidState();
                boolean still = s.is(Blocks.WATER) && fs.isSource();
                removedAbove = !still && !s.isAir() && fs.isEmpty();
                if (!still && !s.hasBlockEntity()) {
                    sink.set(x, y, z, WATER);
                    changed++;
                    top = Math.max(top, y);
                }
                continue;
            }
            boolean wasRemoved = removedAbove;
            removedAbove = false;
            if (forms && a.formation(x, y, z)) {
                dress = 0;
                if ((y > col.floor || s.isAir() || !s.getFluidState().isEmpty() || OceanGen.natural(s)) && !s.hasBlockEntity()) {
                    BlockState r = a.rock(col.zone, x, y, z);
                    if (r != s) {
                        sink.set(x, y, z, r);
                        changed++;
                        top = Math.max(top, y);
                    }
                }
                continue;
            }
            if (s.hasBlockEntity()) {
                dress = 0;
                continue;
            }
            FluidState fs = s.getFluidState();
            boolean leaky = s.isAir() || fs.is(FluidTags.LAVA) || !fs.isEmpty() && !fs.isSource() || s.is(Blocks.BUBBLE_COLUMN);
            if (leaky) {
                dress = 0;
                if (nextToCut(a, bits, x, y, z)) {   // an air pocket or lava touching the new water: seal it
                    sink.set(x, y, z, seal(a, col, x, y, z));
                    changed++;
                    top = Math.max(top, y);
                }
                continue;
            }
            if (!fs.isEmpty()) {   // water in a cave: water meets water
                dress = 0;
                continue;
            }
            if (wasRemoved && OceanGen.natural(s)) {   // new floor: lay the zone's sediment
                BlockState[] p = palette(a, col.zone, x, y, z);
                if (p != null) {
                    BlockState t = p[0];
                    if (OceanGen.loose(t) && (cut(a, bits, x, y - 1, z) || cut(a, bits, x, y - 2, z))) {
                        t = p[1];
                    }
                    sink.set(x, y, z, t);
                    changed++;
                    top = Math.max(top, y);
                    sub = p[1];
                    dress = 1 + (OceanGen.rnd(a.seed, x, y, z, 31) < 0.5f ? 1 : 0);
                }
                continue;
            }
            if (dress > 0) {
                dress--;
                if (OceanGen.natural(s) && sub != null && !cut(a, bits, x, y - 1, z)) {
                    sink.set(x, y, z, sub);
                    changed++;
                }
                continue;
            }
            if (OceanGen.loose(s) && cut(a, bits, x, y - 1, z)) {   // over an overhang: set it so it doesn't fall
                sink.set(x, y, z, OceanGen.settled(s));
                changed++;
                top = Math.max(top, y);
                continue;
            }
            if (col.wall > 0.08 && s.is(BlockTags.BASE_STONE_OVERWORLD) && sideCut(a, bits, x, y, z)
                    && OceanGen.rnd(a.seed, x, y, z, 32) < col.wall * 1.5) {   // strata on cliff faces
                BlockState r = a.rock(col.zone, x, y, z);
                if (r != s) {
                    sink.set(x, y, z, r);
                    changed++;
                }
            }
        }
        if (top != Integer.MIN_VALUE) {
            sink.columnDone(x, z, top);
        }
        return changed;
    }

    private static BlockState seal(OceanDepths.Area a, OceanDepths.Col col, int x, int y, int z) {
        return switch (col.zone) {
            case VOLCANIC -> Blocks.BASALT.defaultBlockState();
            case ABYSSAL -> y < 8 ? Blocks.DEEPSLATE.defaultBlockState() : Blocks.TUFF.defaultBlockState();
            default -> y < 0 ? Blocks.DEEPSLATE.defaultBlockState() : Blocks.STONE.defaultBlockState();
        };
    }

    /** The new floor's top block and what goes under it, or null to leave the rock bare (outcrops). */
    static BlockState[] palette(OceanDepths.Area a, OceanDepths.Zone zone, int x, int y, int z) {
        double pa = a.noise(13, x, z, 1 / 24.0), pb = a.noise(14, x, z, 1 / 11.0);
        float r = OceanGen.rnd(a.seed, x, y, z, 33);
        BlockState gravel = Blocks.GRAVEL.defaultBlockState(), sand = Blocks.SAND.defaultBlockState(),
                sandstone = Blocks.SANDSTONE.defaultBlockState(), clay = Blocks.CLAY.defaultBlockState(),
                tuff = Blocks.TUFF.defaultBlockState(), stone = y < 0 ? Blocks.DEEPSLATE.defaultBlockState() : Blocks.STONE.defaultBlockState();
        return switch (zone) {
            case VOLCANIC -> {
                BlockState basalt = Blocks.BASALT.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y);
                if (pa > 0.42) {   // a magma field
                    yield r < 0.62 ? new BlockState[]{Blocks.MAGMA_BLOCK.defaultBlockState(), basalt}
                            : new BlockState[]{r < 0.85 ? basalt : Blocks.BLACKSTONE.defaultBlockState(), basalt};
                }
                if (pa < -0.35 || pb > 0.6) {   // drifts of ash sand
                    yield new BlockState[]{OceanBlocks.ASH_SAND.defaultBlockState(), OceanBlocks.ASHSTONE.defaultBlockState()};
                }
                if (pb < -0.45) {
                    yield new BlockState[]{Blocks.SMOOTH_BASALT.defaultBlockState(), basalt};
                }
                yield new BlockState[]{r < 0.08 ? Blocks.BLACKSTONE.defaultBlockState() : r < 0.13 ? Blocks.MAGMA_BLOCK.defaultBlockState() : basalt, basalt};
            }
            case ABYSSAL -> {
                if (pa > 0.5) {
                    yield new BlockState[]{clay, clay};
                }
                if (pb > 0.45) {
                    yield new BlockState[]{tuff, tuff};
                }
                if (pb < -0.5) {
                    yield new BlockState[]{Blocks.COBBLED_DEEPSLATE.defaultBlockState(), Blocks.DEEPSLATE.defaultBlockState()};
                }
                yield new BlockState[]{gravel, r < 0.5 ? gravel : tuff};
            }
            case WARM -> pa > 0.55 ? new BlockState[]{clay, sandstone} : new BlockState[]{sand, sandstone};
            case LUKEWARM -> pa > 0.5 ? new BlockState[]{clay, clay} : pb > 0.25 ? new BlockState[]{gravel, stone}
                    : new BlockState[]{sand, sandstone};
            default -> {
                if (pb > 0.58) {
                    yield null;   // bare rock outcrops
                }
                if (pa > 0.45) {
                    yield new BlockState[]{clay, clay};
                }
                if (pa < -0.5 && zone != OceanDepths.Zone.FROZEN) {
                    yield new BlockState[]{sand, sandstone};
                }
                yield new BlockState[]{gravel, r < 0.4 ? gravel : stone};
            }
        };
    }

    /**
     * Gives the carved-out water of `chunk` the biome of the sea over it (its quart column's biome at y 48): below the
     * old floor the biome source has cave biomes (lush caves, Ice Caves...), which must not show in open water (its
     * colour, its spawns). Decided from the shape, not the blocks, so it's the same whenever it runs. Returns how many
     * sections changed.
     */
    @SuppressWarnings("unchecked")
    public static int rebiome(ChunkAccess chunk, OceanDepths.Area a) {
        if (!a.any()) {
            return 0;
        }
        int x0 = chunk.getPos().getMinBlockX(), z0 = chunk.getPos().getMinBlockZ();
        int qx0 = QuartPos.fromBlock(x0), qz0 = QuartPos.fromBlock(z0);
        Holder<Biome>[] sea = new Holder[16];
        for (int i = 0; i < 4; i++) {
            for (int k = 0; k < 4; k++) {
                sea[i * 4 + k] = chunk.getNoiseBiome(qx0 + i, QuartPos.fromBlock(48), qz0 + k);
            }
        }
        int changed = 0;
        for (int si = chunk.getSectionIndex(OceanDepths.BOTTOM); si <= chunk.getSectionIndex(OceanDepths.TOP); si++) {
            LevelChunkSection section = chunk.getSection(si);
            int by = SectionPos.sectionToBlockCoord(chunk.getSectionYFromSectionIndex(si));
            Holder<Biome>[] next = new Holder[64];
            boolean any = false;
            for (int i = 0; i < 4; i++) {
                for (int j = 0; j < 4; j++) {
                    for (int k = 0; k < 4; k++) {
                        Holder<Biome> cur = section.getNoiseBiome(i, j, k), want = cur;
                        if (a.carved(x0 + i * 4 + 2, by + j * 4 + 2, z0 + k * 4 + 2) && !cur.equals(sea[i * 4 + k])) {
                            want = sea[i * 4 + k];
                            any = true;
                        }
                        next[(i * 4 + j) * 4 + k] = want;
                    }
                }
            }
            if (any) {
                int qy0 = QuartPos.fromBlock(by);
                section.fillBiomesFromNoise((qx, qy, qz, sampler) -> next[((qx - qx0) * 4 + qy - qy0) * 4 + qz - qz0], null, qx0,
                        qy0, qz0);
                changed++;
            }
        }
        return changed;
    }

    // ============================================================================================ sinks

    /**
     * Writes straight into a proto-chunk's sections (world generation: the chunk's lighting is worked out after its
     * features, so nothing else needs telling) and fixes its heightmaps column by column.
     */
    public static Sink chunk(ChunkAccess chunk) {
        return new Sink() {
            @Override
            public BlockState get(int x, int y, int z) {
                if (y < chunk.getMinBuildHeight() || y >= chunk.getMaxBuildHeight()) {
                    return OceanGen.AIR;
                }
                return chunk.getSection(chunk.getSectionIndex(y)).getBlockState(x & 15, y & 15, z & 15);
            }

            @Override
            public void set(int x, int y, int z, BlockState s) {
                if (y < chunk.getMinBuildHeight() || y >= chunk.getMaxBuildHeight()) {
                    return;
                }
                LevelChunkSection section = chunk.getSection(chunk.getSectionIndex(y));
                section.setBlockState(x & 15, y & 15, z & 15, s);
            }

            @Override
            public void columnDone(int x, int z, int topChanged) {
                BlockState s = get(x, topChanged, z);
                for (Map.Entry<Heightmap.Types, Heightmap> e : chunk.getHeightmaps()) {
                    e.getValue().update(x & 15, topChanged, z & 15, s);
                }
                chunk.setUnsaved(true);
            }
        };
    }

    /** Writes through the level (commands and tests). */
    public static Sink level(net.minecraft.world.level.LevelAccessor level) {
        return new Sink() {
            private final BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();

            @Override
            public BlockState get(int x, int y, int z) {
                return level.getBlockState(m.set(x, y, z));
            }

            @Override
            public void set(int x, int y, int z, BlockState s) {
                level.setBlock(m.set(x, y, z), s, OceanGen.FLAGS);
            }
        };
    }
}
