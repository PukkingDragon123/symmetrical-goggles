package dev.lowpix.winterworks.express;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/** An open Drop Rail: just its hazard-striped frame. Closes back into a Drop Rail a moment after the power goes. */
public class DropRailOpenBlock extends Block {
    public static final BooleanProperty ALONG_X = BooleanProperty.create("along_x");
    private static final VoxelShape OUTLINE = Block.box(0, 0, 0, 16, 2, 16);

    public DropRailOpenBlock(Properties props) {
        super(props);
        registerDefaultState(stateDefinition.any().setValue(ALONG_X, false).setValue(RailPaint.COLOR, 0));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(ALONG_X, RailPaint.COLOR);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return OUTLINE;
    }

    @Override
    protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return Shapes.empty();
    }

    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, BlockPos from, boolean moving) {
        if (!level.isClientSide && !level.hasNeighborSignal(pos)) {
            level.scheduleTick(pos, this, 10);
        }
    }

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (!level.hasNeighborSignal(pos)) {
            level.setBlock(pos, WWBlocks.DROP_RAIL.defaultBlockState()
                    .setValue(PoweredRailBlock.SHAPE, state.getValue(ALONG_X) ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH)
                    .setValue(RailPaint.COLOR, state.getValue(RailPaint.COLOR)), 3);
            level.playSound(null, pos, SoundEvents.IRON_TRAPDOOR_CLOSE, SoundSource.BLOCKS, 1.0f, 0.9f);
        }
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return true;
    }

    @Override
    public ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state) {
        return new ItemStack(WWBlocks.DROP_RAIL);
    }
}
