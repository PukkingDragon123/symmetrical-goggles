package dev.lowpix.winterworks.hex;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
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

/** The Soul Tank: stores souls like a battery (docs/HEXES_UPDATE.md section 2). Drawn by client.hex.SoulTankRenderer. */
public class SoulTankBlock extends BaseEntityBlock {
    public static final MapCodec<SoulTankBlock> CODEC = simpleCodec(SoulTankBlock::new);
    public static final DirectionProperty FACING = HorizontalDirectionalBlock.FACING;
    private static final VoxelShape SHAPE = Block.box(1, 0, 1, 15, 16, 15);

    public SoulTankBlock(Properties properties) {
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
        return new SoulTankBlockEntity(pos, state);
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.ENTITYBLOCK_ANIMATED;   // drawn by SoulTankRenderer
    }

    @Nullable
    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return level.isClientSide ? createTickerHelper(type, WWBlocks.SOUL_TANK_BE, SoulTankBlockEntity::clientTick) : null;
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        if (!stack.is(WWItems.SOUL_ELIXIR) || !(level.getBlockEntity(pos) instanceof SoulTankBlockEntity tank)) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (level.isClientSide) {
            return ItemInteractionResult.SUCCESS;
        }
        if (tank.room() <= 0) {
            player.displayClientMessage(Component.translatable("block.winterworks.soul_tank.full").withStyle(ChatFormatting.GRAY), true);
            return ItemInteractionResult.CONSUME;
        }
        tank.add(SoulTankBlockEntity.PER_ELIXIR);
        stack.consume(1, player);
        level.playSound(null, pos, WWSounds.SOUL_TANK_ABSORB, SoundSource.BLOCKS, 1f, 0.9f + level.random.nextFloat() * 0.2f);
        if (level instanceof ServerLevel server) {
            server.sendParticles(ParticleTypes.SOUL, pos.getX() + 0.5, pos.getY() + 0.9, pos.getZ() + 0.5, 12, 0.25, 0.2, 0.25, 0.03);
        }
        showSouls(player, tank);
        return ItemInteractionResult.SUCCESS;
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        if (!(level.getBlockEntity(pos) instanceof SoulTankBlockEntity tank)) {
            return InteractionResult.PASS;
        }
        if (!level.isClientSide) {
            showSouls(player, tank);
        }
        return InteractionResult.sidedSuccess(level.isClientSide);
    }

    private static void showSouls(Player player, SoulTankBlockEntity tank) {
        player.displayClientMessage(Component.translatable("block.winterworks.soul_tank.souls", tank.souls(),
                SoulTankBlockEntity.CAPACITY).withColor(0x7FE3F0), true);
    }

    @Override
    protected boolean hasAnalogOutputSignal(BlockState state) {
        return true;
    }

    @Override
    protected int getAnalogOutputSignal(BlockState state, Level level, BlockPos pos) {
        if (!(level.getBlockEntity(pos) instanceof SoulTankBlockEntity tank) || tank.souls() <= 0) {
            return 0;
        }
        return 1 + (int) (tank.fill() * 14f);
    }
}
