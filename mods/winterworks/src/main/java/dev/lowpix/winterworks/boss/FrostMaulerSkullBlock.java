package dev.lowpix.winterworks.boss;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.DirectionProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * The Frost Mauler's skull (docs/COLD_UPDATE.md section 8). Encase it in ancient ice on all six sides and use a
 * Nether Star on it (or on any of that ice): its eye lights, the ground shakes, and the Frost Mauler returns.
 * Powered by redstone (a rising edge) it roars and brings down the icicles and dripstone above it (docs/FIXES_0_4.md).
 */
public class FrostMaulerSkullBlock extends BaseEntityBlock {
    public static final MapCodec<FrostMaulerSkullBlock> CODEC = simpleCodec(FrostMaulerSkullBlock::new);
    public static final DirectionProperty FACING = HorizontalDirectionalBlock.FACING;
    private static final VoxelShape SHAPE = Block.box(2, 0, 2, 14, 10, 14);

    public FrostMaulerSkullBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH));
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(FACING);
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        return defaultBlockState().setValue(FACING, ctx.getHorizontalDirection().getOpposite());
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new FrostMaulerSkullBlockEntity(pos, state);
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.ENTITYBLOCK_ANIMATED;   // drawn by client.boss.FrostMaulerSkullRenderer
    }

    @Nullable
    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return createTickerHelper(type, WWBlocks.FROST_MAULER_SKULL_BE,
                level.isClientSide ? FrostMaulerSkullBlockEntity::clientTick : FrostMaulerSkullBlockEntity::serverTick);
    }

    /** Redstone: a rising edge of power makes it roar (see {@link FrostMaulerSkullBlockEntity#roar}). */
    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, BlockPos from, boolean moving) {
        super.neighborChanged(state, level, pos, block, from, moving);
        if (!level.isClientSide && level.getBlockEntity(pos) instanceof FrostMaulerSkullBlockEntity be) {
            be.updatePower(level.hasNeighborSignal(pos));
        }
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        if (!level.isClientSide && level.getBlockEntity(pos) instanceof FrostMaulerSkullBlockEntity be) {
            be.initPowered(level.hasNeighborSignal(pos));   // placed next to power that is already on: no roar
        }
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        if (stack.is(Items.NETHER_STAR)) {
            return tryRevive(level, pos, player, stack);
        }
        return super.useItemOn(stack, state, level, pos, player, hand, hit);
    }

    /** All six neighbours are ancient ice. */
    public static boolean isEncased(BlockGetter level, BlockPos skull) {
        for (Direction d : Direction.values()) {
            if (!level.getBlockState(skull.relative(d)).is(WWBlocks.ANCIENT_ICE)) {
                return false;
            }
        }
        return true;
    }

    /** A Nether Star offered to an (encased) skull: uses the star up and starts the revival. */
    public static ItemInteractionResult tryRevive(Level level, BlockPos skull, Player player, ItemStack star) {
        if (!(level.getBlockEntity(skull) instanceof FrostMaulerSkullBlockEntity be)) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (be.isLit()) {
            return ItemInteractionResult.CONSUME;   // already waking
        }
        if (!isEncased(level, skull)) {
            if (!level.isClientSide) {
                player.displayClientMessage(Component.translatable("message.winterworks.skull.encase"), true);
            }
            return ItemInteractionResult.CONSUME;
        }
        if (!level.isClientSide) {
            star.consume(1, player);
            be.ignite();
            level.playSound(null, skull, WWSounds.SKULL_IGNITE, SoundSource.HOSTILE, 2.0f, 0.8f);
            player.displayClientMessage(Component.translatable("message.winterworks.skull.ignite"), true);
        }
        return ItemInteractionResult.sidedSuccess(level.isClientSide);
    }
}
