package dev.lowpix.winterworks.mixin.client.hex;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.lowpix.winterworks.client.curse.SoulFireClient;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.Material;
import net.minecraft.world.entity.Entity;
import org.joml.Quaternionf;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Entities burning with soul fire (Wrath, Envy, the Soul Bull) wear blue soul flames: client.curse.SoulFireClient. */
@Mixin(EntityRenderDispatcher.class)
public abstract class SoulFlameMixin {
    @WrapOperation(method = "renderFlame", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/resources/model/Material;sprite()Lnet/minecraft/client/renderer/texture/TextureAtlasSprite;"))
    private TextureAtlasSprite ww$soulFlame(Material material, Operation<TextureAtlasSprite> original, PoseStack pose,
                                            MultiBufferSource buffers, Entity entity, Quaternionf rotation) {
        return SoulFireClient.sprite(material, original.call(material), entity);
    }
}
