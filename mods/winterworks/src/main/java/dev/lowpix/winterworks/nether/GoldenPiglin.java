package dev.lowpix.winterworks.nether;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.level.Level;

/** The Golden Piglin (docs/HEXES_UPDATE.md section 7). */
public class GoldenPiglin extends Piglin {
    public GoldenPiglin(EntityType<? extends AbstractPiglin> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Piglin.createAttributes().add(Attributes.MOVEMENT_SPEED, 0.06).add(Attributes.MAX_HEALTH, 40)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.8);
    }
}
