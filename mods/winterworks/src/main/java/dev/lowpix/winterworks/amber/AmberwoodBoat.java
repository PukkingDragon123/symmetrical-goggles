package dev.lowpix.winterworks.amber;

import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.List;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.dispenser.BlockSource;
import net.minecraft.core.dispenser.DefaultDispenseItemBehavior;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.stats.Stats;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.Boat;
import net.minecraft.world.entity.vehicle.ChestBoat;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Amberwood boats. Boat.Type is a closed enum in 1.21.1, so instead of extending it these are their own entity types
 * (winterworks:amberwood_boat / amberwood_chest_boat) that are vanilla boats in every way (they keep the oak variant for
 * physics and saving) but drop and pick as Amberwood boats and break into Amberwood planks; client.amber.AmberwoodBoatRenderer
 * draws them with vanilla's boat models and the Amberwood textures.
 */
public final class AmberwoodBoat {
    private AmberwoodBoat() {}

    /** The rowing boat. */
    public static class Plain extends Boat {
        public Plain(EntityType<? extends Boat> type, Level level) {
            super(type, level);
        }

        @Override
        public Item getDropItem() {
            return WWItems.AMBERWOOD_BOAT;
        }

        /** A boat that crashes from a height drops planks: Amberwood ones, not the oak of its variant. */
        @Nullable
        @Override
        public ItemEntity spawnAtLocation(ItemLike item) {
            return super.spawnAtLocation(item.asItem() == Items.OAK_PLANKS ? WWItems.AMBERWOOD_PLANKS : item);
        }
    }

    /** The boat with a chest. */
    public static class WithChest extends ChestBoat {
        public WithChest(EntityType<? extends Boat> type, Level level) {
            super(type, level);
        }

        @Override
        public Item getDropItem() {
            return WWItems.AMBERWOOD_CHEST_BOAT;
        }

        @Nullable
        @Override
        public ItemEntity spawnAtLocation(ItemLike item) {
            return super.spawnAtLocation(item.asItem() == Items.OAK_PLANKS ? WWItems.AMBERWOOD_PLANKS : item);
        }
    }

    static Boat create(Level level, boolean chest, double x, double y, double z) {
        Boat b = chest ? new WithChest(WWEntities.AMBERWOOD_CHEST_BOAT, level) : new Plain(WWEntities.AMBERWOOD_BOAT, level);
        b.setPos(x, y, z);
        b.xo = x;
        b.yo = y;
        b.zo = z;
        return b;
    }

    /** The boat items: vanilla's BoatItem, placing our entity. */
    public static class BoatItem extends Item {
        private static final Predicate<Entity> ENTITY_PREDICATE = EntitySelector.NO_SPECTATORS.and(Entity::isPickable);
        private final boolean chest;

        public BoatItem(boolean chest, Properties properties) {
            super(properties);
            this.chest = chest;
        }

        @Override
        public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
            ItemStack stack = player.getItemInHand(hand);
            HitResult hit = getPlayerPOVHitResult(level, player, ClipContext.Fluid.ANY);
            if (hit.getType() == HitResult.Type.MISS) {
                return InteractionResultHolder.pass(stack);
            }
            Vec3 view = player.getViewVector(1.0f);
            List<Entity> near = level.getEntities(player, player.getBoundingBox().expandTowards(view.scale(5.0)).inflate(1.0), ENTITY_PREDICATE);
            Vec3 eye = player.getEyePosition();
            for (Entity e : near) {
                if (e.getBoundingBox().inflate(e.getPickRadius()).contains(eye)) {
                    return InteractionResultHolder.pass(stack);
                }
            }
            if (hit.getType() != HitResult.Type.BLOCK) {
                return InteractionResultHolder.pass(stack);
            }
            Vec3 at = hit.getLocation();
            Boat boat = create(level, chest, at.x, at.y, at.z);
            if (level instanceof ServerLevel sl) {
                EntityType.createDefaultStackConfig(sl, stack, player).accept(boat);
            }
            boat.setYRot(player.getYRot());
            if (!level.noCollision(boat, boat.getBoundingBox())) {
                return InteractionResultHolder.fail(stack);
            }
            if (!level.isClientSide) {
                level.addFreshEntity(boat);
                level.gameEvent(player, GameEvent.ENTITY_PLACE, at);
                stack.consume(1, player);
            }
            player.awardStat(Stats.ITEM_USED.get(this));
            return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
        }
    }

    /** Dispensers put boats on water, as vanilla's BoatDispenseItemBehavior does. */
    public static class DispenseBehavior extends DefaultDispenseItemBehavior {
        private final DefaultDispenseItemBehavior fallback = new DefaultDispenseItemBehavior();
        private final boolean chest;

        public DispenseBehavior(boolean chest) {
            this.chest = chest;
        }

        @Override
        public ItemStack execute(BlockSource source, ItemStack stack) {
            Direction dir = source.state().getValue(DispenserBlock.FACING);
            ServerLevel level = source.level();
            Vec3 c = source.center();
            double d = 0.5625 + EntityType.BOAT.getWidth() / 2.0;
            BlockPos front = source.pos().relative(dir);
            double lift;
            if (level.getFluidState(front).is(FluidTags.WATER)) {
                lift = 1.0;
            } else if (level.getBlockState(front).isAir() && level.getFluidState(front.below()).is(FluidTags.WATER)) {
                lift = 0.0;
            } else {
                return fallback.dispense(source, stack);
            }
            Boat boat = create(level, chest, c.x() + dir.getStepX() * d, c.y() + dir.getStepY() * 1.125f + lift, c.z() + dir.getStepZ() * d);
            EntityType.createDefaultStackConfig(level, stack, null).accept(boat);
            boat.setYRot(dir.toYRot());
            level.addFreshEntity(boat);
            stack.shrink(1);
            return stack;
        }

        @Override
        protected void playSound(BlockSource source) {
            source.level().levelEvent(1000, source.pos(), 0);
        }
    }
}
