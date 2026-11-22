package dev.lowpix.winterworks.boss;

import com.mojang.brigadier.CommandDispatcher;
import dev.lowpix.winterworks.net.CameraShakePayload;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWParticles;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** The Frost Mauler, its frozen tomb, ancient ice, icicles and the skull revival (docs/COLD_UPDATE.md 6-8). */
public final class BossFeature {
    private BossFeature() {}

    public static void init() {
        PayloadTypeRegistry.playS2C().register(CameraShakePayload.TYPE, CameraShakePayload.CODEC);
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> registerCommands(dispatcher));
    }

    /** `/winterworks tomb`: builds a frozen tomb (with a dormant Frost Mauler) in front of you. For testing and screenshots. */
    private static void registerCommands(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("winterworks").requires(s -> s.hasPermission(2))
                .then(Commands.literal("tomb").requires(s -> s.hasPermission(2)).executes(ctx -> {
                    CommandSourceStack src = ctx.getSource();
                    ServerLevel level = src.getLevel();
                    Vec3 at = src.getPosition();
                    float yaw = src.getRotation().y;
                    Vec3 ahead = Vec3.directionFromRotation(0, yaw).scale(FrozenTomb.RADIUS + 4);
                    BlockPos centre = BlockPos.containing(at.x + ahead.x, at.y, at.z + ahead.z);
                    FrozenTomb.build(level, centre, level.getRandom());
                    src.sendSuccess(() -> Component.translatable("message.winterworks.tomb.built", centre.getX(), centre.getY(),
                            centre.getZ()), true);
                    return 1;
                })));
    }

    /** Shakes the camera of every player within `radius`, weaker with distance. */
    public static void shake(ServerLevel level, Vec3 at, double radius, float strength, int ticks) {
        for (ServerPlayer p : level.players()) {
            double d = p.position().distanceTo(at);
            if (d > radius || !ServerPlayNetworking.canSend(p, CameraShakePayload.TYPE)) {
                continue;
            }
            float k = (float) (1.0 - 0.6 * d / radius);
            ServerPlayNetworking.send(p, new CameraShakePayload(strength * k, ticks));
        }
    }

    /** Frostbite for `seconds` at `amplifier` to every living thing within `radius` (except `except`), keeping a longer one. */
    public static void frostbiteBurst(ServerLevel level, Vec3 at, double radius, int seconds, int amplifier, @Nullable LivingEntity except) {
        AABB box = new AABB(at, at).inflate(radius);
        for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, box, e -> e.isAlive() && e != except
                && e.distanceToSqr(at) <= radius * radius && !(e instanceof Player p && (p.isSpectator() || p.getAbilities().instabuild)))) {
            frostbite(e, seconds * 20, amplifier);
        }
    }

    /** Adds (or refreshes) Frostbite without shortening a longer or stronger one. */
    public static void frostbite(LivingEntity e, int ticks, int amplifier) {
        MobEffectInstance cur = e.getEffect(WWEffects.FROSTBITE);
        if (cur == null || cur.getAmplifier() < amplifier || (cur.getAmplifier() == amplifier && cur.getDuration() < ticks)) {
            e.addEffect(new MobEffectInstance(WWEffects.FROSTBITE, ticks, amplifier));
        }
    }

    /** A burst of ice shards and a frost ring (`size` blocks across) at a point. */
    public static void iceBurstFx(ServerLevel level, Vec3 at, float size, int shards) {
        level.sendParticles(WWParticles.FROST_BURST, at.x, at.y, at.z, 0, size, 0, 0, 1.0);
        level.sendParticles(WWParticles.ICE_SHARD, at.x, at.y, at.z, shards, size * 0.12, size * 0.08, size * 0.12, 0.25);
        level.sendParticles(WWParticles.SNOW_PUFF, at.x, at.y, at.z, Math.max(2, shards / 6), size * 0.1, 0.1, size * 0.1, 0.05);
    }

    /** A ring of particles flying outward on the ground (count 0 sends each particle's exact velocity). */
    public static void groundRing(ServerLevel level, net.minecraft.core.particles.ParticleOptions type, Vec3 at, int n, double speed) {
        for (int i = 0; i < n; i++) {
            float a = i * Mth.TWO_PI / n;
            level.sendParticles(type, at.x + Mth.cos(a) * 0.8, at.y + 0.15, at.z + Mth.sin(a) * 0.8, 0, Mth.cos(a), 0.05,
                    Mth.sin(a), speed);
        }
    }
}
