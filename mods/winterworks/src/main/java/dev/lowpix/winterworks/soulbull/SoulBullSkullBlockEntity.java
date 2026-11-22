package dev.lowpix.winterworks.soulbull;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The skull's revival: how many Wither Bones it has gathered and how many it needs (rolled once per skull, 10-15). The
 * bones are synced so the renderer can heap them round it.
 */
public class SoulBullSkullBlockEntity extends BlockEntity {
    public static final int MIN_BONES = 10, MAX_BONES = 15;
    private int bones;
    private int needed;
    /** Client: ticks the skull has been lit (eye flare-up), and ticks since the last bone landed (a little settle). */
    public int litTicks, sinceBone = 100;
    private int lastBones;

    public SoulBullSkullBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.SOUL_BULL_SKULL_BE, pos, state);
    }

    public int bones() {
        return bones;
    }

    /** Bones this skull needs to rise again (0 until it is first rolled, server side, on the first bone). */
    public int needed() {
        return needed;
    }

    /** Rolls the skull's bone count if it hasn't been yet. */
    public int rollNeeded(RandomSource random) {
        if (needed == 0) {
            needed = MIN_BONES + random.nextInt(MAX_BONES - MIN_BONES + 1);
            setChanged();
        }
        return needed;
    }

    /** 0..1: how much of the heap is there. */
    public float progress() {
        return needed <= 0 ? 0f : Math.min(1f, bones / (float) needed);
    }

    /** A Wither Bone goes on the heap; the last one rebuilds the bull for `player`. */
    public void addBone(ServerLevel level, Player player) {
        rollNeeded(level.random);
        bones++;
        BlockPos pos = worldPosition;
        Vec3 c = Vec3.atBottomCenterOf(pos);
        level.playSound(null, pos, SoundEvents.BONE_BLOCK_PLACE, SoundSource.BLOCKS, 1.0f, 0.7f + level.random.nextFloat() * 0.2f);
        level.playSound(null, pos, SoundEvents.SOUL_ESCAPE.value(), SoundSource.BLOCKS, 0.8f, 0.8f + bones * 0.04f);
        level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, c.x, c.y + 0.3, c.z, 6 + bones, 0.5, 0.15, 0.5, 0.02);
        level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BASALT.defaultBlockState()), c.x, c.y + 0.2, c.z, 8,
                0.4, 0.1, 0.4, 0.05);
        if (bones >= needed) {
            revive(level, player);
            return;
        }
        player.displayClientMessage(Component.translatable("message.winterworks.soul_bull_skull.bones", bones, needed), true);
        setChanged();
        level.sendBlockUpdated(pos, getBlockState(), getBlockState(), Block.UPDATE_CLIENTS);
    }

    /** The heap pulls together round the skull's fire and the bull stands up, tamed to `player`. */
    private void revive(ServerLevel level, Player player) {
        BlockPos pos = worldPosition;
        BlockState state = getBlockState();
        float yaw = state.hasProperty(SoulBullSkullBlock.FACING) ? state.getValue(SoulBullSkullBlock.FACING).toYRot() : 0f;
        bones = 0;   // nothing left to scatter when the skull goes
        level.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
        SoulBull bull = WWEntities.SOUL_BULL.create(level);
        if (bull == null) {
            return;
        }
        bull.moveTo(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5, yaw, 0f);
        bull.setYHeadRot(yaw);
        bull.setYBodyRot(yaw);
        bull.tame(player);
        bull.setHealth(bull.getMaxHealth());
        bull.startRevive();
        level.addFreshEntity(bull);
        Vec3 c = Vec3.atBottomCenterOf(pos);
        level.playSound(null, pos, WWSounds.SOUL_BULL_REVIVE, SoundSource.NEUTRAL, 2.0f, 1.0f);
        level.playSound(null, pos, WWSounds.SOUL_BULL_SKULL_IGNITE, SoundSource.BLOCKS, 1.5f, 0.6f);
        level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, c.x, c.y + 0.8, c.z, 60, 0.9, 0.6, 0.9, 0.08);
        level.sendParticles(ParticleTypes.SOUL, c.x, c.y + 1.0, c.z, 24, 0.8, 0.6, 0.8, 0.05);
        level.sendParticles(ParticleTypes.SCULK_SOUL, c.x, c.y + 1.2, c.z, 12, 0.6, 0.5, 0.6, 0.04);
    }

    public static void clientTick(Level level, BlockPos pos, BlockState state, SoulBullSkullBlockEntity be) {
        be.litTicks = state.getValue(SoulBullSkullBlock.LIT) ? be.litTicks + 1 : 0;
        if (be.bones != be.lastBones) {
            be.sinceBone = be.bones > be.lastBones ? 0 : 100;
            be.lastBones = be.bones;
        } else if (be.sinceBone < 100) {
            be.sinceBone++;
        }
        if (be.bones > 0 && state.getValue(SoulBullSkullBlock.LIT) && level.random.nextInt(4) == 0) {   // souls drift into the heap
            double a = level.random.nextDouble() * Math.PI * 2, r = 0.8 + level.random.nextDouble() * 0.6;
            level.addParticle(ParticleTypes.SOUL, pos.getX() + 0.5 + Math.cos(a) * r, pos.getY() + 0.1, pos.getZ() + 0.5 + Math.sin(a) * r,
                    -Math.cos(a) * 0.03, 0.02, -Math.sin(a) * 0.03);
        }
    }

    @Override
    protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.loadAdditional(tag, registries);
        bones = tag.getInt("Bones");
        needed = tag.getInt("Needed");
    }

    @Override
    protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.saveAdditional(tag, registries);
        tag.putInt("Bones", bones);
        tag.putInt("Needed", needed);
    }

    @Override
    public CompoundTag getUpdateTag(HolderLookup.Provider registries) {
        return saveCustomOnly(registries);
    }

    @Nullable
    @Override
    public Packet<ClientGamePacketListener> getUpdatePacket() {
        return ClientboundBlockEntityDataPacket.create(this);
    }
}
