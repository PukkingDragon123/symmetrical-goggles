package dev.lowpix.winterworks.client;

import static dev.lowpix.winterworks.client.ShowcaseDirector.at;
import static dev.lowpix.winterworks.client.ShowcaseDirector.cmd;
import static dev.lowpix.winterworks.client.ShowcaseDirector.server;
import static dev.lowpix.winterworks.client.ShowcaseDirector.shot;

import dev.lowpix.winterworks.Winterworks;
import dev.lowpix.winterworks.world.DigSite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.util.RandomSource;

/** The Amber Age scenes of the flat-world showcase (./gradlew runShowcase). */
final class AmberScenes {
    private static final BlockPos DIG = new BlockPos(420, -52, 0);

    private AmberScenes() {}

    private static String pot(String... sherds) {
        return "{id:\"minecraft:decorated_pot\",count:1,components:{\"minecraft:pot_decorations\":[\"" + String.join("\",\"", sherds)
                + "\"]}}";
    }

    static int plan(int t) {
        // amber, an Amberwood tree oozing resin, mosquitoes empty / full of blood / full of amber
        at(t += 5, () -> {
            net.minecraft.client.Minecraft.getInstance().options.hideGui = true;
            cmd("fill 330 -61 -8 370 -61 20 minecraft:sand");
            cmd("fill 330 -61 10 370 -61 20 minecraft:coarse_dirt");
            cmd("setblock 352 -61 12 minecraft:grass_block");
            cmd("setblock 343 -60 8 winterworks:amber_block[inclusion=mosquito]");
            cmd("setblock 344 -60 8 winterworks:amber_block[inclusion=seed]");
            cmd("setblock 345 -60 8 winterworks:amber_block");
            cmd("setblock 344 -59 8 winterworks:amber_block[inclusion=mosquito]");
            cmd("fill 338 -60 11 338 -58 11 winterworks:petrified_log");
            cmd("setblock 341 -60 6 minecraft:suspicious_sand");
            cmd("setblock 347 -60 5 winterworks:amber_fossil");
            cmd("setblock 357 -60 9 minecraft:pitcher_plant[half=lower]");
            cmd("setblock 357 -59 9 minecraft:pitcher_plant[half=upper]");
            cmd("summon winterworks:mosquito 347.5 -58.6 4 {NoAI:1b,NoGravity:1b,State:\"empty\",Rotation:[200f,0f],PersistenceRequired:1b}");
            cmd("summon winterworks:mosquito 349.5 -58.9 5.5 {NoAI:1b,NoGravity:1b,State:\"blood\",Rotation:[150f,0f],PersistenceRequired:1b}");
            cmd("summon winterworks:mosquito 351 -58.4 7 {NoAI:1b,NoGravity:1b,State:\"amber\",Rotation:[170f,0f],PersistenceRequired:1b}");
        });
        at(t += 5, () -> server(level -> level.registryAccess().registryOrThrow(Registries.CONFIGURED_FEATURE)
                .getHolder(ResourceKey.create(Registries.CONFIGURED_FEATURE, Winterworks.id("amberwood")))
                .ifPresent(f -> f.value().place(level, level.getChunkSource().getGenerator(), RandomSource.create(3),
                        new BlockPos(352, -60, 12)))));
        at(t += 5, () -> cmd("tp @s 348 -58.3 0.6 5 14"));
        at(t += 120, () -> shot("amber_and_mosquitoes"));
        at(t += 5, () -> cmd("tp @s 349.6 -58.6 3.6 10 22"));
        at(t += 40, () -> shot("mosquitoes_close"));
        // Pot Golems: a Howl head with a bow, a Danger head with a blade, a plain pot with a pickaxe, and one potless
        at(t += 5, () -> {
            cmd("fill 375 -61 -8 405 -61 20 minecraft:sandstone");
            cmd("summon winterworks:pot_golem 383.5 -60 8 {NoAI:1b,Rotation:[160f,0f],PersistenceRequired:1b,Shard:\"archer\",Head:"
                    + pot("minecraft:brick", "minecraft:howl_pottery_sherd", "minecraft:brick", "minecraft:howl_pottery_sherd") + "}");
            cmd("summon winterworks:pot_golem 388.5 -60 9 {NoAI:1b,Rotation:[180f,0f],PersistenceRequired:1b,Shard:\"blade\",Head:"
                    + pot("minecraft:danger_pottery_sherd", "minecraft:brick", "minecraft:brick", "minecraft:danger_pottery_sherd") + "}");
            cmd("summon winterworks:pot_golem 393.5 -60 8 {NoAI:1b,Rotation:[200f,0f],PersistenceRequired:1b,Shard:\"miner\",Head:"
                    + pot("minecraft:miner_pottery_sherd", "minecraft:archer_pottery_sherd", "minecraft:prize_pottery_sherd",
                    "minecraft:skull_pottery_sherd") + "}");
            cmd("summon winterworks:pot_golem 398.5 -60 10 {NoAI:1b,Rotation:[215f,0f],PersistenceRequired:1b}");
            cmd("tp @s 390.5 -57.2 -1.5 0 10");
        });
        at(t += 120, () -> shot("pot_golems"));
        at(t += 5, () -> cmd("tp @s 396.8 -57.6 4.4 15 -4"));
        at(t += 40, () -> shot("pot_golem_potless"));
        // a Dig Site carved into a block of stone
        at(t += 5, () -> {
            cmd("fill 405 -61 -14 435 -42 14 minecraft:stone");
            cmd("effect give @s minecraft:night_vision infinite 0 true");
        });
        at(t += 10, () -> server(level -> DigSite.build(level, DIG, RandomSource.create(11))));
        at(t += 20, () -> cmd("tp @s 420.5 -48.5 -8.5 0 22"));
        at(t += 100, () -> shot("dig_site"));
        return t;
    }
}
