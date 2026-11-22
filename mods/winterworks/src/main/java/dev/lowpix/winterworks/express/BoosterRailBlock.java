package dev.lowpix.winterworks.express;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Redstone booster rail: powered, it flings carts forward to crazy speed (3x a powered rail's push, up to 3x the speed
 * limit); unpowered, it is a hard brake. Only a redstone block powers it, touching the rail or right under it: levers,
 * torches and dust do nothing, and power does not run along a line of boosters.
 */
public class BoosterRailBlock extends PoweredRailBlock {
    public static final MapCodec<PoweredRailBlock> CODEC = simpleCodec(BoosterRailBlock::new);

    public BoosterRailBlock(Properties props) {
        super(props);
        registerDefaultState(defaultBlockState().setValue(RailPaint.COLOR, 0));
    }

    @Override
    public MapCodec<PoweredRailBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        super.createBlockStateDefinition(builder);
        builder.add(RailPaint.COLOR);
    }

    @Override
    protected void updateState(BlockState state, Level level, BlockPos pos, Block block) {
        boolean powered = redstoneBlockAt(level, pos);
        if (powered != state.getValue(POWERED)) {
            level.setBlock(pos, state.setValue(POWERED, powered), 3);
            level.updateNeighborsAt(pos.below(), this);
            if (state.getValue(SHAPE).isAscending()) {
                level.updateNeighborsAt(pos.above(), this);
            }
        }
    }

    /** A redstone block beside the rail or under it. */
    public static boolean redstoneBlockAt(LevelReader level, BlockPos pos) {
        for (Direction d : Direction.values()) {
            if (d != Direction.UP && level.getBlockState(pos.relative(d)).is(Blocks.REDSTONE_BLOCK)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        return RailPaint.use(stack, state, level, pos, player, hand);
    }
}
