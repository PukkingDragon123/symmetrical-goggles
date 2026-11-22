package dev.lowpix.winterworks.golem;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.AbstractGolem;
import net.minecraft.world.level.Level;

/** The Pot Golem (docs/AMBER_UPDATE.md section 9). */
public class PotGolemEntity extends AbstractGolem {
    public PotGolemEntity(EntityType<? extends AbstractGolem> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return PathfinderMob.createMobAttributes().add(Attributes.MAX_HEALTH, 80).add(Attributes.MOVEMENT_SPEED, 0.27)
                .add(Attributes.ATTACK_DAMAGE, 10).add(Attributes.KNOCKBACK_RESISTANCE, 0.8).add(Attributes.FOLLOW_RANGE, 24)
                .add(Attributes.STEP_HEIGHT, 1.0);
    }
}
