package dev.lowpix.winterworks.dagger;

import dev.lowpix.winterworks.net.DaggerStatePayload;
import dev.lowpix.winterworks.net.PouncePayload;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.protocol.game.ClientboundAnimatePacket;
import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Fang Daggers (docs/COLD_UPDATE.md section 9), server-authoritative.
 *
 * <ul>
 * <li><b>Frenzy</b>: with a dagger in each hand every attack is a quick hit (3 damage + enchantments) that alternates
 * hands and ignores invulnerability frames. Each hit adds 0.12 fatigue; the minimum gap between hits grows from 2
 * to 10 ticks as fatigue goes 0 to 1. A click that comes a little early is buffered and struck as soon as the gap
 * allows (one at a time), so spam clicking and bunched-up packets can't beat the rate, and nothing feels dropped.
 * <li><b>Exhausted</b> (fatigue 1, until fully recharged): the daggers swing like one dagger (the vanilla attack);
 * a falling hit is a <b>Fang Crit</b>: 2x damage, Frostbite 3 s, an ice crit burst.
 * <li><b>Recharge</b>: fatigue drains 0.01/tick once you haven't frenzied or pounced for 20 ticks.
 * <li><b>Pounce</b>: sneak + jump on the ground. The client leaps (1.3 forward, 0.42 up) and tells the server
 * ({@link PouncePayload}); the server validates it, charges 0.35 fatigue and a 40-tick cooldown (the vanilla item
 * cooldown) and strikes everything you pass, up to 5 rapid hits of 3 damage.
 * </ul>
 * The client hears about fatigue through {@link DaggerStatePayload}.
 */
public final class DaggerFeature {
    public static final float FRENZY_DAMAGE = 3f, POUNCE_DAMAGE = 3f, FANG_CRIT_MULTIPLIER = 2f;
    public static final float FATIGUE_PER_HIT = 0.12f, POUNCE_FATIGUE = 0.35f, DRAIN_PER_TICK = 0.01f;
    public static final int MIN_GAP = 2, MAX_GAP = 10, DRAIN_DELAY = 20, BUFFER_TICKS = 6;
    public static final double POUNCE_SPEED = 1.3, POUNCE_UP = 0.42;
    public static final int POUNCE_HITS = 5, POUNCE_COOLDOWN = 40, POUNCE_MAX_TICKS = 20, FROSTBITE_TICKS = 60;
    /** Quick hits keep only this much of the vanilla knockback, so the target stays in reach. */
    static final float QUICK_KNOCKBACK = 0.3f;
    private static final float DEG = Mth.DEG_TO_RAD;

    /** Per-player dagger state (server thread only). */
    static final class State {
        float fatigue;
        boolean exhausted;
        long lastHit = Long.MIN_VALUE / 4, lastExertion = Long.MIN_VALUE / 4, lastOnGround = Long.MIN_VALUE / 4;
        int strikes, combo;
        /** Entity id of a click that came early, struck as soon as the gap allows (-1: none). */
        int pending = -1;
        boolean offSwing;
        @Nullable Pounce pounce;
        float sentFatigue = -1f;
        boolean sentExhausted;
        long sentAt;
    }

    static final class Pounce {
        final long start;
        Vec3 last;
        int hits;
        boolean damped;
        final Map<Integer, Long> struck = new HashMap<>();

        Pounce(long start, Vec3 from) {
            this.start = start;
            this.last = from;
        }
    }

    private static final Map<Player, State> STATES = new WeakHashMap<>();

    private DaggerFeature() {}

    public static void init() {
        PayloadTypeRegistry.playC2S().register(PouncePayload.TYPE, PouncePayload.CODEC);
        PayloadTypeRegistry.playS2C().register(DaggerStatePayload.TYPE, DaggerStatePayload.CODEC);
        ServerPlayNetworking.registerGlobalReceiver(PouncePayload.TYPE, (payload, ctx) -> tryPounce(ctx.player(), payload.yaw()));
        AttackEntityCallback.EVENT.register(DaggerFeature::onAttack);
        ServerTickEvents.END_SERVER_TICK.register(DaggerFeature::tick);
        ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, from, to) -> {
            State s = STATES.get(player);
            if (s != null) {   // the client made a new player: tell it again, and drop what belonged to the old world
                s.sentFatigue = -1f;
                s.pending = -1;
                s.pounce = null;
            }
        });
    }

    // ------------------------------------------------------------------------------------------------ queries (tests)

    public static float fatigue(Player p) {
        State s = STATES.get(p);
        return s == null ? 0f : s.fatigue;
    }

    public static boolean exhausted(Player p) {
        State s = STATES.get(p);
        return s != null && s.exhausted;
    }

    public static boolean pouncing(Player p) {
        State s = STATES.get(p);
        return s != null && s.pounce != null;
    }

    /** The minimum gap (ticks) between frenzy hits at this fatigue: 2 fresh, 10 exhausted. */
    public static int gap(float fatigue) {
        return MIN_GAP + (int) Math.floor((MAX_GAP - MIN_GAP) * Mth.clamp(fatigue, 0f, 1f) + 1e-4f);
    }

    public static int gap(Player p) {
        return gap(fatigue(p));
    }

    /** Sets a player's fatigue (1 exhausts them), as if they had just been fighting. */
    public static void setFatigue(ServerPlayer p, float fatigue) {
        State s = state(p);
        s.fatigue = Mth.clamp(fatigue, 0f, 1f);
        s.exhausted = s.fatigue >= 1f;
        s.lastExertion = p.level().getGameTime();
        sync(p, s, true);
    }

    private static State state(Player p) {
        return STATES.computeIfAbsent(p, k -> new State());
    }

    // ------------------------------------------------------------------------------------------------ attacks

    private static InteractionResult onAttack(Player player, Level level, InteractionHand hand, Entity entity, @Nullable EntityHitResult hit) {
        if (level.isClientSide || !(player instanceof ServerPlayer p) || p.isSpectator() || !FangDaggerItem.dualWielding(p)) {
            return InteractionResult.PASS;
        }
        if (!(entity instanceof LivingEntity target) || !target.isAttackable() || target.skipAttackInteraction(p)) {
            return InteractionResult.PASS;
        }
        State s = state(p);
        if (!s.exhausted) {
            frenzyClick(p, target, s);
            return InteractionResult.SUCCESS;   // instead of the vanilla attack
        }
        if (fangCritReady(p)) {
            fangCrit(p, target);
            return InteractionResult.SUCCESS;
        }
        return InteractionResult.PASS;   // exhausted: one slow dagger
    }

    private static void frenzyClick(ServerPlayer p, LivingEntity target, State s) {
        long now = p.level().getGameTime();
        long wait = s.lastHit + gap(s.fatigue) - now;
        if (wait <= 0) {
            s.pending = -1;
            frenzyHit(p, target, s, now);
        } else if (wait <= BUFFER_TICKS) {
            s.pending = target.getId();   // a little early: strike the moment the gap is over
        }
    }

    private static void frenzyHit(ServerPlayer p, LivingEntity target, State s, long now) {
        InteractionHand hand = s.strikes++ % 2 == 0 ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
        if (now - s.lastHit > DRAIN_DELAY) {
            s.combo = 0;
        }
        s.combo++;
        s.lastHit = now;
        s.lastExertion = now;
        boolean landed = quickHit(p, target, hand, FRENZY_DAMAGE);
        slashFx(p, target, hand, s.combo, landed);
        if (hand == InteractionHand.OFF_HAND) {
            s.offSwing = true;
        }
        addFatigue(p, s, FATIGUE_PER_HIT);
    }

    /** A quick dagger hit with the dagger in `hand`: `base` damage + its enchantments, no invulnerability frames. */
    static boolean quickHit(ServerPlayer p, LivingEntity target, InteractionHand hand, float base) {
        ServerLevel level = p.serverLevel();
        ItemStack weapon = p.getItemInHand(hand);
        DamageSource src = p.damageSources().playerAttack(p);
        float damage = EnchantmentHelper.modifyDamage(level, weapon, target, src, base);
        float before = target.getHealth();
        Vec3 motion = target.getDeltaMovement();
        target.invulnerableTime = 0;
        if (!target.hurt(src, damage)) {
            level.playSound(null, p.getX(), p.getY(), p.getZ(), SoundEvents.PLAYER_ATTACK_NODAMAGE, p.getSoundSource(), 0.6f, 1.4f);
            return false;
        }
        Vec3 push = target.getDeltaMovement().subtract(motion);
        target.setDeltaMovement(motion.add(push.scale(QUICK_KNOCKBACK)));
        float knock = EnchantmentHelper.modifyKnockback(level, weapon, target, src, (float) p.getAttributeValue(Attributes.ATTACK_KNOCKBACK));
        if (knock > 0f) {
            target.knockback(knock * 0.5f, Mth.sin(p.getYRot() * DEG), -Mth.cos(p.getYRot() * DEG));
        }
        target.hurtMarked = true;
        afterHit(p, level, target, weapon, src, before);
        p.causeFoodExhaustion(0.05f);
        return true;
    }

    /** What the vanilla attack does after a landed hit: enchantment effects, durability, stats, damage hearts. */
    private static void afterHit(ServerPlayer p, ServerLevel level, LivingEntity target, ItemStack weapon, DamageSource src, float before) {
        p.setLastHurtMob(target);
        boolean used = weapon.hurtEnemy(target, p);
        EnchantmentHelper.doPostAttackEffectsWithItemSource(level, target, src, weapon);
        if (used) {
            weapon.postHurtEnemy(target, p);
        }
        float dealt = before - target.getHealth();
        p.awardStat(Stats.DAMAGE_DEALT, Math.round(dealt * 10f));
        if (dealt > 2f) {
            level.sendParticles(ParticleTypes.DAMAGE_INDICATOR, target.getX(), target.getY(0.5), target.getZ(), (int) (dealt * 0.5f),
                    0.1, 0.0, 0.1, 0.2);
        }
    }

    private static void addFatigue(ServerPlayer p, State s, float amount) {
        s.fatigue = Math.min(1f, s.fatigue + amount);
        if (s.fatigue >= 1f - 1e-4f && !s.exhausted) {
            s.fatigue = 1f;
            s.exhausted = true;
            s.pending = -1;
            p.level().playSound(null, p.getX(), p.getY(), p.getZ(), WWSounds.DAGGER_TIRED, SoundSource.PLAYERS, 0.9f, 1.0f);
            breath(p, 3);
        }
        sync(p, s, true);
    }

    /** The vanilla crit conditions (full swing, falling, not sprinting...). */
    static boolean fangCritReady(Player p) {
        return p.getAttackStrengthScale(0.5f) > 0.9f && p.fallDistance > 0f && !p.onGround() && !p.onClimbable() && !p.isInWater()
                && !p.hasEffect(MobEffects.BLINDNESS) && !p.isPassenger() && !p.isSprinting();
    }

    /** The vanilla attack with a 2x crit instead of 1.5x, plus Frostbite and the ice burst. */
    private static void fangCrit(ServerPlayer p, LivingEntity target) {
        ServerLevel level = p.serverLevel();
        ItemStack weapon = p.getMainHandItem();
        DamageSource src = p.damageSources().playerAttack(p);
        float f = (float) p.getAttributeValue(Attributes.ATTACK_DAMAGE);
        float g = EnchantmentHelper.modifyDamage(level, weapon, target, src, f) - f;
        float h = p.getAttackStrengthScale(0.5f);
        f *= 0.2f + h * h * 0.8f;
        g *= h;
        p.resetAttackStrengthTicker();
        f += weapon.getItem().getAttackDamageBonus(target, f, src);
        f *= FANG_CRIT_MULTIPLIER;
        float before = target.getHealth();
        Vec3 motion = target.getDeltaMovement();
        if (!target.hurt(src, f + g)) {
            level.playSound(null, p.getX(), p.getY(), p.getZ(), SoundEvents.PLAYER_ATTACK_NODAMAGE, p.getSoundSource(), 1f, 1f);
            return;
        }
        float knock = EnchantmentHelper.modifyKnockback(level, weapon, target, src, (float) p.getAttributeValue(Attributes.ATTACK_KNOCKBACK));
        if (knock > 0f) {
            target.knockback(knock * 0.5f, Mth.sin(p.getYRot() * DEG), -Mth.cos(p.getYRot() * DEG));
            p.setDeltaMovement(p.getDeltaMovement().multiply(0.6, 1.0, 0.6));
        }
        if (target instanceof ServerPlayer victim && victim.hurtMarked) {
            victim.connection.send(new ClientboundSetEntityMotionPacket(victim));
            victim.hurtMarked = false;
            victim.setDeltaMovement(motion);
        }
        p.crit(target);
        if (g > 0f) {
            p.magicCrit(target);
        }
        target.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, FROSTBITE_TICKS), p);
        afterHit(p, level, target, weapon, src, before);
        p.causeFoodExhaustion(0.1f);
        Vec3 c = target.position().add(0, target.getBbHeight() * 0.6, 0);
        level.sendParticles(WWParticles.ICE_CRIT, c.x, c.y, c.z, 18, 0.25, 0.35, 0.25, 0.35);
        level.sendParticles(WWParticles.FROST_BURST, c.x, c.y, c.z, 0, Math.max(1.6, target.getBbWidth() * 2.2), 0, 0, 1.0);
        level.sendParticles(WWParticles.ICE_SHARD, c.x, c.y, c.z, 6, 0.2, 0.2, 0.2, 0.15);
        level.playSound(null, c.x, c.y, c.z, WWSounds.DAGGER_CRIT, SoundSource.PLAYERS, 1.0f, 0.9f + level.random.nextFloat() * 0.2f);
    }

    private static void slashFx(ServerPlayer p, LivingEntity target, InteractionHand hand, int combo, boolean landed) {
        ServerLevel level = p.serverLevel();
        RandomSource r = level.random;
        Vec3 c = target.position().add(0, target.getBbHeight() * 0.55, 0);
        Vec3 toward = p.getEyePosition().subtract(c);
        double reach = Math.min(target.getBbWidth() * 0.5 + 0.15, toward.length());
        Vec3 at = toward.lengthSqr() < 1e-6 ? c : c.add(toward.normalize().scale(reach));
        boolean main = hand == InteractionHand.MAIN_HAND;
        float roll = (main ? 0.6f : Mth.PI - 0.6f) + (r.nextFloat() - 0.5f) * 0.5f;   // the slashes cross, hand to hand
        level.sendParticles(WWParticles.FROST_SLASH, at.x, at.y, at.z, 0, roll, 0, 0, 1.0);
        level.sendParticles(ParticleTypes.SNOWFLAKE, at.x, at.y, at.z, 3, 0.15, 0.15, 0.15, 0.03);
        float pitch = 0.95f + Math.min(combo, 9) * 0.045f + r.nextFloat() * 0.15f + (main ? 0f : 0.06f);   // rises with the combo
        level.playSound(null, at.x, at.y, at.z, WWSounds.DAGGER_SLASH, SoundSource.PLAYERS, landed ? 0.8f : 0.5f, pitch);
    }

    private static void breath(ServerPlayer p, int puffs) {
        Vec3 look = p.getLookAngle();
        Vec3 m = p.getEyePosition().add(look.scale(0.35)).add(0, -0.12, 0);
        for (int i = 0; i < puffs; i++) {
            p.serverLevel().sendParticles(WWParticles.FROST_BREATH, m.x, m.y, m.z, 0, look.x * 0.06, 0.01 + i * 0.01, look.z * 0.06, 1.0);
        }
    }

    // ------------------------------------------------------------------------------------------------ pounce

    /** Validates and starts a pounce (the client already leapt). Returns false (and re-syncs the client) if not allowed. */
    public static boolean tryPounce(ServerPlayer p, float yaw) {
        State s = state(p);
        long now = p.level().getGameTime();
        boolean grounded = p.onGround() || now - s.lastOnGround <= 5;   // the jump's move packet may have come first
        if (p.isSpectator() || !p.isAlive() || !FangDaggerItem.dualWielding(p) || s.exhausted || s.pounce != null
                || p.getCooldowns().isOnCooldown(WWItems.FANG_DAGGER) || !p.isShiftKeyDown() || !grounded || p.isPassenger()
                || p.isFallFlying() || p.isInWater() || p.isSleeping() || !Float.isFinite(yaw)) {
            sync(p, s, true);
            return false;
        }
        Vec3 dir = new Vec3(-Mth.sin(yaw * DEG), 0, Mth.cos(yaw * DEG));
        p.getCooldowns().addCooldown(WWItems.FANG_DAGGER, POUNCE_COOLDOWN);
        p.setDeltaMovement(dir.x * POUNCE_SPEED, POUNCE_UP, dir.z * POUNCE_SPEED);   // the server's copy of the leap
        s.pounce = new Pounce(now, p.position());
        s.lastExertion = now;
        ServerLevel level = p.serverLevel();
        level.playSound(p, p.getX(), p.getY(), p.getZ(), WWSounds.DAGGER_POUNCE, SoundSource.PLAYERS, 1.0f,
                0.95f + level.random.nextFloat() * 0.1f);   // the pouncer hears it at once, on their side
        level.sendParticles(WWParticles.SNOW_PUFF, p.getX(), p.getY() + 0.1, p.getZ(), 8, 0.3, 0.05, 0.3, 0.05);
        level.sendParticles(ParticleTypes.SNOWFLAKE, p.getX(), p.getY() + 0.3, p.getZ(), 10, 0.4, 0.1, 0.4, 0.08);
        addFatigue(p, s, POUNCE_FATIGUE);
        return true;
    }

    private static void tickPounce(ServerPlayer p, State s, long now) {
        Pounce pc = s.pounce;
        ServerLevel level = p.serverLevel();
        long age = now - pc.start;
        Vec3 pos = p.position();
        if (!p.isAlive() || !FangDaggerItem.dualWielding(p) || age > POUNCE_MAX_TICKS || pc.hits >= POUNCE_HITS
                || (age >= 3 && p.onGround())) {
            if (p.onGround()) {
                level.sendParticles(WWParticles.SNOW_PUFF, pos.x, pos.y + 0.1, pos.z, 6, 0.35, 0.05, 0.35, 0.04);
            }
            s.pounce = null;
            return;
        }
        AABB sweep = p.getBoundingBox().expandTowards(pc.last.subtract(pos)).inflate(0.9, 0.4, 0.9);
        List<LivingEntity> prey = level.getEntitiesOfClass(LivingEntity.class, sweep, e -> canPounceOn(p, e));
        prey.sort(Comparator.comparingDouble(e -> e.distanceToSqr(p)));
        for (LivingEntity e : prey) {
            if (pc.hits >= POUNCE_HITS) {
                break;
            }
            Long last = pc.struck.get(e.getId());
            if (last != null && now - last < 2) {
                continue;
            }
            InteractionHand hand = s.strikes++ % 2 == 0 ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
            boolean landed = quickHit(p, e, hand, POUNCE_DAMAGE);
            pc.hits++;
            slashFx(p, e, hand, pc.hits + 3, landed);
            if (hand == InteractionHand.OFF_HAND) {
                s.offSwing = true;
            }
            pc.struck.put(e.getId(), now);
            if (!pc.damped) {   // landing on the prey: the leap stops there (the client does the same on its side)
                pc.damped = true;
                Vec3 m = p.getDeltaMovement();
                p.setDeltaMovement(m.x * 0.3, m.y, m.z * 0.3);
            }
        }
        level.sendParticles(ParticleTypes.SNOWFLAKE, pos.x, pos.y + 0.6, pos.z, 3, 0.25, 0.3, 0.25, 0.02);
        level.sendParticles(WWParticles.BLIZZARD_FLAKE, pos.x, pos.y + 0.9, pos.z, 2, 0.3, 0.4, 0.3, 0.01);
        if (age % 3 == 0) {
            level.sendParticles(WWParticles.ICE_SHARD, pos.x, pos.y + 0.4, pos.z, 1, 0.2, 0.2, 0.2, 0.05);
        }
        pc.last = pos;
        s.lastExertion = now;
    }

    /** Whom a pounce strikes: living things in the way, not you, your mount, your pets, allies or markers. */
    public static boolean canPounceOn(Player p, Entity e) {
        return e instanceof LivingEntity l && l != p && l.isAlive() && l.isAttackable() && !l.isSpectator() && !p.isAlliedTo(l)
                && !(l instanceof ArmorStand stand && stand.isMarker()) && l != p.getVehicle() && !l.isPassengerOfSameVehicle(p)
                && !(l instanceof OwnableEntity pet && p.getUUID().equals(pet.getOwnerUUID())) && !l.skipAttackInteraction(p)
                && p.hasLineOfSight(l);
    }

    // ------------------------------------------------------------------------------------------------ ticking

    private static void tick(MinecraftServer server) {
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            State s = STATES.get(p);
            boolean dual = FangDaggerItem.dualWielding(p);
            if (s == null) {
                if (!dual) {
                    continue;
                }
                s = state(p);
            }
            long now = p.level().getGameTime();
            if (p.onGround()) {
                s.lastOnGround = now;
            }
            if (s.pending >= 0 && now - s.lastHit >= gap(s.fatigue)) {   // the buffered click
                Entity e = p.level().getEntity(s.pending);
                s.pending = -1;
                if (dual && !s.exhausted && !p.isSpectator() && e instanceof LivingEntity t && t.isAlive() && t.isAttackable()
                        && p.canInteractWithEntity(t.getBoundingBox(), 1.0)) {
                    frenzyHit(p, t, s, now);
                }
            }
            if (s.pounce != null) {
                tickPounce(p, s, now);
            }
            if (now - s.lastExertion >= DRAIN_DELAY && s.fatigue > 0f) {
                s.fatigue = Math.max(0f, s.fatigue - DRAIN_PER_TICK);
                if (s.fatigue <= 1e-4f) {
                    s.fatigue = 0f;
                    if (s.exhausted) {
                        s.exhausted = false;
                        p.level().playSound(null, p.getX(), p.getY(), p.getZ(), WWSounds.DAGGER_READY, SoundSource.PLAYERS, 0.8f, 1.0f);
                        p.serverLevel().sendParticles(WWParticles.ICE_CRIT, p.getX(), p.getY(0.55), p.getZ(), 8, 0.35, 0.3, 0.35, 0.05);
                    }
                }
            }
            if (s.exhausted && p.tickCount % 12 == 0) {   // panting frost
                breath(p, 1);
            }
            if (s.offSwing) {   // after the client's own (main-hand) swing packet, so the off hand wins for everyone else
                s.offSwing = false;
                p.swingingArm = InteractionHand.OFF_HAND;
                p.serverLevel().getChunkSource().broadcast(p, new ClientboundAnimatePacket(p, 3));
            }
            sync(p, s, false);
        }
    }

    private static void sync(ServerPlayer p, State s, boolean force) {
        long now = p.level().getGameTime();
        boolean changed = s.exhausted != s.sentExhausted || Math.abs(s.fatigue - s.sentFatigue) >= 0.05f
                || (s.fatigue == 0f && s.sentFatigue != 0f);
        boolean refresh = (s.fatigue > 0f || s.exhausted) && now - s.sentAt >= 40;
        if (!(force || changed || refresh) || !ServerPlayNetworking.canSend(p, DaggerStatePayload.TYPE)) {
            return;
        }
        ServerPlayNetworking.send(p, new DaggerStatePayload(s.fatigue, s.exhausted));
        s.sentFatigue = s.fatigue;
        s.sentExhausted = s.exhausted;
        s.sentAt = now;
    }
}
