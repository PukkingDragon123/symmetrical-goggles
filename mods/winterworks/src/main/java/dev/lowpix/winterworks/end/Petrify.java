package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.mixin.endgear.EndGearMobAccessor;
import dev.lowpix.winterworks.registry.EndEffects;
import dev.lowpix.winterworks.registry.EndParticles;
import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.protocol.game.ClientboundRemoveMobEffectPacket;
import net.minecraft.network.protocol.game.ClientboundUpdateMobEffectPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.TagKey;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * Petrification: an entity encased in obsidian (docs/END_UPDATE.md section 11), the effect {@code winterworks:petrified}
 * (endgear.PetrifiedEffect). Amplifier 0 is the wand's invulnerable shell, 1 the Monolith's vulnerable one.
 *
 * <p>Frozen entities don't move, turn, act or think (no AI, no input; see mixin.endgear), can't be pushed, and with an
 * invulnerable shell take no damage but /kill and the void. Bosses ({@link #IMMUNE}) can't be petrified. The effect is
 * sent to every client tracking the entity, so the shell (client.endgear.PetrifyShell) shows round mobs and other
 * players too; it shatters into obsidian_crack particles when the effect ends.
 */
public final class Petrify {
    /** Bosses: the Ender Dragon, the Wither, the Warden, the Monolith, the Frost Mauler. */
    public static final TagKey<EntityType<?>> IMMUNE = TagKey.create(Registries.ENTITY_TYPE, Winterworks.id("petrify_immune"));

    private Petrify() {}

    /** Encases `entity` for `ticks`. Invulnerable (the wand) or not (the Monolith's stare). Server side; bosses are immune. */
    public static void freeze(LivingEntity entity, int ticks, boolean invulnerable) {
        if (entity.level().isClientSide || ticks <= 0 || !entity.isAlive() || isImmune(entity)) {
            return;
        }
        MobEffectInstance cur = entity.getEffect(EndEffects.PETRIFIED);
        if (cur != null && !cur.endsWithin(ticks - 1) && (cur.getAmplifier() == 0 || !invulnerable)) {
            return;   // already encased for at least as long, in a shell at least as hard
        }
        boolean keepHard = cur != null && cur.getAmplifier() == 0 && !cur.endsWithin(0);
        int amplifier = invulnerable || keepHard ? 0 : 1;
        entity.forceAddEffect(new MobEffectInstance(EndEffects.PETRIFIED, ticks, amplifier, false, false, true), null);
    }

    public static boolean isFrozen(Entity entity) {
        if (!(entity instanceof LivingEntity living)) {
            return false;
        }
        MobEffectInstance e = living.getEffect(EndEffects.PETRIFIED);
        return e != null && !e.endsWithin(0);
    }

    /** Frozen in the wand's invulnerable shell (amplifier 0). */
    public static boolean isInvulnerable(Entity entity) {
        return isFrozen(entity) && ((LivingEntity) entity).getEffect(EndEffects.PETRIFIED).getAmplifier() == 0;
    }

    public static boolean isImmune(Entity entity) {
        return entity.getType().is(IMMUNE);
    }

    // ------------------------------------------------------------------------------------------------ effect hooks

    /** The effect was just applied (server): stop everything, encase, and tell the trackers. */
    public static void onEncased(LivingEntity entity, MobEffectInstance effect) {
        Vec3 v = entity.getDeltaMovement();
        entity.setDeltaMovement(0, Math.min(0, v.y), 0);
        entity.hurtMarked = true;
        entity.stopUsingItem();
        if (entity instanceof Player p && p.isFallFlying()) {
            p.stopFallFlying();
        }
        if (entity instanceof Mob mob) {
            mob.getNavigation().stop();
            mob.setJumping(false);
            mob.setZza(0);
            mob.setXxa(0);
            mob.setYya(0);
            EndGearMobAccessor acc = (EndGearMobAccessor) mob;
            acc.ww$goalSelector().getAvailableGoals().stream().filter(WrappedGoal::isRunning).forEach(WrappedGoal::stop);
            acc.ww$targetSelector().getAvailableGoals().stream().filter(WrappedGoal::isRunning).forEach(WrappedGoal::stop);
        }
        if (entity.level() instanceof ServerLevel level) {
            level.playSound(null, entity.getX(), entity.getY(), entity.getZ(), EndSounds.PETRIFY_ENCASE, SoundSource.NEUTRAL, 1.0f,
                    0.9f + entity.getRandom().nextFloat() * 0.2f);
            burst(level, entity, 10, false);
            sync(entity, effect);
        }
    }

    /** The effect changed (re-encased, longer or harder): tell the trackers. */
    public static void onUpdated(LivingEntity entity, MobEffectInstance effect) {
        if (!entity.level().isClientSide) {
            sync(entity, effect);
        }
    }

    /** The effect ended (server): the shell shatters. */
    public static void onShattered(LivingEntity entity) {
        if (!(entity.level() instanceof ServerLevel level)) {
            return;
        }
        level.getChunkSource().broadcast(entity, new ClientboundRemoveMobEffectPacket(entity.getId(), EndEffects.PETRIFIED));
        level.playSound(null, entity.getX(), entity.getY(), entity.getZ(), EndSounds.PETRIFY_SHATTER, SoundSource.NEUTRAL, 1.0f,
                0.9f + entity.getRandom().nextFloat() * 0.2f);
        burst(level, entity, 26 + (int) (entity.getBbWidth() * entity.getBbHeight() * 10), true);
    }

    /** A player started tracking a frozen entity: send them the shell. */
    public static void onStartTracking(Entity entity, ServerPlayer player) {
        if (entity != player && entity instanceof LivingEntity living && isFrozen(living)) {
            player.connection.send(new ClientboundUpdateMobEffectPacket(entity.getId(), living.getEffect(EndEffects.PETRIFIED), false));
        }
    }

    private static void sync(LivingEntity entity, MobEffectInstance effect) {
        ((ServerLevel) entity.level()).getChunkSource().broadcast(entity, new ClientboundUpdateMobEffectPacket(entity.getId(), effect, false));
    }

    /** Obsidian chips flying off the shell: a few as it forms, a burst when it shatters. */
    private static void burst(ServerLevel level, LivingEntity e, int count, boolean shatter) {
        double w = e.getBbWidth() * 0.5 + 0.1, h = e.getBbHeight();
        level.sendParticles(EndParticles.OBSIDIAN_CRACK, e.getX(), e.getY() + h * 0.5, e.getZ(), count, w, h * 0.4, w,
                shatter ? 0.18 : 0.04);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.OBSIDIAN.defaultBlockState()), e.getX(),
                e.getY() + h * 0.5, e.getZ(), shatter ? count : count / 2, w, h * 0.4, w, 0.1);
        if (shatter) {
            level.sendParticles(ParticleTypes.REVERSE_PORTAL, e.getX(), e.getY() + h * 0.5, e.getZ(), count / 2, w, h * 0.4, w, 0.05);
        }
    }
}
