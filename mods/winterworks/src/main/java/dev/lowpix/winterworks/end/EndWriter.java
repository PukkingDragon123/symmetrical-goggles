package dev.lowpix.winterworks.end;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import org.jetbrains.annotations.Nullable;

/**
 * Where the terrain builders write: a level, clipped (in world generation) to the chunk being decorated and its
 * neighbours, the region a feature may write to. Builders called from commands and tests write anywhere.
 */
public final class EndWriter {
    public final WorldGenLevel level;
    public final long seed;
    @Nullable
    private final BoundingBox clip;
    private final BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();

    public EndWriter(WorldGenLevel level, @Nullable BoundingBox clip) {
        this.level = level;
        this.seed = level.getSeed();
        this.clip = clip;
    }

    /** The chunk at (cx, cz) and the eight round it. */
    public static EndWriter forChunk(WorldGenLevel level, int cx, int cz) {
        return new EndWriter(level, new BoundingBox((cx - 1) << 4, level.getMinBuildHeight(), (cz - 1) << 4, ((cx + 2) << 4) - 1,
                level.getMaxBuildHeight() - 1, ((cz + 2) << 4) - 1));
    }

    public static EndWriter unclipped(WorldGenLevel level) {
        return new EndWriter(level, null);
    }

    public boolean can(int x, int y, int z) {
        return y >= level.getMinBuildHeight() && y < level.getMaxBuildHeight() && (clip == null || clip.isInside(x, y, z));
    }

    public BlockState get(int x, int y, int z) {
        if (!can(x, y, z)) {
            return EndGen.AIR;
        }
        return level.getBlockState(m.set(x, y, z));
    }

    public BlockState get(BlockPos p) {
        return get(p.getX(), p.getY(), p.getZ());
    }

    public boolean set(int x, int y, int z, BlockState s) {
        if (!can(x, y, z)) {
            return false;
        }
        level.setBlock(m.set(x, y, z), s, EndGen.FLAGS);
        return true;
    }

    public boolean set(BlockPos p, BlockState s) {
        return set(p.getX(), p.getY(), p.getZ(), s);
    }

    /** Sets the block only where there is air or something replaceable (plants). */
    public boolean put(int x, int y, int z, BlockState s) {
        if (!can(x, y, z) || !EndGen.replaceable(get(x, y, z))) {
            return false;
        }
        return set(x, y, z, s);
    }

    /** A ball of `s` (radius r, measured from block centres) round (cx, cy, cz). */
    public void ball(double cx, double cy, double cz, double r, java.util.function.Function<BlockPos, BlockState> s, boolean onlyAir) {
        int x0 = (int) Math.floor(cx - r), x1 = (int) Math.ceil(cx + r);
        int y0 = (int) Math.floor(cy - r), y1 = (int) Math.ceil(cy + r);
        int z0 = (int) Math.floor(cz - r), z1 = (int) Math.ceil(cz + r);
        double rr = r * r;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int x = x0; x <= x1; x++) {
            for (int y = y0; y <= y1; y++) {
                for (int z = z0; z <= z1; z++) {
                    double dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
                    if (dx * dx + dy * dy + dz * dz > rr) {
                        continue;
                    }
                    p.set(x, y, z);
                    BlockState st = s.apply(p);
                    if (st == null) {
                        continue;
                    }
                    if (onlyAir) {
                        put(x, y, z, st);
                    } else {
                        set(x, y, z, st);
                    }
                }
            }
        }
    }

    /** 0..1 hashed from the world seed and a position. */
    public float rnd(int x, int y, int z, int salt) {
        return EndGen.rnd(seed, x, y, z, salt);
    }
}
