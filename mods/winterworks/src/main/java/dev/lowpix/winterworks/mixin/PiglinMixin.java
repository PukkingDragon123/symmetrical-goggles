package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.nether.GoldenPiglin;
import dev.lowpix.winterworks.registry.WWItems;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.ServerLevelAccessor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * 1 in 40 Piglins spawned in the world (naturally, with the chunk, or in a structure such as a bastion) is a Golden
 * Piglin (docs/HEXES_UPDATE.md section 7). The roll is made at spawn and kept (saved) until the piglin's first AI
 * tick, when it is replaced: a world-generation spawn can't be replaced on the spot. Piglins never pick up an Elixir
 * of Greed: they fight over it instead (nether.PiglinGreed).
 */
@Mixin(Piglin.class)
public abstract class PiglinMixin {
    @Unique
    private boolean winterworks$turnGolden;

    @Inject(method = "finalizeSpawn", at = @At("TAIL"))
    private void ww$rollGolden(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType type, SpawnGroupData data,
                               CallbackInfoReturnable<SpawnGroupData> cir) {
        Piglin self = (Piglin) (Object) this;
        if (self.getType() == EntityType.PIGLIN && GoldenPiglin.rollsGolden(type, level.getRandom())) {
            winterworks$turnGolden = true;
        }
    }

    @Inject(method = "customServerAiStep", at = @At("HEAD"), cancellable = true)
    private void ww$turnGolden(CallbackInfo ci) {
        if (winterworks$turnGolden) {
            winterworks$turnGolden = false;
            if (GoldenPiglin.fromPiglin((Piglin) (Object) this) != null) {
                ci.cancel();
            }
        }
    }

    @Inject(method = "addAdditionalSaveData", at = @At("TAIL"))
    private void ww$saveGoldenRoll(CompoundTag tag, CallbackInfo ci) {
        if (winterworks$turnGolden) {
            tag.putBoolean("winterworks:TurnGolden", true);
        }
    }

    @Inject(method = "readAdditionalSaveData", at = @At("TAIL"))
    private void ww$readGoldenRoll(CompoundTag tag, CallbackInfo ci) {
        winterworks$turnGolden = tag.getBoolean("winterworks:TurnGolden");
    }

    @Inject(method = "wantsToPickUp", at = @At("HEAD"), cancellable = true)
    private void ww$fightOverGreed(ItemStack stack, CallbackInfoReturnable<Boolean> cir) {
        if (stack.is(WWItems.ELIXIR_OF_GREED)) {
            cir.setReturnValue(false);
        }
    }
}
