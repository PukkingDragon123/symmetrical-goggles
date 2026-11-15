package dev.lowpix.winterworks.express;

import dev.lowpix.winterworks.registry.WWSounds;
import java.util.Map;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.ItemTags;
import net.minecraft.util.Mth;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity;
import net.minecraft.world.phys.Vec3;

/**
 * A steam locomotive. Burns coal: put some in it directly, or couple a chest minecart full of coal behind it and it
 * stokes itself. Sneak + right-click (empty hand) cycles Stop / Forward / Reverse. Pulling more cars makes it slower.
 */
public class LocomotiveCart extends WWCart {
    private static final EntityDataAccessor<Boolean> BURNING = SynchedEntityData.defineId(LocomotiveCart.class, EntityDataSerializers.BOOLEAN);
    private static final EntityDataAccessor<Integer> THROTTLE = SynchedEntityData.defineId(LocomotiveCart.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Float> HEADING = SynchedEntityData.defineId(LocomotiveCart.class, EntityDataSerializers.FLOAT);

    public static final byte EVENT_WHISTLE = 70;
    public static final int MAX_FUEL = 20 * 60 * 10;

    private int fuel;
    public int whistleTicks;   // client

    public LocomotiveCart(EntityType<?> type, Level level, CartKind kind) {
        super(type, level, kind);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(BURNING, false);
        builder.define(THROTTLE, 0);
        builder.define(HEADING, 0f);
    }

    public boolean isBurning() {
        return entityData.get(BURNING);
    }

    public void setThrottle(int t) {
        entityData.set(THROTTLE, t);
    }

    public void addFuel(int ticks) {
        fuel += ticks;
    }

    public int throttle() {
        return entityData.get(THROTTLE);
    }

    /** Unit vector the locomotive's nose points along (horizontal). */
    public Vec3 heading() {
        float a = entityData.get(HEADING) * Mth.DEG_TO_RAD;
        return new Vec3(-Mth.sin(a), 0, Mth.cos(a));
    }

    public void setHeading(Vec3 dir) {
        entityData.set(HEADING, (float) (Mth.atan2(-dir.x, dir.z) * Mth.RAD_TO_DEG));
    }

    @Override
    public InteractionResult interact(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(ItemTags.COALS) || stack.is(net.minecraft.world.item.Items.COAL_BLOCK)) {
            if (!level().isClientSide && fuel < MAX_FUEL - 1600) {
                fuel += burnTime(stack.getItem());
                stack.consume(1, player);
                playSound(SoundEvents.FIRECHARGE_USE, 0.6f, 1.2f);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (stack.isEmpty() && player.isShiftKeyDown()) {
            if (!level().isClientSide) {
                int t = throttle() == 0 ? 1 : throttle() == 1 ? -1 : 0;
                entityData.set(THROTTLE, t);
                player.displayClientMessage(Component.translatable("entity.winterworks.locomotive.throttle." + (t + 1)), true);
                if (t != 0) {
                    whistle();
                }
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        return super.interact(player, hand);
    }

    private static int burnTime(Item item) {
        Map<Item, Integer> fuels = AbstractFurnaceBlockEntity.getFuel();
        return fuels.getOrDefault(item, 1600);
    }

    public void whistle() {
        playSound(kind == CartKind.DRAGON_LOCOMOTIVE ? WWSounds.DRAGON_ROAR : WWSounds.LOCO_WHISTLE, 1.6f, 1.0f);
        level().broadcastEntityEvent(this, EVENT_WHISTLE);
    }

    @Override
    public void handleEntityEvent(byte id) {
        if (id == EVENT_WHISTLE) {
            actionState.start(tickCount);
            whistleTicks = 24;
            return;
        }
        super.handleEntityEvent(id);
    }

    @Override
    public void tick() {
        super.tick();
        if (level().isClientSide) {
            clientEffects();
            return;
        }
        int n = Couplings.trainLength(this);
        if (fuel < 400) {
            refuelFromTrain();
        }
        boolean drive = throttle() != 0 && fuel > 0;
        entityData.set(BURNING, fuel > 0);
        if (fuel > 0 && (drive || tickCount % 3 == 0)) {
            fuel--;
        }
        Vec3 v = getDeltaMovement();
        Vec3 hv = new Vec3(v.x, 0, v.z);
        Vec3 f = heading();
        if (hv.lengthSqr() > 4.0e-4) {   // follow the track through curves (keep the nose forward)
            Vec3 d = hv.normalize();
            if (d.dot(f) > -0.3) {
                setHeading(d);
            } else if (d.dot(f) < -0.3 && throttle() == -1) {
                setHeading(d.scale(-1));   // reversing: the nose stays at the back of the motion
            }
            f = heading();
        }
        if (drive) {
            Vec3 push = f.scale(throttle());
            double along = hv.dot(push);
            double max = 0.46 / (1.0 + 0.08 * (n - 1)) * ((CartSpeed) this).ww$speedFactor();
            double accel = 0.035 / (1.0 + 0.32 * (n - 1));
            if (along < max) {
                setDeltaMovement(v.add(push.x * accel, 0, push.z * accel));
            }
            if (tickCount % Math.max(4, 14 - (int) (hv.length() * 20)) == 0) {
                playSound(WWSounds.LOCO_CHUFF, 0.5f, 0.9f + random.nextFloat() * 0.2f);
            }
        }
    }

    private void refuelFromTrain() {
        for (AbstractMinecart car : Couplings.train(this)) {
            if (car instanceof Container box) {
                for (int i = 0; i < box.getContainerSize(); i++) {
                    ItemStack s = box.getItem(i);
                    if (s.is(ItemTags.COALS) || s.is(net.minecraft.world.item.Items.COAL_BLOCK)) {
                        fuel += burnTime(s.getItem());
                        s.shrink(1);
                        box.setChanged();
                        return;
                    }
                }
            }
        }
    }

    private void clientEffects() {
        if (whistleTicks > 0) {
            whistleTicks--;
        }
        if (!isBurning()) {
            return;
        }
        Vec3 f = heading().scale(renderFacing);
        double speed = clientSpeed;
        int every = speed > 0.05 ? 2 : 6;
        if (tickCount % every == 0) {
            Vec3 stack = position().add(f.scale(kind == CartKind.DRAGON_LOCOMOTIVE ? 0.15 : 0.35)).add(0, 1.65, 0);
            level().addParticle(whistleTicks > 0 ? ParticleTypes.CLOUD : ParticleTypes.CAMPFIRE_COSY_SMOKE,
                    stack.x, stack.y, stack.z, -f.x * speed * 0.5, 0.06 + random.nextDouble() * 0.03, -f.z * speed * 0.5);
        }
        if (speed > 0.05 && tickCount % 3 == 0) {   // steam from the cylinders
            Vec3 side = new Vec3(-f.z, 0, f.x).scale(random.nextBoolean() ? 0.45 : -0.45);
            Vec3 p = position().add(f.scale(0.4)).add(side).add(0, 0.15, 0);
            level().addParticle(ParticleTypes.POOF, p.x, p.y, p.z, side.x * 0.05, 0.02, side.z * 0.05);
        }
        if (kind == CartKind.DRAGON_LOCOMOTIVE && tickCount % 9 == 0) {
            Vec3 m = position().add(f.scale(0.75)).add(0, 0.7, 0);
            level().addParticle(ParticleTypes.SMALL_FLAME, m.x, m.y, m.z, f.x * 0.02, 0.01, f.z * 0.02);
        }
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("Fuel", fuel);
        tag.putInt("Throttle", throttle());
        tag.putFloat("Heading", entityData.get(HEADING));
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        fuel = tag.getInt("Fuel");
        entityData.set(THROTTLE, tag.getInt("Throttle"));
        entityData.set(HEADING, tag.getFloat("Heading"));
    }
}
