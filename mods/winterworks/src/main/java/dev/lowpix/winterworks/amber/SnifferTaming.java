package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ai.Brain;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BrushableBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Tamed sniffers (docs/AMBER_UPDATE.md section 8), driven by mixin.SnifferMixin. Pitcher pods tame a sniffer (1 in 3).
 * A tamed sniffer follows its owner, and every ~30 s sniffs for suspicious sand/gravel and amber fossils within 16
 * blocks: it walks there, digs (vanilla digging animation and sounds) and excavates the block: its brushing loot pops
 * out and it turns to sand/gravel. While it is doing one of these things the vanilla sniffer brain is paused.
 */
public final class SnifferTaming {
    public static final String OWNER_TAG = "WinterworksOwner";
    public static final int SNIFF_INTERVAL = 600, RADIUS = 16, HEIGHT = 6;
    public static final int SNIFF_TICKS = 40, DIG_TICKS = 160, EXCAVATE_AT = 120, RISE_TICKS = 40;
    private static final double REACH = 2.6;   // the sniffer's nose is 2.25 blocks in front of it

    public enum Phase { IDLE, SNIFF, WALK, DIG, RISE }

    /** Per-sniffer job state (not saved: an interrupted dig simply starts over). */
    public static final class Job {
        public int cooldown = 200;
        public Phase phase = Phase.IDLE;
        public boolean following;
        @Nullable
        public BlockPos target;
        int ticks, repaths;
        boolean dug;
        final Deque<BlockPos> unreachable = new ArrayDeque<>();

        public boolean busy() {
            return phase != Phase.IDLE || following;
        }
    }

    private SnifferTaming() {}

    // --------------------------------------------------------------------------------------- taming

    /** Pitcher pods: 1 in 3 tames it (hearts), otherwise smoke. A tamed sniffer just enjoys the snack. */
    @Nullable
    public static InteractionResult interact(Sniffer s, TamedSniffer t, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!stack.is(Items.PITCHER_POD)) {
            return null;
        }
        if (!(s.level() instanceof ServerLevel level)) {
            return InteractionResult.SUCCESS;
        }
        stack.consume(1, player);
        s.playSound(SoundEvents.SNIFFER_EAT, 1.0f, Mth.randomBetween(s.getRandom(), 0.8f, 1.2f));
        double y = s.getY() + s.getBbHeight() + 0.3;
        if (t.ww$isTamed()) {
            s.heal(4.0f);
            level.sendParticles(ParticleTypes.HEART, s.getX(), y, s.getZ(), 2, 0.4, 0.2, 0.4, 0.02);
            return InteractionResult.CONSUME;
        }
        if (s.getRandom().nextInt(3) == 0) {
            tame(s, t, player.getUUID());
            level.sendParticles(ParticleTypes.HEART, s.getX(), y, s.getZ(), 7, s.getBbWidth() * 0.4, 0.4, s.getBbWidth() * 0.4, 0.02);
        } else {
            level.sendParticles(ParticleTypes.SMOKE, s.getX(), y, s.getZ(), 7, s.getBbWidth() * 0.4, 0.3, s.getBbWidth() * 0.4, 0.02);
        }
        return InteractionResult.CONSUME;
    }

    public static void tame(Sniffer s, TamedSniffer t, UUID owner) {
        t.ww$setOwner(owner);
        t.ww$job().cooldown = 100;
        s.playSound(WWSounds.SNIFFER_TAME, 1.0f, 1.0f);
        s.getBrain().setMemory(MemoryModuleType.SNIFFER_HAPPY, true);   // vanilla's happy wiggle
    }

    // --------------------------------------------------------------------------------------- AI

    /** Server AI step of a tamed sniffer. Returns true when it is busy and vanilla's brain should not run this tick. */
    public static boolean tick(Sniffer s, TamedSniffer t) {
        if (!(s.level() instanceof ServerLevel level)) {
            return false;
        }
        Job j = t.ww$job();
        UUID id = t.ww$owner();
        Player owner = id == null ? null : level.getPlayerByUUID(id);
        if (owner != null && (owner.isSpectator() || !owner.isAlive())) {
            owner = null;
        }
        // being led, ridden, in love, scared, swimming or hit: vanilla knows what to do
        if (s.isLeashed() || s.isPassenger() || s.isVehicle() || s.isInLove() || s.isPanicking() || s.isInWater() || s.hurtTime > 0) {
            if (j.busy()) {
                stop(s, t, j, false);
            }
            return false;
        }
        double far = owner == null ? 0 : s.distanceToSqr(owner);
        if (owner != null && far > 24 * 24 && owner.onGround()) {
            if (j.busy()) {
                stop(s, t, j, false);
            }
            teleportNear(level, s, owner);
            return false;
        }
        if (j.phase != Phase.IDLE) {
            runJob(level, s, t, j);
            return true;
        }
        // 0.4 fixes: about once a minute it waters the crops near its owner (between digs, before following)
        if (SnifferWatering.tick(level, s, t, owner)) {
            return true;
        }
        // follow the owner (from 10 blocks away until 4 blocks away)
        if (owner != null && (far > 10 * 10 || (j.following && far > 4 * 4))) {
            if (!j.following) {
                takeOver(level, s, t);
                j.following = true;
            }
            if (s.getNavigation().isDone() || s.tickCount % 10 == 0) {
                s.getNavigation().moveTo(owner, 1.6);
            }
            s.getLookControl().setLookAt(owner, 10.0f, s.getMaxHeadXRot());
            return true;
        }
        if (j.following) {
            j.following = false;
            s.getNavigation().stop();
        }
        if (j.cooldown > 0) {
            j.cooldown--;
            return false;
        }
        if (t.ww$state() != Sniffer.State.IDLING || !s.onGround() || s.isBaby()) {
            return false;
        }
        j.cooldown = SNIFF_INTERVAL + s.getRandom().nextInt(200);
        BlockPos found = find(level, s, j);
        if (found == null) {
            return false;
        }
        takeOver(level, s, t);
        j.target = found;
        j.phase = Phase.SNIFF;
        j.ticks = 0;
        j.repaths = 0;
        j.dug = false;
        s.transitionTo(Sniffer.State.SNIFFING);
        return true;
    }

    private static void runJob(ServerLevel level, Sniffer s, TamedSniffer t, Job j) {
        j.ticks++;
        BlockPos target = j.target;
        if (target == null || (!j.dug && !diggable(level, target))) {
            stop(s, t, j, false);
            return;
        }
        switch (j.phase) {
            case SNIFF -> {
                face(s, target, 8f);
                if (j.ticks >= SNIFF_TICKS) {
                    j.phase = Phase.WALK;
                    j.ticks = 0;
                    s.transitionTo(Sniffer.State.SEARCHING);
                    walk(s, target);
                }
            }
            case WALK -> {
                double dx = target.getX() + 0.5 - s.getX(), dz = target.getZ() + 0.5 - s.getZ();
                if (dx * dx + dz * dz <= REACH * REACH && Math.abs(s.getY() - (target.getY() + 1)) < 1.6) {
                    s.getNavigation().stop();
                    face(s, target, 360f);
                    s.transitionTo(Sniffer.State.DIGGING);
                    t.ww$noSeedDrop();
                    j.phase = Phase.DIG;
                    j.ticks = 0;
                } else if (j.ticks > 400 || j.repaths > 8) {
                    j.unreachable.addFirst(target);   // give up on this one for a while
                    if (j.unreachable.size() > 8) {
                        j.unreachable.removeLast();
                    }
                    stop(s, t, j, false);
                } else if (s.getNavigation().isDone()) {
                    j.repaths++;
                    walk(s, target);
                }
            }
            case DIG -> {
                face(s, target, 20f);
                if (j.ticks == EXCAVATE_AT) {
                    excavate(level, s, target);
                    j.dug = true;
                }
                if (j.ticks >= DIG_TICKS) {
                    s.transitionTo(Sniffer.State.RISING);
                    j.phase = Phase.RISE;
                    j.ticks = 0;
                }
            }
            case RISE -> {
                if (j.ticks >= RISE_TICKS) {
                    stop(s, t, j, true);
                }
            }
            default -> stop(s, t, j, false);
        }
    }

    /** Pause vanilla's brain cleanly: stop whatever it was doing and forget where it was walking. */
    private static void takeOver(ServerLevel level, Sniffer s, TamedSniffer t) {
        Brain<Sniffer> b = s.getBrain();
        b.stopAll(level, s);
        b.eraseMemory(MemoryModuleType.WALK_TARGET);
        b.eraseMemory(MemoryModuleType.LOOK_TARGET);
        b.eraseMemory(MemoryModuleType.PATH);
        b.eraseMemory(MemoryModuleType.SNIFFER_SNIFFING_TARGET);
        b.eraseMemory(MemoryModuleType.SNIFFER_DIGGING);
        s.getNavigation().stop();
        if (t.ww$state() != Sniffer.State.IDLING) {
            s.transitionTo(Sniffer.State.IDLING);
        }
    }

    private static void stop(Sniffer s, TamedSniffer t, Job j, boolean happy) {
        j.phase = Phase.IDLE;
        j.following = false;
        j.target = null;
        j.ticks = 0;
        j.dug = false;
        s.getNavigation().stop();
        if (t.ww$state() != Sniffer.State.IDLING) {
            s.transitionTo(Sniffer.State.IDLING);
        }
        if (happy) {
            s.getBrain().setMemory(MemoryModuleType.SNIFFER_HAPPY, true);
        }
    }

    private static void walk(Sniffer s, BlockPos target) {
        s.getNavigation().moveTo(target.getX() + 0.5, target.getY() + 1, target.getZ() + 0.5, 1.5);
    }

    private static void face(Sniffer s, BlockPos target, float step) {
        double dx = target.getX() + 0.5 - s.getX(), dz = target.getZ() + 0.5 - s.getZ();
        float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90f;
        float r = Mth.approachDegrees(s.getYRot(), yaw, step);
        s.setYRot(r);
        s.setYHeadRot(r);
        s.setYBodyRot(r);
    }

    /** Suspicious sand and gravel and amber fossils (any brushable block) with open air above. */
    public static boolean diggable(ServerLevel level, BlockPos p) {
        if (!level.isLoaded(p) || !(level.getBlockState(p).getBlock() instanceof BrushableBlock)) {
            return false;
        }
        BlockPos up = p.above();
        return level.getBlockState(up).getCollisionShape(level, up).isEmpty();
    }

    @Nullable
    private static BlockPos find(ServerLevel level, Sniffer s, Job j) {
        BlockPos c = s.blockPosition();
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-RADIUS, -HEIGHT, -RADIUS), c.offset(RADIUS, HEIGHT, RADIUS))) {
            int dx = p.getX() - c.getX(), dz = p.getZ() - c.getZ();
            if (dx * dx + dz * dz > RADIUS * RADIUS || !diggable(level, p) || j.unreachable.contains(p)) {
                continue;
            }
            double d = p.distSqr(c);
            if (d < bestD) {
                bestD = d;
                best = p.immutable();
            }
        }
        return best;
    }

    /** Dig the block up: its brushing loot pops out and it turns into sand/gravel. */
    public static void excavate(ServerLevel level, Entity digger, BlockPos pos) {
        BlockState st = level.getBlockState(pos);
        if (!(st.getBlock() instanceof BrushableBlock bb)) {
            return;
        }
        ItemStack loot = brushingLoot(level, pos, st, digger);
        level.levelEvent(3008, pos, Block.getId(st));   // the brushing-completed dust and sound
        level.setBlock(pos, bb.getTurnsInto().defaultBlockState(), Block.UPDATE_ALL);
        level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(digger, st));
        if (!loot.isEmpty()) {
            ItemEntity e = new ItemEntity(level, pos.getX() + 0.5, pos.getY() + 1.1, pos.getZ() + 0.5, loot);
            e.setDeltaMovement(level.random.triangle(0, 0.06), 0.25, level.random.triangle(0, 0.06));
            e.setDefaultPickUpDelay();
            level.addFreshEntity(e);
        }
        digger.playSound(SoundEvents.SNIFFER_DROP_SEED, 1.0f, 1.0f);
    }

    /** What brushing the block would give, without a player (the loot table or the stored item). */
    public static ItemStack brushingLoot(ServerLevel level, BlockPos pos, BlockState st, @Nullable Entity digger) {
        ItemStack out = ItemStack.EMPTY;
        if (level.getBlockEntity(pos) instanceof BrushableLoot be) {
            ResourceKey<LootTable> key = be.ww$lootTable();
            if (key != null) {
                LootTable table = level.getServer().reloadableRegistries().getLootTable(key);
                LootParams.Builder b = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, Vec3.atCenterOf(pos));
                if (digger != null) {
                    b.withParameter(LootContextParams.THIS_ENTITY, digger);
                }
                List<ItemStack> items = table.getRandomItems(b.create(LootContextParamSets.CHEST), be.ww$lootTableSeed());
                if (!items.isEmpty()) {
                    out = items.get(0);
                }
            } else {
                out = be.ww$item().copy();
            }
        }
        if (st.is(WWBlocks.AMBER_FOSSIL)) {
            out = new ItemStack(WWItems.AMBERWOOD_BLOOM);   // a fossil holds a petrified Amberwood bloom
        }
        return out;
    }

    private static boolean teleportNear(ServerLevel level, Sniffer s, Player owner) {
        for (int i = 0; i < 16; i++) {
            int dx = s.getRandom().nextInt(11) - 5, dz = s.getRandom().nextInt(11) - 5, dy = s.getRandom().nextInt(3) - 1;
            if (Math.abs(dx) < 2 && Math.abs(dz) < 2) {
                continue;
            }
            BlockPos p = owner.blockPosition().offset(dx, dy, dz);
            if (!level.getBlockState(p.below()).isFaceSturdy(level, p.below(), Direction.UP)) {
                continue;
            }
            AABB box = s.getDimensions(s.getPose()).makeBoundingBox(p.getX() + 0.5, p.getY(), p.getZ() + 0.5);
            if (level.noCollision(s, box) && !level.containsAnyLiquid(box)) {
                s.moveTo(p.getX() + 0.5, p.getY(), p.getZ() + 0.5, s.getYRot(), s.getXRot());
                s.getNavigation().stop();
                return true;
            }
        }
        return false;
    }
}
