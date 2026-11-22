package dev.lowpix.winterworks.client.oceangear;

import com.mojang.authlib.GameProfile;
import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.oceangear.ElderBoss;
import dev.lowpix.winterworks.oceangear.EyeOfTheOceanBlock;
import dev.lowpix.winterworks.oceangear.LionfishDart;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanItems;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.monster.Drowned;
import net.minecraft.world.entity.monster.ElderGuardian;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.Arrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of Tides & Treasures' gear and boss (docs/OCEAN_UPDATE.md sections 4-6): with
 * -Dwinterworks.oceangearshots=all (with -Dwinterworks.ocean=true, in JAVA_TOOL_OPTIONS for ./gradlew runClient under
 * xvfb-run) the client makes a flat world and saves screenshots/winterworks_oceangear_*.png: the Elder Guardian boss in
 * a flooded prismarine arena (idle, the stare's lock-on and beam, the beam stopped by a pillar, the bubble barrage and a
 * drowned caught in a bubble, the tail whip, the roar and summons, the boss bar), Turtle Shell armour worn (front and
 * back) and retreated (and struck), lionfish darts fired underwater beside an arrow, and the Eye of the Ocean underwater
 * and on land. Then it quits. Fixed views come from a client-side armour stand set as the camera; people in the armour
 * shots are client-side players. A comma list instead of all (boss,armor,darts,eye) runs only those scenes.
 */
final class OceanGearShots {
    private static final String MODE = System.getProperty("winterworks.oceangearshots", "");
    private static final Set<String> SCENES = Set.copyOf(Arrays.asList(MODE.split(",")));
    private static final List<Runnable> PLAN = new ArrayList<>();
    private static final List<java.util.function.BooleanSupplier> UNTIL = new ArrayList<>();
    private static int waited;
    private static final List<Integer> AT = new ArrayList<>();
    private static final int Y = -60;   // standing height in the flat world
    private static boolean created;
    private static int ticks, step;
    private static volatile int bossId = -1, targetId = -1;
    private static ArmorStand camera;
    private static final List<Entity> mannequins = new ArrayList<>();

    private OceanGearShots() {}

    private static boolean on(String scene) {
        return SCENES.contains("all") || SCENES.contains(scene);
    }

    static void init() {
        if (MODE.isEmpty()) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(OceanGearShots::tick);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "time set 6000", "weather clear", "difficulty normal", "gamemode creative", "effect give @s night_vision infinite 0 true"}) {
                cmd(c);
            }
            Minecraft.getInstance().options.renderDistance().set(8);
            Minecraft.getInstance().options.hideGui = true;
        });
        t += 10;
        if (on("boss")) {
            t = boss(t);
        }
        if (on("armor")) {
            t = armor(t);
        }
        if (on("darts")) {
            t = darts(t);
        }
        if (on("eye")) {
            t = eye(t);
        }
        at(t + 10, () -> Minecraft.getInstance().stop());
    }

    // --------------------------------------------------------------------------------------- the boss

    /** A flooded prismarine arena with pillars and sea lanterns, the boss in the middle and a drowned to aim at. */
    private static int boss(int t) {
        int x0 = 0, z0 = 40;
        at(t, () -> server(level -> {
            arena(level, x0, z0);
            ElderGuardian eg = EntityType.ELDER_GUARDIAN.create(level);
            eg.moveTo(x0 + 0.5, Y + 3, z0 - 3.5, 0f, 0f);
            eg.setNoAi(true);
            eg.yBodyRot = 0f;
            eg.yHeadRot = 0f;
            level.addFreshEntity(eg);
            bossId = eg.getId();
            Drowned d = EntityType.DROWNED.create(level);
            d.moveTo(x0 + 0.5, Y + 1, z0 + 7.5, 180f, 0f);
            d.setNoAi(true);
            d.setInvulnerable(true);
            d.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.TRIDENT));
            level.addFreshEntity(d);
            targetId = d.getId();
        }));
        at(t += 3, () -> tp(x0 - 9.5, Y + 4, z0 + 2.5));
        at(t += 2, () -> cam(x0 - 3.5, Y + 5.6, z0 - 10.0, x0 + 0.5, Y + 3.4, z0 - 3.5));
        at(t += 50, () -> shot("boss"));
        at(t += 2, () -> cam(x0 + 2.5, Y + 4.4, z0 + 2.5, x0 + 0.5, Y + 3.9, z0 - 3.5));
        at(t += 6, () -> shot("boss_face"));
        // the stare: side on
        at(t += 2, () -> {
            cam(x0 - 9.5, Y + 4.5, z0 + 2.5, x0 + 0.5, Y + 3.0, z0 + 2.0);
            attack(ElderBoss.STARE);
        });
        at(t += 26, () -> shot("boss_stare_telegraph"));
        at(t += 28, () -> shot("boss_stare_beam"));
        at(t += 40, () -> {});
        // the beam stopped by a pillar between it and its target
        at(t += 2, () -> server(level -> {
            for (int y = Y; y <= Y + 9; y++) {
                for (int dx = -1; dx <= 1; dx++) {
                    level.setBlockAndUpdate(new BlockPos(x0 + dx, y, z0 + 3), Blocks.PRISMARINE_BRICKS.defaultBlockState());
                }
            }
        }));
        at(t += 4, () -> attack(ElderBoss.STARE));
        at(t += 55, () -> shot("boss_stare_blocked"));
        at(t += 40, () -> server(level -> {
            for (int y = Y; y <= Y + 9; y++) {
                for (int dx = -1; dx <= 1; dx++) {
                    level.setBlockAndUpdate(new BlockPos(x0 + dx, y, z0 + 3), Blocks.WATER.defaultBlockState());
                }
            }
        }));
        // the bubble barrage, and a drowned caught in one
        at(t += 4, () -> {
            cam(x0 - 8.5, Y + 4.5, z0 + 1.5, x0 + 0.5, Y + 2.8, z0 + 2.0);
            attack(ElderBoss.BUBBLE);
        });
        at(t += 17, () -> shot("boss_bubbles"));
        at(t += 24, () -> shot("boss_bubble_trap"));
        at(t += 50, () -> {});
        // the tail whip: the drowned brought close
        at(t += 2, () -> server(level -> {
            if (level.getEntity(targetId) instanceof LivingEntity d) {
                d.teleportTo(x0 + 0.5, Y + 2, z0 + 0.5);
            }
        }));
        at(t += 4, () -> {
            cam(x0 + 6.0, Y + 5.0, z0 - 1.0, x0 + 0.2, Y + 3.0, z0 - 2.0);
            attack(ElderBoss.TAIL_WHIP);
        });
        at(t += 13, () -> shot("boss_tail_whip"));
        at(t += 30, () -> server(level -> {
            if (level.getEntity(targetId) instanceof LivingEntity d) {
                d.teleportTo(x0 + 0.5, Y + 1, z0 + 7.5);
            }
        }));
        // the roar and the summons, with the boss bar
        at(t += 4, () -> {
            cmd("gamemode spectator");   // the boss bar, without a hand in view
            Minecraft.getInstance().options.hideGui = false;
            cam(x0 - 6.5, Y + 6.5, z0 + 6.5, x0 + 0.5, Y + 3.0, z0 - 3.0);
            server(level -> {
                if (level.getEntity(bossId) instanceof ElderGuardian eg) {
                    eg.setHealth(ElderBoss.MAX_HEALTH * 0.48f);
                }
            });
        });
        at(t += 20, () -> shot("boss_roar"));
        at(t += 2, () -> {
            Minecraft.getInstance().options.hideGui = true;
            cmd("gamemode creative");
        });
        // its death: the death clip, the eye dropped
        at(t += 30, () -> {
            cam(x0 + 3.5, Y + 4.5, z0 + 1.5, x0 + 0.5, Y + 2.5, z0 - 3.5);
            server(level -> {
                for (var g : level.getEntitiesOfClass(net.minecraft.world.entity.monster.Guardian.class,
                        new net.minecraft.world.phys.AABB(x0 - 12, Y - 2, z0 - 12, x0 + 12, Y + 12, z0 + 12), g -> !(g instanceof ElderGuardian))) {
                    g.discard();
                }
                if (level.getEntity(bossId) instanceof ElderGuardian eg) {
                    eg.hurt(level.damageSources().genericKill(), 1000f);
                }
            });
        });
        at(t += 24, () -> shot("boss_death"));
        at(t += 2, () -> cam(x0 + 2.0, Y + 2.2, z0 - 0.5, x0 + 0.5, Y + 0.3, z0 - 3.5));
        at(t += 50, () -> shot("boss_eye_drop"));
        return t + 5;
    }

    private static void attack(byte attack) {
        server(level -> {
            if (level.getEntity(bossId) instanceof ElderGuardian eg && level.getEntity(targetId) instanceof LivingEntity d) {
                ElderBoss.start(eg, attack, d);
            }
        });
    }

    private static void arena(ServerLevel level, int x0, int z0) {
        int r = 11, top = Y + 11;
        for (int x = -r - 1; x <= r + 1; x++) {
            for (int z = -r - 1; z <= r + 1; z++) {
                boolean wall = Math.abs(x) > r || Math.abs(z) > r;
                boolean lantern = !wall && x % 4 == 0 && z % 4 == 0;
                set(level, x0 + x, Y - 1, z0 + z, lantern ? Blocks.SEA_LANTERN.defaultBlockState()
                        : ((x + z) & 1) == 0 ? Blocks.PRISMARINE_BRICKS.defaultBlockState() : Blocks.DARK_PRISMARINE.defaultBlockState());
                for (int y = Y; y <= top; y++) {
                    BlockState s;
                    if (wall) {
                        s = y == top ? Blocks.SEA_LANTERN.defaultBlockState() : (y % 3 == 0 ? Blocks.SEA_LANTERN.defaultBlockState()
                                : Blocks.DARK_PRISMARINE.defaultBlockState());
                        if (Math.abs(x) <= r && z == -r - 1 && y > Y + 1) {   // a glass front wall for the views from outside
                            s = Blocks.GLASS.defaultBlockState();
                        }
                    } else {
                        boolean pillar = (Math.abs(x) == 7 || Math.abs(x) == 8) && (Math.abs(z) == 7 || Math.abs(z) == 8);
                        s = pillar ? (y % 4 == 1 ? Blocks.SEA_LANTERN.defaultBlockState() : Blocks.PRISMARINE.defaultBlockState())
                                : y == top ? Blocks.WATER.defaultBlockState() : Blocks.WATER.defaultBlockState();
                    }
                    set(level, x0 + x, y, z0 + z, s);
                }
            }
        }
    }

    // --------------------------------------------------------------------------------------- Turtle Shell armour

    private static int armor(int t) {
        int x0 = 60, z0 = 0;
        at(t, () -> {
            server(level -> {
                clear(level, x0 - 10, z0 - 10, x0 + 10, z0 + 10);
                for (int x = x0 - 6; x <= x0 + 6; x++) {   // a sandy beach with a pool behind
                    for (int z = z0 - 3; z <= z0 + 6; z++) {
                        set(level, x, Y - 1, z, z > z0 + 3 ? Blocks.WATER.defaultBlockState() : Blocks.SAND.defaultBlockState());
                    }
                }
            });
        });
        at(t += 5, () -> {
            tp(x0, Y, z0 - 9);
            mannequin(x0 - 1.3, Y, z0 + 0.6, 200f, false);   // wearing it, facing the camera
            mannequin(x0 + 0.3, Y, z0 + 1.3, 35f, false);   // its back: the carapace
            mannequin(x0 + 1.8, Y, z0 + 0.2, 150f, true);   // retreated into the shell
        });
        at(t += 4, () -> cam(x0 + 0.3, Y + 1.7, z0 - 3.3, x0 + 0.2, Y + 0.85, z0 + 0.8));
        at(t += 20, () -> shot("armor_worn"));
        at(t += 2, () -> cam(x0 + 1.4, Y + 1.25, z0 - 1.2, x0 + 2.0, Y + 0.3, z0 + 0.3));
        at(t += 6, () -> shot("armor_retreat"));
        at(t += 2, () -> {
            if (mannequins.size() > 2 && mannequins.get(2) instanceof LivingEntity l) {
                l.animateHurt(0f);
                l.hurtTime = l.hurtDuration = 10;
            }
        });
        at(t += 3, () -> shot("armor_retreat_hit"));
        at(t += 2, () -> cam(x0 + 2.6, Y + 1.6, z0 + 4.4, x0 + 0.2, Y + 1.0, z0 + 1.0));
        at(t += 6, () -> shot("armor_back"));
        at(t += 2, () -> {
            for (Entity e : mannequins) {
                e.discard();
            }
            mannequins.clear();
        });
        return t + 5;
    }

    /** A client-side player wearing the full set (sneaking: retreated). */
    private static void mannequin(double x, double y, double z, float yaw, boolean retreat) {
        Minecraft mc = Minecraft.getInstance();
        RemotePlayer p = new RemotePlayer(mc.level, new GameProfile(UUID.randomUUID(), "Shell" + mannequins.size()));
        p.moveTo(x, y, z, yaw, 0f);
        p.setYHeadRot(yaw);
        p.yBodyRot = yaw;
        p.yBodyRotO = yaw;
        p.yHeadRotO = yaw;
        p.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.TURTLE_HELMET));
        p.setItemSlot(EquipmentSlot.CHEST, new ItemStack(OceanItems.TURTLE_SHELL_CHESTPLATE));
        p.setItemSlot(EquipmentSlot.LEGS, new ItemStack(OceanItems.TURTLE_SHELL_LEGGINGS));
        p.setItemSlot(EquipmentSlot.FEET, new ItemStack(OceanItems.TURTLE_SHELL_BOOTS));
        if (retreat) {
            p.setShiftKeyDown(true);
            p.setPose(Pose.CROUCHING);
        }
        mc.level.addEntity(p);
        mannequins.add(p);
    }

    // --------------------------------------------------------------------------------------- lionfish darts

    /** A flooded reef: three darts loosed along it fly straight at a guardian; an arrow loosed with them stalls and sinks. */
    private static int darts(int t) {
        int x0 = 0, z0 = -40;
        at(t, () -> server(level -> {
            clear(level, x0 - 12, z0 - 18, x0 + 12, z0 + 18);
            for (int x = x0 - 7; x <= x0 + 7; x++) {
                for (int z = z0 - 16; z <= z0 + 16; z++) {
                    boolean wall = Math.abs(x - x0) == 7 || Math.abs(z - z0) == 16;
                    set(level, x, Y - 1, z, Math.floorMod(x * 3 + z * 7, 13) == 0 ? Blocks.SEA_LANTERN.defaultBlockState()
                            : Blocks.SAND.defaultBlockState());
                    for (int y = Y; y <= Y + 7; y++) {
                        set(level, x, y, z, wall ? Blocks.PRISMARINE_BRICKS.defaultBlockState() : Blocks.WATER.defaultBlockState());
                    }
                    int h = Math.floorMod(x * 31 + z * 17, 23);
                    if (!wall && Math.abs(x - x0 - 1) > 2) {   // a reef either side of the lane
                        BlockState deco = h < 3 ? Blocks.BRAIN_CORAL_BLOCK.defaultBlockState() : h < 5 ? Blocks.TUBE_CORAL.defaultBlockState()
                                : h < 7 ? Blocks.FIRE_CORAL.defaultBlockState() : h < 12 ? Blocks.SEAGRASS.defaultBlockState()
                                : h < 13 ? Blocks.SEA_PICKLE.defaultBlockState() : null;
                        if (deco != null) {
                            set(level, x, Y, z, deco);
                        }
                    }
                }
            }
            var g = EntityType.GUARDIAN.create(level);
            g.moveTo(x0 + 1.5, Y + 1.4, z0 + 11.5, 180f, 0f);
            g.setNoAi(true);
            g.setNoGravity(true);
            level.addFreshEntity(g);
            targetId = g.getId();
        }));
        at(t += 3, () -> tp(x0 - 6.0, Y + 1, z0 - 13));
        at(t += 2, () -> cam(x0 - 1.2, Y + 2.9, z0 - 9.0, x0 + 1.6, Y + 2.0, z0 + 4.0));
        at(t += 20, () -> {});
        for (int i = 0; i < 4; i++) {
            final int n = i;
            at(t += 2, () -> server(level -> {
                Vec3 from = new Vec3(x0 + 1.5, Y + 2.2, z0 - 14.5);
                Entity target = level.getEntity(targetId);
                Vec3 to = target != null ? target.position().add(0, 0.45, 0) : from.add(0, 0, 20);
                LionfishDart d = new LionfishDart(level, from.x, from.y, from.z, new ItemStack(OceanItems.LIONFISH_DART), new ItemStack(Items.BOW));
                d.shoot(to.x - from.x, to.y - from.y, to.z - from.z, 3.0f, 0f);
                d.pickup = AbstractArrow.Pickup.DISALLOWED;
                level.addFreshEntity(d);
                if (n == 0) {
                    Arrow a = new Arrow(level, x0 - 0.2, Y + 3.6, z0 - 14.5, new ItemStack(Items.ARROW), new ItemStack(Items.BOW));
                    a.shoot(0, 0, 1, 3.0f, 0f);
                    a.pickup = AbstractArrow.Pickup.DISALLOWED;
                    level.addFreshEntity(a);
                }
            }));
        }
        when(t += 1, () -> dartsInView(z0 - 8, z0 + 9) >= 2, () -> shot("darts_underwater"));
        at(t += 3, () -> shot("darts_hit"));
        at(t += 2, () -> cam(x0 - 1.5, Y + 2.6, z0 + 8.0, x0 + 1.5, Y + 1.8, z0 + 11.5));
        at(t += 12, () -> shot("darts_poisoned"));
        return t + 5;
    }

    /** Darts the client is showing in flight between z1 and z2. */
    private static int dartsInView(double z1, double z2) {
        int n = 0;
        for (Entity e : Minecraft.getInstance().level.entitiesForRendering()) {
            if (e instanceof LionfishDart && e.getZ() > z1 && e.getZ() < z2 && e.getDeltaMovement().lengthSqr() > 1) {
                n++;
            }
        }
        return n;
    }

    // --------------------------------------------------------------------------------------- the Eye of the Ocean

    private static int eye(int t) {
        int x0 = -60, z0 = 0;
        at(t, () -> server(level -> {
            clear(level, x0 - 14, z0 - 14, x0 + 14, z0 + 14);
            // underwater: a prismarine pool round the eye on a pedestal, sea pickles and seagrass about
            int r = 5;
            for (int x = x0 - r; x <= x0 + r; x++) {
                for (int z = z0 - r; z <= z0 + r; z++) {
                    boolean wall = Math.abs(x - x0) == r || Math.abs(z - z0) == r;
                    set(level, x, Y - 1, z, ((x + z) & 1) == 0 ? Blocks.PRISMARINE_BRICKS.defaultBlockState() : Blocks.DARK_PRISMARINE.defaultBlockState());
                    for (int y = Y; y <= Y + 5; y++) {
                        set(level, x, y, z, wall ? (y % 3 == 1 ? Blocks.SEA_LANTERN.defaultBlockState() : Blocks.DARK_PRISMARINE.defaultBlockState())
                                : Blocks.WATER.defaultBlockState());
                    }
                    int h = Math.floorMod(x * 13 + z * 7, 9);
                    if (!wall && (Math.abs(x - x0) > 1 || Math.abs(z - z0) > 1)) {
                        if (h == 0) {
                            set(level, x, Y, z, Blocks.SEA_PICKLE.defaultBlockState().setValue(net.minecraft.world.level.block.SeaPickleBlock.PICKLES, 3));
                        } else if (h < 3) {
                            set(level, x, Y, z, Blocks.SEAGRASS.defaultBlockState());
                        }
                    }
                }
            }
            set(level, x0, Y, z0, Blocks.PRISMARINE_BRICKS.defaultBlockState());
            set(level, x0, Y + 1, z0, OceanBlocks.EYE_OF_THE_OCEAN.defaultBlockState().setValue(EyeOfTheOceanBlock.WATERLOGGED, true));
            // on land: on a prismarine pedestal in the grass, by the shore
            int lx = x0 + 11;
            set(level, lx, Y, z0, Blocks.PRISMARINE_BRICKS.defaultBlockState());
            set(level, lx, Y + 1, z0, OceanBlocks.EYE_OF_THE_OCEAN.defaultBlockState().setValue(EyeOfTheOceanBlock.WATERLOGGED, false));
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    if (dx != 0 || dz != 0) {
                        set(level, lx + dx, Y, z0 + dz, Blocks.DARK_PRISMARINE_SLAB.defaultBlockState());
                    }
                }
            }
        }));
        at(t += 4, () -> {
            tp(x0 + 1.6, Y + 2.9 - 1.62, z0 - 2.6);   // the eyes look at the nearest player: stand where the camera is
            cam(x0 + 1.6, Y + 2.9, z0 - 2.6, x0 + 0.5, Y + 1.5, z0 + 0.5);
        });
        at(t += 40, () -> shot("eye_underwater"));
        at(t += 2, () -> {
            tp(x0 + 11.5 - 1.6, Y + 2.6 - 1.62, z0 - 2.6);
            cam(x0 + 11.5 - 1.6, Y + 2.6, z0 - 2.6, x0 + 11.5, Y + 1.4, z0 + 0.5);
        });
        at(t += 40, () -> shot("eye_land"));
        return t + 5;
    }

    // --------------------------------------------------------------------------------------- helpers

    private static void set(ServerLevel level, int x, int y, int z, BlockState s) {
        level.setBlock(new BlockPos(x, y, z), s, Block.UPDATE_CLIENTS);
    }

    private static void clear(ServerLevel level, int x1, int z1, int x2, int z2) {
        for (Entity e : level.getEntities(EntityType.SLIME, e -> true)) {
            e.discard();
        }
        for (BlockPos p : BlockPos.betweenClosed(x1, Y - 2, z1, x2, Y + 12, z2)) {
            BlockState want = p.getY() < Y - 1 ? Blocks.DIRT.defaultBlockState() : p.getY() == Y - 1 ? Blocks.GRASS_BLOCK.defaultBlockState()
                    : Blocks.AIR.defaultBlockState();
            if (!level.getBlockState(p).equals(want)) {
                level.setBlock(p, want, Block.UPDATE_CLIENTS);
            }
        }
    }

    private static void at(int tick, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
        UNTIL.add(null);
    }

    /** From `tick`, wait (up to 30 ticks, pushing later steps back) for `until`, then run `r`. */
    private static void when(int tick, java.util.function.BooleanSupplier until, Runnable r) {
        AT.add(tick);
        PLAN.add(r);
        UNTIL.add(until);
    }

    private static void cmd(String c) {
        Minecraft.getInstance().player.connection.sendCommand(c);
    }

    private static void tp(double x, double y, double z) {
        cmd(String.format(java.util.Locale.ROOT, "tp @s %.2f %.2f %.2f", x, y, z));
    }

    private static void server(Consumer<ServerLevel> job) {
        var srv = Minecraft.getInstance().getSingleplayerServer();
        if (srv != null) {
            srv.execute(() -> job.accept(srv.overworld()));
        }
    }

    private static void shot(String name) {
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(mc.gameDirectory, "winterworks_oceangear_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("oceangearshots: {}", name);
    }

    /** Puts the camera (a client-side armour stand) at `from`, looking at `to`. */
    private static void cam(double x, double y, double z, double tx, double ty, double tz) {
        Minecraft mc = Minecraft.getInstance();
        if (camera == null || camera.level() != mc.level) {
            camera = new ArmorStand(EntityType.ARMOR_STAND, mc.level);
            camera.setInvisible(true);
        }
        double dx = tx - x, dy = ty - y, dz = tz - z;
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float pitch = (float) -(Mth.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * Mth.RAD_TO_DEG);
        camera.moveTo(x, y - camera.getEyeHeight(), z, yaw, pitch);
        camera.setYHeadRot(yaw);
        camera.yHeadRotO = yaw;
        camera.yBodyRot = yaw;
        mc.setCameraEntity(camera);
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_oceangearshots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_oceangearshots_" + System.currentTimeMillis(), settings,
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
            var until = UNTIL.get(step);
            if (until != null && !until.getAsBoolean() && waited < 30) {
                waited++;
                for (int i = step; i < AT.size(); i++) {
                    AT.set(i, AT.get(i) + 1);
                }
                return;
            }
            waited = 0;
            PLAN.get(step++).run();
        }
    }
}
