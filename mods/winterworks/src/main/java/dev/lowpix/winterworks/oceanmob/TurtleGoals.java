package dev.lowpix.winterworks.oceanmob;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.animal.Turtle;
import net.minecraft.world.level.block.TurtleEggBlock;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** The overhauled turtles' extra behaviour (added to every vanilla turtle by mixin.oceanmob.TurtleMixin). */
public final class TurtleGoals {
    private TurtleGoals() {}

    /** GameTests and screenshots: bask at once (no random wait, any time of day). */
    public static boolean eagerBask;

    /** On a sunny beach a turtle stops on the sand and basks a while (the `bask` clip), then goes back to the sea. */
    public static final class Bask extends Goal {
        private final Turtle turtle;
        private int time, cooldown;

        public Bask(Turtle turtle) {
            this.turtle = turtle;
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
        }

        private boolean canBaskHere() {
            return !turtle.isInWater() && turtle.onGround() && TurtleEggBlock.onSand(turtle.level(), turtle.blockPosition())
                    && !turtle.hasEgg() && !turtle.isLayingEgg() && turtle.getTarget() == null
                    && (eagerBask || turtle.level().isDay() && turtle.level().canSeeSky(turtle.blockPosition().above()));
        }

        @Override
        public boolean canUse() {
            if (cooldown > 0) {
                cooldown--;
                return false;
            }
            return canBaskHere() && (eagerBask || turtle.getRandom().nextInt(120) == 0);
        }

        @Override
        public boolean canContinueToUse() {
            return time > 0 && canBaskHere() && turtle.getLastHurtByMob() == null;
        }

        @Override
        public void start() {
            time = eagerBask ? 1200 : 300 + turtle.getRandom().nextInt(600);
            turtle.getNavigation().stop();
            ((SeaTurtle) turtle).ww$setBasking(true);
        }

        @Override
        public void tick() {
            time--;
            turtle.getNavigation().stop();
        }

        @Override
        public void stop() {
            ((SeaTurtle) turtle).ww$setBasking(false);
            time = 0;
            cooldown = eagerBask ? 0 : 400 + turtle.getRandom().nextInt(800);
        }
    }

    /** Now and then a swimming turtle rises to the surface for air, lingers a few seconds with its head out, and dives again. */
    public static final class Surface extends Goal {
        private final Turtle turtle;
        @Nullable
        private BlockPos target;
        private int linger, time;

        public Surface(Turtle turtle) {
            this.turtle = turtle;
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            if (!turtle.isInWater() || turtle.hasEgg() || turtle.getRandom().nextInt(900) != 0) {
                return false;
            }
            target = findSurface();
            return target != null && target.getY() - turtle.getY() > 1.5;
        }

        @Nullable
        private BlockPos findSurface() {
            BlockPos.MutableBlockPos p = turtle.blockPosition().mutable();
            for (int i = 0; i < 32; i++) {
                p.move(0, 1, 0);
                if (!turtle.level().getFluidState(p).is(FluidTags.WATER)) {
                    return turtle.level().getBlockState(p).isAir() ? p.below().immutable() : null;
                }
            }
            return null;
        }

        @Override
        public boolean canContinueToUse() {
            return target != null && time < 400 && linger < 80 && turtle.isInWater();
        }

        @Override
        public void start() {
            linger = 0;
            time = 0;
            ((SeaTurtle) turtle).ww$setSurfacing(true);
        }

        @Override
        public void tick() {
            time++;
            if (target == null) {
                return;
            }
            Vec3 at = Vec3.atBottomCenterOf(target).add(0, 0.55, 0);
            if (turtle.position().distanceToSqr(at) < 2.5) {
                linger++;
                turtle.getNavigation().stop();
                turtle.setDeltaMovement(turtle.getDeltaMovement().multiply(0.6, 0.0, 0.6).add(0, (at.y - turtle.getY()) * 0.08, 0));
            } else if (time % 10 == 1) {
                turtle.getNavigation().moveTo(at.x, at.y, at.z, 1.0);
            }
        }

        @Override
        public void stop() {
            ((SeaTurtle) turtle).ww$setSurfacing(false);
            target = null;
        }
    }
}
