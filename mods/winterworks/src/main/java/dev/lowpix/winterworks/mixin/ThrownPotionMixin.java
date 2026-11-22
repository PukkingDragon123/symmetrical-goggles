package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.amber.AmberFeature;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.projectile.ThrownPotion;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.HitResult;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Splash and lingering Potions of Blood stain the floor and make amber mosquitoes spit (docs/AMBER_UPDATE.md section 7). */
@Mixin(ThrownPotion.class)
public abstract class ThrownPotionMixin {
    @Inject(method = "onHit", at = @At("HEAD"))
    private void ww$bloodSplash(HitResult hit, CallbackInfo ci) {
        ThrownPotion self = (ThrownPotion) (Object) this;
        if (self.level() instanceof ServerLevel sl && AmberFeature.isBloodPotion(self.getItem())) {
            AmberFeature.bloodSplash(sl, self.position(), self.getItem().is(Items.LINGERING_POTION));
        }
    }
}
