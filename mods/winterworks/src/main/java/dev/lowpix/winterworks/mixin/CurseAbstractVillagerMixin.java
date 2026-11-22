package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.HiddenCurses;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.npc.AbstractVillager;
import net.minecraft.world.item.trading.MerchantOffer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Curse of Judas: every trade turns the nearest iron golem on you. */
@Mixin(AbstractVillager.class)
public abstract class CurseAbstractVillagerMixin {
    @Inject(method = "notifyTrade", at = @At("TAIL"))
    private void ww$judas(MerchantOffer offer, CallbackInfo ci) {
        AbstractVillager self = (AbstractVillager) (Object) this;
        if (self.getTradingPlayer() instanceof ServerPlayer p) {
            HiddenCurses.onTrade(p, (Entity) self);
        }
    }
}
