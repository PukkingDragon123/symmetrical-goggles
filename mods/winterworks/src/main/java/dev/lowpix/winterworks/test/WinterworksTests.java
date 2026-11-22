package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.express.Couplings;
import dev.lowpix.winterworks.express.LocomotiveCart;
import dev.lowpix.winterworks.icebreaker.IcebreakerEntity;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.vehicle.AbstractMinecart;
import net.minecraft.world.entity.vehicle.MinecartChest;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.PoweredRailBlock;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.phys.Vec3;

/** Fabric GameTests: ./gradlew runGametest (headless server, no EULA needed, exits with the results). */
public class WinterworksTests implements FabricGameTest {

    private static void floor(GameTestHelper h, int y, int len) {
        for (int x = 0; x < len; x++) {
            for (int z = 0; z < 3; z++) {
                h.setBlock(new BlockPos(x, y, z), Blocks.STONE);
            }
        }
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void heavyShearsTakeTheHorn(GameTestHelper h) {
        floor(h, 0, 8);
        IcebreakerEntity seal = h.spawn(WWEntities.ICEBREAKER, new BlockPos(3, 1, 1));
        seal.setAge(0);
        seal.setHornStage(IcebreakerEntity.MAX_HORN);
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.HEAVY_SHEARS));
        seal.mobInteract(player, InteractionHand.MAIN_HAND);
        h.assertTrue(seal.hornStage() == 0, "horn should be gone after shearing, stage=" + seal.hornStage());
        h.succeedWhen(() -> h.assertEntityPresent(EntityType.ITEM, new BlockPos(3, 1, 1), 4.0));
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 600)
    public void hornRegrowsFastInPowderSnow(GameTestHelper h) {
        floor(h, 0, 8);
        BlockPos at = new BlockPos(3, 1, 1);
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = -1; dz <= 1; dz++) {
                h.setBlock(at.offset(dx, 0, dz), Blocks.POWDER_SNOW);
                h.setBlock(at.offset(dx, 1, dz), Blocks.POWDER_SNOW);
            }
        }
        IcebreakerEntity seal = h.spawn(WWEntities.ICEBREAKER, at);
        seal.setAge(0);
        seal.setHornStage(0);
        h.succeedWhen(() -> {
            h.assertTrue(seal.hornStage() >= 1, "horn still not growing, stage=" + seal.hornStage());
            h.assertTrue(seal.getHealth() == seal.getMaxHealth(), "powder snow should not hurt an Icebreaker");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 300)
    public void droppedFishCalmsIt(GameTestHelper h) {
        floor(h, 0, 8);
        IcebreakerEntity seal = h.spawn(WWEntities.ICEBREAKER, new BlockPos(2, 1, 1));
        seal.setAge(0);
        ItemEntity fish = h.spawnItem(Items.COD, 4.5f, 1.5f, 1.5f);
        h.succeedWhen(() -> {
            h.assertTrue(seal.isCalm(), "the Icebreaker should eat the fish and calm down");
            h.assertTrue(!fish.isAlive() || fish.getItem().isEmpty(), "the fish should be eaten");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void hornBrewsIntoRamming(GameTestHelper h) {
        ItemStack awkward = PotionContents.createItemStack(Items.POTION, Potions.AWKWARD);
        ItemStack out = h.getLevel().potionBrewing().mix(new ItemStack(WWItems.ICEBREAKER_HORN), awkward);
        PotionContents pc = out.get(net.minecraft.core.component.DataComponents.POTION_CONTENTS);
        h.assertTrue(pc != null && pc.is(WWEffects.RAMMING_POTION), "awkward + horn should brew Ramming, got " + pc);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void heavyShearsCutConnectedLeaves(GameTestHelper h) {
        BlockPos base = new BlockPos(2, 2, 1);
        var leaf = Blocks.OAK_LEAVES.defaultBlockState().setValue(LeavesBlock.PERSISTENT, true);
        BlockPos[] canopy = {base, base.east(), base.east().east(), base.above(), base.above().east()};
        for (BlockPos p : canopy) {
            h.setBlock(p, leaf);
        }
        ServerPlayer player = h.makeMockServerPlayerInLevel();
        player.setGameMode(net.minecraft.world.level.GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.HEAVY_SHEARS));
        player.gameMode.destroyBlock(h.absolutePos(base));
        for (BlockPos p : canopy) {
            h.assertBlockNotPresent(Blocks.OAK_LEAVES, p);
        }
        h.succeedWhen(() -> h.assertItemEntityCountIs(Items.OAK_LEAVES, base, 4.0, canopy.length));
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 120)
    public void boosterRailBreaksTheSpeedLimit(GameTestHelper h) {
        floor(h, 0, 8);
        for (int x = 0; x < 8; x++) {
            h.setBlock(new BlockPos(x, 1, 1), WWBlocks.BOOSTER_RAIL.defaultBlockState()
                    .setValue(PoweredRailBlock.SHAPE, RailShape.EAST_WEST).setValue(PoweredRailBlock.POWERED, true));
            h.setBlock(new BlockPos(x, 0, 1), Blocks.REDSTONE_BLOCK);
        }
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(0.5, 1.1, 1.5));
        cart.setDeltaMovement(0.1, 0, 0);
        double[] best = {0};
        h.onEachTick(() -> best[0] = Math.max(best[0], cart.getDeltaMovement().horizontalDistance()));
        h.runAfterDelay(30, () -> {
            h.assertTrue(best[0] > 0.45, "cart should beat the vanilla 0.4 b/t limit on boosters, best=" + best[0]);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void locomotivePullsACoupledChestCart(GameTestHelper h) {
        floor(h, 0, 8);
        for (int x = 0; x < 8; x++) {
            h.setBlock(new BlockPos(x, 1, 1), WWBlocks.COASTER_RAIL.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.RailBlock.SHAPE, RailShape.EAST_WEST));
        }
        LocomotiveCart loco = (LocomotiveCart) h.spawn(WWEntities.LOCOMOTIVE, new Vec3(2.5, 1.1, 1.5));
        MinecartChest chest = h.spawn(EntityType.CHEST_MINECART, new Vec3(0.9, 1.1, 1.5));
        chest.setItem(0, new ItemStack(Items.COAL, 4));
        h.assertTrue(Couplings.couple(loco, chest), "coupling failed");
        loco.setHeading(new Vec3(1, 0, 0));
        loco.setThrottle(1);
        double startChest = chest.getX();
        h.runAfterDelay(25, () -> {
            h.assertTrue(chest.getX() > startChest + 0.4, "the chest cart should be pulled along, moved " + (chest.getX() - startChest));
            h.assertTrue(chest.getItem(0).getCount() < 4, "the locomotive should stoke coal from the chest cart");
            h.assertTrue(Couplings.trainLength(loco) == 2, "train length should be 2");
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 120)
    public void dropRailOpensAndTheCartFalls(GameTestHelper h) {
        floor(h, 0, 8);
        for (int x = 0; x < 8; x++) {
            h.setBlock(new BlockPos(x, 1, 1), WWBlocks.COASTER_RAIL.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.RailBlock.SHAPE, RailShape.EAST_WEST));
        }
        BlockPos drop = new BlockPos(3, 5, 1);   // hanging in the air, no support
        h.setBlock(drop, WWBlocks.DROP_RAIL.defaultBlockState().setValue(PoweredRailBlock.SHAPE, RailShape.EAST_WEST));
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(3.5, 5.1, 1.5));
        double startY = cart.getY();
        h.runAfterDelay(10, () -> h.setBlock(drop.north(), Blocks.REDSTONE_BLOCK));
        h.succeedWhen(() -> {
            h.assertBlockPresent(WWBlocks.DROP_RAIL_OPEN, drop);
            h.assertTrue(cart.getY() < startY - 3, "the cart should have dropped, y=" + cart.getY());
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 160)
    public void trapRailHoldsThenLaunches(GameTestHelper h) {
        floor(h, 0, 8);
        for (int x = 0; x < 8; x++) {
            h.setBlock(new BlockPos(x, 1, 1), WWBlocks.COASTER_RAIL.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.RailBlock.SHAPE, RailShape.EAST_WEST));
        }
        BlockPos trap = new BlockPos(3, 1, 1);
        h.setBlock(trap.below(), Blocks.REDSTONE_BLOCK);
        h.setBlock(trap, WWBlocks.TRAP_RAIL.defaultBlockState().setValue(PoweredRailBlock.SHAPE, RailShape.EAST_WEST));
        AbstractMinecart cart = h.spawn(EntityType.MINECART, new Vec3(1.5, 1.1, 1.5));
        cart.setDeltaMovement(0.3, 0, 0);
        double[] peak = {0};
        boolean[] released = {false};
        h.onEachTick(() -> {
            if (released[0]) {
                peak[0] = Math.max(peak[0], cart.getDeltaMovement().horizontalDistance());
            }
        });
        h.runAfterDelay(40, () -> {
            Vec3 at = h.relativeVec(cart.position());
            h.assertTrue(Math.abs(at.x - 3.5) < 0.2 && cart.getDeltaMovement().horizontalDistance() < 0.01,
                    "the trap should hold the cart at x=3.5, it is at " + at.x);
            h.setBlock(trap.below(), Blocks.STONE);   // cut the power
            released[0] = true;
        });
        h.runAfterDelay(52, () -> {
            h.assertTrue(peak[0] > 0.4, "released carts launch, peak speed " + peak[0]);
            h.succeed();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void alphaIsBiggerAndTougher(GameTestHelper h) {
        floor(h, 0, 8);
        IcebreakerEntity seal = h.spawn(WWEntities.ICEBREAKER, new BlockPos(3, 1, 3));
        seal.setAge(0);
        float baseHealth = seal.getMaxHealth();
        seal.setAlpha(true);
        h.assertTrue(seal.isAlpha() && seal.getScale() > 1.25f, "an Alpha is 30% bigger, scale " + seal.getScale());
        h.assertTrue(seal.getMaxHealth() >= baseHealth + 59, "an Alpha has 60 more health, " + seal.getMaxHealth());
        h.assertTrue(seal.hornStage() == IcebreakerEntity.MAX_HORN, "an Alpha carries a full horn");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void recipesLoaded(GameTestHelper h) {
        var rm = h.getLevel().getRecipeManager();
        for (String id : new String[]{"winterworks:snowball_launcher", "winterworks:heavy_shears", "winterworks:locomotive",
                "winterworks:snow_globe", "winterworks:coaster_rail", "winterworks:booster_rail", "winterworks:lift_rail"}) {
            h.assertTrue(rm.byKey(ResourceLocation.parse(id)).isPresent(), "missing recipe " + id);
        }
        var rail = rm.byKey(ResourceLocation.withDefaultNamespace("rail")).orElseThrow();
        int n = rail.value().getResultItem(h.getLevel().registryAccess()).getCount();
        h.assertTrue(n == 32, "rails should be cheaper (32 per craft), got " + n);
        h.succeed();
    }
}
