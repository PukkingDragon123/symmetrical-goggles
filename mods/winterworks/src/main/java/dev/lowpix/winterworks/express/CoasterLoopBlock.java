package dev.lowpix.winterworks.express;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.BaseRailBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.phys.BlockHitResult;
import org.jetbrains.annotations.Nullable;

/**
 * Coaster Loop: a full vertical loop of coaster track (radius 3, drawn by its block entity renderer) rising from a
 * straight rail piece. Placed in line with coaster rails; a cart that rolls in fast enough rides all the way round
 * (CoasterLoop), a slow one rolls back out. Like coaster rails it needs nothing underneath, and it can be painted.
 */
public class CoasterLoopBlock extends BaseRailBlock implements EntityBlock, FixedRail {
    public static final MapCodec<CoasterLoopBlock> CODEC = simpleCodec(CoasterLoopBlock::new);
    public static final EnumProperty<RailShape> SHAPE = EnumProperty.create("shape", RailShape.class, RailShape.NORTH_SOUTH,
            RailShape.EAST_WEST);

    public CoasterLoopBlock(Properties props) {
        super(true, props);
        registerDefaultState(stateDefinition.any().setValue(SHAPE, RailShape.NORTH_SOUTH).setValue(WATERLOGGED, false)
                .setValue(RailPaint.COLOR, 0));
    }

    @Override
    protected MapCodec<CoasterLoopBlock> codec() {
        return CODEC;
    }

    @Override
    public Property<RailShape> getShapeProperty() {
        return SHAPE;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(SHAPE, WATERLOGGED, RailPaint.COLOR);
    }

    public static boolean alongX(BlockState state) {
        return state.hasProperty(SHAPE) && state.getValue(SHAPE) == RailShape.EAST_WEST;
    }

    /** Hangs in mid-air like coaster rails. */
    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return true;
    }

    /** Never pops off, and its direction is the one it was placed in. */
    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, BlockPos from, boolean moving) {
    }

    @Override
    protected BlockState updateDir(Level level, BlockPos pos, BlockState state, boolean placing) {
        return state;
    }

    @Override
    public boolean ww$connectsTo(BlockState state, BlockPos self, BlockPos other) {
        int dx = other.getX() - self.getX(), dz = other.getZ() - self.getZ();
        return alongX(state) ? dz == 0 && Math.abs(dx) == 1 : dx == 0 && Math.abs(dz) == 1;
    }

    @Override
    protected BlockState rotate(BlockState state, Rotation rotation) {
        if (rotation == Rotation.CLOCKWISE_90 || rotation == Rotation.COUNTERCLOCKWISE_90) {
            return state.setValue(SHAPE, alongX(state) ? RailShape.NORTH_SOUTH : RailShape.EAST_WEST);
        }
        return state;
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.ENTITYBLOCK_ANIMATED;   // the whole loop is drawn by CoasterLoopRenderer
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        return RailPaint.use(stack, state, level, pos, player, hand);
    }

    @Nullable
    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new CoasterLoopBlockEntity(pos, state);
    }

    /** Only there so the loop has a block entity renderer: it stores nothing. */
    public static class CoasterLoopBlockEntity extends BlockEntity {
        public CoasterLoopBlockEntity(BlockPos pos, BlockState state) {
            super(WWBlocks.COASTER_LOOP_BE, pos, state);
        }
    }
}
