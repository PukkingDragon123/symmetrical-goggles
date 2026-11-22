package dev.lowpix.winterworks.mixin.oceangear;

import dev.lowpix.winterworks.oceangear.ElderBoss;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MoveTowardsRestrictionGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.monster.ElderGuardian;
import net.minecraft.world.entity.monster.Guardian;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import org.joml.Vector3f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Every Elder Guardian is the boss (oceangear.ElderBoss): 300 health, vanilla's laser goal swapped for the boss's own
 * attacks and hovering, the synced attack / beam aim / enraged flag for the client, a 2 s death clip, and saving.
 */
@Mixin(ElderGuardian.class)
public abstract class ElderGuardianMixin extends Guardian implements ElderBoss.Holder {
    @Unique
    private static final EntityDataAccessor<Byte> WW_ATTACK = SynchedEntityData.defineId(ElderGuardian.class, EntityDataSerializers.BYTE);
    @Unique
    private static final EntityDataAccessor<Vector3f> WW_AIM = SynchedEntityData.defineId(ElderGuardian.class, EntityDataSerializers.VECTOR3);
    @Unique
    private static final EntityDataAccessor<Boolean> WW_ENRAGED = SynchedEntityData.defineId(ElderGuardian.class, EntityDataSerializers.BOOLEAN);
    @Unique
    private final ElderBoss.State ww$boss = new ElderBoss.State();

    protected ElderGuardianMixin(EntityType<? extends Guardian> type, Level level) {
        super(type, level);
    }

    @Inject(method = "createAttributes", at = @At("RETURN"))
    private static void ww$bossHealth(CallbackInfoReturnable<AttributeSupplier.Builder> cir) {
        cir.getReturnValue().add(Attributes.MAX_HEALTH, ElderBoss.MAX_HEALTH).add(Attributes.FOLLOW_RANGE, ElderBoss.LEASH);
    }

    /** Vanilla's laser goal and target selector out; the boss's hover goal in (its attacks run from aiStep). */
    @Inject(method = "<init>", at = @At("RETURN"))
    private void ww$bossGoals(EntityType<? extends ElderGuardian> type, Level level, CallbackInfo ci) {
        goalSelector.removeAllGoals(g -> true);
        targetSelector.removeAllGoals(g -> true);
        ElderGuardian self = (ElderGuardian) (Object) this;
        goalSelector.addGoal(1, new ElderBoss.HoverGoal(self));
        goalSelector.addGoal(5, new MoveTowardsRestrictionGoal(this, 1.0));
        if (randomStrollGoal == null) {
            randomStrollGoal = new RandomStrollGoal(this, 1.0, 400);
        }
        goalSelector.addGoal(7, randomStrollGoal);
        goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 12f));
        goalSelector.addGoal(9, new RandomLookAroundGoal(this));
    }

    @Override
    public ElderBoss.State ww$boss() {
        return ww$boss;
    }

    @Override
    public byte ww$attack() {
        return entityData.get(WW_ATTACK);
    }

    @Override
    public void ww$setAttack(byte attack) {
        entityData.set(WW_ATTACK, attack);
    }

    @Override
    public Vector3f ww$aim() {
        return entityData.get(WW_AIM);
    }

    @Override
    public void ww$setAim(Vector3f aim) {
        entityData.set(WW_AIM, aim);
    }

    @Override
    public boolean ww$enraged() {
        return entityData.get(WW_ENRAGED);
    }

    @Override
    public void ww$setEnraged(boolean enraged) {
        entityData.set(WW_ENRAGED, enraged);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(WW_ATTACK, ElderBoss.IDLE);
        builder.define(WW_AIM, new Vector3f());
        builder.define(WW_ENRAGED, false);
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (WW_ATTACK.equals(key) && level().isClientSide) {
            ElderBoss.attackSynced((ElderGuardian) (Object) this, entityData.get(WW_ATTACK));
        }
    }

    @Override
    public void aiStep() {
        super.aiStep();
        if (!level().isClientSide) {
            ElderBoss.tick((ElderGuardian) (Object) this);
        }
    }

    /** The 2 s death clip plays out before it goes (vanilla removes the dead after 1 s). */
    @Override
    protected void tickDeath() {
        if (deathTime < 39) {
            deathTime++;
            return;
        }
        super.tickDeath();
    }

    @Override
    public void stopSeenByPlayer(ServerPlayer player) {
        super.stopSeenByPlayer(player);
        ElderBoss.untrack((ElderGuardian) (Object) this, player);
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        ElderBoss.save(ww$boss, tag);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        ElderBoss.load(ww$boss, tag);
    }
}
