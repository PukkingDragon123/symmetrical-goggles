package dev.lowpix.winterworks.mixin.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.ChorusFlowerBlock;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Chorus flowers stand on End Grass, End Moss and chorus-tree stems too (see ChorusSoilMixin). */
@Mixin(ChorusFlowerBlock.class)
public abstract class ChorusFlowerSoilMixin {
    @Inject(method = "canSurvive", at = @At("RETURN"), cancellable = true)
    private void ww$surviveOnEndSoil(BlockState state, LevelReader level, BlockPos pos, CallbackInfoReturnable<Boolean> cir) {
        BlockState below = level.getBlockState(pos.below());
        if (!cir.getReturnValueZ() && (below.is(EndBlocks.END_GRASS_BLOCK) || below.is(EndBlocks.END_MOSS_BLOCK)
                || below.is(EndBlocks.CHORUS_STEM))) {
            cir.setReturnValue(true);
        }
    }
}
