package dev.lowpix.winterworks.client.hex;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.hex.ElixirJarBlockEntity;
import dev.lowpix.winterworks.hex.ElixirType;
import dev.lowpix.winterworks.hex.SoulTankBlockEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/**
 * Dev-only screenshots of the hex blocks and the Hexing screen: with -Dwinterworks.hexshots=true (e.g. in
 * JAVA_TOOL_OPTIONS for ./gradlew runClient under xvfb-run) the client makes a flat world, sets up a table, a tank and a
 * brewing jar, opens the screen, hovers and presses things, saves screenshots/winterworks_hex_*.png and quits.
 */
final class HexShots {
    /** "true": the hex blocks and the Hexing screen; "fixes": the 0.4 fixes (client.hex.FixShots). */
    private static final String MODE = System.getProperty("winterworks.hexshots", "");
    private static final boolean ENABLED = "true".equals(MODE) || "fixes".equals(MODE);
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<Integer> AT = new ArrayList<>();
    private static final BlockPos TABLE = new BlockPos(0, -60, 3), TANK = new BlockPos(2, -60, 4), JAR = new BlockPos(-2, -59, 3);
    private static boolean created;
    private static int ticks, step;

    private HexShots() {}

    static void init() {
        if (!ENABLED) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(HexShots::tick);
        if ("fixes".equals(MODE)) {
            FixShots.plan();
            return;
        }
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "time set 6000",
                    "fill -6 -61 -4 6 -61 8 minecraft:polished_blackstone_bricks", "setblock -2 -60 3 minecraft:soul_campfire",
                    "tp @s 0.5 -60 -0.5 0 28", "gamemode survival"}) {
                cmd(c);
            }
        });
        at(t += 10, () -> server(level -> {
            level.setBlockAndUpdate(TABLE, WWBlocks.HEXING_TABLE.defaultBlockState());
            level.setBlockAndUpdate(TANK, WWBlocks.SOUL_TANK.defaultBlockState());
            level.setBlockAndUpdate(JAR, WWBlocks.ELIXIR_JAR.defaultBlockState());
            if (level.getBlockEntity(TANK) instanceof SoulTankBlockEntity tank) {
                tank.setSouls(640);
            }
            if (level.getBlockEntity(JAR) instanceof ElixirJarBlockEntity jar) {
                jar.setContents(ElixirType.GREED, 3);
                jar.startBrew(ElixirType.CURSED);
            }
        }));
        at(t += 60, () -> shot("blocks"));
        at(t += 5, () -> server(level -> {
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            p.getInventory().add(new ItemStack(WWItems.SOUL_ELIXIR, 12));
            p.getInventory().add(new ItemStack(WWItems.ELIXIR_JAR));
            p.getInventory().add(new ItemStack(WWItems.SOUL_TANK));
            p.getInventory().add(new ItemStack(WWItems.HEX_CORE));
            p.openMenu(level.getBlockState(TABLE).getMenuProvider(level, TABLE));
        }));
        at(t += 10, () -> shot("screen_empty"));
        at(t += 5, () -> server(level -> {
            ServerPlayer p = level.getServer().getPlayerList().getPlayers().get(0);
            var reg = level.registryAccess().registryOrThrow(Registries.ENCHANTMENT);
            ItemEnchantments.Mutable m = new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
            m.set(reg.getHolderOrThrow(Enchantments.SHARPNESS), 4);
            m.set(reg.getHolderOrThrow(Enchantments.FIRE_ASPECT), 2);
            m.set(reg.getHolderOrThrow(Enchantments.UNBREAKING), 2);
            ItemStack book = new ItemStack(Items.ENCHANTED_BOOK);
            book.set(DataComponents.STORED_ENCHANTMENTS, m.toImmutable());
            p.containerMenu.getSlot(0).set(book);
            p.containerMenu.getSlot(1).set(new ItemStack(WWItems.SOUL_ELIXIR, 3));
            p.containerMenu.broadcastChanges();
        }));
        at(t += 10, () -> mouse(HexGui.ROW_X + 30, 14 + 9));
        at(t += 4, () -> shot("screen_hover_lesser_glyphs"));
        at(t += 30, () -> shot("screen_hover_lesser_revealed"));
        at(t += 2, () -> mouse(HexGui.ROW_X + 30, 14 + 19 + 9));
        at(t += 30, () -> shot("screen_hover_sin"));
        at(t += 2, () -> mouse(HexGui.ROW_X + 30, 14 + 38 + 9));
        at(t += 10, () -> shot("screen_hover_hidden"));
        at(t += 2, () -> mouse(37 + 16, 14 + 14));
        at(t += 6, () -> shot("screen_hover_button"));
        at(t += 2, () -> click(37 + 16, 14 + 14));
        at(t += 12, () -> shot("screen_igniting"));
        at(t += 30, () -> mouse(34 + 8, 47 + 8));
        at(t += 6, () -> shot("screen_hexed_book"));
        at(t += 5, () -> Minecraft.getInstance().stop());
    }

    static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
    }

    static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    static void server(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        String prefix = "fixes".equals(MODE) ? "winterworks_fix_" : "winterworks_hex_";
        Screenshot.grab(mc.gameDirectory, prefix + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("hexshots: {}", name);
    }

    /** Puts the mouse at GUI coordinates relative to the open container screen. */
    static void mouse(int gx, int gy) {
        Minecraft mc = Minecraft.getInstance();
        if (!(mc.screen instanceof HexingTableScreen s)) {
            return;
        }
        mouseAt(s.leftPos() + gx, s.topPos() + gy);
    }

    /** Puts the mouse at GUI-scaled screen coordinates. */
    static void mouseAt(double gx, double gy) {
        Minecraft mc = Minecraft.getInstance();
        double scale = mc.getWindow().getScreenWidth() / (double) mc.getWindow().getGuiScaledWidth();
        double x = gx * scale, y = gy * scale;
        try {
            var fx = MouseHandler.class.getDeclaredField("xpos");
            var fy = MouseHandler.class.getDeclaredField("ypos");
            fx.setAccessible(true);
            fy.setAccessible(true);
            fx.setDouble(mc.mouseHandler, x);
            fy.setDouble(mc.mouseHandler, y);
        } catch (ReflectiveOperationException e) {
            Winterworks.LOG.warn("hexshots: can't move the mouse", e);
        }
    }

    static void click(int gx, int gy) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen instanceof HexingTableScreen s) {
            s.mouseClicked(s.leftPos() + gx, s.topPos() + gy, 0);
        }
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_hexshots", GameType.CREATIVE, false, Difficulty.PEACEFUL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_hexshots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(7L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        ticks++;
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        while (step < PLAN.size() && ticks >= AT.get(step)) {
            PLAN.get(step++).run();
        }
    }
}
