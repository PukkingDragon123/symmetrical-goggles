package dev.lowpix.winterworks.harvester;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * The Harvester Egg (docs/FIXES_0_4.md "The Harvester"): a block like the sniffer egg that only develops while it is
 * submerged (water above it, or waterlogged). Every {@link #CHECK_TICKS} it adds that much time to its progress (twice as
 * much on moss, like sniffer eggs); each of the three stages takes a third of {@link #HATCH_TICKS} (~20 minutes in all),
 * then it cracks or, at the last stage, hatches a baby Harvester. A Harvester hatched near a player is tame to them.
 * The progress lives in a small block entity so a dry spell pauses it instead of restarting it.
 */
public class HarvesterEggBlock extends Block implements EntityBlock, SimpleWaterloggedBlock {
    public static final MapCodec<HarvesterEggBlock> CODEC = simpleCodec(HarvesterEggBlock::new);
    public static final IntegerProperty HATCH = BlockStateProperties.HATCH;
    public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;
    public static final int MAX_HATCH = 2;
    /** All three stages together: about 20 minutes underwater (half that on moss). */
    public static final int HATCH_TICKS = 24000, STAGE_TICKS = HATCH_TICKS / 3, CHECK_TICKS = 100;
    /** A player this close when it hatches becomes the baby's owner. */
    public static final double TAME_RANGE = 16.0;
    private static final VoxelShape SHAPE = Block.box(1.0, 0.0, 2.0, 15.0, 16.0, 14.0);

    public HarvesterEggBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(HATCH, 0).setValue(WATERLOGGED, false));
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(HATCH, WATERLOGGED);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Nullable
    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new EggBlockEntity(pos, state);
    }

    // --------------------------------------------------------------------------------------- water

    @Nullable
    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        FluidState fluid = ctx.getLevel().getFluidState(ctx.getClickedPos());
        return defaultBlockState().setValue(WATERLOGGED, fluid.getType() == Fluids.WATER);
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
        return super.updateShape(state, dir, other, level, pos, otherPos);
    }

    /** Underwater: waterlogged, or with water right above it. */
    public static boolean submerged(LevelReader level, BlockPos pos, BlockState state) {
        return (state.hasProperty(WATERLOGGED) && state.getValue(WATERLOGGED)) || level.getFluidState(pos.above()).is(FluidTags.WATER);
    }

    public static boolean boosted(BlockGetter level, BlockPos pos) {
        return level.getBlockState(pos.below()).is(BlockTags.SNIFFER_EGG_HATCH_BOOST);
    }

    // --------------------------------------------------------------------------------------- hatching

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moved) {
        if (!level.isClientSide && !old.is(this)) {
            if (boosted(level, pos)) {
                level.levelEvent(3009, pos, 0);   // the sniffer egg's "this soil helps" sparkle
            }
            level.gameEvent(GameEvent.BLOCK_PLACE, pos, GameEvent.Context.of(state));
        }
        if (!level.isClientSide) {
            level.scheduleTick(pos, this, CHECK_TICKS);
        }
    }

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        develop(level, pos, CHECK_TICKS);
        if (level.getBlockState(pos).is(this)) {
            level.scheduleTick(pos, this, CHECK_TICKS);
        }
    }

    /**
     * Lets `ticks` of development pass (only while submerged; twice as fast on moss). Cracks a stage or hatches when the
     * stage's time is up. Returns true when something changed.
     */
    public static boolean develop(ServerLevel level, BlockPos pos, int ticks) {
        BlockState state = level.getBlockState(pos);
        if (!(state.getBlock() instanceof HarvesterEggBlock) || !submerged(level, pos, state)
                || !(level.getBlockEntity(pos) instanceof EggBlockEntity egg)) {
            return false;
        }
        egg.progress += boosted(level, pos) ? ticks * 2 : ticks;
        egg.setChanged();
        if (egg.progress < STAGE_TICKS) {
            return false;
        }
        egg.progress = 0;
        RandomSource r = level.random;
        int hatch = state.getValue(HATCH);
        if (hatch < MAX_HATCH) {
            level.playSound(null, pos, SoundEvents.SNIFFER_EGG_CRACK, SoundSource.BLOCKS, 0.7f, 0.8f + r.nextFloat() * 0.2f);
            level.setBlock(pos, state.setValue(HATCH, hatch + 1), Block.UPDATE_CLIENTS);
            level.sendParticles(net.minecraft.core.particles.ParticleTypes.BUBBLE, pos.getX() + 0.5, pos.getY() + 0.8, pos.getZ() + 0.5,
                    8, 0.3, 0.2, 0.3, 0.05);
            return true;
        }
        hatch(level, pos, state);
        return true;
    }

    /** The egg breaks open: a baby Harvester, tame to the nearest player within {@link #TAME_RANGE}. */
    public static HarvesterEntity hatch(ServerLevel level, BlockPos pos, BlockState state) {
        RandomSource r = level.random;
        level.playSound(null, pos, SoundEvents.SNIFFER_EGG_HATCH, SoundSource.BLOCKS, 0.8f, 0.8f + r.nextFloat() * 0.2f);
        level.destroyBlock(pos, false);   // a waterlogged egg leaves its water behind
        HarvesterEntity baby = WWEntities.HARVESTER.create(level);
        if (baby == null) {
            return null;
        }
        Vec3 c = Vec3.atBottomCenterOf(pos);
        baby.moveTo(c.x, c.y, c.z, Mth.wrapDegrees(r.nextFloat() * 360f), 0f);
        baby.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), MobSpawnType.BREEDING, null);
        baby.setBaby(true);
        Player near = level.getNearestPlayer(c.x, c.y, c.z, TAME_RANGE, EntitySelector.NO_SPECTATORS);
        if (near != null && near.isAlive()) {
            baby.tameWithName(near);
            baby.setOrder(HarvesterEntity.Order.FOLLOW);
        }
        level.addFreshEntity(baby);
        level.sendParticles(net.minecraft.core.particles.ParticleTypes.BUBBLE_POP, c.x, c.y + 0.5, c.z, 16, 0.4, 0.4, 0.4, 0.05);
        return baby;
    }

    @Override
    protected boolean isPathfindable(BlockState state, PathComputationType type) {
        return false;
    }

    /** How far the egg is into its current stage (ticks underwater). */
    public static class EggBlockEntity extends BlockEntity {
        int progress;

        public EggBlockEntity(BlockPos pos, BlockState state) {
            super(WWBlocks.HARVESTER_EGG_BE, pos, state);
        }

        public int progress() {
            return progress;
        }

        @Override
        protected void saveAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {
            super.saveAdditional(tag, registries);
            tag.putInt("Progress", progress);
        }

        @Override
        protected void loadAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {
            super.loadAdditional(tag, registries);
            progress = tag.getInt("Progress");
        }
    }
}
