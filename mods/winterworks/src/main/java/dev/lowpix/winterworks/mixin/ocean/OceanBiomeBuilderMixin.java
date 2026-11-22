package dev.lowpix.winterworks.mixin.ocean;

import com.mojang.datafixers.util.Pair;
import dev.lowpix.winterworks.ocean.OceanWorldgen;
import java.util.function.Consumer;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.OverworldBiomeBuilder;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/**
 * The Tides & Treasures deep-ocean biomes (docs/OCEAN_UPDATE.md section 1): the far, deepest part of the deep-ocean
 * climate slot (continentalness -1.05..-0.62) becomes {@code abyssal_trench} where it's cold or temperate and
 * {@code volcanic_depths} where it's lukewarm or warm; vanilla's deep oceans keep the part nearer the shelf, and the
 * frozen deep ocean stays as it is. Like every surface biome they sit at depth 0 and 1; the carved-out deep water below
 * the old floor is given the biome of the sea over it by the carving itself (ocean.DepthCarver#rebiome), so cave biomes
 * never show in open water.
 */
@Mixin(OverworldBiomeBuilder.class)
public abstract class OceanBiomeBuilderMixin {
    private static final float ABYSS = -0.62f;

    @Shadow
    @Final
    private Climate.Parameter deepOceanContinentalness;
    @Shadow
    @Final
    private Climate.Parameter[] temperatures;

    @Redirect(method = "addOffCoastBiomes", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/biome/OverworldBiomeBuilder;addSurfaceBiome(Ljava/util/function/Consumer;Lnet/minecraft/world/level/biome/Climate$Parameter;Lnet/minecraft/world/level/biome/Climate$Parameter;Lnet/minecraft/world/level/biome/Climate$Parameter;Lnet/minecraft/world/level/biome/Climate$Parameter;Lnet/minecraft/world/level/biome/Climate$Parameter;FLnet/minecraft/resources/ResourceKey;)V"))
    private void ww$deepOceanSlots(OverworldBiomeBuilder self, Consumer<Pair<Climate.ParameterPoint, ResourceKey<Biome>>> out,
                                   Climate.Parameter temperature, Climate.Parameter humidity, Climate.Parameter continentalness,
                                   Climate.Parameter erosion, Climate.Parameter weirdness, float offset, ResourceKey<Biome> biome) {
        int t = -1;
        for (int i = 0; i < temperatures.length; i++) {
            if (temperatures[i].equals(temperature)) {
                t = i;
            }
        }
        if (!continentalness.equals(deepOceanContinentalness) || t < 1) {
            surface(out, temperature, humidity, continentalness, erosion, weirdness, offset, biome);
            return;
        }
        surface(out, temperature, humidity, Climate.Parameter.span(ABYSS, -0.455f), erosion, weirdness, offset, biome);
        surface(out, temperature, humidity, Climate.Parameter.span(-1.05f, ABYSS), erosion, weirdness, offset,
                t <= 2 ? OceanWorldgen.ABYSSAL_TRENCH : OceanWorldgen.VOLCANIC_DEPTHS);
    }

    /** As vanilla's addSurfaceBiome: at the surface and below it. */
    private static void surface(Consumer<Pair<Climate.ParameterPoint, ResourceKey<Biome>>> out, Climate.Parameter temperature,
                                Climate.Parameter humidity, Climate.Parameter continentalness, Climate.Parameter erosion,
                                Climate.Parameter weirdness, float offset, ResourceKey<Biome> biome) {
        out.accept(Pair.of(Climate.parameters(temperature, humidity, continentalness, erosion, Climate.Parameter.point(0.0f), weirdness, offset), biome));
        out.accept(Pair.of(Climate.parameters(temperature, humidity, continentalness, erosion, Climate.Parameter.point(1.0f), weirdness, offset), biome));
    }
}
