package dev.lowpix.winterworks.ocean;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.OceanParticles;
import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BiomeTags;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.placement.PlacedFeature;
import net.minecraft.world.level.levelgen.structure.BuiltinStructures;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.phys.Vec3;

/**
 * The world of Tides & Treasures (docs/OCEAN_UPDATE.md sections 1, 2, 6, 7): the deep, carved oceans (OceanDepths,
 * DepthCarver) in every ocean biome, the volcanic depths and the abyssal trench (mixin.ocean.OceanBiomeBuilderMixin,
 * biome JSONs), vent fields (VolcanicVents), richer reefs (ReefSponges and denser seagrass, kelp and sea pickles), the
 * deep shipwrecks, sunken treasure and whale skeletons (OceanStructure), the monument rework (MonumentRework), tube
 * worms hiding from players (TubeWormsBlock#watch) and {@code /winterworks oceanstructure <kind>}. Data:
 * tools/data_ocean_world.py.
 */
public final class OceanWorldFeature {
    /** Vanilla floor structures don't start where the carved deep floor lies below this (see #notInTheDeep). */
    public static final int DEEP_FLOOR = 25;

    private OceanWorldFeature() {}

    public static void init() {
        OceanParticles.init();
        OceanFeatures.init();
        OceanStructures.init();
        BiomeModifications.addFeature(BiomeSelectors.tag(BiomeTags.IS_OCEAN), GenerationStep.Decoration.RAW_GENERATION, placed("ocean_depths"));
        var reefs = BiomeSelectors.includeByKey(Biomes.WARM_OCEAN, Biomes.LUKEWARM_OCEAN, Biomes.DEEP_LUKEWARM_OCEAN);
        for (String f : new String[]{"reef_seagrass", "reef_kelp", "reef_sea_pickle", "reef_sponges"}) {
            BiomeModifications.addFeature(reefs, GenerationStep.Decoration.VEGETAL_DECORATION, placed(f));
        }
        ServerTickEvents.END_WORLD_TICK.register(TubeWormsBlock::watch);
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> registerCommands(dispatcher));
    }

    private static ResourceKey<PlacedFeature> placed(String name) {
        return ResourceKey.create(Registries.PLACED_FEATURE, Winterworks.id(name));
    }

    /**
     * Whether vanilla structure `s` must not start in `ctx`'s chunk: shipwrecks, ocean ruins and ocean ruined portals
     * sit on the floor they find when they start (before the carving), and trial chambers lie just under it, so none
     * of them start where the carved floor is deeper than {@link #DEEP_FLOOR}.
     */
    public static boolean notInTheDeep(Structure s, Structure.GenerationContext ctx) {
        StructureType<?> t = s.type();
        boolean floorBound = t == StructureType.SHIPWRECK || t == StructureType.OCEAN_RUIN || t == StructureType.RUINED_PORTAL;
        if (!floorBound && t == StructureType.JIGSAW) {
            var key = ctx.registryAccess().registryOrThrow(Registries.STRUCTURE).getKey(s);
            floorBound = key != null && key.equals(BuiltinStructures.TRIAL_CHAMBERS.location());
        }
        if (!floorBound || !(ctx.chunkGenerator() instanceof NoiseBasedChunkGenerator)) {
            return false;
        }
        ChunkPos cp = ctx.chunkPos();
        OceanDepths.ClimateField cf = new OceanDepths.Sampled(ctx.randomState().sampler());
        return OceanDepths.floor(ctx.seed(), cf, cp.getMiddleBlockX(), cp.getMiddleBlockZ()) < DEEP_FLOOR;
    }

    // ============================================================================================ the dev command

    /** `/winterworks oceanstructure <kind>`: builds one on the sea floor in front of you, broadside on. */
    private static void registerCommands(CommandDispatcher<CommandSourceStack> dispatcher) {
        LiteralArgumentBuilder<CommandSourceStack> ocean = Commands.literal("oceanstructure").requires(s -> s.hasPermission(2));
        for (OceanStructure.Kind kind : OceanStructure.Kind.values()) {
            ocean.then(Commands.literal(kind.id).executes(ctx -> {
                CommandSourceStack src = ctx.getSource();
                BlockPos origin = buildInFront(src.getLevel(), kind, src.getPosition(), src.getRotation().y, src.getLevel().getRandom().nextLong());
                if (origin == null) {
                    src.sendFailure(Component.translatable("message.winterworks.oceanstructure.no_floor"));
                    return 0;
                }
                src.sendSuccess(() -> Component.translatable("message.winterworks.oceanstructure.built",
                        Component.translatable("structure.winterworks." + kind.id), origin.getX(), origin.getY(), origin.getZ()), true);
                return 1;
            }));
        }
        dispatcher.register(Commands.literal("winterworks").requires(s -> s.hasPermission(2)).then(ocean));
    }

    /** The first water block over the sea floor under (x, z), searching down from `y`; null if there's no floor. */
    public static BlockPos floorUnder(ServerLevel level, int x, int z, double y) {
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos(x, Math.min((int) Math.floor(y) + 4, level.getMaxBuildHeight() - 1), z);
        level.getChunk(m);
        for (; m.getY() > level.getMinBuildHeight(); m.move(Direction.DOWN)) {
            BlockState s = level.getBlockState(m);
            if (!s.isAir() && s.getFluidState().isEmpty() && s.blocksMotion()) {
                return m.above().immutable();
            }
        }
        return null;
    }

    /** Builds `kind` in front of `at` (looking along `yaw`) on the floor there, its length across your view; returns its origin. */
    public static BlockPos buildInFront(ServerLevel level, OceanStructure.Kind kind, Vec3 at, float yaw, long seed) {
        Vec3 ahead = Vec3.directionFromRotation(0, yaw).scale(kind == OceanStructure.Kind.SUNKEN_TREASURE ? 5 : 15);
        int x = (int) Math.floor(at.x + ahead.x), z = (int) Math.floor(at.z + ahead.z);
        BlockPos origin = floorUnder(level, x, z, at.y);
        if (origin == null) {
            return null;
        }
        Direction facing = Direction.fromYRot(yaw);
        Rotation rot = facing.getAxis() == Direction.Axis.Z ? Rotation.CLOCKWISE_90 : Rotation.NONE;
        OceanStructure.build(level, kind, origin, rot, seed);
        return origin;
    }
}
