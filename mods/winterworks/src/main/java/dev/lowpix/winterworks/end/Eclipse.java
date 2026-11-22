package dev.lowpix.winterworks.end;

import dev.lowpix.winterworks.endboss.EclipseState;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;

/**
 * The End eclipse (docs/END_UPDATE.md section 5). API used by every End feature; the bosses agent owns the
 * implementation (endboss.EclipseState: saved data on the End level, the day roll, the client sync; the sky and
 * lighting in client.endboss). The eclipse only exists in the End: other levels never have one.
 */
public final class Eclipse {
    private Eclipse() {}

    /** Whether an eclipse is on in this level (client or server), fades included. */
    public static boolean isActive(Level level) {
        EclipseState s = state(level);
        return s != null && (s.active() || s.level() > 0f);
    }

    /** 0..1 including the fade in and out (client or server). */
    public static float fraction(Level level) {
        EclipseState s = state(level);
        return s == null ? 0f : s.level();
    }

    /** Starts (or extends) an eclipse in the End for `ticks` (fades included). `level` may be any level of the server. */
    public static void start(ServerLevel level, int ticks) {
        EclipseState s = EclipseState.get(level);
        ServerLevel end = level.getServer().getLevel(Level.END);
        if (s != null && end != null && ticks > 0) {
            s.start(end, ticks);
        }
    }

    public static void stop(ServerLevel level) {
        EclipseState s = EclipseState.get(level);
        ServerLevel end = level.getServer().getLevel(Level.END);
        if (s != null && end != null) {
            s.stop(end);
        }
    }

    private static EclipseState state(Level level) {
        if (level == null || level.dimension() != Level.END) {
            return null;
        }
        if (level.isClientSide) {
            return EclipseState.CLIENT;
        }
        return level instanceof ServerLevel sl ? EclipseState.get(sl) : null;
    }
}
