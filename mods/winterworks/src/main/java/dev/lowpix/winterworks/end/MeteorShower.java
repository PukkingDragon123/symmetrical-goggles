package dev.lowpix.winterworks.end;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.context.CommandContext;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Falling meteorites now and then (docs/END_UPDATE.md section 16): every player in the outer End (beyond the main island)
 * has a countdown of 10-15 minutes; when it runs out a meteor streaks down onto the outer islands 30-90 blocks from them
 * (FallingMeteorite). In the Dead End, and anywhere in the End during an eclipse, the countdown runs three times as fast.
 * Off the main island only: near it, and in other dimensions, the countdown stands still. Also
 * {@code /winterworks meteor [distance]}: one lands ahead of you (24 blocks, or `distance`).
 */
public final class MeteorShower {
    /** A player's countdown, in ticks: 10 to 15 minutes. */
    public static final int MIN_DELAY = 12000, MAX_DELAY = 18000;
    /** How much faster it runs in the Dead End or during an eclipse. */
    public static final int BOOST = 3;
    /** When no landing site is found, the next try. */
    public static final int RETRY = 200;
    /** How far from the player it lands. */
    public static final int MIN_DISTANCE = 30, MAX_DISTANCE = 90;
    public static final int COMMAND_DISTANCE = 24;

    private static final Map<UUID, Countdown> TIMERS = new HashMap<>();

    private MeteorShower() {}

    public static void init() {
        ServerTickEvents.END_WORLD_TICK.register(level -> {
            if (level.dimension() == Level.END) {
                tick(level);
            }
        });
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> TIMERS.remove(handler.player.getUUID()));
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> registerCommand(dispatcher));
    }

    // ------------------------------------------------------------------------------------------ the schedule

    /** How fast a countdown runs: 0 off the outer End, {@link #BOOST} in the Dead End or during an eclipse, else 1. */
    public static int rate(boolean outerEnd, boolean deadEnd, boolean eclipse) {
        return !outerEnd ? 0 : deadEnd || eclipse ? BOOST : 1;
    }

    /** The rate for `player` where they stand. */
    public static int rate(ServerLevel level, ServerPlayer player) {
        boolean outer = level.dimension() == Level.END && !MeteorImpact.mainIsland(level, player.getX(), player.getZ());
        return rate(outer, outer && level.getBiome(player.blockPosition()).is(EndWorldgen.DEAD_END), outer && Eclipse.isActive(level));
    }

    /** A fresh countdown: 10 to 15 minutes. */
    public static int nextDelay(RandomSource r) {
        return MIN_DELAY + r.nextInt(MAX_DELAY - MIN_DELAY + 1);
    }

    /** One player's countdown to their next meteor. */
    public static final class Countdown {
        private int left;

        public Countdown(RandomSource r) {
            left = nextDelay(r);
        }

        /** Runs `rate` ticks down; true when a meteor is due (the countdown starts again). */
        public boolean tick(int rate, RandomSource r) {
            if (rate <= 0) {
                return false;
            }
            left -= rate;
            if (left > 0) {
                return false;
            }
            left = nextDelay(r);
            return true;
        }

        /** No meteor could land this time: try again in `ticks` (of countdown). */
        public void retry(int ticks) {
            left = ticks;
        }

        public int left() {
            return left;
        }
    }

    private static void tick(ServerLevel level) {
        for (ServerPlayer p : level.players()) {
            if (p.isSpectator()) {
                continue;
            }
            Countdown c = TIMERS.computeIfAbsent(p.getUUID(), u -> new Countdown(level.random));
            if (c.tick(rate(level, p), level.random) && dropNear(level, p.position(), level.random) == null) {
                c.retry(RETRY);
            }
        }
    }

    // ------------------------------------------------------------------------------------------ dropping one

    /** A meteor onto the outer islands 30-90 blocks from `around`, or null if there's no ground to hit there. */
    @Nullable
    public static FallingMeteorite dropNear(ServerLevel level, Vec3 around, RandomSource r) {
        BlockPos site = site(level, around, r);
        if (site == null) {
            return null;
        }
        Vec3 target = Vec3.atBottomCenterOf(site);
        return FallingMeteorite.launch(level, FallingMeteorite.skyStart(target, around, r), target, r.nextLong());
    }

    /** Somewhere to land 30-90 blocks from `around`: loaded, solid ground, open sky, not safe ground. The air block over it. */
    @Nullable
    public static BlockPos site(ServerLevel level, Vec3 around, RandomSource r) {
        for (int i = 0; i < 24; i++) {
            double a = r.nextDouble() * Math.PI * 2, d = MIN_DISTANCE + r.nextDouble() * (MAX_DISTANCE - MIN_DISTANCE);
            int x = (int) Math.floor(around.x + Math.cos(a) * d), z = (int) Math.floor(around.z + Math.sin(a) * d);
            if (!level.hasChunkAt(new BlockPos(x, 0, z))) {
                continue;
            }
            int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
            BlockPos at = new BlockPos(x, y, z);
            if (y <= level.getMinBuildHeight() + 1 || !level.getBlockState(at.below()).isSolid() || MeteorImpact.safe(level, at.below())) {
                continue;
            }
            return at;
        }
        return null;
    }

    /** `/winterworks meteor`: one lands `distance` blocks ahead of the player, falling in front of them. */
    @Nullable
    public static FallingMeteorite dropAhead(ServerLevel level, Vec3 eye, float yaw, int distance, RandomSource r) {
        Vec3 ahead = Vec3.directionFromRotation(0, yaw);
        int x = (int) Math.floor(eye.x + ahead.x * distance), z = (int) Math.floor(eye.z + ahead.z * distance);
        int ground = EndWorldFeature.groundNear(level, x, z, eye.y);
        if (ground <= level.getMinBuildHeight() || level.getBlockState(new BlockPos(x, ground, z)).isAir()) {
            return null;
        }
        Vec3 target = new Vec3(x + 0.5, ground + 1, z + 0.5);
        Vec3 side = new Vec3(-ahead.z, 0, ahead.x).scale(r.nextBoolean() ? 1 : -1);
        Vec3 from = target.add(ahead.scale(35)).add(side.scale(30 + r.nextDouble() * 15)).add(0, 100 + r.nextDouble() * 20, 0);
        return FallingMeteorite.launch(level, from, target, r.nextLong());
    }

    private static void registerCommand(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("winterworks").requires(s -> s.hasPermission(2))
                .then(Commands.literal("meteor")
                        .executes(ctx -> meteor(ctx, COMMAND_DISTANCE))
                        .then(Commands.argument("distance", IntegerArgumentType.integer(4, 128))
                                .executes(ctx -> meteor(ctx, IntegerArgumentType.getInteger(ctx, "distance"))))));
    }

    private static int meteor(CommandContext<CommandSourceStack> ctx, int distance) {
        CommandSourceStack src = ctx.getSource();
        FallingMeteorite m = dropAhead(src.getLevel(), src.getPosition().add(0, src.getEntity() == null ? 0 : src.getEntity().getEyeHeight(), 0),
                src.getRotation().y, distance, src.getLevel().getRandom());
        if (m == null) {
            src.sendFailure(Component.translatable("commands.winterworks.meteor.no_ground"));
            return 0;
        }
        src.sendSuccess(() -> Component.translatable("commands.winterworks.meteor.success", distance), true);
        return 1;
    }
}
