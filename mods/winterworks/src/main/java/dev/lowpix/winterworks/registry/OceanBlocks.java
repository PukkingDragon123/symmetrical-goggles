package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.util.ColorRGBA;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ColoredFallingBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour.Properties;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

/** Tides & Treasures blocks and block entities (docs/OCEAN_UPDATE.md section 2). */
public final class OceanBlocks {
    public static final List<Block> ALL = new ArrayList<>();

    public static final Block HYDROTHERMAL_VENT = reg("hydrothermal_vent", new dev.lowpix.winterworks.ocean.HydrothermalVentBlock(
            Properties.ofFullCopy(Blocks.BASALT).strength(3f, 6f).lightLevel(s -> 6)));
    public static final Block TUBE_WORMS = reg("tube_worms", new dev.lowpix.winterworks.ocean.TubeWormsBlock(
            Properties.of().mapColor(MapColor.COLOR_RED).noCollission().instabreak().sound(SoundType.WET_GRASS)
                    .pushReaction(PushReaction.DESTROY).noOcclusion()));
    public static final Block ASH_SAND = reg("ash_sand", new ColoredFallingBlock(new ColorRGBA(0x5E5A57),
            Properties.ofFullCopy(Blocks.SAND).mapColor(MapColor.COLOR_GRAY)));
    public static final Block ASHSTONE = reg("ashstone", new Block(ash()));
    public static final Block ASHSTONE_STAIRS = reg("ashstone_stairs", new StairBlock(ASHSTONE.defaultBlockState(), ash()));
    public static final Block ASHSTONE_SLAB = reg("ashstone_slab", new SlabBlock(ash()));
    public static final Block ASHSTONE_WALL = reg("ashstone_wall", new WallBlock(ash().forceSolidOn()));
    public static final Block POLISHED_ASHSTONE = reg("polished_ashstone", new Block(ash()));
    public static final Block POLISHED_ASHSTONE_STAIRS = reg("polished_ashstone_stairs",
            new StairBlock(POLISHED_ASHSTONE.defaultBlockState(), ash()));
    public static final Block POLISHED_ASHSTONE_SLAB = reg("polished_ashstone_slab", new SlabBlock(ash()));
    public static final Block POLISHED_ASHSTONE_WALL = reg("polished_ashstone_wall", new WallBlock(ash().forceSolidOn()));
    public static final Block ASHSTONE_BRICKS = reg("ashstone_bricks", new Block(ash()));
    public static final Block ASHSTONE_BRICK_STAIRS = reg("ashstone_brick_stairs", new StairBlock(ASHSTONE_BRICKS.defaultBlockState(), ash()));
    public static final Block ASHSTONE_BRICK_SLAB = reg("ashstone_brick_slab", new SlabBlock(ash()));
    public static final Block ASHSTONE_BRICK_WALL = reg("ashstone_brick_wall", new WallBlock(ash().forceSolidOn()));
    public static final Block CRACKED_ASHSTONE_BRICKS = reg("cracked_ashstone_bricks", new Block(ash()));
    public static final Block CHISELED_ASHSTONE = reg("chiseled_ashstone", new Block(ash()));
    public static final Block ANGLER_LIGHT = reg("angler_light", new dev.lowpix.winterworks.oceanmob.AnglerLightBlock(
            Properties.ofFullCopy(Blocks.SEA_LANTERN).lightLevel(s -> 15)));
    public static final Block WHALE_LURE = reg("whale_lure", new dev.lowpix.winterworks.whale.WhaleLureBlock(
            Properties.ofFullCopy(Blocks.SEA_LANTERN).lightLevel(s -> 12).noOcclusion()));
    public static final Block EYE_OF_THE_OCEAN = reg("eye_of_the_ocean", new dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlock(
            Properties.ofFullCopy(Blocks.CONDUIT).lightLevel(s -> 15)));
    public static final Block CANNON = reg("cannon", new dev.lowpix.winterworks.whale.CannonBlock(
            Properties.ofFullCopy(Blocks.IRON_BLOCK).strength(3f, 6f).noOcclusion()));
    public static final Block BARNACLES = reg("barnacles", new Block(Properties.ofFullCopy(Blocks.STONE).mapColor(MapColor.COLOR_LIGHT_GRAY)
            .strength(25f, 6f).requiresCorrectToolForDrops().sound(SoundType.CORAL_BLOCK)));
    public static final Block WHALE_FLESH = reg("whale_flesh", new Block(Properties.of().mapColor(MapColor.COLOR_PINK).strength(2f)
            .sound(SoundType.SLIME_BLOCK)));
    public static final Block WHALE_HIDE = reg("whale_hide", new Block(Properties.of().mapColor(MapColor.COLOR_GRAY).strength(-1f, 3600000f)
            .noLootTable()));
    public static final Block NAUTILUS_HORN = reg("nautilus_horn", new dev.lowpix.winterworks.whale.NautilusHornBlock(
            Properties.of().mapColor(MapColor.TERRACOTTA_WHITE).strength(0.8f).noOcclusion().sound(SoundType.BONE_BLOCK)));

    public static final BlockEntityType<dev.lowpix.winterworks.ocean.HydrothermalVentBlockEntity> HYDROTHERMAL_VENT_BE = be("hydrothermal_vent",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.ocean.HydrothermalVentBlockEntity::new, HYDROTHERMAL_VENT).build());
    public static final BlockEntityType<dev.lowpix.winterworks.oceanmob.AnglerLightBlockEntity> ANGLER_LIGHT_BE = be("angler_light",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.oceanmob.AnglerLightBlockEntity::new, ANGLER_LIGHT).build());
    public static final BlockEntityType<dev.lowpix.winterworks.whale.WhaleLureBlockEntity> WHALE_LURE_BE = be("whale_lure",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.whale.WhaleLureBlockEntity::new, WHALE_LURE).build());
    public static final BlockEntityType<dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlockEntity> EYE_OF_THE_OCEAN_BE = be("eye_of_the_ocean",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlockEntity::new, EYE_OF_THE_OCEAN).build());
    public static final BlockEntityType<dev.lowpix.winterworks.whale.CannonBlockEntity> CANNON_BE = be("cannon",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.whale.CannonBlockEntity::new, CANNON).build());
    public static final BlockEntityType<dev.lowpix.winterworks.whale.NautilusHornBlockEntity> NAUTILUS_HORN_BE = be("nautilus_horn",
            FabricBlockEntityTypeBuilder.create(dev.lowpix.winterworks.whale.NautilusHornBlockEntity::new, NAUTILUS_HORN).build());

    private OceanBlocks() {}

    private static Properties ash() {
        return Properties.ofFullCopy(Blocks.TUFF).mapColor(MapColor.COLOR_GRAY);
    }

    private static Block reg(String name, Block b) {
        Registry.register(BuiltInRegistries.BLOCK, Winterworks.id(name), b);
        ALL.add(b);
        return b;
    }

    private static <T extends BlockEntity> BlockEntityType<T> be(String n, BlockEntityType<T> t) {
        return Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE, Winterworks.id(n), t);
    }

    public static void init() {}
}
