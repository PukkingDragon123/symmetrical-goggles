package dev.lowpix.winterworks.mixin.endboss;

import dev.lowpix.winterworks.endboss.DragonRage;
import dev.lowpix.winterworks.endboss.DragonRework;
import java.util.List;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.boss.EnderDragonPart;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** The Ender Dragon rework (endboss.DragonRework): its state, the synced second-phase flag, and the hooks it needs. */
@Mixin(EnderDragon.class)
public abstract class EnderDragonMixin extends Mob implements DragonRage {
    @Unique
    private static final EntityDataAccessor<Boolean> WW_PHASE_TWO = SynchedEntityData.defineId(EnderDragon.class, EntityDataSerializers.BOOLEAN);
    @Unique
    private final DragonRework.State ww$state = new DragonRework.State();

    protected EnderDragonMixin(EntityType<? extends Mob> type, Level level) {
        super(type, level);
    }

    @Override
    public DragonRework.State ww$rework() {
        return ww$state;
    }

    @Override
    public boolean ww$phaseTwo() {
        return entityData.get(WW_PHASE_TWO);
    }

    @Override
    public void ww$setPhaseTwo(boolean on) {
        entityData.set(WW_PHASE_TWO, on);
    }

    @Inject(method = "defineSynchedData", at = @At("TAIL"))
    private void ww$define(SynchedEntityData.Builder builder, CallbackInfo ci) {
        builder.define(WW_PHASE_TWO, false);
    }

    @Inject(method = "aiStep", at = @At("TAIL"))
    private void ww$tick(CallbackInfo ci) {
        if (!level().isClientSide) {
            DragonRework.tick((EnderDragon) (Object) this);
        }
    }

    @Inject(method = "addAdditionalSaveData", at = @At("TAIL"))
    private void ww$save(CompoundTag tag, CallbackInfo ci) {
        DragonRework.save(ww$state, tag);
    }

    @Inject(method = "readAdditionalSaveData", at = @At("TAIL"))
    private void ww$load(CompoundTag tag, CallbackInfo ci) {
        DragonRework.load(ww$state, tag);
        if (ww$state.phaseTwo) {
            ww$setPhaseTwo(true);
        }
    }

    /** A hit on its head frees whoever it carries. */
    @Inject(method = "hurt(Lnet/minecraft/world/entity/boss/EnderDragonPart;Lnet/minecraft/world/damagesource/DamageSource;F)Z", at = @At("HEAD"))
    private void ww$partHurt(EnderDragonPart part, DamageSource source, float amount, CallbackInfoReturnable<Boolean> cir) {
        DragonRework.onPartHurt((EnderDragon) (Object) this, part, source);
    }

    /** The one in its jaws isn't bitten again or knocked away by its wings every tick. */
    @Inject(method = "hurt(Ljava/util/List;)V", at = @At("HEAD"))
    private void ww$contact(List<Entity> touched, CallbackInfo ci) {
        DragonRework.filterContact((EnderDragon) (Object) this, touched);
    }

    @Inject(method = "knockBack", at = @At("HEAD"))
    private void ww$wings(ServerLevel level, List<Entity> touched, CallbackInfo ci) {
        DragonRework.filterContact((EnderDragon) (Object) this, touched);
    }
}
