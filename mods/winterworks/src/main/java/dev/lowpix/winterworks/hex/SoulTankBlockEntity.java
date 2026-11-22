package dev.lowpix.winterworks.hex;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWSounds;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.core.SectionPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * A Soul Tank's souls (0-1000, docs/HEXES_UPDATE.md section 2): +10 for every mob that dies within 8 blocks (its soul
 * drifts in), +50 for a Soul Elixir. The Hexing Table drains it.
 */
public class SoulTankBlockEntity extends BlockEntity {
    public static final int CAPACITY = 1000;
    public static final int PER_MOB = 10;
    public static final int PER_ELIXIR = 50;
    public static final double RADIUS = 8.0;

    private int souls;

    /** Client only: the fill shown (eases toward the real one) and ticks alive. */
    public float shownFill, oShownFill;
    public int age;

    public SoulTankBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.SOUL_TANK_BE, pos, state);
    }

    public int souls() {
        return souls;
    }

    public float fill() {
        return souls / (float) CAPACITY;
    }

    public int room() {
        return CAPACITY - souls;
    }

    /** Adds up to n souls; returns how many went in. */
    public int add(int n) {
        int added = Mth.clamp(n, 0, room());
        if (added > 0) {
            souls += added;
            sync();
        }
        return added;
    }

    /** Takes up to n souls; returns how many came out. */
    public int drain(int n) {
        int taken = Mth.clamp(n, 0, souls);
        if (taken > 0) {
            souls -= taken;
            sync();
        }
        return taken;
    }

    public void setSouls(int n) {
        souls = Mth.clamp(n, 0, CAPACITY);
        sync();
    }

    /** A mob died: its soul goes to the nearest Soul Tank within 8 blocks that has room. */
    public static void onDeath(LivingEntity entity) {
        if (!(entity instanceof Mob) || !(entity.level() instanceof ServerLevel level)) {
            return;
        }
        Vec3 at = entity.position().add(0, entity.getBbHeight() * 0.6, 0);
        SoulTankBlockEntity tank = nearest(level, at);
        if (tank == null || tank.add(PER_MOB) <= 0) {
            return;
        }
        level.sendParticles(ParticleTypes.SOUL, at.x, at.y, at.z, 4, 0.2, 0.25, 0.2, 0.02);
        SoulDriftPayload drift = new SoulDriftPayload((float) at.x, (float) at.y, (float) at.z, tank.worldPosition);
        for (ServerPlayer p : PlayerLookup.tracking(level, tank.worldPosition)) {
            if (ServerPlayNetworking.canSend(p, SoulDriftPayload.TYPE)) {
                ServerPlayNetworking.send(p, drift);
            }
        }
    }

    @Nullable
    static SoulTankBlockEntity nearest(ServerLevel level, Vec3 at) {
        SoulTankBlockEntity best = null;
        double bestD = RADIUS * RADIUS;
        int r = (int) Math.ceil(RADIUS);
        for (int cx = SectionPos.blockToSectionCoord(Mth.floor(at.x) - r); cx <= SectionPos.blockToSectionCoord(Mth.floor(at.x) + r); cx++) {
            for (int cz = SectionPos.blockToSectionCoord(Mth.floor(at.z) - r); cz <= SectionPos.blockToSectionCoord(Mth.floor(at.z) + r); cz++) {
                LevelChunk chunk = level.getChunkSource().getChunkNow(cx, cz);
                if (chunk == null) {
                    continue;
                }
                for (BlockEntity be : chunk.getBlockEntities().values()) {
                    if (be instanceof SoulTankBlockEntity tank && !tank.isRemoved() && tank.room() > 0) {
                        double d = Vec3.atCenterOf(tank.worldPosition).distanceToSqr(at);
                        if (d <= bestD) {
                            bestD = d;
                            best = tank;
                        }
                    }
                }
            }
        }
        return best;
    }

    public static void clientTick(Level level, BlockPos pos, BlockState state, SoulTankBlockEntity tank) {
        tank.age++;
        tank.oShownFill = tank.shownFill;
        tank.shownFill += (tank.fill() - tank.shownFill) * 0.08f;
        var r = level.random;
        if (tank.souls > 0 && r.nextFloat() < 0.04f + 0.12f * tank.fill()) {
            double h = 0.1 + 0.8 * tank.fill() * r.nextDouble();
            level.addParticle(ParticleTypes.SOUL, pos.getX() + 0.3 + r.nextDouble() * 0.4, pos.getY() + h,
                    pos.getZ() + 0.3 + r.nextDouble() * 0.4, 0, 0.004, 0);
        }
        if (tank.souls > 0 && r.nextInt(220) == 0) {
            level.playLocalSound(pos, WWSounds.SOUL_TANK_HUM, SoundSource.BLOCKS, 0.25f + 0.35f * tank.fill(),
                    0.8f + r.nextFloat() * 0.2f, false);
        }
    }

    private void sync() {
        setChanged();
        if (level != null && !level.isClientSide) {
            level.sendBlockUpdated(worldPosition, getBlockState(), getBlockState(), Block.UPDATE_CLIENTS);
            level.updateNeighbourForOutputSignal(worldPosition, getBlockState().getBlock());
        }
    }

    @Override
    protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.saveAdditional(tag, registries);
        tag.putInt("souls", souls);
    }

    @Override
    protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.loadAdditional(tag, registries);
        souls = Mth.clamp(tag.getInt("souls"), 0, CAPACITY);
    }

    @Override
    protected void applyImplicitComponents(DataComponentInput input) {
        super.applyImplicitComponents(input);
        souls = Mth.clamp(input.getOrDefault(HexComponents.SOULS, 0), 0, CAPACITY);
    }

    @Override
    protected void collectImplicitComponents(DataComponentMap.Builder builder) {
        super.collectImplicitComponents(builder);
        if (souls > 0) {
            builder.set(HexComponents.SOULS, souls);
        }
    }

    @Override
    public void removeComponentsFromTag(CompoundTag tag) {
        tag.remove("souls");
    }

    @Override
    public Packet<ClientGamePacketListener> getUpdatePacket() {
        return ClientboundBlockEntityDataPacket.create(this);
    }

    @Override
    public CompoundTag getUpdateTag(HolderLookup.Provider registries) {
        return saveWithoutMetadata(registries);
    }
}
