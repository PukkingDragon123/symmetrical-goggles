package dev.lowpix.winterworks.ocean;

import dev.lowpix.winterworks.registry.OceanBlocks;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.SlabType;

/**
 * A deep shipwreck (docs/OCEAN_UPDATE.md section 7): a big three-masted galleon sunk upright into the deep floor,
 * dark oak hull crusted with barnacles low down, rotted through in places and stove in on one side, with a cargo hold
 * (chests/deep_shipwreck_cargo, and barrels), a captain's cabin under the sterncastle (chests/deep_shipwreck_treasure)
 * and stores under the forecastle (chests/deep_shipwreck_supply). One mast has snapped and lies on the sea floor; sea
 * pickles have grown on the decks. Canonical frame: keel along z, bow at +z, the keel two blocks into the floor.
 */
final class DeepShipwreck {
    private static final BlockState PLANKS = Blocks.DARK_OAK_PLANKS.defaultBlockState();
    private static final BlockState DECK = Blocks.SPRUCE_PLANKS.defaultBlockState();
    private static final BlockState FRAME = Blocks.STRIPPED_DARK_OAK_LOG.defaultBlockState();
    private static final BlockState RAIL = Blocks.DARK_OAK_FENCE.defaultBlockState();
    private static final BlockState BARNACLES = OceanBlocks.BARNACLES.defaultBlockState();

    private DeepShipwreck() {}

    /** The ship's shape: half length, half beam, main deck height above the keel. */
    private record Hull(int half, int hw, int deck, int breachZ, int breachSide, double breachR) {
        double along(int z) {
            if (z > half - 10) {
                double u = (z - (half - 10)) / 10.0;
                return Math.sqrt(Math.max(0, 1 - u * u));
            }
            if (z < -half + 5) {
                return 0.86 + 0.14 * (z + half) / 5.0;
            }
            return 1;
        }

        /** Hull half-width at height yk above the keel, `z` along. */
        double width(int z, int yk) {
            double w = (hw + 0.4) * along(z);
            w *= Math.sqrt(Math.min(1, (yk + 0.7) / 4.5));
            if (yk > deck - 1) {
                w -= 0.35 * (yk - (deck - 1));
            }
            return w;
        }

        /** The top of the hull side (the rail) at `z`. */
        int top(int z) {
            return z < -half + 11 ? deck + 4 : z > half - 8 ? deck + 3 : deck + 1;
        }

        boolean inside(int x, int yk, int z) {
            if (yk < 0 || z < -half || z > half || yk > top(z)) {
                return false;
            }
            return Math.abs(x) <= width(z, yk);
        }

        boolean sterncastle(int z) {
            return z < -half + 11;
        }

        boolean forecastle(int z) {
            return z > half - 8;
        }
    }

    static void build(OceanStructurePiece.W w) {
        int half = 17 + (int) (w.rnd(0, 0, 0, 1) * 4);
        int hw = w.rnd(0, 0, 0, 2) < 0.5f ? 4 : 5;
        Hull h = new Hull(half, hw, 7, (int) ((w.rnd(0, 0, 0, 3) - 0.5) * half), w.rnd(0, 0, 0, 4) < 0.5f ? -1 : 1,
                2.6 + w.rnd(0, 0, 0, 5) * 1.2);
        int y0 = -2;   // the keel's local y: two blocks into the floor
        for (int z = -half - 1; z <= half + 1; z++) {
            for (int x = -hw - 2; x <= hw + 2; x++) {
                if (!w.column(x, z)) {
                    continue;
                }
                for (int yk = 0; yk <= h.top(z) + 1; yk++) {
                    cell(w, h, x, yk, z, y0);
                }
                if (h.inside(x, 0, z) || h.inside(x, 1, z)) {   // rest the hull on the floor
                    w.foundation(x, z, y0 - 1, 10, Blocks.GRAVEL.defaultBlockState());
                }
            }
        }
        decks(w, h, y0);
        masts(w, h, y0);
        cargo(w, h, y0);
    }

    private static void cell(OceanStructurePiece.W w, Hull h, int x, int yk, int z, int y0) {
        int y = y0 + yk;
        if (!h.inside(x, yk, z)) {
            return;
        }
        int sx = x == 0 ? 1 : Integer.signum(x);
        boolean edge = !h.inside(x + sx, yk, z) || !h.inside(x, yk - 1, z) || !h.inside(x, yk, z + 1) || !h.inside(x, yk, z - 1)
                || x == 0 && !h.inside(x - 1, yk, z);
        int top = h.top(z);
        if (yk == top && !edge) {   // the open space over the deck
            w.water(x, y, z);
            return;
        }
        if (!edge) {
            w.water(x, y, z);   // inside the hull; decks are laid after
            return;
        }
        // the hull shell
        boolean breach = Math.signum(x) == h.breachSide() && yk >= 1 && yk <= h.deck() + 1
                && Math.hypot(z - h.breachZ(), (yk - 3.5) * 1.3) < h.breachR();
        if (breach || yk >= 2 && yk < top && w.rnd(x, yk, z, 11) < 0.06f) {
            w.water(x, y, z);   // stove in, rotted through
            return;
        }
        if (yk == 0 && Math.abs(x) <= 1) {
            w.set(x, y, z, FRAME.setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));   // the keel
            return;
        }
        if (yk == top) {
            if (w.rnd(x, yk, z, 12) < 0.7f) {
                w.wet(x, y, z, RAIL);
            } else {
                w.water(x, y, z);
            }
            return;
        }
        if (yk <= 4 && w.rnd(x, yk, z, 13) < 0.38f || w.rnd(x, yk, z, 14) < 0.05f) {
            w.set(x, y, z, BARNACLES);
            return;
        }
        if (Math.floorMod(z, 4) == 0 && yk >= 1 && yk < h.deck()) {
            w.set(x, y, z, FRAME.setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y));   // a frame showing through
            return;
        }
        w.set(x, y, z, PLANKS);
    }

    private static boolean hatch(int x, int z, int z0, int z1) {
        return Math.abs(x) <= 1 && z >= z0 && z <= z1;
    }

    private static void decks(OceanStructurePiece.W w, Hull h, int y0) {
        int half = h.half();
        for (int z = -half; z <= half; z++) {
            for (int x = -h.hw(); x <= h.hw(); x++) {
                if (!w.column(x, z)) {
                    continue;
                }
                // the orlop/hold deck
                if (h.inside(x, 3, z) && h.inside(x + 1, 3, z) && h.inside(x - 1, 3, z) && !hatch(x, z, -3, 3)
                        && w.rnd(x, 3, z, 21) > 0.07f) {
                    w.set(x, y0 + 3, z, DECK);
                }
                // the main deck
                int d = h.deck();
                boolean broken = Math.signum(x) == h.breachSide() && Math.abs(z - h.breachZ()) < h.breachR() - 0.5 && Math.abs(x) > 1;
                if (h.inside(x, d, z) && h.inside(x + 1, d, z) && h.inside(x - 1, d, z) && !hatch(x, z, 3, 6) && !broken
                        && w.rnd(x, d, z, 22) > 0.06f) {
                    w.set(x, y0 + d, z, DECK);
                    if (w.rnd(x, d, z, 23) < 0.035f) {
                        pickles(w, x, y0 + d + 1, z);
                    }
                }
                // the sterncastle deck and the forecastle deck
                int up = h.sterncastle(z) ? d + 3 : h.forecastle(z) ? d + 2 : -1;
                if (up > 0 && h.inside(x, up, z) && h.inside(x + 1, up, z) && h.inside(x - 1, up, z) && w.rnd(x, up, z, 24) > 0.08f) {
                    w.set(x, y0 + up, z, DECK);
                    if (w.rnd(x, up, z, 25) < 0.05f) {
                        pickles(w, x, y0 + up + 1, z);
                    }
                }
            }
            // the cabin's front wall under the sterncastle, a door in the middle and windows
            if (z == -half + 10) {
                for (int x = -h.hw(); x <= h.hw(); x++) {
                    for (int yk = h.deck() + 1; yk <= h.deck() + 2; yk++) {
                        if (!h.inside(x, yk, z) || !h.inside(x + 1, yk, z) || !h.inside(x - 1, yk, z)) {
                            continue;
                        }
                        if (Math.abs(x) <= 0) {
                            w.water(x, y0 + yk, z);
                        } else if (yk == h.deck() + 2 && Math.abs(x) == 2) {
                            w.wet(x, y0 + yk, z, Blocks.GLASS_PANE.defaultBlockState());
                        } else {
                            w.set(x, y0 + yk, z, DECK);
                        }
                    }
                }
            }
        }
    }

    private static void pickles(OceanStructurePiece.W w, int x, int y, int z) {
        int n = 1 + (int) (w.rnd(x, y, z, 26) * 4);
        w.set(x, y, z, Blocks.SEA_PICKLE.defaultBlockState().setValue(SeaPickleBlock.PICKLES, Math.min(4, n)).setValue(SeaPickleBlock.WATERLOGGED, true));
    }

    private static void masts(OceanStructurePiece.W w, Hull h, int y0) {
        int half = h.half();
        int[] zs = {(int) Math.round(half * 0.55), -1, (int) Math.round(-half * 0.48)};
        int[] heights = {13, 17, 11};
        int broken = (int) (w.rnd(0, 1, 0, 30) * 3);
        int deckY = y0 + h.deck();
        for (int i = 0; i < 3; i++) {
            int z = zs[i];
            int base = y0 + 2, top = deckY + heights[i];
            if (i == broken) {
                top = deckY + 3 + (int) (w.rnd(0, 2, 0, 31) * 3);
            }
            for (int y = base; y <= top; y++) {
                w.set(0, y, z, Blocks.DARK_OAK_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y));
            }
            if (i == broken) {
                fallenMast(w, h, z, heights[i] - (top - deckY), y0);
                continue;
            }
            // the yard, tattered sails under it, and a crow's nest on the mainmast
            int yard = deckY + (int) (heights[i] * 0.72);
            int span = h.hw() + (i == 1 ? 1 : 0);
            for (int x = -span; x <= span; x++) {
                if (x != 0) {
                    w.set(x, yard, z, Blocks.SPRUCE_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X));
                }
                for (int y = yard - 1; y >= yard - 5; y--) {
                    if (x != 0 && Math.abs(x) < span && w.rnd(x, y, z, 32) < 0.42f - (yard - y) * 0.05f) {
                        w.set(x, y, z + 1, (w.rnd(x, y, z, 33) < 0.6f ? Blocks.WHITE_WOOL : Blocks.LIGHT_GRAY_WOOL).defaultBlockState());
                    }
                }
            }
            if (i == 1) {
                int nest = deckY + heights[i] - 3;
                for (int x = -1; x <= 1; x++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        if (x != 0 || dz != 0) {
                            w.wet(x, nest, z + dz, Blocks.SPRUCE_SLAB.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.BOTTOM));
                            if (w.rnd(x, nest + 1, z + dz, 34) < 0.7f) {
                                w.wet(x, nest + 1, z + dz, Blocks.SPRUCE_FENCE.defaultBlockState());
                            }
                        }
                    }
                }
            }
        }
        // the bowsprit
        for (int k = 0; k <= 6; k++) {
            w.set(0, deckY + 2 + k / 2, half - 1 + k, Blocks.SPRUCE_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));
        }
    }

    /** The snapped-off top of a mast, lying on the floor beside the ship. */
    private static void fallenMast(OceanStructurePiece.W w, Hull h, int z0, int length, int y0) {
        int side = -h.breachSide();
        int x = side * (h.hw() + 4);
        for (int k = 0; k < length + 2; k++) {
            int z = z0 - (length + 2) / 2 + k;
            int top = w.floor(x, z, y0 + 6, 14);
            if (top == Integer.MIN_VALUE) {
                continue;
            }
            w.set(x, top + 1, z, Blocks.DARK_OAK_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));
            if (k == length / 2) {   // its yard, half sunk in the silt
                for (int dx = 1; dx <= 3; dx++) {
                    w.set(x + side * dx, top + 1, z, Blocks.SPRUCE_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X));
                }
            }
            if (w.rnd(x, top, z, 35) < 0.3f) {
                w.set(x - side, top + 1, z, BARNACLES);
            }
        }
    }

    private static void cargo(OceanStructurePiece.W w, Hull h, int y0) {
        int half = h.half(), hw = h.hw();
        int deck = y0 + 4;   // on the hold deck
        // the hold: two cargo chests and stacks of barrels
        w.chest(hw - 2, deck, -2, Direction.WEST, OceanLoot.DEEP_SHIPWRECK_CARGO);
        w.chest(-(hw - 2), deck, 5, Direction.EAST, OceanLoot.DEEP_SHIPWRECK_CARGO);
        int[][] barrels = {{hw - 2, -4}, {hw - 2, -5}, {hw - 3, -5}, {-(hw - 2), 7}, {-(hw - 2), -6}, {-(hw - 3), -6}, {hw - 2, 6}};
        for (int i = 0; i < barrels.length; i++) {
            int bx = barrels[i][0], bz = barrels[i][1];
            w.barrel(bx, deck, bz, Direction.UP, i % 3 == 0 ? OceanLoot.DEEP_SHIPWRECK_CARGO : null);
            if (i % 2 == 0 && h.inside(bx, 6, bz)) {
                w.barrel(bx, deck + 1, bz, Direction.NORTH, null);
            }
        }
        // the captain's cabin under the sterncastle
        w.chest(0, y0 + h.deck() + 1, -half + 4, Direction.SOUTH, OceanLoot.DEEP_SHIPWRECK_TREASURE);
        pickles(w, 1, y0 + h.deck() + 1, -half + 4);
        pickles(w, -1, y0 + h.deck() + 1, -half + 6);
        // stores under the forecastle
        w.chest(1, y0 + h.deck() + 1, half - 5, Direction.WEST, OceanLoot.DEEP_SHIPWRECK_SUPPLY);
        w.barrel(-1, y0 + h.deck() + 1, half - 5, Direction.UP, null);
    }
}
