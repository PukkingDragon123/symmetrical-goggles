package dev.lowpix.winterworks.oceanmob;

/**
 * Duck interface for the overhauled vanilla turtle (implemented by mixin.oceanmob.TurtleMixin on every {@code Turtle}):
 * the synced basking and surfacing flags that the renderer turns into the `bask` clip and a head held up for air.
 */
public interface SeaTurtle {
    boolean ww$isBasking();

    void ww$setBasking(boolean basking);

    boolean ww$isSurfacing();

    void ww$setSurfacing(boolean surfacing);
}
