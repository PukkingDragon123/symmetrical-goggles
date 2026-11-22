package dev.lowpix.winterworks.nether;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.serialization.Codec;
import dev.lowpix.winterworks.Winterworks;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureSet;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.phys.Vec3;

/**
 * The nether side of Hexes &amp; Havoc (docs/HEXES_UPDATE.md sections 1, 6, 7 and 8): the Piglin Witch, the Golden
 * Piglin, piglins and the elixirs (PiglinGreed) and the Hex Fortress (HexFortress, HexFortressPiece). Data (structure,
 * structure set, biome tag, loot tables, lang) comes from tools/data_nether.py.
 */
public final class NetherFeature {
    public static final ResourceKey<Structure> HEX_FORTRESS = ResourceKey.create(Registries.STRUCTURE, Winterworks.id("hex_fortress"));
    public static final ResourceKey<StructureSet> HEX_FORTRESS_SET = ResourceKey.create(Registries.STRUCTURE_SET,
            Winterworks.id("hex_fortress"));
    public static final StructureType<HexFortress> HEX_FORTRESS_TYPE = Registry.register(BuiltInRegistries.STRUCTURE_TYPE,
            Winterworks.id("hex_fortress"), () -> HexFortress.CODEC);
    public static final StructurePieceType HEX_FORTRESS_PIECE = Registry.register(BuiltInRegistries.STRUCTURE_PIECE,
            Winterworks.id("hex_fortress"), (StructurePieceType.ContextlessType) HexFortressPiece::new);

    public static final ResourceKey<LootTable> FORTRESS_CHEST = ResourceKey.create(Registries.LOOT_TABLE,
            Winterworks.id("chests/hex_fortress"));
    public static final ResourceKey<LootTable> GOLDEN_BARTER = ResourceKey.create(Registries.LOOT_TABLE,
            Winterworks.id("gameplay/golden_piglin_bartering"));
    /** The chests in the witch's laboratory (docs/FIXES_0_4.md "The Hex Fortress, reworked"). */
    public static final ResourceKey<LootTable> EXPERIMENTS_CHEST = ResourceKey.create(Registries.LOOT_TABLE,
            Winterworks.id("chests/hex_fortress_experiments"));

    /**
     * A piglin that drank Cursed Elixir (it also has the `golden` effect, which only the server knows about: mob
     * effects aren't sent to other players). Saved, and synced to every client for the golden shimmer and glints.
     */
    public static final AttachmentType<Boolean> GOLDEN = AttachmentRegistry.<Boolean>builder().persistent(Codec.BOOL)
            .syncWith(ByteBufCodecs.BOOL, AttachmentSyncPredicate.all()).buildAndRegister(Winterworks.id("golden"));
    /**
     * How far a piglin's (or brute's) gilding has got, in ticks of PiglinGreed.GILD_TICKS: present from the moment it
     * drinks Cursed Elixir until it becomes a Golden Piglin. Saved, and synced for the spreading shimmer.
     */
    public static final AttachmentType<Integer> GILDING = AttachmentRegistry.<Integer>builder().persistent(Codec.INT)
            .syncWith(ByteBufCodecs.VAR_INT, AttachmentSyncPredicate.all()).buildAndRegister(Winterworks.id("gilding"));

    private NetherFeature() {}

    public static void init() {
        PiglinGreed.init();
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> registerCommands(dispatcher));
        // ---- 0.4 fixes: Nether (docs/FIXES_0_4.md): the witch's crew, hoglin jockeys, the Withered Commander
        WitchCrew.init();
        HoglinJockeys.init();
        WitheredCommander.init();
        net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry.register(
                dev.lowpix.winterworks.registry.WWEntities.WITHERED_COMMANDER, WitheredCommander.createAttributes());
        net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents.modifyEntriesEvent(ResourceKey.create(Registries.CREATIVE_MODE_TAB,
                Winterworks.id("main"))).register(entries -> {
                    for (net.minecraft.world.item.Item i : new net.minecraft.world.item.Item[]{dev.lowpix.winterworks.registry.WWItems.NETHERITE_SPEAR,
                            dev.lowpix.winterworks.registry.WWItems.WITHERED_COMMANDER_SPAWN_EGG}) {
                        if (entries.getDisplayStacks().stream().noneMatch(st -> st.is(i))) {
                            entries.accept(i);
                        }
                    }
                });
    }

    /** `/winterworks hexfortress`: builds a Hex Fortress (witch, piglins, golden piglin and all) in front of you. */
    private static void registerCommands(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("winterworks").requires(s -> s.hasPermission(2))
                .then(Commands.literal("hexfortress").requires(s -> s.hasPermission(2)).executes(ctx -> {
                    CommandSourceStack src = ctx.getSource();
                    ServerLevel level = src.getLevel();
                    Vec3 at = src.getPosition();
                    float yaw = src.getRotation().y;
                    Vec3 ahead = Vec3.directionFromRotation(0, yaw).scale(HexFortress.REACH + 4);
                    BlockPos origin = BlockPos.containing(at.x + ahead.x, at.y, at.z + ahead.z);
                    // the main gate (south side, before rotation) faces the player
                    Rotation rot = switch (net.minecraft.core.Direction.fromYRot(yaw)) {
                        case SOUTH -> Rotation.CLOCKWISE_180;
                        case WEST -> Rotation.COUNTERCLOCKWISE_90;
                        case EAST -> Rotation.CLOCKWISE_90;
                        default -> Rotation.NONE;
                    };
                    BoundingBox box = HexFortress.build(level, origin, rot, level.getRandom().nextLong());
                    src.sendSuccess(() -> Component.translatable("message.winterworks.hexfortress.built", origin.getX(), origin.getY(),
                            origin.getZ(), box.getXSpan(), box.getZSpan()), true);
                    return 1;
                })));
    }
}
