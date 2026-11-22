package dev.lowpix.winterworks.mixin.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.ChorusPlantBlock;
import net.minecraft.world.level.block.PipeBlock;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Chorus plants grow on the Living End's soils too (docs/END_UPDATE.md section 1): on End Grass and End Moss in Chorus
 * Meadows, and as twigs on chorus-tree stems, joining them like they join end stone.
 */
@Mixin(ChorusPlantBlock.class)
public abstract class ChorusSoilMixin {
    private static boolean ww$soil(BlockState s) {
        return s.is(EndBlocks.END_GRASS_BLOCK) || s.is(EndBlocks.END_MOSS_BLOCK) || s.is(EndBlocks.CHORUS_STEM);
    }

    @Inject(method = "canSurvive", at = @At("RETURN"), cancellable = true)
    private void ww$surviveOnEndSoil(BlockState state, LevelReader level, BlockPos pos, CallbackInfoReturnable<Boolean> cir) {
        if (!cir.getReturnValueZ() && ww$soil(level.getBlockState(pos.below()))) {
            cir.setReturnValue(true);
        }
    }

    @Inject(method = "getStateWithConnections", at = @At("RETURN"), cancellable = true)
    private static void ww$joinEndSoil(BlockGetter level, BlockPos pos, BlockState state, CallbackInfoReturnable<BlockState> cir) {
        BlockState s = cir.getReturnValue();
        if (s.hasProperty(PipeBlock.DOWN) && ww$soil(level.getBlockState(pos.below()))) {
            cir.setReturnValue(s.setValue(PipeBlock.DOWN, true));
        }
    }

    @Inject(method = "updateShape", at = @At("RETURN"), cancellable = true)
    private void ww$keepJoined(BlockState state, Direction dir, BlockState neighbour, LevelAccessor level, BlockPos pos, BlockPos npos,
                               CallbackInfoReturnable<BlockState> cir) {
        BlockState s = cir.getReturnValue();
        if (dir == Direction.DOWN && s.hasProperty(PipeBlock.DOWN) && ww$soil(neighbour)) {
            cir.setReturnValue(s.setValue(PipeBlock.DOWN, true));
        }
    }
}
