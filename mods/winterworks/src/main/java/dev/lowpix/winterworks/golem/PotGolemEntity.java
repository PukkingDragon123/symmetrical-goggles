package dev.lowpix.winterworks.golem;

import dev.lowpix.winterworks.registry.WWSounds;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.util.Mth;
import net.minecraft.world.DifficultyInstance;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.SpawnGroupData;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RangedAttackGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.animal.AbstractGolem;
import net.minecraft.world.entity.animal.Wolf;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileDeflection;
import net.minecraft.world.entity.projectile.ThrownPotion;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.core.Holder;
import net.minecraft.world.phys.AABB;
import java.util.Optional;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.ExplosionDamageCalculator;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ServerLevelAccessor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.PotDecorations;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Pot Golem (docs/AMBER_UPDATE.md section 9): a big wobbly amber humanoid with a decorated pot for a head.
 *
 * <p>The head is the real pot, kept as an {@code minecraft:decorated_pot} ItemStack (its {@code pot_decorations} and
 * {@code container} components: the sherds and what was inside). The pot decides the head form ({@link HeadForm}); a
 * pottery sherd used on the golem gives it a body shard ({@link Shard}). The pot cracks under hits and shatters at
 * {@link #MAX_CRACKS}; brushing it makes the golem sneeze the pot off intact.
 *
 * <p>Long actions (beam, howl, brush, fuse) and the daze freeze its AI ({@link #isImmobile()}) and tick in
 * {@link #aiStep()}. One-shot clips are started on the client by entity events ({@link #handleEntityEvent}).
 *
 * <p>0.4 (docs/FIXES_0_4.md): a head ability needs all four faces of the pot to carry the same sherd (an Echo Shard
 * inside still makes an Echo Head); six more heads (Heart, Burn, Flow, Shelter, Plenty, Brewer); and the pot is its weak
 * spot: a hit that lands on it is a headshot ({@link #isHeadshot}): double damage, a crack every time, a burst of chips.
 */
public class PotGolemEntity extends AbstractGolem implements OwnableEntity, RangedAttackMob {
    private static final EntityDataAccessor<ItemStack> HEAD = SynchedEntityData.defineId(PotGolemEntity.class, EntityDataSerializers.ITEM_STACK);
    private static final EntityDataAccessor<Integer> SHARD = SynchedEntityData.defineId(PotGolemEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> CRACKS = SynchedEntityData.defineId(PotGolemEntity.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Byte> FLAGS = SynchedEntityData.defineId(PotGolemEntity.class, EntityDataSerializers.BYTE);
    private static final int FLAG_DAZED = 1, FLAG_FUSING = 2;

    public static final int MAX_CRACKS = 3;
    public static final int BEAM_COOLDOWN = 160, BEAM_WINDUP = 16, BEAM_TICKS = 24;
    public static final float BEAM_DAMAGE = 10f;
    public static final int HOWL_COOLDOWN = 600, HOWL_TICKS = 30, HOWL_BUFF_TICKS = 400;
    public static final double HOWL_RANGE = 16.0;
    public static final int FUSE_TICKS = 30;
    public static final float FUSE_HEALTH = 0.2f, FUSE_RADIUS = 3.0f;
    public static final int BRUSH_TICKS = 40, SNEEZE_AT = 20, POP_AT = 28;
    public static final int DAZED_TICKS = 120;
    public static final float BLADE_DAMAGE = 12f, SWEEP_DAMAGE = 6f;
    // ---- 0.4: the six new heads and headshots
    /** Heart, Burn and Shelter refresh their effects on their friends this often (ticks). */
    public static final int AURA_TICKS = 40;
    public static final double HEART_RANGE = 8.0, BURN_RANGE = 8.0, SHELTER_RANGE = 6.0, FLOW_RANGE = 5.0, PLENTY_RANGE = 8.0,
            BREWER_RANGE = 10.0;
    public static final int FLOW_COOLDOWN = 120, BREWER_COOLDOWN = 80, PLENTY_SLOTS = 27, BURN_SECONDS = 5;
    /** The pot (the head) spans this high above its feet (blocks), about a block across. */
    public static final float HEAD_FROM = 2.35f, HEAD_TO = 3.5f, HEAD_HALF_WIDTH = 0.6f;

    // entity events (vanilla uses up to 65)
    public static final byte EVENT_ATTACK = 70, EVENT_SLASH = 71, EVENT_MINE = 72, EVENT_SHOOT = 73, EVENT_HOWL = 74, EVENT_BEAM = 75,
            EVENT_GIGGLE = 76, EVENT_SNEEZE = 77, EVENT_FUSE = 78, EVENT_CRACK = 79, EVENT_SHATTER = 80, EVENT_REPAIR = 81, EVENT_BUILD = 82,
            EVENT_HEADSHOT = 83, EVENT_ABILITY = 84;

    /**
     * What the pot head can do: an Echo Shard inside makes an Echo Head; the others need the same sherd on all four faces.
     * {@code glow} is the colour its pattern glows in while the ability is active (0: no glow).
     */
    public enum HeadForm {
        NONE(null, 0), PLAIN(null, 0), ECHO(null, 0x3FD9E8), HOWL(Items.HOWL_POTTERY_SHERD, 0xAFCBFF),
        DANGER(Items.DANGER_POTTERY_SHERD, 0xFF5A36), HEART(Items.HEART_POTTERY_SHERD, 0xFF79A8), BURN(Items.BURN_POTTERY_SHERD, 0xFFA23A),
        FLOW(Items.FLOW_POTTERY_SHERD, 0x96F2FF), SHELTER(Items.SHELTER_POTTERY_SHERD, 0xFFD966), PLENTY(Items.PLENTY_POTTERY_SHERD, 0xA6F070),
        BREWER(Items.BREWER_POTTERY_SHERD, 0xD19BFF);

        @Nullable public final Item sherd;
        public final int glow;

        HeadForm(@Nullable Item sherd, int glow) {
            this.sherd = sherd;
            this.glow = glow;
        }

        @Nullable
        static HeadForm bySherd(Item sherd) {
            for (HeadForm f : values()) {
                if (f.sherd == sherd) {
                    return f;
                }
            }
            return null;
        }
    }

    /** The body shard: an arm made from a pottery sherd. */
    public enum Shard {
        NONE(null), BLADE(Items.BLADE_POTTERY_SHERD), MINER(Items.MINER_POTTERY_SHERD), ARCHER(Items.ARCHER_POTTERY_SHERD);

        @Nullable public final Item sherd;

        Shard(@Nullable Item sherd) {
            this.sherd = sherd;
        }

        public static Shard of(ItemStack stack) {
            for (Shard s : values()) {
                if (s.sherd != null && stack.is(s.sherd)) {
                    return s;
                }
            }
            return NONE;
        }

        static Shard byName(String name) {
            for (Shard s : values()) {
                if (s.name().equalsIgnoreCase(name)) {
                    return s;
                }
            }
            return NONE;
        }
    }

    private enum Action { NONE, BEAM, HOWL, BRUSH, FUSE }

    /** A one-shot clip: started by an entity event, stopped once it has played. */
    public static final class Clip {
        public final AnimationState state = new AnimationState();
        private final int ticks;
        private int end;

        Clip(float seconds) {
            this.ticks = Math.round(seconds * 20f);
        }

        void start(int now) {
            state.start(now);
            end = now + ticks + 2;
        }

        void tick(int now) {
            if (state.isStarted() && now > end) {
                state.stop();
            }
        }
    }

    // client animation state (clip names: docs/AMBER_UPDATE.md section 9)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState dazedState = new AnimationState();
    public final Clip attackClip = new Clip(0.6f), slashClip = new Clip(0.7f), mineClip = new Clip(0.8f), shootClip = new Clip(0.8f),
            howlClip = new Clip(1.5f), beamClip = new Clip(1.2f), giggleClip = new Clip(1.0f), sneezeClip = new Clip(1.0f),
            fuseClip = new Clip(1.5f);
    private final Clip[] clips = {attackClip, slashClip, mineClip, shootClip, howlClip, beamClip, giggleClip, sneezeClip, fuseClip};
    /** Client: the jelly spring (offset, velocity), kicked by hits and footfalls. */
    public float jelly, jellyVel, jellyO;
    private float lastStepPos;
    private int fuseStartTick = -1;

    @Nullable private UUID owner;
    private Action action = Action.NONE;
    private int actionTicks;
    private int beamCooldown, howlCooldown, dazedTicks;
    private int flowCooldown, brewerCooldown;
    /** Plenty: the pot's 27-slot stash (only while it wears a Plenty pot; spilled when that pot comes off). */
    private final Stash stash = new Stash();
    /** Client: when the head ability last fired (its pattern flares). */
    private int abilityFlareTick = -100;

    public PotGolemEntity(EntityType<? extends AbstractGolem> type, Level level) {
        super(type, level);
        this.xpReward = 0;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return PathfinderMob.createMobAttributes().add(Attributes.MAX_HEALTH, 80).add(Attributes.MOVEMENT_SPEED, 0.27)
                .add(Attributes.ATTACK_DAMAGE, 10).add(Attributes.KNOCKBACK_RESISTANCE, 0.8).add(Attributes.FOLLOW_RANGE, 24)
                .add(Attributes.STEP_HEIGHT, 1.0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(HEAD, ItemStack.EMPTY);
        builder.define(SHARD, 0);
        builder.define(CRACKS, 0);
        builder.define(FLAGS, (byte) 0);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new RangedAttackGoal(this, 1.0, 30, 15f) {
            @Override
            public boolean canUse() {
                return shard() == Shard.ARCHER && super.canUse();
            }

            @Override
            public boolean canContinueToUse() {
                return shard() == Shard.ARCHER && super.canContinueToUse();
            }
        });
        goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0, true) {
            @Override
            public boolean canUse() {
                return shard() != Shard.ARCHER && super.canUse();
            }

            @Override
            public boolean canContinueToUse() {
                return shard() != Shard.ARCHER && super.canContinueToUse();
            }
        });
        goalSelector.addGoal(3, new GolemFollowOwnerGoal(this));
        goalSelector.addGoal(4, new GolemMineGoal(this));
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.6) {
            @Override
            public boolean canUse() {
                return ownerPlayer() == null && super.canUse();
            }
        });
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new GolemDefendOwnerGoal(this, true));
        targetSelector.addGoal(2, new GolemDefendOwnerGoal(this, false));
        targetSelector.addGoal(3, new HurtByTargetGoal(this));
        targetSelector.addGoal(4, new NearestAttackableTargetGoal<>(this, net.minecraft.world.entity.Mob.class, 5, false, false,
                this::wantsToFight));
    }

    /** Hostile mobs; creepers only when it can hit them from afar (an Echo head or a bow arm). */
    private boolean wantsToFight(LivingEntity e) {
        return e instanceof Enemy && !isFriendly(e) && (!(e instanceof Creeper) || headForm() == HeadForm.ECHO || shard() == Shard.ARCHER);
    }

    // --------------------------------------------------------------------------------------- owner

    @Nullable
    @Override
    public UUID getOwnerUUID() {
        return owner;
    }

    public void setOwner(@Nullable UUID uuid) {
        this.owner = uuid;
    }

    @Nullable
    public Player ownerPlayer() {
        return owner == null ? null : level().getPlayerByUUID(owner);
    }

    /** The owner, the owner's pets (anything ownable they own, other Pot Golems included) and itself. */
    public boolean isFriendly(@Nullable Entity e) {
        if (e == null) {
            return false;
        }
        if (e == this) {
            return true;
        }
        if (owner == null) {
            return e instanceof PotGolemEntity g && g.owner == null;
        }
        return owner.equals(e.getUUID()) || (e instanceof OwnableEntity o && owner.equals(o.getOwnerUUID()));
    }

    @Override
    public boolean isAlliedTo(Entity e) {
        return isFriendly(e) || super.isAlliedTo(e);
    }

    @Override
    public boolean canAttack(LivingEntity e) {
        return !isFriendly(e) && super.canAttack(e);
    }

    /** It never targets its owner or the owner's pets, whatever asks it to. */
    @Override
    public void setTarget(@Nullable LivingEntity target) {
        super.setTarget(target != null && isFriendly(target) ? null : target);
    }

    // --------------------------------------------------------------------------------------- state

    public ItemStack head() {
        return entityData.get(HEAD);
    }

    public boolean hasPot() {
        return !head().isEmpty();
    }

    /** Sets the pot head (a decorated pot item; EMPTY for none). Cracks start over. */
    public void setHead(ItemStack pot) {
        entityData.set(HEAD, normalized(pot));
        setCracks(0);
    }

    /** One pot; an empty container component (what a pot block's item form carries) is dropped so it stacks with new pots. */
    private static ItemStack normalized(ItemStack pot) {
        if (pot.isEmpty()) {
            return ItemStack.EMPTY;
        }
        ItemStack one = pot.copyWithCount(1);
        if (contents(one).isEmpty()) {
            ItemContainerContents proto = one.getPrototype().get(DataComponents.CONTAINER);
            if (proto != null) {
                one.set(DataComponents.CONTAINER, proto);
            } else {
                one.remove(DataComponents.CONTAINER);
            }
        }
        return one;
    }

    public static PotDecorations decorations(ItemStack pot) {
        return pot.getOrDefault(DataComponents.POT_DECORATIONS, PotDecorations.EMPTY);
    }

    public static ItemStack contents(ItemStack pot) {
        return pot.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY).copyOne();
    }

    /**
     * Echo Shard inside -> Echo; the same sherd on all four faces -> that sherd's head (Howl, Danger, Heart, Burn, Flow,
     * Shelter, Plenty, Brewer); any other pot (mixed faces, other sherds, plain bricks) -> plain.
     */
    public static HeadForm formOf(ItemStack pot) {
        if (pot.isEmpty()) {
            return HeadForm.NONE;
        }
        if (contents(pot).is(Items.ECHO_SHARD)) {
            return HeadForm.ECHO;
        }
        List<Item> sides = decorations(pot).ordered();
        if (sides.size() == 4 && sides.stream().allMatch(sides.get(0)::equals)) {
            HeadForm f = HeadForm.bySherd(sides.get(0));
            if (f != null) {
                return f;
            }
        }
        return HeadForm.PLAIN;
    }

    public HeadForm headForm() {
        return formOf(head());
    }

    public Shard shard() {
        int i = entityData.get(SHARD);
        return i >= 0 && i < Shard.values().length ? Shard.values()[i] : Shard.NONE;
    }

    public void setShard(Shard s) {
        entityData.set(SHARD, s.ordinal());
    }

    public int cracks() {
        return entityData.get(CRACKS);
    }

    private void setCracks(int n) {
        entityData.set(CRACKS, Mth.clamp(n, 0, MAX_CRACKS));
    }

    private boolean flag(int f) {
        return (entityData.get(FLAGS) & f) != 0;
    }

    private void setFlag(int f, boolean on) {
        byte b = entityData.get(FLAGS);
        entityData.set(FLAGS, (byte) (on ? b | f : b & ~f));
    }

    public boolean isDazed() {
        return flag(FLAG_DAZED);
    }

    public boolean isFusing() {
        return flag(FLAG_FUSING);
    }

    public int beamCooldown() {
        return beamCooldown;
    }

    public int howlCooldown() {
        return howlCooldown;
    }

    /** Busy with a beam, howl, brush or fuse (server). */
    public boolean isBusy() {
        return action != Action.NONE;
    }

    public void daze(int ticks) {
        dazedTicks = Math.max(dazedTicks, ticks);
        setFlag(FLAG_DAZED, true);
        getNavigation().stop();
    }

    /** Frozen while dazed or in the middle of a beam, howl, brush or fuse: no walking, no new goals. */
    @Override
    protected boolean isImmobile() {
        return super.isImmobile() || isDazed() || action != Action.NONE;
    }

    @Override
    protected int decreaseAirSupply(int air) {
        return air;   // amber doesn't breathe
    }

    public Vec3 headPos() {
        return position().add(0, getBbHeight() * 0.85, 0);
    }

    // --------------------------------------------------------------------------------------- ticking

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientTick();
        }
    }

    @Override
    public void aiStep() {
        super.aiStep();
        if (level() instanceof ServerLevel sl && isAlive()) {
            serverTick(sl);
        }
    }

    private void serverTick(ServerLevel sl) {
        if (beamCooldown > 0) {
            beamCooldown--;
        }
        if (howlCooldown > 0) {
            howlCooldown--;
        }
        if (dazedTicks > 0 && --dazedTicks == 0) {
            setFlag(FLAG_DAZED, false);
        }
        if (action != Action.NONE) {
            actionTicks++;
            switch (action) {
                case BEAM -> tickBeam(sl);
                case HOWL -> tickHowl(sl);
                case BRUSH -> tickBrush(sl);
                case FUSE -> tickFuse(sl);
                default -> endAction();
            }
            return;
        }
        if (isDazed() || isNoAi()) {
            return;
        }
        HeadForm form = headForm();
        LivingEntity target = getTarget();
        if (form == HeadForm.DANGER && getHealth() < getMaxHealth() * FUSE_HEALTH) {   // the blast spends the pot: once per head
            startAction(Action.FUSE);
            setFlag(FLAG_FUSING, true);
            playSound(WWSounds.POT_GOLEM_FUSE, 1.5f, 0.9f);
            gameEvent(net.minecraft.world.level.gameevent.GameEvent.PRIME_FUSE);
            level().broadcastEntityEvent(this, EVENT_FUSE);
        } else if (form == HeadForm.ECHO && beamCooldown == 0 && target != null && target.isAlive() && canAttack(target)
                && closerThan(target, 15.0, 20.0) && hasLineOfSight(target)) {
            startAction(Action.BEAM);
            level().broadcastEntityEvent(this, EVENT_BEAM);
            playSound(SoundEvents.WARDEN_SONIC_CHARGE, 2.0f, 1.2f);
        } else if (form == HeadForm.HOWL && howlCooldown == 0 && target != null && target.isAlive()) {
            startAction(Action.HOWL);
            level().broadcastEntityEvent(this, EVENT_HOWL);
        }
        if (flowCooldown > 0) {
            flowCooldown--;
        }
        if (brewerCooldown > 0) {
            brewerCooldown--;
        }
        switch (form) {
            case HEART -> {
                if (tickCount % AURA_TICKS == 0) {
                    heartPulse(sl);
                }
            }
            case BURN -> {
                if (tickCount % AURA_TICKS == 0) {
                    burnAura(sl);
                }
            }
            case FLOW -> {
                if (flowCooldown == 0 && tickCount % 5 == 0) {
                    windBurst(sl);
                }
            }
            case SHELTER -> {
                if (tickCount % AURA_TICKS == 0) {
                    shelterAura(sl);
                }
                guardOwner(sl);
            }
            case PLENTY -> {
                if (tickCount % 4 == 0) {
                    vacuum(sl);
                }
            }
            case BREWER -> {
                if (brewerCooldown == 0 && tickCount % 10 == 0) {
                    brew(sl);
                }
            }
            default -> {}
        }
    }

    // ---- the 0.4 heads (docs/FIXES_0_4.md)

    /** Its friends within `range`: itself, its owner, the owner's pets (other Pot Golems too). */
    public List<LivingEntity> friendsNear(double range) {
        return level().getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(range),
                e -> e.isAlive() && isFriendly(e) && e.distanceToSqr(this) <= range * range);
    }

    /** The owner, if within `range`. */
    @Nullable
    private Player ownerNear(double range) {
        Player o = ownerPlayer();
        return o != null && o.isAlive() && !o.isSpectator() && o.distanceToSqr(this) <= range * range ? o : null;
    }

    /** Hostile things near it: monsters, and whatever it or its owner is fighting. Never a friend. */
    private boolean isFoe(LivingEntity e) {
        if (!e.isAlive() || isFriendly(e) || e instanceof Player p && (p.isCreative() || p.isSpectator())) {
            return false;
        }
        Player o = ownerPlayer();
        return e instanceof Enemy || e == getTarget() || (e instanceof net.minecraft.world.entity.Mob m && (m.getTarget() == this
                || (o != null && m.getTarget() == o)));
    }

    private void ability() {
        level().broadcastEntityEvent(this, EVENT_ABILITY);
    }

    /** Refreshes an effect unless a stronger or longer one is already running. */
    private static void refresh(LivingEntity e, Holder<net.minecraft.world.effect.MobEffect> effect, int ticks, int amp, Entity source) {
        MobEffectInstance cur = e.getEffect(effect);
        if (cur == null || cur.getAmplifier() < amp || (cur.getAmplifier() == amp && cur.getDuration() < ticks / 2)) {
            e.addEffect(new MobEffectInstance(effect, ticks, amp, true, true), source);
        }
    }

    /** Heart: Regeneration I for its owner and their pets (and itself) within 8 blocks. */
    public int heartPulse(ServerLevel sl) {
        List<LivingEntity> friends = friendsNear(HEART_RANGE);
        for (LivingEntity e : friends) {
            refresh(e, MobEffects.REGENERATION, AURA_TICKS * 2 + 10, 0, this);
            if (e.getHealth() < e.getMaxHealth()) {
                sl.sendParticles(ParticleTypes.HEART, e.getX(), e.getY() + e.getBbHeight() + 0.2, e.getZ(), 1, 0.2, 0.1, 0.2, 0);
            }
        }
        if (friends.size() > 1) {
            playSound(WWSounds.POT_GOLEM_SOOTHE, 0.6f, 1.0f + random.nextFloat() * 0.1f);
            ability();
        }
        return friends.size();
    }

    /** Burn: Fire Resistance for its owner within 8 blocks (its fists set things alight: {@link #doHurtTarget}). */
    public boolean burnAura(ServerLevel sl) {
        Player o = ownerNear(BURN_RANGE);
        if (o == null) {
            return false;
        }
        refresh(o, MobEffects.FIRE_RESISTANCE, AURA_TICKS * 3, 0, this);
        return true;
    }

    /** Burning fists: what a Burn Head hits catches fire. */
    private void burnFist(Entity target) {
        if (headForm() == HeadForm.BURN && !isDazed() && level() instanceof ServerLevel sl) {
            target.igniteForSeconds(BURN_SECONDS);
            sl.sendParticles(ParticleTypes.FLAME, target.getX(), target.getY() + target.getBbHeight() * 0.6, target.getZ(), 14, 0.25, 0.3,
                    0.25, 0.03);
            playSound(WWSounds.POT_GOLEM_IGNITE, 1.0f, 0.9f + random.nextFloat() * 0.2f);
            ability();
        }
    }

    /** Flow: every 6 s a gust from the pot hurls every foe within 5 blocks away (no block damage). Returns how many. */
    public int windBurst(ServerLevel sl) {
        List<LivingEntity> foes = sl.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(FLOW_RANGE),
                e -> e != this && isFoe(e) && e.distanceToSqr(this) <= FLOW_RANGE * FLOW_RANGE);
        if (foes.isEmpty()) {
            return 0;
        }
        Vec3 c = position().add(0, 1.2, 0);
        for (LivingEntity e : foes) {
            Vec3 away = new Vec3(e.getX() - getX(), 0, e.getZ() - getZ());
            away = away.lengthSqr() < 1.0e-4 ? Vec3.directionFromRotation(0, getYRot()) : away.normalize();
            double kr = 1.0 - e.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE) * 0.5;
            e.setDeltaMovement(e.getDeltaMovement().add(away.x * 1.9 * kr, 0.65 * kr, away.z * 1.9 * kr));
            e.hurtMarked = true;
            e.hasImpulse = true;
        }
        sl.sendParticles(ParticleTypes.GUST_EMITTER_LARGE, c.x, c.y, c.z, 1, 0, 0, 0, 0);
        sl.sendParticles(ParticleTypes.GUST, c.x, c.y + 0.5, c.z, 8, 1.5, 0.5, 1.5, 0);
        playSound(WWSounds.POT_GOLEM_WIND_BURST, 1.5f, 0.9f + random.nextFloat() * 0.2f);
        level().broadcastEntityEvent(this, EVENT_ATTACK);
        ability();
        flowCooldown = FLOW_COOLDOWN;
        return foes.size();
    }

    /** Shelter: Resistance I for its owner within 6 blocks. */
    public boolean shelterAura(ServerLevel sl) {
        Player o = ownerNear(SHELTER_RANGE);
        if (o == null) {
            return false;
        }
        refresh(o, MobEffects.DAMAGE_RESISTANCE, AURA_TICKS + 30, 0, this);
        return true;
    }

    /**
     * Shelter: it steps in front of arrows (and other projectiles) flying at its owner: anything hostile on course to
     * hit them within the next few ticks is knocked back off the golem's arm. Returns how many it stopped.
     */
    public int guardOwner(ServerLevel sl) {
        Player o = ownerNear(SHELTER_RANGE);
        if (o == null) {
            return 0;
        }
        Vec3 aim = o.getBoundingBox().getCenter();
        int blocked = 0;
        for (Projectile p : sl.getEntitiesOfClass(Projectile.class, o.getBoundingBox().inflate(7.0),
                p -> p.isAlive() && p.getDeltaMovement().lengthSqr() > 0.04 && (p.getOwner() == null || !isFriendly(p.getOwner())))) {
            Vec3 at = p.getBoundingBox().getCenter(), v = p.getDeltaMovement();
            double t = aim.subtract(at).dot(v) / v.lengthSqr();   // ticks to the closest approach
            if (t < 0 || t > 6 || at.add(v.scale(t)).distanceTo(aim) > 1.3) {
                continue;
            }
            // step in: lunge across the line of fire and swat it away
            Vec3 block = at.add(v.scale(Math.max(0, t - 1.5)));
            Vec3 lunge = new Vec3(block.x - getX(), 0, block.z - getZ());
            if (lunge.lengthSqr() > 1.0e-4) {
                setDeltaMovement(getDeltaMovement().add(lunge.normalize().scale(Math.min(0.9, lunge.length() * 0.3))));
                hasImpulse = true;
                faceTowards(block);
            }
            p.deflect(ProjectileDeflection.REVERSE, this, this, false);
            p.setDeltaMovement(p.getDeltaMovement().scale(0.4));
            sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, dev.lowpix.winterworks.registry.WWBlocks.AMBER_BLOCK.defaultBlockState()),
                    at.x, at.y, at.z, 10, 0.15, 0.15, 0.15, 0.1);
            sl.sendParticles(ParticleTypes.CRIT, at.x, at.y, at.z, 8, 0.1, 0.1, 0.1, 0.3);
            playSound(WWSounds.POT_GOLEM_SHIELD, 1.2f, 0.9f + random.nextFloat() * 0.2f);
            level().broadcastEntityEvent(this, EVENT_ATTACK);
            ability();
            blocked++;
        }
        return blocked;
    }

    private void faceTowards(Vec3 p) {
        float yaw = (float) (Mth.atan2(p.z - getZ(), p.x - getX()) * Mth.RAD_TO_DEG) - 90f;
        setYRot(yaw);
        setYHeadRot(yaw);
        yBodyRot = yaw;
    }

    /** Plenty: the stash in its pot. */
    public SimpleContainer stash() {
        return stash;
    }

    /** Plenty: pulls loose items within 8 blocks towards it and swallows those that reach it. Returns items taken. */
    public int vacuum(ServerLevel sl) {
        Vec3 belly = position().add(0, 1.2, 0);
        int taken = 0;
        for (ItemEntity ie : sl.getEntitiesOfClass(ItemEntity.class, getBoundingBox().inflate(PLENTY_RANGE),
                ie -> ie.isAlive() && !ie.hasPickUpDelay() && !ie.getItem().isEmpty() && ie.distanceToSqr(this) <= PLENTY_RANGE * PLENTY_RANGE)) {
            if (!stash.canAddItem(ie.getItem())) {
                continue;
            }
            if (ie.position().distanceTo(belly) < 1.9) {
                ItemStack st = ie.getItem();
                int before = st.getCount();
                ItemStack left = stash.addItem(st.copy());
                taken += before - left.getCount();
                if (left.isEmpty()) {
                    ie.discard();
                } else {
                    ie.setItem(left);
                }
                sl.sendParticles(ParticleTypes.HAPPY_VILLAGER, ie.getX(), ie.getY() + 0.2, ie.getZ(), 2, 0.1, 0.1, 0.1, 0);
            } else {
                Vec3 pull = belly.subtract(ie.position()).normalize().scale(0.32);
                ie.setDeltaMovement(pull.x, Math.max(pull.y, 0.12), pull.z);
                ie.hasImpulse = true;
                ie.hurtMarked = true;
            }
        }
        if (taken > 0) {
            playSound(WWSounds.POT_GOLEM_STASH, 0.8f, 0.9f + random.nextFloat() * 0.3f);
            ability();
        }
        return taken;
    }

    /** Spills the Plenty stash (its pot came off, broke or was swapped, or it died). */
    private void dropStash() {
        if (level().isClientSide) {
            return;
        }
        for (int i = 0; i < stash.getContainerSize(); i++) {
            ItemStack st = stash.removeItemNoUpdate(i);
            if (!st.isEmpty()) {
                spawnAtLocation(st, 1.2f);
            }
        }
    }

    /**
     * Brewer: throws a splash Potion of Healing at its owner when they're hurt, else Weakness (or, once they're weak,
     * Slowness) at the foe it is fighting, never one standing close to its owner. Returns the potion thrown, if any.
     */
    @Nullable
    public Holder<Potion> brew(ServerLevel sl) {
        Player o = ownerNear(BREWER_RANGE);
        if (o != null && o.getHealth() <= o.getMaxHealth() - 4f && hasLineOfSight(o)) {
            Holder<Potion> heal = o.getHealth() < o.getMaxHealth() * 0.4f ? Potions.STRONG_HEALING : Potions.HEALING;
            throwPotion(sl, o, heal);
            return heal;
        }
        LivingEntity t = getTarget();
        if (t == null || !t.isAlive() || !isFoe(t) || t.distanceToSqr(this) > BREWER_RANGE * BREWER_RANGE || !hasLineOfSight(t)
                || (o != null && o.distanceToSqr(t) < 9.0)) {
            return null;
        }
        Holder<Potion> curse = !t.hasEffect(MobEffects.WEAKNESS) ? Potions.WEAKNESS : !t.hasEffect(MobEffects.MOVEMENT_SLOWDOWN) ? Potions.SLOWNESS
                : null;
        if (curse != null) {
            throwPotion(sl, t, curse);
        }
        return curse;
    }

    private void throwPotion(ServerLevel sl, LivingEntity at, Holder<Potion> potion) {
        ThrownPotion tp = new ThrownPotion(sl, this);
        tp.setItem(PotionContents.createItemStack(Items.SPLASH_POTION, potion));
        tp.setPos(getX(), getY() + 2.3, getZ());
        Vec3 lead = at.getDeltaMovement();
        double dx = at.getX() + lead.x - getX(), dy = at.getEyeY() - 1.1 - (getY() + 2.3), dz = at.getZ() + lead.z - getZ();
        double h = Math.sqrt(dx * dx + dz * dz);
        tp.setXRot(tp.getXRot() + 20f);
        tp.shoot(dx, dy + h * 0.2, dz, 0.75f, 2f);
        sl.addFreshEntity(tp);
        faceTowards(at.position());
        playSound(WWSounds.POT_GOLEM_THROW, 1.0f, 0.8f + random.nextFloat() * 0.4f);
        level().broadcastEntityEvent(this, EVENT_SHOOT);
        ability();
        brewerCooldown = BREWER_COOLDOWN;
    }

    /** Plenty's stash: a chest's worth of slots that stay usable only while it wears the Plenty pot and you're near. */
    private final class Stash extends SimpleContainer {
        Stash() {
            super(PLENTY_SLOTS);
        }

        @Override
        public boolean stillValid(Player p) {
            return isAlive() && headForm() == HeadForm.PLENTY && p.distanceToSqr(PotGolemEntity.this) <= 64.0;
        }
    }

    private void startAction(Action a) {
        action = a;
        actionTicks = 0;
        getNavigation().stop();
    }

    private void endAction() {
        action = Action.NONE;
        actionTicks = 0;
    }

    private void faceTarget(LivingEntity t) {
        double dx = t.getX() - getX(), dz = t.getZ() - getZ();
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        setYRot(yaw);
        setYHeadRot(yaw);
        yBodyRot = yaw;
    }

    // ---- Echo Head: a sonic beam like the Warden's
    private void tickBeam(ServerLevel sl) {
        LivingEntity t = getTarget();
        if (t != null && t.isAlive()) {
            faceTarget(t);
        }
        if (actionTicks == BEAM_WINDUP) {
            boolean fire = t != null && t.isAlive() && canAttack(t);
            if (fire) {
                fireBeam(sl, t);
            }
            beamCooldown = fire ? BEAM_COOLDOWN : 20;   // the target got away: try again soon
        }
        if (actionTicks >= BEAM_TICKS) {
            endAction();
        }
    }

    private void fireBeam(ServerLevel sl, LivingEntity t) {
        Vec3 from = headPos();
        Vec3 line = t.getEyePosition().subtract(from);
        Vec3 dir = line.normalize();
        int n = Mth.floor(line.length()) + 7;
        for (int i = 1; i < n; i++) {
            Vec3 p = from.add(dir.scale(i));
            sl.sendParticles(ParticleTypes.SONIC_BOOM, p.x, p.y, p.z, 1, 0, 0, 0, 0);
        }
        playSound(WWSounds.POT_GOLEM_BEAM, 3.0f, 1.0f);
        playSound(SoundEvents.WARDEN_SONIC_BOOM, 2.0f, 1.25f);
        // sonic_boom damage bypasses armour and enchantments
        if (t.hurt(damageSources().sonicBoom(this), BEAM_DAMAGE)) {
            double kr = t.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE);
            t.push(dir.x * 2.5 * (1 - kr), dir.y * 0.5 * (1 - kr), dir.z * 2.5 * (1 - kr));
        }
    }

    // ---- Howl Head: wolves nearby get Strength II, Speed II, Resistance I, Regeneration I
    private void tickHowl(ServerLevel sl) {
        if (actionTicks == 10) {
            playSound(WWSounds.POT_GOLEM_HOWL, 2.5f, 1.0f);
            buffWolves(sl);
            howlCooldown = HOWL_COOLDOWN;
        }
        if (actionTicks >= HOWL_TICKS) {
            endAction();
        }
    }

    /** Buffs every wolf within 16 blocks that isn't angry at the golem or its owner. Returns how many. */
    public int buffWolves(ServerLevel sl) {
        Vec3 h = headPos();
        sl.sendParticles(ParticleTypes.NOTE, h.x, h.y + 0.6, h.z, 6, 0.4, 0.2, 0.4, 1.0);
        Player o = ownerPlayer();
        List<Wolf> wolves = sl.getEntitiesOfClass(Wolf.class, getBoundingBox().inflate(HOWL_RANGE),
                w -> w.isAlive() && w.distanceToSqr(this) <= HOWL_RANGE * HOWL_RANGE && !w.isAngryAt(this) && (o == null || !w.isAngryAt(o)));
        for (Wolf w : wolves) {
            w.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, HOWL_BUFF_TICKS, 1), this);
            w.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SPEED, HOWL_BUFF_TICKS, 1), this);
            w.addEffect(new MobEffectInstance(MobEffects.DAMAGE_RESISTANCE, HOWL_BUFF_TICKS, 0), this);
            w.addEffect(new MobEffectInstance(MobEffects.REGENERATION, HOWL_BUFF_TICKS, 0), this);
            sl.sendParticles(ParticleTypes.ANGRY_VILLAGER, w.getX(), w.getY() + w.getBbHeight() + 0.3, w.getZ(), 2, 0.2, 0.1, 0.2, 0);
        }
        return wolves.size();
    }

    // ---- Danger Head: almost dead, it hisses and blows itself up (hurts hostile mobs only, breaks no blocks)
    private void tickFuse(ServerLevel sl) {
        if (actionTicks >= FUSE_TICKS) {
            setFlag(FLAG_FUSING, false);
            endAction();
            explodeHead(sl);
        }
    }

    private boolean blastHurts(Entity e) {
        return e instanceof LivingEntity && !(e instanceof Player) && !isFriendly(e) && (e instanceof Enemy || e == getTarget());
    }

    private void explodeHead(ServerLevel sl) {
        Vec3 c = headPos();
        ExplosionDamageCalculator mobsOnly = new ExplosionDamageCalculator() {
            @Override
            public boolean shouldBlockExplode(Explosion explosion, BlockGetter level, BlockPos pos, BlockState state, float power) {
                return false;
            }

            @Override
            public boolean shouldDamageEntity(Explosion explosion, Entity entity) {
                return blastHurts(entity);
            }

            @Override
            public float getKnockbackMultiplier(Entity entity) {
                return blastHurts(entity) ? 1f : 0f;
            }
        };
        sl.explode(this, null, mobsOnly, c.x, c.y, c.z, FUSE_RADIUS, false, Level.ExplosionInteraction.NONE);
        breakPot(sl);
        kill();   // a last stand: the golem goes up with its pot (its amber and shard still drop)
    }

    // ---- brushing: it giggles, then sneezes the pot off
    /** Starts the giggle; the pot pops off a moment later. False if there is no pot or it is busy. */
    public boolean brush() {
        if (!hasPot() || isBusy() || isDazed()) {
            return false;
        }
        startAction(Action.BRUSH);
        playSound(WWSounds.POT_GOLEM_GIGGLE, 1.0f, 1.0f + random.nextFloat() * 0.2f);
        level().broadcastEntityEvent(this, EVENT_GIGGLE);
        return true;
    }

    private void tickBrush(ServerLevel sl) {
        if (actionTicks == SNEEZE_AT) {
            level().broadcastEntityEvent(this, EVENT_SNEEZE);
        }
        if (actionTicks == POP_AT) {
            playSound(WWSounds.POT_GOLEM_SNEEZE, 1.2f, 1.0f);
            popPot(sl);
        }
        if (actionTicks >= BRUSH_TICKS) {
            endAction();
        }
    }

    /** The pot comes off intact (decorations and contents) and flies forward a little. */
    private void popPot(ServerLevel sl) {
        ItemStack pot = head();
        if (pot.isEmpty()) {
            return;
        }
        Vec3 h = headPos();
        ItemEntity ie = new ItemEntity(sl, h.x, h.y, h.z, pot.copy());
        Vec3 look = Vec3.directionFromRotation(0, getYRot());
        ie.setDeltaMovement(look.x * 0.25, 0.35, look.z * 0.25);
        ie.setDefaultPickUpDelay();
        sl.addFreshEntity(ie);
        sl.sendParticles(ParticleTypes.SNEEZE, h.x + look.x * 0.6, h.y, h.z + look.z * 0.6, 12, 0.2, 0.1, 0.2, 0.05);
        sl.sendParticles(ParticleTypes.POOF, h.x, h.y, h.z, 6, 0.3, 0.2, 0.3, 0.02);
        dropStash();
        setHead(ItemStack.EMPTY);
    }

    // --------------------------------------------------------------------------------------- the pot's weakness

    /** One more crack in the pot; the third shatters it. */
    public void crack() {
        if (!(level() instanceof ServerLevel sl) || !hasPot()) {
            return;
        }
        setCracks(cracks() + 1);
        playSound(WWSounds.POT_GOLEM_CRACK, 1.0f, 0.9f + random.nextFloat() * 0.2f);
        playSound(SoundEvents.DECORATED_POT_HIT, 1.0f, 0.8f);
        level().broadcastEntityEvent(this, EVENT_CRACK);
        if (cracks() >= MAX_CRACKS) {
            breakPot(sl);
        }
    }

    /** The pot breaks: its sherds (bricks for plain sides) and contents drop, the head form is lost, it is dazed. */
    private void breakPot(ServerLevel sl) {
        ItemStack pot = head();
        if (pot.isEmpty()) {
            return;
        }
        float y = getBbHeight() * 0.85f;
        for (Item side : decorations(pot).ordered()) {
            spawnAtLocation(new ItemStack(side), y);
        }
        ItemStack inside = contents(pot);
        if (!inside.isEmpty()) {
            spawnAtLocation(inside.copy(), y);
        }
        dropStash();
        setHead(ItemStack.EMPTY);
        Vec3 h = headPos();
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.DECORATED_POT.defaultBlockState()), h.x, h.y, h.z, 40,
                0.35, 0.35, 0.35, 0.15);
        playSound(WWSounds.POT_GOLEM_SHATTER, 1.2f, 1.0f);
        playSound(SoundEvents.DECORATED_POT_SHATTER, 1.0f, 1.0f);
        level().broadcastEntityEvent(this, EVENT_SHATTER);
        if (action == Action.FUSE) {
            setFlag(FLAG_FUSING, false);
        }
        if (action != Action.NONE) {
            endAction();
        }
        daze(DAZED_TICKS);
    }

    public void repairCrack() {
        if (cracks() > 0) {
            setCracks(cracks() - 1);
            playSound(WWSounds.POT_GOLEM_REPAIR, 1.0f, 1.0f);
            playSound(SoundEvents.DECORATED_POT_INSERT, 1.0f, 1.2f);
            level().broadcastEntityEvent(this, EVENT_REPAIR);
        }
    }

    /**
     * Hits (by something, a projectile or a blast) crack the pot 1 time in 3. A headshot ({@link #isHeadshot}) does double
     * damage and always cracks it, with a burst of pottery chips and a clink.
     */
    @Override
    public boolean hurt(DamageSource source, float amount) {
        boolean head = !level().isClientSide && hasPot() && isHeadshot(source);
        boolean hit = super.hurt(source, head ? amount * 2f : amount);
        if (hit && !level().isClientSide && isAlive() && hasPot()) {
            if (head) {
                headshot();
                crack();
            } else if (isCrackingHit(source) && random.nextInt(3) == 0) {
                crack();
            }
        }
        return hit;
    }

    /** The pot: about a block across, from HEAD_FROM to HEAD_TO above its feet. */
    public AABB headBox() {
        return new AABB(getX() - HEAD_HALF_WIDTH, getY() + HEAD_FROM, getZ() - HEAD_HALF_WIDTH, getX() + HEAD_HALF_WIDTH, getY() + HEAD_TO,
                getZ() + HEAD_HALF_WIDTH);
    }

    /** Everything under the pot. */
    public AABB bodyBox() {
        AABB b = getBoundingBox();
        return new AABB(b.minX, b.minY, b.minZ, b.maxX, getY() + HEAD_FROM, b.maxZ);
    }

    /**
     * Did this hit land on the pot? Projectiles by where they strike (their path this tick against the hitbox, as
     * vanilla finds the hit: the box grown by 0.3); melee by where the attacker is looking (its view ray, within reach
     * plus a block, meets the head box before the body). Blasts and other damage never do.
     */
    public boolean isHeadshot(DamageSource source) {
        if (source.is(DamageTypeTags.IS_EXPLOSION) || !hasPot()) {
            return false;
        }
        Entity direct = source.getDirectEntity();
        if (direct instanceof Projectile p) {
            Vec3 at = p.getBoundingBox().getCenter(), v = p.getDeltaMovement();
            AABB hitBox = getBoundingBox().inflate(0.3);
            Vec3 point = hitBox.clip(at.subtract(v), at.add(v.scale(2))).orElse(null);
            if (point == null) {   // already inside (or a still projectile): where it is
                point = new Vec3(Mth.clamp(at.x, hitBox.minX, hitBox.maxX), Mth.clamp(at.y, hitBox.minY, hitBox.maxY),
                        Mth.clamp(at.z, hitBox.minZ, hitBox.maxZ));
            }
            return point.y >= getY() + HEAD_FROM;
        }
        if (direct instanceof LivingEntity attacker && direct == source.getEntity()) {
            Vec3 eye = attacker.getEyePosition(), look = attacker.getViewVector(1.0f);
            double reach = (attacker instanceof Player pl ? pl.entityInteractionRange() : 3.0) + 1.0;
            Vec3 end = eye.add(look.scale(reach));
            Optional<Vec3> head = headBox().clip(eye, end);
            if (headBox().contains(eye)) {
                return true;
            }
            if (head.isEmpty()) {
                return false;
            }
            Optional<Vec3> body = bodyBox().clip(eye, end);
            return body.isEmpty() || head.get().distanceToSqr(eye) <= body.get().distanceToSqr(eye);
        }
        return false;
    }

    /** A crit burst of pottery chips and a sharp clink. */
    private void headshot() {
        if (!(level() instanceof ServerLevel sl)) {
            return;
        }
        Vec3 h = position().add(0, (HEAD_FROM + HEAD_TO) * 0.5, 0);
        sl.sendParticles(new ItemParticleOption(ParticleTypes.ITEM, new ItemStack(Items.BRICK)), h.x, h.y, h.z, 22, 0.3, 0.3, 0.3, 0.22);
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.DECORATED_POT.defaultBlockState()), h.x, h.y, h.z, 16, 0.3,
                0.3, 0.3, 0.15);
        sl.sendParticles(ParticleTypes.CRIT, h.x, h.y, h.z, 24, 0.35, 0.35, 0.35, 0.45);
        playSound(WWSounds.POT_GOLEM_HEADSHOT, 1.4f, 0.95f + random.nextFloat() * 0.15f);
        level().broadcastEntityEvent(this, EVENT_HEADSHOT);
    }

    private static boolean isCrackingHit(DamageSource s) {
        return s.getEntity() != null || s.getDirectEntity() != null || s.is(DamageTypeTags.IS_EXPLOSION) || s.is(DamageTypeTags.IS_PROJECTILE);
    }

    // --------------------------------------------------------------------------------------- fighting

    @Override
    public boolean doHurtTarget(Entity target) {
        if (shard() == Shard.BLADE) {
            return slash(target);
        }
        float base = (float) getAttributeValue(Attributes.ATTACK_DAMAGE);
        float dmg = (int) base > 0 ? base / 2f + random.nextInt((int) base) : base;
        DamageSource src = damageSources().mobAttack(this);
        boolean hit = target.hurt(src, dmg);
        if (hit) {
            toss(target, 0.4);
            burnFist(target);
            if (level() instanceof ServerLevel sl) {
                net.minecraft.world.item.enchantment.EnchantmentHelper.doPostAttackEffects(sl, target, src);
            }
            setLastHurtMob(target);
        }
        level().broadcastEntityEvent(this, shard() == Shard.MINER ? EVENT_MINE : EVENT_ATTACK);
        playSound(SoundEvents.IRON_GOLEM_ATTACK, 1.0f, 1.2f);
        return hit;
    }

    /** The blade arm: 12 damage to the target and a sweep through the hostile mobs around it. */
    private boolean slash(Entity target) {
        DamageSource src = damageSources().mobAttack(this);
        boolean hit = target.hurt(src, BLADE_DAMAGE);
        if (hit) {
            toss(target, 0.25);
            burnFist(target);
            setLastHurtMob(target);
        }
        for (LivingEntity e : level().getEntitiesOfClass(LivingEntity.class, target.getBoundingBox().inflate(1.5, 0.25, 1.5),
                e -> e != target && e != this && e instanceof Enemy && !isFriendly(e) && e.isAlive())) {
            if (e.hurt(src, SWEEP_DAMAGE)) {
                e.knockback(0.4, Mth.sin(getYRot() * Mth.DEG_TO_RAD), -Mth.cos(getYRot() * Mth.DEG_TO_RAD));
            }
        }
        if (level() instanceof ServerLevel sl) {
            Vec3 look = Vec3.directionFromRotation(0, getYRot());
            sl.sendParticles(ParticleTypes.SWEEP_ATTACK, getX() + look.x * 1.6, getY() + getBbHeight() * 0.5, getZ() + look.z * 1.6, 1,
                    0, 0, 0, 0);
            if (hit) {
                net.minecraft.world.item.enchantment.EnchantmentHelper.doPostAttackEffects(sl, target, src);
            }
        }
        level().broadcastEntityEvent(this, EVENT_SLASH);
        playSound(SoundEvents.PLAYER_ATTACK_SWEEP, 1.2f, 0.7f);
        return hit;
    }

    private static void toss(Entity target, double up) {
        double kr = target instanceof LivingEntity le ? le.getAttributeValue(Attributes.KNOCKBACK_RESISTANCE) : 0;
        target.setDeltaMovement(target.getDeltaMovement().add(0, up * Math.max(0, 1 - kr), 0));
    }

    /** The bow arm (RangedAttackGoal): an arrow, unless the owner is in the line of fire. */
    @Override
    public void performRangedAttack(LivingEntity target, float power) {
        if (!(level() instanceof ServerLevel sl) || shard() != Shard.ARCHER) {
            return;
        }
        Player o = ownerPlayer();
        Vec3 from = new Vec3(getX(), getY() + getBbHeight() * 0.55, getZ());
        if (o != null && o != target && o.getBoundingBox().inflate(0.5).clip(from, target.getEyePosition()).isPresent()) {
            return;
        }
        Arrow arrow = new Arrow(sl, this, new ItemStack(Items.ARROW), new ItemStack(Items.BOW));
        arrow.setPos(from.x, from.y, from.z);
        arrow.pickup = AbstractArrow.Pickup.DISALLOWED;
        arrow.setBaseDamage(3.0);
        double dx = target.getX() - from.x, dy = target.getY(1.0 / 3.0) - from.y, dz = target.getZ() - from.z;
        double h = Math.sqrt(dx * dx + dz * dz);
        arrow.shoot(dx, dy + h * 0.2, dz, 1.8f, 6f - sl.getDifficulty().getId());
        sl.addFreshEntity(arrow);
        playSound(SoundEvents.SKELETON_SHOOT, 1.0f, 0.8f / (random.nextFloat() * 0.4f + 0.8f));
        level().broadcastEntityEvent(this, EVENT_SHOOT);
    }

    /** Called by the mine goal as the pickaxe arm swings. */
    void swingPickaxe() {
        level().broadcastEntityEvent(this, EVENT_MINE);
    }

    // --------------------------------------------------------------------------------------- interaction

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        boolean client = level().isClientSide;
        if (stack.is(Items.BRUSH)) {
            if (!hasPot() || isBusy() || isDazed()) {
                return InteractionResult.PASS;
            }
            if (!client && brush()) {
                stack.hurtAndBreak(1, player, getSlotForHand(hand));
            }
            return InteractionResult.sidedSuccess(client);
        }
        if (stack.is(Items.DECORATED_POT)) {   // a new head (the old pot, if any, comes off intact)
            if (!client) {
                if (hasPot() && level() instanceof ServerLevel sl) {
                    popPot(sl);
                }
                dropStash();
                setHead(stack);
                stack.consume(1, player);
                playSound(SoundEvents.DECORATED_POT_PLACE, 1.0f, 1.0f);
                playSound(WWSounds.POT_GOLEM_BUILD, 0.8f, 1.2f);
                level().broadcastEntityEvent(this, EVENT_BUILD);
            }
            return InteractionResult.sidedSuccess(client);
        }
        Shard s = Shard.of(stack);
        if (s != Shard.NONE && s != shard()) {   // equip a body shard; swapping drops the old one
            if (!client) {
                Shard old = shard();
                if (old.sherd != null) {
                    spawnAtLocation(new ItemStack(old.sherd), getBbHeight() * 0.5f);
                }
                setShard(s);
                stack.consume(1, player);
                playSound(WWSounds.POT_GOLEM_REPAIR, 1.0f, 0.8f);
                playSound(SoundEvents.DECORATED_POT_INSERT, 1.0f, 0.7f);
                level().broadcastEntityEvent(this, EVENT_BUILD);
            }
            return InteractionResult.sidedSuccess(client);
        }
        if (stack.is(ItemTags.DECORATED_POT_INGREDIENTS) && hasPot() && cracks() > 0) {   // any sherd or a brick
            if (!client) {
                repairCrack();
                stack.consume(1, player);
            }
            return InteractionResult.sidedSuccess(client);
        }
        // Plenty: an empty hand opens the pot's stash (its owner's, or anyone's if it has none)
        if (stack.isEmpty() && hand == InteractionHand.MAIN_HAND && headForm() == HeadForm.PLENTY && (owner == null
                || owner.equals(player.getUUID()))) {
            if (!client) {
                player.openMenu(new SimpleMenuProvider((id, inv, p) -> ChestMenu.threeRows(id, inv, stash), getDisplayName()));
                playSound(SoundEvents.DECORATED_POT_INSERT, 0.8f, 0.8f);
            }
            return InteractionResult.sidedSuccess(client);
        }
        return super.mobInteract(player, hand);
    }

    // --------------------------------------------------------------------------------------- spawning, death, saving

    /** From a spawn egg: a plain pot head, and the nearest player (who used the egg) as owner. */
    @Override
    public SpawnGroupData finalizeSpawn(ServerLevelAccessor level, DifficultyInstance difficulty, MobSpawnType reason,
                                        @Nullable SpawnGroupData data) {
        SpawnGroupData out = super.finalizeSpawn(level, difficulty, reason, data);
        if (!hasPot()) {
            setHead(new ItemStack(Items.DECORATED_POT));
        }
        if (reason == MobSpawnType.SPAWN_EGG && owner == null) {
            Player p = level.getNearestPlayer(this, 8.0);
            if (p != null) {
                owner = p.getUUID();
            }
        }
        return out;
    }

    /** Its pot's sherds and contents, the Plenty stash and its body shard (the 2-4 amber shards come from its loot table). */
    @Override
    protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean byPlayer) {
        super.dropCustomDeathLoot(level, source, byPlayer);
        ItemStack pot = head();
        if (!pot.isEmpty()) {
            for (Item side : decorations(pot).ordered()) {
                spawnAtLocation(new ItemStack(side));
            }
            ItemStack inside = contents(pot);
            if (!inside.isEmpty()) {
                spawnAtLocation(inside.copy());
            }
            entityData.set(HEAD, ItemStack.EMPTY);
        }
        dropStash();
        Shard s = shard();
        if (s.sherd != null) {
            spawnAtLocation(new ItemStack(s.sherd));
            setShard(Shard.NONE);
        }
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        if (hasPot()) {
            tag.put("Head", head().save(registryAccess()));
        }
        tag.putString("Shard", shard().name().toLowerCase(java.util.Locale.ROOT));
        tag.putInt("Cracks", cracks());
        if (owner != null) {
            tag.putUUID("Owner", owner);
        }
        tag.putInt("DazedTicks", dazedTicks);
        tag.putInt("BeamCooldown", beamCooldown);
        tag.putInt("HowlCooldown", howlCooldown);
        tag.putString("Action", action.name().toLowerCase(java.util.Locale.ROOT));
        tag.putInt("ActionTicks", actionTicks);
        tag.putInt("FlowCooldown", flowCooldown);
        tag.putInt("BrewerCooldown", brewerCooldown);
        tag.put("Stash", stash.createTag(registryAccess()));
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        ItemStack pot = tag.contains("Head") ? ItemStack.parse(registryAccess(), tag.get("Head")).orElse(ItemStack.EMPTY) : ItemStack.EMPTY;
        entityData.set(HEAD, pot);
        setCracks(tag.getInt("Cracks"));
        setShard(Shard.byName(tag.getString("Shard")));
        owner = tag.hasUUID("Owner") ? tag.getUUID("Owner") : null;
        dazedTicks = tag.getInt("DazedTicks");
        setFlag(FLAG_DAZED, dazedTicks > 0);
        beamCooldown = tag.getInt("BeamCooldown");
        howlCooldown = tag.getInt("HowlCooldown");
        action = Action.NONE;
        for (Action a : Action.values()) {
            if (a.name().equalsIgnoreCase(tag.getString("Action"))) {
                action = a;
            }
        }
        actionTicks = tag.getInt("ActionTicks");
        setFlag(FLAG_FUSING, action == Action.FUSE);
        flowCooldown = tag.getInt("FlowCooldown");
        brewerCooldown = tag.getInt("BrewerCooldown");
        stash.fromTag(tag.getList("Stash", net.minecraft.nbt.Tag.TAG_COMPOUND), registryAccess());
    }

    // --------------------------------------------------------------------------------------- client

    private void clientTick() {
        for (Clip c : clips) {
            c.tick(tickCount);
        }
        boolean moving = getDeltaMovement().horizontalDistanceSqr() > 1.0e-5 || walkAnimation.speed() > 0.05f;
        dazedState.animateWhen(isDazed(), tickCount);
        idleState.animateWhen(!moving && !isDazed(), tickCount);
        // jelly spring: footfalls and hits make it wobble, then it settles
        float pos = walkAnimation.position();
        if (onGround() && walkAnimation.speed() > 0.1f && Mth.floor(pos / 6.5f) != Mth.floor(lastStepPos / 6.5f)) {
            kick(0.06f + 0.08f * Math.min(1f, walkAnimation.speed()));
        }
        lastStepPos = pos;
        jellyO = jelly;
        jellyVel += -jelly * 0.3f;   // spring
        jellyVel *= 0.82f;           // damping
        jelly = Mth.clamp(jelly + jellyVel, -0.4f, 0.4f);
        if (isDazed() && tickCount % 5 == 0) {
            Vec3 h = headPos();
            double a = tickCount * 0.35;
            level().addParticle(dev.lowpix.winterworks.registry.WWParticles.STUN_STAR, h.x + Math.cos(a) * 0.6, h.y + 0.2,
                    h.z + Math.sin(a) * 0.6, 0, 0.01, 0);
        }
        if (headForm() == HeadForm.BURN && abilityActive() && random.nextInt(4) == 0) {   // the fists smoulder
            Vec3 side = Vec3.directionFromRotation(0, yBodyRot + (random.nextBoolean() ? 90f : -90f)).scale(0.9);
            Vec3 fwd = Vec3.directionFromRotation(0, yBodyRot).scale(0.35);
            level().addParticle(random.nextInt(3) == 0 ? ParticleTypes.SMALL_FLAME : ParticleTypes.FLAME, getX() + side.x + fwd.x,
                    getY() + 0.95 + random.nextDouble() * 0.2, getZ() + side.z + fwd.z, 0, 0.02, 0);
        }
        if (cracks() >= 2 && random.nextInt(30) == 0) {
            Vec3 h = headPos();
            level().addParticle(new ItemParticleOption(ParticleTypes.ITEM, new ItemStack(Items.BRICK)), h.x + random.nextGaussian() * 0.3,
                    h.y + random.nextDouble() * 0.6, h.z + random.nextGaussian() * 0.3, 0, -0.05, 0);
        }
    }

    private void kick(float v) {
        jellyVel += v;
    }

    public float jelly(float partial) {
        return Mth.lerp(partial, jellyO, jelly);
    }

    /** Client: is the head ability on (a head with an ability, not dazed)? Its pattern glows while it is. */
    public boolean abilityActive() {
        return hasPot() && headForm().glow != 0 && !isDazed();
    }

    /** Client: 0..1 how bright the pattern glows: a slow breath, flaring when the ability fires. */
    public float glowStrength(float partial) {
        if (!abilityActive()) {
            return 0f;
        }
        float t = tickCount + partial;
        float breath = 0.72f + 0.18f * Mth.sin(t * 0.09f + getId());
        float flare = Mth.clamp(1f - (t - abilityFlareTick) / 14f, 0f, 1f);
        return Mth.clamp(breath + flare * 0.5f, 0f, 1f);
    }

    /** 0..1 how far the Danger fuse has burnt (client). */
    public float fuseProgress(float partial) {
        if (!isFusing() || fuseStartTick < 0) {
            return 0f;
        }
        return Mth.clamp((tickCount - fuseStartTick + partial) / FUSE_TICKS, 0f, 1f);
    }

    @Override
    public void handleDamageEvent(DamageSource source) {
        super.handleDamageEvent(source);
        kick(0.3f);
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EVENT_ATTACK -> {
                attackClip.start(tickCount);
                kick(0.12f);
            }
            case EVENT_SLASH -> {
                slashClip.start(tickCount);
                kick(0.15f);
            }
            case EVENT_MINE -> {
                mineClip.start(tickCount);
                kick(0.1f);
            }
            case EVENT_SHOOT -> shootClip.start(tickCount);
            case EVENT_HOWL -> {
                howlClip.start(tickCount);
                kick(0.2f);
            }
            case EVENT_BEAM -> beamClip.start(tickCount);
            case EVENT_GIGGLE -> {
                giggleClip.start(tickCount);
                kick(0.25f);
            }
            case EVENT_SNEEZE -> {
                sneezeClip.start(tickCount);
                kick(0.35f);
            }
            case EVENT_FUSE -> {
                fuseClip.start(tickCount);
                fuseStartTick = tickCount;
            }
            case EVENT_CRACK -> {
                kick(0.2f);
                Vec3 h = headPos();
                for (int i = 0; i < 12; i++) {
                    level().addParticle(new ItemParticleOption(ParticleTypes.ITEM, new ItemStack(Items.BRICK)), h.x + random.nextGaussian() * 0.25,
                            h.y + random.nextDouble() * 0.7, h.z + random.nextGaussian() * 0.25, random.nextGaussian() * 0.08, 0.1,
                            random.nextGaussian() * 0.08);
                }
            }
            case EVENT_SHATTER, EVENT_BUILD -> kick(0.4f);
            case EVENT_HEADSHOT -> kick(0.45f);
            case EVENT_ABILITY -> abilityFlareTick = tickCount;
            case EVENT_REPAIR -> {
                kick(0.1f);
                Vec3 h = headPos();
                for (int i = 0; i < 6; i++) {
                    level().addParticle(ParticleTypes.WAX_ON, h.x + random.nextGaussian() * 0.3, h.y + random.nextDouble() * 0.7,
                            h.z + random.nextGaussian() * 0.3, 0, 0.05, 0);
                }
            }
            default -> super.handleEntityEvent(id);
        }
    }

    // --------------------------------------------------------------------------------------- sounds

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.POT_GOLEM_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.POT_GOLEM_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        playSound(WWSounds.POT_GOLEM_STEP, 0.8f, 0.9f + random.nextFloat() * 0.2f);
    }

    @Override
    public int getMaxHeadYRot() {
        return 40;
    }
}
