package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWMenus;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;

/** The Hexing Table's menu (docs/HEXES_UPDATE.md section 2). */
public class HexingTableMenu extends AbstractContainerMenu {
    public HexingTableMenu(int id, Inventory inventory) {
        super(WWMenus.HEXING_TABLE, id);
    }

    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        return ItemStack.EMPTY;
    }

    @Override
    public boolean stillValid(Player player) {
        return true;
    }
}
