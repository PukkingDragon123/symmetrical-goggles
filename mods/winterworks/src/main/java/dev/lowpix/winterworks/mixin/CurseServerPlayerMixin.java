package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.Sins;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Greed: items you throw away (not the ones you drop when you die) vanish. */
@Mixin(ServerPlayer.class)
public abstract class CurseServerPlayerMixin {
    @Inject(method = "drop(Lnet/minecraft/world/item/ItemStack;ZZ)Lnet/minecraft/world/entity/item/ItemEntity;", at = @At("RETURN"))
    private void ww$greedVanish(ItemStack stack, boolean around, boolean thrower, CallbackInfoReturnable<ItemEntity> cir) {
        ItemEntity item = cir.getReturnValue();
        if (item != null && thrower) {
            Sins.onToss((ServerPlayer) (Object) this, item);
        }
    }
}
