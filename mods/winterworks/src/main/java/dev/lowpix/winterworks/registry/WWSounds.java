package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;

/** Sound events. Their files are mapped in assets/winterworks/sounds.json (written by tools/gen_data.py from tools/sound_map.json). */
public final class WWSounds {
    public static final SoundEvent ICEBREAKER_AMBIENT = reg("entity.icebreaker.ambient");
    public static final SoundEvent ICEBREAKER_HURT = reg("entity.icebreaker.hurt");
    public static final SoundEvent ICEBREAKER_DEATH = reg("entity.icebreaker.death");
    public static final SoundEvent ICEBREAKER_ROAR = reg("entity.icebreaker.roar");
    public static final SoundEvent ICEBREAKER_RAM = reg("entity.icebreaker.ram");
    public static final SoundEvent ICEBREAKER_HAPPY = reg("entity.icebreaker.happy");
    public static final SoundEvent ICEBREAKER_STEP = reg("entity.icebreaker.step");
    public static final SoundEvent ICEBREAKER_SLAP = reg("entity.icebreaker.slap");
    public static final SoundEvent ICEBREAKER_SPLASH = reg("entity.icebreaker.splash");
    public static final SoundEvent ICE_CRACK = reg("block.ice.crack");
    public static final SoundEvent HORN_SHEAR = reg("entity.icebreaker.shear");
    public static final SoundEvent HORN_REGROW = reg("entity.icebreaker.horn_regrow");
    public static final SoundEvent LAUNCHER_FIRE = reg("item.snowball_launcher.fire");
    public static final SoundEvent LAUNCHER_CHARGE = reg("item.snowball_launcher.charge");
    public static final SoundEvent LAUNCHER_HEAVY = reg("item.snowball_launcher.heavy");
    public static final SoundEvent LAUNCHER_OVERHEAT = reg("item.snowball_launcher.overheat");
    public static final SoundEvent LAUNCHER_EMPTY = reg("item.snowball_launcher.empty");
    public static final SoundEvent LAUNCHER_MODE = reg("item.snowball_launcher.mode");
    public static final SoundEvent LAUNCHER_LOAD = reg("item.snowball_launcher.load");
    public static final SoundEvent RAM_CHARGED = reg("effect.ramming.charged");
    public static final SoundEvent RAM_IMPACT = reg("effect.ramming.impact");
    public static final SoundEvent LOCO_WHISTLE = reg("entity.locomotive.whistle");
    public static final SoundEvent LOCO_CHUFF = reg("entity.locomotive.chuff");
    public static final SoundEvent DRAGON_ROAR = reg("entity.dragon_locomotive.roar");
    public static final SoundEvent CHAIN_LIFT = reg("block.lift_rail.clank");
    public static final SoundEvent BOOSTER = reg("block.booster_rail.boost");
    public static final SoundEvent COUPLE = reg("entity.minecart.couple");
    public static final SoundEvent GLOBE_SHAKE = reg("block.snow_globe.shake");

    // ---- Cold Zone update (docs/COLD_UPDATE.md)
    public static final SoundEvent ICE_CAVES_LOOP = reg("ambient.ice_caves.loop");
    public static final SoundEvent ICE_CAVES_ADDITIONS = reg("ambient.ice_caves.additions");
    public static final SoundEvent ICE_CAVES_MOOD = reg("ambient.ice_caves.mood");
    public static final SoundEvent PLAYER_SHIVER = reg("entity.player.shiver");
    public static final SoundEvent PLAYER_OVERHEAT = reg("entity.player.overheat");
    public static final SoundEvent ANCIENT_ICE_BREAK = reg("block.ancient_ice.break");
    public static final SoundEvent ANCIENT_ICE_STEP = reg("block.ancient_ice.step");
    public static final SoundEvent ANCIENT_ICE_PLACE = reg("block.ancient_ice.place");
    public static final SoundEvent ANCIENT_ICE_HIT = reg("block.ancient_ice.hit");
    public static final SoundEvent ANCIENT_ICE_FALL = reg("block.ancient_ice.fall");
    public static final SoundEvent ANCIENT_ICE_BURST = reg("block.ancient_ice.burst");
    public static final SoundEvent ANCIENT_ICE_CRACK = reg("block.ancient_ice.crack");
    public static final SoundEvent ICICLE_FALL = reg("block.icicle.fall");
    public static final SoundEvent ICICLE_SHATTER = reg("block.icicle.shatter");
    public static final SoundEvent TOMB_RUMBLE = reg("event.frozen_tomb.rumble");
    public static final SoundEvent MAULER_AMBIENT = reg("entity.frost_mauler.ambient");
    public static final SoundEvent MAULER_HURT = reg("entity.frost_mauler.hurt");
    public static final SoundEvent MAULER_DEATH = reg("entity.frost_mauler.death");
    public static final SoundEvent MAULER_ROAR = reg("entity.frost_mauler.roar");
    public static final SoundEvent MAULER_CLAW = reg("entity.frost_mauler.claw");
    public static final SoundEvent MAULER_BITE = reg("entity.frost_mauler.bite");
    public static final SoundEvent MAULER_FURY = reg("entity.frost_mauler.fury");
    public static final SoundEvent MAULER_STUNNED = reg("entity.frost_mauler.stunned");
    public static final SoundEvent MAULER_STEP = reg("entity.frost_mauler.step");
    public static final SoundEvent MAULER_WAKE = reg("entity.frost_mauler.wake");
    public static final SoundEvent MAULER_BREATH = reg("entity.frost_mauler.breath");
    public static final SoundEvent MAULER_EXPLODE = reg("entity.frost_mauler.explode");
    public static final SoundEvent BEAR_ROAR = reg("entity.polar_bear.roar");
    public static final SoundEvent BEAR_LEAP = reg("entity.polar_bear.leap");
    public static final SoundEvent BEAR_SLAM = reg("entity.polar_bear.slam");
    public static final SoundEvent BEAR_MUNCH = reg("entity.polar_bear.munch");
    public static final SoundEvent BEAR_CALM = reg("entity.polar_bear.calm");
    public static final SoundEvent BEAR_SHEAR = reg("entity.polar_bear.shear");
    public static final SoundEvent ZOMBIE_BEAR_AMBIENT = reg("entity.zombie_polar_bear.ambient");
    public static final SoundEvent ZOMBIE_BEAR_HURT = reg("entity.zombie_polar_bear.hurt");
    public static final SoundEvent ZOMBIE_BEAR_DEATH = reg("entity.zombie_polar_bear.death");
    public static final SoundEvent FROST_ZOMBIE_AMBIENT = reg("entity.frost_zombie.ambient");
    public static final SoundEvent FROST_ZOMBIE_HURT = reg("entity.frost_zombie.hurt");
    public static final SoundEvent FROST_ZOMBIE_DEATH = reg("entity.frost_zombie.death");
    public static final SoundEvent FROST_ZOMBIE_STEP = reg("entity.frost_zombie.step");
    public static final SoundEvent EQUIP_FUR = reg("item.armor.equip_fur");
    public static final SoundEvent DAGGER_SLASH = reg("item.fang_dagger.slash");
    public static final SoundEvent DAGGER_POUNCE = reg("item.fang_dagger.pounce");
    public static final SoundEvent DAGGER_CRIT = reg("item.fang_dagger.crit");
    public static final SoundEvent DAGGER_TIRED = reg("item.fang_dagger.tired");
    public static final SoundEvent DAGGER_READY = reg("item.fang_dagger.ready");
    public static final SoundEvent SKULL_IGNITE = reg("block.frost_mauler_skull.ignite");
    public static final SoundEvent SKULL_REVIVE = reg("block.frost_mauler_skull.revive");

    // ---- Amber Age update (docs/AMBER_UPDATE.md)
    public static final SoundEvent MOSQUITO_BUZZ = reg("entity.mosquito.buzz");
    public static final SoundEvent MOSQUITO_STAB = reg("entity.mosquito.stab");
    public static final SoundEvent MOSQUITO_DRINK = reg("entity.mosquito.drink");
    public static final SoundEvent MOSQUITO_SPIT = reg("entity.mosquito.spit");
    public static final SoundEvent MOSQUITO_HURT = reg("entity.mosquito.hurt");
    public static final SoundEvent MOSQUITO_DEATH = reg("entity.mosquito.death");
    public static final SoundEvent POT_GOLEM_STEP = reg("entity.pot_golem.step");
    public static final SoundEvent POT_GOLEM_HURT = reg("entity.pot_golem.hurt");
    public static final SoundEvent POT_GOLEM_DEATH = reg("entity.pot_golem.death");
    public static final SoundEvent POT_GOLEM_GIGGLE = reg("entity.pot_golem.giggle");
    public static final SoundEvent POT_GOLEM_SNEEZE = reg("entity.pot_golem.sneeze");
    public static final SoundEvent POT_GOLEM_HOWL = reg("entity.pot_golem.howl");
    public static final SoundEvent POT_GOLEM_BEAM = reg("entity.pot_golem.beam");
    public static final SoundEvent POT_GOLEM_FUSE = reg("entity.pot_golem.fuse");
    public static final SoundEvent POT_GOLEM_CRACK = reg("entity.pot_golem.crack");
    public static final SoundEvent POT_GOLEM_SHATTER = reg("entity.pot_golem.shatter");
    public static final SoundEvent POT_GOLEM_REPAIR = reg("entity.pot_golem.repair");
    public static final SoundEvent POT_GOLEM_BUILD = reg("entity.pot_golem.build");
    public static final SoundEvent AMBER_RELEASE = reg("block.amber.release");
    public static final SoundEvent BLOOD_SPLASH = reg("item.blood.splash");
    public static final SoundEvent SNIFFER_TAME = reg("entity.sniffer.tame");

    // ---- Hexes & Havoc (docs/HEXES_UPDATE.md)
    public static final SoundEvent ELIXIR_JAR_BUBBLE = reg("block.elixir_jar.bubble");
    public static final SoundEvent ELIXIR_JAR_FILL = reg("block.elixir_jar.fill");
    public static final SoundEvent ELIXIR_JAR_BREWED = reg("block.elixir_jar.brewed");
    public static final SoundEvent SOUL_TANK_ABSORB = reg("block.soul_tank.absorb");
    public static final SoundEvent SOUL_TANK_HUM = reg("block.soul_tank.hum");
    public static final SoundEvent HEXING_TABLE_HEX = reg("block.hexing_table.hex");
    public static final SoundEvent HEXING_TABLE_WHISPER = reg("block.hexing_table.whisper");
    public static final SoundEvent HEXED_BOOK_WHISPER = reg("item.hexed_book.whisper");
    public static final SoundEvent ELIXIR_DRINK = reg("item.elixir.drink");
    public static final SoundEvent ELIXIR_OF_GREED_SHATTER = reg("item.elixir_of_greed.shatter");
    public static final SoundEvent PIGLIN_WITCH_AMBIENT = reg("entity.piglin_witch.ambient");
    public static final SoundEvent PIGLIN_WITCH_HICCUP = reg("entity.piglin_witch.hiccup");
    public static final SoundEvent PIGLIN_WITCH_DRINK = reg("entity.piglin_witch.drink");
    public static final SoundEvent PIGLIN_WITCH_BURP = reg("entity.piglin_witch.burp");
    public static final SoundEvent PIGLIN_WITCH_RUMMAGE = reg("entity.piglin_witch.rummage");
    public static final SoundEvent PIGLIN_WITCH_REFUSE = reg("entity.piglin_witch.refuse");
    public static final SoundEvent PIGLIN_WITCH_CACKLE = reg("entity.piglin_witch.cackle");
    public static final SoundEvent PIGLIN_WITCH_HURT = reg("entity.piglin_witch.hurt");
    public static final SoundEvent PIGLIN_WITCH_DEATH = reg("entity.piglin_witch.death");
    public static final SoundEvent PIGLIN_WITCH_TRADE = reg("entity.piglin_witch.trade");
    public static final SoundEvent GOLDEN_PIGLIN_GROAN = reg("entity.golden_piglin.groan");
    public static final SoundEvent GOLDEN_PIGLIN_CREAK = reg("entity.golden_piglin.creak");
    public static final SoundEvent GOLDEN_PIGLIN_HURT = reg("entity.golden_piglin.hurt");
    public static final SoundEvent GOLDEN_PIGLIN_DEATH = reg("entity.golden_piglin.death");
    public static final SoundEvent TRIGGER = reg("curse.trigger");
    public static final SoundEvent NARCISSUS = reg("curse.narcissus");
    public static final SoundEvent ORPHEUS = reg("curse.orpheus");
    public static final SoundEvent SIN = reg("curse.sin");

    // ---- 0.4 fixes: amber (docs/FIXES_0_4.md): Pot Golem headshots and the six new head abilities
    public static final SoundEvent POT_GOLEM_HEADSHOT = reg("entity.pot_golem.headshot");
    public static final SoundEvent POT_GOLEM_SOOTHE = reg("entity.pot_golem.soothe");
    public static final SoundEvent POT_GOLEM_IGNITE = reg("entity.pot_golem.ignite");
    public static final SoundEvent POT_GOLEM_WIND_BURST = reg("entity.pot_golem.wind_burst");
    public static final SoundEvent POT_GOLEM_SHIELD = reg("entity.pot_golem.shield");
    public static final SoundEvent POT_GOLEM_STASH = reg("entity.pot_golem.stash");
    public static final SoundEvent POT_GOLEM_THROW = reg("entity.pot_golem.throw");

    // ---- 0.4 fixes: rails (docs/FIXES_0_4.md)
    public static final SoundEvent SWITCH_RAIL_SWITCH = reg("block.switch_rail.switch");
    // ---- end 0.4 fixes: rails

    /** Ancient ice: deeper and heavier than glass. */
    public static final net.minecraft.world.level.block.SoundType ANCIENT_ICE_SOUNDS = new net.minecraft.world.level.block.SoundType(
            1.0f, 1.0f, ANCIENT_ICE_BREAK, ANCIENT_ICE_STEP, ANCIENT_ICE_PLACE, ANCIENT_ICE_HIT, ANCIENT_ICE_FALL);

    private WWSounds() {}

    private static SoundEvent reg(String name) {
        ResourceLocation id = Winterworks.id(name);
        return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
    }

    public static void init() {}
}
