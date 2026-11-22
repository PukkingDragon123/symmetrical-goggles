package dev.lowpix.winterworks.curse;

import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;

/**
 * Every lesser, sin and hidden curse (docs/HEXES_UPDATE.md 3-5). Server-authoritative: one equipment scan per player
 * per tick (curses are counted only on equipped items, each in its enchantment's slots), and the rest only runs for
 * players who bear something. The enchantments themselves are data (tools/data_curses.py).
 */
public final class CurseFeature {
    /** Turning round: this many degrees of yaw within half a second. */
    public static final float TURN_DEGREES = 135f;

    private static final List<ServerPlayer> LUST = new ArrayList<>();

    private CurseFeature() {}

    public static void init() {
        AboveHalfHealth.init();
        Curses.SEEN.identifier();   // registers the attachment now, before any player loads
        PayloadTypeRegistry.playS2C().register(CurseFxPayload.TYPE, CurseFxPayload.CODEC);

        ServerTickEvents.START_SERVER_TICK.register(server -> LUST.clear());
        ServerTickEvents.END_WORLD_TICK.register(CurseFeature::tickLevel);
        ServerTickEvents.END_SERVER_TICK.register(server -> LustSpawns.refresh(LUST));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            LesserCurses.clear();
            LUST.clear();
            LustSpawns.refresh(LUST);
        });

        ServerLivingEntityEvents.ALLOW_DAMAGE.register(HiddenCurses::allowDamage);
        ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> Curses.send(newPlayer, CurseFxPayload.RELEASE, 0, 0, 0, 0));

        PlayerBlockBreakEvents.BEFORE.register((world, player, pos, state, be) ->
                !(player instanceof ServerPlayer p) || LesserCurses.beforeBreak(world, p, pos, state));
        PlayerBlockBreakEvents.AFTER.register((world, player, pos, state, be) -> {
            if (player instanceof ServerPlayer p) {
                LesserCurses.afterBreak(world, p, pos, state, be);
                Sins.afterBreak(world, p, pos, state);
            }
        });
    }

    private static void tickLevel(ServerLevel level) {
        long now = level.getGameTime();
        for (ServerPlayer p : level.players()) {
            tickPlayer(p, now);
        }
        Curses.tickSoulFire(level);
        LesserCurses.tickLevel(level);
    }

    static void tickPlayer(ServerPlayer p, long now) {
        Curses.State s = Curses.state(p);
        Curses.tickFrozen(p, s, now);
        Curses.level(p, Curse.MIDAS);   // refresh this tick's curse levels
        boolean any = false;
        for (int l : s.levels) {
            if (l > 0) {
                any = true;
                break;
            }
        }
        turning(p, s, now, any);
        if (!any && !s.transfixed) {
            s.stare = 0;
            s.wrathWasActive = false;
            s.proud = true;
            return;
        }
        LesserCurses.tick(p, s, now);
        Sins.tick(p, s, now, LUST);
    }

    /** Remember the last half second of yaw; a sharp turn round wakes Orpheus and Lot's Wife. */
    private static void turning(ServerPlayer p, Curses.State s, long now, boolean any) {
        float yaw = p.getYRot();
        if (s.yawAt < 0 || !any) {
            java.util.Arrays.fill(s.yaw, yaw);
            s.yawAt = 0;
            return;
        }
        int n = s.yaw.length;
        float oldest = s.yaw[(s.yawAt + 1) % n];
        s.yawAt = (s.yawAt + 1) % n;
        s.yaw[s.yawAt] = yaw;
        if (Math.abs(Mth.wrapDegrees(yaw - oldest)) >= TURN_DEGREES && s.frozenUntil == 0) {
            java.util.Arrays.fill(s.yaw, yaw);   // one turn, one trigger
            LesserCurses.onTurn(p, s, now);
            HiddenCurses.onTurn(p, s, now);
        }
    }
}
