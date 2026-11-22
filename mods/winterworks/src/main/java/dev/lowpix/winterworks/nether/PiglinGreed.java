package dev.lowpix.winterworks.nether;

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
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Piglins and the elixirs (docs/HEXES_UPDATE.md section 1, the Piglin side), and piglins hunting Golden Piglins.
 * <ul>
 * <li>An Elixir of Greed dropped (or held out by a player) near Piglins drives them into a frenzy: they fight each
 * other to the death, and the survivor walks over and drinks it (the bottle shatters). Fed to a Piglin, it drinks it.</li>
 * <li>Cursed Elixir is in #minecraft:piglin_loved, so Piglins walk to it and admire it like gold; when they finish
 * admiring (mixin.PiglinAiMixin) they drink it, and a Piglin it is used on drinks it at once. Either way it gets the
 * `golden` effect for good: immune to zombification, gold glints and a golden shimmer (client.nether).</li>
 * <li>Adult Piglins attack any Golden Piglin they see, for its gold (unless they have a better reason to fight).</li>
 * </ul>
 */
public final class PiglinGreed {
    public static final double GREED_RADIUS = 12.0;
    private static final int SCAN_EVERY = 10;
    private static final long ANGER_TICKS = 200L;
    /** Dropped Elixirs of Greed in loaded worlds. */
    private static final Set<ItemEntity> GREED_ITEMS = Collections.newSetFromMap(new WeakHashMap<>());
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
            if (entity instanceof ItemEntity item && item.getItem().is(WWItems.ELIXIR_OF_GREED)) {
                GREED_ITEMS.add(item);
            }
        });
        ServerTickEvents.END_WORLD_TICK.register(PiglinGreed::tick);
        UseEntityCallback.EVENT.register(PiglinGreed::use);
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            GREED_ITEMS.clear();
            FRENZIES.clear();
            SHATTERS.clear();
        });
    }

    // --------------------------------------------------------------------------------------- golden

    /** Has this piglin drunk Cursed Elixir? Works on both sides (the client reads the synced attachment). */
    public static boolean isGolden(Entity e) {
        return Boolean.TRUE.equals(e.getAttached(NetherFeature.GOLDEN));
    }

    /** Drinks Cursed Elixir: the `golden` effect for good, immune to zombification, a golden shimmer. */
    public static void makeGolden(AbstractPiglin piglin) {
        piglin.addEffect(new MobEffectInstance(WWEffects.GOLDEN, MobEffectInstance.INFINITE_DURATION, 0, true, false, true));
        piglin.setImmuneToZombification(true);
        piglin.setAttached(NetherFeature.GOLDEN, true);
        if (piglin.level() instanceof ServerLevel sl) {
            sl.playSound(null, piglin, WWSounds.ELIXIR_DRINK, SoundSource.NEUTRAL, 1f, 0.9f);
            sl.playSound(null, piglin, SoundEvents.PIGLIN_CELEBRATE, SoundSource.HOSTILE, 1f, 1.1f);
            sl.sendParticles(WWParticles.GOLD_GLINT, piglin.getX(), piglin.getY(1.0), piglin.getZ(), 30, 0.4, 0.7, 0.4, 0.05);
            SHATTERS.add(new Shatter(sl.dimension(), piglin.position().add(0, 1.2, 0), sl.getGameTime() + 14));
        }
    }

    /** A player uses Cursed Elixir on a Piglin: it drinks it straight away. */
    public static void feedCursed(Player player, InteractionHand hand, Piglin piglin) {
        player.getItemInHand(hand).consume(1, player);
        piglin.swing(InteractionHand.OFF_HAND);
        makeGolden(piglin);
    }

    /** A player gives a Piglin an Elixir of Greed: it drinks it (no fight if it's handed over). */
    public static void feedGreed(Player player, InteractionHand hand, Piglin piglin) {
        ItemStack dose = player.getItemInHand(hand).consumeAndReturn(1, player);
        drinkGreed((ServerLevel) piglin.level(), piglin, dose);
    }

    private static InteractionResult use(Player player, Level level, InteractionHand hand, Entity entity, @Nullable EntityHitResult hit) {
        if (player.isSpectator() || !(entity instanceof Piglin piglin) || entity instanceof GoldenPiglin || !piglin.isAlive()) {
            return InteractionResult.PASS;
        }
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(WWItems.CURSED_ELIXIR) && !isGolden(piglin)) {
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

    // --------------------------------------------------------------------------------------- golden piglin hunting

    /**
     * The attack target hook (mixin into PiglinAi.findNearestValidAttackTarget): Golden Piglins only hit back at what
     * they're angry at; other adult Piglins go for a visible Golden Piglin unless they're angry at something or see a
     * nemesis (a player without gold is less tempting than a walking pile of gold).
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
                e -> e instanceof GoldenPiglin && e.isAlive() && Sensor.isEntityAttackable(piglin, e)));
        return golden.isPresent() ? golden : vanilla;
    }

    private static boolean nearZombified(Piglin piglin) {
        return piglin.getBrain().getMemory(MemoryModuleType.NEAREST_VISIBLE_ZOMBIFIED).map(z -> piglin.closerThan(z, 6.0)).orElse(false);
    }

    // --------------------------------------------------------------------------------------- the greed frenzy

    private static boolean canGetGreedy(Piglin p) {
        return p.isAlive() && p.isAdult() && !(p instanceof GoldenPiglin) && !p.isNoAi();
    }

    /** Is this piglin in a greed frenzy (fighting over an Elixir of Greed)? */
    public static boolean isGreedy(Piglin p) {
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
        if (now % SCAN_EVERY != 0) {
            return;
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
        List<Piglin> near = level.getEntitiesOfClass(Piglin.class, box, PiglinGreed::canGetGreedy);
        Frenzy f = FRENZIES.get(source.getUUID());
        if (f == null) {
            if (near.isEmpty()) {
                return;
            }
            f = new Frenzy();
            FRENZIES.put(source.getUUID(), f);
        }
        f.lastSeen = now;
        for (Piglin p : near) {
            f.fighters.add(p.getUUID());
        }
        List<Piglin> alive = new ArrayList<>();
        for (Iterator<UUID> it = f.fighters.iterator(); it.hasNext(); ) {
            Entity e = level.getEntity(it.next());
            if (e instanceof Piglin p && canGetGreedy(p) && p.distanceToSqr(at) < 4 * GREED_RADIUS * GREED_RADIUS) {
                alive.add(p);
            } else {
                it.remove();   // fallen (or wandered off, or zombified)
            }
        }
        if (alive.size() >= 2) {
            for (Piglin a : alive) {
                LivingEntity current = BehaviorUtils.getLivingEntityFromUUIDMemory(a, MemoryModuleType.ANGRY_AT).orElse(null);
                Piglin foe = current instanceof Piglin cp && alive.contains(cp) && cp != a ? cp : nearestOther(a, alive);
                setAngry(a, foe);
            }
            if (!f.started) {
                f.started = true;
                for (Piglin a : alive) {
                    a.makeSound(SoundEvents.PIGLIN_ANGRY);
                }
            }
        } else if (alive.size() == 1) {
            Piglin winner = alive.get(0);
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
    private static Piglin nearestOther(Piglin a, List<Piglin> alive) {
        Piglin best = null;
        double bestD = Double.MAX_VALUE;
        for (Piglin b : alive) {
            double d = a.distanceToSqr(b);
            if (b != a && d < bestD) {
                best = b;
                bestD = d;
            }
        }
        return best;
    }

    private static void setAngry(Piglin a, @Nullable Piglin foe) {
        if (foe == null) {
            return;
        }
        Brain<Piglin> brain = a.getBrain();
        brain.eraseMemory(MemoryModuleType.CANT_REACH_WALK_TARGET_SINCE);
        brain.eraseMemory(MemoryModuleType.ADMIRING_ITEM);
        brain.eraseMemory(MemoryModuleType.CELEBRATE_LOCATION);
        brain.eraseMemory(MemoryModuleType.DANCING);
        brain.eraseMemory(MemoryModuleType.AVOID_TARGET);
        brain.setMemoryWithExpiry(MemoryModuleType.ANGRY_AT, foe.getUUID(), ANGER_TICKS);
        brain.setMemory(MemoryModuleType.ATTACK_TARGET, foe);
    }

    /** The last one standing stops fighting (its foes are dead). */
    private static void calm(Piglin p) {
        Brain<Piglin> brain = p.getBrain();
        if (BehaviorUtils.getLivingEntityFromUUIDMemory(p, MemoryModuleType.ANGRY_AT).orElse(null) instanceof Piglin) {
            brain.eraseMemory(MemoryModuleType.ANGRY_AT);
        }
        if (brain.getMemory(MemoryModuleType.ATTACK_TARGET).orElse(null) instanceof Piglin) {
            brain.eraseMemory(MemoryModuleType.ATTACK_TARGET);
        }
    }

    /** The winner drinks the Elixir of Greed: healed, strong for a minute, it dances; the empty bottle shatters. */
    public static void drinkGreed(ServerLevel level, Piglin piglin, ItemStack dose) {
        calm(piglin);
        piglin.swing(InteractionHand.OFF_HAND);
        level.playSound(null, piglin, WWSounds.ELIXIR_DRINK, SoundSource.NEUTRAL, 1f, 0.8f);
        piglin.heal(piglin.getMaxHealth());
        piglin.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, 1200, 0));
        piglin.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 300, 1));
        Brain<Piglin> brain = piglin.getBrain();
        brain.setMemoryWithExpiry(MemoryModuleType.CELEBRATE_LOCATION, piglin.blockPosition(), 300L);
        brain.setMemoryWithExpiry(MemoryModuleType.DANCING, true, 300L);
        level.sendParticles(WWParticles.GOLD_GLINT, piglin.getX(), piglin.getY(1.0), piglin.getZ(), 24, 0.4, 0.6, 0.4, 0.05);
        SHATTERS.add(new Shatter(level.dimension(), piglin.position().add(0, 1.0, 0), level.getGameTime() + 16));
    }
}
