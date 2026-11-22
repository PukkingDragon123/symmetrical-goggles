package dev.lowpix.winterworks.curse;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.Winterworks;
import java.util.Set;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.storage.loot.LootContext;
import net.minecraft.world.level.storage.loot.parameters.LootContextParam;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.level.storage.loot.predicates.LootItemCondition;
import net.minecraft.world.level.storage.loot.predicates.LootItemConditionType;

/**
 * Loot condition `winterworks:above_half_health`: the context's entity (`this`) has more than half its health. Pride's
 * protection (data/winterworks/enchantment/pride.json) only works while it holds.
 */
public final class AboveHalfHealth implements LootItemCondition {
    public static final AboveHalfHealth INSTANCE = new AboveHalfHealth();
    public static final MapCodec<AboveHalfHealth> CODEC = MapCodec.unit(INSTANCE);
    public static final LootItemConditionType TYPE = Registry.register(BuiltInRegistries.LOOT_CONDITION_TYPE,
            Winterworks.id("above_half_health"), new LootItemConditionType(CODEC));

    private AboveHalfHealth() {}

    static void init() {}

    public static boolean holds(LivingEntity e) {
        return e.getHealth() > e.getMaxHealth() * 0.5f;
    }

    @Override
    public LootItemConditionType getType() {
        return TYPE;
    }

    @Override
    public Set<LootContextParam<?>> getReferencedContextParams() {
        return Set.of(LootContextParams.THIS_ENTITY);
    }

    @Override
    public boolean test(LootContext ctx) {
        Entity e = ctx.getParamOrNull(LootContextParams.THIS_ENTITY);
        return e instanceof LivingEntity living && holds(living);
    }
}
