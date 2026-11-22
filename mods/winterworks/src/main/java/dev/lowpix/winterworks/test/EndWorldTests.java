package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.end.ChorusTree;
import dev.lowpix.winterworks.end.EndGen;
import dev.lowpix.winterworks.end.EndGuards;
import dev.lowpix.winterworks.end.EndLoot;
import dev.lowpix.winterworks.end.EndStructure;
import dev.lowpix.winterworks.end.EndWorldFeature;
import dev.lowpix.winterworks.end.EndWorldgen;
import dev.lowpix.winterworks.end.EndWriter;
import dev.lowpix.winterworks.end.FloatingIsland;
import dev.lowpix.winterworks.end.Meteorite;
import dev.lowpix.winterworks.registry.EndBlocks;
import dev.lowpix.winterworks.registry.EndEntities;
import dev.lowpix.winterworks.registry.EndItems;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.fabricmc.fabric.api.registry.FuelRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BonemealableBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChorusPlantBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.BrushableBlockEntity;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Living End's world (docs/END_UPDATE.md sections 1-3): End Grass spreading and decaying, bone meal,
 * plant soils, recipes, meteorite fuel, the three structures (chests, loot tables, suspicious sand, the Monolith,
 * guards), the biomes in the End's biome source, floating islands, meteorites, suspicious end sand and End City loot.
 * The builds go far from the test grid.
 */
public class EndWorldTests implements FabricGameTest {
    private static final String BATCH = "winterworks_end_world";

    private static void floor(GameTestHelper h, Block b, int size) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 1, z), b);
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static int count(GameTestHelper h, Block b, int size, int y0, int y1) {
        int n = 0;
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                for (int y = y0; y <= y1; y++) {
                    if (h.getBlockState(new BlockPos(x, y, z)).is(b)) {
                        n++;
                    }
                }
            }
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ blocks

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void endGrassSpreadsAndDecays(GameTestHelper h) {
        floor(h, Blocks.END_STONE, 5);
        BlockPos c = new BlockPos(2, 1, 2);
        h.setBlock(c, EndBlocks.END_GRASS_BLOCK);
        ServerLevel level = h.getLevel();
        RandomSource r = RandomSource.create(42);
        for (int i = 0; i < 60; i++) {
            for (int x = 0; x < 5; x++) {
                for (int z = 0; z < 5; z++) {
                    BlockPos p = h.absolutePos(new BlockPos(x, 1, z));
                    BlockState s = level.getBlockState(p);
                    if (s.is(EndBlocks.END_GRASS_BLOCK)) {
                        s.randomTick(level, p, r);
                    }
                }
            }
        }
        int grass = count(h, EndBlocks.END_GRASS_BLOCK, 5, 1, 1);
        h.assertTrue(grass >= 9, "End Grass should spread over the end stone next to it, covers " + grass + " of 25");
        h.assertTrue(count(h, EndBlocks.END_GRASS_BLOCK, 5, 0, 0) == 0, "... but not onto other stone");
        // under a full block it turns back to end stone
        h.setBlock(c.above(), Blocks.STONE);
        BlockPos abs = h.absolutePos(c);
        level.getBlockState(abs).randomTick(level, abs, r);
        h.assertBlockPresent(Blocks.END_STONE, c);
        // and it never spreads under a full block
        h.setBlock(new BlockPos(0, 2, 0), Blocks.STONE);
        h.setBlock(new BlockPos(0, 1, 0), Blocks.END_STONE);
        h.setBlock(new BlockPos(1, 1, 0), EndBlocks.END_GRASS_BLOCK);
        BlockPos g = h.absolutePos(new BlockPos(1, 1, 0));
        for (int i = 0; i < 200; i++) {
            level.getBlockState(g).randomTick(level, g, r);
        }
        h.assertBlockPresent(Blocks.END_STONE, new BlockPos(0, 1, 0));
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void boneMealGrowsEndPlantsAndSpreadsMoss(GameTestHelper h) {
        floor(h, EndBlocks.END_GRASS_BLOCK, 9);
        ServerLevel level = h.getLevel();
        RandomSource r = RandomSource.create(7);
        BlockPos c = h.absolutePos(new BlockPos(4, 1, 4));
        for (int i = 0; i < 4; i++) {
            ((BonemealableBlock) EndBlocks.END_GRASS_BLOCK).performBonemeal(level, r, c, level.getBlockState(c));
        }
        int grass = count(h, EndBlocks.END_GRASS, 9, 2, 2), tall = count(h, EndBlocks.TALL_END_GRASS, 9, 2, 3);
        h.assertTrue(grass >= 8, "bone meal on End Grass should grow end grass round it, grew " + grass);
        h.assertTrue(tall >= 2, "... and some tall end grass, grew " + tall / 2);
        h.assertTrue(count(h, Blocks.SHORT_GRASS, 9, 2, 2) == 0, "... never overworld grass");
        // End Moss spreads over end stone like moss
        for (int x = 0; x < 9; x++) {
            for (int z = 0; z < 9; z++) {
                for (int y = 2; y <= 3; y++) {
                    h.setBlock(new BlockPos(x, y, z), Blocks.AIR);
                }
                h.setBlock(new BlockPos(x, 1, z), Blocks.END_STONE);
            }
        }
        h.setBlock(new BlockPos(4, 1, 4), EndBlocks.END_MOSS_BLOCK);
        for (int i = 0; i < 3; i++) {
            ((BonemealableBlock) EndBlocks.END_MOSS_BLOCK).performBonemeal(level, r, c, level.getBlockState(c));
        }
        int moss = count(h, EndBlocks.END_MOSS_BLOCK, 9, 1, 1);
        h.assertTrue(moss >= 6, "bone meal on End Moss should spread it over the end stone, covers " + moss);
        int plants = count(h, EndBlocks.END_MOSS_CARPET, 9, 2, 2) + count(h, EndBlocks.END_GRASS, 9, 2, 2);
        h.assertTrue(plants >= 2, "... with moss carpets and end grass on top, " + plants);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void endPlantsGrowOnEndSoil(GameTestHelper h) {
        h.setBlock(new BlockPos(0, 1, 0), Blocks.END_STONE);
        h.setBlock(new BlockPos(1, 1, 0), EndBlocks.END_GRASS_BLOCK);
        h.setBlock(new BlockPos(2, 1, 0), EndBlocks.END_MOSS_BLOCK);
        h.setBlock(new BlockPos(3, 1, 0), Blocks.GRASS_BLOCK);
        h.setBlock(new BlockPos(4, 1, 0), EndBlocks.END_SAND);
        h.setBlock(new BlockPos(5, 1, 0), Blocks.STONE);
        ServerLevel level = h.getLevel();
        for (int x = 0; x <= 5; x++) {
            BlockPos p = h.absolutePos(new BlockPos(x, 2, 0));
            boolean soil = x <= 2;
            h.assertTrue(EndBlocks.END_GRASS.defaultBlockState().canSurvive(level, p) == soil, "end grass on " + level.getBlockState(p.below()));
            h.assertTrue(EndBlocks.TALL_END_GRASS.defaultBlockState().canSurvive(level, p) == soil, "tall end grass on " + level.getBlockState(p.below()));
            boolean bush = x == 0 || x == 4;
            h.assertTrue(EndBlocks.DRY_END_BUSH.defaultBlockState().canSurvive(level, p) == bush, "dry end bush on " + level.getBlockState(p.below()));
        }
        // chorus plants grow on End Grass, and stand on chorus-tree stems
        BlockPos g = h.absolutePos(new BlockPos(1, 2, 0));
        h.assertTrue(Blocks.CHORUS_PLANT.defaultBlockState().canSurvive(level, g), "chorus plants survive on End Grass");
        h.assertTrue(Blocks.CHORUS_FLOWER.defaultBlockState().canSurvive(level, g), "... and chorus flowers");
        h.assertTrue(ChorusPlantBlock.getStateWithConnections(level, g, Blocks.CHORUS_PLANT.defaultBlockState()).getValue(ChorusPlantBlock.DOWN),
                "a chorus plant joins the End Grass under it");
        h.setBlock(new BlockPos(5, 2, 0), EndBlocks.CHORUS_STEM);
        BlockPos s = h.absolutePos(new BlockPos(5, 3, 0));
        h.assertTrue(Blocks.CHORUS_PLANT.defaultBlockState().canSurvive(level, s), "chorus twigs stand on chorus stems");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void suspiciousEndSandBrushes(GameTestHelper h) {
        floor(h, Blocks.STONE, 3);
        BlockPos rel = new BlockPos(1, 2, 1);
        h.setBlock(rel, EndBlocks.SUSPICIOUS_END_SAND);
        BlockPos p = h.absolutePos(rel);
        ServerLevel level = h.getLevel();
        h.assertTrue(BlockEntityType.BRUSHABLE_BLOCK.isValid(EndBlocks.SUSPICIOUS_END_SAND.defaultBlockState()),
                "suspicious end sand is a valid brushable block");
        h.assertTrue(level.getBlockEntity(p) instanceof BrushableBlockEntity, "suspicious end sand should have a brushable block entity");
        BrushableBlockEntity be = (BrushableBlockEntity) level.getBlockEntity(p);
        be.setLootTable(EndLoot.DEAD_END_ARCHAEOLOGY, 1234L);
        Player player = h.makeMockPlayer(GameType.SURVIVAL);
        long t = level.getGameTime();
        for (int i = 0; i < 10 && level.getBlockEntity(p) instanceof BrushableBlockEntity b; i++) {
            b.brush(t + i * 10L, player, Direction.UP);
        }
        h.assertBlockPresent(EndBlocks.END_SAND, rel);
        h.succeedWhen(() -> {
            List<ItemEntity> items = level.getEntitiesOfClass(ItemEntity.class, new AABB(p).inflate(2));
            h.assertFalse(items.isEmpty(), "brushing should turn up a find from archaeology/dead_end");
            items.forEach(Entity::discard);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void meteoriteBurnsLong(GameTestHelper h) {
        Integer fuel = FuelRegistry.INSTANCE.get(EndBlocks.METEORITE.asItem());
        h.assertTrue(fuel != null && fuel == 48000, "meteorite should burn 48000 ticks, " + fuel);
        Map<net.minecraft.world.item.Item, Integer> furnace = AbstractFurnaceBlockEntity.getFuel();
        h.assertTrue(furnace.getOrDefault(EndBlocks.METEORITE.asItem(), 0) == 48000, "... in the furnace's own fuel table too");
        h.assertTrue(AbstractFurnaceBlockEntity.isFuel(new ItemStack(EndBlocks.METEORITE)), "meteorite is fuel");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void recipesExist(GameTestHelper h) {
        var recipes = h.getLevel().getRecipeManager();
        String[] ids = {"polished_obsidian", "obsidian_bricks", "obsidian_tiles", "chiseled_obsidian", "cracked_obsidian_bricks",
                "cracked_obsidian_tiles", "polished_obsidian_stairs", "polished_obsidian_slab", "polished_obsidian_wall",
                "obsidian_brick_stairs", "obsidian_brick_slab", "obsidian_brick_wall", "obsidian_tile_stairs", "obsidian_tile_slab",
                "obsidian_tile_wall", "polished_meteorite", "meteorite_bricks", "meteorite_brick_stairs", "meteorite_brick_slab",
                "meteorite_brick_wall", "purple_dye_from_end_grass", "purple_dye_from_tall_end_grass", "chorus_fruit_block",
                "chorus_fruit_from_block", "obsidian_bricks_from_obsidian_stonecutting", "chiseled_obsidian_from_obsidian_stonecutting",
                "obsidian_tile_slab_from_obsidian_bricks_stonecutting", "meteorite_brick_wall_from_meteorite_stonecutting"};
        for (String id : ids) {
            h.assertTrue(recipes.byKey(Winterworks.id(id)).isPresent(), "missing recipe winterworks:" + id);
        }
        var level = h.getLevel();
        var dye = recipes.getRecipeFor(RecipeType.CRAFTING, CraftingInput.of(1, 1, List.of(new ItemStack(EndBlocks.TALL_END_GRASS))), level);
        h.assertTrue(dye.isPresent() && dye.get().value().assemble(CraftingInput.of(1, 1, List.of(new ItemStack(EndBlocks.TALL_END_GRASS))),
                level.registryAccess()).is(Items.PURPLE_DYE), "tall end grass crafts into purple dye");
        h.assertTrue(dye.get().value().getResultItem(level.registryAccess()).getCount() == 2, "... two of them");
        List<ItemStack> fruit = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            fruit.add(new ItemStack(Items.CHORUS_FRUIT));
        }
        var block = recipes.getRecipeFor(RecipeType.CRAFTING, CraftingInput.of(3, 3, fruit), level);
        h.assertTrue(block.isPresent() && block.get().value().getResultItem(level.registryAccess()).is(EndBlocks.CHORUS_FRUIT_BLOCK.asItem()),
                "nine chorus fruit make a block");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ worldgen

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void biomesAreInTheEndBiomeSource(GameTestHelper h) {
        var server = h.getLevel().getServer();
        ServerLevel end = server.getLevel(Level.END);
        h.assertTrue(end != null, "the End should exist");
        Set<Holder<Biome>> possible = end.getChunkSource().getGenerator().getBiomeSource().possibleBiomes();
        for (ResourceKey<Biome> b : List.of(EndWorldgen.CHORUS_MEADOWS, EndWorldgen.DEAD_END)) {
            h.assertTrue(possible.stream().anyMatch(x -> x.is(b)), b.location() + " should be in the End's biome source");
            var found = end.findClosestBiome3d(x -> x.is(b), new BlockPos(0, 64, 0), 6400, 32, 64);
            h.assertTrue(found != null, b.location() + " should turn up in the outer End");
            BlockPos at = found.getFirst();
            h.assertTrue(!EndGen.nearMainIsland(at.getX(), at.getZ()), "... never on the main island: " + at);
            var reg = server.registryAccess().registryOrThrow(Registries.BIOME);
            h.assertTrue(reg.getHolderOrThrow(b).is(TagKey.create(Registries.BIOME, ResourceLocation.withDefaultNamespace("is_end"))),
                    b.location() + " is an End biome");
        }
        h.succeed();
    }

    private static BlockPos farAway(GameTestHelper h, int dx) {
        return h.absolutePos(BlockPos.ZERO).offset(-2200 + dx, 0, 1800);
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void floatingIslandPlacesWithItsSurfaceAndRoots(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos c = farAway(h, 0).atY(level.getMinBuildHeight() + 150);
        EndWriter w = EndWriter.unclipped(level);
        FloatingIsland.build(w, c.getX(), c.getY(), c.getZ(), 11, EndGen.Style.MEADOWS, 99L);
        int stone = 0, grass = 0, roots = 0, plants = 0, minY = Integer.MAX_VALUE, maxR = 0;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int dx = -17; dx <= 17; dx++) {
            for (int dz = -17; dz <= 17; dz++) {
                for (int dy = -40; dy <= 30; dy++) {
                    BlockState s = level.getBlockState(p.set(c.getX() + dx, c.getY() + dy, c.getZ() + dz));
                    if (s.isAir()) {
                        continue;
                    }
                    if (s.is(Blocks.END_STONE)) {
                        stone++;
                    } else if (s.is(EndBlocks.END_GRASS_BLOCK) || s.is(EndBlocks.END_MOSS_BLOCK)) {
                        grass++;
                    } else if (s.is(EndBlocks.CHORUS_ROOTS)) {
                        roots++;
                        minY = Math.min(minY, dy);
                    } else if (!s.is(EndBlocks.CHORUS_STEM) && !s.is(Blocks.CHORUS_PLANT) && !s.is(Blocks.CHORUS_FLOWER)
                            && !s.is(EndBlocks.CHORUS_COCOON)) {
                        plants++;
                    }
                    if (!s.is(EndBlocks.CHORUS_ROOTS)) {
                        maxR = Math.max(maxR, Math.max(Math.abs(dx), Math.abs(dz)));
                    }
                }
            }
        }
        h.assertTrue(stone > 300, "an island of end stone, " + stone);
        h.assertTrue(grass > 150, "... with its own End Grass top, " + grass);
        h.assertTrue(plants > 10, "... and plants on it, " + plants);
        h.assertTrue(roots > 15 && minY < -10, "big chorus roots hanging under it, " + roots + " down to " + minY);
        h.assertTrue(maxR <= 15, "radius 4-14 (with its ragged edge), reached " + maxR);
        h.assertTrue(level.getBlockState(c.above(2)).is(EndBlocks.END_GRASS_BLOCK) || level.getBlockState(c.above(3)).is(EndBlocks.END_GRASS_BLOCK)
                || level.getBlockState(c.above(1)).is(EndBlocks.END_GRASS_BLOCK) || !level.getBlockState(c.above(4)).isAir(),
                "End Grass on the top at the centre");
        // the plans: radius 4-14, y 70-150
        for (int cx = 0; cx < 200; cx++) {
            FloatingIsland.Plan plan = FloatingIsland.plan(1234L, cx, cx * 7 - 300);
            if (plan != null) {
                h.assertTrue(plan.radius() >= 4 && plan.radius() <= 14 && plan.y() >= 70 && plan.y() <= 150, "plan out of range " + plan);
            }
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void meteoriteCraterPlaces(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos c = farAway(h, 60).atY(70);
        for (int dx = -14; dx <= 14; dx++) {
            for (int dz = -14; dz <= 14; dz++) {
                for (int dy = -6; dy <= 0; dy++) {
                    level.setBlock(c.offset(dx, dy, dz), dy == 0 ? EndBlocks.END_SAND.defaultBlockState() : Blocks.END_STONE.defaultBlockState(), 2);
                }
                for (int dy = 1; dy <= 8; dy++) {
                    level.setBlock(c.offset(dx, dy, dz), Blocks.AIR.defaultBlockState(), 2);
                }
            }
        }
        BlockPos core = Meteorite.crater(EndWriter.unclipped(level), c.getX(), c.getY() + 1, c.getZ(), 4242L);
        h.assertTrue(level.getBlockState(core).is(EndBlocks.METEORITE_CORE), "a meteorite core at the heart");
        int met = 0;
        for (BlockPos p : BlockPos.betweenClosed(core.offset(-3, -3, -3), core.offset(3, 3, 3))) {
            if (level.getBlockState(p).is(EndBlocks.METEORITE)) {
                met++;
            }
        }
        h.assertTrue(met >= 15, "... clustered round with meteorite, " + met);
        boolean covered = true;
        for (Direction d : Direction.values()) {
            covered &= level.getBlockState(core.relative(d)).is(EndBlocks.METEORITE);
        }
        h.assertTrue(covered, "the core is inside the cluster");
        h.assertTrue(core.getY() < c.getY(), "in a crater below the old ground: core at " + core.getY() + ", ground " + c.getY());
        h.assertTrue(!level.getBlockState(core.above(1)).isAir(), "half buried: meteorite shows above the core");
        int rim = 0;
        for (int dx = -11; dx <= 11; dx++) {
            if (!level.getBlockState(c.offset(dx, 1, 0)).isAir() && Math.abs(dx) > 6) {
                rim++;
            }
        }
        h.assertTrue(rim >= 2, "a raised rim round it, " + rim);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void chorusTreeGrows(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos c = farAway(h, 120).atY(80);
        for (int dx = -8; dx <= 8; dx++) {
            for (int dz = -8; dz <= 8; dz++) {
                level.setBlock(c.offset(dx, -1, dz), EndBlocks.END_GRASS_BLOCK.defaultBlockState(), 2);
                level.setBlock(c.offset(dx, -2, dz), Blocks.END_STONE.defaultBlockState(), 2);
            }
        }
        boolean grew = false;
        long id = 77;
        for (int i = 0; i < 8 && !grew; i++, id = EndGen.mix(id)) {
            grew = ChorusTree.grow(EndWriter.unclipped(level), c.getX(), c.getY(), c.getZ(), id);
        }
        h.assertTrue(grew, "a chorus tree should grow on open End Grass");
        int stems = 0, flowers = 0;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-9, -2, -9), c.offset(9, 22, 9))) {
            BlockState s = level.getBlockState(p);
            stems += s.is(EndBlocks.CHORUS_STEM) ? 1 : 0;
            flowers += s.is(Blocks.CHORUS_FLOWER) ? 1 : 0;
            if (s.is(Blocks.CHORUS_PLANT) || s.is(Blocks.CHORUS_FLOWER)) {
                h.assertTrue(s.canSurvive(level, p.immutable()), "every chorus twig and flower can stay: " + p);
            }
        }
        h.assertTrue(stems >= 14, "a thick trunk and branches of chorus stem, " + stems);
        h.assertTrue(flowers >= 3, "chorus flowers on its branches, " + flowers);
        h.succeed();
    }

    private record Found(int chests, int lootedRight, int suspicious, int suspiciousLooted, int blocks) {}

    private static Found scan(ServerLevel level, BoundingBox box, ResourceKey<LootTable> chestLoot, ResourceKey<LootTable> alt) {
        int chests = 0, right = 0, sus = 0, susLoot = 0, blocks = 0;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int x = box.minX(); x <= box.maxX(); x++) {
            for (int z = box.minZ(); z <= box.maxZ(); z++) {
                for (int y = box.minY(); y <= box.maxY(); y++) {
                    BlockState s = level.getBlockState(p.set(x, y, z));
                    if (s.is(Blocks.CHEST)) {
                        chests++;
                        if (level.getBlockEntity(p) instanceof ChestBlockEntity c
                                && (chestLoot.equals(c.getLootTable()) || alt != null && alt.equals(c.getLootTable()))) {
                            right++;
                        }
                    } else if (s.is(EndBlocks.SUSPICIOUS_END_SAND)) {
                        sus++;
                        if (level.getBlockEntity(p) instanceof BrushableBlockEntity b
                                && EndLoot.RUINS_ARCHAEOLOGY.equals(((dev.lowpix.winterworks.amber.BrushableLoot) b).ww$lootTable())) {
                            susLoot++;
                        }
                    } else if (s.is(EndBlocks.OBSIDIAN_BRICKS) || s.is(EndBlocks.POLISHED_OBSIDIAN) || s.is(Blocks.PURPUR_BLOCK)
                            || s.is(Blocks.END_STONE_BRICKS) || s.is(EndBlocks.OBSIDIAN_TILES)) {
                        blocks++;
                    }
                }
            }
        }
        return new Found(chests, right, sus, susLoot, blocks);
    }

    private static BlockPos structureSite(GameTestHelper h, int dx) {
        ServerLevel level = h.getLevel();
        BlockPos c = farAway(h, dx);
        int y = level.getHeight(net.minecraft.world.level.levelgen.Heightmap.Types.MOTION_BLOCKING, c.getX(), c.getZ());
        return c.atY(y);
    }

    private static void clearEntities(ServerLevel level, BoundingBox box) {
        for (Entity e : level.getEntities((Entity) null, AABB.of(box).inflate(2), e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void obsidianRuinsBuild(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos at = structureSite(h, 300).below();
        int guards = EndGuards.pending(level);
        BoundingBox box = EndStructure.build(level, EndStructure.Kind.OBSIDIAN_RUINS, at, Rotation.CLOCKWISE_90, 2026L);
        Found f = scan(level, box, EndLoot.RUINS_CHEST, null);
        h.assertTrue(f.chests() >= 1 && f.lootedRight() == f.chests(), "a chest with chests/obsidian_ruins loot, " + f);
        h.assertTrue(f.suspicious() >= 3 && f.suspiciousLooted() == f.suspicious(), "suspicious end sand with archaeology/obsidian_ruins, " + f);
        h.assertTrue(f.blocks() > 100, "built of obsidian bricks and tiles, " + f);
        h.assertTrue(EndGuards.pending(level) - guards >= 1, "1-2 disguised Obolisk guards queued");
        clearEntities(level, box);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void endShrineBuilds(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos at = structureSite(h, 400).above(1);
        int guards = EndGuards.pending(level);
        BoundingBox box = EndStructure.build(level, EndStructure.Kind.END_SHRINE, at, Rotation.NONE, 99L);
        Found f = scan(level, box, EndLoot.SHRINE_CHEST, null);
        h.assertTrue(f.chests() == 1 && f.lootedRight() == 1, "one chest on the altar with chests/end_shrine loot, " + f);
        h.assertTrue(level.getBlockState(at.above(1)).is(Blocks.PURPUR_PILLAR) && level.getBlockState(at.above(2)).is(Blocks.CHEST),
                "the chest stands on the altar");
        h.assertTrue(f.blocks() > 300, "built of end stone bricks and purpur, " + f);
        int moss = 0, blooms = 0;
        for (BlockPos p : BlockPos.betweenClosed(box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ())) {
            BlockState s = level.getBlockState(p);
            moss += s.is(EndBlocks.END_MOSS_BLOCK) ? 1 : 0;
            blooms += s.is(EndBlocks.END_BLOOM) ? 1 : 0;
        }
        h.assertTrue(moss > 20 && blooms >= 4, "overgrown with end moss (" + moss + ") and blooms (" + blooms + ")");
        h.assertTrue(EndGuards.pending(level) - guards >= 2, "2-3 disguised Obolisk guards queued");
        clearEntities(level, box);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 300)
    public void monolithTowerBuilds(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos at = structureSite(h, 500);
        int guards = EndGuards.pending(level);
        BoundingBox box = EndStructure.build(level, EndStructure.Kind.MONOLITH_TOWER, at, Rotation.COUNTERCLOCKWISE_90, 5L);
        Found f = scan(level, box, EndLoot.TOWER_CHEST, EndLoot.TOWER_TREASURE);
        h.assertTrue(f.chests() >= 5 && f.lootedRight() == f.chests(), "chests on the floors, " + f);
        int treasure = 0;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        int top = 0;
        for (int x = box.minX(); x <= box.maxX(); x++) {
            for (int z = box.minZ(); z <= box.maxZ(); z++) {
                for (int y = at.getY(); y <= box.maxY(); y++) {
                    BlockState s = level.getBlockState(p.set(x, y, z));
                    if (s.is(Blocks.CHEST) && level.getBlockEntity(p) instanceof ChestBlockEntity c && EndLoot.TOWER_TREASURE.equals(c.getLootTable())) {
                        treasure++;
                        h.assertTrue(y > at.getY() + 50 && y < at.getY() + 64, "the treasure lies under the arena: " + (y - at.getY()));
                    }
                    if (!s.isAir()) {
                        top = Math.max(top, y - at.getY());
                    }
                }
            }
        }
        h.assertTrue(treasure == 1, "one treasure chest, " + treasure);
        h.assertTrue(top >= 64, "60+ blocks tall, " + top);
        h.assertTrue(level.getBlockState(at.above(64)).is(EndBlocks.CHISELED_OBSIDIAN), "the arena floor at the top");
        var monoliths = level.getEntities(EndEntities.MONOLITH, AABB.of(box).inflate(2), e -> true);
        h.assertTrue(monoliths.size() == 1, "the Monolith on its arena, " + monoliths.size());
        var m = monoliths.get(0);
        h.assertTrue(m.isPersistenceRequired() && m.getY() > at.getY() + 64 && m.distanceToSqr(Vec3.atBottomCenterOf(at.above(65))) < 4,
                "persistent, at the arena centre: " + m.position());
        h.assertTrue(EndGuards.pending(level) - guards >= 4, "disguised Obolisks on the floors and at the door");
        clearEntities(level, box);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ loot

    private static int rolls(ServerLevel level, ResourceKey<LootTable> key, net.minecraft.world.item.Item item, int n) {
        LootTable table = level.getServer().reloadableRegistries().getLootTable(key);
        int hits = 0;
        for (int i = 0; i < n; i++) {
            LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, Vec3.ZERO).create(LootContextParamSets.CHEST);
            if (table.getRandomItems(params, i * 31L + 7).stream().anyMatch(s -> s.is(item))) {
                hits++;
            }
        }
        return hits;
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 100)
    public void lootTablesAndVoidRodChances(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        for (ResourceKey<LootTable> k : List.of(EndLoot.RUINS_CHEST, EndLoot.SHRINE_CHEST, EndLoot.TOWER_CHEST, EndLoot.TOWER_TREASURE,
                EndLoot.DEAD_END_ARCHAEOLOGY, EndLoot.RUINS_ARCHAEOLOGY)) {
            h.assertTrue(level.getServer().reloadableRegistries().getLootTable(k) != LootTable.EMPTY, k.location() + " should load");
        }
        int n = 600;
        int ruins = rolls(level, EndLoot.RUINS_CHEST, EndItems.VOID_ROD, n), tower = rolls(level, EndLoot.TOWER_CHEST, EndItems.VOID_ROD, n);
        int city = rolls(level, net.minecraft.world.level.storage.loot.BuiltInLootTables.END_CITY_TREASURE, EndItems.VOID_ROD, n * 2);
        h.assertTrue(ruins > n * 0.17 && ruins < n * 0.33, "obsidian ruins: a void rod 25% of the time, " + ruins + "/" + n);
        h.assertTrue(tower > n * 0.4 && tower < n * 0.6, "monolith tower: 50%, " + tower + "/" + n);
        h.assertTrue(city > n * 2 * 0.025 && city < n * 2 * 0.08, "End Cities: 5%, " + city + "/" + n * 2);
        h.assertTrue(rolls(level, net.minecraft.world.level.storage.loot.BuiltInLootTables.END_CITY_TREASURE, EndItems.OBSIDIAN_SHARD, 200) > 20,
                "End City chests hold obsidian shards");
        h.assertTrue(rolls(level, net.minecraft.world.level.storage.loot.BuiltInLootTables.END_CITY_TREASURE, EndBlocks.METEORITE.asItem(), 300) > 10,
                "... and meteorites");
        h.assertTrue(rolls(level, EndLoot.SHRINE_CHEST, EndItems.VOID_ROD, 300) == 0, "no void rods in shrines");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void blocksDropRight(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        record Case(BlockState state, ItemStack tool, net.minecraft.world.item.Item expect, int count) {}
        BlockState doubleSlab = EndBlocks.OBSIDIAN_BRICK_SLAB.defaultBlockState()
                .setValue(net.minecraft.world.level.block.SlabBlock.TYPE, net.minecraft.world.level.block.state.properties.SlabType.DOUBLE);
        List<Case> cases = List.of(
                new Case(doubleSlab, new ItemStack(Items.DIAMOND_PICKAXE), EndBlocks.OBSIDIAN_BRICK_SLAB.asItem(), 2),
                new Case(EndBlocks.OBSIDIAN_BRICK_SLAB.defaultBlockState(), new ItemStack(Items.DIAMOND_PICKAXE), EndBlocks.OBSIDIAN_BRICK_SLAB.asItem(), 1),
                new Case(EndBlocks.END_GRASS_BLOCK.defaultBlockState(), new ItemStack(Items.DIAMOND_PICKAXE), Items.END_STONE, 1),
                new Case(EndBlocks.METEORITE.defaultBlockState(), new ItemStack(Items.DIAMOND_PICKAXE), EndBlocks.METEORITE.asItem(), 1),
                new Case(EndBlocks.METEORITE_CORE.defaultBlockState(), new ItemStack(Items.DIAMOND_PICKAXE), EndBlocks.METEORITE_CORE.asItem(), 1),
                new Case(EndBlocks.END_GRASS.defaultBlockState(), new ItemStack(Items.SHEARS), EndBlocks.END_GRASS.asItem(), 1),
                new Case(EndBlocks.END_SAND.defaultBlockState(), ItemStack.EMPTY, EndBlocks.END_SAND.asItem(), 1));
        BlockPos p = h.absolutePos(new BlockPos(1, 2, 1));
        for (Case c : cases) {
            List<ItemStack> drops = Block.getDrops(c.state(), level, p, null, null, c.tool());
            int got = drops.stream().filter(s -> s.is(c.expect())).mapToInt(ItemStack::getCount).sum();
            h.assertTrue(got == c.count(), c.state() + " should drop " + c.count() + " " + c.expect() + ", dropped " + drops);
        }
        h.assertTrue(Block.getDrops(EndBlocks.END_GRASS.defaultBlockState(), level, p, null, null, ItemStack.EMPTY).isEmpty(),
                "end grass needs shears");
        h.assertTrue(EndBlocks.METEORITE.defaultBlockState().getLightEmission() == 15 && EndBlocks.METEORITE.defaultBlockState()
                .is(net.minecraft.tags.BlockTags.NEEDS_DIAMOND_TOOL), "meteorite glows and needs a diamond pickaxe");
        h.succeed();
    }

    /** The dev command's builder puts the entrance towards the builder. */
    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void commandBuildsInFront(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos stand = structureSite(h, 700);
        BlockPos origin = EndWorldFeature.buildInFront(level, EndStructure.Kind.OBSIDIAN_RUINS, Vec3.atBottomCenterOf(stand), 0f, 3L);
        h.assertTrue(origin.getZ() > stand.getZ() + 14, "built ahead (south, yaw 0) of the builder: " + origin + " from " + stand);
        BoundingBox box = new BoundingBox(origin).inflatedBy(15);
        clearEntities(level, box);
        h.succeed();
    }
}
