package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.golem.GolemFeature;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.BlockItemStateProperties;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import org.jetbrains.annotations.Nullable;

/**
 * Amber (docs/AMBER_UPDATE.md section 4, docs/FIXES_0_4.md): you can see what's trapped inside. It needs Silk Touch:
 * with it the block drops itself, inclusion and all (the item's {@code block_state} keeps it); without it (or blown up)
 * it shatters into 2-4 amber shards (loot table) and whatever was inside escapes ({@link #release}): a mosquito flies
 * out, a seed drops an Amberwood Bloom.
 *
 * <p>Placing the last amber block of a Pot Golem's T can build the golem too ({@link GolemFeature#onAmberPlaced}).
 */
public class AmberBlock extends HalfTransparentBlock implements EntityBlock {
    public enum Inclusion implements StringRepresentable {
        NONE, SEED, MOSQUITO,
        /** A Harvester Egg (docs/FIXES_0_4.md "The Harvester"): released by harvester.HarvesterFeature. */
        EGG;

        @Override
        public String getSerializedName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }

    /** What escapes when amber holding an inclusion is broken without Silk Touch. */
    @FunctionalInterface
    public interface Release {
        void release(ServerLevel level, BlockPos pos, BlockState state, RandomSource random);
    }

    public static final EnumProperty<Inclusion> INCLUSION = EnumProperty.create("inclusion", Inclusion.class);
    public static final MapCodec<AmberBlock> CODEC = simpleCodec(AmberBlock::new);
    /**
     * Who escapes from which inclusion. A new inclusion (the Harvester's egg, docs/FIXES_0_4.md) adds its enum constant
     * and registers its release here with {@link #onRelease}; the drops, the silk-touch item and the sound and glint
     * need nothing more.
     */
    private static final Map<Inclusion, Release> RELEASES = new EnumMap<>(Inclusion.class);

    static {
        onRelease(Inclusion.SEED, (level, pos, state, r) -> popResource(level, pos, new ItemStack(WWItems.AMBERWOOD_BLOOM)));
        onRelease(Inclusion.MOSQUITO, (level, pos, state, r) -> {
            MosquitoEntity m = WWEntities.MOSQUITO.create(level);
            if (m != null) {
                m.moveTo(pos.getX() + 0.5, pos.getY() + 0.3, pos.getZ() + 0.5, r.nextFloat() * 360f, 0f);
                m.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), MobSpawnType.TRIGGERED, null);
                m.released();
                level.addFreshEntity(m);
            }
        });
    }

    public AmberBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(INCLUSION, Inclusion.NONE));
    }

    /** Registers what escapes from amber with this inclusion (replacing any earlier release). */
    public static void onRelease(Inclusion inclusion, Release release) {
        RELEASES.put(inclusion, release);
    }

    @Override
    protected MapCodec<? extends HalfTransparentBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(INCLUSION);
    }

    public static boolean hasInclusion(BlockState state) {
        return state.getValue(INCLUSION) != Inclusion.NONE;
    }

    /** Only natural amber with something inside gets a block entity (it draws the inclusion in 3D). */
    @Nullable
    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return hasInclusion(state) ? new AmberInclusionBlockEntity(pos, state) : null;
    }

    /** Turned into plain amber in place: drop the inclusion's block entity (vanilla only does that for a new block). */
    @Override
    protected void onRemove(BlockState state, Level level, BlockPos pos, BlockState newState, boolean moved) {
        if (newState.is(this) && hasInclusion(state) && !hasInclusion(newState)) {
            level.removeBlockEntity(pos);
        }
        super.onRemove(state, level, pos, newState, moved);
    }

    /** Broken in survival, by an explosion or by a falling block: unless Silk Touch keeps it whole, the inclusion escapes. */
    @Override
    protected void spawnAfterBreak(BlockState state, ServerLevel level, BlockPos pos, ItemStack tool, boolean dropXp) {
        super.spawnAfterBreak(state, level, pos, tool, dropXp);
        if (!silkTouch(level, tool)) {
            release(level, pos, state);
        }
    }

    public static boolean silkTouch(Level level, ItemStack tool) {
        return !tool.isEmpty() && EnchantmentHelper.getItemEnchantmentLevel(
                level.registryAccess().lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SILK_TOUCH), tool) > 0;
    }

    /** Creative players get no drops, but the inclusion still escapes (their real game mode decides, not isCreative()). */
    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        boolean creative = player instanceof net.minecraft.server.level.ServerPlayer sp ? sp.gameMode.isCreative() : player.isCreative();
        if (level instanceof ServerLevel sl && creative) {
            release(sl, pos, state);
        }
        return super.playerWillDestroy(level, pos, state, player);
    }

    /** The inclusion escapes: a crack, a burst of glints, then whatever {@link #onRelease} registered for it. */
    public static void release(ServerLevel level, BlockPos pos, BlockState state) {
        if (!state.hasProperty(INCLUSION) || state.getValue(INCLUSION) == Inclusion.NONE) {
            return;
        }
        RandomSource r = level.random;
        level.playSound(null, pos, WWSounds.AMBER_RELEASE, SoundSource.BLOCKS, 1.0f, 0.9f + r.nextFloat() * 0.2f);
        level.sendParticles(WWParticles.AMBER_GLINT, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 16, 0.35, 0.35, 0.35, 0.04);
        Release out = RELEASES.get(state.getValue(INCLUSION));
        if (out != null) {
            out.release(level, pos, state, r);
        }
    }

    /** The last block of a Pot Golem's T may be amber (the pot already on top). */
    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        if (!level.isClientSide) {
            GolemFeature.onAmberPlaced(level, pos, placer);
        }
    }

    /** A silk-touched block names what is inside it. */
    @Override
    public void appendHoverText(ItemStack stack, Item.TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        BlockItemStateProperties props = stack.get(DataComponents.BLOCK_STATE);
        Inclusion inc = props == null ? null : props.get(INCLUSION);
        if (inc != null && inc != Inclusion.NONE) {
            lines.add(Component.translatable("block.winterworks.amber_block.inclusion." + inc.getSerializedName())
                    .withStyle(ChatFormatting.GOLD));
        }
    }

    /** A slow glint now and then, more for a trapped mosquito. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (random.nextInt(state.getValue(INCLUSION) == Inclusion.NONE ? 24 : 10) != 0) {
            return;
        }
        Direction d = Direction.getRandom(random);
        BlockPos side = pos.relative(d);
        if (level.getBlockState(side).isSolidRender(level, side)) {
            return;
        }
        double x = pos.getX() + 0.5 + d.getStepX() * 0.52 + (d.getStepX() == 0 ? (random.nextDouble() - 0.5) * 0.8 : 0);
        double y = pos.getY() + 0.5 + d.getStepY() * 0.52 + (d.getStepY() == 0 ? (random.nextDouble() - 0.5) * 0.8 : 0);
        double z = pos.getZ() + 0.5 + d.getStepZ() * 0.52 + (d.getStepZ() == 0 ? (random.nextDouble() - 0.5) * 0.8 : 0);
        level.addParticle(WWParticles.AMBER_GLINT, x, y, z, 0, 0.005, 0);
    }
}
