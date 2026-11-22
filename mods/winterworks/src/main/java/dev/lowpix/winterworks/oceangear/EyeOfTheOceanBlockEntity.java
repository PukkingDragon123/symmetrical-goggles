package dev.lowpix.winterworks.oceangear;

import dev.lowpix.winterworks.ocean.Trust;
import dev.lowpix.winterworks.registry.OceanBlocks;
import dev.lowpix.winterworks.registry.OceanSounds;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import org.jetbrains.annotations.Nullable;

/**
 * The Eye of the Ocean's block entity: its owner (set when placed), and every {@link #PULSE} ticks Conduit Power for
 * the owner and the players they trust within {@link #RANGE} blocks, in water or out. With no owner (made by a command)
 * it is wild: it helps everyone and guards nothing. Client fields drive the renderer's look.
 */
public class EyeOfTheOceanBlockEntity extends BlockEntity {
    public static final int RANGE = 32, PULSE = 40, POWER_TICKS = 260, FATIGUE_TICKS = 200, FATIGUE_LEVEL = 2;
    @Nullable
    private UUID owner;
    private String ownerName = "";
    // client: where the eye looks (model yaw / pitch, radians), eased toward the nearest player
    public float lookYaw, lookPitch, lookYawO, lookPitchO;
    public boolean lookInit;

    public EyeOfTheOceanBlockEntity(BlockPos pos, BlockState state) {
        super(OceanBlocks.EYE_OF_THE_OCEAN_BE, pos, state);
    }

    @Nullable
    public UUID owner() {
        return owner;
    }

    public String ownerName() {
        return ownerName;
    }

    public void setOwner(@Nullable UUID owner, String name) {
        this.owner = owner;
        this.ownerName = name == null ? "" : name;
        setChanged();
        if (level != null && !level.isClientSide) {
            level.sendBlockUpdated(worldPosition, getBlockState(), getBlockState(), 3);
        }
    }

    /** Does the eye look after `p` (its owner or someone they trust; everyone, for a wild eye)? */
    public boolean favours(Player p) {
        return owner == null || Trust.isTrusted(owner, p);
    }

    public boolean inRange(BlockPos pos) {
        return worldPosition.distToCenterSqr(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5) <= RANGE * RANGE;
    }

    public static void serverTick(Level level, BlockPos pos, BlockState state, EyeOfTheOceanBlockEntity eye) {
        long t = level.getGameTime();
        if ((t + pos.asLong()) % PULSE == 0 && level instanceof ServerLevel sl) {
            for (Player p : sl.players()) {
                if (!p.isSpectator() && eye.inRange(p.blockPosition()) && eye.favours(p)) {
                    p.addEffect(new MobEffectInstance(MobEffects.CONDUIT_POWER, POWER_TICKS, 0, true, true));
                }
            }
        }
        if (level.getRandom().nextInt(120) == 0 && !level.players().isEmpty()) {
            level.playSound(null, pos, OceanSounds.EYE_AMBIENT, SoundSource.BLOCKS, 0.8f, 0.9f + level.getRandom().nextFloat() * 0.2f);
        }
    }

    @Override
    protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.saveAdditional(tag, registries);
        if (owner != null) {
            tag.putUUID("Owner", owner);
            tag.putString("OwnerName", ownerName);
        }
    }

    @Override
    protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.loadAdditional(tag, registries);
        owner = tag.hasUUID("Owner") ? tag.getUUID("Owner") : null;
        ownerName = tag.getString("OwnerName");
    }

    @Override
    public CompoundTag getUpdateTag(HolderLookup.Provider registries) {
        return saveWithoutMetadata(registries);
    }

    @Override
    public Packet<ClientGamePacketListener> getUpdatePacket() {
        return ClientboundBlockEntityDataPacket.create(this);
    }
}
