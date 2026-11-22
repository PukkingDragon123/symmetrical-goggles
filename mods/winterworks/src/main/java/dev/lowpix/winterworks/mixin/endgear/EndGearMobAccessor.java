package dev.lowpix.winterworks.mixin.endgear;

import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** end.Petrify stops a mob's running goals when it is encased. */
@Mixin(Mob.class)
public interface EndGearMobAccessor {
    @Accessor("goalSelector")
    GoalSelector ww$goalSelector();

    @Accessor("targetSelector")
    GoalSelector ww$targetSelector();
}
