package dev.lowpix.winterworks.golem;

import java.util.EnumSet;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.target.TargetGoal;
import net.minecraft.world.entity.ai.targeting.TargetingConditions;
import net.minecraft.world.entity.player.Player;
import org.jetbrains.annotations.Nullable;

/**
 * Like a tamed wolf's OwnerHurtByTargetGoal / OwnerHurtTargetGoal: the golem goes for whoever hurt its owner
 * ({@code attacker}) or whatever its owner attacked. Never the owner's own pets (the golem's setTarget refuses them).
 */
public class GolemDefendOwnerGoal extends TargetGoal {
    private final PotGolemEntity golem;
    private final boolean attacker;
    @Nullable private LivingEntity victim;
    private int timestamp;

    public GolemDefendOwnerGoal(PotGolemEntity golem, boolean attacker) {
        super(golem, false);
        this.golem = golem;
        this.attacker = attacker;
        setFlags(EnumSet.of(Goal.Flag.TARGET));
    }

    @Override
    public boolean canUse() {
        Player owner = golem.ownerPlayer();
        if (owner == null) {
            return false;
        }
        victim = attacker ? owner.getLastHurtByMob() : owner.getLastHurtMob();
        int ts = attacker ? owner.getLastHurtByMobTimestamp() : owner.getLastHurtMobTimestamp();
        return ts != timestamp && victim != null && !golem.isFriendly(victim) && canAttack(victim, TargetingConditions.DEFAULT);
    }

    @Override
    public void start() {
        golem.setTarget(victim);
        Player owner = golem.ownerPlayer();
        if (owner != null) {
            timestamp = attacker ? owner.getLastHurtByMobTimestamp() : owner.getLastHurtMobTimestamp();
        }
        super.start();
    }
}
