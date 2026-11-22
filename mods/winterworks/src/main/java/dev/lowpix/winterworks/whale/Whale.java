package dev.lowpix.winterworks.whale;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.WaterAnimal;
import net.minecraft.world.level.Level;

/** Stub: the whale agent owns this (docs/OCEAN_UPDATE.md section 8). */
public class Whale extends WaterAnimal {
    public Whale(EntityType<? extends WaterAnimal> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes().add(Attributes.MAX_HEALTH, 600.0);
    }
}
