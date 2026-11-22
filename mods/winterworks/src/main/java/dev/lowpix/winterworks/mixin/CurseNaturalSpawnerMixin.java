package dev.lowpix.winterworks.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.lowpix.winterworks.curse.LustSpawns;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.level.NaturalSpawner;
import net.minecraft.world.level.chunk.LevelChunk;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Lust: near a Lust bearer the monster cap counts double and monsters get two spawn attempts (curse.LustSpawns). */
@Mixin(NaturalSpawner.class)
public abstract class CurseNaturalSpawnerMixin {
    @Inject(method = "spawnForChunk", at = @At("HEAD"))
    private static void ww$lustBegin(ServerLevel level, LevelChunk chunk, NaturalSpawner.SpawnState state, boolean friendly,
                                     boolean enemies, boolean persistent, CallbackInfo ci) {
        LustSpawns.begin(level, chunk.getPos());
    }

    @Inject(method = "spawnForChunk", at = @At("RETURN"))
    private static void ww$lustEnd(ServerLevel level, LevelChunk chunk, NaturalSpawner.SpawnState state, boolean friendly,
                                   boolean enemies, boolean persistent, CallbackInfo ci) {
        LustSpawns.end();
    }

    @WrapOperation(method = "spawnForChunk", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/NaturalSpawner;spawnCategoryForChunk(Lnet/minecraft/world/entity/MobCategory;Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/level/chunk/LevelChunk;Lnet/minecraft/world/level/NaturalSpawner$SpawnPredicate;Lnet/minecraft/world/level/NaturalSpawner$AfterSpawnCallback;)V"))
    private static void ww$lustTwice(MobCategory category, ServerLevel level, LevelChunk chunk, NaturalSpawner.SpawnPredicate predicate,
                                     NaturalSpawner.AfterSpawnCallback after, Operation<Void> original) {
        for (int i = LustSpawns.attempts(category); i > 0; i--) {
            original.call(category, level, chunk, predicate, after);
        }
    }
}
