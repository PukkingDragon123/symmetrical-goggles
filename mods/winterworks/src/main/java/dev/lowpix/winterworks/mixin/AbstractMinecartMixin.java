package dev.lowpix.winterworks.mixin;

import com.llamalad7.mixinextras.sugar.Local;
import dev.lowpix.winterworks.express.CartRide;
import dev.lowpix.winterworks.express.CartSpeed;
import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.express.LoopMotion;
import dev.lowpix.winterworks.express.RailPhysics;
import dev.lowpix.winterworks.express.SwitchRailBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.RailShape;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Every minecart (vanilla ones too) reacts to Winter Express rails and can be boosted past the vanilla speed limit;
 * it rides Coaster Loops (its tick is replaced while it loops, on both sides) and is routed by Switch Rails.
 */
@Mixin(AbstractMinecart.class)
public abstract class AbstractMinecartMixin implements CartSpeed, CartRide {
    @Unique
    private double ww$speedFactor = 1.0;

    @Unique
    private net.minecraft.world.phys.Vec3 ww$heldDir;

    @Unique
    @Nullable
    private LoopMotion ww$loop;

    @Unique
    @Nullable
    private BlockPos ww$loopCooldown, ww$onSwitch, ww$routePos;

    @Unique
    @Nullable
    private RailShape ww$routeShape;

    @Unique
    private long ww$routeTime;

    @Override
    public net.minecraft.world.phys.Vec3 ww$heldDir() {
        return ww$heldDir;
    }

    @Override
    public void ww$setHeldDir(net.minecraft.world.phys.Vec3 dir) {
        ww$heldDir = dir;
    }

    @Override
    public double ww$speedFactor() {
        return ww$speedFactor;
    }

    @Override
    public void ww$setSpeedFactor(double f) {
        ww$speedFactor = f;
    }

    @Override
    public LoopMotion ww$loop() {
        return ww$loop;
    }

    @Override
    public void ww$setLoop(LoopMotion motion) {
        ww$loop = motion;
    }

    @Override
    public BlockPos ww$loopCooldown() {
        return ww$loopCooldown;
    }

    @Override
    public void ww$setLoopCooldown(BlockPos loop) {
        ww$loopCooldown = loop;
    }

    @Override
    public BlockPos ww$onSwitch() {
        return ww$onSwitch;
    }

    @Override
    public void ww$setOnSwitch(BlockPos pos) {
        ww$onSwitch = pos;
    }

    @Override
    public BlockPos ww$routePos() {
        return ww$routePos;
    }

    @Override
    public RailShape ww$routeShape() {
        return ww$routeShape;
    }

    @Override
    public long ww$routeTime() {
        return ww$routeTime;
    }

    @Override
    public void ww$setRoute(BlockPos pos, RailShape shape, long gameTime) {
        ww$routePos = pos;
        ww$routeShape = shape;
        ww$routeTime = gameTime;
    }

    @Inject(method = "getMaxSpeed", at = @At("RETURN"), cancellable = true)
    private void ww$maxSpeed(CallbackInfoReturnable<Double> cir) {
        if (ww$speedFactor > 1.0) {
            cir.setReturnValue(cir.getReturnValue() * ww$speedFactor);
        }
    }

    /** Riding a Coaster Loop: scripted motion instead of the normal tick (server and client alike). */
    @Inject(method = "tick", at = @At("HEAD"), cancellable = true)
    private void ww$loopTick(CallbackInfo ci) {
        if (ww$loop != null) {
            CoasterLoop.tick((AbstractMinecart) (Object) this, ww$loop);
            ci.cancel();
        }
    }

    @Inject(method = "tick", at = @At("TAIL"))
    private void ww$afterTick(CallbackInfo ci) {
        RailPhysics.afterTick((AbstractMinecart) (Object) this);
    }

    /** The client follows the loop itself while it lasts: no snapping back to stale server positions. */
    @Inject(method = "lerpTo", at = @At("HEAD"), cancellable = true)
    private void ww$noLerpInLoop(double x, double y, double z, float yRot, float xRot, int steps, CallbackInfo ci) {
        if (ww$loop != null) {
            ci.cancel();
        }
    }

    /** Switch Rails set their points for each cart that rolls onto them. */
    @ModifyVariable(method = "moveAlongTrack", at = @At("HEAD"), argsOnly = true)
    private BlockState ww$switchRail(BlockState state, @Local(argsOnly = true) BlockPos pos) {
        return SwitchRailBlock.route((AbstractMinecart) (Object) this, pos, state);
    }

    /** A loop ride survives a save (the chunk unloading mid-loop, or the game quitting). */
    @Inject(method = "addAdditionalSaveData", at = @At("TAIL"))
    private void ww$saveLoop(CompoundTag tag, CallbackInfo ci) {
        if (ww$loop != null) {
            tag.put("WinterworksLoop", ww$loop.save());
        }
    }

    @Inject(method = "readAdditionalSaveData", at = @At("TAIL"))
    private void ww$loadLoop(CompoundTag tag, CallbackInfo ci) {
        ww$loop = tag.contains("WinterworksLoop") ? LoopMotion.load(tag.getCompound("WinterworksLoop")) : null;
    }
}
