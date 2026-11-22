package dev.lowpix.winterworks.bear;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.BiomeTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Polar bears fish. Now and then an idle adult with open water within 12 blocks walks to the water's edge (or swims out
 * if there is no edge to stand on), watches the water, and swipes at it (the `swipe` clip) or dives, with a splash. A
 * catch comes up in its mouth (cod or salmon, drawn at the mouth_item bone); then it either eats it (the `eat` clip,
 * munching) or carries it around. Its cubs tag along (they follow their mother). Hunting, a tempting player or food on
 * the ground interrupt it.
 */
public class BearFishGoal extends Goal {
    public static final int RANGE = 12, CHANCE = 700, TRIES = 3;
    public static final float SWIPE_CATCH = 0.45f, DIVE_CATCH = 0.6f;
    private static final int WALK = 0, WATCH = 1, SWIPE = 2, DIVE = 3, CAUGHT = 4, DONE = 5;
    private static final int DIVE_TICKS = 22;
    /** Within this many blocks it walks straight to the spot (a wide bear often can't path onto a narrow bank). */
    private static final double APPROACH = 4.0;

    private final PathfinderMob mob;
    private final RemadePolarBear bear;
    @Nullable
    private BlockPos water, stand;
    private boolean swim, forced, eatIt;
    private int phase = DONE, timer, tries;

    public BearFishGoal(PathfinderMob mob) {
        this.mob = mob;
        this.bear = (RemadePolarBear) mob;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        if (mob.isBaby() || mob.isPassenger() || mob.isVehicle() || mob.getTarget() != null || !bear.ww$carried().isEmpty()
                || bear.ww$isSitting()) {
            return false;
        }
        boolean force = bear.ww$takeFishingRequest();
        if (!force && mob.getRandom().nextInt(reducedTickDelay(CHANCE)) != 0) {
            return false;
        }
        forced = force;
        return findSpot();
    }

    @Override
    public boolean canContinueToUse() {
        return phase != DONE && mob.isAlive() && mob.getTarget() == null && !mob.isPassenger()
                && (phase == CAUGHT || bear.ww$carried().isEmpty());
    }

    @Override
    public boolean requiresUpdateEveryTick() {
        return true;
    }

    @Override
    public void start() {
        phase = WALK;
        timer = 300;
        tries = 0;
        eatIt = !forced && mob.getRandom().nextBoolean();
        if (swim && mob.isInWater()) {
            startDive();
        } else {
            walk();
        }
    }

    @Override
    public void stop() {
        mob.getNavigation().stop();
        if (forced && phase < CAUGHT) {
            bear.ww$goFishing();   // interrupted before the catch: try again at the next chance
        }
        phase = DONE;
        water = stand = null;
        forced = false;
    }

    // ------------------------------------------------------------------------------------------ finding a spot

    /** Nearest open water within RANGE, preferring one with ground beside it to stand on. */
    private boolean findSpot() {
        Level level = mob.level();
        BlockPos at = mob.blockPosition();
        BlockPos edgeWater = null, edge = null, nearest = null;
        double edgeD = Double.MAX_VALUE, nearestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(at.offset(-RANGE, -4, -RANGE), at.offset(RANGE, 3, RANGE))) {
            if (!level.getFluidState(p).is(FluidTags.WATER) || !level.getBlockState(p.above()).isAir()) {
                continue;   // only the open surface: not under ice or deep down
            }
            double dw = p.distSqr(at);
            if (dw < nearestD) {
                nearestD = dw;
                nearest = p.immutable();
            }
            for (Direction dir : Direction.Plane.HORIZONTAL) {
                BlockPos s = standOn(level, p.relative(dir));
                if (s != null && s.distSqr(at) < edgeD) {
                    edgeD = s.distSqr(at);
                    edge = s;
                    edgeWater = p.immutable();
                }
            }
        }
        if (edge != null) {
            water = edgeWater;
            stand = edge;
            swim = false;
            return true;
        }
        water = nearest;
        stand = null;
        swim = nearest != null;
        return swim;
    }

    /** Where a bear can stand on the bank at `n` (beside the water), or null. */
    @Nullable
    private static BlockPos standOn(Level level, BlockPos n) {
        BlockState s = level.getBlockState(n);
        if (s.getFluidState().isEmpty() && s.isFaceSturdy(level, n, Direction.UP) && free(level, n.above()) && free(level, n.above(2))) {
            return n.above();   // level with the water: stand on top of it
        }
        BlockPos below = n.below();
        if (free(level, n) && free(level, n.above()) && level.getFluidState(below).isEmpty()
                && level.getBlockState(below).isFaceSturdy(level, below, Direction.UP)) {
            return n;   // a low bank
        }
        return null;
    }

    private static boolean free(Level level, BlockPos p) {
        BlockState s = level.getBlockState(p);
        return s.getCollisionShape(level, p).isEmpty() && s.getFluidState().isEmpty();
    }

    // ------------------------------------------------------------------------------------------ fishing

    @Nullable
    private BlockPos goal() {
        return swim ? water : stand;
    }

    private double distSqrTo(BlockPos p) {
        return mob.distanceToSqr(Vec3.atBottomCenterOf(p));
    }

    /** Paths to (near) the spot; close by, it walks straight in. */
    private void walk() {
        BlockPos goal = goal();
        if (goal == null) {
            phase = DONE;
            return;
        }
        Path path = mob.getNavigation().createPath(goal, 1);
        if (path != null) {
            mob.getNavigation().moveTo(path, 1.0);
        } else if (distSqrTo(goal) < APPROACH * APPROACH) {
            straightIn(goal);
        } else {
            phase = DONE;
        }
    }

    private void straightIn(BlockPos goal) {
        mob.getMoveControl().setWantedPosition(goal.getX() + 0.5, goal.getY(), goal.getZ() + 0.5, 0.8);
    }

    @Override
    public void tick() {
        switch (phase) {
            case WALK -> {
                if (swim && mob.isInWater()) {
                    startDive();
                } else if (!swim && stand != null && distSqrTo(stand) < 1.2 * 1.2) {
                    mob.getNavigation().stop();
                    phase = WATCH;
                    timer = 25 + mob.getRandom().nextInt(30);
                } else if (--timer <= 0) {
                    // couldn't get right there: fish from where it got to if that's close, else give up
                    phase = !swim && stand != null && distSqrTo(stand) < 2.5 * 2.5 ? WATCH : DONE;
                    timer = 25;
                } else if (mob.getNavigation().isDone()) {
                    BlockPos goal = goal();
                    if (goal != null && distSqrTo(goal) < APPROACH * APPROACH) {
                        straightIn(goal);
                        timer = Math.min(timer, 80);   // the last steps shouldn't take long
                    } else if (timer % 10 == 0) {
                        walk();
                    }
                }
            }
            case WATCH -> {   // stares at the water, very still
                faceWater();
                if (--timer <= 0) {
                    phase = SWIPE;
                    timer = BearSwipeGoal.WINDUP;
                    mob.level().broadcastEntityEvent(mob, BearState.EV_SWIPE);
                }
            }
            case SWIPE -> {
                faceWater();
                if (--timer <= 0) {
                    splash(water, 20);
                    if (forced || mob.getRandom().nextFloat() < SWIPE_CATCH) {
                        caught();
                    } else if (++tries < TRIES) {
                        phase = WATCH;
                        timer = 30 + mob.getRandom().nextInt(40);
                    } else {
                        phase = DONE;
                    }
                }
            }
            case DIVE -> {
                if (timer > DIVE_TICKS - 8) {   // head under
                    Vec3 v = mob.getDeltaMovement();
                    mob.setDeltaMovement(v.x * 0.5, Math.min(v.y, -0.12), v.z * 0.5);
                }
                if (timer % 4 == 0 && mob.level() instanceof ServerLevel sl) {
                    sl.sendParticles(ParticleTypes.BUBBLE, mob.getX(), mob.getY() + 0.5, mob.getZ(), 6, 0.5, 0.3, 0.5, 0.05);
                }
                if (--timer <= 0) {
                    splash(mob.blockPosition(), 26);
                    if (forced || mob.getRandom().nextFloat() < DIVE_CATCH) {
                        caught();
                    } else {
                        phase = DONE;
                    }
                }
            }
            case CAUGHT -> {   // shows off the catch, then eats it or keeps it
                if (--timer <= 0) {
                    if (eatIt) {
                        bear.ww$eatCarried();
                    }
                    phase = DONE;
                }
            }
            default -> {
            }
        }
    }

    private void startDive() {
        phase = DIVE;
        timer = DIVE_TICKS;
        mob.getNavigation().stop();
        splash(mob.blockPosition(), 16);
    }

    private void faceWater() {
        if (water == null) {
            return;
        }
        double x = water.getX() + 0.5, z = water.getZ() + 0.5;
        mob.getLookControl().setLookAt(x, water.getY() + 0.8, z, 30f, 40f);
        float yaw = (float) (Mth.atan2(z - mob.getZ(), x - mob.getX()) * Mth.RAD_TO_DEG) - 90f;
        mob.setYRot(Mth.approachDegrees(mob.getYRot(), yaw, 10f));
        mob.yBodyRot = mob.getYRot();
        mob.setDeltaMovement(mob.getDeltaMovement().multiply(0.5, 1.0, 0.5));
    }

    private void splash(@Nullable BlockPos at, int count) {
        if (at == null || !(mob.level() instanceof ServerLevel sl)) {
            return;
        }
        double x = at.getX() + 0.5, y = at.getY() + 1.0, z = at.getZ() + 0.5;
        sl.sendParticles(ParticleTypes.SPLASH, x, y, z, count, 0.4, 0.1, 0.4, 0.25);
        sl.sendParticles(ParticleTypes.BUBBLE, x, y - 0.4, z, count / 3, 0.3, 0.2, 0.3, 0.05);
        sl.playSound(null, x, y, z, SoundEvents.GENERIC_SPLASH, mob.getSoundSource(), 0.8f, 0.9f + mob.getRandom().nextFloat() * 0.3f);
    }

    private void caught() {
        Item fish = pickFish();
        bear.ww$setCarried(fish);
        mob.playSound(fish == Items.COD ? SoundEvents.COD_FLOP : SoundEvents.SALMON_FLOP, 1.0f, 1.0f);
        phase = CAUGHT;
        timer = 30 + mob.getRandom().nextInt(30);
    }

    /** Salmon run in rivers, cod live in the sea. */
    private Item pickFish() {
        Holder<Biome> biome = mob.level().getBiome(water != null ? water : mob.blockPosition());
        float salmon = biome.is(BiomeTags.IS_RIVER) ? 0.8f : biome.is(BiomeTags.IS_OCEAN) ? 0.3f : 0.5f;
        return mob.getRandom().nextFloat() < salmon ? Items.SALMON : Items.COD;
    }
}
