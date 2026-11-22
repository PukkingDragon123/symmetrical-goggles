package dev.lowpix.winterworks.mixin.oceanmob;

import com.llamalad7.mixinextras.injector.WrapWithCondition;
import net.minecraft.core.Holder;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionBrewing;
import net.minecraft.world.item.alchemy.Potions;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Night Vision now brews from an angler lure (oceanmob.OceanMobFeature adds it): the vanilla awkward potion + golden carrot
 * mix is left out. The long (redstone) and invisibility (fermented spider eye) mixes from Night Vision stay as they are.
 */
@Mixin(PotionBrewing.class)
public abstract class NightVisionBrewingMixin {
    @WrapWithCondition(method = "addVanillaMixes", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/world/item/alchemy/PotionBrewing$Builder;addMix(Lnet/minecraft/core/Holder;Lnet/minecraft/world/item/Item;Lnet/minecraft/core/Holder;)V"))
    private static boolean ww$noGoldenCarrotNightVision(PotionBrewing.Builder builder, Holder<Potion> from, Item ingredient, Holder<Potion> to) {
        return !(ingredient == Items.GOLDEN_CARROT && to.is(Potions.NIGHT_VISION));
    }
}
