package dev.lowpix.winterworks.endmob;

import dev.lowpix.winterworks.registry.EndSounds;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.InstantenousMobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.portal.DimensionTransition;
import net.minecraft.world.phys.Vec3;

/**
 * Recall (docs/END_UPDATE.md section 4), the Potion of Recall's instant effect: a player is sent home to their spawn point
 * (their bed or respawn anchor, which is not used up; else the world spawn), across dimensions. Others are unaffected.
 */
public class RecallEffect extends InstantenousMobEffect {
    public RecallEffect() {
        super(MobEffectCategory.NEUTRAL, 0x9B5BE0);
    }

    @Override
    public boolean applyEffectTick(LivingEntity e, int amplifier) {
        if (e instanceof ServerPlayer p && p.isAlive()) {
            recall(p);
        }
        return true;
    }

    /** Teleports `p` to their respawn point (or the world spawn). Returns where they went. */
    public static Vec3 recall(ServerPlayer p) {
        ServerLevel from = p.serverLevel();
        Vec3 was = p.position();
        DimensionTransition to = p.findRespawnPositionAndUseSpawnBlock(true, DimensionTransition.DO_NOTHING);
        if (p.isPassenger()) {
            p.stopRiding();
        }
        from.sendParticles(ParticleTypes.REVERSE_PORTAL, was.x, was.y + 1, was.z, 40, 0.3, 0.8, 0.3, 0.05);
        from.playSound(null, was.x, was.y, was.z, EndSounds.RECALL, SoundSource.PLAYERS, 1.0f, 1.0f);
        Vec3 at = to.pos();
        p.teleportTo(to.newLevel(), at.x, at.y, at.z, to.yRot(), p.getXRot());
        p.resetFallDistance();
        p.setDeltaMovement(Vec3.ZERO);
        to.newLevel().playSound(null, at.x, at.y, at.z, EndSounds.RECALL, SoundSource.PLAYERS, 1.0f, 1.2f);
        to.newLevel().sendParticles(ParticleTypes.REVERSE_PORTAL, at.x, at.y + 1, at.z, 40, 0.3, 0.8, 0.3, 0.05);
        return at;
    }
}
