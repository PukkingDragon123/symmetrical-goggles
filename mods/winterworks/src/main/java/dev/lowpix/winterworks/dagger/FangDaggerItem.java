package dev.lowpix.winterworks.dagger;

import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.level.Level;

/**
 * Fang Daggers, made from a Frost Mauler fang (docs/COLD_UPDATE.md section 9, docs/FIXES_0_4.md). The item is the
 * pair: held in the main hand with the off hand free, it draws a dagger in each hand and fights in a frenzy
 * ({@link DaggerFeature}). <b>Left click strikes with the left dagger, right click with the right dagger.</b> With
 * something else in the off hand (a shield, a torch) it is one fast knife. A second Fang Dagger in the off hand also
 * counts as the pair (that dagger is then the left one).
 *
 * <p>Right click never gets in the way of vanilla: blocks with a use (chests, doors, crafting tables...) and mobs with
 * one (villagers, horses, pets...) are used first, as with any item; only what is left (a mob that ignores you) is
 * struck, and right clicking the air is a swing of the right dagger.
 */
public class FangDaggerItem extends Item {
    /** Client hooks (set by client.dagger.DaggerClient): the local player swung the dagger in `arm` (`hit`: at a mob). */
    public interface ClientHook {
        void swing(Player player, HumanoidArm arm, boolean hit);
    }

    public static ClientHook clientHook = (p, arm, hit) -> {};

    public FangDaggerItem(Properties properties) {
        super(properties);
    }

    /** 5 damage, 2.0 attacks per second (vanilla attack). */
    public static ItemAttributeModifiers createAttributes() {
        return ItemAttributeModifiers.builder()
                .add(Attributes.ATTACK_DAMAGE, new AttributeModifier(BASE_ATTACK_DAMAGE_ID, 4.0, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .add(Attributes.ATTACK_SPEED, new AttributeModifier(BASE_ATTACK_SPEED_ID, -2.0, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .build();
    }

    /** The pair is out: Fang Daggers in the main hand and the off hand free (or holding the other dagger). */
    public static boolean dualWielding(LivingEntity e) {
        ItemStack off = e.getOffhandItem();
        return e.getMainHandItem().getItem() instanceof FangDaggerItem && (off.isEmpty() || off.getItem() instanceof FangDaggerItem);
    }

    /** The hand that holds the dagger on `arm`'s side. */
    public static InteractionHand handFor(LivingEntity e, HumanoidArm arm) {
        return arm == e.getMainArm() ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
    }

    /** The side `hand` is on. */
    public static HumanoidArm armFor(LivingEntity e, InteractionHand hand) {
        return hand == InteractionHand.MAIN_HAND ? e.getMainArm() : e.getMainArm().getOpposite();
    }

    /** The stack that is `arm`'s dagger: a dagger held in that hand, else the pair in the main hand. */
    public static ItemStack daggerOn(LivingEntity e, HumanoidArm arm) {
        ItemStack held = e.getItemInHand(handFor(e, arm));
        return held.getItem() instanceof FangDaggerItem ? held : e.getMainHandItem();
    }

    /** The slot `stack` is held in (the off hand for the off-hand dagger), for durability and break effects. */
    public static EquipmentSlot slotOf(LivingEntity holder, ItemStack stack) {
        return holder.getOffhandItem() == stack ? EquipmentSlot.OFFHAND : EquipmentSlot.MAINHAND;
    }

    /** Right click on a mob that had no use for it (vanilla tried the mob's own interaction first): the right dagger strikes. */
    @Override
    public InteractionResult interactLivingEntity(ItemStack stack, Player player, LivingEntity target, InteractionHand hand) {
        if (hand != InteractionHand.MAIN_HAND || !dualWielding(player) || player.isSpectator() || !target.isAttackable()
                || target.skipAttackInteraction(player)) {
            return InteractionResult.PASS;
        }
        if (player.level().isClientSide) {
            clientHook.swing(player, HumanoidArm.RIGHT, true);
        } else if (player instanceof ServerPlayer sp) {
            DaggerFeature.strike(sp, target, HumanoidArm.RIGHT);
        }
        return InteractionResult.CONSUME;   // the client swings the right dagger itself (not the main hand)
    }

    /** Right click in the air (or on a block with no use): a swing of the right dagger. Nothing else happens. */
    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        if (hand == InteractionHand.MAIN_HAND && level.isClientSide && dualWielding(player)) {
            clientHook.swing(player, HumanoidArm.RIGHT, false);
        }
        // PASS: no use animation, no re-equip dip, and the off hand still gets its turn (vanilla)
        return InteractionResultHolder.pass(player.getItemInHand(hand));
    }

    @Override
    public boolean hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        return true;
    }

    @Override
    public void postHurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        stack.hurtAndBreak(1, attacker, slotOf(attacker, stack));
    }

    @Override
    public int getEnchantmentValue() {
        return 15;
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.fang_dagger.tip").withStyle(ChatFormatting.GRAY));
        lines.add(Component.translatable("item.winterworks.fang_dagger.tip2").withStyle(ChatFormatting.GRAY));
    }
}
