package dev.lowpix.winterworks.harvester;

import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWSounds;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowParentGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.util.DefaultRandomPos;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.horse.AbstractChestedHorse;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Harvester (docs/FIXES_0_4.md "The Harvester"): a big, gentle prehistoric herbivore with a huge hammerhead of a
 * head lined with cropping teeth. Extinct: it only comes from {@link HarvesterEggBlock}s (no natural spawns).
 *
 * <p>Built on vanilla's chested horses, so it wears a saddle (and is ridden like one: it walks and jumps 1.5 blocks) and
 * a donkey-style chest (15 slots, the horse screen). Tamed with pitcher plants (1 in 3), or born tame to a player
 * nearby. A tamed one takes orders: <b>follow</b>, <b>sit</b>, or <b>harvest here</b>:
 * <ul>
 * <li>sneak + use (empty hand) cycles the order; use rides it when saddled, otherwise opens its chest or, without a
 * chest, cycles the order too;</li>
 * <li>getting off it leaves it to harvest where you got off;</li>
 * <li>harvesting: it crops every ripe crop within {@link #WORK_RADIUS} blocks of where it was left (see
 * {@link HarvesterCrops}), a mouthful at a time with its whole wide head (`chomp`), replants them, and puts the harvest
 * in its chest (or drops it when it has none or it's full);</li>
 * <li>herding: while ridden its head shoves the animals in front of it along the way it walks (`shove`).</li>
 * </ul>
 */
public class HarvesterEntity extends AbstractChestedHorse {
    public enum Order {
        FOLLOW, SIT, HARVEST;

        public String id() {
            return name().toLowerCase(Locale.ROOT);
        }

        static Order byId(String id) {
            for (Order o : values()) {
                if (o.id().equals(id)) {
                    return o;
                }
            }
            return FOLLOW;
        }
    }

    private static final EntityDataAccessor<Byte> ORDER = SynchedEntityData.defineId(HarvesterEntity.class, EntityDataSerializers.BYTE);
    public static final byte EV_CHOMP = 70, EV_SHOVE = 71;
    /** Its crops: within this many blocks (horizontally) of where it was left. */
    public static final int WORK_RADIUS = 16, WORK_HEIGHT = 4;
    /** From its middle to the middle of its head (blocks, adult). The head is ~3 blocks wide. */
    public static final double HEAD_REACH = 2.2, HEAD_HALF_WIDTH = 1.6;
    public static final int CHOMP_TICKS = 16, CHOMP_BITE = 8, SHOVE_COOLDOWN = 16;

    // client animation state (clips in assets/winterworks/lowpix/harvester.anim.json)
    public final AnimationState idleState = new AnimationState();
    public final AnimationState sitState = new AnimationState();
    public final AnimationState grazeState = new AnimationState();
    public final AnimationState chompState = new AnimationState();
    public final AnimationState shoveState = new AnimationState();

    @Nullable
    private BlockPos home;
    private int shoveCooldown;
    private double herdX, herdZ;
    private boolean herdInit;

    public HarvesterEntity(EntityType<? extends AbstractChestedHorse> type, Level level) {
        super(type, level);
        this.canGallop = false;
    }

    public static AttributeSupplier.Builder createAttributes() {
        return createBaseChestedHorseAttributes().add(Attributes.MAX_HEALTH, 50.0).add(Attributes.MOVEMENT_SPEED, 0.2)
                .add(Attributes.JUMP_STRENGTH, 0.48).add(Attributes.ARMOR, 4.0).add(Attributes.KNOCKBACK_RESISTANCE, 0.6)
                .add(Attributes.FOLLOW_RANGE, 24.0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(ORDER, (byte) Order.FOLLOW.ordinal());
    }

    /** Fixed stats: no random horse rolls. */
    @Override
    protected void randomizeAttributes(net.minecraft.util.RandomSource random) {
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new PanicGoal(this, 1.3) {
            @Override
            public boolean canUse() {
                return getOrder() != Order.SIT && super.canUse();
            }
        });
        goalSelector.addGoal(2, new SitGoal());
        goalSelector.addGoal(3, new HarvestGoal());
        goalSelector.addGoal(4, new FollowOwnerGoal());
        goalSelector.addGoal(5, new TemptGoal(this, 1.1, s -> s.is(Items.PITCHER_PLANT) || s.is(Items.PITCHER_POD), false));
        goalSelector.addGoal(6, new FollowParentGoal(this, 1.0));
        goalSelector.addGoal(7, new StrollGoal());
        goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0f));
        goalSelector.addGoal(9, new RandomLookAroundGoal(this));
    }

    // --------------------------------------------------------------------------------------- orders

    public Order getOrder() {
        return Order.values()[Mth.clamp(entityData.get(ORDER), 0, Order.values().length - 1)];
    }

    public void setOrder(Order o) {
        entityData.set(ORDER, (byte) o.ordinal());
        if (o == Order.HARVEST || home == null) {
            home = blockPosition();
        }
        if (o == Order.SIT) {
            navigation.stop();
            setEating(false);
        }
    }

    /** Sitting (on orders, and not ridden). */
    public boolean isSitting() {
        return getOrder() == Order.SIT && !isVehicle();
    }

    /** Where it was left to harvest. */
    @Nullable
    public BlockPos home() {
        return home;
    }

    /** Leaves it to harvest around `pos`. */
    public void leaveAt(BlockPos pos) {
        entityData.set(ORDER, (byte) Order.HARVEST.ordinal());
        home = pos.immutable();
    }

    public boolean isOwnedBy(Player p) {
        return isTamed() && p.getUUID().equals(getOwnerUUID());
    }

    @Nullable
    public Player ownerPlayer() {
        return getOwnerUUID() == null ? null : level().getPlayerByUUID(getOwnerUUID());
    }

    private void cycleOrder(Player player) {
        Order next = switch (getOrder()) {
            case FOLLOW -> Order.SIT;
            case SIT -> Order.HARVEST;
            case HARVEST -> Order.FOLLOW;
        };
        setOrder(next);
        player.displayClientMessage(Component.translatable("message.winterworks.harvester.order." + next.id()), true);
    }

    // --------------------------------------------------------------------------------------- interaction

    /** What it likes to eat: heals it, and grows a baby up faster. */
    public static boolean isFeed(ItemStack s) {
        return s.is(Items.PITCHER_POD) || s.is(Items.WHEAT) || s.is(Items.SWEET_BERRIES) || s.is(Items.MELON_SLICE)
                || s.is(Items.HAY_BLOCK) || s.is(Items.BEETROOT);
    }

    @Override
    public boolean isFood(ItemStack stack) {
        return false;   // extinct: it doesn't breed
    }

    @Override
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        boolean client = level().isClientSide;
        if (isVehicle()) {
            return InteractionResult.PASS;
        }
        if (!isTamed()) {
            if (stack.is(Items.PITCHER_PLANT)) {
                if (!client) {
                    tryTame(player, stack);
                }
                return InteractionResult.sidedSuccess(client);
            }
            return InteractionResult.PASS;
        }
        if (!isOwnedBy(player)) {
            return InteractionResult.PASS;
        }
        if ((isFeed(stack) || stack.is(Items.PITCHER_PLANT)) && (getHealth() < getMaxHealth() || isBaby())) {
            if (!client) {
                feed(player, stack);
            }
            return InteractionResult.sidedSuccess(client);
        }
        if (!isBaby() && stack.is(Items.CHEST) && !hasChest()) {
            if (!client) {
                setChest(true);
                playChestEquipsSound();
                stack.consume(1, player);
                createInventory();
            }
            return InteractionResult.sidedSuccess(client);
        }
        if (!isBaby() && stack.is(Items.SADDLE) && !isSaddled()) {
            InteractionResult r = stack.interactLivingEntity(player, this, hand);
            if (r.consumesAction()) {
                return r;
            }
        }
        if (player.isSecondaryUseActive() || isBaby()) {
            if (!client) {
                cycleOrder(player);
            }
            return InteractionResult.sidedSuccess(client);
        }
        if (isSaddled()) {
            if (!client && getOrder() == Order.SIT) {
                entityData.set(ORDER, (byte) Order.FOLLOW.ordinal());
            }
            doPlayerRide(player);
            return InteractionResult.sidedSuccess(client);
        }
        if (hasChest()) {
            openCustomInventoryScreen(player);
            return InteractionResult.sidedSuccess(client);
        }
        if (!client) {
            cycleOrder(player);
        }
        return InteractionResult.sidedSuccess(client);
    }

    /** One pitcher plant: tamed 1 in 3 (hearts), otherwise smoke. */
    private void tryTame(Player player, ItemStack stack) {
        stack.consume(1, player);
        playSound(WWSounds.HARVESTER_CHOMP, 1.0f, getVoicePitch());
        level().broadcastEntityEvent(this, EV_CHOMP);
        if (random.nextInt(3) == 0) {
            tameWithName(player);   // vanilla's hearts (event 7)
            navigation.stop();
            setOrder(Order.FOLLOW);
        } else {
            level().broadcastEntityEvent(this, (byte) 6);   // smoke
        }
    }

    private void feed(Player player, ItemStack stack) {
        heal(stack.is(Items.HAY_BLOCK) ? 10.0f : 4.0f);
        if (isBaby()) {
            ageUp(AgeableMob.getSpeedUpSecondsWhenFeeding(-getAge()), true);
        }
        stack.consume(1, player);
        playSound(WWSounds.HARVESTER_CHOMP, 1.0f, getVoicePitch());
        level().broadcastEntityEvent(this, EV_CHOMP);
        if (level() instanceof ServerLevel sl) {
            sl.sendParticles(ParticleTypes.HAPPY_VILLAGER, getX(), getY() + getBbHeight(), getZ(), 5, 0.6, 0.3, 0.6, 0.0);
        }
    }

    /** Getting off leaves it to harvest right there. */
    @Override
    protected void removePassenger(Entity passenger) {
        super.removePassenger(passenger);
        if (!level().isClientSide && passenger instanceof Player p && isOwnedBy(p) && isAlive()) {
            leaveAt(blockPosition());
            p.displayClientMessage(Component.translatable("message.winterworks.harvester.order.harvest"), true);
        }
    }

    @Override
    protected boolean canPerformRearing() {
        return false;
    }

    @Override
    public boolean canMate(Animal other) {
        return false;
    }

    @Nullable
    @Override
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob other) {
        return WWEntities.HARVESTER.create(level);
    }

    @Override
    public boolean isImmobile() {
        return super.isImmobile() || isSitting();
    }

    // --------------------------------------------------------------------------------------- the chest

    /** Puts a stack into the chest (never the saddle slot). Returns what didn't fit. */
    public ItemStack stash(ItemStack stack) {
        if (!hasChest()) {
            return stack;
        }
        for (int i = 1; i < inventory.getContainerSize() && !stack.isEmpty(); i++) {
            ItemStack in = inventory.getItem(i);
            if (!in.isEmpty() && ItemStack.isSameItemSameComponents(in, stack) && in.getCount() < in.getMaxStackSize()) {
                int move = Math.min(stack.getCount(), in.getMaxStackSize() - in.getCount());
                in.grow(move);
                stack.shrink(move);
                inventory.setChanged();
            }
        }
        for (int i = 1; i < inventory.getContainerSize() && !stack.isEmpty(); i++) {
            if (inventory.getItem(i).isEmpty()) {
                inventory.setItem(i, stack.copy());
                stack.setCount(0);
            }
        }
        return stack;
    }

    /** How many of `item` are in its chest. */
    public int countInChest(net.minecraft.world.item.Item item) {
        int n = 0;
        for (int i = 1; i < inventory.getContainerSize(); i++) {
            if (inventory.getItem(i).is(item)) {
                n += inventory.getItem(i).getCount();
            }
        }
        return n;
    }

    // --------------------------------------------------------------------------------------- its head

    /** Its size: babies are half size. */
    public float bodyScale() {
        return getScale() * getAgeScale();
    }

    /** Facing (horizontal unit vector). */
    public Vec3 forward() {
        return Vec3.directionFromRotation(0f, getYRot());
    }

    /** The middle of its head, at its feet's height. */
    public Vec3 headPoint() {
        return position().add(forward().scale(HEAD_REACH * bodyScale()));
    }

    /** Is `p` under its head: within the wide head's footprint (3 wide, ~2 deep) and its height? */
    public boolean underHead(Vec3 p) {
        Vec3 f = forward();
        Vec3 rel = p.subtract(headPoint());
        double along = rel.x * f.x + rel.z * f.z, across = rel.x * -f.z + rel.z * f.x;
        return Math.abs(along) <= 1.0 && Math.abs(across) <= HEAD_HALF_WIDTH * bodyScale() && rel.y > -1.6 && rel.y < 2.2;
    }

    /** Crops every ripe plant under its head; the harvest goes into its chest or drops. Returns the number cropped. */
    public int chompAhead() {
        if (!(level() instanceof ServerLevel level)) {
            return 0;
        }
        Vec3 h = headPoint();
        BlockPos c = BlockPos.containing(h);
        int n = 0;
        for (BlockPos p : BlockPos.betweenClosed(c.offset(-2, -1, -2), c.offset(2, 2, 2))) {
            if (!underHead(Vec3.atBottomCenterOf(p)) || !HarvesterCrops.isRipe(level, p)) {
                continue;
            }
            BlockPos at = p.immutable();
            for (ItemStack drop : HarvesterCrops.harvest(level, at, this)) {
                ItemStack left = stash(drop);
                if (!left.isEmpty()) {
                    spawnAtLocation(left, 0.5f);
                }
            }
            n++;
        }
        return n;
    }

    // --------------------------------------------------------------------------------------- herding

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            boolean sitting = isSitting();
            sitState.animateWhen(sitting, tickCount);
            idleState.animateWhen(!sitting, tickCount);
            grazeState.animateWhen(isEating() && !sitting, tickCount);
            return;
        }
        if (shoveCooldown > 0) {
            shoveCooldown--;
        }
        double dx = getX() - herdX, dz = getZ() - herdZ;
        herdX = getX();
        herdZ = getZ();
        if (herdInit && getControllingPassenger() instanceof Player && dx * dx + dz * dz > 0.0009 && dx * dx + dz * dz < 4.0) {
            shoveAhead(new Vec3(dx, 0, dz));
        }
        herdInit = true;
    }

    /**
     * Its head shoves the animals in front of it along `motion` (the way it is walking, blocks per tick). Returns how many
     * it shoved.
     */
    public int shoveAhead(Vec3 motion) {
        double speed = motion.horizontalDistance();
        if (speed < 1e-4) {
            return 0;
        }
        Vec3 dir = new Vec3(motion.x / speed, 0, motion.z / speed);
        Vec3 h = headPoint();
        AABB box = new AABB(h, h).inflate(2.6, 0.5, 2.6).expandTowards(0, 2.0, 0);
        List<Animal> herd = level().getEntitiesOfClass(Animal.class, box, a -> a != this && a.isAlive() && !(a instanceof HarvesterEntity)
                && !a.isPassenger() && !hasPassenger(a) && inShoveReach(a));
        double want = Math.max(0.3, speed * 1.4);
        for (Animal a : herd) {
            Vec3 v = a.getDeltaMovement();
            double along = v.x * dir.x + v.z * dir.z;
            if (along < want) {
                v = v.add(dir.scale(want - along));
            }
            a.setDeltaMovement(v.x, a.onGround() ? Math.max(v.y, 0.12) : v.y, v.z);
            a.hurtMarked = true;
            if (a instanceof Mob m) {
                m.getNavigation().stop();
            }
        }
        if (!herd.isEmpty() && shoveCooldown <= 0) {
            shoveCooldown = SHOVE_COOLDOWN;
            level().broadcastEntityEvent(this, EV_SHOVE);
            playSound(WWSounds.HARVESTER_SHOVE, 1.0f, getVoicePitch());
        }
        return herd.size();
    }

    /** In front of the head, within its width (a little wider than the head: it sweeps). */
    private boolean inShoveReach(Entity e) {
        Vec3 f = forward();
        Vec3 rel = e.position().subtract(headPoint());
        double along = rel.x * f.x + rel.z * f.z, across = rel.x * -f.z + rel.z * f.x;
        double half = HEAD_HALF_WIDTH * bodyScale() + e.getBbWidth() * 0.5 + 0.2;
        return along > -1.4 && along < 1.4 + e.getBbWidth() * 0.5 && Math.abs(across) <= half && Math.abs(rel.y) < 2.0;
    }

    // --------------------------------------------------------------------------------------- client events

    @Override
    public void handleEntityEvent(byte id) {
        switch (id) {
            case EV_CHOMP -> chompState.start(tickCount);
            case EV_SHOVE -> shoveState.start(tickCount);
            default -> super.handleEntityEvent(id);
        }
    }

    // --------------------------------------------------------------------------------------- sounds

    @Override
    protected SoundEvent getAmbientSound() {
        return WWSounds.HARVESTER_AMBIENT;
    }

    @Override
    protected SoundEvent getHurtSound(DamageSource source) {
        return WWSounds.HARVESTER_HURT;
    }

    @Override
    protected SoundEvent getDeathSound() {
        return WWSounds.HARVESTER_DEATH;
    }

    @Nullable
    @Override
    protected SoundEvent getEatingSound() {
        return WWSounds.HARVESTER_CHOMP;
    }

    @Nullable
    @Override
    protected SoundEvent getAngrySound() {
        return WWSounds.HARVESTER_AMBIENT;
    }

    @Override
    protected void playStepSound(BlockPos pos, BlockState state) {
        if (!state.liquid()) {
            playSound(WWSounds.HARVESTER_STEP, isBaby() ? 0.25f : 0.6f, isBaby() ? 1.4f : 1.0f);
        }
    }

    @Override
    protected void playJumpSound() {
        playSound(WWSounds.HARVESTER_STEP, 0.8f, 0.8f);
    }

    @Override
    protected void playChestEquipsSound() {
        playSound(SoundEvents.DONKEY_CHEST, 1.0f, 0.8f);
    }

    @Override
    public float getVoicePitch() {
        return isBaby() ? 1.4f + (random.nextFloat() - 0.5f) * 0.2f : 0.9f + (random.nextFloat() - 0.5f) * 0.2f;
    }

    // --------------------------------------------------------------------------------------- saving

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putString("Order", getOrder().id());
        if (home != null) {
            tag.putLong("Home", home.asLong());
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        entityData.set(ORDER, (byte) Order.byId(tag.getString("Order")).ordinal());
        home = tag.contains("Home") ? BlockPos.of(tag.getLong("Home")) : null;
    }

    // --------------------------------------------------------------------------------------- goals

    private boolean free() {
        return isTamed() && !isVehicle() && !isLeashed() && !isPassenger();
    }

    /** Sits still on orders. */
    class SitGoal extends Goal {
        SitGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.JUMP));
        }

        @Override
        public boolean canUse() {
            return free() && getOrder() == Order.SIT && !isInWater();
        }

        @Override
        public void start() {
            navigation.stop();
        }
    }

    /** Follows its owner (from 10 blocks away until 4 away; catches up from far off). */
    class FollowOwnerGoal extends Goal {
        @Nullable
        private Player owner;
        private int repath;

        FollowOwnerGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            if (!free() || getOrder() != Order.FOLLOW) {
                return false;
            }
            Player p = ownerPlayer();
            if (p == null || p.isSpectator() || !p.isAlive() || distanceToSqr(p) < 10 * 10) {
                return false;
            }
            owner = p;
            return true;
        }

        @Override
        public boolean canContinueToUse() {
            return owner != null && free() && getOrder() == Order.FOLLOW && owner.isAlive() && !navigation.isDone()
                    && distanceToSqr(owner) > 4 * 4;
        }

        @Override
        public void start() {
            repath = 0;
        }

        @Override
        public void stop() {
            owner = null;
            navigation.stop();
        }

        @Override
        public void tick() {
            getLookControl().setLookAt(owner, 10.0f, getMaxHeadXRot());
            if (--repath > 0) {
                return;
            }
            repath = adjustedTickDelay(10);
            if (distanceToSqr(owner) > 28 * 28 && owner.onGround()) {
                teleportNear(owner);
            } else {
                navigation.moveTo(owner, 1.3);
            }
        }

        private void teleportNear(Player p) {
            for (int i = 0; i < 12; i++) {
                int dx = random.nextInt(9) - 4, dz = random.nextInt(9) - 4;
                if (Math.abs(dx) < 2 && Math.abs(dz) < 2) {
                    continue;
                }
                BlockPos at = p.blockPosition().offset(dx, 0, dz);
                AABB box = getDimensions(getPose()).makeBoundingBox(at.getX() + 0.5, at.getY(), at.getZ() + 0.5);
                if (level().getBlockState(at.below()).isFaceSturdy(level(), at.below(), net.minecraft.core.Direction.UP)
                        && level().noCollision(HarvesterEntity.this, box) && !level().containsAnyLiquid(box)) {
                    moveTo(at.getX() + 0.5, at.getY(), at.getZ() + 0.5, getYRot(), getXRot());
                    navigation.stop();
                    return;
                }
            }
        }
    }

    /**
     * Left to harvest: walks to the nearest ripe crop within {@link #WORK_RADIUS} of home, stops with its head over it and
     * chomps (crops everything ripe under the head, replants it, stashes the harvest).
     */
    class HarvestGoal extends Goal {
        @Nullable
        private BlockPos target;
        private int cooldown, ticks, chomp, repaths;

        HarvestGoal() {
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            if (!free() || isBaby() || getOrder() != Order.HARVEST || home == null || --cooldown > 0) {
                return false;
            }
            cooldown = adjustedTickDelay(30);
            target = findRipe();
            return target != null;
        }

        @Override
        public boolean canContinueToUse() {
            return target != null && free() && getOrder() == Order.HARVEST && ticks < 600 && (chomp > 0 || HarvesterCrops.isRipe(level(), target));
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void start() {
            ticks = 0;
            chomp = 0;
            repaths = 0;
            setEating(false);
            approach();
        }

        @Override
        public void stop() {
            target = null;
            chomp = 0;
            navigation.stop();
            cooldown = 0;
        }

        private void approach() {
            Vec3 t = Vec3.atBottomCenterOf(target);
            Vec3 from = position().subtract(t);
            double d = from.horizontalDistance();
            Vec3 dir = d < 1e-3 ? forward().scale(-1) : new Vec3(from.x / d, 0, from.z / d);
            Vec3 stand = t.add(dir.scale(HEAD_REACH * bodyScale()));   // where its body goes so the head is over the crop
            navigation.moveTo(stand.x, t.y, stand.z, 1.0);
        }

        @Override
        public void tick() {
            ticks++;
            Vec3 t = Vec3.atBottomCenterOf(target);
            if (chomp > 0) {
                getLookControl().setLookAt(t.x, t.y, t.z, 20f, 20f);
                if (--chomp == CHOMP_TICKS - CHOMP_BITE) {
                    chompAhead();
                }
                if (chomp == 0) {
                    target = null;   // done: look for the next
                }
                return;
            }
            Vec3 h = headPoint();
            double hx = t.x - h.x, hz = t.z - h.z;
            if (hx * hx + hz * hz <= 1.0 && Math.abs(t.y - getY()) < 1.6) {
                navigation.stop();
                faceTowards(t);
                chomp = CHOMP_TICKS;
                level().broadcastEntityEvent(HarvesterEntity.this, EV_CHOMP);
                playSound(WWSounds.HARVESTER_CHOMP, 1.0f, getVoicePitch());
                return;
            }
            double bx = t.x - getX(), bz = t.z - getZ();
            if (bx * bx + bz * bz < (HEAD_REACH + 1.2) * (HEAD_REACH + 1.2)) {
                faceTowards(t);   // close: turn the head onto it
            }
            if (navigation.isDone()) {
                if (++repaths > 6) {
                    target = null;
                    return;
                }
                approach();
            }
        }

        private void faceTowards(Vec3 t) {
            float yaw = (float) (Mth.atan2(t.z - getZ(), t.x - getX()) * Mth.RAD_TO_DEG) - 90f;
            float r = Mth.approachDegrees(getYRot(), yaw, 12f);
            setYRot(r);
            setYBodyRot(r);
            setYHeadRot(r);
        }

        @Nullable
        private BlockPos findRipe() {
            BlockPos best = null;
            double bestD = Double.MAX_VALUE;
            for (BlockPos p : BlockPos.betweenClosed(home.offset(-WORK_RADIUS, -WORK_HEIGHT, -WORK_RADIUS),
                    home.offset(WORK_RADIUS, WORK_HEIGHT, WORK_RADIUS))) {
                if (!HarvesterCrops.isRipe(level(), p)) {
                    continue;
                }
                double d = distanceToSqr(Vec3.atBottomCenterOf(p));
                if (d < bestD) {
                    bestD = d;
                    best = p.immutable();
                }
            }
            return best;
        }
    }

    /** Wanders: near home when left to harvest, never while sitting. */
    class StrollGoal extends WaterAvoidingRandomStrollGoal {
        StrollGoal() {
            super(HarvesterEntity.this, 0.7);
        }

        @Override
        public boolean canUse() {
            return !isSitting() && !isVehicle() && super.canUse();
        }

        @Nullable
        @Override
        protected Vec3 getPosition() {
            if (!isTamed() || getOrder() != Order.HARVEST || home == null) {
                return super.getPosition();
            }
            Vec3 h = Vec3.atBottomCenterOf(home);
            if (distanceToSqr(h) > 8 * 8) {
                return DefaultRandomPos.getPosTowards(HarvesterEntity.this, 8, 4, h, Mth.HALF_PI);
            }
            Vec3 p = super.getPosition();
            return p != null && p.distanceToSqr(h) <= 8 * 8 ? p : null;
        }
    }
}
