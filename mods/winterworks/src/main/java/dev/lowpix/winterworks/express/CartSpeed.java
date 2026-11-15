package dev.lowpix.winterworks.express;

/** Added to every minecart by AbstractMinecartMixin: a temporary max-speed multiplier set by special rails. */
public interface CartSpeed {
    double ww$speedFactor();

    void ww$setSpeedFactor(double f);

    /** Set while a Trap Rail holds the cart: the direction it was travelling (null when free). */
    net.minecraft.world.phys.Vec3 ww$heldDir();

    void ww$setHeldDir(net.minecraft.world.phys.Vec3 dir);
}
