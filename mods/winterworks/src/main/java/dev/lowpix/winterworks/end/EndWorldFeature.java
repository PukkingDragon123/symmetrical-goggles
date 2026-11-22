package dev.lowpix.winterworks.end;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import dev.lowpix.winterworks.registry.EndBlocks;
import net.fabricmc.fabric.api.biome.v1.TheEndBiomes;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.registry.FuelRegistry;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * The world of the Living End (docs/END_UPDATE.md sections 1-3): Chorus Meadows and the Dead End as End highlands
 * (each its own midlands and barrens), their terrain features (EndFeatures), the Obsidian Ruins, End Shrines and the
 * Monolith Tower (EndStructure) with their guards (EndGuards), meteorite as fuel, End City loot (EndLoot), and
 * {@code /winterworks endstructure <obsidian_ruins|end_shrine|monolith_tower>}. Data: tools/data_end_world.py.
 */
public final class EndWorldFeature {
    public static final int CHORUS_MEADOWS_WEIGHT = 8, DEAD_END_WEIGHT = 6;
    /** Meteorite burns for 48000 ticks: 240 items. */
    public static final int METEORITE_BURN = 48000;

    private EndWorldFeature() {}

    public static void init() {
        EndFeatures.init();
        EndStructures.init();
        TheEndBiomes.addHighlandsBiome(EndWorldgen.CHORUS_MEADOWS, CHORUS_MEADOWS_WEIGHT);
        TheEndBiomes.addMidlandsBiome(EndWorldgen.CHORUS_MEADOWS, EndWorldgen.CHORUS_MEADOWS, 1.0);
        TheEndBiomes.addBarrensBiome(EndWorldgen.CHORUS_MEADOWS, EndWorldgen.CHORUS_MEADOWS, 1.0);
        TheEndBiomes.addHighlandsBiome(EndWorldgen.DEAD_END, DEAD_END_WEIGHT);
        TheEndBiomes.addMidlandsBiome(EndWorldgen.DEAD_END, EndWorldgen.DEAD_END, 1.0);
        TheEndBiomes.addBarrensBiome(EndWorldgen.DEAD_END, EndWorldgen.DEAD_END, 1.0);
        FuelRegistry.INSTANCE.add(EndBlocks.METEORITE, METEORITE_BURN);
        EndLoot.init();
        EndGuards.init();
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> registerCommands(dispatcher));
    }

    /** `/winterworks endstructure <kind>`: builds one in front of you, its entrance facing you. */
    private static void registerCommands(CommandDispatcher<CommandSourceStack> dispatcher) {
        LiteralArgumentBuilder<CommandSourceStack> end = Commands.literal("endstructure").requires(s -> s.hasPermission(2));
        for (EndStructure.Kind kind : EndStructure.Kind.values()) {
            end.then(Commands.literal(kind.id).executes(ctx -> {
                CommandSourceStack src = ctx.getSource();
                BlockPos origin = buildInFront(src.getLevel(), kind, src.getPosition(), src.getRotation().y, src.getLevel().getRandom().nextLong());
                src.sendSuccess(() -> Component.translatable("message.winterworks.endstructure.built",
                        Component.translatable("structure.winterworks." + kind.id), origin.getX(), origin.getY(), origin.getZ()), true);
                return 1;
            }));
        }
        dispatcher.register(Commands.literal("winterworks").requires(s -> s.hasPermission(2)).then(end));
    }

    /** The top of the ground at (x, z) near height `y` (not a floating island overhead), or the highest block there. */
    public static int groundNear(ServerLevel level, int x, int z, double y) {
        for (int yy = (int) Math.floor(y) + 6; yy > y - 40 && yy > level.getMinBuildHeight(); yy--) {
            BlockPos p = new BlockPos(x, yy, z);
            if (!level.getBlockState(p).isAir() && !level.getBlockState(p).canBeReplaced() && level.getBlockState(p.above()).isAir()
                    && level.getBlockState(p.above(2)).isAir()) {
                return yy;
            }
        }
        return level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z) - 1;
    }

    /** Builds `kind` in front of `at` (looking along `yaw`), on the ground there; returns its origin. */
    public static BlockPos buildInFront(ServerLevel level, EndStructure.Kind kind, Vec3 at, float yaw, long seed) {
        Vec3 ahead = Vec3.directionFromRotation(0, yaw).scale(kind.reach + 6);
        int x = (int) Math.floor(at.x + ahead.x), z = (int) Math.floor(at.z + ahead.z);
        int ground = groundNear(level, x, z, at.y);
        int y = switch (kind) {
            case OBSIDIAN_RUINS -> ground - 1;
            case END_SHRINE -> ground + 2;
            case MONOLITH_TOWER -> ground + 1;
        };
        BlockPos origin = new BlockPos(x, y, z);
        // the entrance (+z before turning) faces the builder
        Rotation rot = switch (Direction.fromYRot(yaw)) {
            case SOUTH -> Rotation.CLOCKWISE_180;
            case WEST -> Rotation.COUNTERCLOCKWISE_90;
            case EAST -> Rotation.CLOCKWISE_90;
            default -> Rotation.NONE;
        };
        EndStructure.build(level, kind, origin, rot, seed);
        return origin;
    }
}
