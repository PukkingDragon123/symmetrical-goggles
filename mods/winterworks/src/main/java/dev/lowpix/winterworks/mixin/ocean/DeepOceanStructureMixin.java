package dev.lowpix.winterworks.mixin.ocean;

import dev.lowpix.winterworks.ocean.OceanWorldFeature;
import java.util.Optional;
import net.minecraft.world.level.levelgen.structure.Structure;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Vanilla structures that sit on (or just under) the sea floor where they start don't start where the deep floor is
 * carved far below it (ocean.OceanWorldFeature#notInTheDeep): shipwrecks, ocean ruins, ocean ruined portals and trial
 * chambers. Deep shipwrecks and the other Tides & Treasures structures take their place.
 */
@Mixin(Structure.class)
public abstract class DeepOceanStructureMixin {
    @Inject(method = "findValidGenerationPoint", at = @At("HEAD"), cancellable = true)
    private void ww$notInTheDeep(Structure.GenerationContext ctx, CallbackInfoReturnable<Optional<Structure.GenerationStub>> cir) {
        if (OceanWorldFeature.notInTheDeep((Structure) (Object) this, ctx)) {
            cir.setReturnValue(Optional.empty());
        }
    }
}
