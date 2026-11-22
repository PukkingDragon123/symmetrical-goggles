package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The Hexing Table's floating book, animated on the client like vanilla's enchanting table book: it bobs, turns to
 * face the nearest player within 3 blocks and opens for them (client.hex.HexingTableRenderer draws it).
 * {@link #rot} is the angle the book's front faces, as atan2(-dx, dz) toward the player.
 */
public class HexingTableBlockEntity extends BlockEntity {
    private static final RandomSource RANDOM = RandomSource.create();
    public int time;
    public float open, oOpen;
    public float rot, oRot, tRot;
    public float flip, oFlip, flipT, flipA;
    /** Client: {@link #time} when the last hex happened here (the renderer plays the `hex` clip). */
    public int hexTime = -1000;
    public static final int EVENT_HEX = 1;

    public HexingTableBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.HEXING_TABLE_BE, pos, state);
    }

    @Override
    public boolean triggerEvent(int id, int param) {
        if (id == EVENT_HEX) {
            hexTime = time;
            return true;
        }
        return super.triggerEvent(id, param);
    }

    public static void bookAnimationTick(Level level, BlockPos pos, BlockState state, HexingTableBlockEntity be) {
        be.oOpen = be.open;
        be.oRot = be.rot;
        Player player = level.getNearestPlayer(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, 3.0, false);
        if (player != null) {
            double dx = player.getX() - (pos.getX() + 0.5);
            double dz = player.getZ() - (pos.getZ() + 0.5);
            be.tRot = (float) Mth.atan2(-dx, dz);
            be.open += 0.1f;
            if (be.open < 0.5f || RANDOM.nextInt(40) == 0) {
                float was = be.flipT;
                do {
                    be.flipT += RANDOM.nextInt(4) - RANDOM.nextInt(4);
                } while (was == be.flipT);
            }
        } else {
            be.tRot += 0.02f;
            be.open -= 0.1f;
        }
        be.rot = Mth.wrapDegrees(be.rot * Mth.RAD_TO_DEG) * Mth.DEG_TO_RAD;
        be.tRot = Mth.wrapDegrees(be.tRot * Mth.RAD_TO_DEG) * Mth.DEG_TO_RAD;
        float d = Mth.wrapDegrees((be.tRot - be.rot) * Mth.RAD_TO_DEG) * Mth.DEG_TO_RAD;
        be.rot += d * 0.4f;
        be.open = Mth.clamp(be.open, 0f, 1f);
        be.time++;
        be.oFlip = be.flip;
        float f = Mth.clamp((be.flipT - be.flip) * 0.4f, -0.2f, 0.2f);
        be.flipA += (f - be.flipA) * 0.9f;
        be.flip += be.flipA;
    }
}
