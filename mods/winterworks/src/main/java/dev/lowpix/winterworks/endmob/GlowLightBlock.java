package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEffects;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The light of End Glow (docs/END_UPDATE.md section 6): you shine like a held torch (light 14) wherever you go. An
 * invisible, replaceable block like vanilla's light block, set in the air (or water) at your head as you move. It looks
 * after itself: every half second it checks for someone glowing beside it and is gone when there isn't, so it never
 * outlives the glow, even across a chunk unload (the check is a scheduled tick, saved with the chunk).
 */
public class GlowLightBlock extends Block implements SimpleWaterloggedBlock {
    public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;
    public static final int LIGHT = 14;
    /** Ticks between the checks for a glowing entity. */
    public static final int CHECK = 10;
    /** Block updates for the light: clients only, no neighbour or shape updates (so observers don't see it pass). */
    private static final int FLAGS = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE;

    public GlowLightBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(WATERLOGGED, false));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(WATERLOGGED);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return Shapes.empty();
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.INVISIBLE;
    }

    @Override
    protected boolean propagatesSkylightDown(BlockState state, BlockGetter level, BlockPos pos) {
        return state.getFluidState().isEmpty();
    }

    @Override
    protected FluidState getFluidState(BlockState state) {
        return state.getValue(WATERLOGGED) ? Fluids.WATER.getSource(false) : super.getFluidState(state);
    }

    @Override
    protected BlockState updateShape(BlockState state, Direction dir, BlockState other, LevelAccessor level, BlockPos pos, BlockPos otherPos) {
        if (state.getValue(WATERLOGGED)) {
            level.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));
        }
        return state;
    }

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (glowerNear(level, pos)) {
            level.scheduleTick(pos, this, CHECK);
        } else {
            level.setBlock(pos, empty(state), FLAGS);
        }
    }

    private static BlockState empty(BlockState light) {
        return light.getValue(WATERLOGGED) ? Blocks.WATER.defaultBlockState() : Blocks.AIR.defaultBlockState();
    }

    private static boolean glowerNear(ServerLevel level, BlockPos pos) {
        return !level.getEntitiesOfClass(LivingEntity.class, new AABB(pos).inflate(1.0),
                e -> e.isAlive() && !e.isSpectator() && e.hasEffect(EndEffects.END_GLOW)).isEmpty();
    }

    /** The block `e`'s light sits in: its head, else its body (its feet when its head is in a wall). */
    public static void follow(ServerLevel level, LivingEntity e) {
        BlockPos head = BlockPos.containing(e.getX(), e.getEyeY(), e.getZ());
        if (!place(level, head)) {
            place(level, BlockPos.containing(e.getX(), e.getY() + 0.2, e.getZ()));
        }
    }

    /** Lights `pos` if it is air or still water (or already lit). */
    static boolean place(ServerLevel level, BlockPos pos) {
        BlockState s = level.getBlockState(pos);
        Block light = EndBlocks.GLOW_LIGHT;
        if (s.is(light)) {
            return true;
        }
        BlockState lit;
        if (s.isAir()) {
            lit = light.defaultBlockState();
        } else if (s.is(Blocks.WATER) && s.getFluidState().isSource()) {
            lit = light.defaultBlockState().setValue(WATERLOGGED, true);
        } else {
            return false;
        }
        level.setBlock(pos, lit, FLAGS);
        level.scheduleTick(pos, light, CHECK);
        return true;
    }
}
