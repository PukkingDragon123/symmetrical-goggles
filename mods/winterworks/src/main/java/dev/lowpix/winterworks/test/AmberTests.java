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

/** GameTests for the amber part of the Amber Age update (docs/AMBER_UPDATE.md). ./gradlew runGametest */
public class AmberTests implements FabricGameTest {

    private static void floor(GameTestHelper h, int size) {
        for (int x = 0; x < size; x++) {
            for (int z = 0; z < size; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
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
        survivalPlayer(h).gameMode.destroyBlock(h.absolutePos(at));
        h.assertBlockNotPresent(WWBlocks.AMBER_BLOCK, at);
        h.succeedWhen(() -> {
            h.assertEntityPresent(WWEntities.MOSQUITO, at, 2.0);
            h.assertItemEntityPresent(WWItems.AMBER_BLOCK, at, 2.0);
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
            h.assertItemEntityPresent(WWItems.AMBER_CHUNK, at, 3.0);
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
            h.assertItemEntityPresent(WWItems.AMBER_CHUNK, new BlockPos(1, 3, 1), 3.0);
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
    public void brushingAnAmberFossilGivesAnAmberwoodSeed(GameTestHelper h) {
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
        h.succeedWhen(() -> h.assertItemEntityPresent(WWItems.AMBERWOOD_SEED, at.above(), 2.0));
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
                amber |= st.is(WWItems.AMBERWOOD_SEED) || st.is(WWItems.AMBER_CHUNK) || st.is(Items.BONE);
                vanilla |= st.is(Items.TORCHFLOWER_SEEDS) || st.is(Items.PITCHER_POD);
            }
        }
        h.assertTrue(amber && vanilla, "sniffer digging should give amber age finds and still the vanilla seeds");
        s.discard();
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE)
    public void amberwoodSaplingGrowsACactusWithBlooms(GameTestHelper h) {
        BlockPos at = new BlockPos(3, 1, 3);
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.DIRT);
            }
        }
        h.setBlock(at, WWBlocks.AMBERWOOD_SAPLING);
        ServerLevel level = h.getLevel();
        BlockPos abs = h.absolutePos(at);
        SaplingBlock sapling = (SaplingBlock) WWBlocks.AMBERWOOD_SAPLING;
        for (int i = 0; i < 20 && level.getBlockState(abs).is(sapling); i++) {
            sapling.advanceTree(level, abs, level.getBlockState(abs), level.random);
        }
        int height = 0;
        while (h.getBlockState(at.above(height)).is(WWBlocks.AMBERWOOD_LOG)) {
            height++;
        }
        h.assertTrue(height >= AmberwoodFeature.MIN_HEIGHT && height <= AmberwoodFeature.MAX_HEIGHT, "trunk of 4-7 logs, got " + height);
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
            h.assertFalse(s.is(WWBlocks.AMBERWOOD_LEAVES), "an Amberwood has no leaves");
        }
        h.assertTrue(blooms >= 1 && blooms <= 1 + AmberwoodFeature.MAX_ARMS, "1-3 blooms, got " + blooms);
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
}
