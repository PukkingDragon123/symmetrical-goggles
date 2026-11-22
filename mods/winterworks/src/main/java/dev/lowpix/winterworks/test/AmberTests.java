package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.amber.AmberBlock;
import dev.lowpix.winterworks.amber.AmberFeature;
import dev.lowpix.winterworks.amber.AmberInclusionBlockEntity;
import dev.lowpix.winterworks.amber.AmberwoodFeature;
import dev.lowpix.winterworks.amber.AmberwoodLogBlock;
import dev.lowpix.winterworks.amber.MosquitoEntity;
import dev.lowpix.winterworks.amber.SnifferTaming;
import dev.lowpix.winterworks.amber.TamedSniffer;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.world.Archaeology;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.animal.Pig;
import net.minecraft.world.entity.animal.sniffer.Sniffer;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.projectile.ThrownPotion;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.entity.BrushableBlockEntity;
import net.minecraft.world.level.storage.loot.BuiltInLootTables;
import net.minecraft.world.level.storage.loot.LootParams;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.parameters.LootContextParamSets;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.Vec3;
import dev.lowpix.winterworks.amber.AmberwoodBloomBlock;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.BoneMealItem;
import net.minecraft.world.item.component.BlockItemStateProperties;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.RecipeType;
import net.minecraft.world.item.enchantment.Enchantments;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.phys.BlockHitResult;

/** GameTests for the amber part of the Amber Age update (docs/AMBER_UPDATE.md). ./gradlew runGametest */
public class AmberTests implements FabricGameTest {

    private static void floor(GameTestHelper h, int size) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static int count(GameTestHelper h, net.minecraft.world.item.Item item, BlockPos at) {
        return h.getEntities(EntityType.ITEM, at, 3.0).stream().filter(e -> e.getItem().is(item)).mapToInt(e -> e.getItem().getCount()).sum();
    }

    private static ServerPlayer survivalPlayer(GameTestHelper h) {
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        return p;
    }

    private static MosquitoEntity mosquito(GameTestHelper h, BlockPos at, MosquitoEntity.State state) {
        MosquitoEntity m = h.spawn(WWEntities.MOSQUITO, at);
        m.setState(state);
        m.calmDown(400);   // no hunting the other tests' mobs
        return m;
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void mosquitoAmberReleasesAMosquito(GameTestHelper h) {
        floor(h, 8);
        BlockPos at = new BlockPos(3, 2, 3);
        h.setBlock(at, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, AmberBlock.Inclusion.MOSQUITO));
        survivalPlayer(h).gameMode.destroyBlock(h.absolutePos(at));   // bare hands: no Silk Touch
        h.assertBlockNotPresent(WWBlocks.AMBER_BLOCK, at);
        h.succeedWhen(() -> {
            h.assertEntityPresent(WWEntities.MOSQUITO, at, 2.0);
            int shards = count(h, WWItems.AMBER_SHARD, at);
            h.assertTrue(shards >= 2 && shards <= 4, "amber without Silk Touch shatters into 2-4 shards, got " + shards);
            h.assertTrue(count(h, WWItems.AMBER_BLOCK, at) == 0, "and doesn't drop itself");
            h.getEntities(WWEntities.MOSQUITO, at, 3.0).forEach(m -> m.discard());
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void bottleOnABloodMosquitoGivesBlood(GameTestHelper h) {
        MosquitoEntity m = mosquito(h, new BlockPos(3, 2, 3), MosquitoEntity.State.BLOOD);
        ServerPlayer p = survivalPlayer(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GLASS_BOTTLE));
        h.assertTrue(m.interact(p, InteractionHand.MAIN_HAND).consumesAction(), "the bottle should be used on the mosquito");
        ItemStack held = p.getItemInHand(InteractionHand.MAIN_HAND);
        PotionContents pc = held.get(DataComponents.POTION_CONTENTS);
        h.assertTrue(held.is(Items.POTION) && pc != null && pc.is(WWEffects.BLOOD_POTION), "expected a Potion of Blood, got " + held);
        h.assertTrue(pc.getColor() == AmberFeature.BLOOD_COLOR, "the Potion of Blood should be dark red");
        h.assertTrue(m.isEmptyBelly(), "the mosquito should be empty after bottling, it is " + m.state());
        m.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void amberMosquitoGivenBloodSpitsAmber(GameTestHelper h) {
        floor(h, 8);
        BlockPos at = new BlockPos(3, 2, 3);
        MosquitoEntity m = mosquito(h, at, MosquitoEntity.State.AMBER);
        ServerPlayer p = survivalPlayer(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, AmberFeature.bloodPotion(Items.POTION));
        m.interact(p, InteractionHand.MAIN_HAND);
        h.assertTrue(m.isEmptyBelly(), "the mosquito should have spat its amber, it is " + m.state());
        h.assertTrue(p.getItemInHand(InteractionHand.MAIN_HAND).is(Items.GLASS_BOTTLE), "the potion should leave an empty bottle");
        h.succeedWhen(() -> {
            h.assertItemEntityPresent(WWItems.AMBER_SHARD, at, 3.0);
            m.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 120)
    public void splashedBloodMakesAmberMosquitoesSpit(GameTestHelper h) {
        floor(h, 8);
        MosquitoEntity m = mosquito(h, new BlockPos(1, 3, 1), MosquitoEntity.State.AMBER);
        m.setNoAi(true);
        ThrownPotion potion = new ThrownPotion(h.getLevel(), 0, 0, 0);
        potion.setItem(AmberFeature.bloodPotion(Items.SPLASH_POTION));
        Vec3 from = h.absoluteVec(new Vec3(5.5, 2.5, 5.5));
        potion.setPos(from.x, from.y, from.z);
        potion.setDeltaMovement(0, -0.5, 0);
        h.getLevel().addFreshEntity(potion);
        h.succeedWhen(() -> {
            h.assertBlockPresent(WWBlocks.BLOOD_STAIN, new BlockPos(5, 1, 5));
            h.assertTrue(m.isEmptyBelly(), "the splash should make the amber mosquito spit");
            h.assertItemEntityPresent(WWItems.AMBER_SHARD, new BlockPos(1, 3, 1), 3.0);
            m.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 200)
    public void mosquitoIgnoresAZombieButHuntsAPig(GameTestHelper h) {
        floor(h, 8);
        MosquitoEntity m = h.spawn(WWEntities.MOSQUITO, new BlockPos(1, 3, 1));
        Zombie zombie = h.spawn(EntityType.ZOMBIE, new BlockPos(2, 1, 2));   // closer than the pig
        zombie.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.LEATHER_HELMET));   // no burning in the sun
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(6, 1, 6));
        h.assertFalse(m.canHunt(zombie), "undead have no blood to drink");
        h.assertTrue(m.canHunt(pig), "a pig is food");
        h.onEachTick(() -> {
            if (m.getTarget() == zombie) {
                h.fail("the mosquito targeted the zombie");
            }
        });
        h.succeedWhen(() -> {
            h.assertTrue(m.getTarget() == pig, "the mosquito should target the pig, target=" + m.getTarget());
            m.discard();
            zombie.discard();
            pig.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void immunityBlocksNewEffects(GameTestHelper h) {
        Pig pig = h.spawn(EntityType.PIG, new BlockPos(3, 1, 3));
        h.assertTrue(pig.addEffect(new MobEffectInstance(WWEffects.IMMUNITY, 600)), "immunity itself should apply");
        h.assertFalse(pig.addEffect(new MobEffectInstance(MobEffects.MOVEMENT_SPEED, 600)), "immunity should block speed");
        h.assertFalse(pig.hasEffect(MobEffects.MOVEMENT_SPEED), "no speed while immune");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void pitcherPodsTameASniffer(GameTestHelper h) {
        floor(h, 8);
        Sniffer s = h.spawn(EntityType.SNIFFER, new BlockPos(3, 1, 3));
        @SuppressWarnings("removal")
        ServerPlayer p = h.makeMockServerPlayerInLevel();   // creative: the pods are not used up
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.PITCHER_POD));
        TamedSniffer t = (TamedSniffer) s;
        for (int i = 0; i < 60 && !t.ww$isTamed(); i++) {
            s.interact(p, InteractionHand.MAIN_HAND);
        }
        h.assertTrue(p.getUUID().equals(t.ww$owner()), "pitcher pods should tame the sniffer (1 in 3)");
        CompoundTag tag = s.saveWithoutId(new CompoundTag());
        h.assertTrue(tag.hasUUID(SnifferTaming.OWNER_TAG), "the owner should be saved");
        s.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 800)
    public void tamedSnifferExcavatesASuspiciousBlock(GameTestHelper h) {
        floor(h, 8);   // the test area is walled in with barriers at 8
        BlockPos dig = new BlockPos(6, 0, 3);
        h.setBlock(dig.below(), Blocks.STONE);
        h.setBlock(dig, Blocks.SUSPICIOUS_SAND);
        BrushableBlockEntity be = h.getBlockEntity(dig);
        be.setLootTable(Archaeology.CAVE_AMBER, 42L);
        Sniffer s = h.spawn(EntityType.SNIFFER, new BlockPos(1, 1, 3));
        TamedSniffer t = (TamedSniffer) s;
        SnifferTaming.tame(s, t, UUID.randomUUID());   // an owner who is not around: no following
        t.ww$job().cooldown = 0;
        h.succeedWhen(() -> {
            h.assertBlockPresent(Blocks.SAND, dig);
            h.assertTrue(h.getEntities(EntityType.ITEM, dig.above(), 4.0).size() > 0, "the excavation should drop the loot");
            s.discard();
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void brushingAnAmberFossilGivesAnAmberwoodBloom(GameTestHelper h) {
        floor(h, 8);
        BlockPos at = new BlockPos(3, 1, 3);
        h.setBlock(at, WWBlocks.AMBER_FOSSIL);
        BrushableBlockEntity be = h.getBlockEntity(at);
        be.setLootTable(Archaeology.DEAD_CAVE, 7L);
        ServerPlayer p = survivalPlayer(h);
        long t = h.getLevel().getGameTime();
        for (int i = 0; i < 10; i++) {
            be.brush(t + i * 10L, p, Direction.UP);
        }
        h.assertBlockPresent(Blocks.GRAVEL, at);
        h.succeedWhen(() -> h.assertItemEntityPresent(WWItems.AMBERWOOD_BLOOM, at.above(), 2.0));
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void snifferDiggingFindsAmberAgeLoot(GameTestHelper h) {
        Sniffer s = h.spawn(EntityType.SNIFFER, new BlockPos(3, 1, 3));
        ServerLevel level = h.getLevel();
        LootTable table = level.getServer().reloadableRegistries().getLootTable(BuiltInLootTables.SNIFFER_DIGGING);
        boolean amber = false, vanilla = false;
        for (int i = 0; i < 300; i++) {
            LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, s.position())
                    .withParameter(LootContextParams.THIS_ENTITY, s).create(LootContextParamSets.GIFT);
            for (ItemStack st : table.getRandomItems(params)) {
                amber |= st.is(WWItems.AMBERWOOD_BLOOM) || st.is(WWItems.AMBER_SHARD) || st.is(Items.BONE);
                vanilla |= st.is(Items.TORCHFLOWER_SEEDS) || st.is(Items.PITCHER_POD);
            }
        }
        h.assertTrue(amber && vanilla, "sniffer digging should give amber age finds and still the vanilla seeds");
        s.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberwoodBloomGrowsACactusWithBlooms(GameTestHelper h) {
        BlockPos at = new BlockPos(3, 1, 3);
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.SAND);
            }
        }
        h.setBlock(at, WWBlocks.AMBERWOOD_BLOOM);   // the bloom is the sapling
        ServerLevel level = h.getLevel();
        BlockPos abs = h.absolutePos(at);
        SaplingBlock sapling = (SaplingBlock) WWBlocks.AMBERWOOD_BLOOM;
        for (int i = 0; i < 20 && level.getBlockState(abs).is(sapling) && level.getBlockState(abs.below()).is(Blocks.SAND); i++) {
            sapling.advanceTree(level, abs, level.getBlockState(abs), level.random);
        }
        int height = 0;
        while (h.getBlockState(at.above(height)).is(WWBlocks.AMBERWOOD_LOG)) {
            height++;
        }
        h.assertTrue(height >= AmberwoodFeature.MIN_HEIGHT && height <= AmberwoodFeature.MAX_HEIGHT, "trunk of 5-8 logs, got " + height);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_BLOOM, at.above(height));
        // every column ends in a bloom, every bloom sits on a log, and nothing grows leaves
        int blooms = 0;
        for (BlockPos p : BlockPos.betweenClosed(at.offset(-1, 0, -1), at.offset(1, AmberwoodFeature.MAX_HEIGHT, 1))) {
            BlockState s = h.getBlockState(p);
            if (s.is(WWBlocks.AMBERWOOD_LOG) && s.getValue(RotatedPillarBlock.AXIS) == Direction.Axis.Y) {
                BlockState up = h.getBlockState(p.above());
                h.assertTrue(up.is(WWBlocks.AMBERWOOD_LOG) || up.is(WWBlocks.AMBERWOOD_BLOOM), "an upright column should end in a bloom at " + p);
            }
            if (s.is(WWBlocks.AMBERWOOD_BLOOM)) {
                blooms++;
                h.assertTrue(h.getBlockState(p.below()).is(WWBlocks.AMBERWOOD_LOG), "a bloom should sit on a log at " + p);
            }
        }
        h.assertTrue(blooms >= 1 + AmberwoodFeature.MIN_ARMS && blooms <= 1 + AmberwoodFeature.MAX_ARMS, "2-4 blooms, got " + blooms);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void onlyAmberWithAnInclusionHasABlockEntity(GameTestHelper h) {
        BlockPos fly = new BlockPos(2, 1, 2), seed = new BlockPos(4, 1, 2), plain = new BlockPos(6, 1, 2);
        h.setBlock(fly, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, AmberBlock.Inclusion.MOSQUITO));
        h.setBlock(seed, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, AmberBlock.Inclusion.SEED));
        h.setBlock(plain, WWBlocks.AMBER_BLOCK);
        ServerLevel level = h.getLevel();
        h.assertTrue(level.getBlockEntity(h.absolutePos(fly)) instanceof AmberInclusionBlockEntity, "mosquito amber needs a block entity");
        h.assertTrue(level.getBlockEntity(h.absolutePos(seed)) instanceof AmberInclusionBlockEntity, "seed amber needs a block entity");
        h.assertTrue(level.getBlockEntity(h.absolutePos(plain)) == null, "plain amber has no block entity");
        h.setBlock(fly, WWBlocks.AMBER_BLOCK);   // turned plain in place: the block entity goes
        h.assertTrue(level.getBlockEntity(h.absolutePos(fly)) == null, "amber turned plain should lose its block entity");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 400)
    public void mosquitoDrinksResin(GameTestHelper h) {
        floor(h, 8);
        BlockPos log = new BlockPos(4, 1, 4);
        for (int y = 1; y <= 3; y++) {
            h.setBlock(log.atY(y), WWBlocks.AMBERWOOD_LOG.defaultBlockState().setValue(AmberwoodLogBlock.RESIN, y == 2));
        }
        MosquitoEntity m = h.spawn(WWEntities.MOSQUITO, new BlockPos(1, 2, 1));
        m.calmDown(400);
        h.succeedWhen(() -> {
            h.assertTrue(m.isAmber(), "the mosquito should drink the resin and become amber, it is " + m.state());
            h.assertTrue(!h.getBlockState(log.above()).getValue(AmberwoodLogBlock.RESIN), "the log's resin should be gone");
            m.discard();
        });
    }

    // ------------------------------------------------------------------------------------------------ 0.4 fixes: amber

    private static ItemStack silkPick(GameTestHelper h) {
        ItemStack pick = new ItemStack(Items.DIAMOND_PICKAXE);
        pick.enchant(h.getLevel().registryAccess().lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SILK_TOUCH), 1);
        return pick;
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void silkTouchKeepsAmberWholeWithItsInclusion(GameTestHelper h) {
        floor(h, 8);
        BlockPos fly = new BlockPos(2, 1, 2), plain = new BlockPos(5, 1, 5);
        h.setBlock(fly, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, AmberBlock.Inclusion.MOSQUITO));
        h.setBlock(plain, WWBlocks.AMBER_BLOCK);
        ServerPlayer p = survivalPlayer(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, silkPick(h));
        p.gameMode.destroyBlock(h.absolutePos(fly));
        p.gameMode.destroyBlock(h.absolutePos(plain));
        h.succeedWhen(() -> {
            var flyDrops = h.getEntities(EntityType.ITEM, fly, 1.5);
            h.assertTrue(flyDrops.size() == 1 && flyDrops.get(0).getItem().is(WWItems.AMBER_BLOCK), "silk touch drops the block itself");
            BlockItemStateProperties props = flyDrops.get(0).getItem().get(DataComponents.BLOCK_STATE);
            h.assertTrue(props != null && props.get(AmberBlock.INCLUSION) == AmberBlock.Inclusion.MOSQUITO,
                    "the mosquito stays sealed in the dropped block, got " + props);
            h.assertTrue(h.getEntities(WWEntities.MOSQUITO, fly, 3.0).isEmpty(), "nothing escapes a silk-touched block");
            var plainDrops = h.getEntities(EntityType.ITEM, plain, 1.5);
            h.assertTrue(plainDrops.size() == 1 && ItemStack.isSameItemSameComponents(plainDrops.get(0).getItem(),
                    new ItemStack(WWItems.AMBER_BLOCK)), "plain amber drops as a plain block that stacks with crafted ones");
            // and placing it back seals the mosquito in again
            ItemStack block = flyDrops.get(0).getItem().copy();
            BlockPos top = h.absolutePos(new BlockPos(3, 0, 3));
            p.setItemInHand(InteractionHand.MAIN_HAND, block);
            block.useOn(new UseOnContext(p, InteractionHand.MAIN_HAND, new BlockHitResult(Vec3.atCenterOf(top).add(0, 0.5, 0), Direction.UP,
                    top, false)));
            h.assertTrue(h.getBlockState(new BlockPos(3, 1, 3)).getValue(AmberBlock.INCLUSION) == AmberBlock.Inclusion.MOSQUITO,
                    "the placed block holds the mosquito");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void seedAmberShattersIntoShardsAndABloom(GameTestHelper h) {
        floor(h, 8);
        BlockPos at = new BlockPos(3, 1, 3);
        h.setBlock(at, WWBlocks.AMBER_BLOCK.defaultBlockState().setValue(AmberBlock.INCLUSION, AmberBlock.Inclusion.SEED));
        ServerPlayer p = survivalPlayer(h);
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.DIAMOND_PICKAXE));   // no Silk Touch
        p.gameMode.destroyBlock(h.absolutePos(at));
        h.succeedWhen(() -> {
            int shards = count(h, WWItems.AMBER_SHARD, at);
            h.assertTrue(shards >= 2 && shards <= 4, "2-4 amber shards, got " + shards);
            h.assertTrue(count(h, WWItems.AMBERWOOD_BLOOM, at) == 1, "the seed inclusion drops an Amberwood Bloom");
            h.assertTrue(count(h, WWItems.AMBER_BLOCK, at) == 0, "no block without Silk Touch");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void nineShardsMakeABlockAndBack(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        CraftingInput nine = CraftingInput.of(3, 3, java.util.Collections.nCopies(9, new ItemStack(WWItems.AMBER_SHARD)));
        var block = level.getRecipeManager().getRecipeFor(RecipeType.CRAFTING, nine, level);
        h.assertTrue(block.isPresent(), "9 amber shards should craft something");
        ItemStack out = block.get().value().assemble(nine, level.registryAccess());
        h.assertTrue(out.is(WWItems.AMBER_BLOCK) && out.getCount() == 1, "9 shards make 1 amber block, got " + out);
        CraftingInput one = CraftingInput.of(1, 1, java.util.List.of(new ItemStack(WWItems.AMBER_BLOCK)));
        var shards = level.getRecipeManager().getRecipeFor(RecipeType.CRAFTING, one, level);
        h.assertTrue(shards.isPresent(), "an amber block should craft back");
        ItemStack back = shards.get().value().assemble(one, level.registryAccess());
        h.assertTrue(back.is(WWItems.AMBER_SHARD) && back.getCount() == 9, "1 amber block makes 9 shards, got " + back);
        CraftingInput four = CraftingInput.of(2, 2, java.util.Collections.nCopies(4, new ItemStack(WWItems.AMBER_SHARD)));
        h.assertTrue(level.getRecipeManager().getRecipeFor(RecipeType.CRAFTING, four, level).isEmpty(), "4 shards make nothing");
        h.assertTrue(BuiltInRegistries.ITEM.getOptional(net.minecraft.resources.ResourceLocation.fromNamespaceAndPath("winterworks",
                "amber_chunk")).isEmpty(), "the amber chunk is gone");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 80)
    public void brushingAmberSandAndGravelGivesAmber(GameTestHelper h) {
        floor(h, 8);
        BlockPos sand = new BlockPos(2, 1, 3), gravel = new BlockPos(5, 1, 3);
        h.setBlock(sand, WWBlocks.AMBER_SAND);     // placed by hand: no loot table, but amber all the same
        h.setBlock(gravel, WWBlocks.AMBER_GRAVEL);
        ServerPlayer p = survivalPlayer(h);
        long t = h.getLevel().getGameTime();
        for (BlockPos at : new BlockPos[]{sand, gravel}) {
            h.assertTrue(h.getBlockEntity(at) instanceof BrushableBlockEntity, "amber sand and gravel are brushable");
            BrushableBlockEntity be = h.getBlockEntity(at);
            for (int i = 0; i < 10; i++) {
                be.brush(t + i * 10L, p, Direction.UP);
            }
        }
        h.assertBlockPresent(Blocks.SAND, sand);
        h.assertBlockPresent(Blocks.GRAVEL, gravel);
        h.succeedWhen(() -> {
            for (BlockPos at : new BlockPos[]{sand, gravel}) {
                var drops = h.getEntities(EntityType.ITEM, at.above(), 1.5);
                h.assertTrue(!drops.isEmpty() && drops.stream().allMatch(e -> e.getItem().is(WWItems.AMBER_SHARD) || e.getItem().is(WWItems.AMBER_BLOCK)),
                        "brushing amber sand/gravel gives amber at " + at);
            }
        });
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberDepositLootIsMostlyShards(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        LootTable table = level.getServer().reloadableRegistries().getLootTable(Archaeology.AMBER_DEPOSIT);
        int shards = 0, blocks = 0, sealed = 0, n = 2000;
        for (int i = 0; i < n; i++) {
            LootParams params = new LootParams.Builder(level).withParameter(LootContextParams.ORIGIN, h.absoluteVec(Vec3.ZERO))
                    .create(LootContextParamSets.ARCHAEOLOGY);
            for (ItemStack st : table.getRandomItems(params)) {
                if (st.is(WWItems.AMBER_SHARD)) {
                    shards++;
                } else if (st.is(WWItems.AMBER_BLOCK)) {
                    blocks++;
                    BlockItemStateProperties props = st.get(DataComponents.BLOCK_STATE);
                    if (props != null && props.get(AmberBlock.INCLUSION) != null && props.get(AmberBlock.INCLUSION) != AmberBlock.Inclusion.NONE) {
                        sealed++;
                    }
                } else {
                    h.fail("amber deposits hold only amber, got " + st);
                }
            }
        }
        h.assertTrue(shards > n * 0.75, "mostly shards: " + shards + "/" + n);
        h.assertTrue(blocks > n * 0.05 && blocks < n * 0.25, "sometimes a whole block: " + blocks + "/" + n);
        h.assertTrue(sealed > 0 && sealed < blocks, "now and then with something inside: " + sealed + "/" + blocks);
        h.succeed();
    }

    // ---- the Amberwood wood set

    private static void use(ServerPlayer p, ItemStack stack, BlockPos absAgainst, Direction face) {
        p.setItemInHand(InteractionHand.MAIN_HAND, stack);
        Vec3 hit = Vec3.atCenterOf(absAgainst).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        p.gameMode.useItemOn(p, p.serverLevel(), stack, InteractionHand.MAIN_HAND, new BlockHitResult(hit, face, absAgainst, false));
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void axesStripAmberwood(GameTestHelper h) {
        floor(h, 8);
        BlockPos log = new BlockPos(2, 1, 2), wood = new BlockPos(5, 1, 2);
        h.setBlock(log, WWBlocks.AMBERWOOD_LOG.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.X)
                .setValue(AmberwoodLogBlock.RESIN, true));
        h.setBlock(wood, WWBlocks.AMBERWOOD_WOOD.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Z));
        ServerPlayer p = survivalPlayer(h);
        use(p, new ItemStack(Items.IRON_AXE), h.absolutePos(log), Direction.UP);
        use(p, new ItemStack(Items.IRON_AXE), h.absolutePos(wood), Direction.UP);
        BlockState sLog = h.getBlockState(log), sWood = h.getBlockState(wood);
        h.assertTrue(sLog.is(WWBlocks.STRIPPED_AMBERWOOD_LOG) && sLog.getValue(RotatedPillarBlock.AXIS) == Direction.Axis.X,
                "an axe strips an amberwood log (keeping its axis), got " + sLog);
        h.assertTrue(sWood.is(WWBlocks.STRIPPED_AMBERWOOD_WOOD) && sWood.getValue(RotatedPillarBlock.AXIS) == Direction.Axis.Z,
                "an axe strips amberwood wood, got " + sWood);
        // vanilla wood behaviour: it burns, it's fuel, it's in the vanilla tags
        var fire = net.fabricmc.fabric.api.registry.FlammableBlockRegistry.getDefaultInstance();
        h.assertTrue(fire.get(WWBlocks.AMBERWOOD_PLANKS).getBurnChance() > 0 && fire.get(WWBlocks.AMBERWOOD_LOG).getBurnChance() > 0,
                "amberwood burns");
        var fuel = net.minecraft.world.level.block.entity.AbstractFurnaceBlockEntity.getFuel();
        h.assertTrue(fuel.getOrDefault(WWItems.AMBERWOOD_PLANKS, 0) == 300 && fuel.getOrDefault(WWItems.STRIPPED_AMBERWOOD_LOG, 0) == 300
                && fuel.getOrDefault(WWItems.AMBERWOOD_BOAT, 0) == 1200 && fuel.getOrDefault(WWItems.AMBERWOOD_HANGING_SIGN, 0) == 800,
                "amberwood is furnace fuel like oak");
        h.assertTrue(new ItemStack(WWItems.AMBERWOOD_SLAB).is(net.minecraft.tags.ItemTags.WOODEN_SLABS)
                && WWBlocks.AMBERWOOD_LOG.defaultBlockState().is(net.minecraft.tags.BlockTags.LOGS)
                && WWBlocks.AMBERWOOD_DOOR.defaultBlockState().is(net.minecraft.tags.BlockTags.WOODEN_DOORS), "amberwood is in the wood tags");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberwoodDoorsTrapdoorsAndGatesOpen(GameTestHelper h) {
        floor(h, 8);
        ServerPlayer p = survivalPlayer(h);
        p.moveTo(h.absoluteVec(new Vec3(3.5, 1, 6.5)));
        BlockPos door = new BlockPos(1, 1, 2), trap = new BlockPos(4, 1, 2), gate = new BlockPos(6, 1, 2);
        use(p, new ItemStack(WWItems.AMBERWOOD_DOOR), h.absolutePos(door.below()), Direction.UP);
        use(p, new ItemStack(WWItems.AMBERWOOD_TRAPDOOR), h.absolutePos(trap.below()), Direction.UP);
        use(p, new ItemStack(WWItems.AMBERWOOD_FENCE_GATE), h.absolutePos(gate.below()), Direction.UP);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_DOOR, door);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_DOOR, door.above());
        h.assertTrue(h.getBlockState(door.above()).getValue(net.minecraft.world.level.block.DoorBlock.HALF)
                == net.minecraft.world.level.block.state.properties.DoubleBlockHalf.UPPER, "the door has its top half");
        for (BlockPos at : new BlockPos[]{door, trap, gate}) {
            use(p, ItemStack.EMPTY, h.absolutePos(at), Direction.SOUTH);   // a hand opens wooden ones
            h.assertTrue(h.getBlockState(at).getValue(net.minecraft.world.level.block.state.properties.BlockStateProperties.OPEN),
                    "an empty hand opens it at " + at);
        }
        // the door drops one door, the slab two when doubled
        p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        p.gameMode.destroyBlock(h.absolutePos(door));
        h.assertBlockNotPresent(WWBlocks.AMBERWOOD_DOOR, door);
        h.succeedWhen(() -> h.assertTrue(count(h, WWItems.AMBERWOOD_DOOR, door) == 1, "a broken door drops one door"));
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberwoodSignsCanBeWritten(GameTestHelper h) {
        floor(h, 8);
        ServerPlayer p = survivalPlayer(h);
        p.moveTo(h.absoluteVec(new Vec3(3.5, 1, 6.5)));
        h.setBlock(new BlockPos(1, 1, 1), Blocks.STONE);
        h.setBlock(new BlockPos(5, 3, 2), Blocks.STONE);
        BlockPos standing = new BlockPos(3, 1, 3), wall = new BlockPos(1, 1, 2), hanging = new BlockPos(5, 2, 2);
        use(p, new ItemStack(WWItems.AMBERWOOD_SIGN), h.absolutePos(standing.below()), Direction.UP);
        use(p, new ItemStack(WWItems.AMBERWOOD_SIGN), h.absolutePos(new BlockPos(1, 1, 1)), Direction.SOUTH);
        use(p, new ItemStack(WWItems.AMBERWOOD_HANGING_SIGN), h.absolutePos(hanging.above()), Direction.DOWN);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_SIGN, standing);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_WALL_SIGN, wall);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_HANGING_SIGN, hanging);
        for (BlockPos at : new BlockPos[]{standing, wall, hanging}) {
            h.assertTrue(h.getBlockEntity(at) instanceof SignBlockEntity, "an amberwood sign has a sign block entity at " + at);
            SignBlockEntity sign = h.getBlockEntity(at);
            h.assertTrue(p.getUUID().equals(sign.getPlayerWhoMayEdit()), "placing it opens the sign editor for the player");
            sign.updateSignText(p, true, java.util.List.of(net.minecraft.server.network.FilteredText.passThrough("Amber"),
                    net.minecraft.server.network.FilteredText.passThrough("Age"), net.minecraft.server.network.FilteredText.EMPTY,
                    net.minecraft.server.network.FilteredText.EMPTY));
            h.assertTrue(sign.getFrontText().getMessage(0, false).getString().equals("Amber"), "the text was written");
        }
        h.assertTrue(h.getBlockEntity(hanging) instanceof net.minecraft.world.level.block.entity.HangingSignBlockEntity,
                "the hanging sign is a hanging sign");
        h.assertTrue(((net.minecraft.world.level.block.SignBlock) WWBlocks.AMBERWOOD_SIGN).type() == dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE
                && dev.lowpix.winterworks.amber.Amberwood.WOOD_TYPE.name().equals("winterworks:amberwood"), "WoodType winterworks:amberwood");
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 60)
    public void amberwoodBoatsDropThemselves(GameTestHelper h) {
        floor(h, 8);
        ServerPlayer p = survivalPlayer(h);
        var boat = h.spawn(WWEntities.AMBERWOOD_BOAT, new BlockPos(2, 1, 3));
        var chest = h.spawn(WWEntities.AMBERWOOD_CHEST_BOAT, new BlockPos(5, 1, 3));
        h.assertTrue(boat.getPickResult().is(WWItems.AMBERWOOD_BOAT) && chest.getPickResult().is(WWItems.AMBERWOOD_CHEST_BOAT),
                "they pick as Amberwood boats");
        boat.hurt(boat.damageSources().playerAttack(p), 100f);
        chest.hurt(chest.damageSources().playerAttack(p), 100f);
        h.succeedWhen(() -> {
            h.assertTrue(count(h, WWItems.AMBERWOOD_BOAT, new BlockPos(2, 1, 3)) == 1, "a broken Amberwood boat drops itself");
            h.assertTrue(count(h, WWItems.AMBERWOOD_CHEST_BOAT, new BlockPos(5, 1, 3)) == 1, "and the chest boat too");
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void bonemealedBloomGrowsAnAmberwood(GameTestHelper h) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.RED_SAND);
            }
        }
        h.setBlock(new BlockPos(6, 0, 6), Blocks.STONE);
        ServerPlayer p = survivalPlayer(h);
        BlockPos at = new BlockPos(3, 1, 3);
        use(p, new ItemStack(WWItems.AMBERWOOD_BLOOM), h.absolutePos(at.below()), Direction.UP);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_BLOOM, at);
        use(p, new ItemStack(WWItems.AMBERWOOD_BLOOM), h.absolutePos(new BlockPos(6, 0, 6)), Direction.UP);
        h.assertBlockNotPresent(WWBlocks.AMBERWOOD_BLOOM, new BlockPos(6, 1, 6));   // not on stone
        ServerLevel level = h.getLevel();
        for (int i = 0; i < 60 && h.getBlockState(at).is(WWBlocks.AMBERWOOD_BLOOM); i++) {
            BoneMealItem.growCrop(new ItemStack(Items.BONE_MEAL), level, h.absolutePos(at));
        }
        h.assertBlockPresent(WWBlocks.AMBERWOOD_LOG, at);
        int height = 0;
        while (h.getBlockState(at.above(height)).is(WWBlocks.AMBERWOOD_LOG)) {
            height++;
        }
        BlockPos crown = at.above(height);
        h.assertBlockPresent(WWBlocks.AMBERWOOD_BLOOM, crown);
        // the crown is a flower: bone meal does nothing to it, and it never grows a tree on the tree
        h.assertFalse(((AmberwoodBloomBlock) WWBlocks.AMBERWOOD_BLOOM).isValidBonemealTarget(level, h.absolutePos(crown),
                h.getBlockState(crown)), "a crown bloom is not a sapling");
        h.assertTrue(WWBlocks.AMBERWOOD_BLOOM.defaultBlockState().is(net.minecraft.tags.BlockTags.SAPLINGS), "the bloom is a sapling");
        h.succeed();
    }
}
