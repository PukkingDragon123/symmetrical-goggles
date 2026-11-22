package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndParticles;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AreaEffectCloud;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ThrowableProjectile;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * The Gucker's spit (docs/END_UPDATE.md section 7): a ball of blinding dust. Whatever it hits (an entity or the ground)
 * bursts into a cloud of `blinding_dust` that gives Blindness for 4 s; the one it hit gets it straight away.
 */
public class GuckerSpit extends ThrowableProjectile {
    public static final int BLINDNESS_TICKS = 80;
    public static final float CLOUD_RADIUS = 2.5f;
    public static final int CLOUD_TICKS = 80;

    public GuckerSpit(EntityType<? extends ThrowableProjectile> type, Level level) {
        super(type, level);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {}

    @Override
    protected double getDefaultGravity() {
        return 0.03;
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide && random.nextInt(2) == 0) {
            Vec3 v = getDeltaMovement();
            level().addParticle(EndParticles.BLINDING_DUST, getX() - v.x * 0.5, getY() + 0.1, getZ() - v.z * 0.5,
                    (random.nextDouble() - 0.5) * 0.02, 0.01, (random.nextDouble() - 0.5) * 0.02);
        }
        if (tickCount > 200) {
            discard();
        }
    }

    @Override
    protected void onHitEntity(EntityHitResult hit) {
        super.onHitEntity(hit);
        Entity e = hit.getEntity();
        if (!level().isClientSide && e instanceof LivingEntity le && e != getOwner()) {
            le.addEffect(new MobEffectInstance(MobEffects.BLINDNESS, BLINDNESS_TICKS), getEffectSource());
            le.hurt(damageSources().mobProjectile(this, getOwner() instanceof LivingEntity o ? o : null), 0.5f);
        }
    }

    @Override
    protected boolean canHitEntity(Entity e) {
        return super.canHitEntity(e) && !(e instanceof Gucker);
    }

    @Override
    protected void onHit(HitResult hit) {
        super.onHit(hit);
        if (!level().isClientSide && !isRemoved()) {
            Vec3 at = hit.getLocation();
            burst(at);
            playSound(SoundEvents.SAND_BREAK, 1.0f, 0.7f);
            discard();
        }
    }

    /** The dust cloud: Blindness 4 s for whoever stands in it. */
    public AreaEffectCloud burst(Vec3 at) {
        AreaEffectCloud cloud = new AreaEffectCloud(level(), at.x, at.y - 0.4, at.z);
        if (getOwner() instanceof LivingEntity o) {
            cloud.setOwner(o);
        }
        cloud.setParticle(EndParticles.BLINDING_DUST);
        cloud.setRadius(CLOUD_RADIUS);
        cloud.setRadiusOnUse(-0.1f);
        cloud.setWaitTime(0);
        cloud.setDuration(CLOUD_TICKS);
        cloud.setRadiusPerTick(-cloud.getRadius() / cloud.getDuration() * 0.5f);
        cloud.addEffect(new MobEffectInstance(MobEffects.BLINDNESS, BLINDNESS_TICKS));
        level().addFreshEntity(cloud);
        return cloud;
    }
}
