package dev.lowpix.winterworks.mixin;

import net.minecraft.world.entity.monster.hoglin.Hoglin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

/** Penned and ridden hoglins can't be hunted by piglins (nether.WitchCrew, nether.HoglinJockeys). */
@Mixin(Hoglin.class)
public interface HoglinAccessor {
    @Invoker("setCannotBeHunted")
    void winterworks$setCannotBeHunted(boolean cannot);
}
