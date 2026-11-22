package dev.lowpix.winterworks.client;

import static dev.lowpix.winterworks.client.ShowcaseDirector.at;
import static dev.lowpix.winterworks.client.ShowcaseDirector.cmd;
import static dev.lowpix.winterworks.client.ShowcaseDirector.server;
import static dev.lowpix.winterworks.client.ShowcaseDirector.shot;

import dev.lowpix.winterworks.boss.FrozenTomb;
import dev.lowpix.winterworks.registry.WWBlocks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;

/** The Cold Zone scenes of the flat-world showcase (./gradlew runShowcase). */
final class ColdScenes {
    private static final BlockPos TOMB = new BlockPos(275, -52, 0);

    private ColdScenes() {}

    static int plan(int t) {
        // polar bears, a shorn one, a cub with a fish, jockeys, the zombie polar bear, the fur armour
        at(t += 5, () -> {
            cmd("difficulty normal");   // hostile mobs vanish on peaceful
            cmd("gamemode creative");
            cmd("item replace entity @s weapon.mainhand with minecraft:air");
            net.minecraft.client.Minecraft.getInstance().options.hideGui = true;
            cmd("fill 140 -61 -10 190 -61 30 minecraft:snow_block");
            cmd("fill 170 -61 18 186 -61 28 minecraft:water");
            cmd("summon minecraft:polar_bear 160.5 -60 10 {NoAI:1b,Rotation:[165f,0f],PersistenceRequired:1b,"
                    + "HandItems:[{id:\"minecraft:salmon\",count:1},{}]}");
            cmd("summon minecraft:polar_bear 153.5 -60 13 {NoAI:1b,Rotation:[205f,0f],ShornTicks:6000,PersistenceRequired:1b}");
            cmd("summon minecraft:polar_bear 157 -60 6 {NoAI:1b,Age:-24000,Rotation:[180f,0f],PersistenceRequired:1b}");
            cmd("summon winterworks:zombie_polar_bear 167.5 -60 12 {NoAI:1b,Rotation:[150f,0f],PersistenceRequired:1b,"
                    + "Passengers:[{id:\"winterworks:frost_zombie\",NoAI:1b,PersistenceRequired:1b}]}");
            cmd("summon minecraft:polar_bear 173.5 -60 15 {NoAI:1b,Rotation:[140f,0f],PersistenceRequired:1b,Passengers:"
                    + "[{id:\"minecraft:stray\",NoAI:1b,PersistenceRequired:1b,HandItems:[{id:\"minecraft:bow\",count:1},{}]}]}");
            cmd("summon minecraft:armor_stand 149.5 -60 5 {Rotation:[210f,0f],ShowArms:1b,ArmorItems:["
                    + "{id:\"winterworks:fur_boots\",count:1},{id:\"winterworks:fur_leggings\",count:1},"
                    + "{id:\"winterworks:fur_coat\",count:1},{id:\"winterworks:fur_hood\",count:1}]}");
            cmd("tp @s 162 -58.4 1.5 12 10");
        });
        at(t += 120, () -> shot("polar_bears"));
        at(t += 5, () -> cmd("tp @s 150 -58.5 2.3 8 8"));
        at(t += 40, () -> shot("fur_armour"));
        // the Frost Mauler, awake, in a snowy arena with ice spikes
        at(t += 5, () -> {
            cmd("fill 200 -61 -10 240 -61 30 minecraft:snow_block");
            cmd("fill 206 -60 18 207 -55 18 minecraft:packed_ice");
            cmd("fill 232 -60 20 233 -53 20 minecraft:blue_ice");
            cmd("summon winterworks:frost_mauler 220.5 -60 12 {NoAI:1b,Rotation:[160f,0f],PersistenceRequired:1b}");
            cmd("tp @s 223 -57.4 3.5 15 8");
        });
        at(t += 120, () -> shot("frost_mauler"));
        at(t += 5, () -> cmd("tp @s 218.5 -57.6 6.5 -20 14"));
        at(t += 40, () -> shot("frost_mauler_close"));
        // the Fang Daggers, dual-wielded, and the skull on a plinth
        at(t += 5, () -> {
            cmd("fill 300 -61 -6 312 -61 6 minecraft:packed_ice");
            cmd("setblock 306 -60 3 minecraft:polished_deepslate");
            cmd("setblock 306 -59 3 winterworks:frost_mauler_skull");
            cmd("item replace entity @s weapon.mainhand with winterworks:fang_dagger");
            cmd("item replace entity @s weapon.offhand with winterworks:fang_dagger");
            cmd("tp @s 306.5 -60 0.3 0 22");
            net.minecraft.client.Minecraft.getInstance().options.hideGui = false;   // show the hands
        });
        at(t += 60, () -> shot("fang_daggers_and_skull"));
        at(t += 5, () -> {
            net.minecraft.client.Minecraft.getInstance().options.hideGui = true;
            cmd("item replace entity @s weapon.mainhand with minecraft:air");
            cmd("item replace entity @s weapon.offhand with minecraft:air");
        });
        // a frozen tomb carved into a block of stone, then woken by breaking its ice
        at(t += 5, () -> {
            cmd("fill 260 -61 -16 290 -40 16 minecraft:stone");
            cmd("effect give @s minecraft:night_vision infinite 0 true");
        });
        at(t += 10, () -> server(level -> FrozenTomb.build(level, TOMB, RandomSource.create(7))));
        at(t += 20, () -> cmd("tp @s 275.5 -50 -7.5 0 12"));
        at(t += 100, () -> shot("frozen_tomb"));
        at(t += 5, () -> server(level -> {
            List<BlockPos> ice = new ArrayList<>();
            for (BlockPos p : BlockPos.betweenClosed(TOMB.offset(-5, -3, -5), TOMB.offset(5, 6, 5))) {
                if (level.getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                    ice.add(p.immutable());
                }
            }
            ice.sort((a, b) -> Double.compare(a.distSqr(TOMB.offset(0, 0, -9)), b.distSqr(TOMB.offset(0, 0, -9))));
            for (int i = 0; i < Math.min(7, ice.size()); i++) {
                level.destroyBlock(ice.get(i), false);
            }
        }));
        at(t += 30, () -> shot("tomb_cracking"));
        at(t += 90, () -> shot("mauler_awakens"));
        return t;
    }
}
