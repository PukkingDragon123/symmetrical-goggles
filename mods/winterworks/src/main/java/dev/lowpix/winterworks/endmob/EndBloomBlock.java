package dev.lowpix.winterworks.endmob;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.end.Eclipse;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndItems;
import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ShearsItem;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.BushBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The End Bloom (docs/END_UPDATE.md sections 2 and 6): an End flower that is open only during an eclipse
 * ({@link Eclipse}). EndMobFeature schedules a tick for the blooms round every player when the eclipse comes or goes;
 * random ticks catch up the rest. Shearing an open bloom that has its bulb gives an End Bulb and leaves it bare; with no
 * eclipse on, the bulb grows back. Grows on End grass, End stone and End moss.
 */
public class EndBloomBlock extends BushBlock {
    public static final MapCodec<EndBloomBlock> CODEC = simpleCodec(EndBloomBlock::new);
    public static final BooleanProperty OPEN = BooleanProperty.create("open");
    public static final BooleanProperty BULB = BooleanProperty.create("bulb");
    private static final VoxelShape SHAPE = box(4, 0, 4, 12, 13, 12);

    public EndBloomBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(OPEN, false).setValue(BULB, true));
    }

    @Override
    protected MapCodec<? extends BushBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(OPEN, BULB);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        Vec3 off = state.getOffset(level, pos);
        return SHAPE.move(off.x, off.y, off.z);
    }

    @Override
    protected boolean mayPlaceOn(BlockState below, BlockGetter level, BlockPos pos) {
        return below.is(EndBlocks.END_GRASS_BLOCK) || below.is(Blocks.END_STONE) || below.is(EndBlocks.END_MOSS_BLOCK);
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        return defaultBlockState().setValue(OPEN, Eclipse.isActive(ctx.getLevel()));
    }

    // ------------------------------------------------------------------------------------------ following the eclipse

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return true;
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource r) {
        boolean eclipse = Eclipse.isActive(level);
        BlockState next = state.setValue(OPEN, eclipse);
        if (!eclipse && !state.getValue(BULB) && r.nextInt(3) == 0) {
            next = next.setValue(BULB, true);   // the bulb regrows while the sky is ordinary
        }
        apply(level, pos, state, next);
    }

    /** Scheduled by EndMobFeature when the eclipse changes: open or close now. */
    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource r) {
        apply(level, pos, state, state.setValue(OPEN, Eclipse.isActive(level)));
    }

    private static void apply(ServerLevel level, BlockPos pos, BlockState before, BlockState after) {
        if (after == before) {
            return;
        }
        level.setBlock(pos, after, Block.UPDATE_ALL);
        if (after.getValue(OPEN) && !before.getValue(OPEN)) {
            level.playSound(null, pos, EndSounds.BLOOM_OPEN, SoundSource.BLOCKS, 0.6f, 0.9f + level.random.nextFloat() * 0.25f);
        }
    }

    // ------------------------------------------------------------------------------------------ the bulb

    public static boolean isShears(ItemStack stack) {
        return stack.is(Items.SHEARS) || stack.getItem() instanceof ShearsItem;
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        if (!isShears(stack)) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (!state.getValue(OPEN) || !state.getValue(BULB)) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;   // closed, or already bare: nothing to cut
        }
        if (!level.isClientSide) {
            level.setBlock(pos, state.setValue(BULB, false), Block.UPDATE_ALL);
            popResource(level, pos, new ItemStack(EndItems.END_BULB));
            level.playSound(null, pos, SoundEvents.SHEEP_SHEAR, SoundSource.BLOCKS, 1.0f, 1.3f);
            stack.hurtAndBreak(1, player, LivingEntity.getSlotForHand(hand));
            level.gameEvent(player, GameEvent.SHEAR, pos);
        }
        return ItemInteractionResult.sidedSuccess(level.isClientSide);
    }
}
