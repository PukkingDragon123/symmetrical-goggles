package dev.lowpix.winterworks.mixin;

import dev.lowpix.winterworks.soulbull.SoulBullFeature;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.random.WeightedRandomList;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.level.NaturalSpawner;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.MobSpawnSettings;
import net.minecraft.world.level.chunk.ChunkGenerator;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Armoured Soul Bulls join the monster spawns in and around bastion remnants and Hex Fortresses (soulbull.SoulBullFeature). */
@Mixin(NaturalSpawner.class)
public abstract class SoulBullNaturalSpawnerMixin {
    @Inject(method = "mobsAt", at = @At("RETURN"), cancellable = true)
    private static void ww$piglinLandBulls(ServerLevel level, StructureManager structures, ChunkGenerator generator, MobCategory category,
                                           BlockPos pos, @Nullable Holder<Biome> biome,
                                           CallbackInfoReturnable<WeightedRandomList<MobSpawnSettings.SpawnerData>> cir) {
        if (category == MobCategory.MONSTER) {
            WeightedRandomList<MobSpawnSettings.SpawnerData> spawns = SoulBullFeature.withPiglinBulls(level, pos, cir.getReturnValue());
            if (spawns != null) {
                cir.setReturnValue(spawns);
            }
        }
    }
}
