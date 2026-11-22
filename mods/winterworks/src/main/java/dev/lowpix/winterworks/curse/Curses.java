package dev.lowpix.winterworks.curse;

import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWParticles;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The shared machinery of the curses: which curses a player bears right now (their equipped items, each in its
 * enchantment's slots, like vanilla), per-player state, the trigger feel (runes, sounds, the first-time actionbar line,
 * hidden-curse discovery), freezing in place, soul fire and test hooks. Curses only work on survival and adventure
 * players; the sins' powers are enchantment effects and work for anyone.
 */
public final class Curses {
    private Curses() {}

    /** The curses a player has already triggered once (their actionbar line is shown only that first time). */
    static final AttachmentType<List<String>> SEEN = AttachmentRegistry.create(Winterworks.id("curses_seen"),
            b -> b.persistent(Codec.STRING.listOf()).copyOnDeath());

    /** Wasting away over your reflection (Narcissus). */
    public static final ResourceKey<DamageType> NARCISSUS_DAMAGE = ResourceKey.create(Registries.DAMAGE_TYPE, Winterworks.id("narcissus"));
    /** Your own blow, falling on your pet (Cain). */
    public static final ResourceKey<DamageType> CAIN_DAMAGE = ResourceKey.create(Registries.DAMAGE_TYPE, Winterworks.id("cain"));

    private static final ResourceLocation FROZEN = Winterworks.id("curse.frozen");
    private static final AttributeModifier FROZEN_SPEED = new AttributeModifier(FROZEN, -1.0,
            AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
    private static final AttributeModifier FROZEN_JUMP = new AttributeModifier(FROZEN, -1.0,
            AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);

    /** Per-player curse state. A new player entity (respawn) starts fresh. */
    static final class State {
        final int[] levels = new int[Curse.ALL.length];
        long levelsTick = Long.MIN_VALUE;
        boolean forced;
        /** 0: free; Long.MAX_VALUE: until released; else the game time it ends. */
        long frozenUntil;
        // turning round (Orpheus, Lot's Wife)
        final float[] yaw = new float[10];
        int yawAt = -1;
        long lastHurt = Long.MIN_VALUE / 2;
        // Narcissus
        int stare;
        boolean transfixed;
        long nextWaste;
        Vec3 waterAt;
        // Icarus
        boolean icarusBurning;
        // Midas / Tantalus: one roll per bite
        boolean bitRolled;
        // Moth
        net.minecraft.core.BlockPos light;
        long nextLightScan;
        // Orpheus / Lot's Wife cooldowns
        long orpheusReady, stoneReady;
        // Wrath
        boolean wrathWasActive;
        long lastDealt;
        int fury, idle;
        // Sloth
        long nextNod;
        // Pride
        boolean proud = true;
        // Lust: when it last swept nearby mobs
        long lustSweep;
    }

    private static final Map<ServerPlayer, State> STATES = new WeakHashMap<>();
    private static final Map<LivingEntity, Long> SOUL_FIRE = new WeakHashMap<>();

    static State state(ServerPlayer p) {
        return STATES.computeIfAbsent(p, k -> new State());
    }

    /** Can curses touch this player right now (survival or adventure, alive)? */
    public static boolean cursable(ServerPlayer p) {
        GameType mode = p.gameMode.getGameModeForPlayer();
        return mode != GameType.CREATIVE && mode != GameType.SPECTATOR && p.isAlive();
    }

    /** The level of a curse the entity bears right now (0 if none, or if it isn't a cursable player). */
    public static int level(LivingEntity e, Curse c) {
        if (!(e instanceof ServerPlayer p)) {
            return 0;
        }
        State s = state(p);
        long t = p.level().getGameTime();
        if (s.levelsTick != t) {
            s.levelsTick = t;
            scan(p, s.levels);
        }
        return s.levels[c.ordinal()];
    }

    public static boolean has(LivingEntity e, Curse c) {
        return level(e, c) > 0;
    }

    /** Fills levels with every curse on the player's equipment, each counted only in its enchantment's slots. */
    private static void scan(ServerPlayer p, int[] levels) {
        Arrays.fill(levels, 0);
        if (!cursable(p)) {
            return;
        }
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            ItemStack stack = p.getItemBySlot(slot);
            if (stack.isEmpty()) {
                continue;
            }
            ItemEnchantments en = stack.get(DataComponents.ENCHANTMENTS);
            if (en == null || en.isEmpty()) {
                continue;
            }
            for (var entry : en.entrySet()) {
                Holder<Enchantment> h = entry.getKey();
                Curse c = Curse.of(h);
                if (c != null && h.value().matchingSlot(slot)) {
                    levels[c.ordinal()] = Math.max(levels[c.ordinal()], entry.getIntValue());
                }
            }
        }
    }

    /** Any sin borne right now (for the client vignette and tests). */
    public static boolean anySin(ServerPlayer p) {
        for (Curse c : Curse.ALL) {
            if (c.sin() && has(p, c)) {
                return true;
            }
        }
        return false;
    }

    /** A damage source of one of the curse damage types (falling back to magic if the data is missing). */
    static DamageSource damage(ServerLevel level, ResourceKey<DamageType> type, @Nullable Entity cause) {
        return level.registryAccess().registryOrThrow(Registries.DAMAGE_TYPE).getHolder(type)
                .map(h -> new DamageSource(h, cause))
                .orElseGet(() -> cause == null ? level.damageSources().magic() : level.damageSources().indirectMagic(cause, cause));
    }

    // ------------------------------------------------------------------------------------------------ chance

    /** Tests: make every curse chance roll succeed for this player (or stop doing so). */
    public static void force(ServerPlayer p, boolean on) {
        state(p).forced = on;
    }

    static boolean roll(ServerPlayer p, float chance) {
        return state(p).forced || p.getRandom().nextFloat() < chance;
    }

    // ------------------------------------------------------------------------------------------------ trigger feel

    /**
     * A curse just did its thing: runes and its sound, and the first time ever for this player, its actionbar line
     * (and, for a hidden curse, its discovery). Returns true the first time.
     */
    static boolean trigger(ServerPlayer p, Curse c, SoundEvent sound, Object... args) {
        ServerLevel level = p.serverLevel();
        runes(level, p.position().add(0, 1.0, 0), 10, 0.5);
        if (c.sin()) {
            level.sendParticles(ParticleTypes.SOUL, p.getX(), p.getY() + 1.0, p.getZ(), 4, 0.4, 0.5, 0.4, 0.02);
        }
        level.playSound(null, p.getX(), p.getY(), p.getZ(), sound, SoundSource.PLAYERS, 0.8f,
                0.9f + p.getRandom().nextFloat() * 0.2f);
        List<String> seen = p.getAttachedOrElse(SEEN, List.of());
        if (seen.contains(c.id())) {
            return false;
        }
        List<String> now = new ArrayList<>(seen);
        now.add(c.id());
        p.setAttached(SEEN, now);
        tell(p, "curse.winterworks." + c.id() + ".trigger", args);
        if (c.hidden()) {
            try {
                dev.lowpix.winterworks.hex.HexDiscovery.discover(p, c.key);
            } catch (RuntimeException e) {
                Winterworks.LOG.warn("Hidden curse discovery failed for {}", c.id(), e);
            }
        }
        return true;
    }

    /** Has this player ever triggered the curse? */
    public static boolean seen(ServerPlayer p, Curse c) {
        return p.getAttachedOrElse(SEEN, List.of()).contains(c.id());
    }

    /** An actionbar line in the curse colour. */
    static void tell(ServerPlayer p, String key, Object... args) {
        p.displayClientMessage(Component.translatable(key, args).withStyle(ChatFormatting.DARK_PURPLE, ChatFormatting.ITALIC), true);
    }

    static void runes(ServerLevel level, Vec3 at, int count, double spread) {
        level.sendParticles(WWParticles.HEX_RUNE, at.x, at.y, at.z, count, spread, spread * 0.8, spread, 0.02);
        level.sendParticles(ParticleTypes.WITCH, at.x, at.y, at.z, Math.max(1, count / 3), spread, spread * 0.8, spread, 0.0);
    }

    static void particles(Entity e, ParticleOptions type, int count, double speed) {
        if (e.level() instanceof ServerLevel level) {
            level.sendParticles(type, e.getX(), e.getY() + e.getBbHeight() * 0.5, e.getZ(), count,
                    e.getBbWidth() * 0.4, e.getBbHeight() * 0.35, e.getBbWidth() * 0.4, speed);
        }
    }

    static void sound(Entity e, SoundEvent sound, float volume, float pitch) {
        e.level().playSound(null, e.getX(), e.getY(), e.getZ(), sound, SoundSource.PLAYERS, volume, pitch);
    }

    // ------------------------------------------------------------------------------------------------ frozen in place

    /** Freeze a player in place (no walking, no jumping) for ticks, or until released if ticks < 0. */
    static void freeze(ServerPlayer p, int ticks) {
        State s = state(p);
        long until = ticks < 0 ? Long.MAX_VALUE : p.level().getGameTime() + ticks;
        s.frozenUntil = Math.max(s.frozenUntil, until);
        modifier(p.getAttribute(Attributes.MOVEMENT_SPEED), FROZEN_SPEED);
        modifier(p.getAttribute(Attributes.JUMP_STRENGTH), FROZEN_JUMP);
        p.setDeltaMovement(0, Math.min(0, p.getDeltaMovement().y), 0);
        p.hurtMarked = true;
    }

    private static void modifier(AttributeInstance a, AttributeModifier m) {
        if (a != null) {
            a.addOrUpdateTransientModifier(m);
        }
    }

    /** Unfreeze, and give the camera back. */
    static void release(ServerPlayer p) {
        State s = state(p);
        s.frozenUntil = 0;
        AttributeInstance speed = p.getAttribute(Attributes.MOVEMENT_SPEED);
        if (speed != null) {
            speed.removeModifier(FROZEN);
        }
        AttributeInstance jump = p.getAttribute(Attributes.JUMP_STRENGTH);
        if (jump != null) {
            jump.removeModifier(FROZEN);
        }
        send(p, CurseFxPayload.RELEASE, 0, 0, 0, 0);
    }

    public static boolean frozen(ServerPlayer p) {
        return state(p).frozenUntil != 0;
    }

    static void tickFrozen(ServerPlayer p, State s, long now) {
        if (s.frozenUntil != 0 && s.frozenUntil != Long.MAX_VALUE && now >= s.frozenUntil) {
            release(p);
        }
    }

    // ------------------------------------------------------------------------------------------------ client fx

    static void send(ServerPlayer p, int kind, int ticks, float x, float y, float z) {
        if (ServerPlayNetworking.canSend(p, CurseFxPayload.TYPE)) {
            ServerPlayNetworking.send(p, new CurseFxPayload(kind, ticks, x, y, z));
        }
    }

    // ------------------------------------------------------------------------------------------------ soul fire

    /** Set alight with soul fire: it burns twice as hard as normal fire and shows soul flames. */
    public static void soulIgnite(LivingEntity e, int ticks) {
        if (e.fireImmune() || e.isInWaterRainOrBubble()) {
            return;
        }
        e.setRemainingFireTicks(Math.max(e.getRemainingFireTicks(), ticks));
        SOUL_FIRE.put(e, e.level().getGameTime() + ticks);
        particles(e, ParticleTypes.SOUL_FIRE_FLAME, 10, 0.03);
    }

    public static boolean soulBurning(LivingEntity e) {
        Long until = SOUL_FIRE.get(e);
        return until != null && e.getRemainingFireTicks() > 0;
    }

    static void tickSoulFire(ServerLevel level) {
        if (SOUL_FIRE.isEmpty()) {
            return;
        }
        long now = level.getGameTime();
        for (Iterator<Map.Entry<LivingEntity, Long>> it = SOUL_FIRE.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<LivingEntity, Long> en = it.next();
            LivingEntity e = en.getKey();
            if (e == null || e.isRemoved() || !e.isAlive() || e.getRemainingFireTicks() <= 0) {
                it.remove();
                continue;
            }
            if (e.level() == level && (now + e.getId()) % 3 == 0) {
                level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, e.getX(), e.getY() + e.getBbHeight() * 0.4, e.getZ(), 2,
                        e.getBbWidth() * 0.35, e.getBbHeight() * 0.3, e.getBbWidth() * 0.35, 0.01);
            }
        }
    }
}
