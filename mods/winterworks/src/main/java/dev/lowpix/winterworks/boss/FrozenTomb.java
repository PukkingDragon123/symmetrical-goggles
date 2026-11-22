package dev.lowpix.winterworks.boss;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SnowLayerBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Builds a frozen tomb (docs/COLD_UPDATE.md sections 5 and 7): a flattened dome of a chamber (radius ~10) carved out of
 * whatever is there and coated in packed ice, blue ice and snow, icicles hanging from its roof, ice spikes on the floor,
 * and in the middle a huge irregular block of ancient ice (~7 wide, ~6 tall) with spikes radiating out of it, a dormant
 * Frost Mauler frozen inside. A short tunnel leads out towards the nearest cave.
 *
 * <p>Works both during world generation (a structure piece's postProcess passes a {@link WorldGenRegion}; writes stay
 * inside the chunks it may touch, so call it from the chunk holding `centre`) and in a live {@link ServerLevel}.
 * `centre` is the middle of the chamber floor (the lowest air layer).
 */
public final class FrozenTomb {
    /** The chamber's nominal radius (it wobbles by a block or so). */
    public static final int RADIUS = 10;

    private FrozenTomb() {}

    /** Carve the chamber around `centre`, raise the ancient-ice block with spikes and freeze a dormant Frost Mauler inside. */
    public static void build(WorldGenLevel level, BlockPos centre, RandomSource random) {
        new Builder(level, centre, random).run();
    }

    private static final class Builder {
        private static final BlockState AIR = Blocks.AIR.defaultBlockState();
        private static final BlockState PACKED = Blocks.PACKED_ICE.defaultBlockState();
        private static final BlockState BLUE = Blocks.BLUE_ICE.defaultBlockState();
        private static final BlockState SNOW = Blocks.SNOW_BLOCK.defaultBlockState();
        private static final BlockState ANCIENT = WWBlocks.ANCIENT_ICE.defaultBlockState();

        final WorldGenLevel level;
        final BlockPos c;
        final RandomSource rnd;
        final int r, h, pad = 3;
        final double[] ph = new double[6];
        final boolean[][][] inside;
        final int sx, sy, sz;
        final Set<BlockPos> ancient = new HashSet<>();
        final Set<Long> tunnel = new HashSet<>();
        final ChunkPos region;

        Builder(WorldGenLevel level, BlockPos centre, RandomSource random) {
            this.level = level;
            this.c = centre;
            this.rnd = random;
            this.r = RADIUS + random.nextInt(2);
            this.h = 7 + random.nextInt(2);
            for (int i = 0; i < ph.length; i++) {
                ph[i] = random.nextDouble() * Math.PI * 2;
            }
            sx = sz = 2 * (r + pad) + 1;
            sy = h + 2 * pad + 1;
            inside = new boolean[sx][sy][sz];
            region = level instanceof WorldGenRegion wgr ? wgr.getCenter() : null;
        }

        // ------------------------------------------------------------------- world access (kept inside what we may touch)

        boolean canWrite(BlockPos p) {
            if (level.isOutsideBuildHeight(p)) {
                return false;
            }
            if (region != null) {
                return Math.abs((p.getX() >> 4) - region.x) <= 1 && Math.abs((p.getZ() >> 4) - region.z) <= 1;
            }
            return level.hasChunkAt(p);
        }

        BlockState get(BlockPos p) {
            return canWrite(p) ? level.getBlockState(p) : Blocks.STONE.defaultBlockState();
        }

        void set(BlockPos p, BlockState s) {
            if (canWrite(p)) {
                level.setBlock(p, s, Block.UPDATE_CLIENTS);
            }
        }

        BlockPos at(int dx, int dy, int dz) {
            return c.offset(dx, dy, dz);
        }

        boolean in(int dx, int dy, int dz) {
            int ix = dx + r + pad, iy = dy + pad, iz = dz + r + pad;
            return ix >= 0 && iy >= 0 && iz >= 0 && ix < sx && iy < sy && iz < sz && inside[ix][iy][iz];
        }

        BlockState pick(BlockState a, int wa, BlockState b, int wb, BlockState cc, int wc) {
            int t = rnd.nextInt(wa + wb + wc);
            return t < wa ? a : t < wa + wb ? b : cc;
        }

        BlockState floorBlock() {
            return pick(SNOW, 5, PACKED, 3, BLUE, 1);
        }

        BlockState wallBlock() {
            return pick(PACKED, 6, BLUE, 2, SNOW, 2);
        }

        BlockState ceilingBlock() {
            return pick(PACKED, 6, BLUE, 3, SNOW, 1);
        }

        // ------------------------------------------------------------------- shape

        boolean interior(int dx, int dy, int dz) {
            if (dy < 0) {
                return false;
            }
            double ang = Math.atan2(dz, dx);
            double wob = 1 + 0.08 * Math.sin(3 * ang + ph[0]) + 0.06 * Math.sin(5 * ang + ph[1]) + 0.04 * Math.sin(2 * ang + dy * 0.5 + ph[2]);
            double rr = r * wob;
            double hh = h * (1 + 0.1 * Math.sin(dx * 0.35 + ph[3]) * Math.cos(dz * 0.3 + ph[4]));
            return (dx * dx + dz * dz) / (rr * rr) + (double) (dy * dy) / (hh * hh) < 1.0;
        }

        void run() {
            for (int dx = -r - pad; dx <= r + pad; dx++) {
                for (int dy = -pad; dy <= h + pad; dy++) {
                    for (int dz = -r - pad; dz <= r + pad; dz++) {
                        inside[dx + r + pad][dy + pad][dz + r + pad] = interior(dx, dy, dz);
                    }
                }
            }
            carve();
            coat();
            tunnel();
            floorSnow();
            iceSpikes();
            ancientBlock();
            hollow();
            icicles();
            mauler();
        }

        /** Everything inside the dome goes (stone, ore, water, lava, caves' clutter). */
        void carve() {
            for (int dx = -r - pad; dx <= r + pad; dx++) {
                for (int dy = 0; dy <= h + pad; dy++) {
                    for (int dz = -r - pad; dz <= r + pad; dz++) {
                        if (in(dx, dy, dz)) {
                            set(at(dx, dy, dz), AIR);
                        }
                    }
                }
            }
        }

        /** Walls, floor and roof get a skin of ice and snow; fluids leaking in are frozen; the floor is made solid. */
        void coat() {
            for (int dx = -r - pad + 1; dx < r + pad; dx++) {
                for (int dy = -pad + 1; dy < h + pad; dy++) {
                    for (int dz = -r - pad + 1; dz < r + pad; dz++) {
                        if (in(dx, dy, dz)) {
                            continue;
                        }
                        boolean near = false;
                        for (int ox = -1; ox <= 1 && !near; ox++) {
                            for (int oy = -1; oy <= 1 && !near; oy++) {
                                for (int oz = -1; oz <= 1 && !near; oz++) {
                                    near = in(dx + ox, dy + oy, dz + oz);
                                }
                            }
                        }
                        BlockPos p = at(dx, dy, dz);
                        BlockState s = get(p);
                        if (near) {
                            if (dy < 0) {
                                set(p, floorBlock());   // the floor is always there
                            } else if (!s.isAir()) {
                                set(p, dy > h * 0.55 ? ceilingBlock() : wallBlock());
                            }
                        } else if (!s.getFluidState().isEmpty()) {
                            set(p, PACKED);   // seal water and lava out
                        } else if (dy < 0 && in(dx, 0, dz) && s.isAir()) {
                            set(p, PACKED);   // no holes under the floor
                        }
                    }
                }
            }
            for (int dx = -r; dx <= r; dx++) {   // a second floor layer over caves below
                for (int dz = -r; dz <= r; dz++) {
                    if (in(dx, 0, dz) && get(at(dx, -2, dz)).isAir()) {
                        set(at(dx, -2, dz), PACKED);
                    }
                }
            }
        }

        /** A tunnel out of the chamber, as far as the first cave (or a few blocks into the rock). */
        void tunnel() {
            double a = rnd.nextDouble() * Math.PI * 2;
            double ux = Math.cos(a), uz = Math.sin(a);
            int found = 0;
            for (double t = r - 2; t <= r + 7 && found < 2; t += 0.5) {
                boolean hitAir = false;
                for (int w = -1; w <= 1; w++) {
                    for (int y = 0; y <= 2; y++) {
                        if (Math.abs(w) == 1 && y == 2) {
                            continue;   // rounded corners
                        }
                        int dx = (int) Math.floor(ux * t - uz * w + 0.5), dz = (int) Math.floor(uz * t + ux * w + 0.5);
                        if (in(dx, y, dz)) {
                            continue;
                        }
                        BlockPos p = at(dx, y, dz);
                        BlockState s = get(p);
                        tunnel.add(BlockPos.asLong(dx, 0, dz));
                        if (s.isAir()) {
                            if (t > r && y == 1 && w == 0) {
                                hitAir = true;
                            }
                        } else if (s.getFluidState().isEmpty()) {
                            set(p, AIR);
                        }
                    }
                }
                if (hitAir) {
                    found++;
                }
            }
        }

        /** Drifts of snow on the floor. */
        void floorSnow() {
            for (int dx = -r; dx <= r; dx++) {
                for (int dz = -r; dz <= r; dz++) {
                    if (!in(dx, 0, dz) || dx * dx + dz * dz < 30 || rnd.nextFloat() > 0.35f) {
                        continue;
                    }
                    BlockPos p = at(dx, 0, dz);
                    if (get(p).isAir() && get(p.below()).isFaceSturdy(level, p.below(), Direction.UP)) {
                        set(p, Blocks.SNOW.defaultBlockState().setValue(SnowLayerBlock.LAYERS, 1 + rnd.nextInt(3)));
                    }
                }
            }
        }

        /** Spikes of packed and blue ice rising from the floor near the walls, and a few hanging from the roof. */
        void iceSpikes() {
            int n = 6 + rnd.nextInt(4);
            for (int i = 0; i < n; i++) {
                double a = rnd.nextDouble() * Math.PI * 2, d = r * (0.55 + rnd.nextDouble() * 0.3);
                int bx = (int) Math.round(Math.cos(a) * d), bz = (int) Math.round(Math.sin(a) * d);
                if (tunnel.contains(BlockPos.asLong(bx, 0, bz))) {
                    continue;
                }
                cone(bx, 0, bz, 3 + rnd.nextInt(4), 1.2 + rnd.nextDouble() * 0.6, 1);
            }
            int m = 3 + rnd.nextInt(3);
            for (int i = 0; i < m; i++) {
                double a = rnd.nextDouble() * Math.PI * 2, d = r * (0.3 + rnd.nextDouble() * 0.45);
                int bx = (int) Math.round(Math.cos(a) * d), bz = (int) Math.round(Math.sin(a) * d);
                int top = h;
                while (top > 2 && !in(bx, top, bz)) {
                    top--;
                }
                cone(bx, top, bz, 2 + rnd.nextInt(3), 0.9 + rnd.nextDouble() * 0.5, -1);
            }
        }

        /** A cone of ice from (bx, by, bz), `height` blocks up (dir 1) or down (dir -1). Only fills the chamber. */
        void cone(int bx, int by, int bz, int height, double base, int dir) {
            for (int k = 0; k < height; k++) {
                double rad = base * (1.0 - (double) k / height) + 0.2;
                int y = by + k * dir;
                int ir = (int) Math.ceil(rad);
                for (int ox = -ir; ox <= ir; ox++) {
                    for (int oz = -ir; oz <= ir; oz++) {
                        if (ox * ox + oz * oz <= rad * rad && in(bx + ox, y, bz + oz)) {
                            set(at(bx + ox, y, bz + oz), ox == 0 && oz == 0 ? BLUE : (rnd.nextInt(4) == 0 ? BLUE : PACKED));
                        }
                    }
                }
            }
        }

        void placeAncient(int dx, int dy, int dz) {
            if (in(dx, dy, dz) || (dy < 0 && dy >= -1)) {
                BlockPos p = at(dx, dy, dz);
                if (canWrite(p)) {
                    set(p, ANCIENT);
                    ancient.add(p);
                }
            }
        }

        /** The huge irregular block of ancient ice in the middle, with spikes radiating out of it. */
        void ancientBlock() {
            double a = 3.6, b = 3.8, cy = 2.4;   // centred low: a broad base on the floor, ~6-7 tall
            for (int dx = -6; dx <= 6; dx++) {
                for (int dy = 0; dy <= 7; dy++) {
                    for (int dz = -6; dz <= 6; dz++) {
                        double wob = 0.12 * Math.sin(dx * 1.3 + ph[5]) + 0.1 * Math.cos(dz * 1.1 + dy * 0.7 + ph[0]);
                        double v = (dx * dx) / (a * a) + ((dy - cy) * (dy - cy)) / (b * b) + (dz * dz) / (a * a);
                        if (v < 1.0 + wob + (rnd.nextDouble() - 0.5) * 0.25) {
                            placeAncient(dx, dy, dz);
                        }
                    }
                }
            }
            for (int i = 0; i < 5; i++) {   // knobbly crystal lumps on its surface
                double t = rnd.nextDouble() * Math.PI * 2, e = rnd.nextDouble() * 0.9;
                int lx = (int) Math.round(Math.cos(t) * Math.cos(e) * a), lz = (int) Math.round(Math.sin(t) * Math.cos(e) * a);
                int ly = (int) Math.round(cy + Math.sin(e) * b);
                for (int ox = 0; ox <= 1; ox++) {
                    for (int oy = 0; oy <= 1; oy++) {
                        for (int oz = 0; oz <= 1; oz++) {
                            placeAncient(lx + ox, ly + oy, lz + oz);
                        }
                    }
                }
            }
            int n = 9 + rnd.nextInt(4);
            for (int i = 0; i < n; i++) {
                double yaw = i * Math.PI * 2 / n + (rnd.nextDouble() - 0.5) * 0.5;
                double pitch = i % 4 == 0 ? -0.12 : 0.15 + rnd.nextDouble() * 0.85;
                double len = 5.5 + rnd.nextDouble() * 3.5;
                double ux = Math.cos(yaw) * Math.cos(pitch), uy = Math.sin(pitch), uz = Math.sin(yaw) * Math.cos(pitch);
                for (double t = 2.0; t <= len; t += 0.35) {
                    double px = 0.5 + ux * t, py = 3.0 + uy * t, pz = 0.5 + uz * t;
                    double rad = Mth.lerp((t - 2.0) / (len - 2.0), 1.25, 0.2);
                    int ir = (int) Math.ceil(rad);
                    for (int ox = -ir; ox <= ir; ox++) {
                        for (int oy = -ir; oy <= ir; oy++) {
                            for (int oz = -ir; oz <= ir; oz++) {
                                int bx = (int) Math.floor(px) + ox, by = (int) Math.floor(py) + oy, bz = (int) Math.floor(pz) + oz;
                                double qx = bx + 0.5 - px, qy = by + 0.5 - py, qz = bz + 0.5 - pz;
                                if (qx * qx + qy * qy + qz * qz > rad * rad || !in(bx, by, bz)) {
                                    continue;
                                }
                                BlockPos p = at(bx, by, bz);
                                if (ancient.contains(p)) {
                                    continue;
                                }
                                if (t <= 5.0) {
                                    placeAncient(bx, by, bz);   // the spike's root is part of the tomb
                                } else {
                                    set(p, rnd.nextInt(3) == 0 ? BLUE : PACKED);
                                }
                            }
                        }
                    }
                }
            }
        }

        /** Just enough room inside for the Mauler's body (it is frozen in, not crushed). */
        void hollow() {
            for (int dx = -1; dx <= 1; dx++) {
                for (int dy = 1; dy <= 4; dy++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        BlockPos p = at(dx, dy, dz);
                        set(p, AIR);
                        ancient.remove(p);
                    }
                }
            }
        }

        /** Icicles hang from the roof in ones, twos and threes. */
        void icicles() {
            BlockState tip = WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, true);
            BlockState base = WWBlocks.ICICLE.defaultBlockState().setValue(IcicleBlock.TIP, false);
            for (int dx = -r; dx <= r; dx++) {
                for (int dz = -r; dz <= r; dz++) {
                    if (rnd.nextFloat() > 0.16f || tunnel.contains(BlockPos.asLong(dx, 0, dz))) {
                        continue;
                    }
                    int top = h + 1;
                    while (top >= 0 && !in(dx, top, dz)) {
                        top--;
                    }
                    if (top < 4) {
                        continue;
                    }
                    BlockPos roof = at(dx, top + 1, dz);
                    BlockState rs = get(roof);
                    if (rs.isAir() || !rs.isFaceSturdy(level, roof, Direction.DOWN)) {
                        continue;
                    }
                    int len = 1 + rnd.nextInt(3);
                    int free = 0;
                    while (free < len && top - free > 2 && get(at(dx, top - free, dz)).isAir()) {
                        free++;
                    }
                    for (int k = 0; k < free; k++) {
                        set(at(dx, top - k, dz), k == free - 1 ? tip : base);
                    }
                }
            }
        }

        /** The Frost Mauler, frozen mid-roar in the heart of the ice. */
        void mauler() {
            ServerLevel sl = level.getLevel();
            FrostMaulerEntity m = WWEntities.FROST_MAULER.create(sl);
            if (m == null || !canWrite(c)) {
                return;
            }
            float yaw = rnd.nextFloat() * 360f;
            m.moveTo(c.getX() + 0.5, c.getY() + 1.15, c.getZ() + 0.5, yaw, 0f);
            m.setYHeadRot(yaw);
            m.setYBodyRot(yaw);
            BlockPos mp = m.blockPosition();
            int n = 0;
            for (BlockPos p : ancient) {
                if (Math.abs(p.getX() - mp.getX()) <= FrostMaulerEntity.TOMB_RADIUS && Math.abs(p.getY() - mp.getY()) <= FrostMaulerEntity.TOMB_RADIUS
                        && Math.abs(p.getZ() - mp.getZ()) <= FrostMaulerEntity.TOMB_RADIUS) {
                    n++;
                }
            }
            m.makeDormant(n);
            level.addFreshEntity(m);
        }
    }
}
