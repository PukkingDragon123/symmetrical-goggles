package dev.lowpix.winterworks.mixin;

import com.mojang.datafixers.util.Pair;
import dev.lowpix.winterworks.world.WWWorldgen;
import java.util.function.Consumer;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.OverworldBiomeBuilder;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Adds the Ice Caves to the overworld's underground biomes: wherever the surface climate is frozen (the coldest
 * temperature band, like snowy plains, ice spikes and frozen peaks), the caves below are Ice Caves, except where
 * it's humid enough for lush caves.
 */
@Mixin(OverworldBiomeBuilder.class)
public abstract class OverworldBiomeBuilderMixin {
    @Inject(method = "addUndergroundBiomes", at = @At("TAIL"))
    private void ww$addIceCaves(Consumer<Pair<Climate.ParameterPoint, ResourceKey<Biome>>> consumer, CallbackInfo ci) {
        consumer.accept(Pair.of(Climate.parameters(
                Climate.Parameter.span(-1.0f, -0.45f),   // temperature: frozen
                Climate.Parameter.span(-1.0f, 0.7f),     // humidity: below lush caves
                Climate.Parameter.span(-1.0f, 0.8f),     // continentalness: below dripstone caves
                Climate.Parameter.span(-1.0f, 1.0f),     // erosion
                Climate.Parameter.span(0.2f, 0.9f),      // depth: underground (like the other cave biomes)
                Climate.Parameter.span(-1.0f, 1.0f),     // weirdness
                0.0f), WWWorldgen.ICE_CAVES));
        // the Dead Caves: only under the badlands, a fossil desert that was a forest. Badlands are the hot band's
        // eroded uplands (vanilla picks them for the hottest temperature at low erosion, inland), deserts its flats.
        consumer.accept(Pair.of(Climate.parameters(
                Climate.Parameter.span(0.55f, 1.0f),     // temperature: the hottest band
                Climate.Parameter.span(-1.0f, 1.0f),
                Climate.Parameter.span(-0.11f, 0.8f),    // continentalness: inland
                Climate.Parameter.span(-1.0f, -0.375f),  // erosion: uplands and plateaus, where badlands are
                Climate.Parameter.span(0.2f, 0.9f),
                Climate.Parameter.span(-1.0f, 1.0f),
                0.0f), WWWorldgen.DEAD_CAVES));
    }
}
