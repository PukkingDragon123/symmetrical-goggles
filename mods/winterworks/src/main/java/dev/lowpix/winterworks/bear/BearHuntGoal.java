package dev.lowpix.winterworks.bear;

import java.util.function.Predicate;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;

/** Adult polar bears hunt players within 16 blocks (docs/COLD_UPDATE.md section 3); `who` says which players. */
public class BearHuntGoal extends NearestAttackableTargetGoal<Player> {
    public static final double RANGE = 16.0;

    public BearHuntGoal(Mob mob, Predicate<LivingEntity> who) {
        super(mob, Player.class, 10, true, false, who);
    }

    @Override
    protected double getFollowDistance() {
        return Math.min(RANGE, super.getFollowDistance());
    }
}
