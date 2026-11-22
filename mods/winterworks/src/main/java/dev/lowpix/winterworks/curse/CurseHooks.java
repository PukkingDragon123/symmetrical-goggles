package dev.lowpix.winterworks.curse;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;

/** Where the curse mixins (mixin.Curse*Mixin) call in. Everything is server-side and cheap for the uncursed. */
public final class CurseHooks {
    private CurseHooks() {}

    /** LivingEntity.hurt HEAD: scale the incoming damage. */
    public static float incomingDamage(LivingEntity victim, DamageSource source, float amount) {
        return Sins.incoming(victim, source, amount);
    }

    /** LivingEntity.hurt returned true: the damage went through (kills included). */
    public static void afterHurt(LivingEntity victim, DamageSource source, float amount) {
        if (victim.level().isClientSide) {
            return;
        }
        if (victim instanceof ServerPlayer p) {
            if (!source.is(Curses.NARCISSUS_DAMAGE) && amount > 0) {
                Curses.state(p).lastHurt = p.level().getGameTime();
            }
            LesserCurses.onHurt(p, source);
            Sins.onHurt(p, source, amount);
        }
        if (source.getEntity() instanceof ServerPlayer attacker && attacker != victim) {
            Sins.onDealt(attacker, victim, source, amount);
            HiddenCurses.onDealt(attacker, victim, source, amount);
        }
    }
}
