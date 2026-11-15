package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.express.BoosterRailBlock;
import dev.lowpix.winterworks.express.CoasterRailBlock;
import dev.lowpix.winterworks.express.DropRailBlock;
import dev.lowpix.winterworks.express.DropRailOpenBlock;
import dev.lowpix.winterworks.express.TrapRailBlock;
import dev.lowpix.winterworks.express.LiftRailBlock;
import dev.lowpix.winterworks.globe.SnowGlobeBlock;
import dev.lowpix.winterworks.globe.SnowGlobeBlockEntity;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;

public final class WWBlocks {
    public static final Block COASTER_RAIL = reg("coaster_rail",
            new CoasterRailBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.RAIL)));
    public static final Block BOOSTER_RAIL = reg("booster_rail",
            new BoosterRailBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.POWERED_RAIL)));
    public static final Block LIFT_RAIL = reg("lift_rail",
            new LiftRailBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.POWERED_RAIL).sound(SoundType.CHAIN)));
    public static final Block TRAP_RAIL = reg("trap_rail",
            new TrapRailBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.POWERED_RAIL).sound(SoundType.METAL)));
    public static final Block DROP_RAIL = reg("drop_rail",
            new DropRailBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.POWERED_RAIL).sound(SoundType.METAL)));
    public static final Block DROP_RAIL_OPEN = reg("drop_rail_open",
            new DropRailOpenBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.POWERED_RAIL).sound(SoundType.METAL).noCollission()
                    .noOcclusion()));
    public static final Block SNOW_GLOBE = reg("snow_globe",
            new SnowGlobeBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.GLASS).strength(0.6f).noOcclusion()
                    .lightLevel(s -> 4)));

    public static final BlockEntityType<SnowGlobeBlockEntity> SNOW_GLOBE_BE = Registry.register(
            BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id("snow_globe"),
            FabricBlockEntityTypeBuilder.create(SnowGlobeBlockEntity::new, SNOW_GLOBE).build());

    private WWBlocks() {}

    private static Block reg(String name, Block b) {
        return Registry.register(BuiltInRegistries.BLOCK, Winterworks.id(name), b);
    }

    public static void init() {}
}
