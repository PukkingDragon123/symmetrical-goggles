package dev.lowpix.winterworks.boss;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * A hanging icicle (docs/COLD_UPDATE.md section 6). Hangs from a ceiling or from the icicle above it; `tip` is true on
 * the bottom block. When its support goes (or a projectile hits it) it and everything hanging below it break off and
 * fall as {@link FallingIcicleEntity}s.
 */
public class IcicleBlock extends Block {
    public static final MapCodec<IcicleBlock> CODEC = simpleCodec(IcicleBlock::new);
    public static final BooleanProperty TIP = BooleanProperty.create("tip");
    private static final VoxelShape TIP_SHAPE = Block.box(5, 2, 5, 11, 16, 11);
    private static final VoxelShape BASE_SHAPE = Block.box(3.5, 0, 3.5, 12.5, 16, 12.5);

    public IcicleBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(TIP, true));
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(TIP);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return state.getValue(TIP) ? TIP_SHAPE : BASE_SHAPE;
    }

    @Override
    protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return Shapes.empty();
    }

    /** Hangs from a solid ceiling or from another icicle. */
    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        BlockPos up = pos.above();
        BlockState above = level.getBlockState(up);
        return above.is(this) || above.isFaceSturdy(level, up, Direction.DOWN);
    }

    @Nullable
    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        BlockState s = defaultBlockState().setValue(TIP, !ctx.getLevel().getBlockState(ctx.getClickedPos().below()).is(this));
        return s.canSurvive(ctx.getLevel(), ctx.getClickedPos()) ? s : null;
    }

    @Override
    protected BlockState updateShape(BlockState state, Direction dir, BlockState other, LevelAccessor level, BlockPos pos, BlockPos otherPos) {
        if (dir == Direction.UP && !state.canSurvive(level, pos)) {
            level.scheduleTick(pos, this, 2);   // the support went: break off next tick (like pointed dripstone)
            return state;
        }
        if (dir == Direction.DOWN) {
            return state.setValue(TIP, !other.is(this));
        }
        return state;
    }

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (!state.canSurvive(level, pos)) {
            breakOff(level, pos);
        }
    }

    /** An arrow, trident or snowball knocks it down (with everything below it). Great for traps. */
    @Override
    protected void onProjectileHit(Level level, BlockState state, BlockHitResult hit, Projectile projectile) {
        if (level instanceof ServerLevel sl && projectile.mayInteract(level, hit.getBlockPos())) {
            breakOff(sl, hit.getBlockPos());
        }
    }

    /** This icicle and every icicle hanging below it fall. */
    public static void breakOff(ServerLevel level, BlockPos pos) {
        BlockPos.MutableBlockPos p = pos.mutable();
        boolean any = false;
        while (level.getBlockState(p).is(WWBlocks.ICICLE)) {
            FallingIcicleEntity.fall(level, p.immutable(), level.getBlockState(p));
            any = true;
            p.move(Direction.DOWN);
        }
        if (any) {
            level.playSound(null, pos, WWSounds.ICICLE_FALL, SoundSource.BLOCKS, 1.0f, 0.9f + level.random.nextFloat() * 0.3f);
        }
    }

    /** Now and then a drip of meltwater or a glint of frost. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (state.getValue(TIP) && random.nextInt(40) == 0) {
            level.addParticle(ParticleTypes.SNOWFLAKE, pos.getX() + 0.5, pos.getY() + 0.1, pos.getZ() + 0.5, 0, -0.02, 0);
        }
    }
}
