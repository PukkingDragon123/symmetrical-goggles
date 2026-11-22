package dev.lowpix.winterworks.dagger;

import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.ItemAttributeModifiers;

/**
 * A dagger made from a Frost Mauler fang (docs/COLD_UPDATE.md section 9). One is a fast knife; a pair (one in each
 * hand) fights in a frenzy, pounces and lands Fang Crits: see {@link DaggerFeature}.
 */
public class FangDaggerItem extends Item {
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

    /** A Fang Dagger in each hand. */
    public static boolean dualWielding(LivingEntity e) {
        return e.getMainHandItem().getItem() instanceof FangDaggerItem && e.getOffhandItem().getItem() instanceof FangDaggerItem;
    }

    /** The slot `stack` is held in (the off hand for the off-hand dagger), for durability and break effects. */
    public static EquipmentSlot slotOf(LivingEntity holder, ItemStack stack) {
        return holder.getOffhandItem() == stack ? EquipmentSlot.OFFHAND : EquipmentSlot.MAINHAND;
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
