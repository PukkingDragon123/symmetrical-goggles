package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Amber fossils, amber sand and amber gravel are brushable: they use vanilla's brushable block entity. */
@Mixin(BlockEntityType.class)
public abstract class BlockEntityTypeMixin {
    @Inject(method = "isValid", at = @At("HEAD"), cancellable = true)
    private void ww$brushableAmber(BlockState state, CallbackInfoReturnable<Boolean> cir) {
        if ((Object) this == BlockEntityType.BRUSHABLE_BLOCK
                && (state.is(WWBlocks.AMBER_FOSSIL) || state.is(WWBlocks.AMBER_SAND) || state.is(WWBlocks.AMBER_GRAVEL))) {
            cir.setReturnValue(true);
        }
    }
}
