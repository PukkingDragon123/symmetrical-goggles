package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanParticles;
import dev.lowpix.winterworks.registry.OceanSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * The vent's heat (docs/OCEAN_UPDATE.md section 2). Server: while a player is within {@link #ACTIVE} blocks, every
 * half second anything living in the water within {@link #RADIUS} blocks is poisoned (Poison I, kept topped up, so it
 * hurts at the normal Poison I rate), and every two seconds ice within that range melts. Client: a black-smoker plume of
 * vent_smoke from the mouth and the vent's rumbling loop.
 */
public class HydrothermalVentBlockEntity extends BlockEntity {
    /** The poisonous, hot water round a vent. */
    public static final double RADIUS = 4;
    /** Players this close wake a vent up. */
    public static final double ACTIVE = 32;
    private int age;
    private boolean awake;

    public HydrothermalVentBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.HYDROTHERMAL_VENT_BE, pos, state);
    }

    public static void serverTick(Level level, BlockPos pos, BlockState state, HydrothermalVentBlockEntity be) {
        int t = be.age++ + (int) (pos.asLong() & 15);
        if (t % 20 == 0) {
            be.awake = level.hasNearbyAlivePlayer(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, ACTIVE);
        }
        if (!be.awake) {
            return;
        }
        if (t % 10 == 0) {
            poison(level, pos);
        }
        if (t % 40 == 5) {
            melt(level, pos);
        }
    }

    /** Poisons everything living in the water within RADIUS of the vent. */
    public static int poison(Level level, BlockPos pos) {
        Vec3 c = Vec3.atCenterOf(pos);
        double rr = (RADIUS + 0.5) * (RADIUS + 0.5);
        int n = 0;
        for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, new AABB(pos).inflate(RADIUS + 1))) {
            if (e.isSpectator() || !e.isInWater() || e.getBoundingBox().getCenter().distanceToSqr(c) > rr) {
                continue;
            }
            MobEffectInstance cur = e.getEffect(MobEffects.POISON);
            if (cur == null || cur.getAmplifier() == 0 && cur.getDuration() < 40) {
                e.addEffect(new MobEffectInstance(MobEffects.POISON, 80, 0, false, true, true));
                n++;
            }
        }
        return n;
    }

    /** Hot water: no ice within RADIUS. */
    public static int melt(Level level, BlockPos pos) {
        int r = (int) RADIUS, n = 0;
        boolean ice = false;
        for (int sx = SectionPos.blockToSectionCoord(pos.getX() - r); sx <= SectionPos.blockToSectionCoord(pos.getX() + r) && !ice; sx++) {
            for (int sz = SectionPos.blockToSectionCoord(pos.getZ() - r); sz <= SectionPos.blockToSectionCoord(pos.getZ() + r) && !ice; sz++) {
                if (!(level.getChunk(sx, sz) instanceof LevelChunk chunk)) {
                    continue;
                }
                for (int sy = SectionPos.blockToSectionCoord(pos.getY() - r); sy <= SectionPos.blockToSectionCoord(pos.getY() + r) && !ice; sy++) {
                    int i = level.getSectionIndexFromSectionY(sy);
                    ice = i >= 0 && i < chunk.getSectionsCount() && chunk.getSection(i).maybeHas(s -> s.is(BlockTags.ICE));
                }
            }
        }
        if (!ice) {
            return 0;
        }
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        for (int dx = -r; dx <= r; dx++) {
            for (int dy = -r; dy <= r; dy++) {
                for (int dz = -r; dz <= r; dz++) {
                    if (dx * dx + dy * dy + dz * dz > (r + 0.5) * (r + 0.5)) {
                        continue;
                    }
                    m.set(pos.getX() + dx, pos.getY() + dy, pos.getZ() + dz);
                    if (level.getBlockState(m).is(BlockTags.ICE)) {
                        level.setBlockAndUpdate(m, Blocks.WATER.defaultBlockState());
                        n++;
                    }
                }
            }
        }
        return n;
    }

    public static void clientTick(Level level, BlockPos pos, BlockState state, HydrothermalVentBlockEntity be) {
        RandomSource r = level.random;
        int t = be.age++;
        boolean wet = level.getFluidState(pos.above()).is(FluidTags.WATER);
        if (!level.getBlockState(pos.above()).isAir() && !wet) {
            return;   // capped
        }
        if (r.nextInt(3) != 0) {
            double x = pos.getX() + 0.5 + (r.nextDouble() - 0.5) * 0.25, z = pos.getZ() + 0.5 + (r.nextDouble() - 0.5) * 0.25;
            level.addParticle(OceanParticles.VENT_SMOKE, x, pos.getY() + 0.98, z, (r.nextDouble() - 0.5) * 0.01,
                    0.045 + r.nextDouble() * 0.035, (r.nextDouble() - 0.5) * 0.01);
        }
        if (wet && r.nextInt(5) == 0) {
            level.addParticle(net.minecraft.core.particles.ParticleTypes.BUBBLE, pos.getX() + 0.5 + (r.nextDouble() - 0.5) * 0.4,
                    pos.getY() + 1.0, pos.getZ() + 0.5 + (r.nextDouble() - 0.5) * 0.4, 0, 0.06, 0);
        }
        if ((t + (int) (pos.asLong() & 127)) % 160 == 0) {
            level.playLocalSound(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, OceanSounds.VENT_LOOP, SoundSource.BLOCKS,
                    0.6f, 0.9f + r.nextFloat() * 0.2f, false);
        }
    }
}
