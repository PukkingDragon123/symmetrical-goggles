package dev.lowpix.winterworks.amber;

import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/**
 * What's trapped in a natural amber block (inclusion seed or mosquito; plain amber has no block entity, see
 * mixin.BlockStateBaseMixin). It holds no data: client.amber.AmberInclusionRenderer draws the inclusion in 3D.
 */
public class AmberInclusionBlockEntity extends BlockEntity {
    public AmberInclusionBlockEntity(BlockPos pos, BlockState state) {
        super(AmberFeature.AMBER_INCLUSION_BE, pos, state);
    }

    /** Which way this one was frozen facing (degrees): fixed per block. */
    public float baseYaw() {
        return Math.floorMod(Mth.getSeed(worldPosition), 360L);
    }

    /** A small fixed tilt per block (degrees), -12..12. */
    public float baseTilt() {
        return Math.floorMod(Mth.getSeed(worldPosition) >> 9, 25L) - 12f;
    }
}
