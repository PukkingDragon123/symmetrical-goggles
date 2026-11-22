package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.nether.HoglinJockeys;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.monster.hoglin.Hoglin;
import net.minecraft.world.level.ServerLevelAccessor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Hoglin jockeys (docs/FIXES_0_4.md): a piglin climbs on some hoglins as they spawn, and a hoglin carrying a piglin
 * lets its rider steer it (its own brain is put aside meanwhile; nether.HoglinJockeys).
 */
@Mixin(Hoglin.class)
public abstract class HoglinMixin {
    @Inject(method = "finalizeSpawn", at = @At("TAIL"))
    private void ww$jockey(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType type, SpawnGroupData data,
                           CallbackInfoReturnable<SpawnGroupData> cir) {
        HoglinJockeys.onFinalizeSpawn((Hoglin) (Object) this, level, type);
    }

    @Inject(method = "customServerAiStep", at = @At("HEAD"), cancellable = true)
    private void ww$riddenByPiglin(CallbackInfo ci) {
        if (HoglinJockeys.steer((Hoglin) (Object) this)) {
            ci.cancel();
        }
    }
}
