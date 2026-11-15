package dev.lowpix.winterworks.express;

import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseRailBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;

/** Places a Winter Express cart on a rail, facing the way the player looks. */
public class WWCartItem extends Item {
    private final Supplier<? extends EntityType<? extends AbstractMinecart>> type;

    public WWCartItem(Supplier<? extends EntityType<? extends AbstractMinecart>> type, Properties props) {
        super(props);
        this.type = type;
    }

    @Override
    public InteractionResult useOn(UseOnContext ctx) {
        Level level = ctx.getLevel();
        BlockPos pos = ctx.getClickedPos();
        BlockState state = level.getBlockState(pos);
        if (!state.is(BlockTags.RAILS)) {
            return InteractionResult.FAIL;
        }
        ItemStack stack = ctx.getItemInHand();
        if (level instanceof ServerLevel sl) {
            RailShape shape = state.getBlock() instanceof BaseRailBlock rail ? state.getValue(rail.getShapeProperty()) : RailShape.NORTH_SOUTH;
            double lift = shape.isAscending() ? 0.5 : 0.0;
            AbstractMinecart cart = type.get().create(sl);
            if (cart == null) {
                return InteractionResult.FAIL;
            }
            cart.moveTo(pos.getX() + 0.5, pos.getY() + 0.0625 + lift, pos.getZ() + 0.5, 0, 0);
            if (cart instanceof LocomotiveCart loco && ctx.getPlayer() != null) {
                Vec3 look = ctx.getPlayer().getLookAngle();
                boolean ns = shape == RailShape.NORTH_SOUTH || shape == RailShape.ASCENDING_NORTH || shape == RailShape.ASCENDING_SOUTH;
                boolean ew = shape == RailShape.EAST_WEST || shape == RailShape.ASCENDING_EAST || shape == RailShape.ASCENDING_WEST;
                Vec3 dir = ns ? new Vec3(0, 0, Math.signum(look.z == 0 ? 1 : look.z))
                        : ew ? new Vec3(Math.signum(look.x == 0 ? 1 : look.x), 0, 0)
                        : new Vec3(look.x, 0, look.z).normalize();
                loco.setHeading(dir);
            }
            if (stack.has(net.minecraft.core.component.DataComponents.CUSTOM_NAME)) {
                cart.setCustomName(stack.getHoverName());
            }
            sl.addFreshEntity(cart);
            sl.gameEvent(GameEvent.ENTITY_PLACE, pos, GameEvent.Context.of(ctx.getPlayer(), sl.getBlockState(pos.below())));
        }
        stack.shrink(1);
        return InteractionResult.sidedSuccess(level.isClientSide);
    }
}
