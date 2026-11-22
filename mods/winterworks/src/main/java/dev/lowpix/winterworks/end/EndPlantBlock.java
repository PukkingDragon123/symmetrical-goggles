package dev.lowpix.winterworks.end;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.BushBlock;

/** Stub: the world agent owns this (docs/END_UPDATE.md section 2). */
public class EndPlantBlock extends BushBlock {
    public static final MapCodec<EndPlantBlock> CODEC = simpleCodec(EndPlantBlock::new);

    public EndPlantBlock(Properties p) {
        super(p);
    }

    @Override
    protected MapCodec<? extends BushBlock> codec() {
        return CODEC;
    }
}
