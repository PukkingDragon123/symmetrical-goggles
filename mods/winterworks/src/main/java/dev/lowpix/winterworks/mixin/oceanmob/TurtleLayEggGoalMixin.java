package dev.lowpix.winterworks.mixin.oceanmob;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.lowpix.winterworks.oceanmob.TurtleClutches;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Clutches of 2-6 eggs (vanilla: 1-4): the turtle's nest is laid by oceanmob.TurtleClutches instead. */
@Mixin(targets = "net.minecraft.world.entity.animal.Turtle$TurtleLayEggGoal")
public abstract class TurtleLayEggGoalMixin {
    @WrapOperation(method = "tick", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/world/level/Level;setBlock(Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;I)Z"))
    private boolean ww$layClutch(Level level, BlockPos pos, BlockState state, int flags, Operation<Boolean> original) {
        return TurtleClutches.lay(level, pos, level.random) > 0;
    }
}
