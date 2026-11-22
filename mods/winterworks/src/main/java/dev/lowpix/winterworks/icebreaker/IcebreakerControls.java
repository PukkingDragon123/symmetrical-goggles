package dev.lowpix.winterworks.icebreaker;

import net.minecraft.util.Mth;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.LookControl;
import net.minecraft.world.entity.ai.control.MoveControl;

/**
 * How an Icebreaker moves (docs/FIXES_0_4.md): a seal is clumsy on land and graceful in water. On land these are the
 * vanilla controls (walking, stepping up, looking at things). In water it swims in 3D like a dolphin: it turns
 * smoothly, pitches its whole body toward where it is going (diving and surfacing), and hauls itself up onto the shore
 * or the ice edge when its path climbs out.
 */
final class IcebreakerControls {
    /** Swimming speed: this times the movement speed attribute and the goal's speed modifier (cruise ~0.25 b/t). */
    static final float SWIM_SPEED = 0.125f;
    /** Degrees per tick it can turn and pitch while swimming. */
    static final float SWIM_TURN = 9f, SWIM_PITCH = 4f, MAX_PITCH = 70f;

    private IcebreakerControls() {}

    static final class Move extends MoveControl {
        private final IcebreakerEntity seal;

        Move(IcebreakerEntity seal) {
            super(seal);
            this.seal = seal;
        }

        @Override
        public void tick() {
            if (seal.isAsleep()) {
                seal.setSpeed(0f);
                seal.setZza(0f);
                seal.setYya(0f);
                operation = Operation.WAIT;
                return;
            }
            if (!seal.isInWater()) {
                super.tick();
                return;
            }
            if (operation != Operation.MOVE_TO || seal.getNavigation().isDone()) {
                seal.setSpeed(0f);
                seal.setXxa(0f);
                seal.setYya(0f);
                seal.setZza(0f);
                seal.setXRot(rotlerp(seal.getXRot(), 0f, 2f));   // idle: levels out
                return;
            }
            double dx = wantedX - seal.getX(), dy = wantedY - seal.getY(), dz = wantedZ - seal.getZ();
            double d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 2.5e-7) {
                seal.setZza(0f);
                return;
            }
            float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
            seal.setYRot(rotlerp(seal.getYRot(), yaw, SWIM_TURN));
            seal.yBodyRot = seal.getYRot();
            seal.yHeadRot = seal.getYRot();
            float speed = (float) (speedModifier * seal.getAttributeValue(Attributes.MOVEMENT_SPEED)) * SWIM_SPEED;
            double horiz = Math.sqrt(dx * dx + dz * dz);
            float pitch = Mth.clamp(-(float) (Mth.atan2(dy, horiz) * Mth.RAD_TO_DEG), -MAX_PITCH, MAX_PITCH);
            seal.setXRot(rotlerp(seal.getXRot(), pitch, SWIM_PITCH));
            float cos = Mth.cos(seal.getXRot() * Mth.DEG_TO_RAD), sin = Mth.sin(seal.getXRot() * Mth.DEG_TO_RAD);
            seal.setSpeed(speed);
            seal.zza = cos * speed;
            seal.yya = -sin * speed;
            // hauling out: the path climbs onto the shore or an ice edge right in front of it: a heave up and over
            if (dy > 0.3 && horiz < 2.5 && seal.horizontalCollision) {
                seal.setDeltaMovement(seal.getDeltaMovement().add(0, 0.12, 0));
            }
        }
    }

    /** Vanilla on land; in water only the head turns (the body's pitch belongs to the swimming). */
    static final class Look extends LookControl {
        private final IcebreakerEntity seal;

        Look(IcebreakerEntity seal) {
            super(seal);
            this.seal = seal;
        }

        @Override
        public void tick() {
            if (seal.isAsleep()) {
                seal.yHeadRot = rotateTowards(seal.yHeadRot, seal.yBodyRot, 4f);
                return;
            }
            if (!seal.isInWater() && !seal.isPorpoising()) {
                super.tick();
                return;
            }
            if (lookAtCooldown > 0) {
                lookAtCooldown--;
                getYRotD().ifPresent(y -> seal.yHeadRot = rotateTowards(seal.yHeadRot, y, yMaxRotSpeed));
            } else {
                seal.yHeadRot = rotateTowards(seal.yHeadRot, seal.yBodyRot, 10f);
            }
            seal.yHeadRot = Mth.rotateIfNecessary(seal.yHeadRot, seal.yBodyRot, seal.getMaxHeadYRot());
        }
    }
}
