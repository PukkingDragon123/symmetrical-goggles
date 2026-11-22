package dev.lowpix.winterworks.mixin.client.endboss;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.lowpix.winterworks.client.endboss.DragonWings;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.entity.EnderDragonRenderer;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The enraged dragon's second pair of wings (docs/END_UPDATE.md section 10): the model's own wings drawn again further
 * back along the body, smaller and a beat behind, inside the body's transform (just before it is popped).
 */
@Mixin(EnderDragonRenderer.DragonModel.class)
public abstract class DragonModelMixin {
    @Shadow
    @Final
    private ModelPart leftWing;
    @Shadow
    @Final
    private ModelPart leftWingTip;
    @Shadow
    @Final
    private ModelPart rightWing;
    @Shadow
    @Final
    private ModelPart rightWingTip;
    @Shadow
    @Nullable
    private EnderDragon entity;
    @Shadow
    private float a;

    @Inject(method = "renderToBuffer", at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;popPose()V", ordinal = 0))
    private void ww$secondWings(PoseStack pose, VertexConsumer buffer, int light, int overlay, int color, CallbackInfo ci) {
        if (entity != null && DragonWings.shown(entity)) {
            DragonWings.render(entity, a, pose, buffer, light, overlay, color, leftWing, leftWingTip, rightWing, rightWingTip);
        }
    }
}
