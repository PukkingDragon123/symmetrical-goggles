package dev.lowpix.winterworks.mixin.client;

import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.express.LoopMotion;
import net.minecraft.client.Camera;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Riding a Coaster Loop, the camera goes round with you: your eyes are where your tipped head is, and the whole view
 * turns with the cart (the world hangs overhead at the top). Third person orbits the same way. Where you look (and
 * aim) is unchanged.
 */
@Mixin(Camera.class)
public abstract class LoopCameraMixin {
    @Shadow
    private Vec3 position;

    @Shadow
    @Final
    private Quaternionf rotation;

    @Shadow
    @Final
    private Vector3f forwards;

    @Shadow
    @Final
    private Vector3f up;

    @Shadow
    @Final
    private Vector3f left;

    @Shadow
    private float eyeHeight;

    @Shadow
    private float eyeHeightOld;

    @Shadow
    protected abstract void setPosition(Vec3 pos);

    @Inject(method = "setup", at = @At("TAIL"))
    private void ww$rideTheLoop(BlockGetter level, Entity entity, boolean detached, boolean mirrored, float partial, CallbackInfo ci) {
        LoopMotion m = CoasterLoop.vehicleMotion(entity);
        if (m == null) {
            return;
        }
        float th = m.interpolatedTheta(partial);
        Quaternionf q = m.rotation(th);
        double eye = Mth.lerp(partial, eyeHeightOld, eyeHeight);
        Vec3 feet = new Vec3(Mth.lerp(partial, entity.xo, entity.getX()), Mth.lerp(partial, entity.yo, entity.getY()),
                Mth.lerp(partial, entity.zo, entity.getZ()));
        Vec3 upright = feet.add(0, eye, 0);
        Vec3 tipped = feet.add(m.up(th).scale(eye));
        Vector3f off = new Vector3f((float) (position.x - upright.x), (float) (position.y - upright.y),
                (float) (position.z - upright.z)).rotate(q);   // third person: swing the camera arm round too
        setPosition(tipped.add(off.x, off.y, off.z));
        rotation.premul(q);
        new Vector3f(0f, 0f, -1f).rotate(rotation, forwards);
        new Vector3f(0f, 1f, 0f).rotate(rotation, up);
        new Vector3f(-1f, 0f, 0f).rotate(rotation, left);
    }
}
