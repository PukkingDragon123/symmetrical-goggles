package dev.lowpix.winterworks.end;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;

/**
 * The End eclipse (docs/END_UPDATE.md section 5). API used by every End feature; the bosses agent owns the
 * implementation (saved data, sync, sky and lighting). Stub: never active.
 */
public final class Eclipse {
    private Eclipse() {}

    /** Whether an eclipse is on in this level (client or server). */
    public static boolean isActive(Level level) {
        return fraction(level) > 0f;
    }

    /** 0..1 including the fade in and out (client or server). */
    public static float fraction(Level level) {
        return 0f;
    }

    /** Starts (or extends) an eclipse in the End for `ticks`. */
    public static void start(ServerLevel level, int ticks) {}

    public static void stop(ServerLevel level) {}
}
