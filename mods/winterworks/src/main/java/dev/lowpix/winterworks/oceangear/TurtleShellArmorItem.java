package dev.lowpix.winterworks.oceangear;

import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

/**
 * A piece of Turtle Shell armour (docs/OCEAN_UPDATE.md section 5): armour like iron, toughness 1, +10% swim speed;
 * the full set (with the vanilla Turtle Shell helmet) lets you retreat into it ({@link TurtleShell}). The chestplate is
 * drawn as the 3D carapace and plastron (client.oceangear.TurtleShellArmorRenderer); leggings and boots use the
 * material's vanilla layers.
 */
public class TurtleShellArmorItem extends ArmorItem {
    public TurtleShellArmorItem(Holder<ArmorMaterial> material, Type type, Properties p) {
        super(material, type, p);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext ctx, List<Component> lines, TooltipFlag flag) {
        lines.add(Component.translatable("item.winterworks.turtle_shell_armor.swim").withStyle(ChatFormatting.BLUE));
        lines.add(Component.translatable("item.winterworks.turtle_shell_armor.retreat").withStyle(ChatFormatting.GRAY));
    }
}
