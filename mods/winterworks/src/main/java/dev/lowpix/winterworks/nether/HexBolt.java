package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import java.util.UUID;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Piglin Witch's hex bolt (docs/FIXES_0_4.md "Hex bolts"): a knot of soul fire that homes on its target, turning a
 * little each tick (dodgeable at the last moment), and on a hit deals {@link #DAMAGE} magic damage and sets the victim
 * alight with soul fire (Curses.soulIgnite). It never hits the witch's crew. Drawn as particles only.
 */
public class HexBolt extends Projectile {
    public static final float DAMAGE = 5f;
    public static final int SOUL_FIRE_TICKS = 60, LIFE = 120;
    private static final double SPEED = 0.55, TURN = 0.14;
    @Nullable
    private UUID targetId;
    @Nullable
    private Entity target;

    public HexBolt(EntityType<? extends HexBolt> type, Level level) {
        super(type, level);
        noPhysics = true;
    }

    /** A bolt from `owner`'s hand, launched along `dir`, homing on `target`. */
    public static HexBolt shoot(LivingEntity owner, Vec3 from, Vec3 dir, @Nullable LivingEntity target) {
        HexBolt b = new HexBolt(WWEntities.HEX_BOLT, owner.level());
        b.setOwner(owner);
        b.setPos(from);
        b.setDeltaMovement(dir.normalize().scale(SPEED));
        b.target = target;
        b.targetId = target == null ? null : target.getUUID();
        owner.level().addFreshEntity(b);
        return b;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {}

    @Nullable
    public Entity target() {
        if (target == null && targetId != null && level() instanceof ServerLevel sl) {
            target = sl.getEntity(targetId);
        }
        return target;
    }

    @Override
    public void tick() {
        super.tick();
        Vec3 v = getDeltaMovement();
        if (!level().isClientSide) {
            if (tickCount > LIFE) {
                fizzle();
                return;
            }
            Entity t = target();
            if (t != null && t.isAlive() && t.level() == level()) {
                Vec3 want = t.getBoundingBox().getCenter().subtract(position()).normalize().scale(SPEED);
                v = v.add(want.subtract(v).scale(TURN)).normalize().scale(SPEED);
                setDeltaMovement(v);
            }
            HitResult hit = ProjectileUtil.getHitResultOnMoveVector(this, this::canHitEntity);
            if (hit.getType() != HitResult.Type.MISS) {
                hitTargetOrDeflectSelf(hit);
                if (isRemoved()) {
                    return;
                }
            }
        } else {
            Vec3 p = position();
            for (int i = 0; i < 3; i++) {
                double k = i / 3.0;
                level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, p.x - v.x * k + (random.nextDouble() - 0.5) * 0.12,
                        p.y + 0.2 - v.y * k + (random.nextDouble() - 0.5) * 0.12, p.z - v.z * k + (random.nextDouble() - 0.5) * 0.12,
                        0, 0, 0);
            }
            if (random.nextInt(3) == 0) {
                level().addParticle(WWParticles.HEX_RUNE, p.x, p.y + 0.2, p.z, 0, 0, 0);
            }
            if (random.nextInt(4) == 0) {
                level().addParticle(ParticleTypes.SOUL, p.x, p.y + 0.2, p.z, -v.x * 0.2, -v.y * 0.2, -v.z * 0.2);
            }
        }
        setPos(getX() + v.x, getY() + v.y, getZ() + v.z);
        setYRot((float) (Math.atan2(v.x, v.z) * (180.0 / Math.PI)));
    }

    @Override
    protected boolean canHitEntity(Entity e) {
        return super.canHitEntity(e) && !(e instanceof HexBolt) && !WitchCrew.sameCrew(getOwner(), e) && e != getOwner();
    }

    @Override
    protected void onHitEntity(EntityHitResult hit) {
        super.onHitEntity(hit);
        Entity e = hit.getEntity();
        Entity owner = getOwner();
        e.hurt(damageSources().indirectMagic(this, owner instanceof LivingEntity le ? le : null), DAMAGE);
        if (e instanceof LivingEntity le) {
            Curses.soulIgnite(le, SOUL_FIRE_TICKS);
        }
        burst();
        discard();
    }

    @Override
    protected void onHitBlock(BlockHitResult hit) {
        super.onHitBlock(hit);
        burst();
        discard();
    }

    private void fizzle() {
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.SMOKE, getX(), getY() + 0.2, getZ(), 6, 0.1, 0.1, 0.1, 0.02);
        }
        discard();
    }

    private void burst() {
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 0.2, getZ(), 16, 0.25, 0.25, 0.25, 0.06);
            sl.sendParticles(WWParticles.HEX_RUNE, getX(), getY() + 0.2, getZ(), 4, 0.2, 0.2, 0.2, 0.02);
            sl.playSound(null, getX(), getY(), getZ(), SoundEvents.SOUL_ESCAPE.value(), SoundSource.HOSTILE, 1.2f, 0.7f + random.nextFloat() * 0.3f);
            sl.playSound(null, getX(), getY(), getZ(), SoundEvents.FIRECHARGE_USE, SoundSource.HOSTILE, 0.6f, 1.5f);
        }
    }

    @Override
    public boolean isOnFire() {
        return false;
    }

    @Override
    public boolean shouldRenderAtSqrDistance(double d) {
        return d < 64 * 64;
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (targetId != null) {
            tag.putUUID("Target", targetId);
        }
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        targetId = tag.hasUUID("Target") ? tag.getUUID("Target") : null;
    }
}
