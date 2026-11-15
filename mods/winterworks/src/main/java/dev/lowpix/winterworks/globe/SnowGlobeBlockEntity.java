package dev.lowpix.winterworks.globe;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

public class SnowGlobeBlockEntity extends BlockEntity {
    public static final int EVENT_SHAKE = 1;
    /** Client: game time of the last shake (-1 = never), for the wobble animation. */
    public long shakeTime = -1000;

    public SnowGlobeBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.SNOW_GLOBE_BE, pos, state);
    }

    @Override
    public boolean triggerEvent(int id, int param) {
        if (id == EVENT_SHAKE) {
            if (level != null && level.isClientSide) {
                shakeTime = level.getGameTime();
                RandomSource r = RandomSource.create(param);
                double cx = worldPosition.getX() + 0.5, cy = worldPosition.getY() + 0.62, cz = worldPosition.getZ() + 0.5;
                for (int i = 0; i < 70; i++) {
                    double a = r.nextDouble() * Math.PI * 2, rad = Math.sqrt(r.nextDouble()) * 0.26, h = (r.nextDouble() - 0.4) * 0.3;
                    level.addParticle(WWParticles.GLOBE_SNOW, cx + Math.cos(a) * rad, cy + h, cz + Math.sin(a) * rad, cx, cy, cz);
                }
            }
            return true;
        }
        return super.triggerEvent(id, param);
    }
}
