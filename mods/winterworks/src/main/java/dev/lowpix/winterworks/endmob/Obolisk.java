package dev.lowpix.winterworks.endmob;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.level.Level;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;

/** Stub: the mobs agent owns this (docs/END_UPDATE.md section 9). */
public class Obolisk extends Monster {
    public Obolisk(EntityType<? extends Monster> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes().add(Attributes.MAX_HEALTH, 100.0);
    }

    /** Spawns a disguised Obolisk (an obsidian rock) at `pos`; structures and the bosses use this. */
    public static Obolisk spawnDisguised(ServerLevel level, BlockPos pos) {
        return null;
    }

    /** Spawns an Obolisk already risen and hunting `target` (may be null). */
    public static Obolisk spawnAwake(ServerLevel level, BlockPos pos, LivingEntity target) {
        return null;
    }
}
