package dev.lowpix.winterworks.oceanmob;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.TurtleEggBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Turtle clutches of 2-6 eggs (docs/OCEAN_UPDATE.md section 4; vanilla lays 1-4). A turtle egg block holds at most 4, so a
 * clutch of 5 or 6 is laid as two nests side by side on the sand (3 + 2, 3 + 3); with no room beside it the clutch is 4.
 * Called by mixin.oceanmob.TurtleLayEggGoalMixin in place of vanilla's single egg block.
 */
public final class TurtleClutches {
    public static final int MIN = 2, MAX = 6;

    private TurtleClutches() {}

    /** Lays a clutch at `pos` (the air block above the sand); returns how many eggs were laid. */
    public static int lay(Level level, BlockPos pos, RandomSource random) {
        int n = MIN + random.nextInt(MAX - MIN + 1);
        BlockPos second = null;
        if (n > TurtleEggBlock.MAX_EGGS) {
            List<Direction> dirs = new ArrayList<>(Direction.Plane.HORIZONTAL.stream().toList());
            Util.shuffle(dirs, random);
            for (Direction d : dirs) {
                BlockPos q = pos.relative(d);
                if (level.getBlockState(q).canBeReplaced() && level.getFluidState(q).isEmpty() && TurtleEggBlock.isSand(level, q.below())) {
                    second = q;
                    break;
                }
            }
            if (second == null) {
                n = TurtleEggBlock.MAX_EGGS;
            }
        }
        int first = second == null ? n : (n + 1) / 2;
        level.setBlock(pos, eggs(first), Block.UPDATE_ALL);
        if (second != null) {
            level.setBlock(second, eggs(n - first), Block.UPDATE_ALL);
        }
        return n;
    }

    private static BlockState eggs(int n) {
        return Blocks.TURTLE_EGG.defaultBlockState().setValue(TurtleEggBlock.EGGS, n);
    }
}
