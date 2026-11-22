package dev.lowpix.winterworks.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.golem.PotGlow;
import net.minecraft.client.renderer.BlockEntityWithoutLevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Ability pots glow as items too (docs/FIXES_0_4.md, the Pot Golem): after vanilla draws a decorated pot item (icon,
 * hand, ground, frame), a pot with the same ability sherd on all four faces gets the full-bright pattern pass in its
 * ability's colour (client.golem.PotGlow). Mixed pots are left as vanilla draws them.
 */
@Mixin(BlockEntityWithoutLevelRenderer.class)
public abstract class PotItemGlowMixin {
    @Inject(method = "renderByItem", at = @At("RETURN"))
    private void ww$abilityPotGlow(ItemStack stack, ItemDisplayContext ctx, PoseStack pose, MultiBufferSource buffers, int light,
                                   int overlay, CallbackInfo ci) {
        if (stack.is(Items.DECORATED_POT)) {
            PotGlow.renderItem(stack, pose, buffers);
        }
    }
}
