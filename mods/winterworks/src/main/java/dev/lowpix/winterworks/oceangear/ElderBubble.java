package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import java.util.EnumSet;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.RelativeMovement;
import net.minecraft.world.entity.monster.Guardian;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Elder Guardian's bubble (docs/OCEAN_UPDATE.md section 6): drifts at you (homing a little for its first second),
 * and whatever it catches is <b>trapped</b> inside it for {@link #TRAP_TICKS} ticks: held, dragged toward the boss and
 * hurt every half second, then it pops with a last burst. Hit it (from outside or from inside) to pop it early; a free
 * bubble pops harmlessly on a block, a hit, or after {@link #LIFE} ticks. Guardians are never caught.
 */
public class ElderBubble extends Projectile {
    private static final EntityDataAccessor<Integer> TRAPPED = SynchedEntityData.defineId(ElderBubble.class, EntityDataSerializers.INT);
    public static final int LIFE = 110, TRAP_TICKS = 40, PULSE = 10, HOMING_TICKS = 24;
    public static final float CATCH_DAMAGE = 1f, PULSE_DAMAGE = 1.5f, POP_DAMAGE = 3f;
    private static final double DRAG_SPEED = 0.07;
    private int life, trapTicks;
    private int homingId;

    public ElderBubble(EntityType<? extends ElderBubble> type, Level level) {
        super(type, level);
    }

    public ElderBubble(Level level, LivingEntity owner, Vec3 at, Vec3 motion, @Nullable LivingEntity homingOn) {
        this(OceanEntities.ELDER_BUBBLE, level);
        setOwner(owner);
        setPos(at.x, at.y - 0.4, at.z);
        setDeltaMovement(motion);
        homingId = homingOn != null ? homingOn.getId() : 0;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        builder.define(TRAPPED, 0);
    }

    /** The id of what it holds (0: nothing). */
    public int trappedId() {
        return entityData.get(TRAPPED);
    }

    @Nullable
    public Entity trapped() {
        int id = trappedId();
        return id == 0 ? null : level().getEntity(id);
    }

    public int trapTicks() {
        return trapTicks;
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (TRAPPED.equals(key)) {
            refreshDimensions();
        }
    }

    @Override
    public EntityDimensions getDimensions(Pose pose) {
        return trappedId() != 0 ? EntityDimensions.scalable(1.5f, 2.3f) : super.getDimensions(pose);
    }

    @Override
    protected double getDefaultGravity() {
        return 0;
    }

    @Override
    public boolean isPickable() {
        return true;
    }

    @Override
    public float getPickRadius() {
        return 0.2f;
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (isInvulnerableTo(source)) {
            return false;
        }
        if (!level().isClientSide) {
            pop(false);
        }
        return true;
    }

    @Override
    protected boolean canHitEntity(Entity e) {
        if (!(e instanceof LivingEntity) || e instanceof Guardian || !super.canHitEntity(e) || held(e)) {
            return false;
        }
        return !(e instanceof Player p) || (!p.isCreative() && !p.isSpectator());
    }

    /** Is `e` already inside another bubble? */
    private boolean held(Entity e) {
        for (ElderBubble b : level().getEntitiesOfClass(ElderBubble.class, e.getBoundingBox().inflate(2))) {
            if (b != this && b.trappedId() == e.getId()) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void tick() {
        super.tick();
        if (trappedId() != 0) {
            tickTrap();
            return;
        }
        life++;
        Vec3 v = getDeltaMovement();
        if (!level().isClientSide) {
            if (life > LIFE || (!isInWater() && life > LIFE / 2)) {
                pop(false);
                return;
            }
            if (life < HOMING_TICKS && homingId != 0 && level().getEntity(homingId) instanceof LivingEntity t && t.isAlive()) {
                Vec3 want = t.position().add(0, t.getBbHeight() * 0.5, 0).subtract(position()).normalize().scale(v.length());
                v = v.lerp(want, 0.06);
                setDeltaMovement(v);
            }
        }
        HitResult hit = ProjectileUtil.getHitResultOnMoveVector(this, this::canHitEntity);
        if (hit.getType() != HitResult.Type.MISS) {
            hitTargetOrDeflectSelf(hit);
            if (isRemoved() || trappedId() != 0) {
                return;
            }
        }
        if (!isInWater()) {
            setDeltaMovement(v.scale(0.95).add(0, 0.004, 0));
        }
        Vec3 p = position().add(getDeltaMovement());
        setPos(p.x, p.y, p.z);
        float wob = (tickCount + getId()) * 0.35f;
        if (level().isClientSide && tickCount % 2 == 0) {
            level().addParticle(WWParticles.ELDER_BUBBLE, getX() + Mth.sin(wob) * 0.2, getY() + 0.3, getZ() + Mth.cos(wob) * 0.2,
                    0, 0.01, 0);
        }
    }

    @Override
    protected void onHitEntity(EntityHitResult hit) {
        super.onHitEntity(hit);
        if (!level().isClientSide && hit.getEntity() instanceof LivingEntity victim) {
            trap(victim);
        }
    }

    @Override
    protected void onHitBlock(BlockHitResult hit) {
        super.onHitBlock(hit);
        if (!level().isClientSide) {
            pop(false);
        }
    }

    /** Catches `victim`: the bubble swells round it. */
    public void trap(LivingEntity victim) {
        entityData.set(TRAPPED, victim.getId());
        trapTicks = 0;
        setDeltaMovement(Vec3.ZERO);
        setPos(victim.getX(), victim.getY() - 0.2, victim.getZ());
        victim.hurt(damageSources().mobProjectile(this, getOwner() instanceof LivingEntity o ? o : null), CATCH_DAMAGE);
        level().playSound(null, getX(), getY(), getZ(), SoundEvents.BUBBLE_COLUMN_WHIRLPOOL_INSIDE, SoundSource.HOSTILE, 1f, 1.3f);
    }

    private void tickTrap() {
        Entity v = trapped();
        if (level().isClientSide) {
            if (v != null && tickCount % 3 == 0) {
                level().addParticle(ParticleTypes.BUBBLE, v.getRandomX(0.8), v.getRandomY(), v.getRandomZ(0.8), 0, 0.05, 0);
            }
            return;
        }
        if (!(v instanceof LivingEntity victim) || !victim.isAlive() || v.level() != level()) {
            pop(false);
            return;
        }
        trapTicks++;
        Vec3 c = position();
        Vec3 pull = Vec3.ZERO;
        if (getOwner() instanceof LivingEntity boss && boss.isAlive()) {   // dragged toward the boss, stopping short of it
            Vec3 to = boss.position().add(0, 0.3, 0).subtract(c);
            if (to.length() > 3.0) {
                pull = to.normalize().scale(DRAG_SPEED);
            }
        } else {
            pull = new Vec3(0, 0.03, 0);
        }
        if (!level().noCollision(victim, victim.getBoundingBox().move(pull))) {
            pull = Vec3.ZERO;
        }
        Vec3 n = c.add(pull);
        setPos(n.x, n.y, n.z);
        hold(victim, n.add(0, 0.2, 0));
        if (trapTicks % PULSE == 0 && trapTicks < TRAP_TICKS) {
            victim.hurt(damageSources().mobProjectile(this, getOwner() instanceof LivingEntity o ? o : null), PULSE_DAMAGE);
        }
        if (trapTicks >= TRAP_TICKS) {
            pop(true);
        }
    }

    /** Keeps the victim inside: players are moved by their connection (their own camera left alone). */
    private static void hold(LivingEntity victim, Vec3 at) {
        victim.setDeltaMovement(Vec3.ZERO);
        victim.fallDistance = 0;
        if (victim instanceof ServerPlayer sp) {
            sp.connection.teleport(at.x, at.y, at.z, 0f, 0f, EnumSet.of(RelativeMovement.X_ROT, RelativeMovement.Y_ROT));
        } else {
            victim.setPos(at.x, at.y, at.z);
        }
    }

    /** Pops it: with `burst` (it held someone the whole time) a last hit for them. */
    public void pop(boolean burst) {
        if (isRemoved()) {
            return;
        }
        Entity v = trapped();
        if (burst && v instanceof LivingEntity victim) {
            victim.hurt(damageSources().mobProjectile(this, getOwner() instanceof LivingEntity o ? o : null), POP_DAMAGE);
        }
        if (level() instanceof ServerLevel sl) {
            double r = trappedId() != 0 ? 0.7 : 0.3;
            sl.sendParticles(WWParticles.ELDER_BUBBLE, getX(), getY() + getBbHeight() * 0.5, getZ(), trappedId() != 0 ? 18 : 6, r, r, r, 0.05);
            sl.sendParticles(ParticleTypes.BUBBLE_POP, getX(), getY() + getBbHeight() * 0.5, getZ(), 10, r, r, r, 0.05);
            sl.playSound(null, getX(), getY(), getZ(), SoundEvents.BUBBLE_COLUMN_BUBBLE_POP, SoundSource.HOSTILE, 1.2f, 0.8f);
        }
        discard();
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("Life", life);
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        life = tag.getInt("Life");
    }

    @Override
    public boolean shouldRenderAtSqrDistance(double d) {
        return d < 64 * 64;
    }
}
