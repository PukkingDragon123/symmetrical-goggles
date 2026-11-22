package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.nether.WitchCrew;
import java.util.Optional;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.piglin.PiglinBruteAi;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The Piglin Witch's brutes keep the gold rules like piglins: they leave a player in gold be (nether.WitchCrew). */
@Mixin(PiglinBruteAi.class)
public abstract class PiglinBruteAiMixin {
    @Inject(method = "findNearestValidAttackTarget", at = @At("RETURN"), cancellable = true)
    private static void ww$crewSparesGold(AbstractPiglin brute, CallbackInfoReturnable<Optional<? extends LivingEntity>> cir) {
        Optional<? extends LivingEntity> target = cir.getReturnValue();
        if (target.isPresent() && WitchCrew.bruteSpares(brute, target.get())) {
            cir.setReturnValue(Optional.empty());
        }
    }
}
