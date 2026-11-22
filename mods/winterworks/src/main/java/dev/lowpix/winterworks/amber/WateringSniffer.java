package dev.lowpix.winterworks.amber;

import net.minecraft.world.entity.AnimationState;

/**
 * Added to every Sniffer by mixin.harvester.SnifferWaterMixin: a tamed sniffer's crop-watering job and its sneeze
 * (docs/FIXES_0_4.md "Sniffers water crops"; logic in {@link SnifferWatering}).
 */
public interface WateringSniffer {
    SnifferWatering.Job ww$watering();

    /** Client: the sneeze (client.harvester.SnifferSneezeAnimation, played by mixin.harvester.SnifferSneezeModelMixin). */
    AnimationState ww$sneezeState();
}
