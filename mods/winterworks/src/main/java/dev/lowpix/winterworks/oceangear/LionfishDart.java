package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.registry.OceanEntities;
import dev.lowpix.winterworks.registry.OceanItems;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/**
 * A lionfish dart (docs/OCEAN_UPDATE.md section 4): arrow-like ammunition for bows and crossbows that flies straight and
 * fast underwater (water adds no drag and no sinking, unlike an arrow's) and poisons what it hits for
 * {@link #POISON_TICKS}. Thrown by hand it is slower and weaker.
 */
public class LionfishDart extends AbstractArrow {
    public static final int POISON_TICKS = 100;
    public static final double BOW_DAMAGE = 1.6, THROWN_DAMAGE = 1.25;

    public LionfishDart(EntityType<? extends LionfishDart> type, Level level) {
        super(type, level);
        setBaseDamage(BOW_DAMAGE);
    }

    public LionfishDart(Level level, LivingEntity shooter, ItemStack pickup, @Nullable ItemStack weapon) {
        super(OceanEntities.LIONFISH_DART, shooter, level, pickup, weapon);
        setBaseDamage(BOW_DAMAGE);
    }

    public LionfishDart(Level level, double x, double y, double z, ItemStack pickup, @Nullable ItemStack weapon) {
        super(OceanEntities.LIONFISH_DART, x, y, z, level, pickup, weapon);
        setBaseDamage(BOW_DAMAGE);
    }

    /** Underwater it keeps its speed (an arrow keeps 60% a tick)... */
    @Override
    protected float getWaterInertia() {
        return 0.99f;
    }

    /** ...and its line: no sinking in water. */
    @Override
    protected double getDefaultGravity() {
        return isInWater() ? 0.0 : 0.05;
    }

    @Override
    protected void doPostHurtEffects(LivingEntity target) {
        super.doPostHurtEffects(target);
        target.addEffect(new MobEffectInstance(MobEffects.POISON, POISON_TICKS, 0), getEffectSource());
    }

    @Override
    protected ItemStack getDefaultPickupItem() {
        return new ItemStack(OceanItems.LIONFISH_DART);
    }
}
