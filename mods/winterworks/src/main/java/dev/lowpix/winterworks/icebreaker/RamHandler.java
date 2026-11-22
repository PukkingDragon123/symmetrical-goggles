package dev.lowpix.winterworks.icebreaker;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Potion of Ramming: sprint for 3 seconds to charge up, then ram. While the ram lasts, anything in front of you takes
 * damage and huge knockback, and blocks that TNT could break (blast resistance up to {@link #MAX_RESISTANCE}) are broken
 * in a straight line at feet and head height.
 *
 * Limits: at most {@link #BLOCKS_PER_TICK} blocks a tick and {@link #BLOCKS_PER_RAM} per ram, no block entities, no
 * unbreakable or wither-immune blocks, never in adventure/spectator mode, never inside spawn protection or where
 * another mod's block-break event says no (land claims), and only with the mobGriefing-independent player rules.
 *
 * <p><b>Top speed</b> (docs/FIXES_0_4.md): the moment the ram starts you hit top speed: a battle cry and a rush of
 * wind, a burst of snow and wind, and a further speed boost ({@link #TOP_SPEED_BOOST}, the attribute modifier
 * {@link #TOP_SPEED_ID}) for as long as the ram lasts. The modifier is synced to every client like any attribute, so
 * the client uses it for the speed lines and the running pose (client.cold.RamClient).
 */
public final class RamHandler {
    public static final int CHARGE_TICKS = 60;
    public static final int RAM_TICKS = 70;
    public static final float MAX_RESISTANCE = 6.0f;
    public static final int BLOCKS_PER_TICK = 2;
    public static final int BLOCKS_PER_RAM = 24;
    /** Top speed: movement speed +45% (of the base) while ramming, on top of sprinting. */
    public static final double TOP_SPEED_BOOST = 0.45;
    public static final ResourceLocation TOP_SPEED_ID = Winterworks.id("ramming_top_speed");
    private static final AttributeModifier TOP_SPEED = new AttributeModifier(TOP_SPEED_ID, TOP_SPEED_BOOST,
            AttributeModifier.Operation.ADD_MULTIPLIED_BASE);

    private static final Map<UUID, State> STATES = new HashMap<>();

    private RamHandler() {}

    private static final class State {
        int sprint;
        int ram;
        int blocks;
        int cooldown;
        final Set<Integer> hit = new HashSet<>();
    }

    public static void init() {
        ServerTickEvents.END_SERVER_TICK.register(RamHandler::tick);
    }

    /** 0..1 charge for the HUD/particles; 1 while ramming. */
    public static float charge(ServerPlayer p) {
        State s = STATES.get(p.getUUID());
        return s == null ? 0f : s.ram > 0 ? 1f : Math.min(1f, s.sprint / (float) CHARGE_TICKS);
    }

    /** At ramming top speed (the further speed boost is on). Works on either side: the modifier is synced. */
    public static boolean atTopSpeed(LivingEntity e) {
        AttributeInstance speed = e.getAttribute(Attributes.MOVEMENT_SPEED);
        return speed != null && speed.hasModifier(TOP_SPEED_ID);
    }

    private static void setTopSpeed(ServerPlayer p, boolean on) {
        AttributeInstance speed = p.getAttribute(Attributes.MOVEMENT_SPEED);
        if (speed == null || speed.hasModifier(TOP_SPEED_ID) == on) {
            return;
        }
        if (on) {
            speed.addTransientModifier(TOP_SPEED);
        } else {
            speed.removeModifier(TOP_SPEED_ID);
        }
    }

    /** Top speed reached: the battle cry, the wind, a burst of snow and wind, and the boost. */
    private static void topSpeed(ServerPlayer p, ServerLevel level) {
        setTopSpeed(p, true);
        level.playSound(null, p.getX(), p.getY(), p.getZ(), WWSounds.RAMMING_CRY, SoundSource.PLAYERS, 1.4f,
                0.95f + level.random.nextFloat() * 0.1f);
        level.playSound(null, p.getX(), p.getY(), p.getZ(), WWSounds.RAMMING_WIND, SoundSource.PLAYERS, 1.2f, 1.0f);
        Vec3 look = p.getLookAngle();
        Vec3 dir = new Vec3(look.x, 0, look.z).normalize();
        level.sendParticles(ParticleTypes.SNOWFLAKE, p.getX(), p.getY() + 1, p.getZ(), 40, 0.6, 0.7, 0.6, 0.25);
        level.sendParticles(WWParticles.BLIZZARD_FLAKE, p.getX(), p.getY() + 0.9, p.getZ(), 30, 0.9, 0.6, 0.9, 0.08);
        level.sendParticles(WWParticles.SNOW_PUFF, p.getX(), p.getY() + 0.1, p.getZ(), 10, 0.5, 0.05, 0.5, 0.08);
        for (int i = 0; i < 12; i++) {   // wind: puffs streaming back past you
            double a = i * Mth.TWO_PI / 12, side = Math.cos(a) * 0.7, up = 0.4 + Math.sin(a) * 0.6 + 0.6;
            level.sendParticles(ParticleTypes.CLOUD, p.getX() - dir.z * side + dir.x * 0.6, p.getY() + up, p.getZ() + dir.x * side + dir.z * 0.6,
                    0, -dir.x, 0.02, -dir.z, 0.35);
        }
    }

    private static void tick(MinecraftServer server) {
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            MobEffectInstance eff = p.getEffect(WWEffects.RAMMING);
            if (eff == null || p.isSpectator()) {
                STATES.remove(p.getUUID());
                setTopSpeed(p, false);
                continue;
            }
            State s = STATES.computeIfAbsent(p.getUUID(), u -> new State());
            ServerLevel level = p.serverLevel();
            if (s.cooldown > 0) {
                s.cooldown--;
            }
            boolean sprinting = p.isSprinting() && !p.isPassenger() && !p.isFallFlying() && !p.isSwimming();
            if (s.ram > 0) {
                if (!sprinting) {
                    endRam(p, s);
                    continue;
                }
                s.ram--;
                ramTick(p, level, s, eff.getAmplifier());
                if (s.ram > 0 && s.ram % 25 == 0) {   // the wind keeps roaring past at top speed
                    level.playSound(null, p.getX(), p.getY(), p.getZ(), WWSounds.RAMMING_WIND, SoundSource.PLAYERS, 0.6f,
                            1.1f + level.random.nextFloat() * 0.15f);
                }
                if (s.ram == 0) {
                    endRam(p, s);
                }
                continue;
            }
            setTopSpeed(p, false);
            if (sprinting && s.cooldown == 0) {
                s.sprint++;
                if (s.sprint % 5 == 0) {
                    level.sendParticles(ParticleTypes.CLOUD, p.getX(), p.getY() + 0.2, p.getZ(), 2 + s.sprint / 15, 0.3, 0.1, 0.3, 0.02);
                }
                if (s.sprint >= CHARGE_TICKS) {
                    s.ram = RAM_TICKS;
                    s.blocks = 0;
                    s.hit.clear();
                    level.playSound(null, p.blockPosition(), WWSounds.RAM_CHARGED, SoundSource.PLAYERS, 1.2f, 1.0f);
                    topSpeed(p, level);
                }
            } else {
                s.sprint = Math.max(0, s.sprint - 3);
            }
        }
        STATES.keySet().removeIf(id -> server.getPlayerList().getPlayer(id) == null);
    }

    private static void endRam(ServerPlayer p, State s) {
        s.ram = 0;
        s.sprint = 0;
        s.cooldown = 40;
        setTopSpeed(p, false);
    }

    private static void ramTick(ServerPlayer p, ServerLevel level, State s, int amp) {
        Vec3 look = p.getLookAngle();
        Vec3 dir = new Vec3(look.x, 0, look.z).normalize();
        level.sendParticles(ParticleTypes.SNOWFLAKE, p.getX() + dir.x * 0.8, p.getY() + 1.0, p.getZ() + dir.z * 0.8, 4, 0.3, 0.4, 0.3, 0.05);
        // mobs and players in front
        AABB box = p.getBoundingBox().move(dir.scale(0.9)).inflate(0.45, 0.1, 0.45);
        for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, box, e -> e != p && e.isAlive() && !s.hit.contains(e.getId())
                && !p.isAlliedTo(e) && e.isPickable())) {
            s.hit.add(e.getId());
            e.hurt(level.damageSources().playerAttack(p), 6.0f + 3.0f * amp);
            e.knockback(2.6 + amp, -dir.x, -dir.z);
            e.push(0, 0.6, 0);
            e.hurtMarked = true;
            level.playSound(null, e.blockPosition(), WWSounds.RAM_IMPACT, SoundSource.PLAYERS, 1.4f, 0.9f);
            level.sendParticles(ParticleTypes.EXPLOSION, e.getX(), e.getY() + e.getBbHeight() / 2, e.getZ(), 1, 0, 0, 0, 0);
        }
        // blocks in a straight line
        if (!p.mayBuild() || s.blocks >= BLOCKS_PER_RAM) {
            return;
        }
        int broken = 0;
        BlockPos feet = BlockPos.containing(p.getX() + dir.x * 0.9, p.getY() + 0.2, p.getZ() + dir.z * 0.9);
        for (BlockPos pos : new BlockPos[]{feet, feet.above()}) {
            if (broken >= BLOCKS_PER_TICK || s.blocks >= BLOCKS_PER_RAM) {
                break;
            }
            BlockState st = level.getBlockState(pos);
            if (canRamBreak(level, p, pos, st)) {
                level.destroyBlock(pos, true, p);
                broken++;
                s.blocks++;
            }
        }
        if (broken > 0) {
            level.playSound(null, feet, WWSounds.RAM_IMPACT, SoundSource.PLAYERS, 1.0f, 1.3f);
        }
    }

    private static boolean canRamBreak(ServerLevel level, ServerPlayer p, BlockPos pos, BlockState st) {
        if (st.isAir() || !st.getFluidState().isEmpty() || st.hasBlockEntity()) {
            return false;
        }
        float hardness = st.getDestroySpeed(level, pos);
        if (hardness < 0 || st.getBlock().getExplosionResistance() > MAX_RESISTANCE || st.is(BlockTags.WITHER_IMMUNE)
                || st.is(BlockTags.DRAGON_IMMUNE)) {
            return false;
        }
        if (!level.mayInteract(p, pos) || p.blockActionRestricted(level, pos, p.gameMode.getGameModeForPlayer())) {
            return false;
        }
        return PlayerBlockBreakEvents.BEFORE.invoker().beforeBlockBreak(level, p, pos, st, null);
    }
}
