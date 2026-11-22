package dev.lowpix.winterworks.curse;

import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.tag.convention.v2.ConventionalBlockTags;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.NeutralMob;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.ai.memory.MemoryStatus;
import net.minecraft.world.entity.ai.sensing.Sensor;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * The seven deadly sins (docs/HEXES_UPDATE.md 4): the power half that vanilla effect components can't express, and
 * every curse half. The data side is in tools/data_curses.py.
 */
public final class Sins {
    /** Wrath: seconds without dealing damage before the lethargy builds (ticks), and how high things build. */
    public static final int WRATH_IDLE = 100, WRATH_MAX_IDLE = 3, WRATH_MAX_FURY = 6;
    /** Greed and Lust count as their source enchantment this many levels higher. */
    public static final int GREED_FORTUNE_BONUS = 2, LUST_LOOTING_BONUS = 3;
    public static final int GREED_RANGE = 16, LUST_RANGE = 24, LUST_NEUTRAL_RANGE = 16;
    public static final float GLUTTONY_HUNGER = 3f, GLUTTONY_STARVING = 2f, ENVY_DAMAGE = 1.5f, PRIDE_FALL = 3f;
    /** Gluttony: durability mended per point of food eaten. */
    public static final int GLUTTONY_REPAIR = 4;

    private Sins() {}

    static void tick(ServerPlayer p, Curses.State s, long now, List<ServerPlayer> lustBearers) {
        wrath(p, s, now);
        if (now % 20 == 0) {
            greed(p);
        }
        if (Curses.has(p, Curse.LUST)) {
            lustBearers.add(p);
            lust(p, s, now);
        }
        sloth(p, s, now);
        pride(p, s);
    }

    // ------------------------------------------------------------------------------------------------ damage

    /** Incoming damage, before anything else sees it (LivingEntity.hurt HEAD). */
    public static float incoming(LivingEntity victim, DamageSource src, float amount) {
        if (amount <= 0 || victim.level().isClientSide) {
            return amount;
        }
        if (src.is(DamageTypes.ON_FIRE) && Curses.soulBurning(victim)) {
            amount *= 2f;   // soul fire burns hotter
        }
        if (!(victim instanceof ServerPlayer p)) {
            return amount;
        }
        if (src.is(DamageTypeTags.IS_FALL) && Curses.has(p, Curse.PRIDE)) {
            amount *= PRIDE_FALL;
        }
        if (src.is(DamageTypes.STARVE) && Curses.has(p, Curse.GLUTTONY)) {
            amount *= GLUTTONY_STARVING;
        }
        if (src.getEntity() instanceof LivingEntity a && a != p && a.getHealth() > p.getHealth() && Curses.has(p, Curse.ENVY)) {
            amount *= ENVY_DAMAGE;
        }
        return amount;
    }

    /** The player dealt damage to something (it went through). */
    static void onDealt(ServerPlayer p, LivingEntity victim, DamageSource src, float amount) {
        if (amount <= 0 || victim == p || src.is(Curses.CAIN_DAMAGE) || !Curses.has(p, Curse.WRATH)) {
            return;
        }
        Curses.State s = Curses.state(p);
        s.lastDealt = p.level().getGameTime();
        if (s.idle > 0) {   // the rage burns the lethargy away
            p.removeEffect(MobEffects.MOVEMENT_SLOWDOWN);
            p.removeEffect(MobEffects.WEAKNESS);
            s.idle = 0;
        }
        int before = (s.fury - 1) / 2;
        s.fury = Math.min(s.fury + 1, WRATH_MAX_FURY);
        int amp = (s.fury - 1) / 2;
        p.addEffect(new MobEffectInstance(MobEffects.DAMAGE_BOOST, WRATH_IDLE, amp, false, true, true));
        if (src.isDirect()) {
            Curses.soulIgnite(victim, 160);
        }
        if (s.fury == 1 || amp > before) {
            Curses.trigger(p, Curse.WRATH, WWSounds.SIN);
            Curses.particles(p, ParticleTypes.SOUL_FIRE_FLAME, 6 + amp * 4, 0.04);
        }
    }

    /** The player was hurt (it went through). */
    static void onHurt(ServerPlayer p, DamageSource src, float amount) {
        if (amount > 0 && src.getEntity() instanceof LivingEntity a && a != p && a.isAlive() && !src.is(DamageTypes.THORNS)
                && Curses.has(p, Curse.ENVY)) {
            envy(p, a, amount);
        }
    }

    // ------------------------------------------------------------------------------------------------ Wrath

    private static void wrath(ServerPlayer p, Curses.State s, long now) {
        if (!Curses.has(p, Curse.WRATH)) {
            s.wrathWasActive = false;
            s.fury = 0;
            s.idle = 0;
            return;
        }
        if (!s.wrathWasActive) {
            s.wrathWasActive = true;
            s.lastDealt = now;
        }
        long since = now - s.lastDealt;
        if (since > 0 && since % WRATH_IDLE == 0) {   // every 5 idle seconds the lethargy deepens
            s.fury = 0;
            s.idle = Math.min(s.idle + 1, WRATH_MAX_IDLE);
            p.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SLOWDOWN, WRATH_IDLE + 20, s.idle - 1, false, true, true));
            p.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, WRATH_IDLE + 20, s.idle - 1, false, true, true));
            if (since == WRATH_IDLE) {
                Curses.trigger(p, Curse.WRATH, WWSounds.SIN);
            }
            Curses.particles(p, ParticleTypes.SMOKE, 6 + s.idle * 3, 0.01);
        }
    }

    /** Tests: how built up Wrath is (fury: hits; idle: 5 s spells without one). */
    public static int fury(ServerPlayer p) {
        return Curses.state(p).fury;
    }

    // ------------------------------------------------------------------------------------------------ Greed

    /** Greed counts as Fortune +2, Lust as Looting +3 (EnchantmentHelper.getItemEnchantmentLevel). */
    public static int sourceLevel(Holder<Enchantment> h, ItemStack stack, int level) {
        if (h.is(Enchantments.FORTUNE)) {
            int g = levelOn(stack, Curse.GREED.key);
            return g > 0 ? Math.max(level, g + GREED_FORTUNE_BONUS) : level;
        }
        if (h.is(Enchantments.LOOTING)) {
            int l = levelOn(stack, Curse.LUST.key);
            return l > 0 ? Math.max(level, l + LUST_LOOTING_BONUS) : level;
        }
        return level;
    }

    static int levelOn(ItemStack stack, ResourceKey<Enchantment> key) {
        ItemEnchantments en = stack.get(DataComponents.ENCHANTMENTS);
        if (en == null || en.isEmpty()) {
            return 0;
        }
        for (var e : en.entrySet()) {
            if (e.getKey().is(key)) {
                return e.getIntValue();
            }
        }
        return 0;
    }

    /** Piglins can't see the gold on someone bearing Greed (PiglinAi.isWearingGold). */
    public static boolean hidesGold(LivingEntity e) {
        return Curses.has(e, Curse.GREED);
    }

    /** All Piglins near a Greed bearer hunt them. */
    static void greed(ServerPlayer p) {
        if (!Curses.has(p, Curse.GREED)) {
            return;
        }
        boolean angered = false;
        for (AbstractPiglin piglin : p.level().getEntitiesOfClass(AbstractPiglin.class, p.getBoundingBox().inflate(GREED_RANGE),
                e -> e.isAlive() && !e.isNoAi())) {
            if (huntGreedy(piglin, p)) {
                angered = true;
                piglin.playSound(SoundEvents.PIGLIN_ANGRY, 1f, piglin.getVoicePitch());
                Curses.particles(piglin, WWParticles.GOLD_GLINT, 4, 0.02);
            }
        }
        if (angered) {
            Curses.trigger(p, Curse.GREED, WWSounds.SIN);
        }
    }

    /** The piglin is now angry at the player (true if it wasn't already). */
    public static boolean huntGreedy(AbstractPiglin piglin, ServerPlayer p) {
        if (!Sensor.isEntityAttackableIgnoringLineOfSight(piglin, p)) {
            return false;
        }
        var brain = piglin.getBrain();
        if (!brain.checkMemory(MemoryModuleType.ANGRY_AT, MemoryStatus.REGISTERED)) {
            return false;
        }
        boolean already = brain.getMemory(MemoryModuleType.ANGRY_AT).map(p.getUUID()::equals).orElse(false);
        brain.eraseMemory(MemoryModuleType.CANT_REACH_WALK_TARGET_SINCE);
        brain.setMemoryWithExpiry(MemoryModuleType.ANGRY_AT, p.getUUID(), 600L);
        return !already;
    }

    /** Greed: an item you throw away is gone (ServerPlayer.drop with a thrower). */
    public static void onToss(ServerPlayer p, ItemEntity item) {
        if (!p.isAlive() || !Curses.has(p, Curse.GREED)) {
            return;
        }
        ServerLevel level = p.serverLevel();
        ItemStack stack = item.getItem();
        if (!stack.isEmpty()) {
            level.sendParticles(new ItemParticleOption(ParticleTypes.ITEM, stack), item.getX(), item.getY() + 0.2, item.getZ(), 8,
                    0.1, 0.1, 0.1, 0.08);
        }
        level.sendParticles(ParticleTypes.SMOKE, item.getX(), item.getY() + 0.2, item.getZ(), 6, 0.1, 0.1, 0.1, 0.02);
        level.sendParticles(WWParticles.GOLD_GLINT, item.getX(), item.getY() + 0.2, item.getZ(), 4, 0.15, 0.15, 0.15, 0.02);
        level.playSound(null, item.getX(), item.getY(), item.getZ(), SoundEvents.FIRE_EXTINGUISH, SoundSource.PLAYERS, 0.4f, 1.8f);
        item.discard();
        if (!Curses.trigger(p, Curse.GREED, WWSounds.SIN)) {
            Curses.tell(p, "curse.winterworks.greed.vanish");
        }
    }

    /** Greed: ores give gold nuggets as well, gold ores plenty. */
    static void afterBreak(Level world, ServerPlayer p, BlockPos pos, BlockState state) {
        if (!(world instanceof ServerLevel level) || !state.is(ConventionalBlockTags.ORES) || !Curses.has(p, Curse.GREED)) {
            return;
        }
        int lvl = Curses.level(p, Curse.GREED);
        boolean gold = state.is(ConventionalBlockTags.GOLD_ORES) || state.is(BlockTags.GOLD_ORES);
        int n = 1 + p.getRandom().nextInt(lvl + 1) + (gold ? 2 + p.getRandom().nextInt(2 + lvl * 2) : 0);
        Block.popResource(level, pos, new ItemStack(Items.GOLD_NUGGET, n));
        Vec3 c = Vec3.atCenterOf(pos);
        level.sendParticles(WWParticles.GOLD_GLINT, c.x, c.y, c.z, 6 + n, 0.35, 0.35, 0.35, 0.03);
        level.playSound(null, pos, SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.BLOCKS, 0.6f, 1.6f);
    }

    // ------------------------------------------------------------------------------------------------ Lust

    /** Hostile mobs near a Lust bearer go for them; neutral ones turn on them. Twice a second at most. */
    private static void lust(ServerPlayer p, Curses.State s, long now) {
        if (now - s.lustSweep < 20 && now >= s.lustSweep) {
            return;
        }
        s.lustSweep = now;
        boolean any = false;
        AABB box = p.getBoundingBox().inflate(LUST_RANGE, 10, LUST_RANGE);
        for (Mob m : p.level().getEntitiesOfClass(Mob.class, box, e -> e.isAlive() && !e.isNoAi()
                && (e instanceof Enemy || e instanceof NeutralMob) && !(e instanceof OwnableEntity o && o.getOwnerUUID() != null))) {
            if (m.getTarget() == p || !m.canAttack(p) || !m.canAttackType(p.getType())) {
                continue;
            }
            if (m instanceof NeutralMob n) {
                if (m.distanceToSqr(p) > LUST_NEUTRAL_RANGE * LUST_NEUTRAL_RANGE) {
                    continue;
                }
                n.setPersistentAngerTarget(p.getUUID());
                n.startPersistentAngerTimer();
            } else if (m.getTarget() != null && m.getTarget().isAlive()) {
                continue;
            }
            m.setTarget(p);
            if (m.getBrain().checkMemory(MemoryModuleType.ATTACK_TARGET, MemoryStatus.REGISTERED)) {
                m.getBrain().setMemory(MemoryModuleType.ATTACK_TARGET, p);
            }
            Curses.particles(m, ParticleTypes.ANGRY_VILLAGER, 1, 0);
            any = true;
        }
        if (any) {
            Curses.trigger(p, Curse.LUST, WWSounds.SIN);
        }
    }

    // ------------------------------------------------------------------------------------------------ Gluttony

    /** Hunger drains three times as fast (Player.causeFoodExhaustion). */
    public static float exhaustion(Player p, float f) {
        return f > 0 && Curses.has(p, Curse.GLUTTONY) ? f * GLUTTONY_HUNGER : f;
    }

    /** Food mends Gluttony gear as well (Player.eat). */
    public static void onEat(Player player, FoodProperties food) {
        if (!(player instanceof ServerPlayer p) || !Curses.has(p, Curse.GLUTTONY) || food.nutrition() <= 0) {
            return;
        }
        int repair = food.nutrition() * GLUTTONY_REPAIR;
        boolean mended = false;
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            ItemStack stack = p.getItemBySlot(slot);
            if (stack.isDamaged() && levelOn(stack, Curse.GLUTTONY.key) > 0) {
                stack.setDamageValue(Math.max(0, stack.getDamageValue() - repair));
                mended = true;
            }
        }
        if (mended) {
            Curses.particles(p, ParticleTypes.HAPPY_VILLAGER, 6, 0.02);
            Curses.trigger(p, Curse.GLUTTONY, WWSounds.SIN);
        }
    }

    // ------------------------------------------------------------------------------------------------ Sloth

    private static void sloth(ServerPlayer p, Curses.State s, long now) {
        if (!Curses.has(p, Curse.SLOTH)) {
            s.nextNod = 0;
            return;
        }
        if (s.nextNod == 0) {
            s.nextNod = now + 600 + p.getRandom().nextInt(1200);   // 30-90 s
        }
        if (now >= s.nextNod && s.frozenUntil == 0) {
            s.nextNod = now + 900 + p.getRandom().nextInt(1500);
            nodOff(p);
        }
    }

    /** Sloth: you nod off, blind and frozen for 3 s. */
    public static void nodOff(ServerPlayer p) {
        p.addEffect(new MobEffectInstance(MobEffects.BLINDNESS, 80, 0, false, false, true));
        Curses.freeze(p, 60);
        Curses.send(p, CurseFxPayload.NOD, 60, 0, 0, 0);
        Curses.sound(p, SoundEvents.FOX_SLEEP, 0.9f, 0.6f);
        Curses.trigger(p, Curse.SLOTH, WWSounds.SIN);
    }

    // ------------------------------------------------------------------------------------------------ Envy

    /** Envy: the attacker takes your damage back as soul fire, and you steal its buffs. */
    static void envy(ServerPlayer p, LivingEntity attacker, float amount) {
        attacker.hurt(p.damageSources().thorns(p), amount);
        Curses.soulIgnite(attacker, 60);
        int stolen = 0;
        for (MobEffectInstance e : new ArrayList<>(attacker.getActiveEffects())) {
            if (e.getEffect().value().isBeneficial() && !e.isInfiniteDuration()) {
                attacker.removeEffect(e.getEffect());
                p.addEffect(new MobEffectInstance(e));
                stolen++;
            }
        }
        ServerLevel level = p.serverLevel();
        Vec3 from = attacker.position().add(0, attacker.getBbHeight() * 0.5, 0), to = p.position().add(0, 1, 0);
        for (int i = 1; i <= 5; i++) {   // a trail of soul fire back to the attacker
            Vec3 q = to.lerp(from, i / 5.0);
            level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, q.x, q.y, q.z, 1, 0.05, 0.05, 0.05, 0.0);
        }
        if (stolen > 0) {
            Curses.runes(level, to, 6, 0.4);
            Curses.trigger(p, Curse.ENVY, WWSounds.SIN);
        } else {
            Curses.sound(p, WWSounds.SIN, 0.4f, 1.5f);
        }
    }

    // ------------------------------------------------------------------------------------------------ Pride

    private static void pride(ServerPlayer p, Curses.State s) {
        if (!Curses.has(p, Curse.PRIDE)) {
            s.proud = true;
            return;
        }
        boolean above = AboveHalfHealth.holds(p);
        if (s.proud && !above) {   // the protection shatters
            ServerLevel level = p.serverLevel();
            level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.GOLD_BLOCK.defaultBlockState()),
                    p.getX(), p.getY() + 1, p.getZ(), 24, 0.4, 0.6, 0.4, 0.1);
            Curses.sound(p, SoundEvents.SHIELD_BREAK, 0.9f, 0.7f);
            Curses.trigger(p, Curse.PRIDE, WWSounds.SIN);
        } else if (!s.proud && above) {
            Curses.particles(p, ParticleTypes.ENCHANT, 12, 0.5);
        }
        s.proud = above;
    }

    /** Is this entity one the player owns (a pet, a horse)? */
    static boolean ownedBy(Entity e, ServerPlayer p) {
        return e instanceof OwnableEntity o && p.getUUID().equals(o.getOwnerUUID());
    }
}
