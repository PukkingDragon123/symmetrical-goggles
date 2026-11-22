package dev.lowpix.winterworks.bear;

import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * What remade polar bears (every vanilla {@code PolarBear}, through mixin.PolarBearMixin) and zombie polar bears share:
 * the state the shared goals (leap, swipe, roar) and the bear renderer need. Cast any polar bear to it.
 */
public interface BearLike {
    /** Shared fight and animation state (cooldowns, client animation states, entity events). */
    BearState ww$bear();

    /** May it start or keep a fight now? (Adults that are not calm; zombie bears always.) */
    boolean ww$mayFight();

    /** The growl of a wind-up (the crouch before a leap, rearing up for a swipe). */
    SoundEvent ww$growlSound();

    /** Zombie polar bears draw the model's zombie_* parts and use the zombie texture. */
    default boolean ww$isZombie() {
        return false;
    }

    /** Shorn (short fur): fur_* parts hidden, sheared texture. */
    default boolean ww$isShorn() {
        return false;
    }

    /** Sitting down (calm bears sit): plays the sit loop. */
    default boolean ww$isSitting() {
        return false;
    }

    /** The fish carried in the mouth (a salmon or a cod, drawn at the mouth_item bone); EMPTY if none. Don't modify it. */
    default ItemStack ww$carried() {
        return ItemStack.EMPTY;
    }

    default boolean ww$carriesSalmon() {
        return ww$carried().is(Items.SALMON);
    }

    /** Rear up on the hind legs (the vanilla polar bear's standing state) while a swipe winds up. */
    default void ww$standUp(boolean up) {}
}
