package dev.lowpix.winterworks.express;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.properties.RailShape;
import org.jetbrains.annotations.Nullable;

/**
 * Added to every minecart by mixin.AbstractMinecartMixin: what the 0.4 rails need to remember per cart. A Coaster
 * Loop ride in progress (both sides), the loop it just left (so it doesn't re-enter it on the way out), the Switch
 * Rail it is on, and the route it took through the last switch it entered from the toe (so the cars behind it in its
 * train take the same route).
 */
public interface CartRide {
    @Nullable
    LoopMotion ww$loop();

    void ww$setLoop(@Nullable LoopMotion motion);

    @Nullable
    BlockPos ww$loopCooldown();

    void ww$setLoopCooldown(@Nullable BlockPos loop);

    @Nullable
    BlockPos ww$onSwitch();

    void ww$setOnSwitch(@Nullable BlockPos pos);

    @Nullable
    BlockPos ww$routePos();

    @Nullable
    RailShape ww$routeShape();

    long ww$routeTime();

    void ww$setRoute(BlockPos pos, RailShape shape, long gameTime);
}
