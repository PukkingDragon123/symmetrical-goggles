package dev.lowpix.winterworks.mixin.endmob;

import java.util.List;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The effect particles a living entity syncs to every client: how other clients tell it has End Glow (endmob.EndGlowEffect). */
@Mixin(LivingEntity.class)
public interface EffectParticlesAccessor {
    @Accessor("DATA_EFFECT_PARTICLES")
    static EntityDataAccessor<List<ParticleOptions>> winterworks$effectParticles() {
        throw new AssertionError();
    }
}
