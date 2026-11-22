package dev.lowpix.winterworks.endmob;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.monster.Endermite;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * A Chorus Cocoon (docs/END_UPDATE.md section 2): hangs under a chorus stem, a chorus plant or End stone and grows
 * through `age` 0-3 on random ticks. Broken before it is mature, an angry Endermite jumps out at whoever broke it; a mature
 * one hatches an Enderfly, by itself (a random tick) or when broken. It drops 1-2 chorus fruit (loot table), itself with
 * silk touch: then whatever is inside stays inside.
 */
public class ChorusCocoonBlock extends Block {
    public static final MapCodec<ChorusCocoonBlock> CODEC = simpleCodec(ChorusCocoonBlock::new);
    public static final IntegerProperty AGE = BlockStateProperties.AGE_3;
    public static final int MATURE = 3;
    private static final VoxelShape[] SHAPES = {
            box(5.5, 9, 5.5, 10.5, 16, 10.5),
            box(4.5, 6, 4.5, 11.5, 16, 11.5),
            box(4, 3, 4, 12, 16, 12),
            box(3, 1, 3, 13, 16, 13)};

    /** Who is breaking which cocoon right now (playerWillDestroy runs just before the drops): the Endermite's target. */
    @Nullable
    private static Breaker breaker;

    private record Breaker(Level level, BlockPos pos, Player player, long time) {}

    public ChorusCocoonBlock(Properties p) {
        super(p);
        registerDefaultState(stateDefinition.any().setValue(AGE, 0));
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> b) {
        b.add(AGE);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPES[state.getValue(AGE)];
    }

    // ---------------------------------------------------------------------------------------------- hanging

    /** What a cocoon can hang from: chorus stems, chorus plants and flowers, End stone. */
    public static boolean canHangFrom(BlockState above) {
        return above.is(EndBlocks.CHORUS_STEM) || above.is(Blocks.CHORUS_PLANT) || above.is(Blocks.CHORUS_FLOWER)
                || above.is(Blocks.END_STONE);
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return canHangFrom(level.getBlockState(pos.above()));
    }

    @Nullable
    @Override
    public BlockState getStateForPlacement(BlockPlaceContext ctx) {
        BlockState s = defaultBlockState();
        return s.canSurvive(ctx.getLevel(), ctx.getClickedPos()) ? s : null;
    }

    @Override
    protected BlockState updateShape(BlockState state, Direction dir, BlockState neighbour, LevelAccessor level, BlockPos pos,
                                     BlockPos neighbourPos) {
        return dir == Direction.UP && !state.canSurvive(level, pos) ? Blocks.AIR.defaultBlockState()
                : super.updateShape(state, dir, neighbour, level, pos, neighbourPos);
    }

    // ---------------------------------------------------------------------------------------------- growing

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return true;
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource r) {
        int age = state.getValue(AGE);
        if (age < MATURE) {
            if (r.nextInt(2) == 0) {
                level.setBlock(pos, state.setValue(AGE, age + 1), Block.UPDATE_CLIENTS);
                if (age + 1 == MATURE) {
                    level.playSound(null, pos, EndSounds.COCOON_CRACK, SoundSource.BLOCKS, 0.8f, 0.9f + r.nextFloat() * 0.2f);
                }
            }
        } else if (r.nextInt(3) == 0) {
            hatch(level, pos, state);
        }
    }

    /** A mature cocoon splits open and an Enderfly flies out; the cocoon is gone (no drops: it's an empty husk). */
    public static void hatch(ServerLevel level, BlockPos pos, BlockState state) {
        level.removeBlock(pos, false);
        level.levelEvent(2001, pos, Block.getId(state));
        releaseEnderfly(level, pos);
    }

    private static void releaseEnderfly(ServerLevel level, BlockPos pos) {
        Enderfly fly = EndEntities.ENDERFLY.create(level);
        if (fly == null) {
            return;
        }
        fly.moveTo(pos.getX() + 0.5, pos.getY() + 0.1, pos.getZ() + 0.5, level.random.nextFloat() * 360f, 0f);
        fly.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), MobSpawnType.BREEDING, null);
        fly.setDeltaMovement(0, -0.05, 0);
        level.addFreshEntity(fly);
        level.playSound(null, pos, EndSounds.COCOON_HATCH, SoundSource.BLOCKS, 1.0f, 1.0f);
        level.sendParticles(ParticleTypes.PORTAL, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 24, 0.3, 0.4, 0.3, 0.4);
        level.gameEvent(fly, GameEvent.ENTITY_PLACE, pos);
    }

    private static void releaseEndermite(ServerLevel level, BlockPos pos, @Nullable Player target) {
        Endermite mite = net.minecraft.world.entity.EntityType.ENDERMITE.create(level);
        if (mite == null) {
            return;
        }
        mite.moveTo(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5, level.random.nextFloat() * 360f, 0f);
        mite.finalizeSpawn(level, level.getCurrentDifficultyAt(pos), MobSpawnType.TRIGGERED, null);
        if (target != null && EndMobFeature.isSurvivalLike(target)) {
            mite.setTarget(target);
            mite.setLastHurtByMob(target);
            double dx = target.getX() - mite.getX(), dz = target.getZ() - mite.getZ(), d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
            mite.setDeltaMovement(dx / d * 0.3, 0.25, dz / d * 0.3);   // it jumps out at you
        }
        level.addFreshEntity(mite);
        level.playSound(null, pos, EndSounds.COCOON_CRACK, SoundSource.BLOCKS, 1.0f, 1.3f);
        level.sendParticles(ParticleTypes.PORTAL, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 12, 0.3, 0.3, 0.3, 0.3);
    }

    // ---------------------------------------------------------------------------------------------- breaking

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        if (level instanceof ServerLevel server) {
            if (player.getAbilities().instabuild) {
                // creative: no drops follow, so the creature comes out right here
                if (!silkTouch(server, player.getMainHandItem())) {
                    release(server, pos, state, player);
                }
            } else {
                breaker = new Breaker(level, pos.immutable(), player, level.getGameTime());
            }
        }
        return super.playerWillDestroy(level, pos, state, player);
    }

    /** Every break that drops loot (players in survival, explosions, losing its support) comes through here. */
    @Override
    protected void spawnAfterBreak(BlockState state, ServerLevel level, BlockPos pos, ItemStack tool, boolean dropXp) {
        super.spawnAfterBreak(state, level, pos, tool, dropXp);
        Breaker b = breaker;
        breaker = null;
        if (silkTouch(level, tool)) {
            return;
        }
        Player who = b != null && b.level == level && b.pos.equals(pos) && b.time == level.getGameTime() ? b.player : null;
        release(level, pos, state, who);
    }

    private static void release(ServerLevel level, BlockPos pos, BlockState state, @Nullable Player breaker) {
        if (state.getValue(AGE) >= MATURE) {
            releaseEnderfly(level, pos);
        } else {
            releaseEndermite(level, pos, breaker);
        }
    }

    private static boolean silkTouch(ServerLevel level, ItemStack tool) {
        return !tool.isEmpty() && EnchantmentHelper.getItemEnchantmentLevel(
                level.registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(Enchantments.SILK_TOUCH), tool) > 0;
    }
}
