package dev.lowpix.winterworks.boss;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.ItemInteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HalfTransparentBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Ancient ice (docs/COLD_UPDATE.md section 6): bitterly cold. Standing on it, walking into it or punching it gives
 * Frostbite; breaking it makes it burst and frostbite everything around, the breaker included. Only Silk Touch
 * keeps it whole (see its loot table). A Nether Star used on ice that encases a Frost Mauler skull starts the revival.
 */
public class AncientIceBlock extends HalfTransparentBlock {
    public static final MapCodec<AncientIceBlock> CODEC = simpleCodec(AncientIceBlock::new);
    /** Touching: Frostbite for 5 s. */
    public static final int TOUCH_TICKS = 100;
    /** Breaking: Frostbite II for 10 s within 3.5 blocks. */
    public static final double BURST_RADIUS = 3.5;
    public static final int BURST_SECONDS = 10, BURST_AMPLIFIER = 1;
    /**
     * The sides are a hair inside the block, so whatever walks into it overlaps its cell and gets {@link #entityInside}
     * (the honey block trick). The top stays flush so it is flat to walk (and slide) on.
     */
    private static final VoxelShape COLLISION = Block.box(0.5, 0, 0.5, 15.5, 16, 15.5);

    public AncientIceBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends HalfTransparentBlock> codec() {
        return CODEC;
    }

    @Override
    protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return COLLISION;
    }

    // --------------------------------------------------------------------------------------- touching

    /** Gives a touching entity Frostbite (topped up so it lasts while the contact lasts). */
    public static void chill(Level level, Entity entity) {
        if (level.isClientSide || !(entity instanceof LivingEntity le) || !le.isAlive() || le instanceof FrostMaulerEntity) {
            return;
        }
        if (le instanceof Player p && (p.isSpectator() || p.getAbilities().instabuild)) {
            return;
        }
        var cur = le.getEffect(dev.lowpix.winterworks.registry.WWEffects.FROSTBITE);
        if (cur == null || cur.getDuration() < TOUCH_TICKS - 20) {
            boolean had = cur != null;
            BossFeature.frostbite(le, TOUCH_TICKS, 0);
            if (!had && le.hasEffect(dev.lowpix.winterworks.registry.WWEffects.FROSTBITE) && level instanceof ServerLevel sl) {
                sl.sendParticles(ParticleTypes.SNOWFLAKE, le.getX(), le.getY() + le.getBbHeight() * 0.5, le.getZ(), 6,
                        le.getBbWidth() * 0.4, le.getBbHeight() * 0.3, le.getBbWidth() * 0.4, 0.02);
            }
        }
    }

    @Override
    public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
        chill(level, entity);
        super.stepOn(level, pos, state, entity);
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity) {
        chill(level, entity);
    }

    @Override
    protected void attack(BlockState state, Level level, BlockPos pos, Player player) {
        if (!level.isClientSide && !player.getAbilities().instabuild) {
            BossFeature.frostbite(player, TOUCH_TICKS, 0);
        }
    }

    // --------------------------------------------------------------------------------------- breaking

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        if (level instanceof ServerLevel sl) {
            burst(sl, pos, player);
        }
        return super.playerWillDestroy(level, pos, state, player);
    }

    @Override
    public void wasExploded(Level level, BlockPos pos, Explosion explosion) {
        if (level instanceof ServerLevel sl) {
            burst(sl, pos, null);
        }
    }

    /** The ice shatters: a frost burst that frostbites everything within 3.5 blocks (and the breaker, wherever they are). */
    public static void burst(ServerLevel level, BlockPos pos, Player breaker) {
        Vec3 c = Vec3.atCenterOf(pos);
        BossFeature.frostbiteBurst(level, c, BURST_RADIUS, BURST_SECONDS, BURST_AMPLIFIER, null);
        if (breaker != null && !breaker.getAbilities().instabuild && !breaker.isSpectator()) {
            BossFeature.frostbite(breaker, BURST_SECONDS * 20, BURST_AMPLIFIER);
        }
        BossFeature.iceBurstFx(level, c, (float) (BURST_RADIUS * 2), 24);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, WWBlocks.ANCIENT_ICE.defaultBlockState()), c.x, c.y, c.z,
                30, 0.4, 0.4, 0.4, 0.15);
        level.playSound(null, pos, WWSounds.ANCIENT_ICE_BURST, SoundSource.BLOCKS, 1.4f, 0.9f + level.random.nextFloat() * 0.2f);
    }

    // --------------------------------------------------------------------------------------- the revival

    /** A Nether Star used on ice around an encased Frost Mauler skull lights the skull. */
    @Override
    protected ItemInteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
                                              InteractionHand hand, BlockHitResult hit) {
        if (stack.is(Items.NETHER_STAR)) {
            for (Direction d : Direction.values()) {
                BlockPos s = pos.relative(d);
                if (level.getBlockState(s).is(WWBlocks.FROST_MAULER_SKULL)) {
                    return FrostMaulerSkullBlock.tryRevive(level, s, player, stack);
                }
            }
        }
        return super.useItemOn(stack, state, level, pos, player, hand, hit);
    }

    /** Faint cold mist curling off the ice. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        if (random.nextInt(14) == 0) {
            Direction d = Direction.getRandom(random);
            BlockPos n = pos.relative(d);
            if (!level.getBlockState(n).isSolidRender(level, n)) {
                double x = pos.getX() + 0.5 + d.getStepX() * 0.55 + (d.getStepX() == 0 ? random.nextDouble() - 0.5 : 0);
                double y = pos.getY() + 0.5 + d.getStepY() * 0.55 + (d.getStepY() == 0 ? random.nextDouble() - 0.5 : 0);
                double z = pos.getZ() + 0.5 + d.getStepZ() * 0.55 + (d.getStepZ() == 0 ? random.nextDouble() - 0.5 : 0);
                level.addParticle(random.nextInt(3) == 0 ? WWParticles.FROST_BREATH : ParticleTypes.SNOWFLAKE, x, y, z,
                        d.getStepX() * 0.01, -0.01, d.getStepZ() * 0.01);
            }
        }
    }
}
