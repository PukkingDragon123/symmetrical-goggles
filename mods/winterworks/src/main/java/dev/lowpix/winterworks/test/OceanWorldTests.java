package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.ocean.DepthCarver;
import dev.lowpix.winterworks.ocean.HydrothermalVentBlock;
import dev.lowpix.winterworks.ocean.MonumentRework;
import dev.lowpix.winterworks.ocean.OceanDepths;
import dev.lowpix.winterworks.ocean.OceanLoot;
import dev.lowpix.winterworks.ocean.OceanStructure;
import dev.lowpix.winterworks.ocean.OceanWorldgen;
import dev.lowpix.winterworks.ocean.TubeWormsBlock;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanParticles;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BiomeTags;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.RandomizableContainer;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Cod;
import net.minecraft.world.entity.monster.ElderGuardian;
import net.minecraft.world.entity.monster.Guardian;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.item.crafting.SingleRecipeInput;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.FallingBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.StructurePiece;
import net.minecraft.world.level.levelgen.structure.structures.OceanMonumentPieces;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the Tides & Treasures world (docs/OCEAN_UPDATE.md sections 1, 2, 6, 7): the biomes in the overworld's
 * biome source, the carving of the deep oceans (water, no air pockets, no leaks), the deep shape (trenches, the shelf,
 * formations), vents poisoning and melting ice, tube worms hiding, Silk Touch, the three structures with their chests
 * and loot, the monument rework (one elder), the blocks and the recipes. The builds go far from the test grid.
 */
public class OceanWorldTests implements FabricGameTest {
    private static final String BATCH = "winterworks_ocean_world";
    private static final long SEED = 20261122L;

    private static BlockPos farAway(GameTestHelper h, int dx) {
        return h.absolutePos(BlockPos.ZERO).offset(3100 + dx, 0, -2700);
    }

    // ------------------------------------------------------------------------------------------ biomes

    @GameTest(template = EMPTY_STRUCTURE)
    public void biomesAreInTheOverworld(GameTestHelper h) {
        var registries = h.getLevel().registryAccess();
        var params = registries.registryOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST)
                .getHolderOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD).value().parameters();
        for (ResourceKey<Biome> b : List.of(OceanWorldgen.VOLCANIC_DEPTHS, OceanWorldgen.ABYSSAL_TRENCH)) {
            h.assertTrue(params.values().stream().anyMatch(p -> p.getSecond().is(b)), "the overworld's biome list should include " + b.location());
            var holder = registries.registryOrThrow(Registries.BIOME).getHolderOrThrow(b);
            h.assertTrue(holder.is(BiomeTags.IS_OCEAN) && holder.is(BiomeTags.IS_DEEP_OCEAN), b.location() + " is a deep ocean");
        }
        // the deep-ocean slots: far out the new biomes, all the way down (no cave biome ties with them); near the shelf vanilla's
        record Case(float t, float h, float c, float depth, ResourceKey<Biome> want) {}
        for (Case c : List.of(new Case(0f, 0f, -0.8f, 0f, OceanWorldgen.ABYSSAL_TRENCH), new Case(-0.3f, 0.3f, -0.9f, 0f, OceanWorldgen.ABYSSAL_TRENCH),
                new Case(0.1f, 0.3f, -0.8f, 1.0f, OceanWorldgen.ABYSSAL_TRENCH), new Case(0f, 0f, -0.8f, 0.75f, OceanWorldgen.ABYSSAL_TRENCH),
                new Case(0.4f, 0f, -0.8f, 0f, OceanWorldgen.VOLCANIC_DEPTHS), new Case(0.75f, 0.2f, -0.7f, 0f, OceanWorldgen.VOLCANIC_DEPTHS),
                new Case(0f, 0f, -0.5f, 0f, Biomes.DEEP_OCEAN), new Case(0.4f, 0f, -0.5f, 0f, Biomes.DEEP_LUKEWARM_OCEAN),
                new Case(0.7f, 0f, -0.5f, 0f, Biomes.WARM_OCEAN), new Case(-0.7f, 0f, -0.8f, 0f, Biomes.DEEP_FROZEN_OCEAN),
                new Case(0f, 0f, -0.3f, 0f, Biomes.OCEAN), new Case(0f, 0.85f, -0.5f, 0.55f, Biomes.LUSH_CAVES))) {
            Holder<Biome> got = params.findValue(Climate.target(c.t(), c.h(), c.c(), 0f, c.depth(), 0f));
            h.assertTrue(got.is(c.want()), "climate " + c + " should be " + c.want().location() + ", got " + got.unwrapKey().orElse(null));
        }
        // like every surface biome they never reach under the shelf or the land
        for (float c : new float[]{-0.1f, -0.2f, -0.3f, -0.45f}) {
            for (float d : new float[]{0.3f, 0.5f, 0.7f}) {
                for (float t : new float[]{-0.3f, 0f, 0.4f, 0.7f}) {
                    Holder<Biome> got = params.findValue(Climate.target(t, 0f, c, 0f, d, 0f));
                    h.assertFalse(got.is(OceanWorldgen.ABYSSAL_TRENCH) || got.is(OceanWorldgen.VOLCANIC_DEPTHS),
                            "the deep biomes stay out from under the shelf and the land: " + got.unwrapKey().orElse(null) + " at c " + c + " depth " + d);
                }
            }
        }
        // spawns from the depth table; the abyss's bioluminescence
        var abyss = registries.registryOrThrow(Registries.BIOME).getOrThrow(OceanWorldgen.ABYSSAL_TRENCH);
        var water = abyss.getMobSettings().getMobs(net.minecraft.world.entity.MobCategory.WATER_CREATURE).unwrap();
        h.assertTrue(water.stream().anyMatch(e -> e.type == OceanEntities.ANGLERFISH), "anglerfish live in the abyssal trench");
        h.assertTrue(water.stream().anyMatch(e -> e.type == OceanEntities.NAUTILUS), "... and nautiluses");
        h.assertTrue(abyss.getAmbientParticle().isPresent() && abyss.getAmbientParticle().get().getOptions().getType() == OceanParticles.BIOLUMINESCENCE,
                "glowing motes in the abyss");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the depths

    /** The shape of the deep: the shelf stays, the deep floor at -10..-30, trenches to -55, formations. */
    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void deepOceanShape(GameTestHelper h) {
        OceanDepths.ClimateField shelf = OceanDepths.fixed(-0.35, 0.0), abyss = OceanDepths.fixed(-0.8, 0.0), warm = OceanDepths.fixed(-0.8, 0.6);
        double lowest = Double.MAX_VALUE, sum = 0;
        int n = 0, deep = 0;
        for (int x = -1200; x <= 1200; x += 8) {
            for (int z = -1200; z <= 1200; z += 8) {
                h.assertTrue(OceanDepths.floor(SEED, shelf, x, z) >= OceanDepths.TOP, "the shelf keeps its vanilla floor");
                double f = OceanDepths.floor(SEED, abyss, x, z);
                lowest = Math.min(lowest, f);
                h.assertTrue(f >= -55 && f < 16, "the abyss floor is carved deep, " + f + " at " + x + "," + z);
                double v = OceanDepths.floor(SEED, warm, x, z);
                h.assertTrue(v >= -36 && v < 16, "the volcanic floor has no trenches, " + v);
                sum += v;
                n++;
                deep += v <= -10 && v >= -30 ? 1 : 0;
            }
        }
        h.assertTrue(lowest <= -54, "trenches reach down to y -55, deepest " + lowest);
        h.assertTrue(deep > n * 0.6, "most of the deep floor lies at y -10..-30, " + deep + "/" + n);
        h.assertTrue(sum / n < -12 && sum / n > -26, "around y -19 on average, " + sum / n);
        h.assertTrue(OceanDepths.zone(SEED, abyss, 0, 0) == OceanDepths.Zone.ABYSSAL && OceanDepths.zone(SEED, warm, 0, 0) == OceanDepths.Zone.VOLCANIC,
                "the abyssal and volcanic zones");
        List<OceanDepths.Formation> forms = OceanDepths.formations(SEED, abyss, -400, -400, 400, 400);
        h.assertTrue(forms.size() > 10, "rock formations stand on the deep floor, " + forms.size());
        h.assertTrue(forms.stream().anyMatch(f -> f.kind() == OceanDepths.Formation.ARCH) && forms.stream().anyMatch(f -> f.kind() == OceanDepths.Formation.PILLAR),
                "pillars and arches");
        h.succeed();
    }

    /** The carving deepens an ocean: water all the way down to the new floor, no air pockets, nothing leaking in. */
    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 300)
    public void carvingDeepensTheOcean(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        OceanDepths.ClimateField climate = OceanDepths.fixed(-0.8, 0.0);
        // a chunk of open deep floor (not a ridge), out of the way of the test grid
        int x0 = 0, z0 = 0;
        OceanDepths.Area area = null;
        for (int i = 0; i < 40 && area == null; i++) {
            int cx = 3200 + i * 16, cz = -2800;
            OceanDepths.Area a = OceanDepths.area(SEED, climate, cx - 1, cz - 1, 18, 18, List.of());
            double hi = -100;
            for (int x = cx; x < cx + 16; x++) {
                for (int z = cz; z < cz + 16; z++) {
                    hi = Math.max(hi, a.col(x, z).floor);
                }
            }
            if (hi < -6) {
                area = a;
                x0 = cx;
                z0 = cz;
            }
        }
        h.assertTrue(area != null, "a deep chunk to carve");
        // a vanilla-like deep ocean: stone to y 34, a gravel floor, water up to the sea
        for (int x = x0 - 1; x <= x0 + 16; x++) {
            for (int z = z0 - 1; z <= z0 + 16; z++) {
                for (int y = -58; y <= 62; y++) {
                    BlockState s = y < 34 ? (y < 0 ? Blocks.DEEPSLATE : Blocks.STONE).defaultBlockState() : y == 34 ? Blocks.GRAVEL.defaultBlockState()
                            : Blocks.WATER.defaultBlockState();
                    level.setBlock(new BlockPos(x, y, z), s, Block.UPDATE_CLIENTS);
                }
            }
        }
        // an air pocket and a lava pocket in the rock, where the new floor will be
        BlockPos air = new BlockPos(x0 + 4, (int) Math.floor(area.col(x0 + 4, z0 + 4).floor), z0 + 4);
        BlockPos lava = new BlockPos(x0 + 11, (int) Math.floor(area.col(x0 + 11, z0 + 9).floor), z0 + 9);
        level.setBlock(air, Blocks.AIR.defaultBlockState(), Block.UPDATE_CLIENTS);
        level.setBlock(lava, Blocks.LAVA.defaultBlockState(), Block.UPDATE_CLIENTS);
        // the biome source puts cave biomes down there: deep ocean over lush caves
        var biomes = level.registryAccess().registryOrThrow(Registries.BIOME);
        net.minecraft.server.commands.FillBiomeCommand.fill(level, new BlockPos(x0, -60, z0), new BlockPos(x0 + 15, 28, z0 + 15),
                biomes.getHolderOrThrow(Biomes.LUSH_CAVES));
        net.minecraft.server.commands.FillBiomeCommand.fill(level, new BlockPos(x0, 32, z0), new BlockPos(x0 + 15, 76, z0 + 15),
                biomes.getHolderOrThrow(Biomes.DEEP_OCEAN));
        int changed = DepthCarver.carve(area, x0, z0, x0 + 15, z0 + 15, DepthCarver.level(level));
        h.assertTrue(DepthCarver.rebiome(level.getChunk(x0 >> 4, z0 >> 4), area) > 0, "the carved water takes the sea's biome");
        int wrong = 0;
        for (int x = x0 + 2; x <= x0 + 14; x += 4) {
            for (int z = z0 + 2; z <= z0 + 14; z += 4) {
                for (int y = (Math.floorDiv((int) Math.ceil(area.col(x, z).floor) + 4, 4) << 2) + 2; y <= 26; y += 4) {
                    if (area.carved(x, y, z) && !level.getBiome(new BlockPos(x, y, z)).is(Biomes.DEEP_OCEAN)) {
                        wrong++;
                    }
                }
            }
        }
        h.assertTrue(wrong == 0, "no cave biome left in the open water, " + wrong + " quarts");
        h.assertTrue(level.getBiome(new BlockPos(x0 + 8, (int) area.col(x0 + 8, z0 + 8).floor - 8, z0 + 8)).is(Biomes.LUSH_CAVES),
                "the rock under the floor keeps its own");
        h.assertTrue(changed > 16 * 16 * 30, "most of the chunk is carved out, " + changed + " blocks");
        int lowest = Integer.MAX_VALUE, airCells = 0, flowing = 0, notWater = 0;
        for (int x = x0; x <= x0 + 15; x++) {
            for (int z = z0; z <= z0 + 15; z++) {
                double f = area.col(x, z).floor;
                for (int y = OceanDepths.BOTTOM - 2; y <= 62; y++) {
                    BlockState s = level.getBlockState(new BlockPos(x, y, z));
                    if (s.isAir()) {
                        airCells++;
                    }
                    if (s.is(Blocks.WATER) && !s.getFluidState().isSource()) {
                        flowing++;
                    }
                    if (y > f && y <= OceanDepths.TOP && !area.formation(x, y, z) && !s.is(Blocks.WATER)) {
                        notWater++;
                    }
                }
                lowest = Math.min(lowest, (int) Math.floor(f));
            }
        }
        h.assertTrue(airCells == 0, "no air pockets left in the carved ocean, " + airCells);
        h.assertTrue(notWater == 0, "everything above the new floor is water, " + notWater + " cells aren't");
        h.assertTrue(flowing == 0, "the water is still, " + flowing + " flowing cells");
        h.assertTrue(lowest <= -10, "the floor is deepened from y 34 to the deep (y -10..-30 or a trench), lowest " + lowest);
        h.assertTrue(!level.getBlockState(air).isAir() && !level.getBlockState(lava).is(Blocks.LAVA), "the air pocket and the lava are sealed in rock: "
                + level.getBlockState(air) + ", " + level.getBlockState(lava));
        // the new floor is laid with sediment, not left as raw stone everywhere
        int sediment = 0;
        for (int x = x0; x <= x0 + 15; x++) {
            for (int z = z0; z <= z0 + 15; z++) {
                BlockState s = level.getBlockState(new BlockPos(x, (int) Math.floor(area.col(x, z).floor), z));
                sediment += s.is(Blocks.GRAVEL) || s.is(Blocks.CLAY) || s.is(Blocks.TUFF) || s.is(Blocks.COBBLED_DEEPSLATE) ? 1 : 0;
            }
        }
        h.assertTrue(sediment > 60, "the new floor gets the abyss's gravel, clay and tuff, " + sediment + "/256");
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ vents and tube worms

    private static void pool(GameTestHelper h, int size, int depth) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
                for (int y = 1; y <= depth; y++) {
                    h.setBlock(new BlockPos(x, y, z), Blocks.WATER);
                }
            }
        }
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void ventsPoisonTheWaterAndMeltIce(GameTestHelper h) {
        pool(h, 11, 5);
        BlockPos vent = new BlockPos(5, 1, 5);
        h.setBlock(vent, OceanBlocks.HYDROTHERMAL_VENT.defaultBlockState().setValue(HydrothermalVentBlock.WATERLOGGED, true));
        h.setBlock(new BlockPos(7, 3, 5), Blocks.ICE);
        Cod near = h.spawn(EntityType.COD, new BlockPos(7, 2, 6));
        Cod far = h.spawn(EntityType.COD, new BlockPos(10, 2, 10));
        near.setNoAi(true);
        far.setNoAi(true);
        ServerPlayer p = h.makeMockServerPlayerInLevel();   // vents only tick with a player near
        p.setGameMode(GameType.SURVIVAL);
        BlockPos stand = h.absolutePos(new BlockPos(5, 7, -6));
        p.teleportTo(stand.getX() + 0.5, stand.getY(), stand.getZ() + 0.5);
        h.assertTrue(h.getLevel().getBlockEntity(h.absolutePos(vent)) != null, "the vent has its block entity");
        h.succeedWhen(() -> {
            h.assertTrue(near.hasEffect(MobEffects.POISON), "a fish swimming by the vent is poisoned");
            h.assertTrue(near.getEffect(MobEffects.POISON).getAmplifier() == 0, "... Poison I");
            h.assertFalse(far.hasEffect(MobEffects.POISON), "but not one 7 blocks away");
            h.assertBlockPresent(Blocks.WATER, new BlockPos(7, 3, 5));
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void ventFieldBuilds(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = seabed(level, farAway(h, 800), 16, 12);
        BoundingBox all = new BoundingBox(origin.getX() - 16, origin.getY() - 8, origin.getZ() - 16, origin.getX() + 16, origin.getY() + 14,
                origin.getZ() + 16);
        int vents = dev.lowpix.winterworks.ocean.VolcanicVents.field(level, all, origin.below(), RandomSource.create(9L));
        h.assertTrue(vents >= 2 && count(level, all, OceanBlocks.HYDROTHERMAL_VENT) == vents, "a field of vents, " + vents);
        int worms = count(level, all, OceanBlocks.TUBE_WORMS), ore = count(level, all, Blocks.RAW_GOLD_BLOCK) + count(level, all, Blocks.RAW_IRON_BLOCK);
        h.assertTrue(worms >= 8, "tube worms round the vents, " + worms);
        h.assertTrue(ore >= 20, "big seams of raw gold and raw iron blocks round them, " + ore);
        h.assertTrue(count(level, all, OceanBlocks.ASH_SAND) >= 5 && count(level, all, Blocks.BASALT) >= 5, "basalt mounds in drifts of ash sand");
        for (BlockPos p : BlockPos.betweenClosed(all.minX(), all.minY(), all.minZ(), all.maxX(), all.maxY(), all.maxZ())) {
            BlockState s = level.getBlockState(p);
            if (s.is(OceanBlocks.HYDROTHERMAL_VENT)) {
                h.assertTrue(s.getValue(HydrothermalVentBlock.WATERLOGGED) && level.getBlockEntity(p) != null, "vents are waterlogged, with their block entity");
            } else if (s.is(OceanBlocks.TUBE_WORMS)) {
                h.assertTrue(s.getFluidState().isSource() && s.canSurvive(level, p), "tube worms stand waterlogged on the floor at " + p);
            }
        }
        h.succeed();
    }

    private static boolean hasFeature(Biome b, net.minecraft.world.level.levelgen.GenerationStep.Decoration step, String id) {
        var steps = b.getGenerationSettings().features();
        return steps.size() > step.ordinal() && steps.get(step.ordinal()).stream().anyMatch(f -> f.is(Winterworks.id(id)));
    }

    /** Reefs: sponge clusters (wet on the floor, dry buried under it), and the denser plants in the warm biomes. */
    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void reefSpongesGrow(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos c = farAway(h, 1000).atY(44);
        for (int x = -7; x <= 7; x++) {
            for (int z = -7; z <= 7; z++) {
                for (int y = 38; y <= 62; y++) {
                    BlockState s = y <= 44 ? Blocks.SAND.defaultBlockState()
                            : y == 45 && Math.floorMod(x + z, 3) == 0 ? Blocks.SEAGRASS.defaultBlockState() : Blocks.WATER.defaultBlockState();
                    level.setBlock(c.offset(x, y - 44, z), s, Block.UPDATE_CLIENTS);
                }
            }
        }
        BoundingBox box = new BoundingBox(c.getX() - 7, 38, c.getZ() - 7, c.getX() + 7, 62, c.getZ() + 7);
        int laid = dev.lowpix.winterworks.ocean.ReefSponges.cluster(level, c.above(), RandomSource.create(3L));
        h.assertTrue(laid >= 3 && count(level, box, Blocks.WET_SPONGE) == laid, "a cluster of wet sponges on the reef, " + laid);
        for (BlockPos p : BlockPos.betweenClosed(box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ())) {
            if (level.getBlockState(p).is(Blocks.SPONGE)) {
                for (Direction d : Direction.values()) {
                    h.assertTrue(level.getFluidState(p.relative(d)).isEmpty(), "dry sponges lie buried, out of the water");
                }
            }
        }
        var biomes = level.registryAccess().registryOrThrow(Registries.BIOME);
        var veg = net.minecraft.world.level.levelgen.GenerationStep.Decoration.VEGETAL_DECORATION;
        for (ResourceKey<Biome> b : List.of(Biomes.WARM_OCEAN, Biomes.LUKEWARM_OCEAN, Biomes.DEEP_LUKEWARM_OCEAN)) {
            for (String f : List.of("reef_sponges", "reef_seagrass", "reef_kelp", "reef_sea_pickle")) {
                h.assertTrue(hasFeature(biomes.getOrThrow(b), veg, f), b.location() + " has " + f);
            }
        }
        h.assertFalse(hasFeature(biomes.getOrThrow(Biomes.COLD_OCEAN), veg, "reef_sponges"), "cold oceans have no reefs");
        var raw = net.minecraft.world.level.levelgen.GenerationStep.Decoration.RAW_GENERATION;
        for (ResourceKey<Biome> b : List.of(Biomes.DEEP_OCEAN, Biomes.OCEAN, Biomes.DEEP_FROZEN_OCEAN, OceanWorldgen.ABYSSAL_TRENCH, OceanWorldgen.VOLCANIC_DEPTHS)) {
            h.assertTrue(hasFeature(biomes.getOrThrow(b), raw, "ocean_depths"), b.location() + " is carved by ocean_depths");
        }
        h.assertTrue(hasFeature(biomes.getOrThrow(OceanWorldgen.VOLCANIC_DEPTHS), net.minecraft.world.level.levelgen.GenerationStep.Decoration.LOCAL_MODIFICATIONS,
                "volcanic_vents"), "vent fields in the volcanic depths");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 400)
    public void tubeWormsHideFromPlayers(GameTestHelper h) {
        pool(h, 12, 3);
        BlockPos near = new BlockPos(3, 1, 3), farOff = new BlockPos(10, 1, 10);
        h.setBlock(near, OceanBlocks.TUBE_WORMS.defaultBlockState());
        h.setBlock(farOff, OceanBlocks.TUBE_WORMS.defaultBlockState());
        h.assertTrue(h.getBlockState(near).getValue(TubeWormsBlock.EXTENDED) && h.getBlockState(near).getFluidState().isSource(),
                "tube worms stand out of their tubes, waterlogged");
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        BlockPos at = h.absolutePos(new BlockPos(5, 1, 4));
        p.teleportTo(at.getX() + 0.5, at.getY(), at.getZ() + 0.5);
        h.runAfterDelay(20, () -> {
            h.assertFalse(h.getBlockState(near).getValue(TubeWormsBlock.EXTENDED), "they pull in when a player comes within 4 blocks");
            h.assertTrue(h.getBlockState(farOff).getValue(TubeWormsBlock.EXTENDED), "worms further off stay out");
            BlockPos away = h.absolutePos(new BlockPos(5, 1, 40));
            p.teleportTo(away.getX() + 0.5, away.getY(), away.getZ() + 0.5);
        });
        h.runAfterDelay(200, () -> {
            h.assertTrue(h.getBlockState(near).getValue(TubeWormsBlock.EXTENDED), "and come out again a few seconds after the player leaves");
            // only Silk Touch collects them
            ServerLevel level = h.getLevel();
            BlockState s = h.getBlockState(near);
            ItemStack silk = new ItemStack(Items.DIAMOND_PICKAXE);
            silk.enchant(level.registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(Enchantments.SILK_TOUCH), 1);
            List<ItemStack> withSilk = Block.getDrops(s, level, h.absolutePos(near), null, p, silk);
            List<ItemStack> bare = Block.getDrops(s, level, h.absolutePos(near), null, p, ItemStack.EMPTY);
            h.assertTrue(withSilk.size() == 1 && withSilk.get(0).is(OceanBlocks.TUBE_WORMS.asItem()), "Silk Touch collects tube worms: " + withSilk);
            h.assertTrue(bare.isEmpty(), "otherwise they break to nothing: " + bare);
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------ structures

    /** A flat deep floor at y -20 with water over it, round `c`. */
    private static BlockPos seabed(ServerLevel level, BlockPos c, int r, int water) {
        int floor = -20;
        for (int x = -r; x <= r; x++) {
            for (int z = -r; z <= r; z++) {
                for (int y = floor - 3; y <= floor + water; y++) {
                    BlockState s = y < floor ? Blocks.STONE.defaultBlockState() : y == floor ? Blocks.GRAVEL.defaultBlockState() : Blocks.WATER.defaultBlockState();
                    level.setBlock(new BlockPos(c.getX() + x, y, c.getZ() + z), s, Block.UPDATE_CLIENTS);
                }
            }
        }
        return new BlockPos(c.getX(), floor + 1, c.getZ());
    }

    /** The chests (and barrels) in `box`, by loot table. */
    private static Map<ResourceKey<LootTable>, Integer> containers(ServerLevel level, BoundingBox box) {
        Map<ResourceKey<LootTable>, Integer> out = new HashMap<>();
        for (BlockPos p : BlockPos.betweenClosed(box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ())) {
            if (level.getBlockEntity(p) instanceof RandomizableContainer rc && rc.getLootTable() != null) {
                out.merge(rc.getLootTable(), 1, Integer::sum);
            }
        }
        return out;
    }

    private static int count(ServerLevel level, BoundingBox box, Block b) {
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(box.minX(), box.minY(), box.minZ(), box.maxX(), box.maxY(), box.maxZ())) {
            n += level.getBlockState(p).is(b) ? 1 : 0;
        }
        return n;
    }

    /** Rolls `table` `n` times; the items it gave, by kind. */
    private static Map<net.minecraft.world.item.Item, Integer> roll(GameTestHelper h, ResourceKey<LootTable> table, int n) {
        ServerLevel level = h.getLevel();
        LootTable t = level.getServer().reloadableRegistries().getLootTable(table);
        h.assertTrue(t != LootTable.EMPTY, "the loot table " + table.location() + " exists");
        Map<net.minecraft.world.item.Item, Integer> got = new HashMap<>();
        for (int i = 0; i < n; i++) {
            LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, h.absoluteVec(Vec3.ZERO)).create(LootContextParamSets.CHEST);
            for (ItemStack st : t.getRandomItems(params, (long) i * 7919 + 13)) {
                got.merge(st.getItem(), st.getCount(), Integer::sum);
            }
        }
        h.assertTrue(!got.isEmpty(), table.location() + " gives loot");
        return got;
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 300)
    public void deepShipwreckBuilds(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = seabed(level, farAway(h, 200), 28, 12);
        BoundingBox box = OceanStructure.build(level, OceanStructure.Kind.DEEP_SHIPWRECK, origin, Rotation.CLOCKWISE_90, 77L);
        Map<ResourceKey<LootTable>, Integer> chests = containers(level, box);
        h.assertTrue(chests.getOrDefault(OceanLoot.DEEP_SHIPWRECK_TREASURE, 0) == 1, "a treasure chest in the captain's cabin: " + chests);
        h.assertTrue(chests.getOrDefault(OceanLoot.DEEP_SHIPWRECK_SUPPLY, 0) == 1, "a supply chest under the forecastle");
        h.assertTrue(chests.getOrDefault(OceanLoot.DEEP_SHIPWRECK_CARGO, 0) >= 3, "cargo chests and barrels in the hold");
        h.assertTrue(count(level, box, Blocks.DARK_OAK_PLANKS) > 300, "a big dark oak hull, " + count(level, box, Blocks.DARK_OAK_PLANKS));
        h.assertTrue(count(level, box, OceanBlocks.BARNACLES) > 60, "crusted with barnacles, " + count(level, box, OceanBlocks.BARNACLES));
        h.assertTrue(count(level, box, Blocks.DARK_OAK_LOG) > 20, "masts");
        h.assertTrue(box.getZSpan() >= 40 || box.getXSpan() >= 40, "a galleon, " + box);
        for (ResourceKey<LootTable> t : List.of(OceanLoot.DEEP_SHIPWRECK_SUPPLY, OceanLoot.DEEP_SHIPWRECK_CARGO, OceanLoot.DEEP_SHIPWRECK_TREASURE)) {
            roll(h, t, 10);
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void sunkenTreasureBuilds(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = seabed(level, farAway(h, 300), 9, 6);
        BoundingBox box = OceanStructure.build(level, OceanStructure.Kind.SUNKEN_TREASURE, origin, Rotation.NONE, 5L);
        Map<ResourceKey<LootTable>, Integer> chests = containers(level, box);
        h.assertTrue(chests.equals(Map.of(OceanLoot.SUNKEN_TREASURE, 1)), "one lone chest of sunken treasure: " + chests);
        BlockPos chest = origin.below();
        h.assertTrue(level.getBlockState(chest).is(Blocks.CHEST) && level.getBlockState(chest).getFluidState().isSource(),
                "half buried in the floor, waterlogged: " + level.getBlockState(chest));
        var got = roll(h, OceanLoot.SUNKEN_TREASURE, 120);
        int hearts = got.getOrDefault(Items.HEART_OF_THE_SEA, 0);
        h.assertTrue(hearts > 10 && hearts < 60, "the Heart of the Sea is possible (about one chest in four), " + hearts + "/120");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void whaleSkeletonBuilds(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = seabed(level, farAway(h, 400), 28, 10);
        BoundingBox box = OceanStructure.build(level, OceanStructure.Kind.WHALE_SKELETON, origin, Rotation.COUNTERCLOCKWISE_90, 31L);
        int bones = count(level, box, Blocks.BONE_BLOCK), worms = count(level, box, OceanBlocks.TUBE_WORMS);
        h.assertTrue(bones > 200, "a huge skeleton of bone blocks, " + bones);
        h.assertTrue(worms >= 8, "tube worms round the bones, " + worms);
        Map<ResourceKey<LootTable>, Integer> chests = containers(level, box);
        h.assertTrue(chests.getOrDefault(OceanLoot.WHALE_SKELETON, 0) == 1, "the whale's last swallow in a chest: " + chests);
        roll(h, OceanLoot.WHALE_SKELETON, 10);
        List<Entity> fish = level.getEntitiesOfClass(Entity.class, AABB.of(box).inflate(2), e -> e.getType() == OceanEntities.ANGLERFISH);
        h.assertTrue(!fish.isEmpty(), "anglerfish hunt round it");
        fish.forEach(Entity::discard);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ monuments

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 400)
    public void monumentReworkLeavesOneElder(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos c = farAway(h, 600);
        var building = new OceanMonumentPieces.MonumentBuilding(RandomSource.create(4242L), c.getX(), c.getZ(), Direction.NORTH);
        BoundingBox all = building.getBoundingBox();
        for (int cx = all.minX() >> 4; cx <= all.maxX() >> 4; cx++) {
            for (int cz = all.minZ() >> 4; cz <= all.maxZ() >> 4; cz++) {
                BoundingBox chunk = new BoundingBox(cx << 4, level.getMinBuildHeight(), cz << 4, (cx << 4) + 15, level.getMaxBuildHeight() - 1, (cz << 4) + 15);
                building.postProcess(level, level.structureManager(), level.getChunkSource().getGenerator(), RandomSource.create(cx * 31L + cz),
                        chunk, new net.minecraft.world.level.ChunkPos(cx, cz), all.getCenter());
            }
        }
        AABB area = AABB.of(all).inflate(4);
        List<ElderGuardian> elders = level.getEntitiesOfClass(ElderGuardian.class, area);
        List<Guardian> guardians = level.getEntitiesOfClass(Guardian.class, area, g -> !(g instanceof ElderGuardian));
        try {
            h.assertTrue(elders.size() == 1, "exactly one Elder Guardian stays, " + elders.size());
            h.assertTrue(guardians.size() >= 2, "the other two elder spawns became guardians, " + guardians.size());
            StructurePiece core = null;
            for (var p : ((MonumentRework.Building) building).ww$rooms()) {
                if (p instanceof OceanMonumentPieces.OceanMonumentCoreRoom) {
                    core = p;
                }
            }
            h.assertTrue(core != null && core.getBoundingBox().inflatedBy(1).isInside(elders.get(0).blockPosition()),
                    "the elder is in the core chamber, the boss arena: " + elders.get(0).blockPosition() + " vs " + (core == null ? null : core.getBoundingBox()));
            h.assertTrue(count(level, core.getBoundingBox(), Blocks.GOLD_BLOCK) == 8, "the core's gold is kept");
            h.assertTrue(count(level, core.getBoundingBox().inflatedBy(1), Blocks.SEA_LANTERN) >= 16, "the arena is lit");
            Map<ResourceKey<LootTable>, Integer> chests = containers(level, all);
            h.assertTrue(chests.getOrDefault(OceanLoot.MONUMENT_CORE, 0) == 2, "two chests in the core: " + chests);
            h.assertTrue(chests.getOrDefault(OceanLoot.MONUMENT_WING, 0) == 4, "two in each wing: " + chests);
            h.assertTrue(chests.getOrDefault(OceanLoot.MONUMENT_TREASURE, 0) == 4, "two treasure rooms of two chests: " + chests);
            for (ResourceKey<LootTable> t : List.of(OceanLoot.MONUMENT_CORE, OceanLoot.MONUMENT_WING, OceanLoot.MONUMENT_TREASURE)) {
                roll(h, t, 10);
            }
        } finally {
            elders.forEach(Entity::discard);
            guardians.forEach(Entity::discard);
        }
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ blocks and recipes

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void blocksAndParticles(GameTestHelper h) {
        BlockState barnacles = OceanBlocks.BARNACLES.defaultBlockState();
        h.assertTrue(barnacles.getDestroySpeed(h.getLevel(), BlockPos.ZERO) == 25f && barnacles.requiresCorrectToolForDrops()
                && barnacles.is(BlockTags.MINEABLE_WITH_PICKAXE), "barnacles are hard, pickaxe only");
        h.assertTrue(OceanBlocks.ASH_SAND instanceof FallingBlock && OceanBlocks.ASH_SAND.defaultBlockState().is(BlockTags.MINEABLE_WITH_SHOVEL),
                "ash sand falls like sand and digs with a shovel");
        for (Block b : List.of(OceanBlocks.ASHSTONE, OceanBlocks.ASHSTONE_BRICK_WALL, OceanBlocks.POLISHED_ASHSTONE_SLAB, OceanBlocks.CHISELED_ASHSTONE,
                OceanBlocks.HYDROTHERMAL_VENT)) {
            h.assertTrue(b.defaultBlockState().is(BlockTags.MINEABLE_WITH_PICKAXE), BuiltInRegistries.BLOCK.getKey(b) + " mines with a pickaxe");
        }
        h.assertTrue(OceanBlocks.ASHSTONE_STAIRS.defaultBlockState().is(BlockTags.STAIRS) && OceanBlocks.ASHSTONE_BRICK_SLAB.defaultBlockState().is(BlockTags.SLABS)
                && OceanBlocks.POLISHED_ASHSTONE_WALL.defaultBlockState().is(BlockTags.WALLS), "stairs, slabs and walls are tagged");
        for (String p : List.of("vent_smoke", "bioluminescence")) {
            h.assertTrue(BuiltInRegistries.PARTICLE_TYPE.containsKey(Winterworks.id(p)), "particle " + p + " is registered");
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void ashstoneRecipes(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        var recipes = level.getRecipeManager();
        var smelt = recipes.getRecipeFor(RecipeType.SMELTING, new SingleRecipeInput(new ItemStack(OceanBlocks.ASH_SAND)), level);
        h.assertTrue(smelt.isPresent() && smelt.get().value().getResultItem(level.registryAccess()).is(OceanBlocks.ASHSTONE.asItem()),
                "smelting ash sand makes ashstone");
        var cracked = recipes.getRecipeFor(RecipeType.SMELTING, new SingleRecipeInput(new ItemStack(OceanBlocks.ASHSTONE_BRICKS)), level);
        h.assertTrue(cracked.isPresent() && cracked.get().value().getResultItem(level.registryAccess()).is(OceanBlocks.CRACKED_ASHSTONE_BRICKS.asItem()),
                "and cracks ashstone bricks");
        List<ItemStack> four = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            four.add(new ItemStack(OceanBlocks.ASHSTONE));
        }
        var polished = recipes.getRecipeFor(RecipeType.CRAFTING, CraftingInput.of(2, 2, four), level);
        h.assertTrue(polished.isPresent() && polished.get().value().getResultItem(level.registryAccess()).is(OceanBlocks.POLISHED_ASHSTONE.asItem())
                && polished.get().value().getResultItem(level.registryAccess()).getCount() == 4, "four ashstone make four polished (a 2x2 chain)");
        var cuts = recipes.getRecipesFor(RecipeType.STONECUTTING, new SingleRecipeInput(new ItemStack(OceanBlocks.ASHSTONE)), level);
        h.assertTrue(cuts.size() >= 12, "the stonecutter takes ashstone down the whole set, " + cuts.size() + " recipes");
        for (String id : List.of("ashstone_stairs", "ashstone_slab", "ashstone_wall", "polished_ashstone_stairs", "polished_ashstone_slab",
                "polished_ashstone_wall", "ashstone_brick_stairs", "ashstone_brick_slab", "ashstone_brick_wall", "chiseled_ashstone", "ashstone_bricks",
                "polished_ashstone", "ashstone_bricks_from_polished_ashstone_stonecutting", "chiseled_ashstone_from_ashstone_bricks_stonecutting",
                "ashstone_brick_wall_from_ashstone_stonecutting")) {
            h.assertTrue(recipes.byKey(Winterworks.id(id)).isPresent(), "missing recipe winterworks:" + id);
        }
        h.succeed();
    }
}
