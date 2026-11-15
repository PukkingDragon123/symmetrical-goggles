package dev.lowpix.winterworks.icebreaker;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Shearable;
import net.minecraft.world.entity.animal.Sheep;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ShearsItem;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.ChatFormatting;

/**
 * Heavy Shears: an expensive upgrade of shears. Cuts a whole connected canopy of leaves at once (dropping the leaf
 * blocks), gets more wool from sheep, and is the only tool that can take an Icebreaker's horn.
 */
public class HeavyShearsItem extends ShearsItem {
    public static final int MAX_LEAVES = 64;
    public static final int MAX_RADIUS = 7;

    public HeavyShearsItem(Properties props) {
        super(props);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.heavy_shears.tip").withStyle(ChatFormatting.GRAY));
    }

    public static void init() {
        // cut connected leaves: runs before the vanilla break so the clicked block also drops as a leaf block
        PlayerBlockBreakEvents.BEFORE.register((level, player, pos, state, be) -> {
            ItemStack tool = player.getMainHandItem();
            if (!(tool.getItem() instanceof HeavyShearsItem) || !state.is(BlockTags.LEAVES) || !(level instanceof ServerLevel sl)
                    || !(player instanceof ServerPlayer sp) || player.isShiftKeyDown()) {
                return true;   // sneak to cut a single block the normal way
            }
            int cut = 0;
            for (BlockPos p : connectedLeaves(sl, pos, state.getBlock())) {
                BlockState s = sl.getBlockState(p);
                if (!p.equals(pos) && !PlayerBlockBreakEvents.BEFORE.invoker().beforeBlockBreak(sl, player, p, s, sl.getBlockEntity(p))) {
                    continue;   // another mod (claims, protection) said no
                }
                if (!sl.mayInteract(player, p) || player.blockActionRestricted(sl, p, sp.gameMode.getGameModeForPlayer())) {
                    continue;
                }
                sl.levelEvent(2001, p, Block.getId(s));
                sl.removeBlock(p, false);
                if (!player.getAbilities().instabuild) {
                    Block.popResource(sl, p, new ItemStack(s.getBlock()));
                }
                cut++;
            }
            if (cut > 0) {
                sl.playSound(null, pos, SoundEvents.SHEEP_SHEAR, SoundSource.PLAYERS, 1.0f, 0.7f);
                tool.hurtAndBreak(Math.max(1, cut / 4), player, EquipmentSlot.MAINHAND);
                return false;   // handled
            }
            return true;
        });
        // more wool, and Shearable mobs in general (vanilla checks for the plain shears item)
        UseEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
            ItemStack tool = player.getItemInHand(hand);
            if (!(tool.getItem() instanceof HeavyShearsItem) || entity instanceof IcebreakerEntity) {
                return InteractionResult.PASS;
            }
            if (entity instanceof Shearable s && s.readyForShearing()) {
                if (!level.isClientSide) {
                    s.shear(SoundSource.PLAYERS);
                    if (entity instanceof Sheep sheep) {
                        ResourceLocation wool = ResourceLocation.withDefaultNamespace(sheep.getColor().getName() + "_wool");
                        int extra = 1 + sheep.getRandom().nextInt(3);
                        for (int i = 0; i < extra; i++) {
                            sheep.spawnAtLocation(new ItemStack(BuiltInRegistries.ITEM.get(wool)), 1.0f);
                        }
                    }
                    entity.gameEvent(GameEvent.SHEAR, player);
                    tool.hurtAndBreak(1, player, LivingEntity.getSlotForHand(hand));
                }
                return InteractionResult.sidedSuccess(level.isClientSide);
            }
            return InteractionResult.PASS;
        });
    }

    /** Leaves of the same kind connected to `start` (faces and edges), nearest first, capped for performance. */
    static List<BlockPos> connectedLeaves(ServerLevel level, BlockPos start, Block kind) {
        Set<BlockPos> seen = new HashSet<>();
        ArrayDeque<BlockPos> queue = new ArrayDeque<>();
        java.util.ArrayList<BlockPos> out = new java.util.ArrayList<>();
        queue.add(start);
        seen.add(start);
        while (!queue.isEmpty() && out.size() < MAX_LEAVES) {
            BlockPos p = queue.poll();
            out.add(p);
            for (int dx = -1; dx <= 1; dx++) {
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        BlockPos n = p.offset(dx, dy, dz);
                        if (seen.contains(n) || n.distManhattan(start) > MAX_RADIUS * 2 || Math.abs(n.getX() - start.getX()) > MAX_RADIUS
                                || Math.abs(n.getY() - start.getY()) > MAX_RADIUS || Math.abs(n.getZ() - start.getZ()) > MAX_RADIUS) {
                            continue;
                        }
                        seen.add(n);
                        if (level.getBlockState(n).is(kind)) {
                            queue.add(n);
                        }
                    }
                }
            }
        }
        return out;
    }
}
