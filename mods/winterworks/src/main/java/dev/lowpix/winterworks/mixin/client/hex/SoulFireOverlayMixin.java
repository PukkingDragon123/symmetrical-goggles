package dev.lowpix.winterworks.mixin.client.hex;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.lowpix.winterworks.client.curse.SoulFireClient;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.Material;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** A player burning with soul fire sees soul fire on the first-person fire overlay: client.curse.SoulFireClient. */
@Mixin(ScreenEffectRenderer.class)
public abstract class SoulFireOverlayMixin {
    @WrapOperation(method = "renderFire", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/resources/model/Material;sprite()Lnet/minecraft/client/renderer/texture/TextureAtlasSprite;"))
    private static TextureAtlasSprite ww$soulOverlay(Material material, Operation<TextureAtlasSprite> original) {
        return SoulFireClient.overlaySprite(original.call(material));
    }
}
