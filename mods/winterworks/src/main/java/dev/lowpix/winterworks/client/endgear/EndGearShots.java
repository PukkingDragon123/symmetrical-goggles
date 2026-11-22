package dev.lowpix.winterworks.client.endgear;

/** Dev-only screenshots of the gear (-Dwinterworks.endgearshots=true). Filled in below. */
final class EndGearShots {
    private static final boolean ENABLED = Boolean.getBoolean("winterworks.endgearshots");

    private EndGearShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
    }
}
