package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import org.jetbrains.annotations.Nullable;

/**
 * A frozen zombie of the Ice Caves (docs/COLD_UPDATE.md section 4): its hits freeze (160 frozen ticks and Slowness I for
 * 3 s), it can't freeze itself, doesn't burn in daylight and doesn't turn into a drowned. Some ride polar bears.
 */
public class FrostZombie extends Zombie {
    public static final int FREEZE_TICKS = 160, SLOW_TICKS = 60, MAX_FROZEN = 300;

    public FrostZombie(EntityType<? extends Zombie> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Zombie.createAttributes().add(Attributes.MAX_HEALTH, 24);
    }

    /** What a frost zombie's hit does to its target: frozen ticks (if it can freeze) and Slowness I, with frost. */
    public static void chill(LivingEntity target, @Nullable Entity source) {
        if (target.canFreeze()) {
            target.setTicksFrozen(Math.min(target.getTicksFrozen() + FREEZE_TICKS, MAX_FROZEN));
        }
        target.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, SLOW_TICKS, 0), source);
        if (target.level() instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.SNOWFLAKE, target.getX(), target.getY() + target.getBbHeight() * 0.6, target.getZ(), 10,
                    0.3, 0.4, 0.3, 0.05);
            sl.sendParticles(WWParticles.ICE_SHARD, target.getX(), target.getY() + target.getBbHeight() * 0.6, target.getZ(), 4,
                    0.2, 0.3, 0.2, 0.08);
            sl.playSound(null, target.getX(), target.getY(), target.getZ(), SoundEvents.PLAYER_HURT_FREEZE, target.getSoundSource(),
                    0.8f, 1.2f);
        }
    }

    @Override
    public boolean doHurtTarget(Entity target) {
        boolean hit = super.doHurtTarget(target);
        if (hit && target instanceof LivingEntity le) {
            chill(le, this);
        }
        return hit;
    }

    @Override
    public boolean canFreeze() {
        return false;
    }

    @Override
    public boolean canBeAffected(MobEffectInstance effect) {
        return !effect.is(WWEffects.FROSTBITE) && super.canBeAffected(effect);
    }

    @Override
    public boolean isInvulnerableTo(DamageSource source) {
        return source.is(net.minecraft.tags.DamageTypeTags.IS_FREEZING) || super.isInvulnerableTo(source);
    }

    @Override
    protected boolean isSunSensitive() {
        return false;
    }

    @Override
    protected boolean convertsInWater() {
        return false;
    }

    @Override
    public void aiStep() {
        super.aiStep();
        if (level().isClientSide && random.nextInt(14) == 0) {   // frost flakes falling off it
            level().addParticle(ParticleTypes.SNOWFLAKE, getRandomX(0.6), getRandomY(), getRandomZ(0.6), 0, -0.02, 0);
        }
    }

    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        SpawnGroupData out = super.finalizeSpawn(level, difficulty, reason, data);
        BearFeature.maybeJockey(this, level, difficulty, reason);
        return out;
    }

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.FROST_ZOMBIE_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.FROST_ZOMBIE_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.FROST_ZOMBIE_DEATH;
    }

    @Override
    protected SoundEvent getStepSound() {
        return WWSounds.FROST_ZOMBIE_STEP;
    }
}
