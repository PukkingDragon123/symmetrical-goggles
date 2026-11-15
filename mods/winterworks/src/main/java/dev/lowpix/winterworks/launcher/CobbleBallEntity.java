package dev.lowpix.winterworks.launcher;

import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/** A charged cobblestone cannonball: heavy, drops fast, hits hard and shoves. */
public class CobbleBallEntity extends ThrowableItemProjectile {
    private float power = 1f;

    public CobbleBallEntity(EntityType<? extends CobbleBallEntity> type, Level level) {
        super(type, level);
    }

    public CobbleBallEntity(Level level, LivingEntity owner, float power) {
        super(WWEntities.COBBLE_BALL, owner, level);
        this.power = power;
    }

    @Override
    protected Item getDefaultItem() {
        return WWItems.COBBLE_BALL;
    }

    @Override
    protected double getDefaultGravity() {
        return 0.055;
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide && tickCount % 2 == 0) {
            level().addParticle(ParticleTypes.SMOKE, getX(), getY(), getZ(), 0, 0, 0);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == 3) {
            for (int i = 0; i < 18; i++) {
                level().addParticle(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.COBBLESTONE.defaultBlockState()), getX(), getY(), getZ(),
                        (random.nextDouble() - 0.5) * 0.4, random.nextDouble() * 0.3, (random.nextDouble() - 0.5) * 0.4);
            }
            level().addParticle(ParticleTypes.EXPLOSION, getX(), getY(), getZ(), 0, 0, 0);
        }
    }

    @Override
    protected void onHitEntity(EntityHitResult hit) {
        super.onHitEntity(hit);
        Entity e = hit.getEntity();
        e.hurt(damageSources().thrown(this, getOwner()), 7.0f + 5.0f * power);
        if (e instanceof LivingEntity le) {
            Vec3 v = getDeltaMovement().multiply(1, 0, 1).normalize();
            le.knockback(1.2 * power, -v.x, -v.z);
        }
    }

    @Override
    protected void onHit(HitResult result) {
        super.onHit(result);
        if (!level().isClientSide) {
            playSound(SoundEvents.STONE_BREAK, 1.5f, 0.6f);
            level().broadcastEntityEvent(this, (byte) 3);
            discard();
        }
    }
}
