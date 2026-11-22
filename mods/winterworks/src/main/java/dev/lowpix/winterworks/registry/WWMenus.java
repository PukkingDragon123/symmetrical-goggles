package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.HexingTableMenu;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.inventory.MenuType;

/** Menus (screens): the Hexing Table. */
public final class WWMenus {
    public static final MenuType<HexingTableMenu> HEXING_TABLE = Registry.register(BuiltInRegistries.MENU,
            Winterworks.id("hexing_table"), new MenuType<>(HexingTableMenu::new, FeatureFlags.VANILLA_SET));

    private WWMenus() {}

    public static void init() {}
}
