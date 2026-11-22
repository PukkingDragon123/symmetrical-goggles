package dev.lowpix.winterworks.endboss;

/**
 * What mixin.endboss.EnderDragonMixin adds to every Ender Dragon: the rework's server state and the synced
 * "second phase" flag the client draws the extra wings from.
 */
public interface DragonRage {
    DragonRework.State ww$rework();

    boolean ww$phaseTwo();

    void ww$setPhaseTwo(boolean on);
}
