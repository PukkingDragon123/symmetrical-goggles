package dev.lowpix.winterworks.end;

import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

/**
 * Petrification: an entity encased in obsidian (docs/END_UPDATE.md section 11). API used by the Monolith and the wand;
 * the gear agent owns the implementation (effect, shell rendering, invulnerability). Stub: does nothing.
 */
public final class Petrify {
    private Petrify() {}

    /** Encases `entity` for `ticks`. Invulnerable (the wand) or not (the Monolith's stare). */
    public static void freeze(LivingEntity entity, int ticks, boolean invulnerable) {}

    public static boolean isFrozen(Entity entity) {
        return false;
    }
}
