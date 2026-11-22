package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.nether.GoldenPiglin;
import dev.lowpix.winterworks.nether.PiglinGreed;
import java.util.List;
import java.util.Optional;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinAi;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Piglin greed (docs/HEXES_UPDATE.md sections 1 and 7): Piglins go for Golden Piglins (which only hit back), Golden
 * Piglins barter from their own loot table, and a Piglin that has finished admiring Cursed Elixir drinks it.
 */
@Mixin(PiglinAi.class)
public abstract class PiglinAiMixin {
    @Inject(method = "findNearestValidAttackTarget", at = @At("RETURN"), cancellable = true)
    private static void ww$goldenTargets(Piglin piglin, CallbackInfoReturnable<Optional<? extends LivingEntity>> cir) {
        Optional<? extends LivingEntity> vanilla = cir.getReturnValue();
        Optional<? extends LivingEntity> ours = PiglinGreed.attackTarget(piglin, vanilla);
        if (ours != vanilla) {
            cir.setReturnValue(ours);
        }
    }

    @Inject(method = "getBarterResponseItems", at = @At("HEAD"), cancellable = true)
    private static void ww$goldenBarter(Piglin piglin, CallbackInfoReturnable<List<ItemStack>> cir) {
        if (piglin instanceof GoldenPiglin) {
            cir.setReturnValue(GoldenPiglin.barterLoot(piglin));
        }
    }

    @Inject(method = "stopHoldingOffHandItem", at = @At("HEAD"), cancellable = true)
    private static void ww$drinkCursedElixir(Piglin piglin, boolean barter, CallbackInfo ci) {
        if (PiglinGreed.drinkAdmired(piglin)) {
            ci.cancel();
        }
    }
}
