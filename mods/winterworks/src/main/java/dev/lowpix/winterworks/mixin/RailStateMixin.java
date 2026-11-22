package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.express.FixedRail;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.BaseRailBlock;
import net.minecraft.world.level.block.RailState;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Vanilla rail auto-connection never reshapes a FixedRail (Coaster Loop, Switch Rail), and neighbouring rails turn to
 * meet it only along its legs.
 */
@Mixin(RailState.class)
public abstract class RailStateMixin {
    @Shadow
    @Final
    private BlockPos pos;

    @Shadow
    @Final
    private BaseRailBlock block;

    @Shadow
    private BlockState state;

    @Inject(method = "connectTo", at = @At("HEAD"), cancellable = true)
    private void ww$keepShape(RailState other, CallbackInfo ci) {
        if (block instanceof FixedRail) {
            ci.cancel();
        }
    }

    @Inject(method = "canConnectTo", at = @At("HEAD"), cancellable = true)
    private void ww$legsOnly(RailState other, CallbackInfoReturnable<Boolean> cir) {
        if (block instanceof FixedRail fixed) {
            cir.setReturnValue(fixed.ww$connectsTo(state, pos, ((RailStateAccessor) other).ww$pos()));
        }
    }
}
