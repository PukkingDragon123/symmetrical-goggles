package dev.lowpix.winterworks.curse;

import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.level.block.Blocks;

/** The hidden curses (docs/HEXES_UPDATE.md 5): not named anywhere until they first trigger. */
public final class HiddenCurses {
    public static final float LEECH_CHANCE = 0.2f;
    public static final int CAIN_RANGE = 8, JUDAS_RANGE = 32, STONE_TICKS = 80, FLEE_TICKS = 60;

    private HiddenCurses() {}

    /** Leech: one hit in five heals the target instead (ALLOW_DAMAGE; false cancels the hit). */
    static boolean allowDamage(LivingEntity victim, DamageSource src, float amount) {
        if (amount <= 0 || !(src.getEntity() instanceof ServerPlayer p) || victim == p || !Curses.has(p, Curse.LEECH)
                || !Curses.roll(p, LEECH_CHANCE)) {
            return true;
        }
        victim.heal(amount);
        Curses.particles(victim, ParticleTypes.HEART, 3, 0.1);
        Curses.particles(victim, ParticleTypes.DAMAGE_INDICATOR, 4, 0.1);
        if (victim.level() instanceof ServerLevel level) {
            Curses.runes(level, victim.position().add(0, victim.getBbHeight() * 0.6, 0), 4, 0.3);
        }
        Curses.sound(victim, SoundEvents.GENERIC_DRINK, 0.8f, 0.6f);
        Curses.trigger(p, Curse.LEECH, WWSounds.TRIGGER);
        return false;
    }

    /** Cain: your hits wound your own pets near you, as hard as the hit. */
    static void onDealt(ServerPlayer p, LivingEntity victim, DamageSource src, float amount) {
        if (amount <= 0 || src.is(Curses.CAIN_DAMAGE) || !Curses.has(p, Curse.CAIN)) {
            return;
        }
        ServerLevel level = p.serverLevel();
        boolean hurt = false;
        for (LivingEntity pet : level.getEntitiesOfClass(LivingEntity.class, p.getBoundingBox().inflate(CAIN_RANGE),
                e -> e != victim && e.isAlive() && Sins.ownedBy(e, p))) {
            if (pet.hurt(Curses.damage(level, Curses.CAIN_DAMAGE, p), Math.max(1f, amount))) {
                hurt = true;
                Curses.particles(pet, ParticleTypes.DAMAGE_INDICATOR, 4, 0.1);
                Curses.runes(level, pet.position().add(0, pet.getBbHeight() + 0.2, 0), 3, 0.25);
            }
        }
        if (hurt) {
            Curses.trigger(p, Curse.CAIN, WWSounds.TRIGGER);
        }
    }

    /** Judas: every trade makes the nearest iron golem turn on you. */
    public static void onTrade(ServerPlayer p, Entity merchant) {
        if (!Curses.has(p, Curse.JUDAS)) {
            return;
        }
        IronGolem golem = null;
        double best = Double.MAX_VALUE;
        for (IronGolem g : p.level().getEntitiesOfClass(IronGolem.class, p.getBoundingBox().inflate(JUDAS_RANGE), Entity::isAlive)) {
            double d = g.distanceToSqr(p);
            if (d < best) {
                best = d;
                golem = g;
            }
        }
        Curses.runes(p.serverLevel(), merchant.position().add(0, merchant.getBbHeight() + 0.3, 0), 4, 0.3);
        if (golem == null) {
            Curses.sound(p, WWSounds.TRIGGER, 0.4f, 0.7f);
            return;
        }
        golem.setPersistentAngerTarget(p.getUUID());
        golem.startPersistentAngerTimer();
        golem.setTarget(p);
        Curses.particles(golem, ParticleTypes.ANGRY_VILLAGER, 4, 0);
        Curses.sound(golem, SoundEvents.IRON_GOLEM_ATTACK, 1f, 0.6f);
        Curses.trigger(p, Curse.JUDAS, WWSounds.TRIGGER);
    }

    /** Lot's Wife: turning round while fleeing (hurt in the last 3 s) turns you to stone for 4 s. */
    static void onTurn(ServerPlayer p, Curses.State s, long now) {
        if (!Curses.has(p, Curse.LOTS_WIFE) || now < s.stoneReady || now - s.lastHurt > FLEE_TICKS) {
            return;
        }
        petrify(p, s, now);
    }

    static void petrify(ServerPlayer p, Curses.State s, long now) {
        s.stoneReady = now + STONE_TICKS + 60;
        Curses.freeze(p, STONE_TICKS);
        Curses.send(p, CurseFxPayload.STONE, STONE_TICKS, 0, 0, 0);
        ServerLevel level = p.serverLevel();
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.CALCITE.defaultBlockState()),
                p.getX(), p.getY() + 1, p.getZ(), 40, 0.35, 0.8, 0.35, 0.05);
        Curses.sound(p, SoundEvents.STONE_PLACE, 1f, 0.5f);
        Curses.sound(p, SoundEvents.BASALT_PLACE, 1f, 0.6f);
        Curses.trigger(p, Curse.LOTS_WIFE, WWSounds.TRIGGER);
    }
}
