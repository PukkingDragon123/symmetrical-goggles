package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.curse.Sins;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Gluttony: hunger drains three times as fast, and food mends your gear. */
@Mixin(Player.class)
public abstract class CursePlayerMixin {
    @ModifyVariable(method = "causeFoodExhaustion", at = @At("HEAD"), argsOnly = true)
    private float ww$gluttonyHunger(float exhaustion) {
        return Sins.exhaustion((Player) (Object) this, exhaustion);
    }

    @Inject(method = "eat", at = @At("HEAD"))
    private void ww$gluttonyFeast(Level level, ItemStack stack, FoodProperties food, CallbackInfoReturnable<ItemStack> cir) {
        Sins.onEat((Player) (Object) this, food);
    }
}
