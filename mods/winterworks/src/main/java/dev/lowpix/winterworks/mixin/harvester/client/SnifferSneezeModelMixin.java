package dev.lowpix.winterworks.mixin.harvester.client;

import dev.lowpix.winterworks.amber.WateringSniffer;
import dev.lowpix.winterworks.client.harvester.SnifferSneezeAnimation;
import net.minecraft.client.model.AgeableHierarchicalModel;
import net.minecraft.client.model.SnifferModel;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Plays the sneeze (client.harvester.SnifferSneezeAnimation) on vanilla's sniffer model (docs/FIXES_0_4.md). */
@Mixin(SnifferModel.class)
public abstract class SnifferSneezeModelMixin<T extends Sniffer> extends AgeableHierarchicalModel<T> {
    protected SnifferSneezeModelMixin(float youngScale, float bodyYOffset) {
        super(youngScale, bodyYOffset);
    }

    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/animal/sniffer/Sniffer;FFFFF)V", at = @At("TAIL"))
    private void ww$sneeze(T sniffer, float limbSwing, float limbAmount, float age, float headYaw, float headPitch, CallbackInfo ci) {
        if (sniffer instanceof WateringSniffer w) {
            animate(w.ww$sneezeState(), SnifferSneezeAnimation.SNEEZE, age);
        }
    }
}
