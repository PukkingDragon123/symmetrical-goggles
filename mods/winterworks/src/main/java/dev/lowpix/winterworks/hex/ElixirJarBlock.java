package dev.lowpix.winterworks.hex;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
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
import net.minecraft.world.level.block.state.properties.DirectionProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * The Elixir Jar: brews elixirs over heat (docs/HEXES_UPDATE.md section 1).
 * Soul sand makes Soul Elixir; a Potion of Blood poured in and then a gold block make Elixir of Greed (docs/FIXES_0_4.md
 * "Blood in hexing"); soul sand in a full jar of Greed makes Cursed Elixir (3 doses each, 10 s of heat); an elixir bottle
 * takes one dose out. Drawn by client.hex.ElixirJarRenderer.
 */
public class ElixirJarBlock extends BaseEntityBlock {
    public static final MapCodec<ElixirJarBlock> CODEC = simpleCodec(ElixirJarBlock::new);
    public static final DirectionProperty FACING = HorizontalDirectionalBlock.FACING;
    private static final VoxelShape SHAPE = Block.box(4, 0, 4, 12, 12, 12);

    public ElixirJarBlock(Properties properties) {
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
        return new ElixirJarBlockEntity(pos, state);
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.ENTITYBLOCK_ANIMATED;   // drawn by ElixirJarRenderer
    }

    @Nullable
    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return level.isClientSide
                ? createTickerHelper(type, WWBlocks.ELIXIR_JAR_BE, ElixirJarBlockEntity::clientTick)
                : createTickerHelper(type, WWBlocks.ELIXIR_JAR_BE, ElixirJarBlockEntity::serverTick);
    }

    /** Heat under the jar: fire, soul fire, a lit campfire, lava (or a lava cauldron) or magma. */
    public static boolean hasHeat(Level level, BlockPos jar) {
        BlockState below = level.getBlockState(jar.below());
        return below.is(BlockTags.FIRE) || CampfireBlock.isLitCampfire(below) || below.is(Blocks.MAGMA_BLOCK)
                || below.is(Blocks.LAVA_CAULDRON) || below.getFluidState().is(FluidTags.LAVA);
    }

    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        boolean ingredient = stack.is(Items.SOUL_SAND) || stack.is(Items.GOLD_BLOCK);
        boolean bottle = stack.is(WWItems.ELIXIR_BOTTLE);
        boolean blood = stack.is(Items.POTION) && AmberFeature.isBloodPotion(stack);
        if (!ingredient && !bottle && !blood) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (!(level.getBlockEntity(pos) instanceof ElixirJarBlockEntity jar)) {
            return ItemInteractionResult.PASS_TO_DEFAULT_BLOCK_INTERACTION;
        }
        if (level.isClientSide) {
            return ItemInteractionResult.SUCCESS;
        }
        if (blood) {   // the blood goes in first: the gold block dissolves in it into the Elixir of Greed
            if (!jar.pourBlood()) {
                return refuse(player, jar.isBrewing() ? "brewing" : "full");
            }
            player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE)));
            level.playSound(null, pos, SoundEvents.BOTTLE_EMPTY, SoundSource.BLOCKS, 1f, 0.8f);
            level.playSound(null, pos, WWSounds.BLOOD_SPLASH, SoundSource.BLOCKS, 0.5f, 1.2f);
            return ItemInteractionResult.SUCCESS;
        }
        if (bottle) {
            ItemStack dose = jar.takeDose();
            if (dose.isEmpty()) {
                return refuse(player, jar.isBrewing() ? "brewing" : "empty");
            }
            player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, dose));
            level.playSound(null, pos, WWSounds.ELIXIR_JAR_FILL, SoundSource.BLOCKS, 0.9f, 0.9f + level.random.nextFloat() * 0.25f);
            level.playSound(null, pos, SoundEvents.BOTTLE_FILL, SoundSource.BLOCKS, 0.6f, 0.8f);
            return ItemInteractionResult.SUCCESS;
        }
        ElixirType brew = jar.brewFor(stack);
        if (brew == ElixirType.NONE) {
            return refuse(player, jar.isBrewing() ? "brewing" : stack.is(Items.GOLD_BLOCK) && jar.doses() == 0 ? "needs_blood" : "full");
        }
        if (!hasHeat(level, pos)) {
            level.playSound(null, pos, SoundEvents.FIRE_EXTINGUISH, SoundSource.BLOCKS, 0.4f, 1.6f);
            return refuse(player, "cold");
        }
        boolean gold = stack.is(Items.GOLD_BLOCK);
        stack.consume(1, player);
        jar.startBrew(brew);
        level.playSound(null, pos, WWSounds.ELIXIR_JAR_BUBBLE, SoundSource.BLOCKS, 1f, 0.8f);
        level.playSound(null, pos, gold ? SoundEvents.CHAIN_PLACE : SoundEvents.SOUL_SAND_PLACE, SoundSource.BLOCKS, 0.7f, 0.7f);
        return ItemInteractionResult.SUCCESS;
    }

    private static ItemInteractionResult refuse(Player player, String why) {
        player.displayClientMessage(Component.translatable("block.winterworks.elixir_jar." + why).withStyle(ChatFormatting.GRAY), true);
        return ItemInteractionResult.CONSUME;   // never place the ingredient by accident
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        if (!(level.getBlockEntity(pos) instanceof ElixirJarBlockEntity jar)) {
            return InteractionResult.PASS;
        }
        if (!level.isClientSide) {
            net.minecraft.network.chat.MutableComponent msg;
            if (jar.isBrewing()) {
                msg = Component.translatable("block.winterworks.elixir_jar.bubbling",
                        Component.translatable(jar.brewing().translationKey()), (int) (jar.brewFraction() * 100));
            } else if (jar.hasBlood()) {
                msg = Component.translatable(hasHeat(level, pos) ? "block.winterworks.elixir_jar.blood_hot" : "block.winterworks.elixir_jar.blood");
            } else if (jar.doses() > 0) {
                msg = Component.translatable("block.winterworks.elixir_jar.holds",
                        Component.translatable(jar.liquid().translationKey()), jar.doses(), ElixirJarBlockEntity.DOSES);
            } else {
                msg = Component.translatable(hasHeat(level, pos) ? "block.winterworks.elixir_jar.empty_hot"
                        : "block.winterworks.elixir_jar.empty");
            }
            player.displayClientMessage(msg.withStyle(ChatFormatting.GRAY), true);
        }
        return InteractionResult.sidedSuccess(level.isClientSide);
    }

    @Override
    protected boolean hasAnalogOutputSignal(BlockState state) {
        return true;
    }

    @Override
    protected int getAnalogOutputSignal(BlockState state, Level level, BlockPos pos) {
        return level.getBlockEntity(pos) instanceof ElixirJarBlockEntity jar ? jar.doses() * 5 : 0;
    }
}
