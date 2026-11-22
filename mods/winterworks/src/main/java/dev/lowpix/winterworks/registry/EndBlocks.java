package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.ColorRGBA;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.BrushableBlock;
import net.minecraft.world.level.block.CarpetBlock;
import net.minecraft.world.level.block.ColoredFallingBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallBlock;
import net.minecraft.world.level.block.state.BlockBehaviour.Properties;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

/** The Living End's blocks (docs/END_UPDATE.md section 2). Behaviour classes belong to the package named in the contract. */
public final class EndBlocks {
    /** Every block here, in creative-tab order (EndItems makes their block items). */
    public static final List<Block> ALL = new ArrayList<>();

    // ---- Chorus Meadows
    public static final Block END_GRASS_BLOCK = reg("end_grass_block", new dev.lowpix.winterworks.end.EndGrassBlock(
            Properties.ofFullCopy(Blocks.END_STONE).mapColor(MapColor.COLOR_PURPLE).sound(SoundType.NYLIUM).randomTicks()));
    public static final Block END_GRASS = reg("end_grass", new dev.lowpix.winterworks.end.EndPlantBlock(
            Properties.ofFullCopy(Blocks.SHORT_GRASS).mapColor(MapColor.COLOR_PURPLE)));
    public static final Block TALL_END_GRASS = reg("tall_end_grass", new dev.lowpix.winterworks.end.TallEndGrassBlock(
            Properties.ofFullCopy(Blocks.TALL_GRASS).mapColor(MapColor.COLOR_PURPLE)));
    public static final Block END_MOSS_BLOCK = reg("end_moss_block", new dev.lowpix.winterworks.end.EndMossBlock(
            Properties.ofFullCopy(Blocks.MOSS_BLOCK).mapColor(MapColor.COLOR_MAGENTA)));
    public static final Block END_MOSS_CARPET = reg("end_moss_carpet", new CarpetBlock(
            Properties.ofFullCopy(Blocks.MOSS_CARPET).mapColor(MapColor.COLOR_MAGENTA)));
    public static final Block END_BLOOM = reg("end_bloom", new dev.lowpix.winterworks.endmob.EndBloomBlock(
            Properties.ofFullCopy(Blocks.POPPY).mapColor(MapColor.COLOR_MAGENTA).randomTicks()
                    .lightLevel(s -> s.getValue(dev.lowpix.winterworks.endmob.EndBloomBlock.OPEN) ? 10 : 2)));
    public static final Block CHORUS_STEM = reg("chorus_stem", new RotatedPillarBlock(Properties.of().mapColor(MapColor.COLOR_PURPLE)
            .instrument(net.minecraft.world.level.block.state.properties.NoteBlockInstrument.BASS).strength(2f).sound(SoundType.WOOD)));
    public static final Block CHORUS_ROOTS = reg("chorus_roots", new RotatedPillarBlock(Properties.of()
            .mapColor(MapColor.TERRACOTTA_PURPLE).instrument(net.minecraft.world.level.block.state.properties.NoteBlockInstrument.BASS)
            .strength(1.5f).sound(SoundType.ROOTS)));
    public static final Block CHORUS_COCOON = reg("chorus_cocoon", new dev.lowpix.winterworks.endmob.ChorusCocoonBlock(
            Properties.ofFullCopy(Blocks.CHORUS_FLOWER).mapColor(MapColor.COLOR_PURPLE).strength(0.6f).noOcclusion()
                    .randomTicks().pushReaction(PushReaction.DESTROY)));
    public static final Block CHORUS_FRUIT_BLOCK = reg("chorus_fruit_block", new Block(
            Properties.ofFullCopy(Blocks.MELON).mapColor(MapColor.COLOR_PURPLE)));

    // ---- the Dead End
    public static final Block END_SAND = reg("end_sand", new ColoredFallingBlock(new ColorRGBA(0x9C9A8E),
            Properties.ofFullCopy(Blocks.SAND).mapColor(MapColor.COLOR_LIGHT_GRAY)));
    public static final Block SUSPICIOUS_END_SAND = reg("suspicious_end_sand", new BrushableBlock(END_SAND,
            SoundEvents.BRUSH_SAND, SoundEvents.BRUSH_SAND_COMPLETED,
            Properties.ofFullCopy(Blocks.SUSPICIOUS_SAND).mapColor(MapColor.COLOR_LIGHT_GRAY)));
    public static final Block DRY_END_BUSH = reg("dry_end_bush", new dev.lowpix.winterworks.end.DryEndBushBlock(
            Properties.ofFullCopy(Blocks.DEAD_BUSH).mapColor(MapColor.COLOR_LIGHT_GRAY)));
    public static final Block METEORITE = reg("meteorite", new Block(Properties.ofFullCopy(Blocks.OBSIDIAN)
            .mapColor(MapColor.COLOR_ORANGE).strength(80f, 1200f).lightLevel(s -> 15).sound(SoundType.ANCIENT_DEBRIS)));
    public static final Block METEORITE_CORE = reg("meteorite_core", new Block(Properties.ofFullCopy(Blocks.OBSIDIAN)
            .mapColor(MapColor.COLOR_ORANGE).strength(100f, 1200f).lightLevel(s -> 15).sound(SoundType.ANCIENT_DEBRIS)));
    public static final Block POLISHED_METEORITE = reg("polished_meteorite", new Block(meteoriteDeco()));
    public static final Block METEORITE_BRICKS = reg("meteorite_bricks", new Block(meteoriteDeco()));
    public static final Block METEORITE_BRICK_STAIRS = reg("meteorite_brick_stairs",
            new StairBlock(METEORITE_BRICKS.defaultBlockState(), meteoriteDeco()));
    public static final Block METEORITE_BRICK_SLAB = reg("meteorite_brick_slab", new SlabBlock(meteoriteDeco()));
    public static final Block METEORITE_BRICK_WALL = reg("meteorite_brick_wall", new WallBlock(meteoriteDeco().forceSolidOn()));

    // ---- obsidian, like the deepslate set
    public static final Block POLISHED_OBSIDIAN = reg("polished_obsidian", new Block(obsidian()));
    public static final Block POLISHED_OBSIDIAN_STAIRS = reg("polished_obsidian_stairs",
            new StairBlock(POLISHED_OBSIDIAN.defaultBlockState(), obsidian()));
    public static final Block POLISHED_OBSIDIAN_SLAB = reg("polished_obsidian_slab", new SlabBlock(obsidian()));
    public static final Block POLISHED_OBSIDIAN_WALL = reg("polished_obsidian_wall", new WallBlock(obsidian().forceSolidOn()));
    public static final Block OBSIDIAN_BRICKS = reg("obsidian_bricks", new Block(obsidian()));
    public static final Block OBSIDIAN_BRICK_STAIRS = reg("obsidian_brick_stairs",
            new StairBlock(OBSIDIAN_BRICKS.defaultBlockState(), obsidian()));
    public static final Block OBSIDIAN_BRICK_SLAB = reg("obsidian_brick_slab", new SlabBlock(obsidian()));
    public static final Block OBSIDIAN_BRICK_WALL = reg("obsidian_brick_wall", new WallBlock(obsidian().forceSolidOn()));
    public static final Block CRACKED_OBSIDIAN_BRICKS = reg("cracked_obsidian_bricks", new Block(obsidian()));
    public static final Block OBSIDIAN_TILES = reg("obsidian_tiles", new Block(obsidian()));
    public static final Block OBSIDIAN_TILE_STAIRS = reg("obsidian_tile_stairs",
            new StairBlock(OBSIDIAN_TILES.defaultBlockState(), obsidian()));
    public static final Block OBSIDIAN_TILE_SLAB = reg("obsidian_tile_slab", new SlabBlock(obsidian()));
    public static final Block OBSIDIAN_TILE_WALL = reg("obsidian_tile_wall", new WallBlock(obsidian().forceSolidOn()));
    public static final Block CRACKED_OBSIDIAN_TILES = reg("cracked_obsidian_tiles", new Block(obsidian()));
    public static final Block CHISELED_OBSIDIAN = reg("chiseled_obsidian", new Block(obsidian()));

    private EndBlocks() {}

    private static Properties obsidian() {
        return Properties.ofFullCopy(Blocks.OBSIDIAN);
    }

    private static Properties meteoriteDeco() {
        return Properties.ofFullCopy(Blocks.POLISHED_BLACKSTONE).mapColor(MapColor.COLOR_ORANGE).strength(30f, 1200f)
                .lightLevel(s -> 12).sound(SoundType.ANCIENT_DEBRIS);
    }

    private static Block reg(String name, Block b) {
        Registry.register(BuiltInRegistries.BLOCK, Winterworks.id(name), b);
        ALL.add(b);
        return b;
    }

    public static void init() {}
}
