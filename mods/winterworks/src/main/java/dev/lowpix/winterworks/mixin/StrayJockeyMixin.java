package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.bear.BearFeature;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.monster.AbstractSkeleton;
import net.minecraft.world.level.ServerLevelAccessor;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Polar bear jockeys (docs/COLD_UPDATE.md section 3): Strays spawning naturally in the cold sometimes ride a polar bear. */
@Mixin(AbstractSkeleton.class)
public abstract class StrayJockeyMixin {
    @Inject(method = "finalizeSpawn", at = @At("RETURN"))
    private void ww$bearJockey(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason, @Nullable SpawnGroupData data,
                               CallbackInfoReturnable<SpawnGroupData> cir) {
        Mob self = (Mob) (Object) this;
        if (self.getType() == EntityType.STRAY) {
            BearFeature.maybeJockey(self, level, difficulty, reason);
        }
    }
}
