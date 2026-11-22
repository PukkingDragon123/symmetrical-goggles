package dev.lowpix.winterworks.oceanmob;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.WaterAnimal;
import net.minecraft.world.level.Level;

/** Stub: the creatures agent owns this (docs/OCEAN_UPDATE.md section 4). */
public class Lionfish extends WaterAnimal {
    public Lionfish(EntityType<? extends WaterAnimal> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes().add(Attributes.MAX_HEALTH, 6.0);
    }
}
