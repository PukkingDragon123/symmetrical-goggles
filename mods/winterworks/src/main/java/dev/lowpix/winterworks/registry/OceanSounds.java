package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;

/** Tides & Treasures sound events (docs/OCEAN_UPDATE.md). Files are mapped in tools/sound_map.json. */
public final class OceanSounds {
    public static final SoundEvent ANGLERFISH_AMBIENT = reg("entity.anglerfish.ambient");
    public static final SoundEvent ANGLERFISH_HURT = reg("entity.anglerfish.hurt");
    public static final SoundEvent ANGLERFISH_DEATH = reg("entity.anglerfish.death");
    public static final SoundEvent ANGLERFISH_LUNGE = reg("entity.anglerfish.lunge");
    public static final SoundEvent ANGLERFISH_BITE = reg("entity.anglerfish.bite");
    public static final SoundEvent ANGLERFISH_FLOP = reg("entity.anglerfish.flop");
    public static final SoundEvent LIONFISH_HURT = reg("entity.lionfish.hurt");
    public static final SoundEvent LIONFISH_DEATH = reg("entity.lionfish.death");
    public static final SoundEvent LIONFISH_FLARE = reg("entity.lionfish.flare");
    public static final SoundEvent LIONFISH_FLOP = reg("entity.lionfish.flop");
    public static final SoundEvent NAUTILUS_AMBIENT = reg("entity.nautilus.ambient");
    public static final SoundEvent NAUTILUS_HURT = reg("entity.nautilus.hurt");
    public static final SoundEvent NAUTILUS_DEATH = reg("entity.nautilus.death");
    public static final SoundEvent NAUTILUS_DASH = reg("entity.nautilus.dash");
    public static final SoundEvent WHALE_SONG = reg("entity.whale.song");
    public static final SoundEvent WHALE_CALL = reg("entity.whale.call");
    public static final SoundEvent WHALE_BREATHE = reg("entity.whale.breathe");
    public static final SoundEvent WHALE_HURT = reg("entity.whale.hurt");
    public static final SoundEvent WHALE_DEATH = reg("entity.whale.death");
    public static final SoundEvent WHALE_SWALLOW = reg("entity.whale.swallow");
    public static final SoundEvent WHALE_MOUTH_OPEN = reg("entity.whale.mouth_open");
    public static final SoundEvent WHALE_MOUTH_CLOSE = reg("entity.whale.mouth_close");
    public static final SoundEvent WHALE_SHAKE = reg("entity.whale.shake");
    public static final SoundEvent WHALE_EAT = reg("entity.whale.eat");
    public static final SoundEvent WHALE_NOTE = reg("entity.whale.note");
    public static final SoundEvent WHALE_TAMED = reg("entity.whale.tamed");
    public static final SoundEvent BELLY_AMBIENT = reg("ambient.whale_belly.loop");
    public static final SoundEvent BELLY_CURRENT = reg("ambient.whale_belly.current");
    public static final SoundEvent ELDER_BUBBLE = reg("entity.elder_guardian.bubble");
    public static final SoundEvent ELDER_STARE_CHARGE = reg("entity.elder_guardian.stare_charge");
    public static final SoundEvent ELDER_LASER = reg("entity.elder_guardian.laser");
    public static final SoundEvent ELDER_TAIL_WHIP = reg("entity.elder_guardian.tail_whip");
    public static final SoundEvent ELDER_ROAR = reg("entity.elder_guardian.roar");
    public static final SoundEvent VENT_LOOP = reg("block.hydrothermal_vent.loop");
    public static final SoundEvent TUBE_WORMS_RETRACT = reg("block.tube_worms.retract");
    public static final SoundEvent TUBE_WORMS_EXTEND = reg("block.tube_worms.extend");
    public static final SoundEvent ANGLER_LIGHT_HUM = reg("block.angler_light.hum");
    public static final SoundEvent WHALE_LURE_PULSE = reg("block.whale_lure.pulse");
    public static final SoundEvent EYE_AMBIENT = reg("block.eye_of_the_ocean.ambient");
    public static final SoundEvent EYE_ACTIVATE = reg("block.eye_of_the_ocean.activate");
    public static final SoundEvent CANNON_FIRE = reg("block.cannon.fire");
    public static final SoundEvent CANNON_LOAD = reg("block.cannon.load");
    public static final SoundEvent CANNON_AIM = reg("block.cannon.aim");
    public static final SoundEvent CANNONBALL_BURST = reg("entity.cannonball.burst");
    public static final SoundEvent SHELL_RETREAT = reg("item.turtle_shell.retreat");
    public static final SoundEvent BARNACLES_BREAK = reg("block.barnacles.break");
    public static final SoundEvent HORN_BIND = reg("item.nautilus_horn.bind");
    public static final SoundEvent HORN_COMMAND = reg("item.nautilus_horn.command");

    private OceanSounds() {}

    private static SoundEvent reg(String name) {
        ResourceLocation id = Winterworks.id(name);
        return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
    }

    public static void init() {}
}
