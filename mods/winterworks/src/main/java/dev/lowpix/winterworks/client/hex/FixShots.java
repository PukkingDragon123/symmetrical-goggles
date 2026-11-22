package dev.lowpix.winterworks.client.hex;

import static dev.lowpix.winterworks.client.hex.HexShots.at;
import static dev.lowpix.winterworks.client.hex.HexShots.click;
import static dev.lowpix.winterworks.client.hex.HexShots.cmd;
import static dev.lowpix.winterworks.client.hex.HexShots.mouse;
import static dev.lowpix.winterworks.client.hex.HexShots.mouseAt;
import static dev.lowpix.winterworks.client.hex.HexShots.server;
import static dev.lowpix.winterworks.client.hex.HexShots.shot;

import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.client.curse.CurseScreenFx;
import dev.lowpix.winterworks.client.curse.SoulFireClient;
import dev.lowpix.winterworks.curse.Curse;
import dev.lowpix.winterworks.curse.Curses;
import dev.lowpix.winterworks.curse.Sins;
import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.hex.ElixirType;
import dev.lowpix.winterworks.hex.HexingTableMenu;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEnchantments;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.item.enchantment.ItemEnchantments;

/**
 * Dev-only screenshots of the 0.4 hex fixes (-Dwinterworks.hexshots=fixes): every curse's screen effect, a mob
 * burning with soul fire and the first-person soul fire overlay, cursed books and soul-glinting cursed gear in the
 * inventory, the Hexing screen with its blood slot and the 3D hex block icons. Saves
 * screenshots/winterworks_fix_*.png and quits.
 */
final class FixShots {
    private static final BlockPos TABLE = new BlockPos(1, -60, 6), TANK = new BlockPos(3, -60, 6), JAR = new BlockPos(-1, -59, 6);
    private static int pig = -1, cow = -1;

    private FixShots() {}

    private static ServerPlayer player(ServerLevel level) {
        return level.getServer().getPlayerList().getPlayers().get(0);
    }

    private static Holder<Enchantment> ench(ServerLevel level, ResourceKey<Enchantment> key) {
        return level.registryAccess().registryOrThrow(Registries.ENCHANTMENT).getHolderOrThrow(key);
    }

    private static ItemStack gear(ServerLevel level, Item item, ResourceKey<Enchantment> key) {
        ItemStack s = new ItemStack(item);
        s.enchant(ench(level, key), 1);
        return s;
    }

    @SafeVarargs
    private static ItemStack book(ServerLevel level, ResourceKey<Enchantment>... keys) {
        ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        for (ResourceKey<Enchantment> k : keys) {
            m.set(ench(level, k), 1);
        }
        ItemStack b = new ItemStack(Items.ENCHANTED_BOOK);
        b.set(DataComponents.STORED_ENCHANTMENTS, m.toImmutable());
        return b;
    }

    static void plan() {
        int t = 40;
        // a little hex workshop on a nether-brick floor, a pool, a pig and a cow to set alight
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "time set 6000",
                    "gamerule sendCommandFeedback false", "fill -8 -61 -2 8 -61 14 minecraft:nether_bricks",
                    "fill -8 -60 13 8 -57 13 minecraft:polished_blackstone_bricks", "fill 4 -61 8 7 -61 11 minecraft:water",
                    "setblock -1 -60 6 minecraft:soul_campfire", "setblock -4 -60 12 minecraft:soul_lantern",
                    "setblock 6 -60 12 minecraft:soul_lantern", "tp @s 0.5 -60 0.5 0 15", "gamemode survival"}) {
                cmd(c);
            }
        });
        at(t += 10, () -> server(level -> {
            level.setBlockAndUpdate(TABLE, WWBlocks.HEXING_TABLE.defaultBlockState());
            level.setBlockAndUpdate(TANK, WWBlocks.SOUL_TANK.defaultBlockState());
            level.setBlockAndUpdate(JAR, WWBlocks.ELIXIR_JAR.defaultBlockState());
            if (level.getBlockEntity(TANK) instanceof SoulTankBlockEntity tank) {
                tank.setSouls(720);
            }
            if (level.getBlockEntity(JAR) instanceof ElixirJarBlockEntity jar) {
                jar.pourBlood();
                jar.startBrew(ElixirType.GREED);   // gold dissolving in blood
            }
            ServerPlayer p = player(level);
            p.addEffect(new MobEffectInstance(MobEffects.FIRE_RESISTANCE, 20 * 600, 0, false, false));
            p.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 20 * 600, 4, false, false));
            var inv = p.getInventory();
            inv.clearContent();
            inv.setItem(0, new ItemStack(WWItems.HEXING_TABLE));
            inv.setItem(1, new ItemStack(WWItems.SOUL_TANK));
            inv.setItem(2, new ItemStack(WWItems.ELIXIR_JAR));
            inv.setItem(3, new ItemStack(WWItems.HEX_CORE));
            inv.setItem(4, gear(level, Items.NETHERITE_SWORD, WWEnchantments.WRATH));
            inv.setItem(5, gear(level, Items.DIAMOND_SWORD, Enchantments.SHARPNESS));
            inv.setItem(6, book(level, Enchantments.BINDING_CURSE));
            inv.setItem(7, book(level, WWEnchantments.PRIDE));
            inv.setItem(8, book(level, Enchantments.SHARPNESS));
            inv.setItem(9, book(level, WWEnchantments.NARCISSUS, Enchantments.PROTECTION));
            inv.setItem(10, book(level, Enchantments.VANISHING_CURSE));
            inv.setItem(11, book(level, WWEnchantments.GREED));
            inv.setItem(12, gear(level, Items.DIAMOND_PICKAXE, WWEnchantments.SISYPHUS));
            inv.setItem(13, gear(level, Items.ELYTRA, WWEnchantments.ICARUS));
            inv.setItem(14, gear(level, Items.BOW, WWEnchantments.LEECH));
            inv.setItem(15, gear(level, Items.DIAMOND_PICKAXE, Enchantments.EFFICIENCY));
            inv.setItem(16, AmberFeature.bloodPotion(Items.POTION));
            inv.setItem(17, gear(level, Items.DIAMOND_CHESTPLATE, WWEnchantments.ENVY));
            // worn: cursed pieces (soul glint) beside a plainly enchanted chestplate (vanilla glint); no sin worn,
            // so no sin vignette tints the screenshots
            p.setItemSlot(EquipmentSlot.HEAD, gear(level, Items.DIAMOND_HELMET, WWEnchantments.MIDAS));
            p.setItemSlot(EquipmentSlot.CHEST, gear(level, Items.DIAMOND_CHESTPLATE, Enchantments.PROTECTION));
            p.setItemSlot(EquipmentSlot.LEGS, gear(level, Items.DIAMOND_LEGGINGS, Enchantments.BINDING_CURSE));
            p.setItemSlot(EquipmentSlot.FEET, gear(level, Items.DIAMOND_BOOTS, Enchantments.VANISHING_CURSE));
            inv.selected = 0;
        }));
        // 1. the hotbar: 3D hex blocks and the Hex Core, a soul-glinting Wrath sword beside a purple-glinting one
        at(t += 60, () -> shot("hotbar_3d_icons"));
        if (Boolean.getBoolean("winterworks.hexshots.quick")) {   // just the items, a few frames apart (the glints move)
            at(t += 5, () -> Minecraft.getInstance().setScreen(new InventoryScreen(Minecraft.getInstance().player)));
            for (int i = 0; i < 4; i++) {
                int k = i;
                at(t += 15, () -> shot("quick_inventory_" + k));
            }
            at(t += 5, () -> Minecraft.getInstance().stop());
            return;
        }
        // 2. the inventory: cursed books, cursed gear with the soul glint, worn cursed armour
        at(t += 5, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.setScreen(new InventoryScreen(mc.player));
        });
        at(t += 15, () -> shot("inventory_cursed"));
        at(t += 2, () -> hoverInventorySlot(9));   // the Narcissus + Protection book: just the curse's name
        at(t += 2, () -> hoverInventorySlot(9));
        at(t += 6, () -> shot("tooltip_cursed_book"));
        at(t += 2, () -> hoverInventorySlot(36 + 4));   // the Wrath sword
        at(t += 6, () -> shot("tooltip_wrath_sword"));
        at(t += 2, () -> Minecraft.getInstance().setScreen(null));
        // 3. soul fire: a pig in blue soul flames beside a cow in ordinary fire
        at(t += 5, () -> server(level -> {
            Mob a = EntityType.PIG.create(level);
            a.moveTo(-0.5, -60, 3.5, 200, 0);
            a.setNoAi(true);
            a.setInvulnerable(true);
            level.addFreshEntity(a);
            pig = a.getId();
            Mob b = EntityType.COW.create(level);
            b.moveTo(2.2, -60, 3.8, 160, 0);
            b.setNoAi(true);
            b.setInvulnerable(true);
            level.addFreshEntity(b);
            cow = b.getId();
        }));
        at(t += 10, () -> server(level -> {
            if (level.getEntity(pig) instanceof LivingEntity a) {
                Curses.soulIgnite(a, 1200);
            }
            if (level.getEntity(cow) instanceof LivingEntity b) {
                b.setRemainingFireTicks(1200);
            }
        }));
        at(t += 2, () -> cmd("tp @s 0.6 -60 -0.4 facing 0.6 -59.4 3.6"));
        at(t += 25, () -> shot("soul_fire_mob"));
        at(t += 2, () -> cmd("tp @s -0.5 -60 2.2 facing -0.5 -59.6 3.5"));
        at(t += 10, () -> shot("soul_fire_mob_close"));
        // 4. the local player burning with soul fire, looking away from the pig: the first-person overlay
        at(t += 2, () -> server(level -> level.getEntities(null, new net.minecraft.world.phys.AABB(-10, -62, -4, 10, -55, 16))
                .forEach(e -> {
                    if (e instanceof Mob) {
                        e.discard();
                    }
                })));
        at(t += 2, () -> cmd("tp @s 0.5 -60 0.5 facing 0.5 -59 10"));
        at(t += 2, () -> server(level -> Curses.soulIgnite(player(level), 400)));
        at(t += 15, () -> shot("soul_fire_overlay"));
        at(t += 2, () -> server(level -> Curses.soulExtinguish(player(level))));
        // 5. the Hexing screen with its blood slot, a Sharpness + Fire Aspect book, elixir and two Potions of Blood
        at(t += 5, () -> cmd("tp @s 1.5 -60 3.5 0 40"));
        at(t += 10, () -> server(level -> {
            ServerPlayer p = player(level);
            p.openMenu(level.getBlockState(TABLE).getMenuProvider(level, TABLE));
        }));
        at(t += 10, () -> server(level -> {
            ServerPlayer p = player(level);
            var reg = level.registryAccess().registryOrThrow(Registries.ENCHANTMENT);
            ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
            m.set(reg.getHolderOrThrow(Enchantments.SHARPNESS), 4);
            m.set(reg.getHolderOrThrow(Enchantments.FIRE_ASPECT), 2);
            ItemStack b = new ItemStack(Items.ENCHANTED_BOOK);
            b.set(DataComponents.STORED_ENCHANTMENTS, m.toImmutable());
            p.containerMenu.getSlot(HexingTableMenu.BOOK_SLOT).set(b);
            p.containerMenu.getSlot(HexingTableMenu.ELIXIR_SLOT).set(new ItemStack(WWItems.SOUL_ELIXIR, 3));
            p.containerMenu.broadcastChanges();
        }));
        at(t += 10, () -> mouse(170, 4));
        at(t += 10, () -> shot("hexing_screen_empty_blood"));
        at(t += 2, () -> server(level -> {
            ServerPlayer p = player(level);
            ItemStack blood = AmberFeature.bloodPotion(Items.POTION);
            blood.setCount(2);
            p.containerMenu.getSlot(HexingTableMenu.BLOOD_SLOT).set(blood);
            p.containerMenu.broadcastChanges();
        }));
        at(t += 10, () -> mouse(HexGui.ROW_X + 30, HexGui.ROW_Y + 9));
        at(t += 40, () -> shot("hexing_screen_blood_lesser"));
        at(t += 2, () -> mouse(HexGui.ROW_X + 30, HexGui.ROW_Y + HexGui.ROW_H + 9));
        at(t += 40, () -> shot("hexing_screen_blood_sin"));
        at(t += 2, () -> mouse(HexingTableMenu.BLOOD_X + 8, HexingTableMenu.BLOOD_Y + 8));
        at(t += 8, () -> shot("hexing_screen_blood_slot"));
        at(t += 2, () -> click(HexGui.HEX_BUTTON.cx(), HexGui.HEX_BUTTON.cy()));
        at(t += 40, () -> mouse(HexingTableMenu.BOOK_X + 8, HexingTableMenu.BOOK_Y + 8));
        at(t += 8, () -> shot("hexing_screen_hexed_with_blood"));
        at(t += 2, () -> Minecraft.getInstance().player.closeContainer());
        // 6. the hex blocks in the world, the jar brewing Greed in its blood
        at(t += 5, () -> cmd("tp @s 1.5 -59 2.0 facing 1.0 -59.6 6.0"));
        at(t += 30, () -> shot("hex_blocks"));
        // 7. every curse's screen effect, at its height, facing the workshop and the pool
        at(t += 5, () -> cmd("tp @s 1.5 -60 0.5 facing 2.5 -59.5 8.5"));
        for (Curse c : Curse.ALL) {
            at(t += 20, () -> CurseScreenFx.start(c, Curses.effectTicks(c)));
            at(t += 16, () -> shot("effect_" + c.id().toLowerCase(Locale.ROOT)));
            at(t += 1, CurseScreenFx::stop);
        }
        // 8. the real path: Sloth nods off on the server and the payload plays its effect
        at(t += 10, () -> server(level -> {
            ServerPlayer p = player(level);
            p.setItemSlot(EquipmentSlot.MAINHAND, gear(level, Items.DIAMOND_PICKAXE, WWEnchantments.SLOTH));
        }));
        at(t += 5, () -> server(level -> Sins.nodOff(player(level))));
        at(t += 7, () -> shot("effect_sloth_from_server"));
        at(t += 70, () -> Minecraft.getInstance().stop());
    }

    /** Hovers the inventory screen's slot (menu slot index). */
    private static void hoverInventorySlot(int menuSlot) {
        Minecraft mc = Minecraft.getInstance();
        if (!(mc.screen instanceof InventoryScreen s)) {
            return;
        }
        var slot = s.getMenu().getSlot(menuSlot);
        int left = (s.width - 176) / 2, top = (s.height - 166) / 2;
        mouseAt(left + slot.x + 8, top + slot.y + 8);
    }

    /** Dev: marks an entity soul-burning on this client only (used when the server path isn't wanted). */
    static void soulFireClientOnly(int id, int ticks) {
        SoulFireClient.set(id, ticks);
    }
}
