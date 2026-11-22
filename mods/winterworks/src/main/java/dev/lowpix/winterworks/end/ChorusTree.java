package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.endmob.ChorusCocoonBlock;
import dev.lowpix.winterworks.registry.EndBlocks;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChorusFlowerBlock;
import net.minecraft.world.level.block.ChorusPlantBlock;
import net.minecraft.world.level.block.PipeBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Chorus trees (docs/END_UPDATE.md section 1): a thick, gently leaning trunk of chorus stem (two by two at the foot of
 * the big ones, with buttress roots), branches reaching out and up from its upper half, each ending in a twig of
 * vanilla chorus plant with a chorus flower, a crown of flowers on top, and Chorus Cocoons hanging under the
 * branches. Also the meadows' vanilla chorus plants, with cocoons under their arms. Chorus plants and flowers stand on
 * chorus stem and End Grass (mixin.end.ChorusSoilMixin).
 */
public final class ChorusTree {
    public static final int MIN_HEIGHT = 9, MAX_HEIGHT = 18;

    private ChorusTree() {}

    static BlockState stem(Direction.Axis axis) {
        return EndBlocks.CHORUS_STEM.defaultBlockState().setValue(RotatedPillarBlock.AXIS, axis);
    }

    static BlockState twig(boolean down, boolean up, boolean side, Direction sideDir) {
        BlockState s = Blocks.CHORUS_PLANT.defaultBlockState().setValue(PipeBlock.DOWN, down).setValue(PipeBlock.UP, up);
        if (side) {
            s = s.setValue(PipeBlock.PROPERTY_BY_DIRECTION.get(sideDir), true);
        }
        return s;
    }

    static BlockState flower(long h) {
        return Blocks.CHORUS_FLOWER.defaultBlockState().setValue(ChorusFlowerBlock.AGE, (h & 3) == 0 ? 4 : 5);
    }

    public static BlockState cocoon(long h) {
        return EndBlocks.CHORUS_COCOON.defaultBlockState().setValue(ChorusCocoonBlock.AGE, (int) ((h >>> 3) & 3));
    }

    /**
     * Grows a tree from (x, y, z), the air block over its ground. False (and nothing built) if there's no room.
     */
    public static boolean grow(EndWriter w, int x, int y, int z, long id) {
        if (!EndPlantBlock.isEndSoil(w.get(x, y - 1, z))) {
            return false;
        }
        Map<BlockPos, BlockState> plan = new LinkedHashMap<>();
        Map<BlockPos, BlockState> extras = new LinkedHashMap<>();   // twigs, flowers, cocoons: only into free air
        int h = MIN_HEIGHT + (int) Long.remainderUnsigned(id, MAX_HEIGHT - MIN_HEIGHT + 1);
        boolean big = h >= 13;
        double lean = ((id >>> 8) & 0xFFFF) / 65536.0 * Math.PI * 2;
        double lx = Math.cos(lean) * 0.16, lz = Math.sin(lean) * 0.16;
        double px = x, pz = z;
        int ptx = x, ptz = z;
        BlockPos[] trunk = new BlockPos[h];
        for (int k = 0; k < h; k++) {
            int tx = (int) Math.round(px), tz = (int) Math.round(pz);
            BlockPos c = new BlockPos(tx, y + k, tz);
            trunk[k] = c;
            plan.put(c, stem(Direction.Axis.Y));
            if (tx != ptx || tz != ptz) {
                plan.put(new BlockPos(ptx, y + k, ptz), stem(Direction.Axis.Y));   // keep the trunk joined
            }
            if (big && k < h * 0.55) {
                plan.put(c.east(), stem(Direction.Axis.Y));
                plan.put(c.south(), stem(Direction.Axis.Y));
                plan.put(c.east().south(), stem(Direction.Axis.Y));
            }
            ptx = tx;
            ptz = tz;
            double sway = Math.sin(k * 0.45 + (id & 7)) * 0.08;
            px += lx + sway * lz;
            pz += lz - sway * lx;
        }
        // buttress roots at the foot
        if (big) {
            for (Direction d : Direction.Plane.HORIZONTAL) {
                long hd = EndGen.mix(id ^ d.ordinal() * 0x51L);
                if ((hd & 3) == 0) {
                    continue;
                }
                BlockPos foot = new BlockPos(x, y, z);
                if (d == Direction.EAST || d == Direction.SOUTH) {
                    foot = foot.relative(d);   // the 2x2 trunk's far side
                }
                for (int k = 1; k <= 1 + (hd >>> 2 & 1); k++) {
                    plan.put(foot.relative(d, k), stem(d.getAxis()));
                    plan.put(foot.relative(d, k).below(), stem(Direction.Axis.Y));
                }
            }
        }
        // branches from the upper half, spiralling round the trunk
        int branches = 3 + (int) ((id >>> 24) % 3) + (big ? 1 : 0);
        double a0 = ((id >>> 30) & 0xFFFF) / 65536.0 * Math.PI * 2;
        int cocoons = 0;
        for (int b = 0; b < branches; b++) {
            long hb = EndGen.mix(id + (b + 1) * 0x9E3779B97F4A7C15L);
            int at = (int) (h * 0.45 + h * 0.48 * (b + 0.5) / branches) + (int) (hb & 1);
            at = Math.min(h - 2, at);
            double a = a0 + b * 2.39996 + ((hb >>> 4) & 0xFF) / 256.0 * 0.5;
            int len = 3 + (int) ((hb >>> 12) % 3) + (big ? 2 : 0);
            BlockPos cur = trunk[at];
            double fx = cur.getX(), fz = cur.getZ();
            BlockPos last = cur;
            for (int s = 1; s <= len; s++) {
                fx += Math.cos(a);
                fz += Math.sin(a);
                int nx = (int) Math.round(fx), nz = (int) Math.round(fz);
                int ny = last.getY() + ((s % 2 == 0 && s > 1) ? 1 : 0);
                if (ny != last.getY()) {
                    last = last.above();
                    plan.putIfAbsent(last, stem(Direction.Axis.Y));
                }
                if (nx != last.getX()) {
                    last = new BlockPos(nx, last.getY(), last.getZ());
                    plan.putIfAbsent(last, stem(Direction.Axis.X));
                }
                if (nz != last.getZ()) {
                    last = new BlockPos(last.getX(), last.getY(), nz);
                    plan.putIfAbsent(last, stem(Direction.Axis.Z));
                }
                if (s == len / 2 + 1 && cocoons < 3 && ((hb >>> 20) % 3) != 0) {
                    extras.put(last.below(), cocoon(hb));
                    cocoons++;
                }
            }
            tip(extras, last, hb);
        }
        // the crown
        BlockPos crown = trunk[h - 1];
        tip(extras, crown, id);
        for (Direction d : Direction.Plane.HORIZONTAL) {
            long hd = EndGen.mix(id ^ (d.ordinal() + 9) * 0x2545F4914F6CDD1DL);
            if ((hd & 1) == 0) {
                BlockPos arm = crown.relative(d);
                plan.putIfAbsent(arm, stem(d.getAxis()));
                tip(extras, arm, hd);
            }
        }
        for (BlockPos p : plan.keySet()) {
            BlockState old = w.get(p);
            boolean belowGround = p.getY() < y;
            if (!w.can(p.getX(), p.getY(), p.getZ()) || !(EndGen.replaceable(old) || old.is(EndBlocks.CHORUS_STEM)
                    || belowGround && EndGen.ground(old))) {
                return false;
            }
        }
        plan.forEach(w::set);
        extras.forEach((p, s) -> w.put(p.getX(), p.getY(), p.getZ(), s));
        return true;
    }

    /** A chorus-plant twig (1-2 blocks) with a flower, rising from the stem at `stem`. */
    static void tip(Map<BlockPos, BlockState> extras, BlockPos stem, long h) {
        int n = 1 + (int) ((h >>> 40) & 1);
        BlockPos p = stem.above();
        for (int i = 0; i < n; i++, p = p.above()) {
            extras.put(p, twig(true, true, false, Direction.UP));
        }
        extras.put(p, flower(h));
    }

    // ------------------------------------------------------------------------------------------ vanilla chorus plants

    /** A vanilla chorus plant at (x, y, z) over End soil, with up to two cocoons hanging under its arms. */
    public static boolean chorusPlant(EndWriter w, int x, int y, int z, long id) {
        BlockPos at = new BlockPos(x, y, z);
        if (!w.get(at).isAir() || !EndPlantBlock.isEndSoil(w.get(at.below()))) {
            return false;
        }
        ChorusFlowerBlock.generatePlant(w.level, at, RandomSource.create(id), 8);
        int cocoons = 0;
        long h = id;
        for (int dy = 2; dy < 20 && cocoons < 2; dy++) {
            for (int dx = -7; dx <= 7 && cocoons < 2; dx++) {
                for (int dz = -7; dz <= 7 && cocoons < 2; dz++) {
                    BlockPos p = at.offset(dx, dy, dz);
                    BlockState s = w.get(p);
                    if (!s.is(Blocks.CHORUS_PLANT) || s.getValue(ChorusPlantBlock.DOWN) || !w.get(p.below()).isAir()) {
                        continue;
                    }
                    h = EndGen.mix(h + p.asLong());
                    if ((h & 3) == 0) {
                        w.put(p.getX(), p.getY() - 1, p.getZ(), cocoon(h));
                        cocoons++;
                    }
                }
            }
        }
        return true;
    }
}
