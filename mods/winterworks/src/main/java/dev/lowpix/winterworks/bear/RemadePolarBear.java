package dev.lowpix.winterworks.bear;

import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import org.jetbrains.annotations.Nullable;

/**
 * Duck interface for the remade vanilla polar bear (implemented by mixin.PolarBearMixin on every {@code PolarBear}):
 * calming with salmon, shearing, the carried salmon, sitting, jockey mounts. Server-side state; the flags
 * (calm, shorn, carried salmon, sitting) are synced to clients.
 */
public interface RemadePolarBear extends BearLike {
    /** How long 5 salmon calm a bear, how long its fur takes to grow back (ticks). */
    int CALM_TICKS = 6000, SHORN_TICKS = 6000;
    /** Salmon needed within the window (ticks) to calm a bear. */
    int SALMON_TO_CALM = 5, SALMON_WINDOW = 1200;
    /** Feeding a calm bear adds this much calm (capped at twice CALM_TICKS). */
    int CALM_PER_EXTRA_SALMON = 1200;
    /** Adults that spawn carrying a salmon in the mouth. */
    float SALMON_CARRY_CHANCE = 0.4f;

    boolean ww$isCalm();

    int ww$calmTicks();

    /** Calm it for at least `ticks` (0 ends the calm): no hostility, hearts, sits; the carried salmon is dropped as a gift. */
    void ww$calm(int ticks, @Nullable Player by);

    int ww$shornTicks();

    /** Shorn for `ticks` (0: full fur). */
    void ww$setShornTicks(int ticks);

    /** Carry a fish in the mouth (salmon or cod; null: nothing). */
    void ww$setCarried(@Nullable Item fish);

    default void ww$setCarriesSalmon(boolean carries) {
        ww$setCarried(carries ? Items.SALMON : null);
    }

    /** Eat the carried fish (munch, heal); it doesn't count towards calming. */
    void ww$eatCarried();

    /** Go fishing at the next chance (if there is water near); that first try catches a fish, and it keeps it. */
    void ww$goFishing();

    /** True once after {@link #ww$goFishing()}. */
    boolean ww$takeFishingRequest();

    void ww$setSitting(boolean sitting);

    /** Calm bears sit down soon after they calm down: true once, then false. */
    boolean ww$takeSitRequest();

    /** Salmon eaten in the current 60 s window (towards calming). */
    int ww$salmonEaten();

    /** Eat one salmon (the caller takes it from the stack): munch, heal, count towards calming. */
    void ww$eatSalmon(@Nullable Player feeder);

    /** Shear a calm, unshorn adult: 2-3 polar bear fur, shorn for SHORN_TICKS. False (and nothing happens) otherwise. */
    boolean ww$shearFur(@Nullable Player shearer, SoundSource source);

    /** Spawned as a jockey's mount: may despawn like a monster. */
    boolean ww$isJockeyMount();

    void ww$setJockeyMount(boolean mount);
}
