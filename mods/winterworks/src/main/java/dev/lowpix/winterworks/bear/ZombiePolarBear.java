package dev.lowpix.winterworks.bear;

import dev.lowpix.winterworks.registry.WWSounds;
import dev.lowpix.winterworks.world.WWWorldgen;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.npc.AbstractVillager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.state.BlockState;

/**
 * An undead polar bear of the Ice Caves (docs/COLD_UPDATE.md section 4): always hostile, roars, charge-jumps and swipes
 * like a living bear (the same goals), can't freeze. Undead through the minecraft:undead entity tag (smite, inverted
 * healing and harm). Drawn with the polar_bear model's zombie_* parts.
 */
public class ZombiePolarBear extends Monster implements BearLike {
    private BearState bear;

    public ZombiePolarBear(EntityType<? extends Monster> type, Level level) {
        super(type, level);
        this.xpReward = 10;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 45).add(Attributes.ATTACK_DAMAGE, 9)
                .add(Attributes.MOVEMENT_SPEED, 0.3).add(Attributes.FOLLOW_RANGE, 24).add(Attributes.KNOCKBACK_RESISTANCE, 0.4);
    }

    /** Dark places, and in the wild only the Ice Caves. */
    public static boolean checkZombieBearSpawnRules(EntityType<? extends Monster> type, ServerLevelAccessor level, MobSpawnType reason,
                                                    BlockPos pos, RandomSource random) {
        if ((reason == MobSpawnType.NATURAL || reason == MobSpawnType.CHUNK_GENERATION) && !level.getBiome(pos).is(WWWorldgen.ICE_CAVES)) {
            return false;
        }
        return checkMonsterSpawnRules(type, level, reason, pos, random);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new BearRoarGoal(this));
        goalSelector.addGoal(1, new BearLeapGoal(this));
        goalSelector.addGoal(2, new BearSwipeGoal(this, 1.2));
        goalSelector.addGoal(5, new WaterAvoidingRandomStrollGoal(this, 0.8));
        goalSelector.addGoal(6, new LookAtPlayerGoal(this, Player.class, 10.0f));
        goalSelector.addGoal(7, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this));
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
        targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, IronGolem.class, true));
        targetSelector.addGoal(4, new NearestAttackableTargetGoal<>(this, AbstractVillager.class, false));
    }

    // ------------------------------------------------------------------------------------------ BearLike

    @Override
    public BearState ww$bear() {
        if (bear == null) {   // goals are made in the Mob constructor, before field initialisers run
            bear = new BearState();
        }
        return bear;
    }

    @Override
    public boolean ww$mayFight() {
        return true;
    }

    @Override
    public SoundEvent ww$growlSound() {
        return WWSounds.ZOMBIE_BEAR_AMBIENT;
    }

    @Override
    public boolean ww$isZombie() {
        return true;
    }

    // ------------------------------------------------------------------------------------------ ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            ww$bear().clientTick(this, false);
        } else {
            ww$bear().serverTick(this);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (!ww$bear().handleEvent(this, id)) {
            super.handleEntityEvent(id);
        }
    }

    @Override
    public boolean canFreeze() {
        return false;
    }

    @Override
    public boolean canBeAffected(MobEffectInstance effect) {
        return !effect.is(dev.lowpix.winterworks.registry.WWEffects.FROSTBITE) && super.canBeAffected(effect);
    }

    @Override
    protected float getWaterSlowDown() {
        return 0.98f;   // bears swim well, dead or not
    }

    // ------------------------------------------------------------------------------------------ sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.ZOMBIE_BEAR_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.ZOMBIE_BEAR_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.ZOMBIE_BEAR_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(SoundEvents.POLAR_BEAR_STEP, 0.2f, 0.8f);
    }

    @Override
    public float getVoicePitch() {
        return 0.75f + random.nextFloat() * 0.15f;
    }
}
