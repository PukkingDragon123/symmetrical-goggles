package dev.lowpix.winterworks.express;

/** Added to every minecart by AbstractMinecartMixin: a temporary max-speed multiplier set by special rails. */
public interface CartSpeed {
    double ww$speedFactor();

    void ww$setSpeedFactor(double f);
}
