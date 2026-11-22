package dev.lowpix.winterworks.mixin.end;

import dev.lowpix.winterworks.registry.EndBlocks;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Suspicious End Sand is brushable: it uses vanilla's brushable block entity (docs/END_UPDATE.md section 2). */
@Mixin(BlockEntityType.class)
public abstract class SuspiciousEndSandMixin {
    @Inject(method = "isValid", at = @At("HEAD"), cancellable = true)
    private void ww$brushableEndSand(BlockState state, CallbackInfoReturnable<Boolean> cir) {
        if ((Object) this == BlockEntityType.BRUSHABLE_BLOCK && state.is(EndBlocks.SUSPICIOUS_END_SAND)) {
            cir.setReturnValue(true);
        }
    }
}
