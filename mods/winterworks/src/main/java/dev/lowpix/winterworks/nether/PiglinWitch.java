package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumSet;
import java.util.Optional;
import net.minecraft.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.stats.Stats;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MoveTowardsRestrictionGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RangedAttackGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.ThrownPotion;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Piglin Witch (docs/HEXES_UPDATE.md section 6): an old, fat, half-zombified Piglin crone and drunkard with a huge
 * patched backpack. One lives in every Hex Fortress (spawned with it, persistent, never despawns).
 * <p>
 * Neutral. She stumbles about drunk, hiccups, swigs from her flask and rummages in her backpack, pulling out random
 * things (shown in her hand) to look at. Hurt, she drinks healing and throws harmful potions, like a witch. She
 * refuses to trade (shakes her head, burps) until given an Elixir of Greed: she drinks it, cackles, and her trades
 * (the vanilla merchant screen) stay open for good.
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
    /** How long she stares at what she pulled out of the backpack before stuffing it back in. */
    private static final int LOOK_TICKS = 50;
    private static final int RESTOCK_TICKS = 12000;
    private static final EntityDataAccessor<Boolean> DATA_TRADING = SynchedEntityData.defineId(PiglinWitch.class,
            EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Boolean> DATA_OPEN = SynchedEntityData.defineId(PiglinWitch.class,
            EntityDataSerializers.BOOLEAN);
    /** The odds and ends in her backpack: she pulls one out, squints at it and puts it back. */
    private static final Item[] TRINKETS = {Items.BONE, Items.ROTTEN_FLESH, Items.GOLD_NUGGET, Items.GLASS_BOTTLE, Items.RED_MUSHROOM,
            Items.BROWN_MUSHROOM, Items.FERMENTED_SPIDER_EYE, Items.SPIDER_EYE, Items.NETHER_WART, Items.CLOCK, Items.COMPASS,
            Items.BOOK, Items.CANDLE, Items.BLAZE_POWDER, Items.MAGMA_CREAM, Items.RABBIT_FOOT, Items.COOKED_PORKCHOP,
            Items.POISONOUS_POTATO, Items.STRING, Items.SPYGLASS, Items.SKELETON_SKULL, Items.GOLDEN_CARROT};

    enum Action { NONE, DRINK_FLASK, DRINK_HEALING, DRINK_GREED, RUMMAGE, REFUSE, CACKLE }

    // client: animation states, started by entity events (see handleEntityEvent)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState drinkState = new AnimationState();
    public final AnimationState hiccupState = new AnimationState();
    public final AnimationState rummageState = new AnimationState();
    public final AnimationState refuseState = new AnimationState();
    public final AnimationState cackleState = new AnimationState();
    public final AnimationState throwState = new AnimationState();
    public final AnimationState tradeState = new AnimationState();

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

    public PiglinWitch(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
        xpReward = 10;
        setDropChance(EquipmentSlot.MAINHAND, 0f);   // flasks, potions and trinkets stay in the backpack
    }

    public static AttributeSupplier.Builder createAttributes() {
        return PathfinderMob.createMobAttributes().add(Attributes.MAX_HEALTH, 40).add(Attributes.MOVEMENT_SPEED, 0.2)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.3).add(Attributes.FOLLOW_RANGE, 20);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DATA_TRADING, false);
        builder.define(DATA_OPEN, false);
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new TradeGoal());
        goalSelector.addGoal(2, new BusyGoal());
        goalSelector.addGoal(3, new RangedAttackGoal(this, 0.9, 50, 10f));
        goalSelector.addGoal(5, new MoveTowardsRestrictionGoal(this, 0.7));
        goalSelector.addGoal(6, new WaterAvoidingRandomStrollGoal(this, 0.6));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        targetSelector.addGoal(1, new HurtByTargetGoal(this));
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

    /** Is she in the middle of a drink (flask, healing potion or the Elixir of Greed)? */
    public boolean isDrinking() {
        return action == Action.DRINK_FLASK || action == Action.DRINK_HEALING || action == Action.DRINK_GREED;
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

    // --------------------------------------------------------------------------------------- ticking

    @Override
    public void aiStep() {
        if (!level().isClientSide && isAlive()) {
            tickAction();
            if (getTarget() != null && (!getTarget().isAlive() || tickCount - getLastHurtByMobTimestamp() > 600)) {
                setTarget(null);   // neutral: she forgets after half a minute
            }
            if (tradingPlayer != null && (!tradingPlayer.isAlive() || tradingPlayer.distanceToSqr(this) > 64
                    || tradingPlayer.level() != level())) {
                setTradingPlayer(null);
            }
            boolean calm = !isTrading() && getTarget() == null;
            if (action == Action.NONE && calm) {
                idleHabits();
            }
            if (action == Action.NONE && getHealth() < getMaxHealth() * 0.6f && (getTarget() != null || getLastHurtByMob() != null)
                    && random.nextFloat() < 0.05f) {
                startDrink(Action.DRINK_HEALING, PotionContents.createItemStack(Items.POTION, Potions.HEALING));
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
        if (random.nextInt(4) == 0) {
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
                PotionContents contents = drink.get(net.minecraft.core.component.DataComponents.POTION_CONTENTS);
                if (contents != null) {
                    contents.forEachEffect(this::addEffect);
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
        if (getTarget() == player) {
            refuse(player);   // not while she's throwing potions at you
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

    // --------------------------------------------------------------------------------------- fighting

    @Override
    public void performRangedAttack(LivingEntity target, float power) {
        if (isDrinking()) {
            return;
        }
        Vec3 v = target.getDeltaMovement();
        double dx = target.getX() + v.x - getX(), dy = target.getEyeY() - 1.1 - getY(), dz = target.getZ() + v.z - getZ();
        double d = Math.sqrt(dx * dx + dz * dz);
        Holder<Potion> potion = Potions.HARMING;
        if (d >= 8.0 && !target.hasEffect(MobEffects.MOVEMENT_SLOWDOWN)) {
            potion = Potions.SLOWNESS;
        } else if (target.getHealth() >= 8.0f && !target.hasEffect(MobEffects.POISON)) {
            potion = Potions.POISON;
        } else if (d <= 3.0 && !target.hasEffect(MobEffects.WEAKNESS) && random.nextFloat() < 0.25f) {
            potion = Potions.WEAKNESS;
        }
        ThrownPotion thrown = new ThrownPotion(level(), this);
        thrown.setItem(PotionContents.createItemStack(Items.SPLASH_POTION, potion));
        thrown.setXRot(thrown.getXRot() + 20f);
        thrown.shoot(dx, dy + d * 0.2, dz, 0.75f, 8f);
        level().broadcastEntityEvent(this, EVENT_THROW);
        playSound(SoundEvents.WITCH_THROW, 1f, 0.6f + random.nextFloat() * 0.3f);
        level().addFreshEntity(thrown);
        if (random.nextInt(4) == 0 && action == Action.NONE) {
            cackle();
        }
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
            return action != Action.NONE && getTarget() == null;
        }

        @Override
        public void start() {
            getNavigation().stop();
        }
    }
}
