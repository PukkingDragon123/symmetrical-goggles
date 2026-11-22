package dev.lowpix.winterworks.client.harvester;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.amber.AmberwoodLogBlock;
import dev.lowpix.winterworks.amber.MosquitoEntity;
import dev.lowpix.winterworks.amber.SnifferTaming;
import dev.lowpix.winterworks.amber.SnifferWatering;
import dev.lowpix.winterworks.amber.TamedSniffer;
import dev.lowpix.winterworks.harvester.HarvesterEggBlock;
import dev.lowpix.winterworks.harvester.HarvesterEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.animal.Sheep;
import net.minecraft.world.entity.animal.horse.AbstractHorse;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.FarmBlock;
import net.minecraft.world.level.block.PitcherCropBlock;
import net.minecraft.world.level.block.SweetBerryBushBlock;
import net.minecraft.world.level.block.TorchflowerCropBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.minecraft.world.phys.Vec3;

/**
 * Dev-only screenshots of the Harvester and the Amber Age plant fixes (docs/FIXES_0_4.md): with
 * -Dwinterworks.harvestershots=all (e.g. in JAVA_TOOL_OPTIONS for ./gradlew runClient under xvfb-run) the client makes
 * a flat world and saves screenshots/winterworks_harvester_*.png: a Harvester cropping a farm (and its chest full of
 * the harvest), one with saddle and chests and ridden, herding sheep, eggs hatching underwater, glowing torchflowers
 * and pitcher plants at night, a mosquito burning by a torchflower, a mosquito sipping resin beside a survival player,
 * and a sniffer sneezing over crops. Then it quits. The views come from a fixed camera (a client-side armour stand
 * set as the camera entity). A comma list instead of all (harvest,gear,herd,eggs,glow,mosquito,resin,sneeze) runs only
 * those scenes.
 */
final class HarvesterShots {
    private static final String MODE = System.getProperty("winterworks.harvestershots", "");
    private static final Set<String> SCENES = Set.copyOf(Arrays.asList(MODE.split(",")));
    private static final List<Step> PLAN = new ArrayList<>();
    private static final int Y = -60;   // standing height in the flat world
    private static boolean created;
    private static int ticks, step, waitStart = -1;
    private static volatile int harvesterId = -1, mountId = -1, snifferId = -1, mosquitoId = -1;
    /** While set, the ridden Harvester walks this way (blocks per tick) up to `driveUntilX`. */
    private static double driveSpeed, driveUntilX;
    private static ArmorStand camera;

    /** At `tick` run `job` (or, with a condition, wait for it up to `timeout` ticks first). */
    private record Step(int tick, Runnable job, BooleanSupplier until, int timeout) {}

    private HarvesterShots() {}

    private static boolean on(String scene) {
        return SCENES.contains("all") || SCENES.contains(scene);
    }

    static void init() {
        if (MODE.isEmpty()) {
            return;
        }
        ClientTickEvents.END_CLIENT_TICK.register(HarvesterShots::tick);
        int t = 40;
        at(t, () -> {
            for (String c : new String[]{"gamerule doDaylightCycle false", "gamerule doMobSpawning false", "gamerule doWeatherCycle false",
                    "time set 6000", "weather clear", "difficulty normal", "gamemode creative"}) {
                cmd(c);
            }
            Minecraft.getInstance().options.renderDistance().set(8);
            Minecraft.getInstance().options.hideGui = true;
        });
        t += 10;
        if (on("harvest")) {
            t = harvest(t);
        }
        if (on("gear")) {
            t = gear(t);
        }
        if (on("herd")) {
            t = herd(t);
        }
        if (on("eggs")) {
            t = eggs(t);
        }
        if (on("glow")) {
            t = glow(t);
        }
        if (on("mosquito")) {
            t = mosquito(t);
        }
        if (on("resin")) {
            t = resin(t);
        }
        if (on("sneeze")) {
            t = sneeze(t);
        }
        at(t + 10, () -> Minecraft.getInstance().stop());
    }

    // --------------------------------------------------------------------------------------- scenes

    /** A farm of ripe crops and a tamed Harvester with chests left beside it: it crops them a head-wide mouthful at a time. */
    private static int harvest(int t) {
        int x0 = 0, z0 = 30;
        at(t, () -> server(level -> {
            clear(level, x0 - 14, z0 - 14, x0 + 14, z0 + 14);
            for (int x = x0 - 4; x <= x0 + 4; x++) {
                for (int z = z0 - 4; z <= z0 + 4; z++) {
                    BlockPos soil = new BlockPos(x, Y - 1, z);
                    if (x == x0) {
                        level.setBlockAndUpdate(soil, Blocks.WATER.defaultBlockState());
                        continue;
                    }
                    level.setBlockAndUpdate(soil, Blocks.FARMLAND.defaultBlockState().setValue(FarmBlock.MOISTURE, 7));
                    BlockState crop = switch (Math.abs(x - x0)) {
                        case 1 -> ((CropBlock) Blocks.WHEAT).getStateForAge(7);
                        case 2 -> ((CropBlock) Blocks.CARROTS).getStateForAge(7);
                        case 3 -> x < x0 ? ((CropBlock) Blocks.POTATOES).getStateForAge(7) : ((CropBlock) Blocks.BEETROOTS).getStateForAge(3);
                        default -> (z % 2 == 0) ? Blocks.TORCHFLOWER.defaultBlockState() : ((CropBlock) Blocks.WHEAT).getStateForAge(7);
                    };
                    level.setBlockAndUpdate(soil.above(), crop);
                }
            }
            for (int z = z0 - 4; z <= z0 + 4; z += 2) {   // sweet berries along the far end
                level.setBlockAndUpdate(new BlockPos(x0 + 7, Y, z), Blocks.SWEET_BERRY_BUSH.defaultBlockState().setValue(SweetBerryBushBlock.AGE, 3));
            }
            HarvesterEntity h = spawnHarvester(level, x0 - 7.5, z0 + 0.5, -90f, true, true);
            h.leaveAt(h.blockPosition());
            harvesterId = h.getId();
        }));
        at(t += 3, () -> tp(x0 - 10.5, Y, z0 - 12.5));
        at(t += 2, () -> cam(x0 - 9, Y + 5.0, z0 - 7.5, x0 - 3, Y, z0 + 0.5));
        at(t += 40, () -> shot("harvest_overview"));
        t += 1;
        when(t, () -> chomping(harvesterId), 600, () -> sideOn(harvesterId, 7.0, 2.6));
        at(t += 2, () -> shot("harvest_chomp"));
        at(t += 40, () -> {});
        t += 1;
        when(t, () -> chomping(harvesterId), 600, () -> frontOn(harvesterId));
        at(t += 2, () -> shot("harvest_chomp_front"));
        at(t += 500, () -> cam(x0 - 7.5, Y + 6.0, z0 - 8.5, x0, Y, z0 + 0.5));
        at(t += 10, () -> shot("harvest_later"));
        at(t += 2, () -> {   // its chest, full of the harvest (the owner opens it, standing by it)
            Minecraft mc = Minecraft.getInstance();
            mc.setCameraEntity(mc.player);
            mc.options.hideGui = false;
            server(level -> {
                if (level.getEntity(harvesterId) instanceof HarvesterEntity h) {
                    ServerPlayer p = player(level);
                    p.teleportTo(h.getX() + 2.5, h.getY(), h.getZ() + 1.5);
                    h.openCustomInventoryScreen(p);
                }
            });
        });
        at(t += 15, () -> shot("harvest_chest"));
        at(t += 2, () -> {
            Minecraft.getInstance().player.closeContainer();
            Minecraft.getInstance().options.hideGui = true;
            server(level -> discard(level, harvesterId));
        });
        return t + 5;
    }

    /** A saddled Harvester with both chests side-on, sitting, then ridden. */
    private static int gear(int t) {
        int x0 = 60, z0 = 0;
        at(t, () -> server(level -> {
            clear(level, x0 - 14, z0 - 14, x0 + 14, z0 + 14);
            HarvesterEntity m = spawnHarvester(level, x0 + 0.5, z0 + 0.5, -90f, true, true);
            m.setOrder(HarvesterEntity.Order.SIT);
            mountId = m.getId();
        }));
        at(t += 3, () -> tp(x0 - 4.5, Y, z0 + 8.5));
        at(t += 2, () -> cam(x0 + 1.0, Y + 2.4, z0 + 7.0, x0 + 0.2, Y + 1.0, z0 + 0.5));
        at(t += 50, () -> shot("gear_sitting"));
        at(t += 2, () -> server(level -> {
            if (level.getEntity(mountId) instanceof HarvesterEntity m) {
                m.setOrder(HarvesterEntity.Order.FOLLOW);
                m.setNoAi(true);   // stands still, side-on, for its portrait
                m.moveTo(m.getX(), m.getY(), m.getZ(), -90f, 0f);
                m.setYHeadRot(-90f);
                m.setYBodyRot(-90f);
            }
        }));
        at(t += 40, () -> shot("gear_side"));
        at(t += 1, () -> server(level -> {
            if (level.getEntity(mountId) instanceof HarvesterEntity m) {
                m.setNoAi(false);
            }
        }));
        at(t += 2, () -> server(level -> {
            ServerPlayer p = player(level);
            if (level.getEntity(mountId) instanceof HarvesterEntity m) {
                p.setYRot(-90f);
                p.startRiding(m, true);
            }
        }));
        at(t += 5, () -> riderView(-60f, -22f, true));   // in front of the rider, from above
        at(t += 30, () -> shot("ridden"));
        at(t += 2, () -> riderView(-120f, 24f, false));    // behind the rider
        at(t += 15, () -> shot("ridden_back"));
        at(t += 2, () -> {
            riderOff();
            server(level -> {
                player(level).stopRiding();
                discard(level, mountId);
            });
        });
        return t + 5;
    }

    /** Riding a Harvester into a flock of sheep: its head shoves them ahead along the way it walks. */
    private static int herd(int t) {
        int x0 = 120, z0 = 0;
        at(t, () -> server(level -> {
            clear(level, x0 - 14, z0 - 14, x0 + 30, z0 + 14);
            for (int x = x0 + 22; x <= x0 + 28; x++) {   // a pen at the far end, open towards the Harvester
                for (int z = z0 - 4; z <= z0 + 4; z++) {
                    if (x == x0 + 28 || Math.abs(z - z0) == 4) {
                        level.setBlockAndUpdate(new BlockPos(x, Y, z), Blocks.OAK_FENCE.defaultBlockState());
                    }
                }
            }
            HarvesterEntity m = spawnHarvester(level, x0 + 0.5, z0 + 0.5, -90f, true, false);
            mountId = m.getId();
            DyeColor[] colors = {DyeColor.WHITE, DyeColor.WHITE, DyeColor.BROWN, DyeColor.WHITE, DyeColor.LIGHT_GRAY, DyeColor.BLACK};
            for (int i = 0; i < colors.length; i++) {
                Sheep s = EntityType.SHEEP.create(level);
                s.moveTo(x0 + 5.0 + (i % 3) * 1.1, Y, z0 - 0.9 + (i / 3) * 1.6 + (i % 2) * 0.3, -90f, 0f);
                s.setColor(colors[i]);
                level.addFreshEntity(s);
            }
            ServerPlayer p = player(level);
            p.setYRot(-90f);
            p.startRiding(m, true);
        }));
        at(t += 5, () -> riderView(-90f, 30f, false));   // the rider's view, behind and above
        at(t += 30, () -> {
            driveSpeed = 0.14;
            driveUntilX = x0 + 22;
        });
        t += 4;
        when(t, () -> shoving(mountId), 200, () -> {});
        at(t += 1, () -> shot("herding"));
        at(t += 12, () -> shot("herding_2"));
        at(t += 24, () -> {   // ahead of it and to one side, looking back at the head and the herd
            Minecraft mc = Minecraft.getInstance();
            if (mc.level.getEntity(mountId) instanceof HarvesterEntity h) {
                cam(h.getX() + 6.5, Y + 2.8, h.getZ() + 5.0, h.getX() + 3.0, Y + 0.6, h.getZ());
            }
        });
        at(t += 3, () -> shot("herding_ahead"));
        at(t += 30, () -> {
            driveSpeed = 0;
            riderOff();
            server(level -> {
                player(level).stopRiding();
                discard(level, mountId);
            });
        });
        return t + 5;
    }

    /** An open tank of water with eggs at every stage, one hatching, and a dry egg beside it that waits. */
    private static int eggs(int t) {
        int x0 = 0, z0 = -60;
        at(t, () -> server(level -> {
            clear(level, x0 - 10, z0 - 10, x0 + 10, z0 + 10);
            for (int x = x0 - 3; x <= x0 + 3; x++) {   // a pond two deep, moss on its floor
                for (int z = z0 - 2; z <= z0 + 2; z++) {
                    level.setBlockAndUpdate(new BlockPos(x, Y - 3, z), Blocks.MOSS_BLOCK.defaultBlockState());
                    level.setBlockAndUpdate(new BlockPos(x, Y - 2, z), Blocks.WATER.defaultBlockState());
                    level.setBlockAndUpdate(new BlockPos(x, Y - 1, z), Blocks.WATER.defaultBlockState());
                }
            }
            for (int i = 0; i < 3; i++) {
                level.setBlockAndUpdate(new BlockPos(x0 - 2 + i * 2, Y - 2, z0), WWBlocks.HARVESTER_EGG.defaultBlockState()
                        .setValue(HarvesterEggBlock.HATCH, i).setValue(HarvesterEggBlock.WATERLOGGED, true));
            }
            level.setBlockAndUpdate(new BlockPos(x0 + 5, Y, z0), WWBlocks.HARVESTER_EGG.defaultBlockState());   // dry: it waits
        }));
        at(t += 3, () -> {
            cmd("gamemode spectator");   // (no stray in-wall overlay from the player while the camera is elsewhere)
            tp(x0 - 6.5, Y + 2, z0 - 6.5);
        });
        at(t += 2, () -> cam(x0 + 1.0, Y + 2.6, z0 - 3.6, x0 + 1.0, Y - 2.0, z0 + 0.3));
        at(t += 50, () -> shot("eggs_underwater"));
        at(t += 2, () -> server(level -> HarvesterEggBlock.develop(level, new BlockPos(x0 + 2, Y - 2, z0), HarvesterEggBlock.STAGE_TICKS)));
        at(t += 8, () -> shot("eggs_hatching"));
        at(t += 50, () -> shot("eggs_hatched"));
        at(t += 2, () -> {
            cmd("gamemode creative");
            server(level -> level.getEntitiesOfClass(HarvesterEntity.class,
                    new net.minecraft.world.phys.AABB(x0 - 12, Y - 5, z0 - 12, x0 + 12, Y + 10, z0 + 12)).forEach(Entity::discard));
        });
        return t + 5;
    }

    /** Night: torchflowers and pitcher plants at every stage light the garden, their luminous parts full-bright. */
    private static int glow(int t) {
        int x0 = 0, z0 = 120;
        at(t, () -> server(level -> {
            clear(level, x0 - 12, z0 - 12, x0 + 12, z0 + 12);
            for (int x = x0 - 5; x <= x0 + 5; x++) {
                for (int z = z0 - 3; z <= z0 + 3; z++) {
                    level.setBlockAndUpdate(new BlockPos(x, Y - 1, z), z == z0 ? Blocks.WATER.defaultBlockState()
                            : Blocks.FARMLAND.defaultBlockState().setValue(FarmBlock.MOISTURE, 7));
                }
            }
            // front row: torchflower crop 0, crop 1, then grown torchflowers; a potted one in front
            level.setBlockAndUpdate(new BlockPos(x0 - 4, Y, z0 - 2), Blocks.TORCHFLOWER_CROP.defaultBlockState().setValue(TorchflowerCropBlock.AGE, 0));
            level.setBlockAndUpdate(new BlockPos(x0 - 2, Y, z0 - 2), Blocks.TORCHFLOWER_CROP.defaultBlockState().setValue(TorchflowerCropBlock.AGE, 1));
            for (int x = x0; x <= x0 + 4; x += 2) {
                level.setBlockAndUpdate(new BlockPos(x, Y, z0 - 2), Blocks.TORCHFLOWER.defaultBlockState());
            }
            level.setBlockAndUpdate(new BlockPos(x0 + 3, Y, z0 - 5), Blocks.POTTED_TORCHFLOWER.defaultBlockState());
            // back row: pitcher crop 0..4, then a pitcher plant
            int x = x0 - 5;
            for (int age = 0; age <= 4; age++) {
                BlockState s = Blocks.PITCHER_CROP.defaultBlockState().setValue(PitcherCropBlock.AGE, age);
                level.setBlock(new BlockPos(x, Y, z0 + 2), s, Block.UPDATE_CLIENTS);
                if (age >= 3) {
                    level.setBlock(new BlockPos(x, Y + 1, z0 + 2), s.setValue(PitcherCropBlock.HALF, DoubleBlockHalf.UPPER), Block.UPDATE_CLIENTS);
                }
                x += 2;
            }
            level.setBlock(new BlockPos(x0 + 5, Y, z0 + 2), Blocks.PITCHER_PLANT.defaultBlockState(), Block.UPDATE_CLIENTS);
            level.setBlock(new BlockPos(x0 + 5, Y + 1, z0 + 2), Blocks.PITCHER_PLANT.defaultBlockState()
                    .setValue(PitcherCropBlock.HALF, DoubleBlockHalf.UPPER), Block.UPDATE_CLIENTS);
        }));
        at(t += 2, () -> cmd("time set 18000"));
        at(t += 3, () -> tp(x0 - 8.5, Y, z0 - 10.5));
        at(t += 2, () -> cam(x0 + 0.5, Y + 3.8, z0 - 8.5, x0 + 0.5, Y + 0.3, z0 + 0.5));
        at(t += 60, () -> shot("glow_night"));
        at(t += 2, () -> cam(x0 + 3.0, Y + 1.7, z0 - 3.6, x0 + 3.0, Y + 0.8, z0 + 2.5));
        at(t += 30, () -> shot("glow_night_close"));
        at(t += 2, () -> cam(x0 + 0.5, Y + 3.8, z0 - 8.5, x0 + 0.5, Y + 0.3, z0 + 0.5));
        at(t += 2, () -> cmd("time set 6000"));
        at(t += 40, () -> shot("glow_day"));
        return t + 5;
    }

    /** A mosquito strays too close to a torchflower and burns. */
    private static int mosquito(int t) {
        int x0 = 60, z0 = 120;
        at(t, () -> server(level -> {
            clear(level, x0 - 10, z0 - 10, x0 + 10, z0 + 10);
            level.setBlockAndUpdate(new BlockPos(x0, Y, z0), Blocks.TORCHFLOWER.defaultBlockState());
            level.setBlockAndUpdate(new BlockPos(x0 - 2, Y, z0 + 1), Blocks.TORCHFLOWER.defaultBlockState());
        }));
        at(t += 2, () -> cmd("time set 15500"));
        at(t += 2, () -> tp(x0 - 6.5, Y, z0 - 6.5));
        at(t += 2, () -> cam(x0 + 1.0, Y + 1.3, z0 - 3.2, x0 + 0.6, Y + 0.8, z0 + 0.5));
        at(t += 30, () -> server(level -> {
            MosquitoEntity m = WWEntities.MOSQUITO.create(level);
            m.moveTo(x0 + 1.2, Y + 0.9, z0 + 0.5, 90f, 0f);
            m.calmDown(1200);
            level.addFreshEntity(m);
            mosquitoId = m.getId();
        }));
        at(t += 7, () -> shot("mosquito_burning"));
        at(t += 8, () -> shot("mosquito_burning_2"));
        at(t += 2, () -> cmd("time set 6000"));
        at(t += 2, () -> server(level -> discard(level, mosquitoId)));
        return t + 5;
    }

    /** A survival player beside an oozing Amberwood: the hungry mosquito goes for the resin, not for them (the fix). */
    private static int resin(int t) {
        int x0 = 120, z0 = 120;
        at(t, () -> server(level -> {
            clear(level, x0 - 12, z0 - 12, x0 + 12, z0 + 12);
            for (int y = 0; y < 5; y++) {
                level.setBlockAndUpdate(new BlockPos(x0, Y + y, z0), WWBlocks.AMBERWOOD_LOG.defaultBlockState()
                        .setValue(AmberwoodLogBlock.RESIN, y == 1));
            }
            level.setBlockAndUpdate(new BlockPos(x0, Y + 5, z0), WWBlocks.AMBERWOOD_BLOOM.defaultBlockState());
            // logs behind the oozing one, so the mosquito perches on a side the camera sees
            level.setBlockAndUpdate(new BlockPos(x0 + 1, Y + 1, z0), WWBlocks.AMBERWOOD_LOG.defaultBlockState());
            level.setBlockAndUpdate(new BlockPos(x0, Y + 1, z0 + 1), WWBlocks.AMBERWOOD_LOG.defaultBlockState());
        }));
        at(t += 2, () -> cmd("gamemode survival"));
        at(t += 2, () -> tp(x0 - 3.5, Y, z0 - 3.5));
        at(t += 2, () -> cam(x0 - 2.6, Y + 2.0, z0 - 2.4, x0 - 0.4, Y + 1.3, z0 - 0.3));
        at(t += 20, () -> server(level -> {
            MosquitoEntity m = WWEntities.MOSQUITO.create(level);
            m.moveTo(x0 - 4.0, Y + 2.2, z0 - 2.0, 0f, 0f);
            level.addFreshEntity(m);
            m.setTarget(player(level));   // after the player at first
            mosquitoId = m.getId();
        }));
        t += 2;
        when(t, () -> drinking(mosquitoId), 600, () -> {});
        at(t += 10, () -> shot("mosquito_resin_sipping"));
        t += 1;
        when(t, () -> clientState(mosquitoId) == MosquitoEntity.State.AMBER, 400, () ->
                Winterworks.LOG.info("harvestershots: the mosquito sipped the resin by tick {}", ticks));
        at(t += 6, () -> shot("mosquito_resin_full"));
        at(t += 2, () -> {
            cmd("gamemode creative");
            server(level -> discard(level, mosquitoId));
        });
        return t + 5;
    }

    /** A tamed sniffer sneezes water over a field of crops. */
    private static int sneeze(int t) {
        int x0 = 60, z0 = 60;
        at(t, () -> server(level -> {
            clear(level, x0 - 12, z0 - 12, x0 + 12, z0 + 12);
            for (int x = x0; x <= x0 + 6; x++) {
                for (int z = z0 - 3; z <= z0 + 3; z++) {
                    level.setBlockAndUpdate(new BlockPos(x, Y - 1, z), Blocks.FARMLAND.defaultBlockState());
                    level.setBlockAndUpdate(new BlockPos(x, Y, z), ((CropBlock) (z % 2 == 0 ? Blocks.WHEAT : Blocks.CARROTS))
                            .getStateForAge(2 + Math.floorMod(x + z, 3)));
                }
            }
            level.setBlockAndUpdate(new BlockPos(x0 - 8, Y - 1, z0), Blocks.WATER.defaultBlockState());
            Sniffer s = EntityType.SNIFFER.create(level);
            s.moveTo(x0 - 3.0, Y, z0 + 0.5, -90f, 0f);
            s.setYHeadRot(-90f);
            s.setYBodyRot(-90f);
            level.addFreshEntity(s);
            SnifferTaming.tame(s, (TamedSniffer) s, java.util.UUID.randomUUID());   // its owner is away: it stays put
            ((TamedSniffer) s).ww$job().cooldown = 100000;
            snifferId = s.getId();
        }));
        at(t += 3, () -> tp(x0 - 8.5, Y, z0 - 8.5));
        at(t += 2, () -> cam(x0 - 1.2, Y + 2.6, z0 - 6.6, x0 - 0.8, Y + 0.9, z0 + 0.5));
        at(t += 60, () -> server(level -> {
            if (level.getEntity(snifferId) instanceof Sniffer s) {
                SnifferWatering.sneezeAt(level, s, new BlockPos(x0 + 2, Y - 1, z0));
            }
        }));
        at(t += 17, () -> shot("sniffer_inhale"));
        at(t += 6, () -> shot("sniffer_sneeze"));
        at(t += 3, () -> shot("sniffer_sneeze_2"));
        at(t += 40, () -> shot("sniffer_after"));
        at(t += 2, () -> server(level -> discard(level, snifferId)));
        return t + 5;
    }

    // --------------------------------------------------------------------------------------- helpers

    private static HarvesterEntity spawnHarvester(ServerLevel level, double x, double z, float yaw, boolean saddle, boolean chest) {
        HarvesterEntity h = WWEntities.HARVESTER.create(level);
        h.moveTo(x, Y, z, yaw, 0f);
        h.setYHeadRot(yaw);
        h.setYBodyRot(yaw);
        h.tameWithName(player(level));
        if (saddle) {
            h.equipSaddle(new ItemStack(Items.SADDLE), null);
        }
        if (chest) {
            h.getSlot(AbstractHorse.CHEST_SLOT_OFFSET).set(new ItemStack(Items.CHEST));
        }
        level.addFreshEntity(h);
        return h;
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

    private static void cam(Vec3 from, Vec3 to) {
        cam(from.x, from.y, from.z, to.x, to.y, to.z);
    }

    /** The camera beside the Harvester, square to it, looking at its head. */
    private static void sideOn(int id, double dist, double height) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level.getEntity(id) instanceof HarvesterEntity h) {
            Vec3 f = Vec3.directionFromRotation(0f, h.yBodyRot), right = new Vec3(-f.z, 0, f.x);
            Vec3 head = h.position().add(f.scale(HarvesterEntity.HEAD_REACH));
            cam(head.add(f.scale(-1.6)).add(right.scale(dist)).add(0, height, 0), head.add(f.scale(-1.4)).add(0, 0.7, 0));
        }
    }

    /** The camera in front of the Harvester and a little to one side, looking at its head and teeth. */
    private static void frontOn(int id) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level.getEntity(id) instanceof HarvesterEntity h) {
            Vec3 f = Vec3.directionFromRotation(0f, h.yBodyRot), right = new Vec3(-f.z, 0, f.x);
            Vec3 head = h.position().add(f.scale(HarvesterEntity.HEAD_REACH));
            cam(head.add(f.scale(4.0)).add(right.scale(2.6)).add(0, 2.2, 0), head.add(0, 0.5, 0));
        }
    }

    private static boolean chomping(int id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.level.getEntity(id) instanceof HarvesterEntity h && h.chompState.isStarted()
                && h.chompState.getAccumulatedTime() > 200 && h.chompState.getAccumulatedTime() < 500;
    }

    private static boolean shoving(int id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.level.getEntity(id) instanceof HarvesterEntity h && h.shoveState.isStarted()
                && h.shoveState.getAccumulatedTime() > 100 && h.shoveState.getAccumulatedTime() < 500;
    }

    private static boolean drinking(int id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.level.getEntity(id) instanceof MosquitoEntity m && m.isDrinking();
    }

    private static MosquitoEntity.State clientState(int id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.level != null && mc.level.getEntity(id) instanceof MosquitoEntity m ? m.state() : null;
    }

    private static void clear(ServerLevel level, int x1, int z1, int x2, int z2) {
        for (Entity e : level.getEntities(EntityType.SLIME, e -> true)) {   // the flat world's slimes
            e.discard();
        }
        for (BlockPos p : BlockPos.betweenClosed(x1, Y - 2, z1, x2, Y + 8, z2)) {
            BlockState want = p.getY() < Y - 1 ? Blocks.DIRT.defaultBlockState() : p.getY() == Y - 1 ? Blocks.GRASS_BLOCK.defaultBlockState()
                    : Blocks.AIR.defaultBlockState();
            if (!level.getBlockState(p).equals(want)) {
                level.setBlock(p, want, Block.UPDATE_CLIENTS);
            }
        }
    }

    private static void discard(ServerLevel level, int id) {
        Entity e = level.getEntity(id);
        if (e != null) {
            e.discard();
        }
    }

    private static ServerPlayer player(ServerLevel level) {
        return level.getServer().getPlayerList().getPlayers().get(0);
    }

    private static void at(int tick, Runnable r) {
        PLAN.add(new Step(tick, r, null, 0));
    }

    /** From `tick`, wait for `until` (at most `timeout` ticks), then run `job`. */
    private static void when(int tick, BooleanSupplier until, int timeout, Runnable job) {
        PLAN.add(new Step(tick, job, until, timeout));
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
        Screenshot.grab(mc.gameDirectory, "winterworks_harvester_" + name + ".png", mc.getMainRenderTarget(), msg -> {});
        Winterworks.LOG.info("harvestershots: {}", name);
    }

    /**
     * The rider's own third-person camera (the local player is only drawn when it is the camera; a ridden mount turns
     * with its rider): the rider looks along `heading` and `pitch` down, the camera behind them or, `front`, in front
     * of them looking back. A wider field of view fits the whole beast in.
     */
    private static void riderView(float heading, float pitch, boolean front) {
        Minecraft mc = Minecraft.getInstance();
        mc.setCameraEntity(mc.player);
        mc.options.setCameraType(front ? net.minecraft.client.CameraType.THIRD_PERSON_FRONT : net.minecraft.client.CameraType.THIRD_PERSON_BACK);
        mc.options.fov().set(85);
        float yaw = heading;
        mc.player.setYRot(yaw);
        mc.player.yRotO = yaw;
        mc.player.setXRot(pitch);
        mc.player.xRotO = pitch;
    }

    private static void riderOff() {
        Minecraft mc = Minecraft.getInstance();
        mc.options.setCameraType(net.minecraft.client.CameraType.FIRST_PERSON);
        mc.options.fov().set(70);
    }

    /** The rider's mount walks on by itself, straight ahead (no keys needed: the harness drives it). */
    private static void drive(Minecraft mc) {
        if (mc.player == null || !(mc.player.getVehicle() instanceof HarvesterEntity h)) {
            return;
        }
        if (driveSpeed > 0 && h.getX() < driveUntilX) {
            h.setPos(h.getX() + driveSpeed, h.getY(), h.getZ());
        }
    }

    private static void tick(Minecraft mc) {
        if (!created && mc.level == null && mc.screen != null && mc.getOverlay() == null) {
            mc.options.onboardAccessibility = false;
            mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
            created = true;
            LevelSettings settings = new LevelSettings("winterworks_harvestershots", GameType.CREATIVE, false, Difficulty.NORMAL,
                    true, new GameRules(), WorldDataConfiguration.DEFAULT);
            mc.createWorldOpenFlows().createFreshLevel("winterworks_harvestershots_" + System.currentTimeMillis(), settings,
                    new WorldOptions(7L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
            return;
        }
        if (mc.player == null || mc.level == null || step >= PLAN.size()) {
            return;
        }
        ticks++;
        drive(mc);
        mc.gui.getChat().clearMessages(false);
        mc.getToasts().clear();
        while (step < PLAN.size() && ticks >= PLAN.get(step).tick()) {
            Step s = PLAN.get(step);
            if (s.until() != null) {
                if (waitStart < 0) {
                    waitStart = ticks;
                }
                boolean ok = s.until().getAsBoolean();
                if (!ok && ticks - waitStart < s.timeout()) {
                    shiftRest();   // everything after waits too
                    return;
                }
                if (!ok) {
                    Winterworks.LOG.warn("harvestershots: gave up waiting at step {}", step);
                }
                waitStart = -1;
            }
            s.job().run();
            step++;
        }
    }

    /** Pushes the remaining steps (this one included) back a tick while one waits for its moment. */
    private static void shiftRest() {
        for (int i = step; i < PLAN.size(); i++) {
            Step s = PLAN.get(i);
            PLAN.set(i, new Step(s.tick() + 1, s.job(), s.until(), s.timeout()));
        }
    }
}
