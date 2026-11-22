package dev.lowpix.winterworks.nether;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.Brain;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.behavior.BehaviorUtils;
import net.minecraft.world.entity.ai.behavior.EntityTracker;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.memory.WalkTarget;
import net.minecraft.world.entity.ai.sensing.Sensor;
import net.minecraft.world.entity.boss.wither.WitherBoss;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.WitherSkeleton;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinBrute;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Piglins, brutes and the elixirs (docs/HEXES_UPDATE.md section 1; docs/FIXES_0_4.md "Brutes love the elixirs too",
 * "Turning to gold sooner"), and piglins hunting Golden Piglins.
 * <ul>
 * <li>An Elixir of Greed dropped (or held out by a player) near Piglins or Piglin Brutes drives them into a frenzy:
 * they fight each other to the death, and the survivor walks over and drinks it (the bottle shatters). Fed to one, it
 * drinks it.</li>
 * <li>Cursed Elixir is in #minecraft:piglin_loved, so Piglins walk to it and admire it like gold; when they finish
 * admiring (mixin.PiglinAiMixin) they drink it. Brutes (which have no admiring of their own) go for it too: the nearest
 * one walks over, holds it up in its off hand and stares at it for a few seconds ({@link #BRUTE_ADMIRE_TICKS}), then
 * drinks. Used on either, it drinks at once.</li>
 * <li>Drinking Cursed Elixir starts the gilding at once ({@link #makeGolden}): the `golden` effect (immune to
 * zombification) and a golden shimmer that spreads over {@link #GILD_TICKS} (synced as {@link NetherFeature#GILDING}),
 * while it stiffens and slows; then it becomes a Golden Piglin (a brute: a golden brute, GoldenPiglin#isBrute).</li>
 * <li>Adult Piglins attack any Golden Piglin they see, for its gold (unless they have a better reason to fight, or it
 * is one of their own witch's experiments).</li>
 * </ul>
 */
public final class PiglinGreed {
    public static final double GREED_RADIUS = 12.0;
    /** How long the gilding takes: 20 s. */
    public static final int GILD_TICKS = 400;
    /** How long a brute stares at a Cursed Elixir before it drinks it. */
    public static final int BRUTE_ADMIRE_TICKS = 100;
    /** A gilding that doesn't progress (the Hex Fortress's caged, half-turned experiments). */
    public static final String GILD_FROZEN_TAG = "winterworks.gild_frozen";
    private static final double BRUTE_WANT_RADIUS = 10.0;
    private static final int SCAN_EVERY = 10;
    private static final long ANGER_TICKS = 200L;
    private static final ResourceLocation GILD_SLOW_ID = Winterworks.id("gilding_slow");
    /** Dropped Elixirs of Greed and Cursed Elixirs in loaded worlds. */
    private static final Set<ItemEntity> GREED_ITEMS = Collections.newSetFromMap(new WeakHashMap<>());
    private static final Set<ItemEntity> CURSED_ITEMS = Collections.newSetFromMap(new WeakHashMap<>());
    /** Piglins and brutes in the middle of their gilding. */
    private static final Set<AbstractPiglin> GILDING = Collections.newSetFromMap(new WeakHashMap<>());
    /** Brutes admiring a Cursed Elixir in their off hand: until when (game time). */
    private static final Map<PiglinBrute, Long> BRUTES_ADMIRING = new WeakHashMap<>();
    /** Source (item or player) uuid -> the piglins fighting over it. */
    private static final Map<UUID, Frenzy> FRENZIES = new HashMap<>();
    private static final List<Shatter> SHATTERS = new ArrayList<>();

    private static final class Frenzy {
        final Set<UUID> fighters = new LinkedHashSet<>();
        long lastSeen;
        boolean started;
    }

    private record Shatter(ResourceKey<Level> dimension, Vec3 at, long when) {}

    private PiglinGreed() {}

    static void init() {
        ServerEntityEvents.ENTITY_LOAD.register((entity, level) -> {
            if (entity instanceof ItemEntity item) {
                if (item.getItem().is(WWItems.ELIXIR_OF_GREED)) {
                    GREED_ITEMS.add(item);
                } else if (item.getItem().is(WWItems.CURSED_ELIXIR)) {
                    CURSED_ITEMS.add(item);
                }
            } else if (entity instanceof AbstractPiglin p && entity.hasAttached(NetherFeature.GILDING)) {
                GILDING.add(p);
            }
        });
        ServerTickEvents.END_WORLD_TICK.register(PiglinGreed::tick);
        UseEntityCallback.EVENT.register(PiglinGreed::use);
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            GREED_ITEMS.clear();
            CURSED_ITEMS.clear();
            GILDING.clear();
            BRUTES_ADMIRING.clear();
            FRENZIES.clear();
            SHATTERS.clear();
        });
    }

    // --------------------------------------------------------------------------------------- golden

    /** Has this piglin drunk Cursed Elixir? Works on both sides (the client reads the synced attachment). */
    public static boolean isGolden(Entity e) {
        return Boolean.TRUE.equals(e.getAttached(NetherFeature.GOLDEN));
    }

    /** How far its gilding has got, 0..1 (1 for a golden piglin from before the gilding, or one that isn't gilding: 0). */
    public static float gilding(Entity e) {
        Integer g = e.getAttached(NetherFeature.GILDING);
        if (g == null) {
            return isGolden(e) ? 1f : 0f;
        }
        return Math.min(1f, g / (float) GILD_TICKS);
    }

    /**
     * Drinks Cursed Elixir: the `golden` effect (immune to zombification) and the gilding starts, spreading over 20 s;
     * then it becomes a Golden Piglin. A Golden Piglin, or one already gilding, just gets the shimmer burst.
     */
    public static void makeGolden(AbstractPiglin piglin) {
        piglin.addEffect(new MobEffectInstance(WWEffects.GOLDEN, MobEffectInstance.INFINITE_DURATION, 0, true, false, true));
        piglin.setImmuneToZombification(true);
        piglin.setAttached(NetherFeature.GOLDEN, true);
        if (!(piglin instanceof GoldenPiglin) && !piglin.hasAttached(NetherFeature.GILDING)) {
            piglin.setAttached(NetherFeature.GILDING, 0);
            GILDING.add(piglin);
        }
        if (piglin.level() instanceof ServerLevel sl) {
            sl.playSound(null, piglin, WWSounds.ELIXIR_DRINK, SoundSource.NEUTRAL, 1f, 0.9f);
            sl.playSound(null, piglin, SoundEvents.PIGLIN_CELEBRATE, SoundSource.HOSTILE, 1f, 1.1f);
            sl.sendParticles(WWParticles.GOLD_GLINT, piglin.getX(), piglin.getY(1.0), piglin.getZ(), 30, 0.4, 0.7, 0.4, 0.05);
            SHATTERS.add(new Shatter(sl.dimension(), piglin.position().add(0, 1.2, 0), sl.getGameTime() + 14));
        }
    }

    /** Sets a gilding at a given stage (the Hex Fortress's caged experiments; tests). `frozen`: it stays there. */
    public static void setGilding(AbstractPiglin piglin, int ticks, boolean frozen) {
        piglin.addEffect(new MobEffectInstance(WWEffects.GOLDEN, MobEffectInstance.INFINITE_DURATION, 0, true, false, true));
        piglin.setImmuneToZombification(true);
        piglin.setAttached(NetherFeature.GOLDEN, true);
        piglin.setAttached(NetherFeature.GILDING, Math.max(0, Math.min(GILD_TICKS - 5, ticks / 5 * 5)));
        if (frozen) {
            piglin.addTag(GILD_FROZEN_TAG);
        } else {
            piglin.removeTag(GILD_FROZEN_TAG);
        }
        GILDING.add(piglin);
    }

    /** One tick of a gilding: the shimmer spreads, it stiffens; at the end it becomes a Golden Piglin. */
    private static void tickGilding(ServerLevel level, AbstractPiglin p) {
        Integer g = p.getAttached(NetherFeature.GILDING);
        if (g == null) {
            GILDING.remove(p);
            return;
        }
        if (p.getTags().contains(GILD_FROZEN_TAG) || level.getGameTime() % 5 != 0) {
            return;
        }
        // a quarter of a second at a time (each step is synced): the shimmer spreads smoothly enough
        int next = Math.min(GILD_TICKS, g + 5);
        float frac = next / (float) GILD_TICKS;
        p.setAttached(NetherFeature.GILDING, next);
        if (level.random.nextFloat() < 0.3f + frac) {
            level.sendParticles(WWParticles.GOLD_GLINT, p.getX(), p.getY(0.2 + 0.8 * level.random.nextDouble()), p.getZ(),
                    1 + (int) (frac * 3), 0.3, 0.2, 0.3, 0.01);
        }
        if (next % 20 == 0) {
            AttributeInstance speed = p.getAttribute(Attributes.MOVEMENT_SPEED);
            if (speed != null) {   // it stiffens as the gold spreads
                speed.removeModifier(GILD_SLOW_ID);
                speed.addTransientModifier(new AttributeModifier(GILD_SLOW_ID, -0.6 * frac, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
            }
            if (level.random.nextInt(3) == 0) {
                level.playSound(null, p, WWSounds.GOLDEN_PIGLIN_CREAK, SoundSource.HOSTILE, 0.4f + frac * 0.5f, 1.2f - frac * 0.5f);
            }
        }
        if (next >= GILD_TICKS) {
            GILDING.remove(p);
            finishGilding(level, p);
        }
    }

    /** The gold has spread all over: it becomes a Golden Piglin (a brute: a golden brute with its axe). */
    @Nullable
    public static GoldenPiglin finishGilding(ServerLevel level, AbstractPiglin p) {
        p.removeAttached(NetherFeature.GILDING);
        Vec3 at = p.position();
        GoldenPiglin golden = p instanceof PiglinBrute brute ? GoldenPiglin.fromBrute(brute)
                : p instanceof Piglin piglin ? GoldenPiglin.fromPiglin(piglin) : null;
        if (golden == null) {
            return null;
        }
        golden.setPersistenceRequired();
        level.playSound(null, at.x, at.y, at.z, WWSounds.GOLDEN_PIGLIN_GROAN, SoundSource.HOSTILE, 1.2f, 0.6f);
        level.playSound(null, at.x, at.y, at.z, SoundEvents.ARMOR_EQUIP_GOLD.value(), SoundSource.HOSTILE, 1f, 0.6f);
        level.sendParticles(WWParticles.GOLD_GLINT, at.x, at.y + 1.0, at.z, 40, 0.4, 0.8, 0.4, 0.06);
        return golden;
    }

    /** A player uses Cursed Elixir on a Piglin or a brute: it drinks it straight away. */
    public static void feedCursed(Player player, InteractionHand hand, AbstractPiglin piglin) {
        player.getItemInHand(hand).consume(1, player);
        piglin.swing(InteractionHand.OFF_HAND);
        makeGolden(piglin);
    }

    /** A player gives a Piglin or a brute an Elixir of Greed: it drinks it (no fight if it's handed over). */
    public static void feedGreed(Player player, InteractionHand hand, AbstractPiglin piglin) {
        ItemStack dose = player.getItemInHand(hand).consumeAndReturn(1, player);
        drinkGreed((ServerLevel) piglin.level(), piglin, dose);
    }

    private static InteractionResult use(Player player, Level level, InteractionHand hand, Entity entity, @Nullable EntityHitResult hit) {
        if (player.isSpectator() || !(entity instanceof AbstractPiglin piglin) || entity instanceof GoldenPiglin || !piglin.isAlive()
                || !(entity instanceof Piglin || entity instanceof PiglinBrute)) {
            return InteractionResult.PASS;
        }
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(WWItems.CURSED_ELIXIR) && !piglin.hasAttached(NetherFeature.GILDING)) {
            if (!level.isClientSide) {
                feedCursed(player, hand, piglin);
            }
            return InteractionResult.sidedSuccess(level.isClientSide);
        }
        if (stack.is(WWItems.ELIXIR_OF_GREED) && piglin.isAdult()) {
            if (!level.isClientSide) {
                feedGreed(player, hand, piglin);
            }
            return InteractionResult.sidedSuccess(level.isClientSide);
        }
        return InteractionResult.PASS;
    }

    /** Called when a piglin stops admiring the item in its off hand; true if it was Cursed Elixir and it drank it. */
    public static boolean drinkAdmired(Piglin piglin) {
        if (!piglin.getOffhandItem().is(WWItems.CURSED_ELIXIR)) {
            return false;
        }
        piglin.setItemInHand(InteractionHand.OFF_HAND, ItemStack.EMPTY);
        piglin.swing(InteractionHand.OFF_HAND);
        makeGolden(piglin);
        return true;
    }

    // --------------------------------------------------------------------------------------- brutes and Cursed Elixir

    private static boolean bruteWants(PiglinBrute b) {
        return b.isAlive() && !b.isNoAi() && b.getOffhandItem().isEmpty() && !b.hasAttached(NetherFeature.GILDING)
                && !b.getBrain().hasMemoryValue(MemoryModuleType.ATTACK_TARGET);
    }

    /** The nearest brute that wants a dropped Cursed Elixir goes for it; close enough, it takes it and admires it. */
    private static void brutesWant(ServerLevel level, ItemEntity item) {
        AABB box = item.getBoundingBox().inflate(BRUTE_WANT_RADIUS, 4, BRUTE_WANT_RADIUS);
        PiglinBrute best = null;
        double bestD = Double.MAX_VALUE;
        for (PiglinBrute b : level.getEntitiesOfClass(PiglinBrute.class, box, PiglinGreed::bruteWants)) {
            double d = b.distanceToSqr(item);
            if (d < bestD && (d < 4 || b.getSensing().hasLineOfSight(item))) {
                best = b;
                bestD = d;
            }
        }
        if (best == null) {
            return;
        }
        if (bestD < 1.8 * 1.8) {
            ItemStack one = item.getItem().split(1);
            if (item.getItem().isEmpty()) {
                item.discard();
            }
            best.setItemInHand(InteractionHand.OFF_HAND, one);
            best.setGuaranteedDrop(net.minecraft.world.entity.EquipmentSlot.OFFHAND);
            best.getBrain().eraseMemory(MemoryModuleType.WALK_TARGET);
            best.getNavigation().stop();
            best.playSound(SoundEvents.PIGLIN_ADMIRING_ITEM, 1f, 0.7f);
            BRUTES_ADMIRING.put(best, level.getGameTime() + BRUTE_ADMIRE_TICKS);
        } else {
            best.getBrain().setMemory(MemoryModuleType.WALK_TARGET, new WalkTarget(item, 0.8f, 0));
            best.getBrain().setMemory(MemoryModuleType.LOOK_TARGET, new EntityTracker(item, true));
        }
    }

    /** Brutes staring at the Cursed Elixir in their off hand; done staring, they drink it. */
    private static void tickBrutesAdmiring(ServerLevel level, long now) {
        if (BRUTES_ADMIRING.isEmpty()) {
            return;
        }
        for (Map.Entry<PiglinBrute, Long> e : new ArrayList<>(BRUTES_ADMIRING.entrySet())) {
            PiglinBrute b = e.getKey();
            if (b.level() != level) {
                continue;
            }
            if (!b.isAlive() || !b.getOffhandItem().is(WWItems.CURSED_ELIXIR)) {
                BRUTES_ADMIRING.remove(b);
                continue;
            }
            b.getNavigation().stop();
            if (now >= e.getValue()) {
                BRUTES_ADMIRING.remove(b);
                b.setItemInHand(InteractionHand.OFF_HAND, ItemStack.EMPTY);
                b.swing(InteractionHand.OFF_HAND);
                makeGolden(b);
            } else if (now % 20 == 0) {
                level.sendParticles(WWParticles.GOLD_GLINT, b.getX(), b.getY(0.6), b.getZ(), 2, 0.3, 0.2, 0.3, 0.01);
            }
        }
    }

    /** Brutes that were holding a Cursed Elixir when the world was saved pick up the staring where they left off. */
    private static void resumeBrutes(ServerLevel level, long now) {
        for (Player pl : level.players()) {
            for (PiglinBrute b : level.getEntitiesOfClass(PiglinBrute.class, pl.getBoundingBox().inflate(48),
                    b -> b.getOffhandItem().is(WWItems.CURSED_ELIXIR) && !BRUTES_ADMIRING.containsKey(b))) {
                BRUTES_ADMIRING.put(b, now + BRUTE_ADMIRE_TICKS / 2);
            }
        }
    }

    // --------------------------------------------------------------------------------------- golden piglin hunting

    /**
     * The attack target hook (mixin into PiglinAi.findNearestValidAttackTarget): Golden Piglins only hit back at what
     * they're angry at; other adult Piglins go for a visible Golden Piglin unless they're angry at something or see a
     * nemesis (a player without gold is less tempting than a walking pile of gold). A witch's crew leaves her
     * experiments alone.
     */
    public static Optional<? extends LivingEntity> attackTarget(Piglin piglin, Optional<? extends LivingEntity> vanilla) {
        Brain<Piglin> brain = piglin.getBrain();
        Optional<LivingEntity> angry = BehaviorUtils.getLivingEntityFromUUIDMemory(piglin, MemoryModuleType.ANGRY_AT);
        if (piglin instanceof GoldenPiglin) {
            return vanilla.isPresent() && angry.isPresent() && angry.get() == vanilla.get() ? vanilla : Optional.empty();
        }
        if (vanilla.isPresent() && (angry.isPresent() && angry.get() == vanilla.get()
                || vanilla.get() instanceof WitherSkeleton || vanilla.get() instanceof WitherBoss)) {
            return vanilla;
        }
        if (piglin.isBaby() || nearZombified(piglin)) {
            return vanilla;
        }
        Optional<LivingEntity> golden = brain.getMemory(MemoryModuleType.NEAREST_VISIBLE_LIVING_ENTITIES).flatMap(v -> v.findClosest(
                e -> e instanceof GoldenPiglin && e.isAlive() && Sensor.isEntityAttackable(piglin, e) && !WitchCrew.sameCrew(piglin, e)));
        return golden.isPresent() ? golden : vanilla;
    }

    private static boolean nearZombified(Piglin piglin) {
        return piglin.getBrain().getMemory(MemoryModuleType.NEAREST_VISIBLE_ZOMBIFIED).map(z -> piglin.closerThan(z, 6.0)).orElse(false);
    }

    // --------------------------------------------------------------------------------------- the greed frenzy

    private static boolean canGetGreedy(AbstractPiglin p) {
        return p.isAlive() && p.isAdult() && !(p instanceof GoldenPiglin) && !p.isNoAi() && (p instanceof Piglin || p instanceof PiglinBrute);
    }

    /** Is this piglin (or brute) in a greed frenzy (fighting over an Elixir of Greed)? */
    public static boolean isGreedy(AbstractPiglin p) {
        UUID id = p.getUUID();
        for (Frenzy f : FRENZIES.values()) {
            if (f.fighters.contains(id)) {
                return true;
            }
        }
        return false;
    }

    private static void tick(ServerLevel level) {
        long now = level.getGameTime();
        if (!SHATTERS.isEmpty()) {
            for (Iterator<Shatter> it = SHATTERS.iterator(); it.hasNext(); ) {
                Shatter s = it.next();
                if (s.dimension() == level.dimension() && now >= s.when()) {
                    it.remove();
                    level.playSound(null, s.at().x, s.at().y, s.at().z, WWSounds.ELIXIR_OF_GREED_SHATTER, SoundSource.NEUTRAL, 0.9f, 1f);
                    level.sendParticles(new ItemParticleOption(ParticleTypes.ITEM, new ItemStack(Items.GLASS_BOTTLE)), s.at().x, s.at().y,
                            s.at().z, 10, 0.15, 0.15, 0.15, 0.08);
                } else if (now > s.when() + 200) {
                    it.remove();
                }
            }
        }
        if (!GILDING.isEmpty()) {
            for (AbstractPiglin p : new ArrayList<>(GILDING)) {
                if (p.isRemoved() || !p.isAlive()) {
                    GILDING.remove(p);
                } else if (p.level() == level) {
                    tickGilding(level, p);
                }
            }
        }
        tickBrutesAdmiring(level, now);
        if (now % SCAN_EVERY != 0) {
            return;
        }
        if (now % 200 == 0) {
            resumeBrutes(level, now);
        }
        if (!GREED_ITEMS.isEmpty()) {
            for (ItemEntity item : new ArrayList<>(GREED_ITEMS)) {
                if (item.isRemoved() || !item.getItem().is(WWItems.ELIXIR_OF_GREED)) {
                    GREED_ITEMS.remove(item);
                } else if (item.level() == level) {
                    frenzy(level, item, item.position(), now);
                }
            }
        }
        if (!CURSED_ITEMS.isEmpty()) {
            for (ItemEntity item : new ArrayList<>(CURSED_ITEMS)) {
                if (item.isRemoved() || !item.getItem().is(WWItems.CURSED_ELIXIR)) {
                    CURSED_ITEMS.remove(item);
                } else if (item.level() == level && item.onGround()) {
                    brutesWant(level, item);
                }
            }
        }
        for (Player p : level.players()) {
            if (!p.isSpectator() && p.isAlive() && p.isHolding(WWItems.ELIXIR_OF_GREED)) {
                frenzy(level, p, p.position(), now);
            }
        }
        FRENZIES.values().removeIf(f -> now - f.lastSeen > 4L * SCAN_EVERY);
    }

    /** One scan of the piglins round an Elixir of Greed: pair them off to fight; the last one standing drinks it. */
    private static void frenzy(ServerLevel level, Entity source, Vec3 at, long now) {
        AABB box = new AABB(at, at).inflate(GREED_RADIUS, 6, GREED_RADIUS);
        List<AbstractPiglin> near = level.getEntitiesOfClass(AbstractPiglin.class, box, PiglinGreed::canGetGreedy);
        Frenzy f = FRENZIES.get(source.getUUID());
        if (f == null) {
            if (near.isEmpty()) {
                return;
            }
            f = new Frenzy();
            FRENZIES.put(source.getUUID(), f);
        }
        f.lastSeen = now;
        for (AbstractPiglin p : near) {
            f.fighters.add(p.getUUID());
        }
        List<AbstractPiglin> alive = new ArrayList<>();
        for (Iterator<UUID> it = f.fighters.iterator(); it.hasNext(); ) {
            Entity e = level.getEntity(it.next());
            if (e instanceof AbstractPiglin p && canGetGreedy(p) && p.distanceToSqr(at) < 4 * GREED_RADIUS * GREED_RADIUS) {
                alive.add(p);
            } else {
                it.remove();   // fallen (or wandered off, or zombified)
            }
        }
        if (alive.size() >= 2) {
            for (AbstractPiglin a : alive) {
                LivingEntity current = BehaviorUtils.getLivingEntityFromUUIDMemory(a, MemoryModuleType.ANGRY_AT).orElse(null);
                AbstractPiglin foe = current instanceof AbstractPiglin cp && alive.contains(cp) && cp != a ? cp : nearestOther(a, alive);
                setAngry(a, foe);
            }
            if (!f.started) {
                f.started = true;
                for (AbstractPiglin a : alive) {
                    a.makeSound(a instanceof PiglinBrute ? SoundEvents.PIGLIN_BRUTE_ANGRY : SoundEvents.PIGLIN_ANGRY);
                }
            }
        } else if (alive.size() == 1) {
            AbstractPiglin winner = alive.get(0);
            calm(winner);
            if (source instanceof ItemEntity item) {
                if (winner.distanceToSqr(item) < 2.0 * 2.0) {
                    ItemStack dose = item.getItem().split(1);
                    if (item.getItem().isEmpty()) {
                        item.discard();
                    }
                    FRENZIES.remove(source.getUUID());
                    drinkGreed(level, winner, dose);
                } else {
                    winner.getBrain().setMemory(MemoryModuleType.WALK_TARGET, new WalkTarget(item, 1.0f, 0));
                    winner.getBrain().setMemory(MemoryModuleType.LOOK_TARGET, new EntityTracker(item, true));
                }
            } else if (winner.distanceToSqr(source) > 3.0 * 3.0) {
                // held out by a player: the winner comes for it (use it on the piglin to hand it over)
                winner.getBrain().setMemory(MemoryModuleType.WALK_TARGET, new WalkTarget(source, 0.8f, 2));
                winner.getBrain().setMemory(MemoryModuleType.LOOK_TARGET, new EntityTracker(source, true));
            }
        }
    }

    @Nullable
    private static AbstractPiglin nearestOther(AbstractPiglin a, List<AbstractPiglin> alive) {
        AbstractPiglin best = null;
        double bestD = Double.MAX_VALUE;
        for (AbstractPiglin b : alive) {
            double d = a.distanceToSqr(b);
            if (b != a && d < bestD) {
                best = b;
                bestD = d;
            }
        }
        return best;
    }

    private static void setAngry(AbstractPiglin a, @Nullable AbstractPiglin foe) {
        if (foe == null) {
            return;
        }
        Brain<?> brain = a.getBrain();
        brain.eraseMemory(MemoryModuleType.CANT_REACH_WALK_TARGET_SINCE);
        brain.eraseMemory(MemoryModuleType.ADMIRING_ITEM);
        brain.eraseMemory(MemoryModuleType.CELEBRATE_LOCATION);
        brain.eraseMemory(MemoryModuleType.DANCING);
        brain.eraseMemory(MemoryModuleType.AVOID_TARGET);
        brain.setMemoryWithExpiry(MemoryModuleType.ANGRY_AT, foe.getUUID(), ANGER_TICKS);
        brain.setMemory(MemoryModuleType.ATTACK_TARGET, foe);
    }

    /** The last one standing stops fighting (its foes are dead). */
    private static void calm(AbstractPiglin p) {
        Brain<?> brain = p.getBrain();
        if (BehaviorUtils.getLivingEntityFromUUIDMemory(p, MemoryModuleType.ANGRY_AT).orElse(null) instanceof AbstractPiglin) {
            brain.eraseMemory(MemoryModuleType.ANGRY_AT);
        }
        if (brain.getMemory(MemoryModuleType.ATTACK_TARGET).orElse(null) instanceof AbstractPiglin) {
            brain.eraseMemory(MemoryModuleType.ATTACK_TARGET);
        }
    }

    /** The winner drinks the Elixir of Greed: healed, strong for a minute, it dances; the empty bottle shatters. */
    public static void drinkGreed(ServerLevel level, AbstractPiglin piglin, ItemStack dose) {
        calm(piglin);
        piglin.swing(InteractionHand.OFF_HAND);
        level.playSound(null, piglin, WWSounds.ELIXIR_DRINK, SoundSource.NEUTRAL, 1f, 0.8f);
        piglin.heal(piglin.getMaxHealth());
        piglin.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, 1200, 0));
        piglin.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 300, 1));
        Brain<?> brain = piglin.getBrain();
        brain.setMemoryWithExpiry(MemoryModuleType.CELEBRATE_LOCATION, piglin.blockPosition(), 300L);
        brain.setMemoryWithExpiry(MemoryModuleType.DANCING, true, 300L);
        level.sendParticles(WWParticles.GOLD_GLINT, piglin.getX(), piglin.getY(1.0), piglin.getZ(), 24, 0.4, 0.6, 0.4, 0.05);
        SHATTERS.add(new Shatter(level.dimension(), piglin.position().add(0, 1.0, 0), level.getGameTime() + 16));
    }
}
