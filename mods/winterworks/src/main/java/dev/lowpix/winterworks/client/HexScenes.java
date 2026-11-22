package dev.lowpix.winterworks.client;

import static dev.lowpix.winterworks.client.ShowcaseDirector.at;
import static dev.lowpix.winterworks.client.ShowcaseDirector.cmd;
import static dev.lowpix.winterworks.client.ShowcaseDirector.server;
import static dev.lowpix.winterworks.client.ShowcaseDirector.shot;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.hex.ElixirType;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import dev.lowpix.winterworks.nether.HexFortress;
import dev.lowpix.winterworks.nether.PiglinWitch;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/** The Hexes & Havoc scenes of the flat-world showcase (./gradlew runShowcase). */
final class HexScenes {
    private static final BlockPos TABLE = new BlockPos(610, -60, 10), TANK = new BlockPos(612, -60, 10),
            JAR_SOUL = new BlockPos(605, -59, 10), JAR_GREED = new BlockPos(606, -59, 10),
            JAR_CURSED = new BlockPos(607, -59, 10), FORT = new BlockPos(720, -55, 70);
    private static Vec3 eye, look;

    private HexScenes() {}

    private static void tpFacing(Vec3 from, Vec3 to) {
        cmd(String.format(Locale.ROOT, "tp @s %.2f %.2f %.2f facing %.2f %.2f %.2f", from.x, from.y, from.z, to.x, to.y, to.z));
    }

    private static String book(String tier, String levels, String hidden) {
        return "winterworks:hexed_book[minecraft:stored_enchantments={levels:{" + levels + "}},winterworks:hex={tier:" + tier
                + (hidden.isEmpty() ? "" : ",hidden:[\"" + hidden + "\"]") + "}]";
    }

    static int plan(int t) {
        // 1. the Hexing Table, its Soul Tank and two Elixir Jars brewing over soul fire and magma
        at(t += 5, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("time set 18000");
            cmd("fill 598 -61 0 622 -61 22 minecraft:nether_bricks");
            cmd("fill 598 -60 16 622 -55 16 minecraft:nether_bricks");
            cmd("fill 598 -61 4 622 -61 4 minecraft:red_nether_bricks");
            cmd("setblock 604 -60 15 minecraft:soul_lantern");
            cmd("setblock 616 -60 15 minecraft:soul_lantern");
            cmd("setblock 614 -60 13 minecraft:nether_wart[age=3]");
            cmd("setblock 614 -61 13 minecraft:soul_sand");
            cmd("setblock 615 -61 13 minecraft:soul_sand");
            cmd("setblock 615 -60 13 minecraft:nether_wart[age=2]");
            cmd("setblock 610 -60 10 winterworks:hexing_table");
            cmd("setblock 612 -60 10 winterworks:soul_tank");
            cmd("fill 605 -60 10 607 -60 10 minecraft:magma_block");
            cmd("fill 605 -59 10 607 -59 10 winterworks:elixir_jar");
            cmd("setblock 603 -60 12 minecraft:brewing_stand");
        });
        at(t += 5, () -> server(level -> {
            if (level.getBlockEntity(TANK) instanceof SoulTankBlockEntity tank) {
                tank.setSouls(820);
            }
            if (level.getBlockEntity(JAR_SOUL) instanceof ElixirJarBlockEntity jar) {
                jar.setContents(ElixirType.SOUL, 3);
            }
            if (level.getBlockEntity(JAR_GREED) instanceof ElixirJarBlockEntity jar) {
                jar.setContents(ElixirType.GREED, 2);
            }
            if (level.getBlockEntity(JAR_CURSED) instanceof ElixirJarBlockEntity jar) {
                jar.setContents(ElixirType.GREED, 3);
                jar.startBrew(ElixirType.CURSED);   // soul sand in a jar of Greed: bubbling toward Cursed Elixir
            }
        }));
        at(t += 5, () -> cmd("tp @s 609.0 -57.7 4.2 -8 26"));
        at(t += 100, () -> shot("hexing_table"));
        at(t += 5, () -> cmd("tp @s 606.5 -58.1 8.0 facing 606.5 -58.6 10.5"));
        at(t += 40, () -> shot("elixir_jars"));
        // 2. the Hexing screen: an enchanted book and three Soul Elixirs in the slots
        at(t += 5, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.hideGui = false;
            cmd("clear @s");
            cmd("tp @s 610.5 -60 7.5 0 40");
        });
        at(t += 20, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.gameMode.useItemOn(mc.player, InteractionHand.MAIN_HAND,
                    new BlockHitResult(Vec3.atCenterOf(TABLE).add(0, 0.5, 0), Direction.UP, TABLE, false));
        });
        at(t += 10, () -> server(level -> {
            var sp = level.getServer().getPlayerList().getPlayers().get(0);
            ItemStack bookStack = new ItemStack(Items.ENCHANTED_BOOK);
            ItemEnchantments.Mutable ench = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
            var reg = level.registryAccess().registryOrThrow(Registries.ENCHANTMENT);
            ench.set(reg.getHolderOrThrow(Enchantments.SHARPNESS), 5);
            ench.set(reg.getHolderOrThrow(Enchantments.UNBREAKING), 3);
            EnchantmentHelper.setEnchantments(bookStack, ench.toImmutable());
            sp.containerMenu.getSlot(0).set(bookStack);
            sp.containerMenu.getSlot(1).set(new ItemStack(WWItems.SOUL_ELIXIR, 3));
            sp.containerMenu.broadcastChanges();
        }));
        at(t += 40, () -> shot("hexing_screen"));
        at(t += 5, () -> server(level -> {
            var sp = level.getServer().getPlayerList().getPlayers().get(0);
            sp.containerMenu.getSlot(0).set(ItemStack.EMPTY);
            sp.containerMenu.getSlot(1).set(ItemStack.EMPTY);
            sp.closeContainer();
        }));
        // 3. the Piglin Witch and a Golden Piglin
        at(t += 10, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("fill 636 -61 -6 656 -61 14 minecraft:nether_bricks");
            cmd("fill 636 -60 10 656 -55 10 minecraft:nether_bricks");
            cmd("setblock 640 -60 9 minecraft:soul_lantern");
            cmd("setblock 652 -60 9 minecraft:soul_lantern");
            cmd("setblock 644 -60 8 minecraft:barrel[facing=up]");
            cmd("setblock 643 -60 8 minecraft:brewing_stand");
            cmd("setblock 650 -60 8 minecraft:gold_block");
            cmd("summon winterworks:piglin_witch 645.5 -60 5.5 {NoAI:1b,PersistenceRequired:1b,Rotation:[200f,0f]}");
            cmd("summon winterworks:golden_piglin 650.5 -60 5.5 {NoAI:1b,PersistenceRequired:1b,IsImmuneToZombification:1b,"
                    + "Rotation:[165f,0f]}");
            cmd("summon minecraft:piglin 653.5 -60 4.0 {NoAI:1b,PersistenceRequired:1b,IsImmuneToZombification:1b,"
                    + "Rotation:[130f,0f],HandItems:[{id:\"minecraft:golden_sword\",count:1},{}]}");
            cmd("tp @s 647.6 -58.0 -1.6 6 12");
        });
        at(t += 100, () -> shot("piglin_witch_and_golden_piglin"));
        at(t += 5, () -> cmd("tp @s 645.6 -58.4 2.0 2 10"));
        at(t += 40, () -> shot("piglin_witch_close"));
        // 4. the Hex Fortress, built whole in the flat world
        at(t += 5, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("gamemode spectator");
            cmd("fill 676 -61 26 764 -61 114 minecraft:netherrack");
            cmd("tp @s 720 -40 140");
        });
        at(t += 40, () -> server(level -> {
            BoundingBox box = HexFortress.build(level, FORT, Rotation.NONE, 20261122L);
            Winterworks.LOG.info("showcase: hex fortress {}", box);
            // the gate faces south (+z): look at the courtyard from high over the gate bridge
            look = Vec3.atCenterOf(FORT);
            eye = new Vec3(FORT.getX() + 0.5, box.maxY() + 14, box.maxZ() + 16);
        }));
        at(t += 10, () -> {
            if (eye != null) {
                tpFacing(eye, look);
            }
        });
        at(t += 160, () -> shot("hex_fortress"));
        // inside: the witch's quarters, from the first clear spot a few blocks from her with a line of sight
        at(t += 5, () -> server(level -> {
            eye = look = null;
            var witches = level.getEntitiesOfClass(PiglinWitch.class, new AABB(FORT).inflate(48));
            if (witches.isEmpty()) {
                return;
            }
            PiglinWitch w = witches.get(0);
            look = w.position().add(0, 1.1, 0);
            for (double r = 4.5; r >= 2.0 && eye == null; r -= 0.5) {
                for (int a = 0; a < 360 && eye == null; a += 30) {
                    Vec3 p = look.add(Math.sin(Math.toRadians(a)) * r, 0.5, Math.cos(Math.toRadians(a)) * r);
                    BlockPos b = BlockPos.containing(p);
                    if (!level.getBlockState(b).isAir() || !level.getBlockState(b.above()).isAir()) {
                        continue;
                    }
                    var hit = level.clip(new net.minecraft.world.level.ClipContext(p, look,
                            net.minecraft.world.level.ClipContext.Block.VISUAL, net.minecraft.world.level.ClipContext.Fluid.NONE,
                            net.minecraft.world.phys.shapes.CollisionContext.empty()));
                    if (hit.getType() == net.minecraft.world.phys.HitResult.Type.MISS) {
                        eye = p;
                    }
                }
            }
            Winterworks.LOG.info("showcase: witch quarters view {} -> {}", eye, look);
        }));
        at(t += 5, () -> {
            if (eye != null) {
                tpFacing(eye, look);
            }
        });
        at(t += 40, () -> shot("hex_fortress_witch"));
        // 5. the hotbar: hexed books (lesser, sin, hidden), elixirs, the hex core and the 3D weapon icons
        at(t += 5, () -> {
            Minecraft.getInstance().options.hideGui = false;
            cmd("clear @s");
            cmd("give @s " + book("0", "\"minecraft:sharpness\":6,\"minecraft:unbreaking\":4,\"winterworks:midas\":1", ""));
            cmd("give @s " + book("1", "\"winterworks:greed\":1", ""));
            cmd("give @s " + book("0", "\"minecraft:protection\":5,\"winterworks:moth\":1,\"winterworks:cain\":1", "winterworks:cain"));
            cmd("give @s winterworks:soul_elixir 3");
            cmd("give @s winterworks:elixir_of_greed 2");
            cmd("give @s winterworks:cursed_elixir");
            cmd("give @s winterworks:hex_core");
            cmd("give @s winterworks:fang_dagger");
            cmd("give @s winterworks:frost_mauler_skull");
            cmd("gamemode creative");
            cmd("tp @s 610.5 -60 2.5 0 10");
        });
        at(t += 30, () -> Minecraft.getInstance().player.getInventory().selected = 6);
        at(t += 30, () -> shot("hex_hotbar"));
        return t;
    }
}
