package dev.lowpix.winterworks.client.endmob;

import static dev.lowpix.winterworks.client.endmob.StandIn.box;
import static dev.lowpix.winterworks.client.endmob.StandIn.k;

/**
 * Box stand-ins for the four mobs until their lowpix models land (docs/END_UPDATE.md section 15): the contract's bones
 * (plus a few extra coloured parts), sized to the hitboxes, with simple versions of the contract's clips.
 */
final class StandIns {
    private StandIns() {}

    static StandIn forModel(String name) {
        return switch (name) {
            case "enderfly" -> enderfly();
            case "endling" -> endling();
            case "gucker" -> gucker();
            case "obolisk" -> obolisk();
            default -> throw new IllegalArgumentException(name);
        };
    }

    /** A moth: dark violet body, four lilac wings with glowing eye-spots, glowing eyes, feathery antennae. */
    static StandIn enderfly() {
        int body = 0x3A2452, dark = 0x24163A, head = 0x1E1228, wing = 0xB060E6, wing2 = 0x8848C0, spot = 0xF6CCFF, eye = 0xE878FF,
                ant = 0x7A58A0;
        StandIn s = new StandIn()
                .bone("body", null, 0, 17, 0)
                .part("thorax", "body", 0, 0, 0, body, box(-2, -2, -2, 4, 4, 4))
                .part("abdomen", "body", 0, 0.5f, 2, -0.25f, 0, 0, dark, box(-1.5f, -1.5f, 0, 3, 3, 6), box(-1, -1, 6, 2, 2, 1.5f))
                .part("head", "body", 0, -0.5f, -2, head, box(-1.8f, -1.8f, -3.2f, 3.6f, 3.6f, 3.2f))
                .part("eyes", "head", 0, 0, 0, eye, box(1.0f, -1.4f, -3.0f, 1.1f, 1.5f, 1.8f), box(-2.1f, -1.4f, -3.0f, 1.1f, 1.5f, 1.8f))
                .glow("eyes", eye)
                .part("antenna_l", "head", 0.9f, -1.6f, -2.6f, -0.6f, 0, 0.35f, ant, box(-0.25f, -5, -0.25f, 0.5f, 5, 0.5f),
                        box(-0.9f, -5.5f, -0.2f, 1.8f, 1.2f, 0.4f))
                .part("antenna_r", "head", -0.9f, -1.6f, -2.6f, -0.6f, 0, -0.35f, ant, box(-0.25f, -5, -0.25f, 0.5f, 5, 0.5f),
                        box(-0.9f, -5.5f, -0.2f, 1.8f, 1.2f, 0.4f))
                .part("wing_fl", "body", 1.8f, -1.6f, -0.8f, 0, 0, -0.15f, wing, box(0, -0.25f, -3.5f, 9, 0.5f, 6))
                .part("spot_fl", "wing_fl", 6, 0, -0.8f, spot, box(-1.3f, -0.4f, -1.3f, 2.6f, 0.8f, 2.6f)).glow("spot_fl", spot)
                .part("wing_fr", "body", -1.8f, -1.6f, -0.8f, 0, 0, 0.15f, wing, box(-9, -0.25f, -3.5f, 9, 0.5f, 6))
                .part("spot_fr", "wing_fr", -6, 0, -0.8f, spot, box(-1.3f, -0.4f, -1.3f, 2.6f, 0.8f, 2.6f)).glow("spot_fr", spot)
                .part("wing_bl", "body", 1.6f, -1.2f, 1.6f, 0, 0, -0.1f, wing2, box(0, -0.25f, 0, 7, 0.5f, 5))
                .part("spot_bl", "wing_bl", 4.6f, 0, 2.6f, spot, box(-0.9f, -0.4f, -0.9f, 1.8f, 0.8f, 1.8f)).glow("spot_bl", spot)
                .part("wing_br", "body", -1.6f, -1.2f, 1.6f, 0, 0, 0.1f, wing2, box(-7, -0.25f, 0, 7, 0.5f, 5))
                .part("spot_br", "wing_br", -4.6f, 0, 2.6f, spot, box(-0.9f, -0.4f, -0.9f, 1.8f, 0.8f, 1.8f)).glow("spot_br", spot)
                .part("legs", "body", 0, 2, -0.5f, head, box(-1.6f, 0, -1.5f, 3.2f, 1.6f, 3));
        s.clip("fly", 0.3f, true)
                .rot("wing_fl", k(0, 0, 0, -45), k(0.15f, 0, 0, 35), k(0.3f, 0, 0, -45))
                .rot("wing_fr", k(0, 0, 0, 45), k(0.15f, 0, 0, -35), k(0.3f, 0, 0, 45))
                .rot("wing_bl", k(0, 0, 0, -30), k(0.15f, 0, 0, 30), k(0.3f, 0, 0, -30))
                .rot("wing_br", k(0, 0, 0, 30), k(0.15f, 0, 0, -30), k(0.3f, 0, 0, 30))
                .pos("body", k(0, 0, 0.5f, 0), k(0.15f, 0, -0.5f, 0), k(0.3f, 0, 0.5f, 0))
                .rot("body", k(0, 8, 0, 0), k(0.3f, 8, 0, 0))
                .done()
                .clip("hover", 0.6f, true)
                .rot("wing_fl", k(0, 0, 0, -25), k(0.3f, 0, 0, 15), k(0.6f, 0, 0, -25))
                .rot("wing_fr", k(0, 0, 0, 25), k(0.3f, 0, 0, -15), k(0.6f, 0, 0, 25))
                .rot("wing_bl", k(0, 0, 0, -15), k(0.3f, 0, 0, 15), k(0.6f, 0, 0, -15))
                .rot("wing_br", k(0, 0, 0, 15), k(0.3f, 0, 0, -15), k(0.6f, 0, 0, 15))
                .pos("body", k(0, 0, 0.8f, 0), k(0.3f, 0, -0.8f, 0), k(0.6f, 0, 0.8f, 0))
                .rot("antenna_l", k(0, 0, 0, 0), k(0.3f, 10, 0, 0), k(0.6f, 0, 0, 0))
                .rot("antenna_r", k(0, 0, 0, 0), k(0.3f, 10, 0, 0), k(0.6f, 0, 0, 0))
                .done()
                .clip("dive", 0.6f, false)
                .rot("body", k(0, 0, 0, 0), k(0.15f, 40, 0, 0), k(0.45f, 40, 0, 0), k(0.6f, 0, 0, 0))
                .rot("wing_fl", k(0, 0, 0, 0), k(0.15f, 0, 25, -65), k(0.45f, 0, 25, -65), k(0.6f, 0, 0, 0))
                .rot("wing_fr", k(0, 0, 0, 0), k(0.15f, 0, -25, 65), k(0.45f, 0, -25, 65), k(0.6f, 0, 0, 0))
                .rot("wing_bl", k(0, 0, 0, 0), k(0.15f, 0, 15, -50), k(0.45f, 0, 15, -50), k(0.6f, 0, 0, 0))
                .rot("wing_br", k(0, 0, 0, 0), k(0.15f, 0, -15, 50), k(0.45f, 0, -15, 50), k(0.6f, 0, 0, 0))
                .done()
                .clip("teleport", 0.3f, false)
                .scale("body", k(0, 1, 1, 1), k(0.1f, 0.3f, 1.7f, 0.3f), k(0.3f, 1, 1, 1))
                .done();
        return s;
    }

    /** A tiny Enderman: two long legs, a small body, a big head with violet eyes; the plant sits on top of the head. */
    static StandIn endling() {
        int black = 0x17121E, dark = 0x241C30, eye = 0xD58CFF, mouth = 0x0B0810;
        StandIn s = new StandIn()
                .part("body", null, 0, 17, 0, dark, box(-2, -4, -1.5f, 4, 4.5f, 3))
                .part("leg_l", "body", 1.1f, 0, 0, black, box(-0.75f, 0, -0.75f, 1.5f, 7, 1.5f))
                .part("leg_r", "body", -1.1f, 0, 0, black, box(-0.75f, 0, -0.75f, 1.5f, 7, 1.5f))
                .part("head", "body", 0, -4, 0, black, box(-3.5f, -6, -3.5f, 7, 6, 7))
                .part("jaw", "head", 0, -0.6f, -0.4f, mouth, box(-3, 0, -3.3f, 6, 1.2f, 6))
                .part("eyes", "head", 0, 0, 0, eye, box(0.6f, -3.9f, -3.7f, 2.1f, 1.1f, 0.4f), box(-2.7f, -3.9f, -3.7f, 2.1f, 1.1f, 0.4f))
                .glow("eyes", eye)
                .bone("head_plant", "head", 0, -6, 0);
        s.clip("idle", 2.4f, true)
                .rot("head", k(0, 0, 0, 0), k(1.2f, -4, 0, 3), k(2.4f, 0, 0, 0))
                .rot("jaw", k(0, 0, 0, 0), k(1.8f, 0, 0, 0), k(2.0f, 8, 0, 0), k(2.4f, 0, 0, 0))
                .done()
                .clip("walk", 0.8f, true)
                .rot("leg_l", k(0, 30, 0, 0), k(0.4f, -30, 0, 0), k(0.8f, 30, 0, 0))
                .rot("leg_r", k(0, -30, 0, 0), k(0.4f, 30, 0, 0), k(0.8f, -30, 0, 0))
                .pos("body", k(0, 0, 0, 0), k(0.2f, 0, -0.6f, 0), k(0.4f, 0, 0, 0), k(0.6f, 0, -0.6f, 0), k(0.8f, 0, 0, 0))
                .rot("head", k(0, 0, 0, -4), k(0.4f, 0, 0, 4), k(0.8f, 0, 0, -4))
                .done()
                .clip("run", 0.5f, true)
                .rot("leg_l", k(0, 50, 0, 0), k(0.25f, -50, 0, 0), k(0.5f, 50, 0, 0))
                .rot("leg_r", k(0, -50, 0, 0), k(0.25f, 50, 0, 0), k(0.5f, -50, 0, 0))
                .rot("body", k(0, 12, 0, 0), k(0.5f, 12, 0, 0))
                .pos("body", k(0, 0, 0, 0), k(0.125f, 0, -1, 0), k(0.25f, 0, 0, 0), k(0.375f, 0, -1, 0), k(0.5f, 0, 0, 0))
                .done()
                .clip("hop", 0.5f, false)
                .pos("body", k(0, 0, 0, 0), k(0.2f, 0, -4, 0), k(0.5f, 0, 0, 0))
                .rot("leg_l", k(0, 0, 0, 0), k(0.2f, 0, 0, -15), k(0.5f, 0, 0, 0))
                .rot("leg_r", k(0, 0, 0, 0), k(0.2f, 0, 0, 15), k(0.5f, 0, 0, 0))
                .rot("jaw", k(0, 0, 0, 0), k(0.2f, 15, 0, 0), k(0.5f, 0, 0, 0))
                .done()
                .clip("sit", 1.0f, true)
                .pos("body", k(0, 0, 5.5f, 0), k(1, 0, 5.5f, 0))
                .rot("leg_l", k(0, -85, 0, -8), k(1, -85, 0, -8))
                .rot("leg_r", k(0, -85, 0, 8), k(1, -85, 0, 8))
                .done()
                .clip("teleport", 0.4f, false)
                .scale("body", k(0, 1, 1, 1), k(0.15f, 0.35f, 1.6f, 0.35f), k(0.4f, 1, 1, 1))
                .done()
                .clip("sacrifice", 1.2f, false)
                .pos("body", k(0, 0, 0, 0), k(1.2f, 0, -10, 0))
                .rot("body", k(0, 0, 0, 0), k(1.2f, 0, 540, 0))
                .scale("body", k(0, 1, 1, 1), k(0.8f, 1.15f, 1.15f, 1.15f), k(1.2f, 0.05f, 0.05f, 0.05f))
                .rot("head", k(0, 0, 0, 0), k(0.6f, -25, 0, 0), k(1.2f, -25, 0, 0))
                .done();
        return s;
    }

    /** A big, low salamander: grey hide, a row of breathing vents on the back, a pale throat sac, a three-part tail. */
    static StandIn gucker() {
        int hide = 0x8E8A70, belly = 0xB8AF92, dark = 0x5E5A48, ridge = 0x6E6A56, vent = 0x4E3460, ventGlow = 0x9A62D0, sac = 0xD6C4A6,
                eye = 0xF2D35E;
        StandIn s = new StandIn()
                .part("body", null, 0, 17, 0, hide, box(-6, -4, -9, 12, 7, 18))
                .part("ridge", "body", 0, -4, 0, ridge, box(-4, -1, -7.5f, 8, 1, 15))
                .part("vents", "body", 0, -5, 0, vent, box(-1.5f, -0.8f, -5.5f, 3, 0.8f, 2), box(-1.5f, -0.8f, -1, 3, 0.8f, 2),
                        box(-1.5f, -0.8f, 3.5f, 3, 0.8f, 2)).glow("vents", ventGlow)
                .part("head", "body", 0, -0.5f, -9, hide, box(-5, -3.5f, -8, 10, 6, 8))
                .part("eyes", "head", 0, 0, 0, eye, box(3.4f, -3.4f, -6.2f, 1.4f, 1.6f, 2.2f), box(-4.8f, -3.4f, -6.2f, 1.4f, 1.6f, 2.2f))
                .glow("eyes", eye)
                .part("jaw", "head", 0, 2.5f, 0, belly, box(-4.5f, 0, -7.8f, 9, 1.5f, 7.8f))
                .part("throat", "head", 0, 3.6f, -3.2f, sac, box(-3, 0, -2.5f, 6, 2.4f, 5))
                .part("tail_0", "body", 0, -1, 9, hide, box(-3.5f, -2.5f, 0, 7, 5, 8))
                .part("tail_1", "tail_0", 0, 0.5f, 8, hide, box(-2.5f, -2, 0, 5, 4, 8))
                .part("tail_2", "tail_1", 0, 0.5f, 8, dark, box(-1.5f, -1.5f, 0, 3, 3, 7))
                .part("leg_fl", "body", 5.5f, 1.5f, -6, 0, 0, -0.35f, dark, box(-1.5f, 0, -1.5f, 3, 6, 3))
                .part("leg_fr", "body", -5.5f, 1.5f, -6, 0, 0, 0.35f, dark, box(-1.5f, 0, -1.5f, 3, 6, 3))
                .part("leg_bl", "body", 5.5f, 1.5f, 6, 0, 0, -0.35f, dark, box(-1.5f, 0, -1.5f, 3, 6, 3))
                .part("leg_br", "body", -5.5f, 1.5f, 6, 0, 0, 0.35f, dark, box(-1.5f, 0, -1.5f, 3, 6, 3));
        s.clip("idle", 3f, true)
                .scale("throat", k(0, 1, 1, 1), k(1.5f, 1.08f, 1.25f, 1.08f), k(3, 1, 1, 1))
                .rot("tail_0", k(0, 0, -8, 0), k(1.5f, 0, 8, 0), k(3, 0, -8, 0))
                .rot("tail_1", k(0, 0, -6, 0), k(1.5f, 0, 10, 0), k(3, 0, -6, 0))
                .rot("head", k(0, 0, 0, 0), k(1.5f, -4, 4, 0), k(3, 0, 0, 0))
                .done()
                .clip("walk", 1.2f, true)
                .rot("leg_fl", k(0, 25, 0, 0), k(0.6f, -25, 0, 0), k(1.2f, 25, 0, 0))
                .rot("leg_br", k(0, 25, 0, 0), k(0.6f, -25, 0, 0), k(1.2f, 25, 0, 0))
                .rot("leg_fr", k(0, -25, 0, 0), k(0.6f, 25, 0, 0), k(1.2f, -25, 0, 0))
                .rot("leg_bl", k(0, -25, 0, 0), k(0.6f, 25, 0, 0), k(1.2f, -25, 0, 0))
                .rot("body", k(0, 0, 5, 0), k(0.6f, 0, -5, 0), k(1.2f, 0, 5, 0))
                .rot("tail_0", k(0, 0, -10, 0), k(0.6f, 0, 10, 0), k(1.2f, 0, -10, 0))
                .rot("tail_1", k(0, 0, -12, 0), k(0.6f, 0, 12, 0), k(1.2f, 0, -12, 0))
                .done()
                .clip("run", 0.6f, true)
                .rot("leg_fl", k(0, 40, 0, 0), k(0.3f, -40, 0, 0), k(0.6f, 40, 0, 0))
                .rot("leg_br", k(0, 40, 0, 0), k(0.3f, -40, 0, 0), k(0.6f, 40, 0, 0))
                .rot("leg_fr", k(0, -40, 0, 0), k(0.3f, 40, 0, 0), k(0.6f, -40, 0, 0))
                .rot("leg_bl", k(0, -40, 0, 0), k(0.3f, 40, 0, 0), k(0.6f, -40, 0, 0))
                .rot("body", k(0, 0, 8, 0), k(0.3f, 0, -8, 0), k(0.6f, 0, 8, 0))
                .pos("body", k(0, 0, 0, 0), k(0.15f, 0, -1, 0), k(0.3f, 0, 0, 0), k(0.45f, 0, -1, 0), k(0.6f, 0, 0, 0))
                .rot("tail_0", k(0, 0, -14, 0), k(0.3f, 0, 14, 0), k(0.6f, 0, -14, 0))
                .done()
                .clip("burrowed", 2.4f, true)
                .rot("leg_fl", k(0, 0, 0, -65), k(2.4f, 0, 0, -65))
                .rot("leg_bl", k(0, 0, 0, -65), k(2.4f, 0, 0, -65))
                .rot("leg_fr", k(0, 0, 0, 65), k(2.4f, 0, 0, 65))
                .rot("leg_br", k(0, 0, 0, 65), k(2.4f, 0, 0, 65))
                .rot("head", k(0, 10, 0, 0), k(2.4f, 10, 0, 0))
                .scale("vents", k(0, 1, 1, 1), k(1.2f, 1.15f, 1.8f, 1.15f), k(2.4f, 1, 1, 1))
                .done()
                .clip("emerge", 0.8f, false)
                .rot("head", k(0, 10, 0, 0), k(0.4f, -30, 0, 0), k(0.8f, 0, 0, 0))
                .rot("jaw", k(0, 0, 0, 0), k(0.4f, 35, 0, 0), k(0.8f, 0, 0, 0))
                .rot("leg_fl", k(0, 0, 0, -65), k(0.6f, 0, 0, 0))
                .rot("leg_bl", k(0, 0, 0, -65), k(0.6f, 0, 0, 0))
                .rot("leg_fr", k(0, 0, 0, 65), k(0.6f, 0, 0, 0))
                .rot("leg_br", k(0, 0, 0, 65), k(0.6f, 0, 0, 0))
                .done()
                .clip("bite", 0.5f, false)
                .rot("jaw", k(0, 0, 0, 0), k(0.15f, 40, 0, 0), k(0.3f, 0, 0, 0), k(0.5f, 0, 0, 0))
                .rot("head", k(0, 0, 0, 0), k(0.15f, -15, 0, 0), k(0.3f, 8, 0, 0), k(0.5f, 0, 0, 0))
                .pos("head", k(0, 0, 0, 0), k(0.3f, 0, 0, -2), k(0.5f, 0, 0, 0))
                .done()
                .clip("inflate", 1.2f, false)
                .rot("head", k(0, 0, 0, 0), k(0.6f, -18, 0, 0), k(1.2f, -22, 0, 0))
                .rot("jaw", k(0, 0, 0, 0), k(1.2f, 6, 0, 0))
                .done()
                .clip("spit", 0.5f, false)
                .rot("head", k(0, -22, 0, 0), k(0.12f, 10, 0, 0), k(0.5f, 0, 0, 0))
                .rot("jaw", k(0, 6, 0, 0), k(0.12f, 45, 0, 0), k(0.5f, 0, 0, 0))
                .done();
        return s;
    }

    /** A tall obsidian monolith on four legs with one glowing eye (and its lid) and crying-obsidian veins. */
    static StandIn obolisk() {
        int obs = 0x17111F, obs2 = 0x241A33, vein = 0x9B4DFF, eye = 0xC676FF, lid = 0x100B18;
        StandIn s = new StandIn()
                .part("body", null, 0, 12, 0, obs, box(-12, -44, -10, 24, 44, 20))
                .part("cap", "body", 0, -44, 0, obs2, box(-10, -4, -8, 20, 4, 16))
                .part("veins", "body", 0, 0, 0, vein, box(-8, -38, -10.3f, 1, 16, 0.4f), box(6, -24, -10.3f, 1, 12, 0.4f),
                        box(-4, -12, -10.3f, 7, 1, 0.4f), box(12, -34, -3, 0.4f, 18, 1), box(-12.4f, -28, 3, 0.4f, 14, 1),
                        box(-3, -40, 10, 1, 20, 0.4f), box(-9, -20, -10.3f, 1, 8, 0.4f)).glow("veins", vein)
                .part("eye", "body", 0, -30, -10, eye, box(-3.5f, -3.5f, -1, 7, 7, 1)).glow("eye", eye)
                .part("eyelid", "body", 0, -34.5f, -11.2f, (float) (Math.PI / 2), 0, 0, lid, box(-4.5f, 0, -0.6f, 9, 9, 0.6f))
                .part("leg_fl", null, 8.5f, 12, -6.5f, obs2, box(-3, 0, -3, 6, 12, 6))
                .part("leg_fr", null, -8.5f, 12, -6.5f, obs2, box(-3, 0, -3, 6, 12, 6))
                .part("leg_bl", null, 8.5f, 12, 6.5f, obs2, box(-3, 0, -3, 6, 12, 6))
                .part("leg_br", null, -8.5f, 12, 6.5f, obs2, box(-3, 0, -3, 6, 12, 6));
        String[] legs = {"leg_fl", "leg_fr", "leg_bl", "leg_br"};
        StandIn.Clip disguised = s.clip("disguised", 4f, true)
                .pos("body", k(0, 0, 11.5f, 0), k(4, 0, 11.5f, 0))
                .rot("eyelid", k(0, -90, 0, 0), k(4, -90, 0, 0));
        StandIn.Clip rise = s.clip("rise", 2f, false)
                .pos("body", k(0, 0, 11.5f, 0), k(0.4f, 0, 12, 0), k(1.6f, 0, -1.5f, 0), k(2, 0, 0, 0))
                .rot("body", k(0, 0, 0, 0), k(0.6f, 0, 0, 2), k(1.0f, 0, 0, -2), k(1.4f, 0, 0, 1), k(2, 0, 0, 0))
                .rot("eyelid", k(0, -90, 0, 0), k(1.2f, -90, 0, 0), k(1.8f, 0, 0, 0));
        StandIn.Clip settle = s.clip("settle", 1.5f, false)
                .pos("body", k(0, 0, 0, 0), k(0.3f, 0, -1, 0), k(1.2f, 0, 12, 0), k(1.5f, 0, 11.5f, 0))
                .rot("eyelid", k(0, 0, 0, 0), k(0.4f, -90, 0, 0), k(1.5f, -90, 0, 0));
        for (String leg : legs) {
            disguised.pos(leg, k(0, 0, -1, 0), k(4, 0, -1, 0)).scale(leg, k(0, 0.95f, 0.95f, 0.95f), k(4, 0.95f, 0.95f, 0.95f));
            rise.pos(leg, k(0, 0, -1, 0), k(0.6f, 0, -1, 0), k(1.6f, 0, 0, 0)).scale(leg, k(0, 0.95f, 0.95f, 0.95f), k(1.6f, 1, 1, 1));
            settle.pos(leg, k(0, 0, 0, 0), k(1.2f, 0, -1, 0), k(1.5f, 0, -1, 0)).scale(leg, k(0, 1, 1, 1), k(1.2f, 0.95f, 0.95f, 0.95f));
        }
        disguised.done();
        rise.done();
        settle.done();
        s.clip("idle", 3f, true)
                .rot("body", k(0, 0, 0, -1), k(1.5f, 0, 0, 1), k(3, 0, 0, -1))
                .rot("eyelid", k(0, 0, 0, 0), k(2.6f, 0, 0, 0), k(2.8f, -90, 0, 0), k(3, 0, 0, 0))
                .done()
                .clip("walk", 1.6f, true)
                .rot("leg_fl", k(0, 20, 0, 0), k(0.8f, -20, 0, 0), k(1.6f, 20, 0, 0))
                .rot("leg_br", k(0, 20, 0, 0), k(0.8f, -20, 0, 0), k(1.6f, 20, 0, 0))
                .rot("leg_fr", k(0, -20, 0, 0), k(0.8f, 20, 0, 0), k(1.6f, -20, 0, 0))
                .rot("leg_bl", k(0, -20, 0, 0), k(0.8f, 20, 0, 0), k(1.6f, -20, 0, 0))
                .rot("body", k(0, 0, 0, 3), k(0.8f, 0, 0, -3), k(1.6f, 0, 0, 3))
                .pos("body", k(0, 0, 0, 0), k(0.4f, 0, -1, 0), k(0.8f, 0, 0, 0), k(1.2f, 0, -1, 0), k(1.6f, 0, 0, 0))
                .done()
                .clip("slam", 1.2f, false)
                .rot("body", k(0, 0, 0, 0), k(0.5f, -22, 0, 0), k(0.7f, 18, 0, 0), k(0.9f, 14, 0, 0), k(1.2f, 0, 0, 0))
                .pos("body", k(0, 0, 0, 0), k(0.5f, 0, -3, 1), k(0.7f, 0, 1, -2), k(1.2f, 0, 0, 0))
                .rot("leg_fl", k(0, 0, 0, 0), k(0.5f, -35, 0, 0), k(0.7f, 0, 0, 0))
                .rot("leg_fr", k(0, 0, 0, 0), k(0.5f, -35, 0, 0), k(0.7f, 0, 0, 0))
                .done();
        return s;
    }
}
