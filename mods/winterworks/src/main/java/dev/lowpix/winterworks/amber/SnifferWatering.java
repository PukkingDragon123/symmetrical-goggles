package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.ai.Brain;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.FarmBlock;
import net.minecraft.world.level.block.PitcherCropBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Sniffers water crops (docs/FIXES_0_4.md "Torchflowers, pitcher plants, mosquitoes and sniffers"): about once a
 * minute a tamed sniffer with water within {@link #WATER_RADIUS} blocks and thirsty farmland near its owner walks to the
 * water, drinks, walks to the farmland and sneezes a spray over it: farmland within {@link #SPRAY_RADIUS} blocks
 * becomes fully moist and the crops on it get a growth tick. Driven from amber.SnifferTaming#tick (between digs, before
 * following); the sneeze animation is client.harvester.SnifferSneezeAnimation.
 */
public final class SnifferWatering {
    public static final int INTERVAL = 1200, INTERVAL_SPREAD = 400, WATER_RADIUS = 12, FARM_RANGE = 12, SPRAY_RADIUS = 3;
    public static final int DRINK_TICKS = 50, SNEEZE_TICKS = 40, ACHOO_AT = 21, WALK_LIMIT = 500;
    /** After an errand that couldn't reach its water, or a look round that found no water or farmland, it tries again
     * this soon (not a whole interval later). */
    public static final int RETRY = 200;
    /** Entity event: the sneeze starts (the client plays the animation; the spray comes {@link #ACHOO_AT} ticks later). */
    public static final byte EVENT_SNEEZE = 93;

    public enum Phase { IDLE, TO_WATER, DRINK, TO_FARM, SNEEZE }

    /** Per-sniffer watering state (not saved: an interrupted errand starts over). */
    public static final class Job {
        public int cooldown = 600;
        public Phase phase = Phase.IDLE;
        @Nullable
        public BlockPos water, farm;
        int ticks, repaths, lastTick;

        public boolean busy() {
            return phase != Phase.IDLE;
        }
    }

    private SnifferWatering() {}

    /** Server AI step for a tamed sniffer; true while it is on a watering errand (vanilla's brain is paused). */
    public static boolean tick(ServerLevel level, Sniffer s, TamedSniffer t, @Nullable Player owner) {
        Job j = ((WateringSniffer) s).ww$watering();
        if (s.isBaby()) {
            return false;
        }
        boolean resumed = j.busy() && s.tickCount - j.lastTick > 1;   // vanilla ran in between (it was led, hit...)
        j.lastTick = s.tickCount;
        if (j.phase == Phase.IDLE) {
            if (--j.cooldown > 0) {
                return false;
            }
            j.cooldown = INTERVAL + s.getRandom().nextInt(INTERVAL_SPREAD);
            if (t.ww$state() != Sniffer.State.IDLING || !s.onGround()) {
                j.cooldown = 100;
                return false;
            }
            BlockPos farm = findFarm(level, s, owner);
            BlockPos water = farm == null ? null : findWater(level, s);
            if (farm == null || water == null) {
                j.cooldown = RETRY;   // nothing in reach from here: look again soon (it wanders)
                return false;
            }
            start(level, s, t, j, water, farm);
            return true;
        }
        if (resumed) {
            takeOver(level, s, t);
            if (j.phase == Phase.TO_WATER) {
                walk(s, j.water);
            } else if (j.phase == Phase.TO_FARM) {
                walk(s, j.farm);
            }
        }
        run(level, s, t, j);
        return true;
    }

    /** Sends it off: to the water, then to the farmland. */
    public static void start(ServerLevel level, Sniffer s, TamedSniffer t, Job j, BlockPos water, BlockPos farm) {
        takeOver(level, s, t);
        j.water = water;
        j.farm = farm;
        j.phase = Phase.TO_WATER;
        j.ticks = 0;
        j.repaths = 0;
        j.lastTick = s.tickCount;
        walk(s, water);
    }

    /** Skips straight to the sneeze over `farm` (the screenshot harness). */
    public static void sneezeAt(ServerLevel level, Sniffer s, BlockPos farm) {
        Job j = ((WateringSniffer) s).ww$watering();
        takeOver(level, s, (TamedSniffer) s);
        j.farm = farm;
        j.phase = Phase.SNEEZE;
        j.ticks = 0;
        j.lastTick = s.tickCount;
    }

    private static void run(ServerLevel level, Sniffer s, TamedSniffer t, Job j) {
        j.ticks++;
        switch (j.phase) {
            case TO_WATER -> {
                if (!level.getFluidState(j.water).is(FluidTags.WATER)) {
                    stop(s, t, j);
                    return;
                }
                if (near(s, j.water, 3.3)) {
                    s.getNavigation().stop();
                    j.phase = Phase.DRINK;
                    j.ticks = 0;
                    s.transitionTo(Sniffer.State.SNIFFING);   // nose down to the water
                } else if (j.ticks > WALK_LIMIT || j.repaths > 10) {
                    stop(s, t, j);
                    j.cooldown = Math.min(j.cooldown, RETRY);   // blocked on the way: try again soon
                } else if (s.getNavigation().isDone()) {
                    j.repaths++;
                    walk(s, j.water);
                }
            }
            case DRINK -> {
                face(s, j.water, 15f);
                s.getLookControl().setLookAt(Vec3.atCenterOf(j.water));
                if (j.ticks % 12 == 6) {
                    s.playSound(SoundEvents.GENERIC_DRINK, 1.0f, 0.55f + s.getRandom().nextFloat() * 0.1f);
                    Vec3 w = Vec3.atCenterOf(j.water).add(0, 0.45, 0);
                    level.sendParticles(ParticleTypes.SPLASH, w.x, w.y, w.z, 10, 0.3, 0.05, 0.3, 0.05);
                }
                if (j.ticks == 20 && t.ww$state() != Sniffer.State.IDLING) {
                    s.transitionTo(Sniffer.State.IDLING);
                }
                if (j.ticks >= DRINK_TICKS) {
                    j.phase = Phase.TO_FARM;
                    j.ticks = 0;
                    j.repaths = 0;
                    walk(s, j.farm);
                }
            }
            case TO_FARM -> {
                if (near(s, j.farm, 3.2)) {
                    s.getNavigation().stop();
                    j.phase = Phase.SNEEZE;
                    j.ticks = 0;
                } else if (j.ticks > WALK_LIMIT || j.repaths > 10) {
                    j.phase = Phase.SNEEZE;   // can't get closer: sneeze from here (it carries the water a long way)
                    j.ticks = 0;
                } else if (s.getNavigation().isDone()) {
                    j.repaths++;
                    walk(s, j.farm);
                }
            }
            case SNEEZE -> {
                face(s, j.farm, 20f);
                if (j.ticks == 1) {
                    level.broadcastEntityEvent(s, EVENT_SNEEZE);
                    s.playSound(SoundEvents.SNIFFER_SNIFFING, 1.0f, 1.4f);   // the big breath in
                }
                if (j.ticks == ACHOO_AT) {
                    achoo(level, s, j.farm);
                }
                if (j.ticks >= SNEEZE_TICKS) {
                    stop(s, t, j);
                    s.getBrain().setMemory(MemoryModuleType.SNIFFER_HAPPY, true);
                }
            }
            default -> stop(s, t, j);
        }
    }

    /** The sneeze: a spray from its nose over the farmland, which gets fully moist; its crops get a growth tick. */
    public static int achoo(ServerLevel level, Sniffer s, BlockPos farm) {
        Vec3 f = Vec3.directionFromRotation(0f, s.getYRot());
        Vec3 nose = s.position().add(f.scale(2.0 * s.getScale())).add(0, 1.0 * s.getScale(), 0);
        Vec3 c = Vec3.atBottomCenterOf(farm).add(0, 1.0, 0);
        s.playSound(WWSounds.SNIFFER_SNEEZE, 1.6f, 0.95f + s.getRandom().nextFloat() * 0.1f);
        level.playSound(null, farm, SoundEvents.GENERIC_SPLASH, SoundSource.NEUTRAL, 0.6f, 1.3f);
        level.sendParticles(ParticleTypes.SNEEZE, nose.x, nose.y, nose.z, 10, 0.2, 0.15, 0.2, 0.08);
        level.sendParticles(ParticleTypes.CLOUD, nose.x, nose.y, nose.z, 8, 0.2, 0.12, 0.2, 0.05);   // the misty spray
        for (int i = 1; i <= 10; i++) {   // the spray arcs from the nose onto the field
            double k = i / 10.0;
            Vec3 p = nose.lerp(c, k).add(0, Math.sin(k * Math.PI) * 0.8, 0);
            level.sendParticles(ParticleTypes.SPLASH, p.x, p.y, p.z, 10, 0.25, 0.12, 0.25, 0.15);
        }
        level.sendParticles(ParticleTypes.FALLING_WATER, c.x, c.y + 1.2, c.z, 90, SPRAY_RADIUS * 0.6, 0.25, SPRAY_RADIUS * 0.6, 0.0);
        level.sendParticles(ParticleTypes.SPLASH, c.x, c.y + 0.1, c.z, 70, SPRAY_RADIUS * 0.6, 0.05, SPRAY_RADIUS * 0.6, 0.1);
        return water(level, farm);
    }

    /** Wets the farmland within {@link #SPRAY_RADIUS} of `farm` and gives its crops a growth tick. Returns the farmland count. */
    public static int water(ServerLevel level, BlockPos farm) {
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(farm.offset(-SPRAY_RADIUS, -1, -SPRAY_RADIUS), farm.offset(SPRAY_RADIUS, 1, SPRAY_RADIUS))) {
            int dx = p.getX() - farm.getX(), dz = p.getZ() - farm.getZ();
            if (dx * dx + dz * dz > SPRAY_RADIUS * SPRAY_RADIUS + 1) {
                continue;
            }
            BlockState soil = level.getBlockState(p);
            if (!soil.is(Blocks.FARMLAND)) {
                continue;
            }
            n++;
            if (soil.getValue(FarmBlock.MOISTURE) < FarmBlock.MAX_MOISTURE) {
                level.setBlock(p, soil.setValue(FarmBlock.MOISTURE, FarmBlock.MAX_MOISTURE), Block.UPDATE_CLIENTS);
            }
            grow(level, p.above());
        }
        return n;
    }

    /** One growth step for the crop at `pos`, if it has one to take. */
    private static void grow(ServerLevel level, BlockPos pos) {
        BlockState s = level.getBlockState(pos);
        if (s.getBlock() instanceof CropBlock crop) {
            if (!crop.isMaxAge(s)) {
                level.setBlock(pos, crop.getStateForAge(crop.getAge(s) + 1), Block.UPDATE_CLIENTS);
                level.levelEvent(1505, pos, 3);   // a few green sparkles, like bone meal
            }
        } else if (s.getBlock() instanceof PitcherCropBlock pitcher) {
            if (s.getValue(PitcherCropBlock.HALF) == DoubleBlockHalf.LOWER && pitcher.isValidBonemealTarget(level, pos, s)) {
                pitcher.performBonemeal(level, level.random, pos, s);   // a pitcher crop grows one stage per bone meal
                level.levelEvent(1505, pos, 3);
            }
        } else if (s.is(BlockTags.CROPS) || s.is(BlockTags.BEE_GROWABLES)) {
            s.randomTick(level, pos, level.random);   // stems, berries: a real growth tick
        }
    }

    // --------------------------------------------------------------------------------------- finding things

    /** Thirsty farmland (dry, or with a crop still growing) near its owner (or itself), nearest the owner first. */
    @Nullable
    public static BlockPos findFarm(ServerLevel level, Sniffer s, @Nullable Player owner) {
        BlockPos c = owner != null && owner.distanceToSqr(s) < 32 * 32 ? owner.blockPosition() : s.blockPosition();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-FARM_RANGE, -3, -FARM_RANGE), c.offset(FARM_RANGE, 3, FARM_RANGE))) {
            BlockState soil = level.getBlockState(p);
            if (!soil.is(Blocks.FARMLAND)) {
                continue;
            }
            BlockState crop = level.getBlockState(p.above());
            boolean growing = crop.getBlock() instanceof CropBlock cb ? !cb.isMaxAge(crop)
                    : crop.is(BlockTags.CROPS) || crop.is(Blocks.PITCHER_CROP);
            if (soil.getValue(FarmBlock.MOISTURE) >= FarmBlock.MAX_MOISTURE && !growing) {
                continue;
            }
            double d = p.distSqr(c);
            if (d < bestD) {
                bestD = d;
                best = p.immutable();
            }
        }
        return best;
    }

    /** The nearest open water (a water source with nothing solid on it) within {@link #WATER_RADIUS}. */
    @Nullable
    public static BlockPos findWater(ServerLevel level, Sniffer s) {
        BlockPos c = s.blockPosition();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-WATER_RADIUS, -4, -WATER_RADIUS), c.offset(WATER_RADIUS, 3, WATER_RADIUS))) {
            if (!level.getFluidState(p).isSourceOfType(net.minecraft.world.level.material.Fluids.WATER)
                    || !level.getBlockState(p.above()).getCollisionShape(level, p.above()).isEmpty()
                    || level.getFluidState(p.above()).is(FluidTags.WATER)) {
                continue;
            }
            double d = p.distSqr(c);
            if (d < bestD) {
                bestD = d;
                best = p.immutable();
            }
        }
        return best;
    }

    // --------------------------------------------------------------------------------------- moving

    private static boolean near(Sniffer s, BlockPos p, double reach) {
        double dx = p.getX() + 0.5 - s.getX(), dz = p.getZ() + 0.5 - s.getZ();
        return dx * dx + dz * dz <= reach * reach && Math.abs(p.getY() + 1 - s.getY()) < 2.5;
    }

    private static void walk(Sniffer s, BlockPos to) {
        s.getNavigation().moveTo(to.getX() + 0.5, to.getY() + 1, to.getZ() + 0.5, 1.6);
    }

    private static void face(Sniffer s, BlockPos target, float step) {
        double dx = target.getX() + 0.5 - s.getX(), dz = target.getZ() + 0.5 - s.getZ();
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float r = Mth.approachDegrees(s.getYRot(), yaw, step);
        s.setYRot(r);
        s.setYHeadRot(r);
        s.setYBodyRot(r);
    }

    /** Pause vanilla's brain (as amber.SnifferTaming does for digs). */
    private static void takeOver(ServerLevel level, Sniffer s, TamedSniffer t) {
        Brain<Sniffer> b = s.getBrain();
        b.stopAll(level, s);
        b.eraseMemory(MemoryModuleType.WALK_TARGET);
        b.eraseMemory(MemoryModuleType.LOOK_TARGET);
        b.eraseMemory(MemoryModuleType.PATH);
        b.eraseMemory(MemoryModuleType.SNIFFER_SNIFFING_TARGET);
        b.eraseMemory(MemoryModuleType.SNIFFER_DIGGING);
        s.getNavigation().stop();
        if (t.ww$state() != Sniffer.State.IDLING) {
            s.transitionTo(Sniffer.State.IDLING);
        }
    }

    public static void stop(Sniffer s, TamedSniffer t, Job j) {
        j.phase = Phase.IDLE;
        j.water = null;
        j.farm = null;
        j.ticks = 0;
        s.getNavigation().stop();
        if (t.ww$state() != Sniffer.State.IDLING) {
            s.transitionTo(Sniffer.State.IDLING);
        }
    }
}
