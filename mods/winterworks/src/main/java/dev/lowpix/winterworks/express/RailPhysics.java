package dev.lowpix.winterworks.express;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.level.block.BaseRailBlock;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/** What the Winter Express rails do to any minecart that rolls over them (called after the cart's own tick). */
public final class RailPhysics {
    public static final double BOOST_FACTOR = 3.0;     // vanilla max 0.4 b/t -> 1.2 b/t (24 m/s)
    public static final double COASTER_FACTOR = 1.8;

    private RailPhysics() {}

    public static void afterTick(AbstractMinecart cart) {
        if (!(cart.level() instanceof ServerLevel level)) {
            return;
        }
        CartSpeed sp = (CartSpeed) cart;
        BlockPos pos = cart.blockPosition();
        BlockState state = level.getBlockState(pos);
        if (!BaseRailBlock.isRail(state)) {
            pos = pos.below();
            state = level.getBlockState(pos);
        }
        double factor = sp.ww$speedFactor();
        // the speed limit relaxes back to normal once off the special rails
        double target = 1.0;
        Vec3 v = cart.getDeltaMovement();
        Vec3 hv = new Vec3(v.x, 0, v.z);
        double speed = hv.length();
        if (state.is(WWBlocks.BOOSTER_RAIL)) {
            if (state.getValue(PoweredRailBlock.POWERED)) {
                target = BOOST_FACTOR;
                factor = BOOST_FACTOR;
                Vec3 dir = speed > 0.01 ? hv.normalize() : railDir(state);
                cart.setDeltaMovement(v.add(dir.scale(0.16)));
                if (cart.tickCount % 4 == 0) {
                    level.sendParticles(new DustParticleOptions(new Vector3f(1f, 0.35f, 0.1f), 1.0f),
                            cart.getX(), cart.getY() + 0.1, cart.getZ(), 4, 0.25, 0.05, 0.25, 0.0);
                }
                if (speed < 0.6 && cart.tickCount % 5 == 0) {
                    level.playSound(null, pos, WWSounds.BOOSTER, SoundSource.BLOCKS, 0.6f, 1.0f + (float) speed);
                }
            } else {
                cart.setDeltaMovement(v.multiply(0.55, 1, 0.55));   // brake
            }
        } else if (state.is(WWBlocks.LIFT_RAIL)) {
            boolean powered = state.getValue(PoweredRailBlock.POWERED);
            RailShape shape = state.getValue(PoweredRailBlock.SHAPE);
            double lift = powered ? 0.3 : 0.18;
            Vec3 up = uphill(shape);
            if (up != null) {
                double along = hv.dot(up);
                if (along < lift) {
                    cart.setDeltaMovement(new Vec3(up.x * lift, v.y, up.z * lift));
                }
            } else if (speed < lift * 0.7) {
                Vec3 dir = speed > 0.005 ? hv.normalize() : railDir(state);
                cart.setDeltaMovement(dir.x * lift * 0.7, v.y, dir.z * lift * 0.7);
            }
            if (cart.tickCount % 6 == 0) {
                level.playSound(null, pos, WWSounds.CHAIN_LIFT, SoundSource.BLOCKS, 0.5f, powered ? 1.3f : 1.0f);
            }
        } else if (state.is(WWBlocks.COASTER_RAIL)) {
            target = COASTER_FACTOR;
            factor = Math.max(factor, COASTER_FACTOR);
            RailShape shape = state.getValue(((BaseRailBlock) state.getBlock()).getShapeProperty());
            Vec3 up = uphill(shape);
            if (up != null && speed > 0.01) {
                double along = hv.dot(up);
                if (along < 0) {
                    cart.setDeltaMovement(cart.getDeltaMovement().add(up.scale(-0.045)));   // dive!
                } else {
                    cart.setDeltaMovement(cart.getDeltaMovement().add(hv.normalize().scale(0.008)));
                }
            } else if (speed > 0.05 && speed < COASTER_FACTOR * 0.4) {
                cart.setDeltaMovement(cart.getDeltaMovement().multiply(1.015, 1, 1.015));   // keep momentum
            }
        }
        if (factor > target) {
            factor = Math.max(target, factor - 0.04);
        }
        sp.ww$setSpeedFactor(factor);
    }

    /** Horizontal direction going up an ascending rail, or null for flat rails. */
    static Vec3 uphill(RailShape s) {
        return switch (s) {
            case ASCENDING_NORTH -> new Vec3(0, 0, -1);
            case ASCENDING_SOUTH -> new Vec3(0, 0, 1);
            case ASCENDING_EAST -> new Vec3(1, 0, 0);
            case ASCENDING_WEST -> new Vec3(-1, 0, 0);
            default -> null;
        };
    }

    static Vec3 railDir(BlockState state) {
        if (!(state.getBlock() instanceof BaseRailBlock rail)) {
            return Vec3.ZERO;
        }
        RailShape s = state.getValue(rail.getShapeProperty());
        return switch (s) {
            case EAST_WEST, ASCENDING_EAST, ASCENDING_WEST -> new Vec3(1, 0, 0);
            default -> new Vec3(0, 0, 1);
        };
    }
}
