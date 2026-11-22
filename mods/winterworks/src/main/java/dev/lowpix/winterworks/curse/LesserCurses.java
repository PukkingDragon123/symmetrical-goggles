package dev.lowpix.winterworks.curse;

import dev.lowpix.winterworks.registry.WWParticles;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.WeakHashMap;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** The seven lesser curses (docs/HEXES_UPDATE.md 3). */
public final class LesserCurses {
    /** Narcissus: how long you may stare at still water (ticks). */
    public static final int STARE_TICKS = 200;
    public static final float MIDAS_CHANCE = 0.2f, TANTALUS_CHANCE = 0.15f, SISYPHUS_CHANCE = 0.15f;
    /** Icarus: the height of the sun's reach. */
    public static final double ICARUS_HEIGHT = 160;
    /** Moth: how far a light can call you, and how bright it must be. */
    public static final int MOTH_RANGE = 12, MOTH_LIGHT = 6;

    private LesserCurses() {}

    static void tick(ServerPlayer p, Curses.State s, long now) {
        narcissus(p, s, now);
        if (now % 10 == 0) {
            icarus(p, s);
        }
        bite(p, s);
        moth(p, s, now);
    }

    // ------------------------------------------------------------------------------------------------ Narcissus

    public static boolean transfixed(ServerPlayer p) {
        return Curses.state(p).transfixed;
    }

    /** Where the player's gaze meets still water within 8 blocks (from above it), or null. */
    @Nullable
    public static Vec3 reflection(ServerPlayer p) {
        if (p.isEyeInFluid(FluidTags.WATER) || p.isUnderWater()) {
            return null;
        }
        Vec3 eye = p.getEyePosition();
        Vec3 end = eye.add(p.getViewVector(1f).scale(8));
        BlockHitResult hit = p.level().clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.SOURCE_ONLY, p));
        if (hit.getType() != HitResult.Type.BLOCK) {
            return null;
        }
        FluidState fluid = p.level().getFluidState(hit.getBlockPos());
        return fluid.is(FluidTags.WATER) && fluid.isSource() ? hit.getLocation() : null;
    }

    private static void narcissus(ServerPlayer p, Curses.State s, long now) {
        ServerLevel level = p.serverLevel();
        if (s.transfixed) {
            if (!Curses.cursable(p)) {
                untransfix(p, s);
                return;
            }
            if (now >= s.nextWaste) {
                s.nextWaste = now + 40;
                p.hurt(Curses.damage(level, Curses.NARCISSUS_DAMAGE, null), 1f);
            }
            if (now % 8 == 0 && s.waterAt != null) {
                level.sendParticles(ParticleTypes.FISHING, s.waterAt.x, s.waterAt.y + 0.05, s.waterAt.z, 3, 0.4, 0, 0.4, 0.02);
                Curses.runes(level, s.waterAt.add(0, 0.3, 0), 2, 0.3);
                level.sendParticles(ParticleTypes.SOUL, p.getX(), p.getY() + 1.1, p.getZ(), 1, 0.3, 0.4, 0.3, 0.01);
            }
            return;
        }
        if (now % 5 != 0) {
            return;
        }
        Vec3 water = Curses.has(p, Curse.NARCISSUS) ? reflection(p) : null;
        if (water == null) {
            s.stare = 0;
            return;
        }
        s.stare += 5;
        s.waterAt = water;
        if (s.stare % 20 == 0) {   // the reflection starts to swirl as you look
            level.sendParticles(ParticleTypes.FISHING, water.x, water.y + 0.05, water.z, 1 + s.stare / 40, 0.3, 0, 0.3, 0.01);
            if (s.stare >= STARE_TICKS / 2) {
                Curses.runes(level, water.add(0, 0.2, 0), 1 + s.stare / 50, 0.25);
            }
        }
        if (s.stare == STARE_TICKS / 2) {   // a warning, every time
            Curses.tell(p, "curse.winterworks.narcissus.warn");
            level.playSound(null, water.x, water.y, water.z, WWSounds.NARCISSUS, SoundSource.PLAYERS, 0.35f, 1.3f);
        }
        if (s.stare >= STARE_TICKS) {
            transfix(p, s, water);
        }
    }

    static void transfix(ServerPlayer p, Curses.State s, Vec3 water) {
        s.transfixed = true;
        s.waterAt = water;
        s.nextWaste = p.level().getGameTime() + 40;
        Curses.freeze(p, -1);
        p.lookAt(EntityAnchorArgument.Anchor.EYES, water);
        Curses.send(p, CurseFxPayload.TRANSFIX, -1, (float) water.x, (float) water.y, (float) water.z);
        Curses.trigger(p, Curse.NARCISSUS, WWSounds.NARCISSUS);
        p.serverLevel().sendParticles(ParticleTypes.SPLASH, water.x, water.y + 0.1, water.z, 12, 0.4, 0.05, 0.4, 0.1);
    }

    private static void untransfix(ServerPlayer p, Curses.State s) {
        s.transfixed = false;
        s.stare = 0;
        Curses.release(p);
    }

    /** Something other than the curse hurt a transfixed player: the spell breaks. */
    static void onHurt(ServerPlayer p, DamageSource source) {
        Curses.State s = Curses.state(p);
        if (s.transfixed && !source.is(Curses.NARCISSUS_DAMAGE)) {
            untransfix(p, s);
            Curses.sound(p, SoundEvents.PLAYER_SPLASH, 0.6f, 1.4f);
        }
    }

    // ------------------------------------------------------------------------------------------------ Icarus

    private static void icarus(ServerPlayer p, Curses.State s) {
        ServerLevel level = p.serverLevel();
        boolean burning = Curses.has(p, Curse.ICARUS) && p.getY() > ICARUS_HEIGHT && level.isDay() && !level.isRaining()
                && level.canSeeSky(BlockPos.containing(p.getEyePosition()));
        if (!burning) {
            s.icarusBurning = false;
            return;
        }
        ItemStack chest = p.getItemBySlot(EquipmentSlot.CHEST);
        if (chest.isEmpty()) {
            return;
        }
        if (!s.icarusBurning) {
            s.icarusBurning = true;
            Curses.trigger(p, Curse.ICARUS, WWSounds.TRIGGER);
            Curses.sound(p, SoundEvents.FIRECHARGE_USE, 0.7f, 0.8f);
        }
        if (chest.isDamageableItem()) {
            chest.hurtAndBreak(6, p, EquipmentSlot.CHEST);   // the wax melts: an elytra lasts about 7 s up there
        }
        p.setRemainingFireTicks(Math.max(p.getRemainingFireTicks(), 80));
        Vec3 back = p.position().add(p.getLookAngle().multiply(-0.3, 0, -0.3)).add(0, 1.2, 0);
        level.sendParticles(ParticleTypes.FLAME, back.x, back.y, back.z, 4, 0.35, 0.2, 0.35, 0.02);
        level.sendParticles(ParticleTypes.LARGE_SMOKE, back.x, back.y, back.z, 2, 0.3, 0.2, 0.3, 0.01);
        level.sendParticles(ParticleTypes.FALLING_HONEY, back.x, back.y - 0.2, back.z, 2, 0.3, 0.1, 0.3, 0);
    }

    // ------------------------------------------------------------------------------------------------ Midas, Tantalus

    private static void bite(ServerPlayer p, Curses.State s) {
        boolean midas = Curses.has(p, Curse.MIDAS), tantalus = Curses.has(p, Curse.TANTALUS);
        if (!p.isUsingItem() || !midas && !tantalus) {
            s.bitRolled = false;
            return;
        }
        ItemStack food = p.getUseItem();
        if (s.bitRolled || !food.has(DataComponents.FOOD)) {
            return;
        }
        s.bitRolled = true;   // one roll for each time you start eating
        InteractionHand hand = p.getUsedItemHand();
        if (midas && Curses.roll(p, MIDAS_CHANCE)) {
            midasTouch(p, hand);
        } else if (tantalus && Curses.roll(p, TANTALUS_CHANCE)) {
            slip(p, hand);
        }
    }

    /** Midas: the food in that hand turns to as many gold nuggets. */
    static void midasTouch(ServerPlayer p, InteractionHand hand) {
        ItemStack food = p.getItemInHand(hand);
        int n = food.getCount();
        p.stopUsingItem();
        p.setItemInHand(hand, new ItemStack(Items.GOLD_NUGGET, n));
        Vec3 at = handPos(p, hand);
        ServerLevel level = p.serverLevel();
        level.sendParticles(WWParticles.GOLD_GLINT, at.x, at.y, at.z, 12, 0.2, 0.2, 0.2, 0.05);
        level.sendParticles(ParticleTypes.WAX_ON, at.x, at.y, at.z, 8, 0.2, 0.2, 0.2, 0.5);
        Curses.sound(p, SoundEvents.ARMOR_EQUIP_GOLD.value(), 1f, 1.4f);
        Curses.sound(p, SoundEvents.AMETHYST_BLOCK_CHIME, 1f, 0.7f);
        Curses.trigger(p, Curse.MIDAS, WWSounds.TRIGGER);
    }

    /** Tantalus: one bite slips out of your hand and rolls away. */
    static void slip(ServerPlayer p, InteractionHand hand) {
        ItemStack food = p.getItemInHand(hand);
        p.stopUsingItem();
        ItemStack one = food.split(1);
        ServerLevel level = p.serverLevel();
        Vec3 at = handPos(p, hand);
        ItemEntity item = new ItemEntity(level, at.x, at.y, at.z, one);
        float yaw = (p.getYRot() + (p.getRandom().nextFloat() - 0.5f) * 120f) * Mth.DEG_TO_RAD;
        item.setDeltaMovement(-Mth.sin(yaw) * 0.32, 0.22, Mth.cos(yaw) * 0.32);
        item.setPickUpDelay(40);
        level.addFreshEntity(item);
        Curses.sound(p, SoundEvents.ITEM_PICKUP, 0.6f, 0.6f);
        Curses.trigger(p, Curse.TANTALUS, WWSounds.TRIGGER);
    }

    private static Vec3 handPos(ServerPlayer p, InteractionHand hand) {
        float side = (hand == InteractionHand.MAIN_HAND) == (p.getMainArm() == net.minecraft.world.entity.HumanoidArm.RIGHT) ? 1 : -1;
        float yaw = p.getYRot() * Mth.DEG_TO_RAD;
        return new Vec3(p.getX() - Mth.sin(yaw) * 0.4 - Mth.cos(yaw) * 0.35 * side, p.getEyeY() - 0.4,
                p.getZ() + Mth.cos(yaw) * 0.4 - Mth.sin(yaw) * 0.35 * side);
    }

    // ------------------------------------------------------------------------------------------------ Moth

    private static void moth(ServerPlayer p, Curses.State s, long now) {
        ServerLevel level = p.serverLevel();
        if (!Curses.has(p, Curse.MOTH) || !level.isNight() || p.isFallFlying() || s.frozenUntil != 0) {
            s.light = null;
            return;
        }
        if (now >= s.nextLightScan) {
            s.nextLightScan = now + 40;
            BlockPos before = s.light;
            s.light = nearestLight(level, p.blockPosition(), MOTH_RANGE);
            if (s.light != null && before == null) {   // a light starts calling
                Curses.trigger(p, Curse.MOTH, WWSounds.TRIGGER);
            }
        }
        if (s.light == null || now % 2 != 0) {
            return;
        }
        if (level.getBlockState(s.light).getLightEmission() < MOTH_LIGHT) {
            s.light = null;
            return;
        }
        Vec3 to = Vec3.atCenterOf(s.light).subtract(p.position());
        double d = Math.sqrt(to.x * to.x + to.z * to.z);
        if (d < 1.2) {
            return;
        }
        double k = 0.05 / d;
        Curses.send(p, CurseFxPayload.PULL, 0, (float) (to.x * k), 0f, (float) (to.z * k));
        if (now % 16 == 0) {
            level.sendParticles(ParticleTypes.WHITE_ASH, p.getX(), p.getY() + 1.2, p.getZ(), 6, 0.4, 0.4, 0.4, 0.02);
            Curses.runes(level, Vec3.atCenterOf(s.light).add(0, 0.6, 0), 1, 0.3);
        }
    }

    /** The nearest block giving light (lava and fire too) within r blocks, scanning only chunk sections that have one. */
    @Nullable
    public static BlockPos nearestLight(ServerLevel level, BlockPos c, int r) {
        BlockPos best = null;
        double bestD = Double.MAX_VALUE;
        BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
        int minY = Math.max(level.getMinBuildHeight(), c.getY() - r), maxY = Math.min(level.getMaxBuildHeight() - 1, c.getY() + r);
        for (int sx = SectionPos.blockToSectionCoord(c.getX() - r); sx <= SectionPos.blockToSectionCoord(c.getX() + r); sx++) {
            for (int sz = SectionPos.blockToSectionCoord(c.getZ() - r); sz <= SectionPos.blockToSectionCoord(c.getZ() + r); sz++) {
                LevelChunk chunk = level.getChunkSource().getChunkNow(sx, sz);
                if (chunk == null) {
                    continue;
                }
                for (int sy = SectionPos.blockToSectionCoord(minY); sy <= SectionPos.blockToSectionCoord(maxY); sy++) {
                    int idx = chunk.getSectionIndexFromSectionY(sy);
                    if (idx < 0 || idx >= chunk.getSections().length) {
                        continue;
                    }
                    LevelChunkSection section = chunk.getSection(idx);
                    if (section.hasOnlyAir() || !section.maybeHas(st -> st.getLightEmission() >= MOTH_LIGHT)) {
                        continue;
                    }
                    int x0 = Math.max(c.getX() - r, sx << 4), x1 = Math.min(c.getX() + r, (sx << 4) + 15);
                    int y0 = Math.max(minY, sy << 4), y1 = Math.min(maxY, (sy << 4) + 15);
                    int z0 = Math.max(c.getZ() - r, sz << 4), z1 = Math.min(c.getZ() + r, (sz << 4) + 15);
                    for (int x = x0; x <= x1; x++) {
                        for (int y = y0; y <= y1; y++) {
                            for (int z = z0; z <= z1; z++) {
                                if (section.getBlockState(x & 15, y & 15, z & 15).getLightEmission() >= MOTH_LIGHT) {
                                    double d = c.distSqr(m.set(x, y, z));
                                    if (d < bestD && d <= (double) r * r) {
                                        bestD = d;
                                        best = m.immutable();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return best;
    }

    // ------------------------------------------------------------------------------------------------ Orpheus

    private record Sink(UUID owner, ResourceKey<Level> dest, Vec3 to, boolean wasNoAi, boolean wasInvulnerable, int[] ticks) {}

    private static final Map<TamableAnimal, Sink> SINKING = new WeakHashMap<>();

    /** The player turned round sharply: a following pet in front of them now is dragged to the underworld. */
    static void onTurn(ServerPlayer p, Curses.State s, long now) {
        if (!Curses.has(p, Curse.ORPHEUS) || now < s.orpheusReady) {
            return;
        }
        Vec3 look = p.getViewVector(1f).multiply(1, 0, 1).normalize();
        TamableAnimal pet = null;
        double best = Double.MAX_VALUE;
        for (TamableAnimal a : p.level().getEntitiesOfClass(TamableAnimal.class, p.getBoundingBox().inflate(16, 6, 16),
                e -> e.isAlive() && e.isTame() && e.isOwnedBy(p) && !e.isOrderedToSit() && !SINKING.containsKey(e))) {
            Vec3 to = a.position().subtract(p.position()).multiply(1, 0, 1);
            double d = to.lengthSqr();
            if (d > 0.25 && to.normalize().dot(look) > 0.7 && d < best) {
                best = d;
                pet = a;
            }
        }
        if (pet != null) {
            s.orpheusReady = now + 100;
            drag(p, pet);
        }
    }

    static void drag(ServerPlayer p, TamableAnimal pet) {
        ServerLevel dest = p.server.getLevel(p.getRespawnDimension());
        BlockPos at = p.getRespawnPosition();
        if (dest == null || at == null) {
            dest = p.server.overworld();
            at = dest.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, dest.getSharedSpawnPos());
        }
        Vec3 to = standingSpot(dest, pet, at);
        SINKING.put(pet, new Sink(p.getUUID(), dest.dimension(), to, pet.isNoAi(), pet.isInvulnerable(), new int[1]));
        pet.setNoAi(true);
        pet.setInvulnerable(true);
        pet.setTarget(null);
        ServerLevel level = p.serverLevel();
        level.playSound(null, pet.getX(), pet.getY(), pet.getZ(), SoundEvents.SOUL_ESCAPE.value(), SoundSource.NEUTRAL, 1.2f, 0.6f);
        level.sendParticles(ParticleTypes.SCULK_SOUL, pet.getX(), pet.getY() + 0.3, pet.getZ(), 10, 0.4, 0.2, 0.4, 0.03);
        if (!Curses.trigger(p, Curse.ORPHEUS, WWSounds.ORPHEUS, pet.getDisplayName())) {
            Curses.tell(p, "curse.winterworks.orpheus.trigger", pet.getDisplayName());   // you always learn who you lost
        }
    }

    private static Vec3 standingSpot(ServerLevel level, LivingEntity e, BlockPos at) {
        for (int dy = 0; dy <= 3; dy++) {
            for (BlockPos q : new BlockPos[] {at.above(dy), at.above(dy).north(), at.above(dy).south(), at.above(dy).east(),
                    at.above(dy).west()}) {
                AABB box = e.getDimensions(e.getPose()).makeBoundingBox(q.getX() + 0.5, q.getY(), q.getZ() + 0.5);
                if (level.noCollision(box) && !level.getBlockState(q.below()).isAir()) {
                    return new Vec3(q.getX() + 0.5, q.getY(), q.getZ() + 0.5);
                }
            }
        }
        return Vec3.atBottomCenterOf(at.above());
    }

    private static void tickSinking(ServerLevel level) {
        if (SINKING.isEmpty()) {
            return;
        }
        List<TamableAnimal> arrived = new ArrayList<>();
        for (Map.Entry<TamableAnimal, Sink> en : SINKING.entrySet()) {
            TamableAnimal pet = en.getKey();
            if (pet == null || pet.level() != level) {
                continue;
            }
            if (!pet.isAlive() || pet.isRemoved()) {
                arrived.add(pet);
                continue;
            }
            int t = ++en.getValue().ticks()[0];
            pet.noPhysics = true;
            pet.setDeltaMovement(Vec3.ZERO);
            pet.setPos(pet.getX(), pet.getY() - 0.05, pet.getZ());
            if (t % 3 == 0) {
                level.sendParticles(ParticleTypes.SOUL, pet.getX(), pet.getY() + 0.2, pet.getZ(), 3, 0.35, 0.1, 0.35, 0.02);
                level.sendParticles(WWParticles.HEX_RUNE, pet.getX(), pet.getY() + 0.1, pet.getZ(), 1, 0.4, 0.05, 0.4, 0.01);
            }
            if (t >= 40) {
                arrived.add(pet);
            }
        }
        for (TamableAnimal pet : arrived) {
            Sink sink = SINKING.remove(pet);
            if (sink != null && pet.isAlive() && !pet.isRemoved()) {
                arrive(level, pet, sink);
            }
        }
    }

    /** The pet surfaces at the owner's spawn point, sitting there waiting for them. */
    private static void arrive(ServerLevel level, TamableAnimal pet, Sink sink) {
        pet.noPhysics = false;
        pet.setNoAi(sink.wasNoAi());
        pet.setInvulnerable(sink.wasInvulnerable());
        pet.setOrderedToSit(true);
        pet.setInSittingPose(true);
        ServerLevel dest = level.getServer().getLevel(sink.dest());
        if (dest == null) {
            dest = level.getServer().overworld();
        }
        Vec3 to = sink.to();
        pet.teleportTo(dest, to.x, to.y, to.z, Set.of(), pet.getYRot(), pet.getXRot());
        dest.sendParticles(ParticleTypes.SOUL, to.x, to.y + 0.4, to.z, 16, 0.4, 0.4, 0.4, 0.03);
        dest.sendParticles(WWParticles.HEX_RUNE, to.x, to.y + 0.6, to.z, 6, 0.4, 0.4, 0.4, 0.02);
        dest.playSound(null, to.x, to.y, to.z, WWSounds.ORPHEUS, SoundSource.NEUTRAL, 0.8f, 1.2f);
    }

    public static boolean sinking(TamableAnimal pet) {
        return SINKING.containsKey(pet);
    }

    // ------------------------------------------------------------------------------------------------ Sisyphus

    private record Return(ResourceKey<Level> dim, BlockPos pos, BlockState state, UUID player, long at, int tries) {}

    private static final List<Return> RETURNS = new ArrayList<>();
    /** Blocks that came back: mining them again gives nothing (no duplicating ores). */
    private static final Map<ResourceKey<Level>, Set<BlockPos>> HOLLOW = new java.util.HashMap<>();
    private static final int HOLLOW_MAX = 4096;

    static boolean returnable(BlockState state, @Nullable BlockEntity be) {
        return be == null && !state.isAir() && !state.hasBlockEntity() && state.getFluidState().isEmpty() && !state.canBeReplaced()
                && !state.hasProperty(BlockStateProperties.DOUBLE_BLOCK_HALF) && !state.hasProperty(BlockStateProperties.BED_PART)
                && !state.hasProperty(BlockStateProperties.CHEST_TYPE);
    }

    /** PlayerBlockBreakEvents.BEFORE: a block that came back crumbles to nothing. */
    static boolean beforeBreak(Level world, ServerPlayer p, BlockPos pos, BlockState state) {
        Set<BlockPos> hollow = HOLLOW.get(world.dimension());
        if (hollow == null || !hollow.remove(pos)) {
            return true;
        }
        world.destroyBlock(pos, false, p);
        ItemStack tool = p.getMainHandItem();
        if (tool.isDamageableItem()) {
            tool.hurtAndBreak(1, p, EquipmentSlot.MAINHAND);
        }
        if (world instanceof ServerLevel level) {
            Curses.runes(level, Vec3.atCenterOf(pos), 3, 0.3);
        }
        return false;
    }

    /** PlayerBlockBreakEvents.AFTER: sometimes the block will come back. */
    static void afterBreak(Level world, ServerPlayer p, BlockPos pos, BlockState state, @Nullable BlockEntity be) {
        if (!(world instanceof ServerLevel level) || !Curses.has(p, Curse.SISYPHUS) || !returnable(state, be)
                || !Curses.roll(p, SISYPHUS_CHANCE)) {
            return;
        }
        long now = level.getGameTime();
        RETURNS.add(new Return(level.dimension(), pos.immutable(), state, p.getUUID(), now + 60 + p.getRandom().nextInt(40), 0));
        Curses.runes(level, Vec3.atCenterOf(pos), 4, 0.25);
    }

    private static void tickReturns(ServerLevel level) {
        if (RETURNS.isEmpty()) {
            return;
        }
        long now = level.getGameTime();
        List<Return> retry = new ArrayList<>();
        for (Iterator<Return> it = RETURNS.iterator(); it.hasNext(); ) {
            Return r = it.next();
            if (r.dim() != level.dimension() || now < r.at()) {
                continue;
            }
            it.remove();
            if (!level.isLoaded(r.pos())) {
                continue;
            }
            BlockState here = level.getBlockState(r.pos());
            if (!here.canBeReplaced() || !r.state().canSurvive(level, r.pos())) {
                continue;   // something else is there now: the stone stays gone
            }
            if (!level.getEntitiesOfClass(LivingEntity.class, new AABB(r.pos())).isEmpty()) {
                if (r.tries() < 5) {
                    retry.add(new Return(r.dim(), r.pos(), r.state(), r.player(), now + 20, r.tries() + 1));
                }
                continue;
            }
            level.setBlock(r.pos(), r.state(), 3);
            Set<BlockPos> hollow = HOLLOW.computeIfAbsent(level.dimension(), k -> new LinkedHashSet<>());
            hollow.add(r.pos());
            if (hollow.size() > HOLLOW_MAX) {
                Iterator<BlockPos> oldest = hollow.iterator();
                oldest.next();
                oldest.remove();
            }
            Vec3 c = Vec3.atCenterOf(r.pos());
            level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, r.state()), c.x, c.y, c.z, 20, 0.3, 0.3, 0.3, 0.05);
            Curses.runes(level, c, 6, 0.4);
            level.playSound(null, r.pos(), r.state().getSoundType().getPlaceSound(), SoundSource.BLOCKS, 1f, 0.8f);
            ServerPlayer p = level.getServer().getPlayerList().getPlayer(r.player());
            if (p != null && p.level() == level) {
                Curses.trigger(p, Curse.SISYPHUS, WWSounds.TRIGGER);
            } else {
                level.playSound(null, r.pos(), WWSounds.TRIGGER, SoundSource.BLOCKS, 0.8f, 1f);
            }
        }
        RETURNS.addAll(retry);
    }

    /** Tests: has this block come back hollow? */
    public static boolean hollow(Level level, BlockPos pos) {
        Set<BlockPos> h = HOLLOW.get(level.dimension());
        return h != null && h.contains(pos);
    }

    static void tickLevel(ServerLevel level) {
        tickSinking(level);
        tickReturns(level);
    }

    static void clear() {
        RETURNS.clear();
        HOLLOW.clear();
        SINKING.clear();
    }
}
