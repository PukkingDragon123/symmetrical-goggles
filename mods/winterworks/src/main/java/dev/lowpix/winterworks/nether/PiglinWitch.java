package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.hex.Hexing;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import dev.lowpix.winterworks.soulbull.SoulBull;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.minecraft.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.tags.EnchantmentTags;
import net.minecraft.util.Mth;
import net.minecraft.world.BossEvent;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MoveTowardsRestrictionGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.memory.WalkTarget;
import net.minecraft.world.entity.ai.util.DefaultRandomPos;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.monster.piglin.PiglinBrute;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.ThrownPotion;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Piglin Witch (docs/HEXES_UPDATE.md section 6; docs/FIXES_0_4.md "The Piglin Witch, super strong"): an old, fat,
 * half-zombified Piglin crone and drunkard with a huge patched backpack. One lives in every Hex Fortress (spawned with
 * it, persistent, never despawns), with her crew (WitchCrew).
 * <p>
 * Neutral. She stumbles about drunk, hiccups, swigs from her flask and rummages in her backpack, pulling out random
 * things (shown in her hand) to look at. She refuses to trade (shakes her head, burps) until given an Elixir of Greed:
 * she drinks it, cackles, and her trades (the vanilla merchant screen) stay open for good.
 * <p>
 * Attack her, or her crew ({@link #provoke}), and she fights with her spellbook (an open hexed book floats before her,
 * glyphs circling: client.nether.PiglinWitchRenderer): a boss bar, {@link #MAX_HEALTH} health and her spells, each
 * with its own telegraph (synced as {@link #castSpell()}), sound and particles:
 * <ul>
 * <li>{@link Spell#BOLTS}: volleys of homing soul-fire bolts (HexBolt);</li>
 * <li>{@link Spell#RING}: a ring of soul fire bursting outward along the ground (jump it);</li>
 * <li>{@link Spell#HEX}: Hexed (no natural regeneration) for 30 s, and Slowness;</li>
 * <li>{@link Spell#BARRAGE}: Harming, Weakness and Slowness potions thrown one after another;</li>
 * <li>{@link Spell#SUMMON}: two brutes out of soul fire, her crew's brutes come running, and a Soul Bull rises from a
 * pile of bones (the bull's revive clip);</li>
 * <li>{@link Spell#BLINK}: hit hard, she vanishes in smoke and reappears nearby.</li>
 * </ul>
 * She drinks healing once per fight, when low. Killed, she drops her spellbook (a Hexed Book with a strong random hex)
 * and her stash (her loot table).
 * <p>
 * Every action is server-side; the client plays the matching lowpix clip (drink, hiccup, rummage, refuse, cackle,
 * throw) from an entity event, and the trade loop from the synced trading flag. The held item (flask, potion or
 * trinket) is her main-hand item, drawn at the model's hand_r bone.
 */
public class PiglinWitch extends PathfinderMob implements Merchant, RangedAttackMob {
    public static final byte EVENT_DRINK = 60, EVENT_HICCUP = 61, EVENT_RUMMAGE = 62, EVENT_REFUSE = 63, EVENT_CACKLE = 64,
            EVENT_THROW = 65;
    /** Clip lengths in ticks (the contract's seconds x 20). */
    public static final int DRINK_TICKS = 32, HICCUP_TICKS = 12, RUMMAGE_TICKS = 40, REFUSE_TICKS = 24, CACKLE_TICKS = 30,
            THROW_TICKS = 16;
    public static final double MAX_HEALTH = 250;
    /** She forgets a fight this long after she or her crew was last provoked, once her foe is out of sight. */
    public static final int FORGET_TICKS = 600;
    /** She drinks her healing once per fight below this share of her health; it gives back this share. */
    public static final float HEAL_BELOW = 0.35f, HEAL_SHARE = 0.3f;
    /** The soul ring: how fast and how far it spreads, what it does. */
    public static final double RING_SPEED = 0.4, RING_MAX = 12;
    public static final float RING_DAMAGE = 7f, HEX_SLOWNESS_LEVEL = 1;
    public static final int HEXED_TICKS = 600, MAX_SUMMONED_BRUTES = 4;
    /** How long she stares at what she pulled out of the backpack before stuffing it back in. */
    private static final int LOOK_TICKS = 50;
    private static final int RESTOCK_TICKS = 12000;
    private static final EntityDataAccessor<Boolean> DATA_TRADING = SynchedEntityData.defineId(PiglinWitch.class,
            EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> DATA_OPEN = SynchedEntityData.defineId(PiglinWitch.class,
            EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> DATA_FIGHTING = SynchedEntityData.defineId(PiglinWitch.class,
            EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Byte> DATA_CAST = SynchedEntityData.defineId(PiglinWitch.class, EntityDataSerializers.BYTE);
    /** The odds and ends in her backpack: she pulls one out, squints at it and puts it back. */
    private static final Item[] TRINKETS = {Items.BONE, Items.ROTTEN_FLESH, Items.GOLD_NUGGET, Items.GLASS_BOTTLE, Items.RED_MUSHROOM,
            Items.BROWN_MUSHROOM, Items.FERMENTED_SPIDER_EYE, Items.SPIDER_EYE, Items.NETHER_WART, Items.CLOCK, Items.COMPASS,
            Items.BOOK, Items.CANDLE, Items.BLAZE_POWDER, Items.MAGMA_CREAM, Items.RABBIT_FOOT, Items.COOKED_PORKCHOP,
            Items.POISONOUS_POTATO, Items.STRING, Items.SPYGLASS, Items.SKELETON_SKULL, Items.GOLDEN_CARROT};

    /** Her spells: the telegraph's length (ticks) and the cooldown after each cast. */
    public enum Spell {
        NONE(0, 0), BOLTS(20, 90), RING(24, 160), HEX(20, 400), BARRAGE(14, 120), SUMMON(30, 700), BLINK(8, 140);

        public final int telegraph, cooldown;

        Spell(int telegraph, int cooldown) {
            this.telegraph = telegraph;
            this.cooldown = cooldown;
        }

        public static Spell of(int i) {
            Spell[] all = values();
            return i >= 0 && i < all.length ? all[i] : NONE;
        }
    }

    enum Action { NONE, DRINK_FLASK, DRINK_HEALING, DRINK_GREED, RUMMAGE, REFUSE, CACKLE }

    /** A soul ring spreading out from where she stood. */
    private static final class Ring {
        final Vec3 centre;
        double radius = 1.0;
        final Set<UUID> hit = new HashSet<>();

        Ring(Vec3 centre) {
            this.centre = centre;
        }
    }

    // client: animation states, started by entity events (see handleEntityEvent)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState drinkState = new AnimationState();
    public final AnimationState hiccupState = new AnimationState();
    public final AnimationState rummageState = new AnimationState();
    public final AnimationState refuseState = new AnimationState();
    public final AnimationState cackleState = new AnimationState();
    public final AnimationState throwState = new AnimationState();
    public final AnimationState tradeState = new AnimationState();
    /** Client: the tick her current spell's telegraph began (the renderer raises her arm and opens the book wide). */
    public int castStartTick;

    // server state
    @Nullable
    private Player tradingPlayer;
    @Nullable
    private MerchantOffers offers;
    private long lastRestock = -1;
    private Action action = Action.NONE;
    private int actionTicks;
    private int nextHiccup = 200, nextDrink = 500, nextRummage = 300;
    @Nullable
    private BlockPos home;
    // the fight
    private final ServerBossEvent bossEvent = (ServerBossEvent) new ServerBossEvent(getDisplayName(), BossEvent.BossBarColor.PURPLE,
            BossEvent.BossBarOverlay.NOTCHED_10).setDarkenScreen(false);
    private long lastProvoked;
    private int fightTicks;
    private boolean healedThisFight;
    private int castTicks, volleyLeft, nextCast;
    private final long[] readyAt = new long[Spell.values().length];
    private final List<Ring> rings = new ArrayList<>();
    private float recentDamage;
    private long recentDamageAt;
    @Nullable
    private Vec3 summonAt;
    @Nullable
    private UUID summonedBull;
    private final List<UUID> summonedBrutes = new ArrayList<>();

    public PiglinWitch(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
        xpReward = 60;
        setDropChance(EquipmentSlot.MAINHAND, 0f);   // flasks, potions and trinkets stay in the backpack
    }

    public static AttributeSupplier.Builder createAttributes() {
        return PathfinderMob.createMobAttributes().add(Attributes.MAX_HEALTH, MAX_HEALTH).add(Attributes.MOVEMENT_SPEED, 0.2)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.6).add(Attributes.FOLLOW_RANGE, 32).add(Attributes.ARMOR, 6);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DATA_TRADING, false);
        builder.define(DATA_OPEN, false);
        builder.define(DATA_FIGHTING, false);
        builder.define(DATA_CAST, (byte) 0);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new TradeGoal());
        goalSelector.addGoal(2, new BusyGoal());
        goalSelector.addGoal(3, new SpellGoal());
        goalSelector.addGoal(5, new MoveTowardsRestrictionGoal(this, 0.7));
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.6));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
    }

    // --------------------------------------------------------------------------------------- state

    /** True once she has drunk an Elixir of Greed: her trades are open for good. */
    public boolean tradesOpen() {
        return entityData.get(DATA_OPEN);
    }

    public void setTradesOpen(boolean open) {
        entityData.set(DATA_OPEN, open);
    }

    /** Synced: someone has her merchant screen open (the trade loop plays). */
    public boolean isTradingSynced() {
        return entityData.get(DATA_TRADING);
    }

    public boolean isTrading() {
        return tradingPlayer != null;
    }

    /** Synced: she is fighting (the boss bar is up and her spellbook floats before her). */
    public boolean isFighting() {
        return entityData.get(DATA_FIGHTING);
    }

    /** Synced: the spell she is casting (its telegraph, then its release), or NONE. */
    public Spell castSpell() {
        return Spell.of(entityData.get(DATA_CAST));
    }

    /** Is she in the middle of a drink (flask, healing potion or the Elixir of Greed)? */
    public boolean isDrinking() {
        return action == Action.DRINK_FLASK || action == Action.DRINK_HEALING || action == Action.DRINK_GREED;
    }

    public boolean healedThisFight() {
        return healedThisFight;
    }

    public ServerBossEvent bossEvent() {
        return bossEvent;
    }

    @Nullable
    public BlockPos home() {
        return home;
    }

    /** Where she lives (her quarters in a Hex Fortress): she wanders no further than 14 blocks from it. */
    public void setHome(BlockPos pos) {
        home = pos.immutable();
        restrictTo(home, 14);
    }

    @Override
    public boolean requiresCustomPersistence() {
        return true;
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return false;
    }

    /** Where her spellbook floats: before her, clear of her belly, at chest height. */
    public static final float BOOK_FORWARD = 1.2f, BOOK_HEIGHT = 1.6f;

    public Vec3 bookPos(float partial) {
        float yaw = Mth.lerp(partial, yBodyRotO, yBodyRot) * Mth.DEG_TO_RAD;
        Vec3 fwd = new Vec3(-Mth.sin(yaw), 0, Mth.cos(yaw));
        return getPosition(partial).add(fwd.scale(BOOK_FORWARD)).add(0, BOOK_HEIGHT, 0);
    }

    // --------------------------------------------------------------------------------------- the fight

    /**
     * Someone attacked her or her crew: she fights them. A fight starts the boss bar and the spellbook; it ends when her
     * foe is dead, gone, or out of sight {@link #FORGET_TICKS} after the last provocation.
     */
    public void provoke(@Nullable LivingEntity foe) {
        if (level().isClientSide || foe == null || foe == this || !foe.isAlive() || !EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(foe)
                || WitchCrew.sameCrew(this, foe) || !isAlive()) {
            return;
        }
        lastProvoked = level().getGameTime();
        if (getTarget() == null || !getTarget().isAlive() || getTarget() == foe || distanceToSqr(foe) < distanceToSqr(getTarget())) {
            setTarget(foe);
        }
        if (!isFighting()) {
            startFight();
        }
    }

    private void startFight() {
        entityData.set(DATA_FIGHTING, true);
        healedThisFight = false;
        fightTicks = 0;
        nextCast = 15;
        long now = level().getGameTime();
        readyAt[Spell.BOLTS.ordinal()] = now;
        readyAt[Spell.RING.ordinal()] = now + 60;
        readyAt[Spell.HEX.ordinal()] = now + 40;
        readyAt[Spell.BARRAGE.ordinal()] = now + 30;
        readyAt[Spell.SUMMON.ordinal()] = now + 160;
        readyAt[Spell.BLINK.ordinal()] = now;
        if (tradingPlayer != null) {
            if (tradingPlayer instanceof ServerPlayer sp) {
                sp.closeContainer();
            }
            setTradingPlayer(null);
        }
        if (action == Action.RUMMAGE || action == Action.REFUSE || action == Action.DRINK_FLASK) {
            setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
            endAction();
        }
        playSound(WWSounds.PIGLIN_WITCH_CACKLE, 1.4f, 0.75f);
        playSound(WWSounds.PIGLIN_WITCH_CAST, 1.0f, 0.6f);
        if (level() instanceof ServerLevel sl) {
            Vec3 b = bookPos(1f);
            sl.sendParticles(WWParticles.HEX_RUNE, b.x, b.y, b.z, 20, 0.4, 0.4, 0.4, 0.03);
        }
    }

    private void endFight() {
        entityData.set(DATA_FIGHTING, false);
        setCast(Spell.NONE);
        volleyLeft = 0;
        rings.clear();
        bossEvent.removeAllPlayers();
        setTarget(null);
    }

    private void setCast(Spell s) {
        entityData.set(DATA_CAST, (byte) s.ordinal());
        castTicks = 0;
    }

    private boolean validFoe(@Nullable LivingEntity t) {
        return t != null && t.isAlive() && !t.isRemoved() && t.level() == level() && distanceToSqr(t) < 48 * 48
                && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(t);
    }

    /** One tick of the fight (server): the boss bar, the spell under way or the next one, her rings, her one healing. */
    private void tickFight() {
        LivingEntity t = getTarget();
        long now = level().getGameTime();
        fightTicks++;
        if (!validFoe(t) || (now - lastProvoked > FORGET_TICKS && !getSensing().hasLineOfSight(t))) {
            endFight();
            return;
        }
        bossEvent.setProgress(getHealth() / getMaxHealth());
        if (tickCount % 10 == 0 && level() instanceof ServerLevel sl) {
            for (ServerPlayer p : sl.players()) {
                boolean near = p.distanceToSqr(this) < 40 * 40 && p.isAlive();
                if (near && !bossEvent.getPlayers().contains(p)) {
                    bossEvent.addPlayer(p);
                } else if (!near && bossEvent.getPlayers().contains(p)) {
                    bossEvent.removePlayer(p);
                }
            }
        }
        tickRings();
        if (!healedThisFight && getHealth() < getMaxHealth() * HEAL_BELOW && castSpell() == Spell.NONE && action == Action.NONE) {
            healedThisFight = true;
            startDrink(Action.DRINK_HEALING, PotionContents.createItemStack(Items.POTION, Potions.STRONG_HEALING));
            return;
        }
        Spell s = castSpell();
        if (s != Spell.NONE) {
            castTicks++;
            telegraph(s, t);
            if (castTicks == s.telegraph) {
                release(s, t);
            } else if (castTicks > s.telegraph) {
                followThrough(s, t);
            }
        } else if (--nextCast <= 0 && !isDrinking()) {
            Spell next = choose(t, now);
            if (next != Spell.NONE) {
                castNow(next);
            } else {
                nextCast = 10;
            }
        }
    }

    /** Starts casting `s` now (whatever its cooldown): the telegraph, then the spell. */
    public void castNow(Spell s) {
        if (level().isClientSide || s == Spell.NONE) {
            return;
        }
        if (isDrinking()) {
            endAction();
            setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
        }
        setCast(s);
        readyAt[s.ordinal()] = level().getGameTime() + s.cooldown;
        getNavigation().stop();
        switch (s) {
            case BOLTS -> playSound(WWSounds.PIGLIN_WITCH_CAST, 1.2f, 1.3f);
            case RING -> {
                playSound(WWSounds.PIGLIN_WITCH_CAST, 1.3f, 0.7f);
                playSound(SoundEvents.EVOKER_PREPARE_ATTACK, 1f, 0.8f);
            }
            case HEX -> {
                playSound(WWSounds.PIGLIN_WITCH_CAST, 1.2f, 1.0f);
                playSound(SoundEvents.EVOKER_PREPARE_WOLOLO, 1f, 0.7f);
            }
            case BARRAGE -> {
                playSound(WWSounds.PIGLIN_WITCH_RUMMAGE, 1f, 1.2f);
                level().broadcastEntityEvent(this, EVENT_RUMMAGE);
            }
            case SUMMON -> {
                playSound(WWSounds.PIGLIN_WITCH_SUMMON, 1.4f, 1f);
                level().broadcastEntityEvent(this, EVENT_CACKLE);
                LivingEntity t = getTarget();
                Vec3 toward = t == null ? Vec3.directionFromRotation(0, getYRot()) : t.position().subtract(position()).normalize();
                summonAt = position().add(toward.scale(3.0)).add(toward.yRot(Mth.HALF_PI).scale(2.0));
            }
            case BLINK -> playSound(WWSounds.PIGLIN_WITCH_BLINK, 1f, 0.7f);
            default -> { }
        }
    }

    /** What to cast next: each spell has its own cooldown and wants its own range. */
    private Spell choose(LivingEntity t, long now) {
        double d = distanceTo(t);
        boolean sees = getSensing().hasLineOfSight(t);
        List<Spell> pool = new ArrayList<>();
        if (ready(Spell.BOLTS, now) && sees) {
            add(pool, Spell.BOLTS, 4);
        }
        if (ready(Spell.RING, now) && d < RING_MAX - 1 && Math.abs(t.getY() - getY()) < 2) {
            add(pool, Spell.RING, d < 6 ? 5 : 3);
        }
        if (ready(Spell.HEX, now) && sees && d < 20 && !t.hasEffect(WWEffects.HEXED)) {
            add(pool, Spell.HEX, 3);
        }
        if (ready(Spell.BARRAGE, now) && sees && d < 16) {
            add(pool, Spell.BARRAGE, 3);
        }
        if (ready(Spell.SUMMON, now) && (getHealth() < getMaxHealth() * 0.85f || fightTicks > 300)) {
            add(pool, Spell.SUMMON, 3);
        }
        return pool.isEmpty() ? Spell.NONE : pool.get(random.nextInt(pool.size()));
    }

    private static void add(List<Spell> pool, Spell s, int weight) {
        for (int i = 0; i < weight; i++) {
            pool.add(s);
        }
    }

    private boolean ready(Spell s, long now) {
        return now >= readyAt[s.ordinal()];
    }

    private Vec3 handPos() {
        float yaw = yBodyRot * Mth.DEG_TO_RAD;
        Vec3 fwd = new Vec3(-Mth.sin(yaw), 0, Mth.cos(yaw)), right = new Vec3(-Mth.cos(yaw), 0, -Mth.sin(yaw));
        return position().add(fwd.scale(0.5)).add(right.scale(0.45)).add(0, 1.9, 0);
    }

    /** The telegraph of a spell, every tick until it goes off: its own particles. */
    private void telegraph(Spell s, LivingEntity t) {
        if (!(level() instanceof ServerLevel sl) || castTicks > s.telegraph) {
            return;
        }
        float k = castTicks / (float) s.telegraph;
        switch (s) {
            case BOLTS -> {   // soul fire spirals up round her raised hand
                Vec3 h = handPos();
                double a = castTicks * 0.9;
                sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, h.x + Math.cos(a) * 0.35, h.y + k * 0.3, h.z + Math.sin(a) * 0.35, 1, 0, 0, 0, 0);
                sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, h.x - Math.cos(a) * 0.35, h.y + k * 0.3, h.z - Math.sin(a) * 0.35, 1, 0, 0, 0, 0);
            }
            case RING -> {   // a circle of runes glows on the ground at her feet
                for (int i = 0; i < 6; i++) {
                    double a = (castTicks * 6 + i) * (Mth.TWO_PI / 36);
                    sl.sendParticles(WWParticles.HEX_RUNE, getX() + Math.cos(a) * 1.6, getY() + 0.1, getZ() + Math.sin(a) * 1.6, 1, 0, 0.02, 0, 0);
                }
                if (castTicks % 4 == 0) {
                    sl.sendParticles(ParticleTypes.SOUL, getX(), getY() + 0.2, getZ(), 4, 0.8, 0.05, 0.8, 0.01);
                }
            }
            case HEX -> {   // the hex gathers round its victim
                double a = castTicks * 0.6;
                double r = 1.2 - k * 0.7;
                sl.sendParticles(WWParticles.HEX_RUNE, t.getX() + Math.cos(a) * r, t.getY() + 0.3 + k * 1.6, t.getZ() + Math.sin(a) * r, 1, 0, 0, 0, 0);
                sl.sendParticles(ParticleTypes.WITCH, t.getX() - Math.cos(a) * r, t.getY() + 0.3 + k * 1.6, t.getZ() - Math.sin(a) * r, 1, 0, 0, 0, 0);
            }
            case BARRAGE -> {
                if (castTicks % 3 == 0) {
                    sl.sendParticles(ParticleTypes.WITCH, getX(), getY() + 1.6, getZ(), 3, 0.4, 0.3, 0.4, 0.02);
                }
            }
            case SUMMON -> {   // the bones heap up where the bull will rise
                if (summonAt != null) {
                    sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), summonAt.x,
                            summonAt.y + 0.3, summonAt.z, 4, 0.5, 0.2, 0.5, 0.05);
                    sl.sendParticles(ParticleTypes.SOUL, summonAt.x, summonAt.y + 0.2, summonAt.z, 1, 0.4, 0.1, 0.4, 0.02);
                }
                sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 0.1, getZ(), 2, 1.2, 0.05, 1.2, 0.01);
            }
            case BLINK -> sl.sendParticles(ParticleTypes.LARGE_SMOKE, getX(), getY() + 1.0, getZ(), 4, 0.4, 0.6, 0.4, 0.01);
            default -> { }
        }
    }

    /** The spell goes off. */
    private void release(Spell s, LivingEntity t) {
        ServerLevel sl = (ServerLevel) level();
        switch (s) {
            case BOLTS -> {
                volleyLeft = 3 + (getHealth() < getMaxHealth() * 0.5f ? 2 : 0);
                shootBolt(t);
            }
            case RING -> {
                rings.add(new Ring(position()));
                playSound(SoundEvents.FIRECHARGE_USE, 1.5f, 0.6f);
                playSound(SoundEvents.SOUL_ESCAPE.value(), 2f, 0.6f);
                sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 0.1, getZ(), 30, 0.6, 0.05, 0.6, 0.12);
                endCast();
            }
            case HEX -> {
                if (distanceToSqr(t) < 24 * 24 && getSensing().hasLineOfSight(t)) {
                    t.addEffect(new MobEffectInstance(WWEffects.HEXED, HEXED_TICKS, 0), this);
                    t.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, 200, (int) HEX_SLOWNESS_LEVEL), this);
                    sl.sendParticles(WWParticles.HEX_RUNE, t.getX(), t.getY(0.6), t.getZ(), 24, 0.4, 0.6, 0.4, 0.05);
                    sl.playSound(null, t.getX(), t.getY(), t.getZ(), WWSounds.TRIGGER, SoundSource.HOSTILE, 1.2f, 0.8f);
                }
                playSound(SoundEvents.EVOKER_CAST_SPELL, 1f, 0.7f);
                endCast();
            }
            case BARRAGE -> {
                volleyLeft = 3;
                throwNext(t);
            }
            case SUMMON -> {
                summon(sl, t);
                endCast();
            }
            case BLINK -> {
                blink(sl);
                endCast();
            }
            default -> endCast();
        }
    }

    /** Volleys go on after the release: a bolt every 5 ticks, a potion every 6. */
    private void followThrough(Spell s, LivingEntity t) {
        int since = castTicks - s.telegraph;
        if (s == Spell.BOLTS && since % 5 == 0) {
            shootBolt(t);
        } else if (s == Spell.BARRAGE && since % 6 == 0) {
            throwNext(t);
        }
        if (volleyLeft <= 0) {
            endCast();
        }
    }

    private void endCast() {
        setCast(Spell.NONE);
        volleyLeft = 0;
        nextCast = 22 + random.nextInt(18);
    }

    private void shootBolt(LivingEntity t) {
        if (volleyLeft <= 0) {
            return;
        }
        volleyLeft--;
        Vec3 from = handPos();
        Vec3 dir = t.getEyePosition().subtract(from).normalize()
                .add((random.nextDouble() - 0.5) * 0.6, 0.25 + random.nextDouble() * 0.2, (random.nextDouble() - 0.5) * 0.6);
        HexBolt.shoot(this, from, dir, t);
        level().broadcastEntityEvent(this, EVENT_THROW);
        playSound(SoundEvents.BLAZE_SHOOT, 1f, 0.6f + random.nextFloat() * 0.2f);
        playSound(SoundEvents.SOUL_ESCAPE.value(), 1f, 1.2f);
    }

    private void throwNext(LivingEntity t) {
        if (volleyLeft <= 0) {
            return;
        }
        Holder<Potion> potion = switch (volleyLeft) {
            case 3 -> Potions.HARMING;
            case 2 -> Potions.WEAKNESS;
            default -> Potions.SLOWNESS;
        };
        volleyLeft--;
        throwPotion(t, potion, 0.95f);
    }

    /** Spreads her soul rings; what is on the ground where a ring passes is burned (jump it). */
    private void tickRings() {
        if (rings.isEmpty() || !(level() instanceof ServerLevel sl)) {
            return;
        }
        for (Iterator<Ring> it = rings.iterator(); it.hasNext(); ) {
            Ring r = it.next();
            r.radius += RING_SPEED;
            if (r.radius > RING_MAX) {
                it.remove();
                continue;
            }
            int n = (int) (r.radius * 7);
            for (int i = 0; i < n; i++) {
                double a = (i + random.nextDouble() * 0.5) * Mth.TWO_PI / n;
                double x = r.centre.x + Math.cos(a) * r.radius, z = r.centre.z + Math.sin(a) * r.radius;
                sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, x, r.centre.y + 0.15, z, 1, 0.02, 0.05, 0.02, 0.01);
                if (i % 4 == 0) {
                    sl.sendParticles(ParticleTypes.SOUL, x, r.centre.y + 0.3, z, 1, 0, 0.05, 0, 0.01);
                }
            }
            if (r.radius > 1.5 && ((int) (r.radius * 10)) % 16 < 4) {
                sl.playSound(null, r.centre.x, r.centre.y, r.centre.z, SoundEvents.FIRE_AMBIENT, SoundSource.HOSTILE, 0.8f, 0.6f);
            }
            AABB box = new AABB(r.centre, r.centre).inflate(r.radius + 1, 2, r.radius + 1);
            for (LivingEntity e : sl.getEntitiesOfClass(LivingEntity.class, box, e -> e != this && e.isAlive() && !WitchCrew.sameCrew(this, e)
                    && EntitySelector.NO_CREATIVE_OR_SPECTATOR.test(e))) {
                double d = Math.sqrt(e.distanceToSqr(r.centre.x, e.getY(), r.centre.z));
                boolean onRing = Math.abs(d - r.radius) < 0.6 + e.getBbWidth() * 0.5;
                boolean low = e.getY() - r.centre.y < 0.6 && e.getY() - r.centre.y > -1.5;   // jumping clears it
                if (onRing && low && r.hit.add(e.getUUID())) {
                    e.hurt(damageSources().indirectMagic(this, this), RING_DAMAGE);
                    Curses.soulIgnite(e, 80);
                    Vec3 out = e.position().subtract(r.centre).multiply(1, 0, 1).normalize().scale(0.5);
                    e.push(out.x, 0.25, out.z);
                    e.hurtMarked = true;
                }
            }
        }
    }

    /** Her brutes come running, two more step out of soul fire, and a Soul Bull rises from the bones. */
    private void summon(ServerLevel sl, LivingEntity t) {
        WitchCrew.Crew crew = getAttached(WitchCrew.CREW);
        if (crew == null) {   // a witch without a fortress: her summons are her own crew
            WitchCrew.enlist(this, home != null ? home : blockPosition(), Rotation.NONE, WitchCrew.WITCH);
            crew = getAttached(WitchCrew.CREW);
        }
        for (PiglinBrute b : sl.getEntitiesOfClass(PiglinBrute.class, getBoundingBox().inflate(32, 10, 32), b -> WitchCrew.sameCrew(this, b))) {
            WitchCrew.anger(b, t);
            b.getBrain().setMemory(MemoryModuleType.WALK_TARGET, new WalkTarget(this, 1.0f, 3));
        }
        summonedBrutes.removeIf(id -> !(sl.getEntity(id) instanceof PiglinBrute b) || !b.isAlive());
        for (int i = 0; i < 2 && summonedBrutes.size() < MAX_SUMMONED_BRUTES; i++) {
            Vec3 at = spotNear(2.5, 4.5);
            PiglinBrute b = EntityType.PIGLIN_BRUTE.create(sl);
            if (b == null || at == null) {
                continue;
            }
            b.moveTo(at.x, at.y, at.z, getYRot(), 0f);
            b.finalizeSpawn(sl, sl.getCurrentDifficultyAt(b.blockPosition()), MobSpawnType.MOB_SUMMONED, null);
            WitchCrew.enlist(b, crew.fortress(), crew.rot(), WitchCrew.QUARTERS_GUARD);
            b.setImmuneToZombification(true);
            sl.addFreshEntity(b);
            WitchCrew.anger(b, t);
            summonedBrutes.add(b.getUUID());
            sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, at.x, at.y + 0.5, at.z, 30, 0.3, 0.6, 0.3, 0.05);
            sl.sendParticles(ParticleTypes.LARGE_SMOKE, at.x, at.y + 0.8, at.z, 10, 0.3, 0.5, 0.3, 0.02);
        }
        if (summonedBull == null || !(sl.getEntity(summonedBull) instanceof SoulBull old) || !old.isAlive()) {
            Vec3 at = summonAt != null ? summonAt : spotNear(3, 5);
            if (at != null) {
                float yaw = (float) (Mth.atan2(t.getZ() - at.z, t.getX() - at.x) * Mth.RAD_TO_DEG) - 90f;
                SoulBull bull = SoulBull.createPenBull(sl, at.x, Math.floor(at.y), at.z, yaw, false);
                WitchCrew.enlist(bull, crew.fortress(), crew.rot(), WitchCrew.PEN);
                sl.addFreshEntity(bull);
                bull.startRevive();
                bull.setTarget(t);
                summonedBull = bull.getUUID();
                sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), at.x, at.y + 0.5,
                        at.z, 40, 0.8, 0.5, 0.8, 0.1);
                sl.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, at.x, at.y + 1.0, at.z, 30, 0.6, 0.8, 0.6, 0.04);
                sl.playSound(null, at.x, at.y, at.z, WWSounds.SOUL_BULL_REVIVE, SoundSource.HOSTILE, 1.5f, 1f);
            }
        }
        summonAt = null;
    }

    /** A free spot on the ground `min`..`max` blocks from her, or null. */
    @Nullable
    private Vec3 spotNear(double min, double max) {
        for (int i = 0; i < 12; i++) {
            double a = random.nextDouble() * Mth.TWO_PI, r = min + random.nextDouble() * (max - min);
            BlockPos p = BlockPos.containing(getX() + Math.cos(a) * r, getY() + 1, getZ() + Math.sin(a) * r);
            for (int dy = 0; dy < 4; dy++) {
                BlockPos q = p.below(dy);
                if (level().getBlockState(q).isAir() && level().getBlockState(q.above()).isAir()
                        && level().getBlockState(q.below()).isFaceSturdy(level(), q.below(), net.minecraft.core.Direction.UP)) {
                    return Vec3.atBottomCenterOf(q);
                }
            }
        }
        return null;
    }

    /** Vanishes in smoke and reappears a few blocks away (near home, if she has one). */
    private void blink(ServerLevel sl) {
        Vec3 from = position();
        sl.sendParticles(ParticleTypes.LARGE_SMOKE, from.x, from.y + 1.0, from.z, 40, 0.5, 0.8, 0.5, 0.04);
        sl.sendParticles(WWParticles.HEX_RUNE, from.x, from.y + 1.2, from.z, 12, 0.5, 0.6, 0.5, 0.03);
        for (int i = 0; i < 16; i++) {
            double a = random.nextDouble() * Mth.TWO_PI, r = 5 + random.nextDouble() * 4;
            double x = getX() + Math.cos(a) * r, z = getZ() + Math.sin(a) * r;
            if (home != null && home.distToCenterSqr(x, getY(), z) > 14 * 14) {
                continue;
            }
            if (randomTeleport(x, getY() + 2, z, false)) {
                break;
            }
        }
        getNavigation().stop();
        Vec3 to = position();
        sl.sendParticles(ParticleTypes.LARGE_SMOKE, to.x, to.y + 1.0, to.z, 30, 0.5, 0.8, 0.5, 0.04);
        sl.playSound(null, from.x, from.y, from.z, WWSounds.PIGLIN_WITCH_BLINK, SoundSource.HOSTILE, 1.2f, 1f);
        sl.playSound(null, to.x, to.y, to.z, WWSounds.PIGLIN_WITCH_BLINK, SoundSource.HOSTILE, 1.0f, 1.3f);
    }

    @Override
    public boolean hurt(DamageSource source, float amount) {
        boolean hurt = super.hurt(source, amount);
        if (hurt && !level().isClientSide && source.getEntity() instanceof LivingEntity attacker && attacker != this) {
            provoke(attacker);
            long now = level().getGameTime();
            recentDamage = now - recentDamageAt < 40 ? recentDamage + amount : amount;
            recentDamageAt = now;
            if (isFighting() && (amount >= 7f || recentDamage >= 14f) && ready(Spell.BLINK, now) && isAlive()
                    && castSpell() != Spell.SUMMON) {
                recentDamage = 0;
                castNow(Spell.BLINK);   // hit hard: off she goes
            }
        }
        return hurt;
    }

    @Override
    protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean recentlyHit) {
        super.dropCustomDeathLoot(level, source, recentlyHit);
        spawnAtLocation(spellbook(level));
    }

    /** Her spellbook: an enchanted book of her own (enchanting-table enchantments at level 30), hexed strongly. */
    public ItemStack spellbook(ServerLevel level) {
        var reg = level.registryAccess().registryOrThrow(Registries.ENCHANTMENT);
        Optional<HolderSet.Named<Enchantment>> table = reg.getTag(EnchantmentTags.IN_ENCHANTING_TABLE);
        ItemStack book = ItemStack.EMPTY;
        for (int i = 0; i < 8 && (book.isEmpty() || Hexing.stored(book).size() < 2); i++) {
            book = EnchantmentHelper.enchantItem(random, new ItemStack(Items.BOOK), 30 + random.nextInt(10), level.registryAccess(), table);
        }
        ItemEnchantments in = Hexing.stored(book);
        boolean sin = Hexing.sinBookProblem(reg, book) == Hexing.OK && random.nextBoolean();
        Optional<Holder<Enchantment>> hidden = random.nextFloat() < Hexing.HIDDEN_CHANCE * 2 ? Hexing.pickHiddenCurse(reg, in, random)
                : Optional.empty();
        if (sin) {
            Hexing.SinPick pick = Hexing.sinSource(reg, in).orElseThrow();
            return Hexing.hexedBook(book, Hexing.sinEnchantments(Hexing.upgraded(in), pick), Hexing.Kind.SIN, hidden);
        }
        Optional<Holder<Enchantment>> curse = Hexing.pickLesserCurse(reg, in, random);
        if (curse.isEmpty()) {
            return Hexing.hexedBook(book, Hexing.upgraded(in), Hexing.Kind.LESSER, hidden);
        }
        return Hexing.hexedBook(book, Hexing.lesserEnchantments(in, curse.get()), Hexing.Kind.LESSER, hidden);
    }

    @Override
    public void startSeenByPlayer(ServerPlayer player) {
        super.startSeenByPlayer(player);
    }

    @Override
    public void stopSeenByPlayer(ServerPlayer player) {
        super.stopSeenByPlayer(player);
        bossEvent.removePlayer(player);
    }

    @Override
    public void remove(RemovalReason reason) {
        bossEvent.removeAllPlayers();
        super.remove(reason);
    }

    @Override
    public void die(DamageSource source) {
        bossEvent.removeAllPlayers();
        super.die(source);
    }

    // --------------------------------------------------------------------------------------- ticking

    @Override
    public void aiStep() {
        if (!level().isClientSide && isAlive()) {
            tickAction();
            if (tradingPlayer != null && (!tradingPlayer.isAlive() || tradingPlayer.distanceToSqr(this) > 64
                    || tradingPlayer.level() != level())) {
                setTradingPlayer(null);
            }
            if (isFighting()) {
                tickFight();
            } else if (getTarget() != null) {
                setTarget(null);   // neutral: only a fight gives her a target
            }
            boolean calm = !isTrading() && !isFighting();
            if (action == Action.NONE && calm) {
                idleHabits();
            }
            stumble();
            if (tickCount % 100 == 0 && offers != null && !isTrading()) {
                long t = level().getGameTime();
                if (lastRestock < 0 || t - lastRestock > RESTOCK_TICKS) {
                    offers.forEach(MerchantOffer::resetUses);
                    lastRestock = t;
                }
            }
        }
        super.aiStep();
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            boolean moving = getDeltaMovement().horizontalDistanceSqr() > 1.0e-5 || walkAnimation.speed() > 0.05f;
            idleState.animateWhen(!moving && !isTradingSynced(), tickCount);
            tradeState.animateWhen(isTradingSynced(), tickCount);
            if (isFighting()) {
                glyphs();
            }
        }
    }

    /** Client: glyphs circling her floating spellbook; brighter and faster while a spell is gathering. */
    private void glyphs() {
        Vec3 b = bookPos(1f);
        boolean casting = castSpell() != Spell.NONE;
        int n = casting ? 3 : 1;
        for (int i = 0; i < n; i++) {
            double a = tickCount * (casting ? 0.45 : 0.22) + i * Mth.TWO_PI / n;
            double r = 0.55;
            double x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r, y = b.y + Math.sin(a * 2) * 0.15;
            level().addParticle(WWParticles.HEX_RUNE, x, y, z, -Math.sin(a) * 0.03, 0.0, Math.cos(a) * 0.03);
        }
        if (random.nextInt(casting ? 2 : 6) == 0) {
            level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, b.x + (random.nextDouble() - 0.5) * 0.4, b.y + 0.15,
                    b.z + (random.nextDouble() - 0.5) * 0.4, 0, 0.015, 0);
        }
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (DATA_CAST.equals(key) && level().isClientSide && castSpell() != Spell.NONE) {
            castStartTick = tickCount;
        }
    }

    private void idleHabits() {
        if (--nextHiccup <= 0) {
            hiccup();
            nextHiccup = 200 + random.nextInt(500);
        } else if (--nextDrink <= 0) {
            startDrink(Action.DRINK_FLASK, new ItemStack(Items.HONEY_BOTTLE));   // the flask: something amber and strong
            nextDrink = 600 + random.nextInt(900);
        } else if (--nextRummage <= 0) {
            startAction(Action.RUMMAGE, EVENT_RUMMAGE);
            playSound(WWSounds.PIGLIN_WITCH_RUMMAGE, 1f, 0.9f + random.nextFloat() * 0.2f);
            nextRummage = 500 + random.nextInt(800);
        }
    }

    /** Drunken stumbling: now and then a lurch sideways and a wobble off course while she walks. */
    private void stumble() {
        if (!onGround() || !getNavigation().isInProgress() || action != Action.NONE || random.nextInt(45) != 0) {
            return;
        }
        float yaw = getYRot() * Mth.DEG_TO_RAD;
        double side = (random.nextBoolean() ? 1 : -1) * (0.12 + random.nextDouble() * 0.12);
        setDeltaMovement(getDeltaMovement().add(Mth.cos(yaw) * side, 0.0, Mth.sin(yaw) * side));
        setYRot(getYRot() + (random.nextFloat() - 0.5f) * 50f);
        playSound(SoundEvents.PIGLIN_STEP, 0.4f, 0.7f);
        if (random.nextInt(4) == 0 && !isFighting()) {
            hiccup();
        }
    }

    private void tickAction() {
        if (action == Action.NONE) {
            return;
        }
        actionTicks++;
        switch (action) {
            case DRINK_FLASK, DRINK_HEALING, DRINK_GREED -> {
                if (actionTicks >= DRINK_TICKS) {
                    finishDrink();
                }
            }
            case RUMMAGE -> {
                if (actionTicks == 24) {   // her paw comes out of the backpack with... something
                    setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(TRINKETS[random.nextInt(TRINKETS.length)]));
                } else if (actionTicks >= RUMMAGE_TICKS + LOOK_TICKS) {
                    setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
                    playSound(WWSounds.PIGLIN_WITCH_RUMMAGE, 0.6f, 1.2f);
                    endAction();
                }
            }
            case REFUSE -> {
                if (actionTicks >= REFUSE_TICKS) {
                    endAction();
                }
            }
            case CACKLE -> {
                if (actionTicks >= CACKLE_TICKS) {
                    endAction();
                }
            }
            default -> endAction();
        }
    }

    private void startAction(Action a, byte event) {
        if (action == Action.RUMMAGE) {
            setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);   // stuff the trinket back in first
        }
        action = a;
        actionTicks = 0;
        getNavigation().stop();
        level().broadcastEntityEvent(this, event);
    }

    private void endAction() {
        action = Action.NONE;
        actionTicks = 0;
    }

    private void startDrink(Action kind, ItemStack drink) {
        startAction(kind, EVENT_DRINK);
        setItemSlot(EquipmentSlot.MAINHAND, drink);
        playSound(WWSounds.PIGLIN_WITCH_DRINK, 1f, 0.8f + random.nextFloat() * 0.3f);
    }

    private void finishDrink() {
        Action kind = action;
        ItemStack drink = getMainHandItem();
        setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
        gameEvent(GameEvent.DRINK);
        endAction();
        switch (kind) {
            case DRINK_HEALING -> {
                if (isFighting()) {   // her one big healing of the fight
                    heal(getMaxHealth() * HEAL_SHARE);
                    addEffect(new MobEffectInstance(MobEffects.REGENERATION, 200, 1));
                    if (level() instanceof ServerLevel sl) {
                        sl.sendParticles(ParticleTypes.HEART, getX(), getY() + 2.0, getZ(), 6, 0.4, 0.3, 0.4, 0.02);
                    }
                    cackle();
                } else {
                    PotionContents contents = drink.get(net.minecraft.core.component.DataComponents.POTION_CONTENTS);
                    if (contents != null) {
                        contents.forEachEffect(this::addEffect);
                    }
                }
            }
            case DRINK_GREED -> {
                setTradesOpen(true);
                if (level() instanceof ServerLevel sl) {
                    sl.sendParticles(WWParticles.GOLD_GLINT, getX(), getY() + 1.6, getZ(), 24, 0.5, 0.5, 0.5, 0.05);
                }
                cackle();
            }
            default -> {
                if (random.nextBoolean()) {
                    playSound(WWSounds.PIGLIN_WITCH_BURP, 1f, 0.8f + random.nextFloat() * 0.3f);
                } else {
                    nextHiccup = Math.min(nextHiccup, 10 + random.nextInt(30));
                }
            }
        }
    }

    public void hiccup() {
        level().broadcastEntityEvent(this, EVENT_HICCUP);
        playSound(WWSounds.PIGLIN_WITCH_HICCUP, 1f, 0.9f + random.nextFloat() * 0.3f);
        if (onGround()) {
            setDeltaMovement(getDeltaMovement().add(0, 0.22, 0));
        }
    }

    public void cackle() {
        startAction(Action.CACKLE, EVENT_CACKLE);
        playSound(WWSounds.PIGLIN_WITCH_CACKLE, 1.2f, 0.9f + random.nextFloat() * 0.2f);
    }

    /** Shakes her head and burps: no trades until she gets an Elixir of Greed. */
    public void refuse(@Nullable Player player) {
        if (action != Action.REFUSE) {
            startAction(Action.REFUSE, EVENT_REFUSE);
            playSound(WWSounds.PIGLIN_WITCH_REFUSE, 1f, 1f);
            playSound(WWSounds.PIGLIN_WITCH_BURP, 0.9f, 0.85f + random.nextFloat() * 0.2f);
        }
        if (player != null) {
            lookAt(player, 60f, 60f);
            player.displayClientMessage(Component.translatable(tradesOpen() ? "message.winterworks.piglin_witch.busy"
                    : "message.winterworks.piglin_witch.refuse"), true);
        }
    }

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EVENT_DRINK -> drinkState.start(tickCount);
            case EVENT_HICCUP -> {
                hiccupState.start(tickCount);
                Vec3 snout = position().add(Vec3.directionFromRotation(0, yBodyRot).scale(0.45)).add(0, 1.55, 0);
                for (int i = 0; i < 3; i++) {
                    level().addParticle(ParticleTypes.BUBBLE_POP, snout.x, snout.y, snout.z, (random.nextDouble() - 0.5) * 0.04, 0.05,
                            (random.nextDouble() - 0.5) * 0.04);
                }
            }
            case EVENT_RUMMAGE -> rummageState.start(tickCount);
            case EVENT_REFUSE -> refuseState.start(tickCount);
            case EVENT_CACKLE -> {
                cackleState.start(tickCount);
                for (int i = 0; i < 12; i++) {
                    level().addParticle(ParticleTypes.WITCH, getX() + random.nextGaussian() * 0.2, getBoundingBox().maxY + 0.3,
                            getZ() + random.nextGaussian() * 0.2, 0, 0, 0);
                }
            }
            case EVENT_THROW -> throwState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    // --------------------------------------------------------------------------------------- trading

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!isAlive() || stack.getItem() instanceof net.minecraft.world.item.SpawnEggItem) {
            return super.mobInteract(player, hand);
        }
        if (level().isClientSide) {
            return InteractionResult.SUCCESS;
        }
        if (getTarget() == player || isFighting()) {
            refuse(player);   // not in the middle of a fight
            return InteractionResult.CONSUME;
        }
        if (stack.is(WWItems.ELIXIR_OF_GREED) && !tradesOpen()) {
            if (!isDrinking()) {
                ItemStack dose = stack.consumeAndReturn(1, player);
                lookAt(player, 60f, 60f);
                startDrink(Action.DRINK_GREED, dose);
            }
            return InteractionResult.CONSUME;
        }
        if (!tradesOpen()) {
            refuse(player);
            return InteractionResult.CONSUME;
        }
        if (isTrading() && tradingPlayer != player) {
            refuse(player);   // one customer at a time
            return InteractionResult.CONSUME;
        }
        if (hand == InteractionHand.MAIN_HAND) {
            player.awardStat(Stats.TALKED_TO_VILLAGER);
        }
        if (getOffers().isEmpty()) {
            return InteractionResult.CONSUME;
        }
        if (action == Action.RUMMAGE || action == Action.REFUSE) {
            setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
            endAction();
        }
        setTradingPlayer(player);
        openTradingScreen(player, getDisplayName(), 1);
        return InteractionResult.CONSUME;
    }

    @Override
    public void setTradingPlayer(@Nullable Player player) {
        tradingPlayer = player;
        entityData.set(DATA_TRADING, player != null);
        if (player != null) {
            getNavigation().stop();
        }
    }

    @Nullable
    @Override
    public Player getTradingPlayer() {
        return tradingPlayer;
    }

    @Override
    public MerchantOffers getOffers() {
        if (level().isClientSide) {
            throw new IllegalStateException("Cannot load the Piglin Witch's offers on the client");
        }
        if (offers == null) {
            offers = createOffers();
        }
        return offers;
    }

    /**
     * Her wares: the Hex Core (3 gold blocks + 16 Soul Elixir), elixir bottles, soul sand, nether wart, ghast tears and
     * crying obsidian for gold; and she pays gold for souls (Soul Elixir).
     */
    public static MerchantOffers createOffers() {
        MerchantOffers o = new MerchantOffers();
        o.add(new MerchantOffer(new ItemCost(Items.GOLD_BLOCK, 3), Optional.of(new ItemCost(WWItems.SOUL_ELIXIR, 16)),
                new ItemStack(WWItems.HEX_CORE), 2, 30, 0f));
        o.add(new MerchantOffer(new ItemCost(Items.GOLD_INGOT, 5), new ItemStack(WWItems.ELIXIR_BOTTLE, 2), 8, 5, 0.05f));
        o.add(new MerchantOffer(new ItemCost(Items.GOLD_INGOT, 2), new ItemStack(Items.SOUL_SAND, 8), 12, 2, 0.05f));
        o.add(new MerchantOffer(new ItemCost(Items.GOLD_INGOT, 3), new ItemStack(Items.NETHER_WART, 6), 12, 2, 0.05f));
        o.add(new MerchantOffer(new ItemCost(Items.GOLD_INGOT, 8), new ItemStack(Items.GHAST_TEAR), 6, 5, 0.05f));
        o.add(new MerchantOffer(new ItemCost(Items.GOLD_INGOT, 6), new ItemStack(Items.CRYING_OBSIDIAN, 2), 8, 4, 0.05f));
        o.add(new MerchantOffer(new ItemCost(WWItems.SOUL_ELIXIR, 2), new ItemStack(Items.GOLD_INGOT, 5), 12, 3, 0.05f));
        return o;
    }

    @Override
    public void overrideOffers(MerchantOffers offers) {
    }

    @Override
    public void notifyTrade(MerchantOffer offer) {
        offer.increaseUses();
        ambientSoundTime = -getAmbientSoundInterval();
        if (offer.shouldRewardExp()) {
            level().addFreshEntity(new ExperienceOrb(level(), getX(), getY() + 0.5, getZ(), offer.getXp() > 0 ? offer.getXp() : 3));
        }
        if (offer.getResult().is(WWItems.HEX_CORE)) {
            level().broadcastEntityEvent(this, EVENT_CACKLE);
            playSound(WWSounds.PIGLIN_WITCH_CACKLE, 1.2f, 0.8f);
        }
    }

    @Override
    public void notifyTradeUpdated(ItemStack stack) {
        if (!level().isClientSide && ambientSoundTime > -getAmbientSoundInterval() + 20) {
            ambientSoundTime = -getAmbientSoundInterval();
            playSound(stack.isEmpty() ? WWSounds.PIGLIN_WITCH_BURP : WWSounds.PIGLIN_WITCH_TRADE, 1f, getVoicePitch());
        }
    }

    @Override
    public int getVillagerXp() {
        return 0;
    }

    @Override
    public void overrideXp(int xp) {
    }

    @Override
    public boolean showProgressBar() {
        return false;
    }

    @Override
    public SoundEvent getNotifyTradeSound() {
        return WWSounds.PIGLIN_WITCH_TRADE;
    }

    @Override
    public boolean canRestock() {
        return true;
    }

    @Override
    public boolean isClientSide() {
        return level().isClientSide;
    }

    // --------------------------------------------------------------------------------------- potions

    /** RangedAttackMob: a potion at `target`, chosen as a witch would. */
    @Override
    public void performRangedAttack(LivingEntity target, float power) {
        if (isDrinking()) {
            return;
        }
        double d = Math.sqrt(distanceToSqr(target.getX(), getY(), target.getZ()));
        Holder<Potion> potion = Potions.HARMING;
        if (d >= 8.0 && !target.hasEffect(MobEffects.MOVEMENT_SLOWDOWN)) {
            potion = Potions.SLOWNESS;
        } else if (d <= 3.0 && !target.hasEffect(MobEffects.WEAKNESS) && random.nextFloat() < 0.25f) {
            potion = Potions.WEAKNESS;
        }
        throwPotion(target, potion, 0.75f);
    }

    /** Throws a splash potion at `target` (leading it a little). */
    public void throwPotion(LivingEntity target, Holder<Potion> potion, float speed) {
        Vec3 v = target.getDeltaMovement();
        double dx = target.getX() + v.x - getX(), dy = target.getEyeY() - 1.1 - getY(), dz = target.getZ() + v.z - getZ();
        double d = Math.sqrt(dx * dx + dz * dz);
        ThrownPotion thrown = new ThrownPotion(level(), this);
        thrown.setItem(PotionContents.createItemStack(Items.SPLASH_POTION, potion));
        thrown.setXRot(thrown.getXRot() + 20f);
        thrown.shoot(dx, dy + d * 0.2, dz, speed, 6f);
        level().broadcastEntityEvent(this, EVENT_THROW);
        playSound(SoundEvents.WITCH_THROW, 1f, 0.6f + random.nextFloat() * 0.3f);
        level().addFreshEntity(thrown);
    }

    @Override
    protected float getDamageAfterMagicAbsorb(DamageSource source, float amount) {
        amount = super.getDamageAfterMagicAbsorb(source, amount);
        return source.getEntity() == this ? 0f : amount;   // her own splashes don't hurt her
    }

    // --------------------------------------------------------------------------------------- sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.PIGLIN_WITCH_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.PIGLIN_WITCH_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.PIGLIN_WITCH_DEATH;
    }

    @Override
    protected void playStepSound(BlockPos pos, net.minecraft.world.level.block.state.BlockState state) {
        playSound(SoundEvents.PIGLIN_STEP, 0.2f, 0.75f);
    }

    @Override
    public int getAmbientSoundInterval() {
        return 160;
    }

    @Override
    public float getVoicePitch() {
        return 0.8f + (random.nextFloat() - random.nextFloat()) * 0.1f;
    }

    // --------------------------------------------------------------------------------------- saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putBoolean("TradesOpen", tradesOpen());
        tag.putLong("LastRestock", lastRestock);
        if (home != null) {
            tag.put("Home", NbtUtils.writeBlockPos(home));
        }
        if (offers != null && !offers.isEmpty()) {
            tag.put("Offers", MerchantOffers.CODEC.encodeStart(registryAccess().createSerializationContext(NbtOps.INSTANCE), offers)
                    .getOrThrow());
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        setTradesOpen(tag.getBoolean("TradesOpen"));
        lastRestock = tag.contains("LastRestock") ? tag.getLong("LastRestock") : -1;
        NbtUtils.readBlockPos(tag, "Home").ifPresent(this::setHome);
        if (tag.contains("Offers")) {
            MerchantOffers.CODEC.parse(registryAccess().createSerializationContext(NbtOps.INSTANCE), tag.get("Offers"))
                    .resultOrPartial(Util.prefix("Failed to load the Piglin Witch's offers: ", dev.lowpix.winterworks.Winterworks.LOG::warn))
                    .ifPresent(o -> offers = o);
        }
        if (hasCustomName()) {
            bossEvent.setName(getDisplayName());
        }
    }

    @Override
    public void setCustomName(@Nullable Component name) {
        super.setCustomName(name);
        bossEvent.setName(getDisplayName());
    }

    // --------------------------------------------------------------------------------------- goals

    /** While someone trades with her: stand still and look at them. */
    private class TradeGoal extends Goal {
        TradeGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
        }

        @Override
        public boolean canUse() {
            return tradingPlayer != null && isAlive() && !isInWater();
        }

        @Override
        public void start() {
            getNavigation().stop();
        }

        @Override
        public void tick() {
            if (tradingPlayer != null) {
                getLookControl().setLookAt(tradingPlayer, 30f, 30f);
            }
        }
    }

    /** While drinking, rummaging, refusing or cackling: stand still (she may still look about). */
    private class BusyGoal extends Goal {
        BusyGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.JUMP));
        }

        @Override
        public boolean canUse() {
            return action != Action.NONE && !isFighting();
        }

        @Override
        public void start() {
            getNavigation().stop();
        }
    }

    /** In a fight: face her foe and keep her distance (6 to 12 blocks), standing still to cast and to drink. */
    private class SpellGoal extends Goal {
        private int repath;

        SpellGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            return isFighting() && getTarget() != null && getTarget().isAlive();
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void stop() {
            getNavigation().stop();
        }

        @Override
        public void tick() {
            LivingEntity t = getTarget();
            if (t == null) {
                return;
            }
            getLookControl().setLookAt(t, 30f, 30f);
            if (castSpell() != Spell.NONE || isDrinking()) {
                getNavigation().stop();
                return;
            }
            if (--repath > 0) {
                return;
            }
            repath = 10;
            double d = distanceTo(t);
            if (d > 12 || !getSensing().hasLineOfSight(t)) {
                getNavigation().moveTo(t, 0.9);
            } else if (d < 6) {
                Vec3 away = DefaultRandomPos.getPosAway(PiglinWitch.this, 8, 4, t.position());
                if (away != null) {
                    getNavigation().moveTo(away.x, away.y, away.z, 1.1);
                }
            } else {
                getNavigation().stop();
            }
        }
    }
}
