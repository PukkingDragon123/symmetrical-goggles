package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;

/** Sound events. Their files are mapped in assets/winterworks/sounds.json (re-pitched vanilla sounds). */
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
    public static final SoundEvent RAM_CHARGED = reg("effect.ramming.charged");
    public static final SoundEvent RAM_IMPACT = reg("effect.ramming.impact");
    public static final SoundEvent LOCO_WHISTLE = reg("entity.locomotive.whistle");
    public static final SoundEvent LOCO_CHUFF = reg("entity.locomotive.chuff");
    public static final SoundEvent DRAGON_ROAR = reg("entity.dragon_locomotive.roar");
    public static final SoundEvent CHAIN_LIFT = reg("block.lift_rail.clank");
    public static final SoundEvent BOOSTER = reg("block.booster_rail.boost");
    public static final SoundEvent COUPLE = reg("entity.minecart.couple");
    public static final SoundEvent GLOBE_SHAKE = reg("block.snow_globe.shake");

    private WWSounds() {}

    private static SoundEvent reg(String name) {
        ResourceLocation id = Winterworks.id(name);
        return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
    }

    public static void init() {}
}
