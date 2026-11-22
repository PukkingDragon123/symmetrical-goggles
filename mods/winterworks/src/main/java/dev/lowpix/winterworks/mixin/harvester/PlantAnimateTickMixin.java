package dev.lowpix.winterworks.mixin.harvester;

import dev.lowpix.winterworks.harvester.GlowPlants;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Vanilla's pitcher plants and torchflowers have no animateTick of their own (they use Block's empty one): this adds
 * the pitcher plant's sweet scent and the torchflower's embers (docs/FIXES_0_4.md; harvester.GlowPlants#animateTick).
 */
@Mixin(Block.class)
public abstract class PlantAnimateTickMixin {
    @Inject(method = "animateTick", at = @At("HEAD"))
    private void ww$plantParticles(BlockState state, Level level, BlockPos pos, RandomSource random, CallbackInfo ci) {
        GlowPlants.animateTick(state, level, pos, random);
    }
}
