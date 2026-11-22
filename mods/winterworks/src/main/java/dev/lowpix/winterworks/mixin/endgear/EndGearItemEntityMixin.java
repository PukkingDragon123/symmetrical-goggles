package dev.lowpix.winterworks.mixin.endgear;

import dev.lowpix.winterworks.endgear.DragonEggs;
import net.minecraft.world.entity.item.ItemEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** A Dragon Egg back from the void for the third time hatches where it lands (endgear.DragonEggs). */
@Mixin(ItemEntity.class)
public abstract class EndGearItemEntityMixin {
    @Inject(method = "tick", at = @At("TAIL"))
    private void ww$hatchWhenLanded(CallbackInfo ci) {
        DragonEggs.tickItem((ItemEntity) (Object) this);
    }
}
