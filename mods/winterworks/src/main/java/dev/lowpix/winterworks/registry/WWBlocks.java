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
    public static final Block AMBERWOOD_PLANKS = reg("amberwood_planks", new Block(
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_PLANKS).mapColor(net.minecraft.world.level.material.MapColor.COLOR_ORANGE)));
    public static final Block BLOOD_STAIN = reg("blood_stain", new dev.lowpix.winterworks.amber.BloodStainBlock(
            BlockBehaviour.Properties.of().mapColor(net.minecraft.world.level.material.MapColor.COLOR_RED).noCollission().instabreak()
                    .noOcclusion().randomTicks().sound(SoundType.SLIME_BLOCK).replaceable()
                    .pushReaction(net.minecraft.world.level.material.PushReaction.DESTROY)));

    /** The Amberwood's flower, and its sapling (0.4): planted on sand, terracotta or dirt it grows into an Amberwood. */
    public static final Block AMBERWOOD_BLOOM = reg("amberwood_bloom", new dev.lowpix.winterworks.amber.AmberwoodBloomBlock(
            dev.lowpix.winterworks.amber.AmberwoodGrower.GROWER, BlockBehaviour.Properties.ofFullCopy(Blocks.FLOWERING_AZALEA_LEAVES)
                    .noCollission().noOcclusion().instabreak().randomTicks().sound(SoundType.AZALEA).lightLevel(s -> 7)
                    .pushReaction(net.minecraft.world.level.material.PushReaction.DESTROY)
                    .mapColor(net.minecraft.world.level.material.MapColor.GOLD)));

    // ---- 0.4 fixes: amber (docs/FIXES_0_4.md): amber sand and gravel, the Amberwood wood set
    /** Brushable like suspicious sand / gravel (vanilla's BrushableBlockEntity, mixin.BlockEntityTypeMixin); brushing gives amber. */
    public static final Block AMBER_SAND = reg("amber_sand", new net.minecraft.world.level.block.BrushableBlock(Blocks.SAND,
            net.minecraft.sounds.SoundEvents.BRUSH_SAND, net.minecraft.sounds.SoundEvents.BRUSH_SAND_COMPLETED,
            BlockBehaviour.Properties.ofFullCopy(Blocks.SUSPICIOUS_SAND)));
    public static final Block AMBER_GRAVEL = reg("amber_gravel", new net.minecraft.world.level.block.BrushableBlock(Blocks.GRAVEL,
            net.minecraft.sounds.SoundEvents.BRUSH_GRAVEL, net.minecraft.sounds.SoundEvents.BRUSH_GRAVEL_COMPLETED,
            BlockBehaviour.Properties.ofFullCopy(Blocks.SUSPICIOUS_GRAVEL)));
    public static final Block AMBERWOOD_WOOD = reg("amberwood_wood", new net.minecraft.world.level.block.RotatedPillarBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_WOOD).mapColor(net.minecraft.world.level.material.MapColor.TERRACOTTA_LIGHT_GRAY)));
    public static final Block STRIPPED_AMBERWOOD_LOG = reg("stripped_amberwood_log", new net.minecraft.world.level.block.RotatedPillarBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.STRIPPED_OAK_LOG).mapColor(net.minecraft.world.level.material.MapColor.COLOR_ORANGE)));
    public static final Block STRIPPED_AMBERWOOD_WOOD = reg("stripped_amberwood_wood", new net.minecraft.world.level.block.RotatedPillarBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.STRIPPED_OAK_WOOD).mapColor(net.minecraft.world.level.material.MapColor.COLOR_ORANGE)));
    public static final Block AMBERWOOD_STAIRS = reg("amberwood_stairs", new net.minecraft.world.level.block.StairBlock(
            AMBERWOOD_PLANKS.defaultBlockState(), BlockBehaviour.Properties.ofFullCopy(AMBERWOOD_PLANKS)));
    public static final Block AMBERWOOD_SLAB = reg("amberwood_slab", new net.minecraft.world.level.block.SlabBlock(
            BlockBehaviour.Properties.ofFullCopy(AMBERWOOD_PLANKS)));
    public static final Block AMBERWOOD_FENCE = reg("amberwood_fence", new net.minecraft.world.level.block.FenceBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_FENCE).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    public static final Block AMBERWOOD_FENCE_GATE = reg("amberwood_fence_gate", new net.minecraft.world.level.block.FenceGateBlock(
            dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_FENCE_GATE).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    public static final Block AMBERWOOD_DOOR = reg("amberwood_door", new net.minecraft.world.level.block.DoorBlock(
            dev.lowpix.winterworks.amber.Amberwood.SET_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_DOOR).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    public static final Block AMBERWOOD_TRAPDOOR = reg("amberwood_trapdoor", new net.minecraft.world.level.block.TrapDoorBlock(
            dev.lowpix.winterworks.amber.Amberwood.SET_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_TRAPDOOR).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    public static final Block AMBERWOOD_BUTTON = reg("amberwood_button", new net.minecraft.world.level.block.ButtonBlock(
            dev.lowpix.winterworks.amber.Amberwood.SET_TYPE, 30, BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_BUTTON)));
    public static final Block AMBERWOOD_PRESSURE_PLATE = reg("amberwood_pressure_plate", new net.minecraft.world.level.block.PressurePlateBlock(
            dev.lowpix.winterworks.amber.Amberwood.SET_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_PRESSURE_PLATE).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    public static final Block AMBERWOOD_SIGN = reg("amberwood_sign", new net.minecraft.world.level.block.StandingSignBlock(
            dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_SIGN).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    public static final Block AMBERWOOD_WALL_SIGN = reg("amberwood_wall_sign", new net.minecraft.world.level.block.WallSignBlock(
            dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_WALL_SIGN).mapColor(AMBERWOOD_PLANKS.defaultMapColor()).dropsLike(AMBERWOOD_SIGN)));
    public static final Block AMBERWOOD_HANGING_SIGN = reg("amberwood_hanging_sign", new net.minecraft.world.level.block.CeilingHangingSignBlock(
            dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE,
            BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_HANGING_SIGN).mapColor(AMBERWOOD_PLANKS.defaultMapColor())));
    /** A bloom in a flower pot, as vanilla's potted saplings (FlowerPotBlock's constructor makes the flower pot take blooms). */
    public static final Block POTTED_AMBERWOOD_BLOOM = reg("potted_amberwood_bloom", new net.minecraft.world.level.block.FlowerPotBlock(
            AMBERWOOD_BLOOM, BlockBehaviour.Properties.ofFullCopy(Blocks.POTTED_OAK_SAPLING).lightLevel(s -> 7)));
    public static final Block AMBERWOOD_WALL_HANGING_SIGN = reg("amberwood_wall_hanging_sign",
            new net.minecraft.world.level.block.WallHangingSignBlock(dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE,
                    BlockBehaviour.Properties.ofFullCopy(Blocks.OAK_WALL_HANGING_SIGN).mapColor(AMBERWOOD_PLANKS.defaultMapColor())
                            .dropsLike(AMBERWOOD_HANGING_SIGN)));

    // ---- Hexes & Havoc (docs/HEXES_UPDATE.md)
    public static final Block ELIXIR_JAR = reg("elixir_jar", new dev.lowpix.winterworks.hex.ElixirJarBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.LANTERN).lightLevel(s -> 5).noOcclusion()));
    public static final Block SOUL_TANK = reg("soul_tank", new dev.lowpix.winterworks.hex.SoulTankBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.NETHERITE_BLOCK).noOcclusion().lightLevel(s -> 8)));
    public static final Block HEXING_TABLE = reg("hexing_table", new dev.lowpix.winterworks.hex.HexingTableBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.ENCHANTING_TABLE).lightLevel(s -> 9)));

    public static final BlockEntityType<SnowGlobeBlockEntity> SNOW_GLOBE_BE = Registry.register(
            BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id("snow_globe"),
            FabricBlockEntityTypeBuilder.create(SnowGlobeBlockEntity::new, SNOW_GLOBE).build());

    public static final BlockEntityType<dev.lowpix.winterworks.boss.FrostMaulerSkullBlockEntity> FROST_MAULER_SKULL_BE =
            Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id("frost_mauler_skull"),
                    FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.boss.FrostMaulerSkullBlockEntity::new,
                            FROST_MAULER_SKULL).build());

    public static final BlockEntityType<dev.lowpix.winterworks.hex.ElixirJarBlockEntity> ELIXIR_JAR_BE = be("elixir_jar",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.hex.ElixirJarBlockEntity::new, ELIXIR_JAR).build());
    public static final BlockEntityType<dev.lowpix.winterworks.hex.SoulTankBlockEntity> SOUL_TANK_BE = be("soul_tank",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.hex.SoulTankBlockEntity::new, SOUL_TANK).build());
    public static final BlockEntityType<dev.lowpix.winterworks.hex.HexingTableBlockEntity> HEXING_TABLE_BE = be("hexing_table",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.hex.HexingTableBlockEntity::new, HEXING_TABLE).build());

    // ---- 0.4 fixes: rails (docs/FIXES_0_4.md "Rails")
    public static final Block COASTER_LOOP = reg("coaster_loop", new dev.lowpix.winterworks.express.CoasterLoopBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.RAIL).sound(SoundType.METAL).noOcclusion()));
    public static final Block SWITCH_RAIL = reg("switch_rail", new dev.lowpix.winterworks.express.SwitchRailBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.RAIL).sound(SoundType.METAL)));
    public static final BlockEntityType<dev.lowpix.winterworks.express.CoasterLoopBlock.CoasterLoopBlockEntity> COASTER_LOOP_BE =
            be("coaster_loop", FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.express.CoasterLoopBlock.CoasterLoopBlockEntity::new,
                    COASTER_LOOP).build());
    // ---- end 0.4 fixes: rails

    // ---- 0.4 fixes: Harvester (docs/FIXES_0_4.md "The Harvester")
    public static final Block HARVESTER_EGG = reg("harvester_egg", new dev.lowpix.winterworks.harvester.HarvesterEggBlock(
            BlockBehaviour.Properties.ofFullCopy(Blocks.SNIFFER_EGG).mapColor(net.minecraft.world.level.material.MapColor.COLOR_LIGHT_GREEN)));
    public static final BlockEntityType<dev.lowpix.winterworks.harvester.HarvesterEggBlock.EggBlockEntity> HARVESTER_EGG_BE =
            be("harvester_egg", FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.harvester.HarvesterEggBlock.EggBlockEntity::new,
                    HARVESTER_EGG).build());
    // ---- end 0.4 fixes: Harvester

    private static <T extends net.minecraft.world.level.block.entity.BlockEntity> BlockEntityType<T> be(String n, BlockEntityType<T> t) {
        return Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id(n), t);
    }

    private WWBlocks() {}

    private static Block reg(String name, Block b) {
        return Registry.register(BuiltInRegistries.BLOCK, Winterworks.id(name), b);
    }

    public static void init() {}
}
