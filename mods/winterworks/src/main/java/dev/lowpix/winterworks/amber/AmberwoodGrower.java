package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.Winterworks;
import java.util.Optional;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.grower.TreeGrower;

/** Grows configured feature winterworks:amberwood (data: tools/data_amber.py). */
public final class AmberwoodGrower {
    public static final TreeGrower GROWER = new TreeGrower("winterworks_amberwood", Optional.empty(),
            Optional.of(ResourceKey.create(Registries.CONFIGURED_FEATURE, Winterworks.id("amberwood"))), Optional.empty());

    private AmberwoodGrower() {}
}
