package dev.lowpix.winterworks.express;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.Minecart;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.item.DyeItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * A rideable Winter Express cart with its own model. Right-click with a dye to paint its trim, with wool to change its
 * seat cushion. Couple carts with a chain (see Couplings).
 */
public class WWCart extends Minecart {
    private static final EntityDataAccessor<Integer> TRIM = SynchedEntityData.defineId(WWCart.class, EntityDataSerializers.INT);
    private static final EntityDataAccessor<Integer> SEAT = SynchedEntityData.defineId(WWCart.class, EntityDataSerializers.INT);

    public final CartKind kind;
    // client animation
    public final AnimationState runState = new AnimationState();
    public final AnimationState idleState = new AnimationState();
    public final AnimationState actionState = new AnimationState();
    /** Which way the model faces along the track (client): +1 or -1, flipped when the cart travels the other way. */
    public float renderFacing = 1f;
    public double clientSpeed;

    public WWCart(EntityType<?> type, Level level, CartKind kind) {
        super(type, level);
        this.kind = kind;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(TRIM, -1);
        builder.define(SEAT, -1);
    }

    public int trimColor() {
        return entityData.get(TRIM);
    }

    public int seatColor() {
        return entityData.get(SEAT);
    }

    @Override
    public InteractionResult interact(Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (stack.getItem() instanceof DyeItem dye) {
            if (!level().isClientSide) {
                entityData.set(TRIM, dye.getDyeColor().getId());
                playSound(SoundEvents.DYE_USE, 1.0f, 1.0f);
                stack.consume(1, player);
            }
            return InteractionResult.sidedSuccess(level().isClientSide);
        }
        if (stack.is(ItemTags.WOOL)) {
            DyeColor c = woolColor(stack.getItem());
            if (c != null) {
                if (!level().isClientSide) {
                    entityData.set(SEAT, c.getId());
                    playSound(SoundEvents.WOOL_PLACE, 1.0f, 1.0f);
                    stack.consume(1, player);
                }
                return InteractionResult.sidedSuccess(level().isClientSide);
            }
        }
        return super.interact(player, hand);
    }

    static DyeColor woolColor(Item item) {
        String path = BuiltInRegistries.ITEM.getKey(item).getPath();
        for (DyeColor c : DyeColor.values()) {
            if (path.equals(c.getName() + "_wool")) {
                return c;
            }
        }
        return null;
    }

    @Override
    protected Item getDropItem() {
        return kind.item.get();
    }

    @Override
    public ItemStack getPickResult() {
        return new ItemStack(kind.item.get());
    }

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        return getPassengers().size() < kind.seats;
    }

    @Override
    protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dims, float scale) {
        Vec3 base = super.getPassengerAttachmentPoint(passenger, dims, scale);
        if (kind.seats > 1) {
            int i = getPassengers().indexOf(passenger);
            double off = i == 0 ? 0.3 : -0.35;
            float yaw = getYRot() * ((float) Math.PI / 180f);
            return base.add(Math.cos(yaw) * off, 0, Math.sin(yaw) * off);
        }
        return base;
    }

    @Override
    protected double getMaxSpeed() {
        return super.getMaxSpeed() * ((CartSpeed) this).ww$speedFactor();
    }

    @Override
    public void tick() {
        double px = getX(), pz = getZ();
        super.tick();
        if (level().isClientSide) {
            double dx = getX() - px, dz = getZ() - pz, dy = CoasterLoop.looping(this) ? getDeltaMovement().y : 0;
            clientSpeed = clientSpeed * 0.6 + Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.4;
            boolean moving = clientSpeed > 0.01;
            runState.animateWhen(moving, tickCount);
            idleState.animateWhen(!moving, tickCount);
        }
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putInt("Trim", trimColor());
        tag.putInt("Seat", seatColor());
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        if (tag.contains("Trim")) {
            entityData.set(TRIM, tag.getInt("Trim"));
        }
        if (tag.contains("Seat")) {
            entityData.set(SEAT, tag.getInt("Seat"));
        }
    }
}
