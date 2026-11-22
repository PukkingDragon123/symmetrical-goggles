package dev.lowpix.winterworks.oceangear;

import com.mojang.authlib.GameProfile;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.tree.CommandNode;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.registry.OceanItems;
import java.lang.reflect.Field;
import java.util.Collection;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.Event;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerBlockEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.AttackBlockCallback;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.GameProfileArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ProjectileWeaponItem;
import net.minecraft.world.item.TridentItem;
import net.minecraft.world.item.UseAnim;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.functions.EnchantedCountIncreaseFunction;
import net.minecraft.world.level.storage.loot.functions.SetItemCountFunction;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;
import net.minecraft.world.level.storage.loot.providers.number.UniformGenerator;

/**
 * Tides & Treasures: the gear and the boss (docs/OCEAN_UPDATE.md sections 4-6). Lionfish darts from dispensers;
 * guardian scales and the Elder Guardian Eye in the vanilla loot; the Turtle Shell retreat's rules (no attacking, no
 * digging, no drawing a bow; the sound); the Eye of the Ocean's guard on block breaking; the trust commands. The
 * Elder Guardian boss runs from mixin.oceangear.ElderGuardianMixin (ElderBoss).
 */
public final class OceanGearFeature {
    /** Subcommands of /winterworks anyone may use (the rest of /winterworks stays for operators). */
    private static final Set<String> PUBLIC = Set.of("trust", "untrust");
    private static final ResourceLocation LATE = Winterworks.id("ocean_gear_late");
    /** The Eyes of the Ocean loaded in each level (block entity load / unload). */
    private static final Map<ServerLevel, Set<BlockPos>> EYES = new WeakHashMap<>();

    private OceanGearFeature() {}

    public static void init() {
        DispenserBlock.registerProjectileBehavior(OceanItems.LIONFISH_DART);
        loot();
        retreat();
        eyes();
        CommandRegistrationCallback.EVENT.register((dispatcher, registries, env) -> commands(dispatcher));
        CommandRegistrationCallback.EVENT.addPhaseOrdering(Event.DEFAULT_PHASE, LATE);
        CommandRegistrationCallback.EVENT.register(LATE, (dispatcher, registries, env) -> openTrustCommands(dispatcher));
    }

    // ------------------------------------------------------------------------------------------- loot

    private static void loot() {
        LootTableEvents.MODIFY.register((key, table, source, registries) -> {
            if (!source.isBuiltin()) {
                return;
            }
            if (key.equals(EntityType.GUARDIAN.getDefaultLootTable())) {
                table.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(LootItem.lootTableItem(OceanItems.GUARDIAN_SCALE)
                        .apply(SetItemCountFunction.setCount(UniformGenerator.between(1, 3)))
                        .apply(EnchantedCountIncreaseFunction.lootingMultiplier(registries, UniformGenerator.between(0, 1)))));
            } else if (key.equals(EntityType.ELDER_GUARDIAN.getDefaultLootTable())) {
                table.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(LootItem.lootTableItem(OceanItems.ELDER_GUARDIAN_EYE)));
            }
        });
    }

    // ------------------------------------------------------------------------------------------- the shell

    private static void retreat() {
        AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) ->
                TurtleShell.isRetreating(player) ? InteractionResult.FAIL : InteractionResult.PASS);
        UseItemCallback.EVENT.register((player, level, hand) -> {
            ItemStack stack = player.getItemInHand(hand);
            if (TurtleShell.isRetreating(player) && (stack.getItem() instanceof ProjectileWeaponItem || stack.getItem() instanceof TridentItem
                    || stack.getUseAnimation() == UseAnim.BOW || stack.getUseAnimation() == UseAnim.CROSSBOW
                    || stack.getUseAnimation() == UseAnim.SPEAR || stack.is(OceanItems.LIONFISH_DART))) {
                return InteractionResultHolder.fail(stack);
            }
            return InteractionResultHolder.pass(stack);
        });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            for (ServerPlayer p : server.getPlayerList().getPlayers()) {
                TurtleShell.tickPlayer(p);
            }
        });
    }

    // ------------------------------------------------------------------------------------------- the Eye of the Ocean

    private static void eyes() {
        ServerBlockEntityEvents.BLOCK_ENTITY_LOAD.register((be, level) -> {
            if (be instanceof EyeOfTheOceanBlockEntity) {
                EYES.computeIfAbsent(level, l -> new HashSet<>()).add(be.getBlockPos().immutable());
            }
        });
        ServerBlockEntityEvents.BLOCK_ENTITY_UNLOAD.register((be, level) -> {
            if (be instanceof EyeOfTheOceanBlockEntity) {
                Set<BlockPos> s = EYES.get(level);
                if (s != null) {
                    s.remove(be.getBlockPos());
                }
            }
        });
        AttackBlockCallback.EVENT.register((player, level, hand, pos, dir) -> {
            if (TurtleShell.isRetreating(player)) {
                return InteractionResult.FAIL;
            }
            if (!level.isClientSide) {
                guard(player, level, pos);
            }
            return InteractionResult.PASS;
        });
    }

    /**
     * Someone starts breaking the block at `pos`: if an Eye of the Ocean within range belongs to someone who doesn't
     * trust them, Mining Fatigue III. Returns whether it struck (test hook).
     */
    public static boolean guard(Player player, Level level, BlockPos pos) {
        if (player.isCreative() || player.isSpectator() || !(level instanceof ServerLevel sl)) {
            return false;
        }
        Set<BlockPos> eyes = EYES.get(sl);
        if (eyes == null) {
            return false;
        }
        for (BlockPos at : eyes) {
            if (sl.getBlockEntity(at) instanceof EyeOfTheOceanBlockEntity eye && eye.owner() != null && eye.inRange(pos) && !eye.favours(player)) {
                player.addEffect(new MobEffectInstance(MobEffects.DIG_SLOWDOWN, EyeOfTheOceanBlockEntity.FATIGUE_TICKS,
                        EyeOfTheOceanBlockEntity.FATIGUE_LEVEL));
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------- trust

    private static void commands(CommandDispatcher<CommandSourceStack> d) {
        d.register(Commands.literal("winterworks")
                .then(Commands.literal("trust").executes(ctx -> list(ctx.getSource()))
                        .then(Commands.argument("player", GameProfileArgument.gameProfile())
                                .executes(ctx -> trust(ctx.getSource(), GameProfileArgument.getGameProfiles(ctx, "player"), true))))
                .then(Commands.literal("untrust")
                        .then(Commands.argument("player", GameProfileArgument.gameProfile())
                                .executes(ctx -> trust(ctx.getSource(), GameProfileArgument.getGameProfiles(ctx, "player"), false)))));
    }

    private static int list(CommandSourceStack src) throws CommandSyntaxException {
        ServerPlayer p = src.getPlayerOrException();
        var names = TrustData.get(src.getServer()).names(p.getUUID());
        if (names.isEmpty()) {
            src.sendSuccess(() -> Component.translatable("commands.winterworks.trust.none"), false);
        } else {
            src.sendSuccess(() -> Component.translatable("commands.winterworks.trust.list", String.join(", ", names)), false);
        }
        return names.size();
    }

    private static int trust(CommandSourceStack src, Collection<GameProfile> who, boolean add) throws CommandSyntaxException {
        ServerPlayer p = src.getPlayerOrException();
        TrustData data = TrustData.get(src.getServer());
        int n = 0;
        for (GameProfile g : who) {
            if (g.getId().equals(p.getUUID())) {
                src.sendFailure(Component.translatable("commands.winterworks.trust.self"));
                continue;
            }
            if (add) {
                boolean added = data.trust(p.getUUID(), g.getId(), g.getName());
                src.sendSuccess(() -> Component.translatable(added ? "commands.winterworks.trust.added" : "commands.winterworks.trust.already",
                        g.getName()), false);
                n++;
            } else if (data.untrust(p.getUUID(), g.getId())) {
                src.sendSuccess(() -> Component.translatable("commands.winterworks.trust.removed", g.getName()), false);
                n++;
            } else {
                src.sendFailure(Component.translatable("commands.winterworks.trust.not_trusted", g.getName()));
            }
        }
        return n;
    }

    /**
     * /winterworks is an operators' command (the other areas register it with an op requirement on the root): once
     * everything is registered, move that requirement onto each of its other subcommands and open the root, so trust
     * and untrust need no op while the rest still do.
     */
    private static void openTrustCommands(CommandDispatcher<CommandSourceStack> d) {
        CommandNode<CommandSourceStack> root = d.getRoot().getChild("winterworks");
        if (root == null) {
            return;
        }
        Predicate<CommandSourceStack> rootReq = root.getRequirement();
        try {
            Field f = CommandNode.class.getDeclaredField("requirement");
            f.setAccessible(true);
            for (CommandNode<CommandSourceStack> child : root.getChildren()) {
                if (!PUBLIC.contains(child.getName())) {
                    Predicate<CommandSourceStack> own = child.getRequirement();
                    f.set(child, rootReq.and(own));
                }
            }
            f.set(root, (Predicate<CommandSourceStack>) s -> true);
        } catch (ReflectiveOperationException | RuntimeException e) {
            Winterworks.LOG.warn("Couldn't open /winterworks trust to everyone; it needs op for now", e);
        }
    }
}
