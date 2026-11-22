package dev.lowpix.winterworks.mixin.endgear;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.lowpix.winterworks.end.Petrify;
import dev.lowpix.winterworks.endgear.EndGlider;
import dev.lowpix.winterworks.registry.EndEffects;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * The gear's hooks on every living entity (docs/END_UPDATE.md sections 11-12): petrified entities are immobile (no AI,
 * no input, no jumping) and can't be pushed, and the effect's start, change and end reach the trackers (end.Petrify);
 * a player gliding with the End Glider flies by its steering instead of the elytra's (endgear.EndGlider).
 */
@Mixin(LivingEntity.class)
public abstract class EndGearLivingEntityMixin {
    @WrapOperation(method = "aiStep", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/LivingEntity;isImmobile()Z"))
    private boolean ww$petrifiedImmobile(LivingEntity self, Operation<Boolean> original) {
        return original.call(self) || Petrify.isFrozen(self);
    }

    @Inject(method = "isPushable", at = @At("HEAD"), cancellable = true)
    private void ww$petrifiedNotPushable(CallbackInfoReturnable<Boolean> cir) {
        if (Petrify.isFrozen((LivingEntity) (Object) this)) {
            cir.setReturnValue(false);
        }
    }

    @Inject(method = "onEffectAdded", at = @At("TAIL"))
    private void ww$petrifyAdded(MobEffectInstance effect, @Nullable Entity source, CallbackInfo ci) {
        LivingEntity self = (LivingEntity) (Object) this;
        if (effect.is(EndEffects.PETRIFIED) && !self.level().isClientSide) {
            Petrify.onEncased(self, effect);
        }
    }

    @Inject(method = "onEffectUpdated", at = @At("TAIL"))
    private void ww$petrifyUpdated(MobEffectInstance effect, boolean reapply, @Nullable Entity source, CallbackInfo ci) {
        if (effect.is(EndEffects.PETRIFIED)) {
            Petrify.onUpdated((LivingEntity) (Object) this, effect);
        }
    }

    @Inject(method = "onEffectRemoved", at = @At("TAIL"))
    private void ww$petrifyRemoved(MobEffectInstance effect, CallbackInfo ci) {
        LivingEntity self = (LivingEntity) (Object) this;
        if (effect.is(EndEffects.PETRIFIED) && !self.level().isClientSide) {
            Petrify.onShattered(self);
        }
    }

    @Inject(method = "travel", at = @At("HEAD"), cancellable = true)
    private void ww$gliderTravel(Vec3 input, CallbackInfo ci) {
        if ((Object) this instanceof Player p && EndGlider.travel(p)) {
            ci.cancel();
        }
    }
}
