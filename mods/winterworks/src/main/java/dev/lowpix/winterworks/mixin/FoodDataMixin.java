package dev.lowpix.winterworks.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;
import dev.lowpix.winterworks.registry.WWEffects;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodData;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Hexed: no natural regeneration from food (docs/HEXES_UPDATE.md section 2). Potions and other effects still heal;
 * hunger and starving work as usual.
 */
@Mixin(FoodData.class)
public abstract class FoodDataMixin {
    @ModifyExpressionValue(method = "tick", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/world/level/GameRules;getBoolean(Lnet/minecraft/world/level/GameRules$Key;)Z"))
    private boolean winterworks$hexedHasNoNaturalRegen(boolean naturalRegen, @Local(argsOnly = true) Player player) {
        return naturalRegen && !player.hasEffect(WWEffects.HEXED);
    }
}
