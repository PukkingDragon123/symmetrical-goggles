package dev.lowpix.winterworks.launcher;

import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Blaze;
import net.minecraft.world.entity.projectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

/** A packed launcher snowball: a little sting and a short stun (dizzy stars), extra painful for blazes. */
public class IceShotEntity extends ThrowableItemProjectile {
    public IceShotEntity(EntityType<? extends IceShotEntity> type, Level level) {
        super(type, level);
    }

    public IceShotEntity(Level level, LivingEntity owner) {
        super(WWEntities.ICE_SHOT, owner, level);
    }

    @Override
    protected Item getDefaultItem() {
        return Items.SNOWBALL;
    }

    @Override
    protected double getDefaultGravity() {
        return 0.02;
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == 3) {
            for (int i = 0; i < 8; i++) {
                level().addParticle(new ItemParticleOption(ParticleTypes.ITEM, new ItemStack(Items.SNOWBALL)), getX(), getY(), getZ(),
                        (random.nextDouble() - 0.5) * 0.2, random.nextDouble() * 0.2, (random.nextDouble() - 0.5) * 0.2);
            }
            level().addParticle(ParticleTypes.SNOWFLAKE, getX(), getY(), getZ(), 0, 0.05, 0);
        }
    }

    @Override
    protected void onHitEntity(EntityHitResult hit) {
        super.onHitEntity(hit);
        Entity e = hit.getEntity();
        float dmg = e instanceof Blaze ? 4.0f : 1.0f;
        e.hurt(damageSources().thrown(this, getOwner()), dmg);
        if (e instanceof LivingEntity le) {
            le.addEffect(new MobEffectInstance(WWEffects.STUNNED, 24, 0, false, true, true), getOwner());
            le.setTicksFrozen(Math.min(le.getTicksRequiredToFreeze() + 40, le.getTicksFrozen() + 25));
            if (level() instanceof net.minecraft.server.level.ServerLevel sl && le.tickCount % 2 == 0) {
                for (int k = 0; k < 3; k++) {   // dizzy stars: velocity carries (entity id, phase)
                    sl.sendParticles(dev.lowpix.winterworks.registry.WWParticles.STUN_STAR, le.getX(), le.getY() + le.getBbHeight(),
                            le.getZ(), 0, le.getId(), k * 2.09, 0, 1.0);
                }
            }
        }
    }

    @Override
    protected void onHit(HitResult result) {
        super.onHit(result);
        if (!level().isClientSide) {
            level().broadcastEntityEvent(this, (byte) 3);
            discard();
        }
    }
}
