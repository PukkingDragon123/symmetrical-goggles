package dev.lowpix.winterworks.mixin;

import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** How long a piglin has been out of the Nether (it zombifies past 300 ticks); the tests fast-forward it. */
@Mixin(AbstractPiglin.class)
public interface AbstractPiglinAccessor {
    @Accessor("timeInOverworld")
    int winterworks$timeInOverworld();

    @Accessor("timeInOverworld")
    void winterworks$setTimeInOverworld(int ticks);
}
