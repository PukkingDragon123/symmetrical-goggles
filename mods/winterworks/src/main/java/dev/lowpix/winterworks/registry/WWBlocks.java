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

    // ---- Cold Zone update (docs/COLD_UPDATE.md sections 6 and 8)
    public static final Block ANCIENT_ICE = reg("ancient_ice", new dev.lowpix.winterworks.boss.AncientIceBlock(
            BlockBehaviour.Properties.of().mapColor(net.minecraft.world.level.material.MapColor.ICE).strength(25f, 1200f)
                    .friction(0.989f).sound(WWSounds.ANCIENT_ICE_SOUNDS).noOcclusion().requiresCorrectToolForDrops()
                    .isValidSpawn(Blocks::never).isRedstoneConductor((s, l, p) -> false).isSuffocating((s, l, p) -> false)
                    .isViewBlocking((s, l, p) -> false)));
    public static final Block ICICLE = reg("icicle", new dev.lowpix.winterworks.boss.IcicleBlock(
            BlockBehaviour.Properties.of().mapColor(net.minecraft.world.level.material.MapColor.ICE).strength(0.4f)
                    .sound(SoundType.GLASS).noOcclusion().dynamicShape()
                    .pushReaction(net.minecraft.world.level.material.PushReaction.DESTROY)));
    public static final Block FROST_MAULER_SKULL = reg("frost_mauler_skull", new dev.lowpix.winterworks.boss.FrostMaulerSkullBlock(
            BlockBehaviour.Properties.of().mapColor(net.minecraft.world.level.material.MapColor.QUARTZ).strength(2f, 1200f)
                    .sound(SoundType.BONE_BLOCK).noOcclusion()
                    .pushReaction(net.minecraft.world.level.material.PushReaction.DESTROY)));

    // ---- Amber Age update (docs/AMBER_UPDATE.md)
    public static final Block AMBER_BLOCK = reg("amber_block", new dev.lowpix.winterworks.amber.AmberBlock(
            BlockBehaviour.Properties.of().mapColor(net.minecraft.world.level.material.MapColor.COLOR_ORANGE).strength(1.5f, 3f)
                    .sound(SoundType.GLASS).noOcclusion().lightLevel(s -> 3).isRedstoneConductor((s, l, p) -> false)
                    .isSuffocating((s, l, p) -> false).isViewBlocking((s, l, p) -> false)));
    /** Brushable like suspicious gravel; uses vanilla's BrushableBlockEntity (mixin.BlockEntityTypeMixin). */
    public static final Block AMBER_FOSSIL = reg("amber_fossil", new net.minecraft.world.level.block.BrushableBlock(Blocks.GRAVEL,
            net.minecraft.sounds.SoundEvents.BRUSH_GRAVEL, net.minecraft.sounds.SoundEvents.BRUSH_GRAVEL_COMPLETED,
            BlockBehaviour.Properties.ofFullCopy(Blocks.SUSPICIOUS_GRAVEL)));
    public static final Block PETRIFIED_LOG = reg("petrified_log", new net.minecraft.world.level.block.RotatedPillarBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.STONE).mapColor(net.minecraft.world.level.material.MapColor.TERRACOTTA_BROWN)
                    .strength(2f, 6f)));
    public static final Block AMBERWOOD_LOG = reg("amberwood_log", new dev.lowpix.winterworks.amber.AmberwoodLogBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_LOG).randomTicks()));
    public static final Block AMBERWOOD_LEAVES = reg("amberwood_leaves", new net.minecraft.world.level.block.LeavesBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_LEAVES).lightLevel(s -> 4)
                    .mapColor(net.minecraft.world.level.material.MapColor.GOLD)));
    public static final Block AMBERWOOD_SAPLING = reg("amberwood_sapling", new net.minecraft.world.level.block.SaplingBlock(
            dev.lowpix.winterworks.amber.AmberwoodGrower.GROWER, BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_SAPLING)));
    public static final Block AMBERWOOD_PLANKS = reg("amberwood_planks", new Block(
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_PLANKS).mapColor(net.minecraft.world.level.material.MapColor.COLOR_ORANGE)));
    public static final Block BLOOD_STAIN = reg("blood_stain", new dev.lowpix.winterworks.amber.BloodStainBlock(
            BlockBehaviour.Properties.of().mapColor(net.minecraft.world.level.material.MapColor.COLOR_RED).noCollission().instabreak()
                    .noOcclusion().randomTicks().sound(SoundType.SLIME_BLOCK).replaceable()
                    .pushReaction(net.minecraft.world.level.material.PushReaction.DESTROY)));

    public static final BlockEntityType<SnowGlobeBlockEntity> SNOW_GLOBE_BE = Registry.register(
            BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id("snow_globe"),
            FabricBlockEntityTypeBuilder.create(SnowGlobeBlockEntity::new, SNOW_GLOBE).build());

    public static final BlockEntityType<dev.lowpix.winterworks.boss.FrostMaulerSkullBlockEntity> FROST_MAULER_SKULL_BE =
            Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id("frost_mauler_skull"),
                    FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.boss.FrostMaulerSkullBlockEntity::new,
                            FROST_MAULER_SKULL).build());

    private WWBlocks() {}

    private static Block reg(String name, Block b) {
        return Registry.register(BuiltInRegistries.BLOCK, Winterworks.id(name), b);
    }

    public static void init() {}
}
