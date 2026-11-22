package dev.lowpix.winterworks.mixin.endgear;

import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** A Dragonling's rider holds jump to climb (endgear.Dragonling). */
@Mixin(LivingEntity.class)
public interface EndGearLivingEntityAccessor {
    @Accessor("jumping")
    boolean ww$jumping();
}
