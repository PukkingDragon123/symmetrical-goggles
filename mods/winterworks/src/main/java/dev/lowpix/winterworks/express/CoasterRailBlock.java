package dev.lowpix.winterworks.express;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Roller coaster rail: a 3D track piece that turns and slopes like a normal rail, but carts keep their momentum and run
 * much faster. It hangs in mid-air with nothing under it (straight, sloped or curved) and never pops off.
 */
public class CoasterRailBlock extends RailBlock {
    public static final MapCodec<RailBlock> CODEC = simpleCodec(CoasterRailBlock::new);

    public CoasterRailBlock(Properties props) {
        super(props);
        registerDefaultState(defaultBlockState().setValue(RailPaint.COLOR, 0));
    }

    @Override
    public MapCodec<RailBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        super.createBlockStateDefinition(builder);
        builder.add(RailPaint.COLOR);
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return true;
    }

    /** Vanilla drops a rail here when it loses its support; a coaster rail only reshapes (the redstone T-switch). */
    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, BlockPos from, boolean moving) {
        if (!level.isClientSide && level.getBlockState(pos).is(this)) {
            updateState(state, level, pos, block);
        }
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        return RailPaint.use(stack, state, level, pos, player, hand);
    }
}
