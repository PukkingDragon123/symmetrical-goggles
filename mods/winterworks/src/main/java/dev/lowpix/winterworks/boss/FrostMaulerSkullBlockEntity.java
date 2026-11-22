package dev.lowpix.winterworks.boss;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientGamePacketListener;
import net.minecraft.network.protocol.game.ClientboundBlockEntityDataPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.PointedDripstoneBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The skull's state: `lit` (its eye burns, synced to the client) and the revival ritual timer. The ritual lasts
 * {@link #RITUAL_TICKS}: frost swirls, the ground shakes and the ice cracks; then the ice and the skull burst and the
 * Frost Mauler rises from where the skull was (docs/COLD_UPDATE.md section 8).
 *
 * <p>Redstone (docs/FIXES_0_4.md): on a rising edge of power the skull {@link #roar roars} (at most once every
 * {@link #ROAR_COOLDOWN} ticks) and shakes loose every icicle and pointed dripstone within {@link #ROAR_REACH} blocks
 * above it: they fall (our falling icicles; vanilla falling dripstone).
 */
public class FrostMaulerSkullBlockEntity extends BlockEntity {
    public static final int RITUAL_TICKS = 60;
    /** 3 s between roars. */
    public static final int ROAR_COOLDOWN = 60;
    /** How far (blocks) the roar reaches: sideways, and up above the skull. */
    public static final int ROAR_REACH = 12;
    /** Block event: the skull roars (the client opens its jaw). */
    public static final int EVENT_ROAR = 1;
    /** Client: how long the jaw stays open (ticks). */
    public static final int ROAR_TICKS = 30;
    private boolean lit;
    private int ritual;
    private int lastStage = -1;
    private boolean powered;
    private long lastRoar = Long.MIN_VALUE / 4;
    /** Client: ticks since the eye lit (for the swirl and the eye pulse). */
    public int clientTicks;
    /** Client: the game time of the last roar (for the open jaw), or a long time ago. */
    public long roarAt = Long.MIN_VALUE / 4;

    public FrostMaulerSkullBlockEntity(BlockPos pos, BlockState state) {
        super(WWBlocks.FROST_MAULER_SKULL_BE, pos, state);
    }

    public boolean isLit() {
        return lit;
    }

    /** 0..1 through the ritual (client: from its own clock). */
    public float ritualProgress(float partial) {
        return Mth.clamp((clientTicks + partial) / RITUAL_TICKS, 0f, 1f);
    }

    public boolean isPowered() {
        return powered;
    }

    /** The redstone power it last saw (set when placed, so a skull put down next to a lit lever doesn't roar). */
    public void initPowered(boolean on) {
        powered = on;
        setChanged();
    }

    /** Its neighbours changed: on a rising edge of power it roars. Returns true if it roared. */
    public boolean updatePower(boolean on) {
        boolean rising = on && !powered;
        if (on != powered) {
            powered = on;
            setChanged();
        }
        return rising && level instanceof ServerLevel sl && roar(sl);
    }

    /** Ticks until it can roar again (0: ready). */
    public int roarCooldown() {
        return level == null ? 0 : (int) Math.max(0, lastRoar + ROAR_COOLDOWN - level.getGameTime());
    }

    /**
     * The roar: unless it is waking the Frost Mauler or roared in the last 3 s, it bellows, frost blasts out of its
     * jaws, nearby cameras shake, and every icicle and pointed dripstone stalactite within {@link #ROAR_REACH} blocks
     * above it breaks off and falls. Returns false if it couldn't roar.
     */
    public boolean roar(ServerLevel sl) {
        if (lit || roarCooldown() > 0) {
            return false;
        }
        lastRoar = sl.getGameTime();
        setChanged();
        BlockPos pos = worldPosition;
        BlockState state = getBlockState();
        sl.blockEvent(pos, state.getBlock(), EVENT_ROAR, 0);
        sl.playSound(null, pos, WWSounds.SKULL_ROAR, SoundSource.BLOCKS, 2.5f, 0.95f + sl.random.nextFloat() * 0.1f);
        Vec3 c = Vec3.atCenterOf(pos);
        Vec3 mouth = c;
        if (state.hasProperty(FrostMaulerSkullBlock.FACING)) {
            Direction d = state.getValue(FrostMaulerSkullBlock.FACING);
            mouth = c.add(d.getStepX() * 0.45, -0.15, d.getStepZ() * 0.45);
            for (int i = 0; i < 10; i++) {   // a blast of frost breath out of the jaws
                double s = 0.12 + i * 0.02;
                sl.sendParticles(WWParticles.FROST_BREATH, mouth.x, mouth.y, mouth.z, 0,
                        d.getStepX() * s + (sl.random.nextDouble() - 0.5) * 0.08, 0.02 + sl.random.nextDouble() * 0.04,
                        d.getStepZ() * s + (sl.random.nextDouble() - 0.5) * 0.08, 1.0);
            }
        }
        sl.sendParticles(WWParticles.ROAR_WAVE, mouth.x, mouth.y, mouth.z, 0, 7.0, 0, 0, 1.0);   // dx = final size (blocks)
        sl.sendParticles(WWParticles.ROAR_WAVE, c.x, pos.getY() + 0.1, c.z, 0, 5.0, 0, 0, 1.0);
        sl.sendParticles(ParticleTypes.SNOWFLAKE, c.x, c.y + 0.3, c.z, 24, 0.6, 0.4, 0.6, 0.12);
        BossFeature.groundRing(sl, WWParticles.SNOW_PUFF, new Vec3(c.x, pos.getY(), c.z), 14, 0.3);
        BossFeature.shake(sl, c, 20, 0.9f, 14);
        int loosened = shakeLoose(sl, pos, ROAR_REACH);
        if (loosened > 0) {   // frost sifts down from the ceiling where they let go
            sl.sendParticles(WWParticles.BLIZZARD_FLAKE, c.x, c.y + ROAR_REACH * 0.5, c.z, 20, ROAR_REACH * 0.4, ROAR_REACH * 0.3,
                    ROAR_REACH * 0.4, 0.02);
        }
        sl.gameEvent(null, GameEvent.BLOCK_ACTIVATE, pos);
        return true;
    }

    /**
     * Every icicle and pointed dripstone stalactite above `skull` (1 to `reach` blocks up, up to `reach` blocks
     * sideways) breaks off: each hanging column falls from its top. Returns how many columns fell.
     */
    public static int shakeLoose(ServerLevel sl, BlockPos skull, int reach) {
        List<BlockPos> tops = new ArrayList<>();
        BlockPos.MutableBlockPos above = new BlockPos.MutableBlockPos();
        for (BlockPos p : BlockPos.betweenClosed(skull.offset(-reach, 1, -reach), skull.offset(reach, reach, reach))) {
            BlockState s = sl.getBlockState(p);
            if (!s.is(WWBlocks.ICICLE) && !isStalactite(s)) {
                continue;
            }
            BlockState up = sl.getBlockState(above.setWithOffset(p, Direction.UP));
            if (s.is(WWBlocks.ICICLE) ? !up.is(WWBlocks.ICICLE) : !isStalactite(up)) {
                tops.add(p.immutable());
            }
        }
        for (BlockPos p : tops) {
            BlockState s = sl.getBlockState(p);
            if (s.is(WWBlocks.ICICLE)) {
                IcicleBlock.breakOff(sl, p);
            } else if (isStalactite(s)) {
                s.tick(sl, p, sl.random);   // a stalactite's tick drops it and everything below it (vanilla falling dripstone)
            }
        }
        return tops.size();
    }

    private static boolean isStalactite(BlockState s) {
        return s.is(Blocks.POINTED_DRIPSTONE) && s.getValue(PointedDripstoneBlock.TIP_DIRECTION) == Direction.DOWN;
    }

    /** The Nether Star took: light the eye and start the ritual. */
    public void ignite() {
        lit = true;
        ritual = 0;
        lastStage = -1;
        setChanged();
        if (level != null) {
            level.sendBlockUpdated(worldPosition, getBlockState(), getBlockState(), Block.UPDATE_ALL);
        }
    }

    private int crackId(int i) {
        return Integer.MIN_VALUE + (Long.hashCode(worldPosition.asLong()) & 0xFFFFFF) * 8 + i;
    }

    public static void serverTick(Level level, BlockPos pos, BlockState state, FrostMaulerSkullBlockEntity be) {
        if (!be.lit || !(level instanceof ServerLevel sl)) {
            return;
        }
        int t = ++be.ritual;
        Vec3 c = Vec3.atCenterOf(pos);
        if (t == 1) {
            sl.playSound(null, pos, WWSounds.TOMB_RUMBLE, SoundSource.HOSTILE, 1.6f, 0.9f);
            BossFeature.shake(sl, c, 24, 0.7f, 30);
        }
        if (t % 10 == 0) {
            BossFeature.shake(sl, c, 24, 0.5f + 1.5f * t / RITUAL_TICKS, 14);
        }
        if (t % 12 == 0) {
            sl.playSound(null, pos, WWSounds.ANCIENT_ICE_CRACK, SoundSource.BLOCKS, 1.0f, 0.7f + t / (float) RITUAL_TICKS * 0.5f);
        }
        int stage = Math.min(9, t * 10 / RITUAL_TICKS);
        if (stage != be.lastStage) {
            be.lastStage = stage;
            Direction[] dirs = Direction.values();
            for (int i = 0; i < dirs.length; i++) {
                BlockPos p = pos.relative(dirs[i]);
                if (sl.getBlockState(p).is(WWBlocks.ANCIENT_ICE)) {
                    sl.destroyBlockProgress(be.crackId(i), p, stage);
                }
            }
        }
        if (t % 4 == 0) {
            sl.sendParticles(ParticleTypes.SNOWFLAKE, c.x, c.y - 1.4, c.z, 6, 1.4, 0.05, 1.4, 0.03);
        }
        if (t >= RITUAL_TICKS) {
            be.revive(sl, pos, state);
        }
    }

    /** The ice and the skull burst and the Frost Mauler wakes where the skull was. */
    private void revive(ServerLevel sl, BlockPos pos, BlockState state) {
        Vec3 c = Vec3.atCenterOf(pos);
        Direction[] dirs = Direction.values();
        for (int i = 0; i < dirs.length; i++) {
            BlockPos p = pos.relative(dirs[i]);
            sl.destroyBlockProgress(crackId(i), p, -1);
            BlockState s = sl.getBlockState(p);
            if (s.is(WWBlocks.ANCIENT_ICE)) {
                sl.levelEvent(2001, p, Block.getId(s));
                sl.setBlock(p, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);
            }
        }
        sl.levelEvent(2001, pos, Block.getId(state));
        sl.setBlock(pos, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL);   // the skull is spent (this block entity goes with it)

        FrostMaulerEntity m = WWEntities.FROST_MAULER.create(sl);
        if (m != null) {
            float yaw = state.hasProperty(FrostMaulerSkullBlock.FACING) ? state.getValue(FrostMaulerSkullBlock.FACING).toYRot() : 0f;
            m.moveTo(pos.getX() + 0.5, pos.getY() - 1, pos.getZ() + 0.5, yaw, 0f);
            m.setYHeadRot(yaw);
            m.setYBodyRot(yaw);
            clearRoom(sl, m.getBoundingBox());
            m.setPersistenceRequired();
            m.startWaking();
            sl.addFreshEntity(m);
            BossFeature.frostbiteBurst(sl, c, AncientIceBlock.BURST_RADIUS + 1.5, AncientIceBlock.BURST_SECONDS,
                    AncientIceBlock.BURST_AMPLIFIER, m);
        }
        sl.playSound(null, pos, WWSounds.SKULL_REVIVE, SoundSource.HOSTILE, 3.0f, 0.9f);
        sl.playSound(null, pos, WWSounds.ANCIENT_ICE_BURST, SoundSource.BLOCKS, 2.0f, 0.7f);
        BossFeature.iceBurstFx(sl, c, 9f, 70);
        sl.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), c.x, c.y, c.z, 30,
                0.4, 0.3, 0.4, 0.2);
        sl.sendParticles(ParticleTypes.EXPLOSION, c.x, c.y, c.z, 3, 0.8, 0.6, 0.8, 0.0);
        BossFeature.shake(sl, c, 32, 3.0f, 30);
    }

    /** Clears soft blocks where the Mauler will stand (it bursts out of whatever the ice was set in). */
    private static void clearRoom(ServerLevel sl, AABB box) {
        BlockPos.betweenClosedStream(box.deflate(0.01)).forEach(p -> {
            BlockState s = sl.getBlockState(p);
            float hardness = s.getDestroySpeed(sl, p);
            if (!s.isAir() && hardness >= 0 && hardness < 50 && !s.hasBlockEntity() && !s.getCollisionShape(sl, p).isEmpty()) {
                sl.destroyBlock(p.immutable(), true);
            }
        });
    }

    @Override
    public boolean triggerEvent(int id, int param) {
        if (id == EVENT_ROAR) {
            if (level != null && level.isClientSide) {
                roarAt = level.getGameTime();
                roarFx(level, worldPosition, getBlockState());
            }
            return true;
        }
        return super.triggerEvent(id, param);
    }

    /** Client: 0..1 how far open the jaw is in a roar (snaps open, holds, eases shut); 0 when not roaring. */
    public float roarOpen(float partial) {
        if (level == null) {
            return 0f;
        }
        float t = level.getGameTime() - roarAt + partial;
        if (t < 0f || t > ROAR_TICKS) {
            return 0f;
        }
        return t < 3f ? t / 3f : Math.min(1f, (ROAR_TICKS - t) / 10f);
    }

    /** Client: soul flames burst out of the eye socket as it roars. */
    private static void roarFx(Level level, BlockPos pos, BlockState state) {
        if (!state.hasProperty(FrostMaulerSkullBlock.FACING)) {
            return;
        }
        double cx = pos.getX() + 0.5, cy = pos.getY() + 0.5, cz = pos.getZ() + 0.5;
        Direction d = state.getValue(FrostMaulerSkullBlock.FACING);
        for (int i = 0; i < 8; i++) {
            level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, cx + d.getStepX() * 0.3 + (level.random.nextDouble() - 0.5) * 0.2, cy + 0.2,
                    cz + d.getStepZ() * 0.3 + (level.random.nextDouble() - 0.5) * 0.2, d.getStepX() * 0.03,
                    0.04 + level.random.nextDouble() * 0.03, d.getStepZ() * 0.03);
        }
        level.addParticle(ParticleTypes.SOUL, cx, cy + 0.3, cz, 0, 0.05, 0);
    }

    public static void clientTick(Level level, BlockPos pos, BlockState state, FrostMaulerSkullBlockEntity be) {
        if (be.roarOpen(0f) > 0f && level.getGameTime() % 2 == 0 && state.hasProperty(FrostMaulerSkullBlock.FACING)) {
            Direction d = state.getValue(FrostMaulerSkullBlock.FACING);   // the eye blazes while it roars
            level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, pos.getX() + 0.5 + d.getStepX() * 0.3, pos.getY() + 0.6,
                    pos.getZ() + 0.5 + d.getStepZ() * 0.3, 0, 0.04, 0);
        }
        if (!be.lit) {
            return;
        }
        int t = ++be.clientTicks;
        double cx = pos.getX() + 0.5, cy = pos.getY() + 0.5, cz = pos.getZ() + 0.5;
        float k = Math.min(1f, t / (float) RITUAL_TICKS);
        double r = 1.9 - 0.7 * k;
        for (int i = 0; i < 3; i++) {   // three arms of frost spiralling up round the ice
            double a = t * 0.32 + i * Mth.TWO_PI / 3;
            double y = cy - 1.4 + ((t * 0.07 + i * 0.33) % 1.0) * 2.8;
            level.addParticle(i == 0 ? WWParticles.BLIZZARD_FLAKE : ParticleTypes.SNOWFLAKE, cx + Math.cos(a) * r, y,
                    cz + Math.sin(a) * r, -Math.sin(a) * 0.08, 0.03, Math.cos(a) * 0.08);
        }
        if (t % 2 == 0 && state.hasProperty(FrostMaulerSkullBlock.FACING)) {   // ice-blue flame licking out of the eye socket
            var d = state.getValue(FrostMaulerSkullBlock.FACING);
            level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, cx + d.getStepX() * 0.3 + (level.random.nextDouble() - 0.5) * 0.1, cy + 0.2,
                    cz + d.getStepZ() * 0.3 + (level.random.nextDouble() - 0.5) * 0.1, 0, 0.02 + 0.03 * k, 0);
        }
        if (t % 5 == 0) {
            level.addParticle(WWParticles.FROST_BREATH, cx + (level.random.nextDouble() - 0.5) * 2, cy + 1.6,
                    cz + (level.random.nextDouble() - 0.5) * 2, 0, 0.02, 0);
        }
    }

    @Override
    protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.loadAdditional(tag, registries);
        boolean wasLit = lit;
        lit = tag.getBoolean("Lit");
        ritual = tag.getInt("Ritual");
        powered = tag.getBoolean("Powered");
        if (lit && !wasLit) {
            clientTicks = ritual;
        }
    }

    @Override
    protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {
        super.saveAdditional(tag, registries);
        tag.putBoolean("Lit", lit);
        tag.putInt("Ritual", ritual);
        tag.putBoolean("Powered", powered);
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
