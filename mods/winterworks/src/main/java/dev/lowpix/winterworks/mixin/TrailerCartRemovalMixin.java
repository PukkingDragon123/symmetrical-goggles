package dev.lowpix.winterworks.mixin;

import java.util.Optional;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.EntityType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The Trailer Cart is gone (0.4): a trailer saved in an old world loads as a plain minecart (same UUID, so its
 * couplings and position survive) instead of being skipped.
 */
@Mixin(EntityType.class)
public abstract class TrailerCartRemovalMixin {
    private static final String OLD_TRAILER = "winterworks:trailer_cart";

    @Inject(method = "by(Lnet/minecraft/nbt/CompoundTag;)Ljava/util/Optional;", at = @At("HEAD"), cancellable = true)
    private static void ww$trailerIsAMinecart(CompoundTag tag, CallbackInfoReturnable<Optional<EntityType<?>>> cir) {
        if (OLD_TRAILER.equals(tag.getString("id"))) {
            cir.setReturnValue(Optional.of(EntityType.MINECART));
        }
    }
}
