package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.express.BoosterRailBlock;
import dev.lowpix.winterworks.express.CoasterLoop;
import dev.lowpix.winterworks.express.CoasterLoopBlock;
import dev.lowpix.winterworks.express.Couplings;
import dev.lowpix.winterworks.express.LocomotiveCart;
import dev.lowpix.winterworks.express.LoopMotion;
import dev.lowpix.winterworks.express.SwitchRailBlock;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.DoubleTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.entity.vehicle.Minecart;
import net.minecraft.world.entity.vehicle.MinecartFurnace;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LeverBlock;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.RailBlock;
import net.minecraft.world.level.block.RedStoneWireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** GameTests for the Winter Express 0.4 fixes (docs/FIXES_0_4.md "The Winter Express" and "Rails"). */
public class ExpressTests implements FabricGameTest {
    private static final String TRACK = "winterworks:express_track";

    private static void floor(GameTestHelper h, int y, int x0, int x1, int z0, int z1) {
        for (int x = x0; x <= x1; x++) {
            for (int z = z0; z <= z1; z++) {
                h.setBlock(new BlockPos(x, y, z), Blocks.STONE);
            }
        }
    }

    private static BlockState coaster(RailShape shape) {
        return WWBlocks.COASTER_RAIL.defaultBlockState().setValue(RailBlock.SHAPE, shape);
    }

    /** A straight line of coaster rails along x at height y (floating: nothing under them). */
    private static void coasterLine(GameTestHelper h, int y, int z, int x0, int x1) {
        for (int x = x0; x <= x1; x++) {
            h.setBlock(new BlockPos(x, y, z), coaster(RailShape.EAST_WEST));
        }
    }

    private static double relX(GameTestHelper h, Entity e) {
        return h.relativeVec(e.position()).x;
    }

    // ------------------------------------------------------------------------------------------------ trains

    @GameTest(template = TRACK, timeoutTicks = 200)
    public void vanillaMinecartsCoupleAndArePulled(GameTestHelper h) {
        floor(h, 0, 0, 23, 3, 3);
        for (int x = 0; x <= 23; x++) {
            h.setBlock(new BlockPos(x, 1, 3), Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, RailShape.EAST_WEST));
        }
        LocomotiveCart loco = (LocomotiveCart) h.spawn(WWEntities.LOCOMOTIVE, new Vec3(6.5, 1.1, 3.5));
        Minecart plain = h.spawn(EntityType.MINECART, new Vec3(4.95, 1.1, 3.5));
        AbstractMinecart hopper = h.spawn(EntityType.HOPPER_MINECART, new Vec3(3.4, 1.1, 3.5));
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.CHAIN, 4));
        // the coupling interaction: chain on the front cart, then on the one behind
        for (AbstractMinecart[] pair : new AbstractMinecart[][]{{loco, plain}, {plain, hopper}}) {
            UseEntityCallback.EVENT.invoker().interact(player, h.getLevel(), InteractionHand.MAIN_HAND, pair[0], null);
            UseEntityCallback.EVENT.invoker().interact(player, h.getLevel(), InteractionHand.MAIN_HAND, pair[1], null);
        }
        h.assertTrue(Couplings.trainLength(loco) == 3, "a locomotive, a minecart and a hopper minecart should make a train of 3, got "
                + Couplings.trainLength(loco));
        // couplings are saved with the cart
        CompoundTag saved = new CompoundTag();
        h.assertTrue(plain.save(saved), "the minecart should save");
        Entity copy = EntityType.create(saved, h.getLevel()).orElseThrow();
        h.assertTrue(Couplings.link(copy).front().equals(java.util.Optional.of(loco.getUUID()))
                && Couplings.link(copy).back().equals(java.util.Optional.of(hopper.getUUID())), "a reloaded minecart keeps its couplings");
        loco.addFuel(2000);
        loco.setHeading(new Vec3(1, 0, 0));
        loco.setThrottle(1);
        double start = hopper.getX();
        h.runAfterDelay(40, () -> {
            h.assertTrue(hopper.getX() > start + 1.0, "the hopper minecart at the back should be pulled, moved " + (hopper.getX() - start));
            h.assertTrue(plain.distanceTo(loco) < 2.5 && hopper.distanceTo(plain) < 2.5, "the train should stay together");
            h.succeed();
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 200)
    public void furnaceMinecartPowersALocomotiveTrain(GameTestHelper h) {
        floor(h, 0, 0, 23, 3, 3);
        coasterLine(h, 1, 3, 0, 23);
        LocomotiveCart loco = (LocomotiveCart) h.spawn(WWEntities.LOCOMOTIVE, new Vec3(6.5, 1.1, 3.5));
        MinecartFurnace furnace = h.spawn(EntityType.FURNACE_MINECART, new Vec3(4.95, 1.1, 3.5));
        Minecart plain = h.spawn(EntityType.MINECART, new Vec3(3.4, 1.1, 3.5));
        h.assertTrue(Couplings.couple(loco, furnace) && Couplings.couple(furnace, plain), "coupling failed");
        loco.setHeading(new Vec3(1, 0, 0));
        h.assertTrue(loco.fuel() == 0 && loco.throttle() == 0, "the locomotive starts cold and stopped");
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.moveTo(h.absoluteVec(new Vec3(1.5, 1, 1.5)));   // beside the track (carts bump into players)
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COAL, 2));
        furnace.interact(player, InteractionHand.MAIN_HAND);   // stoke the furnace cart, standing behind the train
        double start = loco.getX();
        h.runAfterDelay(40, () -> {
            h.assertTrue(loco.throttle() == 1, "stoking a stopped train's furnace cart should set the locomotive going");
            h.assertTrue(loco.isBurning(), "the locomotive should be fired by the furnace cart");
            h.assertTrue(loco.fuel() == 0, "the locomotive needs no coal of its own, fuel=" + loco.fuel());
            h.assertTrue(loco.getX() > start + 2.0, "the train should run, moved " + (loco.getX() - start));
            h.assertTrue(plain.getX() > h.absoluteVec(new Vec3(3.4, 0, 0)).x + 1.5, "the minecart at the back is pulled too");
            h.succeed();
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 200)
    public void furnaceMinecartPullsATrainOnItsOwn(GameTestHelper h) {
        floor(h, 0, 0, 23, 3, 3);
        for (int x = 0; x <= 23; x++) {
            h.setBlock(new BlockPos(x, 1, 3), Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, RailShape.EAST_WEST));
        }
        MinecartFurnace furnace = h.spawn(EntityType.FURNACE_MINECART, new Vec3(6.5, 1.1, 3.5));
        Minecart a = h.spawn(EntityType.MINECART, new Vec3(4.95, 1.1, 3.5));
        AbstractMinecart b = h.spawn(EntityType.CHEST_MINECART, new Vec3(3.4, 1.1, 3.5));
        h.assertTrue(Couplings.couple(furnace, a) && Couplings.couple(a, b), "coupling failed");
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.moveTo(h.absoluteVec(new Vec3(5.5, 1, 1.5)));   // beside the track, behind the furnace cart: it pushes away, +x
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COAL, 1));
        furnace.interact(player, InteractionHand.MAIN_HAND);
        double startB = b.getX();
        h.runAfterDelay(60, () -> {
            h.assertTrue(b.getX() > startB + 3.0, "a burning furnace minecart should pull its train, the last car moved " + (b.getX() - startB));
            h.assertTrue(Couplings.trainLength(furnace) == 3, "the train should still be coupled");
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------------ coaster rails

    @GameTest(template = TRACK, timeoutTicks = 200)
    public void floatingCoasterRailsSurviveAndCarryACart(GameTestHelper h) {
        // a hanging track: flat, up a slope, flat again, round a corner, nothing under any of it
        for (int x = 1; x <= 5; x++) {
            h.setBlock(new BlockPos(x, 3, 2), coaster(RailShape.EAST_WEST));
        }
        for (int x = 6; x <= 9; x++) {
            h.setBlock(new BlockPos(x, 4, 2), coaster(RailShape.EAST_WEST));
        }
        for (int z = 3; z <= 9; z++) {
            h.setBlock(new BlockPos(9, 4, z), coaster(RailShape.NORTH_SOUTH));
        }
        h.assertTrue(h.getBlockState(new BlockPos(5, 3, 2)).getValue(RailBlock.SHAPE) == RailShape.ASCENDING_EAST,
                "the rail below the step should slope up, got " + h.getBlockState(new BlockPos(5, 3, 2)).getValue(RailBlock.SHAPE));
        h.assertTrue(h.getBlockState(new BlockPos(9, 4, 2)).getValue(RailBlock.SHAPE) == RailShape.SOUTH_WEST,
                "the rail at the turn should curve, got " + h.getBlockState(new BlockPos(9, 4, 2)).getValue(RailBlock.SHAPE));
        // placed by a player against the side of a block in mid-air, then the block taken away: it stays
        h.setBlock(new BlockPos(12, 6, 6), Blocks.STONE);
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        ItemStack stack = new ItemStack(WWItems.COASTER_RAIL, 4);
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        BlockPos side = h.absolutePos(new BlockPos(12, 6, 6));
        var hit = new BlockHitResult(Vec3.atCenterOf(side).add(0.5, 0, 0), Direction.EAST, side, false);
        var result = ((net.minecraft.world.item.BlockItem) WWItems.COASTER_RAIL).place(new BlockPlaceContext(player, InteractionHand.MAIN_HAND, stack, hit));
        h.assertTrue(result.consumesAction(), "placing a coaster rail with nothing under it should work, got " + result);
        h.setBlock(new BlockPos(12, 6, 6), Blocks.AIR);
        // neighbour updates everywhere: nothing pops off
        h.setBlock(new BlockPos(3, 2, 2), Blocks.STONE);
        h.setBlock(new BlockPos(3, 2, 2), Blocks.AIR);
        h.setBlock(new BlockPos(9, 3, 5), Blocks.STONE);
        h.setBlock(new BlockPos(9, 3, 5), Blocks.AIR);
        h.assertBlockPresent(WWBlocks.COASTER_RAIL, new BlockPos(13, 6, 6));
        h.assertBlockPresent(WWBlocks.COASTER_RAIL, new BlockPos(5, 3, 2));
        h.assertBlockPresent(WWBlocks.COASTER_RAIL, new BlockPos(9, 4, 5));
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(1.5, 3.1, 2.5));
        cart.setDeltaMovement(0.5, 0, 0);
        h.succeedWhen(() -> {
            Vec3 at = h.relativeVec(cart.position());
            h.assertTrue(at.z > 6.0 && Math.abs(at.x - 9.5) < 0.2, "the cart should ride up the slope and round the corner, it is at " + at);
            h.assertTrue(Math.abs(at.y - 4.0625) < 0.1, "the cart should be on the rails, y=" + at.y);
            h.assertBlockPresent(WWBlocks.COASTER_RAIL, new BlockPos(1, 3, 2));
        });
    }

    // ------------------------------------------------------------------------------------------------ coaster loop

    private static void loopTrack(GameTestHelper h) {
        coasterLine(h, 2, 5, 0, 23);
        h.setBlock(new BlockPos(11, 2, 5), WWBlocks.COASTER_LOOP.defaultBlockState().setValue(CoasterLoopBlock.SHAPE, RailShape.EAST_WEST));
    }

    @GameTest(template = TRACK, timeoutTicks = 200)
    public void fastCartRidesTheLoopAndComesOut(GameTestHelper h) {
        loopTrack(h);
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(8.5, 2.1, 5.5));
        Villager rider = h.spawn(EntityType.VILLAGER, new Vec3(8.5, 2.5, 5.5));
        rider.setNoAi(true);
        rider.startRiding(cart, true);
        cart.setDeltaMovement(1.0, 0, 0);
        double baseY = cart.getY();
        double[] peak = {baseY};
        boolean[] upsideDown = {false}, looped = {false};
        h.onEachTick(() -> {
            peak[0] = Math.max(peak[0], cart.getY());
            LoopMotion m = CoasterLoop.motion(cart);
            if (m != null) {
                looped[0] |= m.full;
                // at the top the cart (and the rider it carries, in its seat) hangs head-down
                if (Math.abs(m.theta - Math.PI) < 0.4 && m.up(m.theta).y < -0.9 && CoasterLoop.vehicleMotion(rider) == m
                        && rider.distanceTo(cart) < 1.0) {
                    upsideDown[0] = true;
                }
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(looped[0], "the cart should go into a full loop");
            h.assertTrue(peak[0] > baseY + 5.5, "it should reach the top of the loop, peak " + (peak[0] - baseY));
            h.assertTrue(upsideDown[0], "the rider should be carried round, upside down at the top");
            h.assertTrue(!CoasterLoop.looping(cart) && relX(h, cart) > 14, "it should come out the far side, x=" + relX(h, cart));
            h.assertTrue(cart.getDeltaMovement().x > 0.6, "it should leave in the same direction near its speed, v=" + cart.getDeltaMovement());
            h.assertTrue(Math.abs(cart.getY() - baseY) < 0.1 && rider.getVehicle() == cart, "back on the track, rider still aboard");
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 200)
    public void slowCartFallsBackOutOfTheLoop(GameTestHelper h) {
        loopTrack(h);
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(9.5, 2.1, 5.5));
        cart.setDeltaMovement(0.45, 0, 0);
        double baseY = cart.getY();
        double[] peak = {baseY};
        boolean[] entered = {false};
        h.onEachTick(() -> {
            peak[0] = Math.max(peak[0], cart.getY());
            entered[0] |= CoasterLoop.looping(cart);
        });
        h.succeedWhen(() -> {
            h.assertTrue(entered[0], "the cart should roll into the loop");
            h.assertTrue(peak[0] > baseY + 0.5 && peak[0] < baseY + 4.0, "it should climb part of the way only, peak " + (peak[0] - baseY));
            h.assertTrue(!CoasterLoop.looping(cart) && relX(h, cart) < 10.5, "it should fall back out the way it came, x=" + relX(h, cart));
            h.assertTrue(cart.getDeltaMovement().x < -0.1, "rolling back, v=" + cart.getDeltaMovement());
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 240)
    public void aCoupledTrainLoopsCarAfterCar(GameTestHelper h) {
        loopTrack(h);
        AbstractMinecart[] cars = {h.spawn(EntityType.MINECART, new Vec3(8.5, 2.1, 5.5)), h.spawn(EntityType.MINECART, new Vec3(6.95, 2.1, 5.5)),
                h.spawn(EntityType.CHEST_MINECART, new Vec3(5.4, 2.1, 5.5))};
        h.assertTrue(Couplings.couple(cars[0], cars[1]) && Couplings.couple(cars[1], cars[2]), "coupling failed");
        double baseY = cars[0].getY();
        double[] peak = new double[3];
        for (AbstractMinecart c : cars) {
            c.setDeltaMovement(1.3, 0, 0);
        }
        h.onEachTick(() -> {
            for (int i = 0; i < 3; i++) {
                peak[i] = Math.max(peak[i], cars[i].getY() - baseY);
            }
        });
        h.succeedWhen(() -> {
            for (int i = 0; i < 3; i++) {
                h.assertTrue(peak[i] > 5.5, "car " + i + " should go all the way round, peak " + peak[i]);
                h.assertTrue(!CoasterLoop.looping(cars[i]) && relX(h, cars[i]) > 13, "car " + i + " should come out, x=" + relX(h, cars[i]));
            }
            h.assertTrue(Couplings.trainLength(cars[0]) == 3, "the train should still be coupled, length " + Couplings.trainLength(cars[0]));
        });
    }

    // ------------------------------------------------------------------------------------------------ booster

    @GameTest(template = TRACK, timeoutTicks = 100)
    public void boosterRailOnlyRunsOnARedstoneBlock(GameTestHelper h) {
        floor(h, 0, 0, 23, 0, 11);
        BlockState booster = WWBlocks.BOOSTER_RAIL.defaultBlockState().setValue(PoweredRailBlock.SHAPE, RailShape.NORTH_SOUTH);
        BlockPos lever = new BlockPos(1, 1, 2), torch = new BlockPos(4, 1, 2), dust = new BlockPos(7, 1, 2), under = new BlockPos(10, 1, 2),
                beside = new BlockPos(13, 1, 2);
        for (BlockPos p : new BlockPos[]{lever, torch, dust, under, beside}) {
            h.setBlock(p, booster);
        }
        h.setBlock(lever.east(), Blocks.LEVER.defaultBlockState().setValue(LeverBlock.FACE, AttachFace.FLOOR).setValue(LeverBlock.POWERED, true));
        h.setBlock(torch.east(), Blocks.REDSTONE_TORCH);
        h.setBlock(dust.east().south().south(), Blocks.REDSTONE_BLOCK);   // dust carries its power to the rail's side
        h.setBlock(dust.east().south(), Blocks.REDSTONE_WIRE.defaultBlockState());
        h.setBlock(dust.east(), Blocks.REDSTONE_WIRE.defaultBlockState());
        h.setBlock(under.below(), Blocks.REDSTONE_BLOCK);
        h.setBlock(beside.east(), Blocks.REDSTONE_BLOCK);
        h.runAfterDelay(2, () -> {
            h.assertTrue(h.getBlockState(dust.east()).getValue(RedStoneWireBlock.POWER) > 0, "the dust should be lit");
            for (BlockPos p : new BlockPos[]{lever, torch, dust}) {
                h.assertTrue(!h.getBlockState(p).getValue(PoweredRailBlock.POWERED), "levers, torches and dust must not power a booster at " + p);
            }
            h.assertTrue(h.getBlockState(under).getValue(PoweredRailBlock.POWERED), "a redstone block under it powers it");
            h.assertTrue(h.getBlockState(beside).getValue(PoweredRailBlock.POWERED), "a redstone block touching it powers it");
            h.assertTrue(BoosterRailBlock.redstoneBlockAt(h.getLevel(), h.absolutePos(under)), "redstoneBlockAt");
            h.succeed();
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 100)
    public void boosterRailPushesThreeTimesHarder(GameTestHelper h) {
        for (int x = 0; x <= 23; x++) {
            h.setBlock(new BlockPos(x, 1, 4), Blocks.REDSTONE_BLOCK);
            h.setBlock(new BlockPos(x, 2, 4), WWBlocks.BOOSTER_RAIL.defaultBlockState().setValue(PoweredRailBlock.SHAPE, RailShape.EAST_WEST));
        }
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(1.5, 2.1, 4.5));
        h.runAfterDelay(1, () -> cart.setDeltaMovement(0.05, 0, 0));
        h.runAfterDelay(4, () -> {
            double v = cart.getDeltaMovement().horizontalDistance();
            // a vanilla powered rail adds 0.06 a tick; three ticks of 0.18 should be well past 0.4
            h.assertTrue(v > 0.4, "three ticks on powered boosters should give > 0.4 b/t, got " + v);
            h.succeed();
        });
    }

    // ------------------------------------------------------------------------------------------------ switch rail

    /** A junction on the ground: the toe line along x at z=8 from x=0, the switch at x=9 facing east with its branch
     * to the left (north, -z), the straight leg on to x=20, the branch north to z=0. */
    private static BlockPos junction(GameTestHelper h) {
        floor(h, 0, 0, 23, 0, 10);
        BlockState rail = Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, RailShape.EAST_WEST);
        for (int x = 0; x <= 20; x++) {
            if (x != 9) {
                h.setBlock(new BlockPos(x, 1, 8), rail);
            }
        }
        BlockPos sw = new BlockPos(9, 1, 8);
        h.setBlock(sw, WWBlocks.SWITCH_RAIL.defaultBlockState().setValue(SwitchRailBlock.FACING, Direction.EAST)
                .setValue(SwitchRailBlock.BRANCH, SwitchRailBlock.Branch.LEFT).setValue(SwitchRailBlock.SHAPE, RailShape.EAST_WEST));
        for (int z = 7; z >= 0; z--) {
            h.setBlock(new BlockPos(9, 1, z), Blocks.RAIL.defaultBlockState().setValue(RailBlock.SHAPE, RailShape.NORTH_SOUTH));
        }
        h.assertTrue(h.getBlockState(new BlockPos(9, 1, 7)).getValue(RailBlock.SHAPE) == RailShape.NORTH_SOUTH,
                "the branch rail should meet the switch");
        h.assertTrue(h.getBlockState(sw).getValue(SwitchRailBlock.SHAPE) == RailShape.EAST_WEST, "neighbours must not reshape the switch");
        return sw;
    }

    @GameTest(template = TRACK, timeoutTicks = 160)
    public void switchRailUnpoweredRunsStraightOn(GameTestHelper h) {
        junction(h);
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(5.5, 1.1, 8.5));
        cart.setDeltaMovement(0.45, 0, 0);
        h.succeedWhen(() -> {
            Vec3 at = h.relativeVec(cart.position());
            h.assertTrue(at.x > 12 && Math.abs(at.z - 8.5) < 0.1, "unpowered, the cart should run straight on, it is at " + at);
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 160)
    public void switchRailPoweredTakesTheBranch(GameTestHelper h) {
        BlockPos sw = junction(h);
        h.setBlock(sw.south(), Blocks.REDSTONE_BLOCK);   // beside it, away from its legs
        h.assertTrue(h.getBlockState(sw).getValue(SwitchRailBlock.POWERED), "the switch should be powered");
        h.assertTrue(h.getBlockState(sw).getValue(SwitchRailBlock.SHAPE) == RailShape.NORTH_WEST, "powered, the points are set to the branch");
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(5.5, 1.1, 8.5));
        cart.setDeltaMovement(0.45, 0, 0);
        h.succeedWhen(() -> {
            Vec3 at = h.relativeVec(cart.position());
            h.assertTrue(at.z < 6 && Math.abs(at.x - 9.5) < 0.1, "powered, the cart should take the branch, it is at " + at);
        });
    }

    @GameTest(template = TRACK, timeoutTicks = 240)
    public void aTrainFollowsItsLeaderThroughTheSwitch(GameTestHelper h) {
        BlockPos sw = junction(h);
        h.setBlock(sw.south(), Blocks.REDSTONE_BLOCK);
        AbstractMinecart[] cars = {h.spawn(EntityType.MINECART, new Vec3(7.5, 1.1, 8.5)), h.spawn(EntityType.MINECART, new Vec3(5.95, 1.1, 8.5)),
                h.spawn(EntityType.MINECART, new Vec3(4.4, 1.1, 8.5))};
        h.assertTrue(Couplings.couple(cars[0], cars[1]) && Couplings.couple(cars[1], cars[2]), "coupling failed");
        for (AbstractMinecart c : cars) {
            c.setDeltaMovement(0.4, 0, 0);
        }
        boolean[] cut = {false};
        h.onEachTick(() -> {
            if (!cut[0] && h.relativeVec(cars[0].position()).z < 7.6) {   // the leader is on the branch: cut the power
                h.setBlock(sw.south(), Blocks.STONE);
                cut[0] = true;
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(cut[0] && !h.getBlockState(sw).getValue(SwitchRailBlock.POWERED), "the power should be off by now");
            for (int i = 0; i < 3; i++) {
                Vec3 at = h.relativeVec(cars[i].position());
                h.assertTrue(at.z < 7.4 && Math.abs(at.x - 9.5) < 0.15, "car " + i + " should follow the leader onto the branch, it is at " + at);
            }
        });
    }

    // ------------------------------------------------------------------------------------------------ the trailer is gone

    @GameTest(template = EMPTY_STRUCTURE)
    public void theTrailerCartIsGone(GameTestHelper h) {
        ResourceLocation id = ResourceLocation.fromNamespaceAndPath("winterworks", "trailer_cart");
        h.assertTrue(!BuiltInRegistries.ENTITY_TYPE.containsKey(id), "the trailer cart entity should be gone");
        h.assertTrue(!BuiltInRegistries.ITEM.containsKey(id), "the trailer cart item should be gone");
        h.assertTrue(h.getLevel().getRecipeManager().byKey(id).isEmpty(), "the trailer cart recipe should be gone");
        // a trailer saved in an old world loads as a plain minecart (and nothing breaks)
        CompoundTag old = new CompoundTag();
        old.putString("id", "winterworks:trailer_cart");
        ListTag pos = new ListTag();
        Vec3 at = h.absoluteVec(new Vec3(1.5, 1, 1.5));
        pos.add(DoubleTag.valueOf(at.x));
        pos.add(DoubleTag.valueOf(at.y));
        pos.add(DoubleTag.valueOf(at.z));
        old.put("Pos", pos);
        old.putInt("Trim", 3);
        Entity e = EntityType.create(old, h.getLevel()).orElse(null);
        h.assertTrue(e instanceof Minecart, "an old trailer should load as a minecart, got " + e);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void railRecipesLoaded(GameTestHelper h) {
        var rm = h.getLevel().getRecipeManager();
        var loop = rm.byKey(ResourceLocation.fromNamespaceAndPath("winterworks", "coaster_loop")).orElseThrow();
        h.assertTrue(loop.value().getResultItem(h.getLevel().registryAccess()).is(WWItems.COASTER_LOOP), "coaster loop recipe");
        var sw = rm.byKey(ResourceLocation.fromNamespaceAndPath("winterworks", "switch_rail")).orElseThrow();
        h.assertTrue(sw.value().getResultItem(h.getLevel().registryAccess()).getCount() == 2, "the switch rail recipe makes 2");
        h.succeed();
    }
}
