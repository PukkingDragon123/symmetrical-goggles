package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A thin stain of blood (docs/AMBER_UPDATE.md section 7), left by splash and lingering Potions of Blood. It fades after
 * about 2 minutes. A mosquito that touches it drinks it: an amber one spits out its amber, an empty one fills up.
 */
public class BloodStainBlock extends Block {
    public static final MapCodec<BloodStainBlock> CODEC = simpleCodec(BloodStainBlock::new);
    private static final VoxelShape SHAPE = Block.box(0, 0, 0, 16, 1, 16);
    /** About 2 minutes. */
    public static final int FADE_TICKS = 2400;

    public BloodStainBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        BlockPos below = pos.below();
        return level.getBlockState(below).isFaceSturdy(level, below, Direction.UP);
    }

    @Override
    protected BlockState updateShape(BlockState state, Direction dir, BlockState neighbour, LevelAccessor level, BlockPos pos,
                                     BlockPos neighbourPos) {
        return dir == Direction.DOWN && !canSurvive(state, level, pos) ? Blocks.AIR.defaultBlockState()
                : super.updateShape(state, dir, neighbour, level, pos, neighbourPos);
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moved) {
        if (!old.is(this)) {
            level.scheduleTick(pos, this, FADE_TICKS + level.random.nextInt(400));
        }
    }

    /** Faded away. */
    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        level.removeBlock(pos, false);
    }

    /** A stain that lost its fade tick (e.g. placed by a command in an unloaded chunk) still fades. */
    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (!level.getBlockTicks().hasScheduledTick(pos, this)) {
            level.scheduleTick(pos, this, FADE_TICKS / 2);
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity) {
        if (!level.isClientSide && entity instanceof MosquitoEntity m && m.wantsBlood() && m.feedBlood()) {
            level.removeBlock(pos, false);   // drunk up
        }
    }

    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (random.nextInt(12) == 0) {
            level.addParticle(WWParticles.BLOOD_DRIP, pos.getX() + random.nextDouble(), pos.getY() + 0.08, pos.getZ() + random.nextDouble(),
                    0, 0, 0);
        }
    }
}
