package dev.lowpix.winterworks.mixin.client.hex;

import com.mojang.blaze3d.vertex.ByteBufferBuilder;
import dev.lowpix.winterworks.client.hex.SoulGlint;
import java.util.SequencedMap;
import net.minecraft.client.renderer.RenderBuffers;
import net.minecraft.client.renderer.RenderType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/** The soul glints get fixed buffers like vanilla's glints, so they batch beside the items they shine on. */
@Mixin(RenderBuffers.class)
public abstract class SoulGlintBuffersMixin {
    @ModifyArg(method = "<init>", at = @At(value = "INVOKE",
            target = "Lnet/minecraft/client/renderer/MultiBufferSource;immediateWithBuffers(Ljava/util/SequencedMap;Lcom/mojang/blaze3d/vertex/ByteBufferBuilder;)Lnet/minecraft/client/renderer/MultiBufferSource$BufferSource;"),
            index = 0)
    private SequencedMap<RenderType, ByteBufferBuilder> ww$soulGlintBuffers(SequencedMap<RenderType, ByteBufferBuilder> buffers) {
        SoulGlint.addFixedBuffers(buffers);
        return buffers;
    }
}
