package dev.lowpix.winterworks.mixin;

import com.llamalad7.mixinextras.injector.v2.WrapWithCondition;
import dev.lowpix.winterworks.registry.WWEffects;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Hexed: no peaceful-difficulty regeneration either (docs/HEXES_UPDATE.md section 2). The food refill still runs. */
@Mixin(Player.class)
public abstract class HexedPlayerMixin {
    @WrapWithCondition(method = "aiStep", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/player/Player;heal(F)V"))
    private boolean winterworks$hexedNoPeacefulRegen(Player self, float amount) {
        return !self.hasEffect(WWEffects.HEXED);
    }
}
