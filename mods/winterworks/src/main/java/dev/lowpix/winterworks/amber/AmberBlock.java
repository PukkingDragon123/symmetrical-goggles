package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;

/**
 * Amber (docs/AMBER_UPDATE.md section 4): you can see what's trapped inside. Breaking a natural block with an inclusion
 * releases it: a seed (Amberwood seed, torchflower seeds or a pitcher pod) or a live mosquito. The block itself drops
 * as plain amber (inclusion none).
 */
public class AmberBlock extends HalfTransparentBlock {
    public enum Inclusion implements StringRepresentable {
        NONE, SEED, MOSQUITO;

        @Override
        public String getSerializedName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }

    public static final EnumProperty<Inclusion> INCLUSION = EnumProperty.create("inclusion", Inclusion.class);
    public static final MapCodec<AmberBlock> CODEC = simpleCodec(AmberBlock::new);

    public AmberBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(INCLUSION, Inclusion.NONE));
    }

    @Override
    protected MapCodec<? extends HalfTransparentBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(INCLUSION);
    }

    /** Broken in survival, by an explosion or by a falling block: the inclusion escapes. */
    @Override
    protected void spawnAfterBreak(BlockState state, ServerLevel level, BlockPos pos, ItemStack tool, boolean dropXp) {
        super.spawnAfterBreak(state, level, pos, tool, dropXp);
        release(level, pos, state);
    }

    /** Creative players get no drops, but the inclusion still escapes. */
    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        if (level instanceof ServerLevel sl && player.isCreative()) {
            release(sl, pos, state);
        }
        return super.playerWillDestroy(level, pos, state, player);
    }

    public static void release(ServerLevel level, BlockPos pos, BlockState state) {
        if (!state.hasProperty(INCLUSION) || state.getValue(INCLUSION) == Inclusion.NONE) {
            return;
        }
        RandomSource r = level.random;
        level.playSound(null, pos, WWSounds.AMBER_RELEASE, SoundSource.BLOCKS, 1.0f, 0.9f + r.nextFloat() * 0.2f);
        level.sendParticles(WWParticles.AMBER_GLINT, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 16, 0.35, 0.35, 0.35, 0.04);
        if (state.getValue(INCLUSION) == Inclusion.SEED) {
            int roll = r.nextInt(5);
            ItemStack seed = new ItemStack(roll < 3 ? WWItems.AMBERWOOD_SEED : roll == 3 ? Items.TORCHFLOWER_SEEDS : Items.PITCHER_POD);
            popResource(level, pos, seed);
            return;
        }
        MosquitoEntity m = WWEntities.MOSQUITO.create(level);
        if (m != null) {
            m.moveTo(pos.getX() + 0.5, pos.getY() + 0.3, pos.getZ() + 0.5, r.nextFloat() * 360f, 0f);
            m.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), MobSpawnType.TRIGGERED, null);
            m.released();
            level.addFreshEntity(m);
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
