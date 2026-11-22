package dev.lowpix.winterworks.mixin.end;

import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * A meteorite burns for 48000 ticks (docs/END_UPDATE.md section 2), more than the furnace's saved burn time (a short)
 * holds: keep the whole number in its own tag so a reload mid-burn doesn't put the fire out.
 */
@Mixin(AbstractFurnaceBlockEntity.class)
public abstract class LongBurnFurnaceMixin {
    private static final String WW_KEY = "winterworks:BurnTime";

    @Shadow
    int litTime;

    @Inject(method = "saveAdditional", at = @At("TAIL"))
    private void ww$saveLongBurn(CompoundTag tag, HolderLookup.Provider registries, CallbackInfo ci) {
        if (litTime > Short.MAX_VALUE) {
            tag.putInt(WW_KEY, litTime);
        }
    }

    @Inject(method = "loadAdditional", at = @At("TAIL"))
    private void ww$loadLongBurn(CompoundTag tag, HolderLookup.Provider registries, CallbackInfo ci) {
        if (tag.contains(WW_KEY)) {
            litTime = tag.getInt(WW_KEY);
        }
    }
}
