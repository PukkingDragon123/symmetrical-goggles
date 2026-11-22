package dev.lowpix.winterworks.mixin.oceangear;

import dev.lowpix.winterworks.oceangear.TurtleShell;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyArg;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Turtle Shell armour (oceangear.TurtleShell): the swim stroke +10% a piece; retreated in the shell, damage cut by
 * where it comes from, no knockback, no moving and no jumping.
 */
@Mixin(LivingEntity.class)
public abstract class ShellLivingEntityMixin {
    @ModifyVariable(method = "hurt", at = @At("HEAD"), argsOnly = true)
    private float ww$shellDamage(float amount, DamageSource source) {
        return TurtleShell.onHurt((LivingEntity) (Object) this, source, amount);
    }

    @Inject(method = "knockback", at = @At("HEAD"), cancellable = true)
    private void ww$shellKnockback(double strength, double x, double z, CallbackInfo ci) {
        if (TurtleShell.isRetreating((LivingEntity) (Object) this)) {
            ci.cancel();
        }
    }

    @ModifyVariable(method = "travel", at = @At("HEAD"), argsOnly = true)
    private Vec3 ww$shellStill(Vec3 input) {
        return TurtleShell.isRetreating((LivingEntity) (Object) this) ? Vec3.ZERO : input;
    }

    /** The water branch's stroke (the first moveRelative in travel). */
    @ModifyArg(method = "travel", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/world/entity/LivingEntity;moveRelative(FLnet/minecraft/world/phys/Vec3;)V", ordinal = 0), index = 0)
    private float ww$shellSwim(float speed) {
        return speed * TurtleShell.swimFactor((LivingEntity) (Object) this);
    }

    @Inject(method = "jumpFromGround", at = @At("HEAD"), cancellable = true)
    private void ww$shellJump(CallbackInfo ci) {
        if (TurtleShell.isRetreating((LivingEntity) (Object) this)) {
            ci.cancel();
        }
    }
}
