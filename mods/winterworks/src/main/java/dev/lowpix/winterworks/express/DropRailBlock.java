package dev.lowpix.winterworks.express;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Drop Rail: a track section that can hang in mid-air. Power it and it springs open like a trapdoor: whatever cart
 * is on it drops to the track below (coaster drops, trap pits). It closes again when the power goes.
 */
public class DropRailBlock extends PoweredRailBlock {
    public static final MapCodec<PoweredRailBlock> CODEC = simpleCodec(DropRailBlock::new);

    public DropRailBlock(Properties props) {
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

    /** Suspended track: needs nothing underneath. */
    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return true;
    }

    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, BlockPos from, boolean moving) {
        if (!level.isClientSide && level.getBlockState(pos).is(this)) {
            updateState(state, level, pos, block);   // never pops off for lack of support
        }
    }

    @Override
    protected void updateState(BlockState state, Level level, BlockPos pos, Block block) {
        super.updateState(state, level, pos, block);
        BlockState now = level.getBlockState(pos);
        if (now.is(this) && now.getValue(POWERED)) {
            open(level, pos, now);
        }
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moving) {
        super.onPlace(state, level, pos, old, moving);
        if (!level.isClientSide && level.hasNeighborSignal(pos) && level.getBlockState(pos).is(this)) {
            open(level, pos, level.getBlockState(pos));
        }
    }

    static void open(Level level, BlockPos pos, BlockState rail) {
        RailShape shape = rail.getValue(SHAPE);
        boolean alongX = shape == RailShape.EAST_WEST || shape == RailShape.ASCENDING_EAST || shape == RailShape.ASCENDING_WEST;
        level.setBlock(pos, WWBlocks.DROP_RAIL_OPEN.defaultBlockState().setValue(DropRailOpenBlock.ALONG_X, alongX)
                .setValue(RailPaint.COLOR, rail.getValue(RailPaint.COLOR)), 3);
        level.playSound(null, pos, SoundEvents.IRON_TRAPDOOR_OPEN, SoundSource.BLOCKS, 1.0f, 0.8f);
        if (level instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.CLOUD, pos.getX() + 0.5, pos.getY() + 0.1, pos.getZ() + 0.5, 8, 0.3, 0.05, 0.3, 0.02);
        }
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        return RailPaint.use(stack, state, level, pos, player, hand);
    }
}
