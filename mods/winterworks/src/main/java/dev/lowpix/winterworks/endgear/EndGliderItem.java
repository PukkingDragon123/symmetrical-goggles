package dev.lowpix.winterworks.endgear;

import dev.lowpix.winterworks.registry.EndSounds;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.UseAnim;
import net.minecraft.world.level.Level;

/**
 * The End Glider (docs/END_UPDATE.md section 12; the flight itself is endgear.EndGlider). Use while gliding on an
 * Elytra and hold it to boost. 432 durability, 1 per second of flight; repaired with phantom membrane.
 */
public class EndGliderItem extends Item {
    public EndGliderItem(Properties p) {
        super(p);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!EndGlider.active(player)) {
            return InteractionResultHolder.pass(stack);
        }
        player.startUsingItem(hand);
        if (!level.isClientSide) {
            level.playSound(null, player.getX(), player.getY(), player.getZ(), EndSounds.GLIDER_BOOST, SoundSource.PLAYERS, 1.0f,
                    0.95f + level.random.nextFloat() * 0.1f);
        }
        return InteractionResultHolder.consume(stack);
    }

    @Override
    public void onUseTick(Level level, LivingEntity user, ItemStack stack, int remaining) {
        if (user instanceof Player p && !EndGlider.active(p)) {
            user.releaseUsingItem();   // landed (or lost the elytra): the boost ends
        }
    }

    @Override
    public UseAnim getUseAnimation(ItemStack stack) {
        return UseAnim.NONE;
    }

    @Override
    public int getUseDuration(ItemStack stack, LivingEntity user) {
        return 72000;
    }

    @Override
    public boolean isValidRepairItem(ItemStack stack, ItemStack repair) {
        return repair.is(Items.PHANTOM_MEMBRANE);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.end_glider.tip").withStyle(ChatFormatting.GRAY));
        lines.add(Component.translatable("item.winterworks.end_glider.tip2").withStyle(ChatFormatting.GRAY));
    }
}
