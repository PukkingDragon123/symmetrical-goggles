package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.Block;

/** A thin stain of blood (docs/AMBER_UPDATE.md section 7); fades after a while. */
public class BloodStainBlock extends Block {
    public static final MapCodec<BloodStainBlock> CODEC = simpleCodec(BloodStainBlock::new);

    public BloodStainBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }
}
