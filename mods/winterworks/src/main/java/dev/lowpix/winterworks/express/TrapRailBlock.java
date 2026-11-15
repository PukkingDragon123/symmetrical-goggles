package dev.lowpix.winterworks.express;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Trap Rail: while powered, steel jaws clamp any cart that rolls onto it and hold it still. Cut the power and it
 * lets go with a launch in the direction the cart was travelling: a roller-coaster station, brake or launch.
 */
public class TrapRailBlock extends PoweredRailBlock {
    public static final MapCodec<PoweredRailBlock> CODEC = simpleCodec(TrapRailBlock::new);

    public TrapRailBlock(Properties props) {
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
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        return RailPaint.use(stack, state, level, pos, player, hand);
    }
}
