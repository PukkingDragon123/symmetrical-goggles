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
 * Chorus trees (docs/END_UPDATE.md section 1): a candelabra of chorus stem. A thick trunk (two by two at the foot of
 * the big ones, with buttress roots) with a kink half way up; 2-4 branches from its upper half, each reaching out to
 * one side and then up, holding up a twig of vanilla chorus plant with a chorus flower; a crown of flowers on top;
 * and Chorus Cocoons hanging under the branches' elbows. Also the meadows' vanilla chorus plants, with cocoons under their arms. Chorus plants and flowers stand on
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
        // the trunk: straight, two by two at the foot of the big ones, with one gentle kink half way up
        Direction kink = Direction.from2DDataValue((int) ((id >>> 8) & 3));
        boolean kinks = ((id >>> 10) & 1) == 0;
        BlockPos[] trunk = new BlockPos[h];
        BlockPos c = new BlockPos(x, y, z);
        for (int k = 0; k < h; k++) {
            if (kinks && k == h / 2 + 1) {
                plan.put(c.relative(kink), stem(Direction.Axis.Y));
                c = c.relative(kink);
            }
            trunk[k] = c;
            plan.put(c, stem(Direction.Axis.Y));
            if (big && k < h * 0.42) {
                plan.put(c.east(), stem(Direction.Axis.Y));
                plan.put(c.south(), stem(Direction.Axis.Y));
                plan.put(c.east().south(), stem(Direction.Axis.Y));
            }
            c = c.above();
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
                plan.put(foot.relative(d), stem(d.getAxis()));
                plan.put(foot.relative(d).below(), stem(Direction.Axis.Y));
            }
        }
        // candelabra branches: out along one side, then up, each holding up a flowering twig
        int branches = 2 + (int) ((id >>> 24) & 1) + (big ? 1 : 0);
        int d0 = (int) ((id >>> 28) & 3);
        int cocoons = 0;
        for (int b = 0; b < branches; b++) {
            long hb = EndGen.mix(id + (b + 1) * 0x9E3779B97F4A7C15L);
            Direction d = Direction.from2DDataValue(d0 + b);
            int at = Math.min(h - 3, (int) (h * 0.42 + h * 0.4 * b / Math.max(1, branches - 1)) + (int) (hb & 1));
            int out = 2 + (int) ((hb >>> 8) & 1) + (big ? 1 : 0), rise = 2 + (int) ((hb >>> 12) % 3);
            BlockPos cur = trunk[at];
            for (int s = 1; s <= out; s++) {
                cur = cur.relative(d);
                plan.putIfAbsent(cur, stem(d.getAxis()));
            }
            if (cocoons < 3 && ((hb >>> 20) % 3) != 0) {
                extras.put(cur.below(), cocoon(hb));
                cocoons++;
            }
            for (int s = 1; s <= rise && cur.getY() < y + h; s++) {
                cur = cur.above();
                plan.putIfAbsent(cur, stem(Direction.Axis.Y));
            }
            tip(extras, cur, hb);
        }
        // the crown
        BlockPos crown = trunk[h - 1];
        tip(extras, crown, id);
        if (big) {
            for (int i = 0; i < 2; i++) {
                Direction d = Direction.from2DDataValue(d0 + 2 * i + 1);
                BlockPos arm = crown.below().relative(d);
                plan.putIfAbsent(arm, stem(d.getAxis()));
                plan.putIfAbsent(arm.above(), stem(Direction.Axis.Y));
                tip(extras, arm.above(), EndGen.mix(id ^ (i + 9)));
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
