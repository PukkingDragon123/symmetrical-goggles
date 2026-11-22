package dev.lowpix.winterworks.endboss;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import dev.lowpix.winterworks.end.Eclipse;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;

/**
 * The bosses of the Living End (docs/END_UPDATE.md sections 5, 10, 11): the eclipse's tick, sync and command; the
 * Ender Dragon rework lives in DragonRework (run from mixin.endboss.EnderDragonMixin), the Monolith in Monolith.
 */
public final class EndBossFeature {
    private EndBossFeature() {}

    public static void init() {
        PayloadTypeRegistry.playS2C().register(EclipsePayload.TYPE, EclipsePayload.CODEC);
        ServerTickEvents.END_WORLD_TICK.register(level -> {
            if (level.dimension() == Level.END) {
                EclipseState s = EclipseState.get(level);
                if (s != null) {
                    s.tick(level);
                }
            }
        });
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> sendTo(handler.getPlayer()));
        ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, from, to) -> sendTo(player));
        ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> sendTo(newPlayer));
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> registerCommands(dispatcher));
    }

    private static void sendTo(ServerPlayer player) {
        EclipseState s = EclipseState.get(player.serverLevel());
        if (s != null) {
            s.send(player);
        }
    }

    /** `/winterworks eclipse start [seconds]` (default 300, fades included) and `/winterworks eclipse stop`. */
    private static void registerCommands(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("winterworks").requires(s -> s.hasPermission(2))
                .then(Commands.literal("eclipse").requires(s -> s.hasPermission(2))
                        .then(Commands.literal("start")
                                .executes(ctx -> start(ctx.getSource(), EclipseState.DEFAULT_TICKS / 20))
                                .then(Commands.argument("seconds", IntegerArgumentType.integer(1, 86400))
                                        .executes(ctx -> start(ctx.getSource(), IntegerArgumentType.getInteger(ctx, "seconds")))))
                        .then(Commands.literal("stop").executes(ctx -> {
                            Eclipse.stop(ctx.getSource().getLevel());
                            ctx.getSource().sendSuccess(() -> Component.translatable("commands.winterworks.eclipse.stop"), true);
                            return 1;
                        }))));
    }

    private static int start(CommandSourceStack src, int seconds) {
        ServerLevel end = src.getServer().getLevel(Level.END);
        if (end == null) {
            src.sendFailure(Component.translatable("commands.winterworks.eclipse.no_end"));
            return 0;
        }
        Eclipse.start(src.getLevel(), seconds * 20);
        src.sendSuccess(() -> Component.translatable("commands.winterworks.eclipse.start", seconds), true);
        return 1;
    }
}
