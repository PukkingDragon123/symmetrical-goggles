package dev.lowpix.winterworks.mixin.harvester;

import dev.lowpix.winterworks.amber.SnifferWatering;
import dev.lowpix.winterworks.amber.WateringSniffer;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;

/**
 * Tamed sniffers water crops and sneeze over them (docs/FIXES_0_4.md; logic in amber.SnifferWatering): the errand's
 * state, and the sneeze's AnimationState, started by the sneeze entity event on the client.
 */
@Mixin(Sniffer.class)
public abstract class SnifferWaterMixin extends Animal implements WateringSniffer {
    @Unique
    private final SnifferWatering.Job ww$watering = new SnifferWatering.Job();
    @Unique
    private final AnimationState ww$sneeze = new AnimationState();

    protected SnifferWaterMixin(EntityType<? extends Animal> type, Level level) {
        super(type, level);
    }

    @Override
    public SnifferWatering.Job ww$watering() {
        return ww$watering;
    }

    @Override
    public AnimationState ww$sneezeState() {
        return ww$sneeze;
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == SnifferWatering.EVENT_SNEEZE) {
            ww$sneeze.start(tickCount);
            return;
        }
        super.handleEntityEvent(id);
    }
}
