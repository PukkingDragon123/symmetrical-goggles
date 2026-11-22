package dev.lowpix.winterworks.mixin.harvester;

import net.minecraft.world.level.block.state.BlockBehaviour;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

/**
 * Lets harvester.GlowPlants give vanilla's torchflowers and pitcher plants a light level per growth stage
 * (docs/FIXES_0_4.md "Torchflowers and pitcher plants glow"). Block states cache their light emission when the
 * blocks are built, so it is set once on the states themselves at mod init.
 */
@Mixin(BlockBehaviour.BlockStateBase.class)
public interface BlockStateLightAccessor {
    @Accessor("lightEmission")
    @Mutable
    void ww$setLightEmission(int light);
}
