package dev.lowpix.winterworks.amber;

import com.mojang.serialization.MapCodec;
import net.minecraft.world.level.block.Block;

/** The flowers crowning an Amberwood (docs/HEXES_UPDATE.md section 10). */
public class AmberwoodBloomBlock extends Block {
    public static final MapCodec<AmberwoodBloomBlock> CODEC = simpleCodec(AmberwoodBloomBlock::new);

    public AmberwoodBloomBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }
}
