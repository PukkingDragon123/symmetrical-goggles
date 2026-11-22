package dev.lowpix.winterworks.express;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.entity.vehicle.MinecartFurnace;
import org.jetbrains.annotations.Nullable;

/**
 * Furnace minecarts in trains (mixin.MinecartFurnaceMixin). Coupled into a train with a locomotive, a burning furnace
 * cart is its boiler: the locomotive drives on its fire and burns no coal of its own, while the furnace cart stops
 * pushing by itself and keeps up with the train. Without a locomotive it pushes as in vanilla and its couplings pull
 * the rest of the train along.
 */
public final class FurnacePower {
    private FurnacePower() {}

    /** Added to MinecartFurnace: its fuel ticks left. */
    public interface Fuel {
        int ww$fuel();
    }

    @Nullable
    public static LocomotiveCart locomotive(AbstractMinecart cart) {
        for (AbstractMinecart c : Couplings.train(cart)) {
            if (c instanceof LocomotiveCart l) {
                return l;
            }
        }
        return null;
    }

    /** A furnace minecart in this locomotive's train is burning. */
    public static boolean furnaceBurning(LocomotiveCart loco) {
        for (AbstractMinecart c : Couplings.train(loco)) {
            if (c instanceof MinecartFurnace f && ((Fuel) f).ww$fuel() > 0) {
                return true;
            }
        }
        return false;
    }

    /** A furnace cart in a locomotive's train was just stoked: a stopped locomotive gets going, away from the player. */
    public static void stoked(MinecartFurnace furnace, Player player) {
        LocomotiveCart loco = locomotive(furnace);
        if (loco == null || loco.throttle() != 0 || ((Fuel) furnace).ww$fuel() <= 0) {
            return;
        }
        double dx = furnace.getX() - player.getX(), dz = furnace.getZ() - player.getZ();
        var h = loco.heading();
        loco.setThrottle(dx * h.x + dz * h.z >= 0 ? 1 : -1);
        loco.whistle();
    }
}
