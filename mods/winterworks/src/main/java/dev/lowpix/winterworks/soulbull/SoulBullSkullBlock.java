package dev.lowpix.winterworks.soulbull;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.DirectionProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * The Soul Bull's skull (docs/FIXES_0_4.md "The Soul Bull"). Set on soul sand with lit soul fire on all four sides, its
 * eye sockets ignite (`lit`). Wither Bones used on a lit skull gather round it as a heap; the last one (10-15, rolled per
 * skull: {@link SoulBullSkullBlockEntity}) rebuilds the bull, alive and tamed to whoever gave it.
 */
public class SoulBullSkullBlock extends BaseEntityBlock {
    public static final MapCodec<SoulBullSkullBlock> CODEC = simpleCodec(SoulBullSkullBlock::new);
    public static final DirectionProperty FACING = HorizontalDirectionalBlock.FACING;
    public static final BooleanProperty LIT = BlockStateProperties.LIT;
    private static final VoxelShape SHAPE = Block.box(2, 0, 2, 14, 8, 14);

    public SoulBullSkullBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(LIT, false));
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(FACING, LIT);
    }

    /** On soul sand, with lit soul fire (or a lit soul campfire) on each of its four sides. */
    public static boolean isKindled(BlockGetter level, BlockPos pos) {
        if (!level.getBlockState(pos.below()).is(Blocks.SOUL_SAND)) {
            return false;
        }
        for (Direction d : Direction.Plane.HORIZONTAL) {
            BlockState s = level.getBlockState(pos.relative(d));
            boolean fire = s.is(Blocks.SOUL_FIRE) || (s.is(Blocks.SOUL_CAMPFIRE) && s.getValue(CampfireBlock.LIT));
            if (!fire) {
                return false;
            }
        }
        return true;
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        return defaultBlockState().setValue(FACING, ctx.getHorizontalDirection().getOpposite())
                .setValue(LIT, isKindled(ctx.getLevel(), ctx.getClickedPos()));
    }

    @Override
    protected BlockState updateShape(BlockState state, Direction dir, BlockState neighbour, LevelAccessor level, BlockPos pos,
                                     BlockPos neighbourPos) {
        if (dir == Direction.UP) {
            return state;
        }
        return state.setValue(LIT, isKindled(level, pos));
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moved) {
        super.onPlace(state, level, pos, old, moved);
        if (state.getValue(LIT) && !(old.is(this) && old.getValue(LIT)) && level instanceof ServerLevel sl) {
            sl.playSound(null, pos, WWSounds.SOUL_BULL_SKULL_IGNITE, SoundSource.BLOCKS, 1.2f, 0.9f + sl.random.nextFloat() * 0.2f);
            sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, pos.getX() + 0.5, pos.getY() + 0.35, pos.getZ() + 0.5, 12, 0.2, 0.1, 0.2, 0.03);
        }
    }

    @Override
    protected void onRemove(BlockState state, Level level, BlockPos pos, BlockState newState, boolean moved) {
        if (!newState.is(this) && level.getBlockEntity(pos) instanceof SoulBullSkullBlockEntity be && be.bones() > 0) {
            Block.popResource(level, pos, new ItemStack(WWItems.WITHER_BONE, be.bones()));   // the heap scatters
        }
        super.onRemove(state, level, pos, newState, moved);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new SoulBullSkullBlockEntity(pos, state);
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.ENTITYBLOCK_ANIMATED;   // drawn by client.soulbull.SoulBullSkullRenderer
    }

    @Nullable
    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return level.isClientSide ? createTickerHelper(type, WWBlocks.SOUL_BULL_SKULL_BE, SoulBullSkullBlockEntity::clientTick) : null;
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        if (!stack.is(WWItems.WITHER_BONE)) {
            return super.useItemOn(stack, state, level, pos, player, hand, hit);
        }
        if (!state.getValue(LIT)) {
            if (!level.isClientSide) {
                player.displayClientMessage(Component.translatable("message.winterworks.soul_bull_skull.cold"), true);
            }
            return ItemInteractionResult.CONSUME;
        }
        if (!level.isClientSide && level.getBlockEntity(pos) instanceof SoulBullSkullBlockEntity be) {
            stack.consume(1, player);
            be.addBone((ServerLevel) level, player);
        }
        return ItemInteractionResult.sidedSuccess(level.isClientSide);
    }

    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (state.getValue(LIT) && random.nextInt(3) == 0) {   // soul flames lick out of the eye sockets
            Direction f = state.getValue(FACING);
            double x = pos.getX() + 0.5 + f.getStepX() * 0.15, z = pos.getZ() + 0.5 + f.getStepZ() * 0.15;
            double side = random.nextBoolean() ? 0.22 : -0.22;
            x += f.getStepZ() * side;
            z -= f.getStepX() * side;
            level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, x, pos.getY() + 0.32, z, 0, 0.015, 0);
        }
    }
}
