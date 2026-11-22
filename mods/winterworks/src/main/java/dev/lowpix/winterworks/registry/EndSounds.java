package dev.lowpix.winterworks.registry;

import dev.lowpix.winterworks.Winterworks;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;

/** The Living End's sound events (docs/END_UPDATE.md). Files are mapped in tools/sound_map.json. */
public final class EndSounds {
    // Enderfly
    public static final SoundEvent ENDERFLY_AMBIENT = reg("entity.enderfly.ambient");
    public static final SoundEvent ENDERFLY_FLUTTER = reg("entity.enderfly.flutter");
    public static final SoundEvent ENDERFLY_HURT = reg("entity.enderfly.hurt");
    public static final SoundEvent ENDERFLY_DEATH = reg("entity.enderfly.death");
    public static final SoundEvent ENDERFLY_TELEPORT = reg("entity.enderfly.teleport");
    public static final SoundEvent ENDERFLY_DIVE = reg("entity.enderfly.dive");
    // Endling
    public static final SoundEvent ENDLING_AMBIENT = reg("entity.endling.ambient");
    public static final SoundEvent ENDLING_HURT = reg("entity.endling.hurt");
    public static final SoundEvent ENDLING_DEATH = reg("entity.endling.death");
    public static final SoundEvent ENDLING_HAPPY = reg("entity.endling.happy");
    public static final SoundEvent ENDLING_SCARED = reg("entity.endling.scared");
    public static final SoundEvent ENDLING_TELEPORT = reg("entity.endling.teleport");
    public static final SoundEvent ENDLING_SACRIFICE = reg("entity.endling.sacrifice");
    // Gucker
    public static final SoundEvent GUCKER_AMBIENT = reg("entity.gucker.ambient");
    public static final SoundEvent GUCKER_HURT = reg("entity.gucker.hurt");
    public static final SoundEvent GUCKER_DEATH = reg("entity.gucker.death");
    public static final SoundEvent GUCKER_BREATHE = reg("entity.gucker.breathe");
    public static final SoundEvent GUCKER_BURROW = reg("entity.gucker.burrow");
    public static final SoundEvent GUCKER_EMERGE = reg("entity.gucker.emerge");
    public static final SoundEvent GUCKER_INFLATE = reg("entity.gucker.inflate");
    public static final SoundEvent GUCKER_SPIT = reg("entity.gucker.spit");
    public static final SoundEvent GUCKER_BITE = reg("entity.gucker.bite");
    public static final SoundEvent GUCKER_STEP = reg("entity.gucker.step");
    // Obolisk
    public static final SoundEvent OBOLISK_AMBIENT = reg("entity.obolisk.ambient");
    public static final SoundEvent OBOLISK_RISE = reg("entity.obolisk.rise");
    public static final SoundEvent OBOLISK_SETTLE = reg("entity.obolisk.settle");
    public static final SoundEvent OBOLISK_SLAM = reg("entity.obolisk.slam");
    public static final SoundEvent OBOLISK_STEP = reg("entity.obolisk.step");
    public static final SoundEvent OBOLISK_HURT = reg("entity.obolisk.hurt");
    public static final SoundEvent OBOLISK_DEATH = reg("entity.obolisk.death");
    // the Monolith
    public static final SoundEvent MONOLITH_AMBIENT = reg("entity.monolith.ambient");
    public static final SoundEvent MONOLITH_STARE = reg("entity.monolith.stare");
    public static final SoundEvent MONOLITH_SLAM = reg("entity.monolith.slam");
    public static final SoundEvent MONOLITH_GRAB = reg("entity.monolith.grab");
    public static final SoundEvent MONOLITH_CLAP = reg("entity.monolith.clap");
    public static final SoundEvent MONOLITH_SUMMON = reg("entity.monolith.summon");
    public static final SoundEvent MONOLITH_HURT = reg("entity.monolith.hurt");
    public static final SoundEvent MONOLITH_DEATH = reg("entity.monolith.death");
    // Dragonling and the egg
    public static final SoundEvent DRAGONLING_AMBIENT = reg("entity.dragonling.ambient");
    public static final SoundEvent DRAGONLING_HURT = reg("entity.dragonling.hurt");
    public static final SoundEvent DRAGONLING_DEATH = reg("entity.dragonling.death");
    public static final SoundEvent DRAGONLING_EAT = reg("entity.dragonling.eat");
    public static final SoundEvent DRAGONLING_ROAR = reg("entity.dragonling.roar");
    public static final SoundEvent DRAGONLING_FLAP = reg("entity.dragonling.flap");
    public static final SoundEvent DRAGONLING_BREATH = reg("entity.dragonling.breath");
    public static final SoundEvent DRAGONLING_HATCH = reg("entity.dragonling.hatch");
    public static final SoundEvent DRAGON_EGG_CRACK = reg("item.dragon_egg.crack");
    // the Ender Dragon rework
    public static final SoundEvent DRAGON_GRAB = reg("entity.ender_dragon.grab");
    public static final SoundEvent DRAGON_THROW = reg("entity.ender_dragon.throw");
    public static final SoundEvent DRAGON_BEAM_CHARGE = reg("entity.ender_dragon.beam_charge");
    public static final SoundEvent DRAGON_BEAM_FIRE = reg("entity.ender_dragon.beam_fire");
    public static final SoundEvent DRAGON_CRYSTAL_REGROW = reg("entity.ender_dragon.crystal_regrow");
    public static final SoundEvent DRAGON_TOWER_GROW = reg("entity.ender_dragon.tower_grow");
    // gear
    public static final SoundEvent GLIDER_FLAP = reg("item.end_glider.flap");
    public static final SoundEvent GLIDER_JET = reg("item.end_glider.jet");
    public static final SoundEvent GLIDER_BOOST = reg("item.end_glider.boost");
    public static final SoundEvent SHIELD_REFLECT = reg("item.obsidian_shield.reflect");
    public static final SoundEvent SHIELD_SHOCKWAVE = reg("item.obsidian_shield.shockwave");
    public static final SoundEvent WAND_PETRIFY = reg("item.monolith_wand.petrify");
    public static final SoundEvent PETRIFY_ENCASE = reg("effect.petrified.encase");
    public static final SoundEvent PETRIFY_SHATTER = reg("effect.petrified.shatter");
    // the world
    public static final SoundEvent ECLIPSE_BEGIN = reg("ambient.eclipse.begin");
    public static final SoundEvent ECLIPSE_END = reg("ambient.eclipse.end");
    public static final SoundEvent ECLIPSE_LOOP = reg("ambient.eclipse.loop");
    public static final SoundEvent BLOOM_OPEN = reg("block.end_bloom.open");
    public static final SoundEvent COCOON_CRACK = reg("block.chorus_cocoon.crack");
    public static final SoundEvent COCOON_HATCH = reg("block.chorus_cocoon.hatch");
    public static final SoundEvent METEORITE_HUM = reg("block.meteorite.hum");
    public static final SoundEvent RECALL = reg("effect.recall.teleport");

    private EndSounds() {}

    private static SoundEvent reg(String name) {
        ResourceLocation id = Winterworks.id(name);
        return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
    }

    public static void init() {}
}
