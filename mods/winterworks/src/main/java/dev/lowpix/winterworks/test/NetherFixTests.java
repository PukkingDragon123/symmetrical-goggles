package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.nether.GoldenPiglin;
import dev.lowpix.winterworks.nether.HexBolt;
import dev.lowpix.winterworks.nether.HexFortress;
import dev.lowpix.winterworks.nether.HexFortressPiece;
import dev.lowpix.winterworks.nether.HoglinJockeys;
import dev.lowpix.winterworks.nether.NetherFeature;
import dev.lowpix.winterworks.nether.PiglinGreed;
import dev.lowpix.winterworks.nether.PiglinWitch;
import dev.lowpix.winterworks.nether.WitchCrew;
import dev.lowpix.winterworks.nether.WitheredCommander;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import dev.lowpix.winterworks.soulbull.SoulBull;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.hoglin.Hoglin;
import net.minecraft.world.entity.monster.piglin.AbstractPiglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.entity.monster.piglin.PiglinBrute;
import net.minecraft.world.entity.projectile.ThrownPotion;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.structures.NetherFortressPieces;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the 0.4 Nether fixes (docs/FIXES_0_4.md "The Hex Fortress, reworked", "Piglins, hoglins and the
 * Withered Commander"): the reworked fortress, the witch's crew, her fight and spells, brutes and the elixirs, the
 * gilding, hoglin jockeys and the Withered Commander. Tests that need room run in batches of their own; each removes
 * its mobs (and mock players) at the end. ./gradlew runGametest
 */
public class NetherFixTests implements FabricGameTest {
    private static final String BATCH = "winterworks_nether_fixes";

    /** A floor of stone (x, z from -r to 8 + r round the test), air above it. */
    private static void floor(GameTestHelper h, int r) {
        for (int x = -r; x <= 8 + r; x++) {
            for (int z = -r; z <= 8 + r; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
                for (int y = 1; y <= 5; y++) {
                    h.setBlock(new BlockPos(x, y, z), Blocks.AIR);
                }
            }
        }
    }

    private static void cleanup(GameTestHelper h, double r, ServerPlayer... players) {
        for (Entity e : h.getLevel().getEntities((Entity) null, h.getBounds().inflate(r), e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        for (ServerPlayer p : players) {
            h.getLevel().getServer().getPlayerList().remove(p);
        }
    }

    private static ServerPlayer survivor(GameTestHelper h, double x, double z, boolean gold) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();
        p.setGameMode(GameType.SURVIVAL);
        p.moveTo(h.absoluteVec(new Vec3(x, 1, z)));
        if (gold) {
            p.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.GOLDEN_HELMET));
            p.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.GOLDEN_BOOTS));
        }
        return p;
    }

    private static <T extends net.minecraft.world.entity.Mob> T crew(GameTestHelper h, EntityType<T> type, int x, int z, int role) {
        T m = h.spawn(type, new BlockPos(x, 1, z));
        WitchCrew.enlist(m, h.absolutePos(new BlockPos(4, 1, 4)), Rotation.NONE, role);
        if (m instanceof AbstractPiglin p) {
            p.setImmuneToZombification(true);
        }
        return m;
    }

    /** Force-loads the chunks under `box` (unforce: false), so the entities built there tick and can be found. */
    private static void force(ServerLevel level, BoundingBox box, boolean on) {
        for (int cx = (box.minX() >> 4) - 1; cx <= (box.maxX() >> 4) + 1; cx++) {
            for (int cz = (box.minZ() >> 4) - 1; cz <= (box.maxZ() >> 4) + 1; cz++) {
                level.setChunkForced(cx, cz, on);
            }
        }
    }

    /** Are the chunks under `box` loaded and entity-ticking (forced chunks take a while on a busy server)? */
    private static boolean entityTicking(ServerLevel level, BoundingBox box) {
        for (int cx = box.minX() >> 4; cx <= box.maxX() >> 4; cx++) {
            for (int cz = box.minZ() >> 4; cz <= box.maxZ() >> 4; cz++) {
                if (!level.areEntitiesLoaded(ChunkPos.asLong(cx, cz)) || !level.isPositionEntityTicking(new BlockPos(cx << 4, 64, cz << 4))) {
                    return false;
                }
            }
        }
        return true;
    }

    /** A mob to do the attacking (mock players count as creative, and creative players never start fights). */
    private static net.minecraft.world.entity.monster.Zombie attacker(GameTestHelper h, int x, int z) {
        net.minecraft.world.entity.monster.Zombie z0 = h.spawn(EntityType.ZOMBIE, new BlockPos(x, 1, z));
        z0.setNoAi(true);
        return z0;
    }

    private static int items(GameTestHelper h, Item item, double radius) {
        AABB box = new AABB(h.absolutePos(new BlockPos(4, 1, 4))).inflate(radius);
        int n = 0;
        for (ItemEntity it : h.getLevel().getEntitiesOfClass(ItemEntity.class, box, it -> it.isAlive() && it.getItem().is(item))) {
            n += it.getItem().getCount();
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ the Hex Fortress

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 800)
    public void hexFortressHasItsRoomsCrewPensAndPortal(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = h.absolutePos(BlockPos.ZERO).offset(1600, 40, -1600);
        Rotation rot = Rotation.COUNTERCLOCKWISE_90;
        BoundingBox area = BoundingBox.fromCorners(origin.offset(-24, -42, -24), origin.offset(24, 21, 24));
        force(level, area, true);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(entityTicking(level, area), "the fortress's chunks load"))
                .thenExecute(() -> checkFortress(h, level, origin, rot, area));
    }

    private void checkFortress(GameTestHelper h, ServerLevel level, BlockPos origin, Rotation rot, BoundingBox area) {
        BoundingBox box = HexFortress.build(level, origin, rot, 424242L);
        h.assertTrue(box.getXSpan() >= 36 && box.getXSpan() <= 48 && box.getZSpan() >= 36 && box.getZSpan() <= 48,
                "about 40 x 40, " + box.getXSpan() + " x " + box.getZSpan());
        int portal = 0, tanks = 0, bars = 0, skulls = 0, nylium = 0, soulSand = 0, blackstone = 0, gilded = 0, wart = 0, stairs = 0;
        boolean experimentsLoot = false;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int x = box.minX(); x <= box.maxX(); x++) {
            for (int z = box.minZ(); z <= box.maxZ(); z++) {
                for (int y = origin.getY() - 2; y <= box.maxY(); y++) {
                    Block b = level.getBlockState(p.set(x, y, z)).getBlock();
                    if (b == Blocks.NETHER_PORTAL) {
                        portal++;
                    } else if (b == WWBlocks.SOUL_TANK) {
                        tanks++;
                    } else if (b == Blocks.IRON_BARS) {
                        bars++;
                    } else if (b == WWBlocks.SOUL_BULL_SKULL) {
                        skulls++;
                    } else if (b == Blocks.CRIMSON_NYLIUM) {
                        nylium++;
                    } else if (b == Blocks.SOUL_SAND) {
                        soulSand++;
                    } else if (b == Blocks.POLISHED_BLACKSTONE_BRICKS || b == Blocks.BLACKSTONE) {
                        blackstone++;
                    } else if (b == Blocks.GILDED_BLACKSTONE) {
                        gilded++;
                    } else if (b == Blocks.NETHER_WART) {
                        wart++;
                    } else if (b == Blocks.NETHER_BRICK_STAIRS) {
                        stairs++;
                    } else if (b == Blocks.CHEST && level.getBlockEntity(p) instanceof ChestBlockEntity c
                            && NetherFeature.EXPERIMENTS_CHEST.equals(c.getLootTable())) {
                        experimentsLoot = true;
                    }
                }
            }
        }
        h.assertTrue(portal == 9, "a lit Nether Portal in the portal hall, " + portal);
        h.assertTrue(blackstone > 300 && gilded >= 5, "a piece of bastion: blackstone " + blackstone + ", gilded " + gilded);
        h.assertTrue(tanks == 3 && bars >= 24 && skulls == 1, "the experiments: soul tanks " + tanks + ", cage bars " + bars + ", skull " + skulls);
        h.assertTrue(experimentsLoot, "the lab's chest holds the experiments' loot");
        h.assertTrue(nylium > 40, "the hoglin pen's crimson nylium, " + nylium);
        h.assertTrue(soulSand > 40 && wart >= 50, "the bull yard's soul sand and the wart farm: " + soulSand + ", wart " + wart);
        h.assertTrue(stairs >= 17, "the stair tower's spiral, " + stairs);
        // the jobs stand on floor, in the open
        for (HexFortressPiece.Job job : HexFortressPiece.jobs(origin, rot)) {
            h.assertTrue(level.getBlockState(job.stand()).isAir() && level.getBlockState(job.stand().above()).isAir()
                    && !level.getBlockState(job.stand().below()).isAir(), "a job's spot should be clear floor: " + job.stand());
        }
        // the crew
        AABB all = AABB.of(box).inflate(2);
        List<PiglinWitch> witches = level.getEntitiesOfClass(PiglinWitch.class, all);
        h.assertTrue(witches.size() == 1, "one witch, " + witches.size());
        PiglinWitch witch = witches.get(0);
        h.assertTrue(WitchCrew.crew(witch).map(c -> c.role() == WitchCrew.WITCH).orElse(false), "the witch heads the crew");
        h.assertTrue(witch.home() != null && witch.home().closerThan(HexFortressPiece.quarters(origin, rot), 3), "she lives in her quarters");
        List<Piglin> workers = level.getEntitiesOfClass(Piglin.class, all, e -> !(e instanceof GoldenPiglin)
                && WitchCrew.crew(e).map(c -> c.role() == WitchCrew.WORKER).orElse(false));
        h.assertTrue(workers.size() >= 4, "piglins at work, " + workers.size());
        List<PiglinBrute> brutes = level.getEntitiesOfClass(PiglinBrute.class, all, e -> WitchCrew.isCrew(e)
                && WitchCrew.crew(e).map(c -> c.role() == WitchCrew.GATE_GUARD || c.role() == WitchCrew.QUARTERS_GUARD).orElse(false));
        h.assertTrue(brutes.size() >= 3, "brutes on guard at the gates and her quarters, " + brutes.size());
        h.assertTrue(brutes.stream().allMatch(b -> b.getBrain().getMemory(MemoryModuleType.HOME).isPresent()), "brutes keep to their posts");
        List<GoldenPiglin> golden = level.getEntitiesOfClass(GoldenPiglin.class, all);
        h.assertTrue(golden.size() >= 2, "Golden Piglins, caged and wandering, " + golden.size());
        h.assertTrue(level.getEntitiesOfClass(AbstractPiglin.class, all, e -> e.hasAttached(NetherFeature.GILDING)
                && e.getTags().contains(PiglinGreed.GILD_FROZEN_TAG)).size() >= 2, "caged half-turned experiments");
        List<SoulBull> bulls = level.getEntitiesOfClass(SoulBull.class, all);
        h.assertTrue(bulls.size() >= 2 && bulls.size() <= 3, "2-3 Soul Bulls in the pen, " + bulls.size());
        h.assertTrue(bulls.stream().anyMatch(SoulBull::isArmored) && bulls.stream().allMatch(b -> b.isPersistenceRequired() && !b.isTamed()),
                "hostile pen bulls, some armoured");
        h.assertTrue(bulls.stream().allMatch(b -> b.blockPosition().closerThan(HexFortressPiece.bullYard(origin, rot), 7)), "in the bull yard");
        List<Hoglin> hoglins = level.getEntitiesOfClass(Hoglin.class, all);
        h.assertTrue(hoglins.size() >= 4 && hoglins.stream().noneMatch(Hoglin::canBeHunted), "penned hoglins and a jockey, kept: " + hoglins.size());
        h.assertTrue(hoglins.stream().anyMatch(g -> HoglinJockeys.rider(g) != null), "a hoglin jockey at the gate");
        Set<BlockPos> fortresses = new HashSet<>();
        for (Entity e : level.getEntities((Entity) null, all, WitchCrew::isCrew)) {
            fortresses.add(WitchCrew.crew(e).orElseThrow().fortress());
        }
        h.assertTrue(fortresses.size() == 1, "all one crew");
        for (Entity e : level.getEntities((Entity) null, all, e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        force(level, area, false);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the witch's crew

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_crew", timeoutTicks = 200)
    public void crewDefendsTheWitch(GameTestHelper h) {
        floor(h, 2);
        PiglinWitch witch = crew(h, WWEntities.PIGLIN_WITCH, 4, 4, WitchCrew.WITCH);
        Piglin a = crew(h, EntityType.PIGLIN, 1, 1, WitchCrew.WORKER);
        Piglin b = crew(h, EntityType.PIGLIN, 7, 1, WitchCrew.WORKER);
        PiglinBrute brute = crew(h, EntityType.PIGLIN_BRUTE, 1, 7, WitchCrew.QUARTERS_GUARD);
        a.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_SWORD));
        ServerPlayer p = survivor(h, 4.5, 7.5, true);
        var foe = attacker(h, 7, 7);
        // nothing of the crew hurts one of its own; her brutes keep the gold rules
        h.assertFalse(a.hurt(witch.damageSources().indirectMagic(witch, witch), 4f), "her potions shouldn't hurt her crew");
        h.assertFalse(witch.hurt(a.damageSources().mobAttack(a), 4f), "her crew shouldn't hurt her");
        h.assertTrue(WitchCrew.bruteSpares(brute, p), "her brutes leave a player in gold be");
        h.startSequence()
                .thenIdle(20)
                .thenExecute(() -> {
                    h.assertFalse(witch.isFighting(), "she stays neutral");
                    h.assertTrue(witch.hurt(witch.damageSources().mobAttack(foe), 2f), "she can be hurt");
                })
                .thenWaitUntil(() -> {
                    for (AbstractPiglin c : List.of(a, b, brute)) {
                        h.assertTrue(c.getBrain().getMemory(MemoryModuleType.ANGRY_AT).map(id -> id.equals(foe.getUUID())).orElse(false),
                                "her crew should turn on whoever attacks her: " + c);
                    }
                    h.assertTrue(witch.isFighting() && witch.getTarget() == foe, "... and she fights");
                })
                .thenExecute(() -> cleanup(h, 6, p))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_crew2", timeoutTicks = 120)
    public void attackingHerCrewStartsTheFight(GameTestHelper h) {
        floor(h, 2);
        PiglinWitch witch = crew(h, WWEntities.PIGLIN_WITCH, 4, 4, WitchCrew.WITCH);
        Piglin a = crew(h, EntityType.PIGLIN, 1, 1, WitchCrew.WORKER);
        PiglinBrute brute = crew(h, EntityType.PIGLIN_BRUTE, 7, 7, WitchCrew.GATE_GUARD);
        var foe = attacker(h, 1, 3);
        a.hurt(a.damageSources().mobAttack(foe), 2f);
        h.succeedWhen(() -> {
            h.assertTrue(witch.isFighting() && witch.getTarget() == foe, "hurting one of her crew starts her fight");
            h.assertTrue(brute.getBrain().getMemory(MemoryModuleType.ANGRY_AT).map(id -> id.equals(foe.getUUID())).orElse(false),
                    "... and the rest of the crew joins in");
            cleanup(h, 6);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_jobs", timeoutTicks = 100)
    public void crewWorkersGoToTheirJobs(GameTestHelper h) {
        floor(h, 2);
        Piglin worker = crew(h, EntityType.PIGLIN, 4, 4, WitchCrew.WORKER);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(WitchCrew.currentJob(worker) != null, "a worker should have a job"))
                .thenExecute(() -> WitchCrew.hurryUp(worker))
                .thenWaitUntil(() -> h.assertTrue(worker.getBrain().getMemory(MemoryModuleType.WALK_TARGET)
                        .map(t -> t.getTarget().currentBlockPosition().equals(WitchCrew.currentJob(worker).stand())).orElse(false),
                        "... and set off for it"))
                .thenExecute(() -> cleanup(h, 6))
                .thenSucceed();
    }

    // ------------------------------------------------------------------------------------------ the Piglin Witch's fight

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_provoked", timeoutTicks = 200)
    public void witchFightsOnlyWhenProvoked(GameTestHelper h) {
        floor(h, 3);
        PiglinWitch witch = h.spawn(WWEntities.PIGLIN_WITCH, new BlockPos(4, 1, 4));
        h.assertTrue(witch.getMaxHealth() == (float) PiglinWitch.MAX_HEALTH, "250 health, " + witch.getMaxHealth());
        ServerPlayer p = survivor(h, 4.5, 8.5, false);
        var foe = attacker(h, 1, 1);
        h.startSequence()
                .thenIdle(60)
                .thenExecute(() -> {
                    h.assertFalse(witch.isFighting() || witch.getTarget() != null, "a player or a monster nearby doesn't start a fight");
                    h.assertTrue(witch.bossEvent().getPlayers().isEmpty(), "no boss bar out of a fight");
                    witch.hurt(witch.damageSources().mobAttack(foe), 2f);
                })
                .thenWaitUntil(() -> {
                    h.assertTrue(witch.isFighting() && witch.getTarget() == foe, "attacking her starts the fight");
                    h.assertTrue(witch.bossEvent().getPlayers().contains(p), "... with a boss bar for the players about");
                })
                .thenExecute(() -> cleanup(h, 12, p))
                .thenSucceed();
    }

    private static IronGolem dummy(GameTestHelper h, int x, int z) {
        IronGolem g = h.spawn(EntityType.IRON_GOLEM, new BlockPos(x, 1, z));
        g.setNoAi(true);
        g.getAttribute(Attributes.MAX_HEALTH).setBaseValue(1000);
        g.setHealth(1000);
        return g;
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_spells", timeoutTicks = 1200)
    public void witchSpellsFire(GameTestHelper h) {
        floor(h, 10);
        // her blink can take her a chunk over: keep the ground round the test entity-ticking, or she freezes mid-fight
        ServerLevel level = h.getLevel();
        BoundingBox area = BoundingBox.fromCorners(h.absolutePos(new BlockPos(-16, 0, -16)), h.absolutePos(new BlockPos(24, 6, 24)));
        force(level, area, true);
        PiglinWitch witch = h.spawn(WWEntities.PIGLIN_WITCH, new BlockPos(4, 1, 4));
        IronGolem target = dummy(h, 4, 10);
        float[] hp = new float[1];
        Vec3[] at = new Vec3[1];
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(entityTicking(level, area), "the ground round the test loads"))
                .thenExecute(() -> {
                    witch.provoke(target);
                    h.assertTrue(witch.isFighting() && witch.getTarget() == target, "provoked, she fights");
                })
                // hex bolts: a volley of homing soul fire
                .thenExecute(() -> {
                    hp[0] = target.getHealth();
                    witch.castNow(PiglinWitch.Spell.BOLTS);
                    h.assertTrue(witch.castSpell() == PiglinWitch.Spell.BOLTS, "the bolts' telegraph is synced");
                })
                .thenWaitUntil(() -> h.assertFalse(h.getLevel().getEntitiesOfClass(HexBolt.class, h.getBounds().inflate(20)).isEmpty(),
                        "hex bolts fly"))
                .thenWaitUntil(() -> h.assertTrue(target.getHealth() < hp[0], "a bolt should strike home"))
                .thenWaitUntil(() -> h.assertTrue(witch.castSpell() == PiglinWitch.Spell.NONE, "the volley ends"))
                // the soul ring: along the ground, out to its target
                .thenExecute(() -> {
                    hp[0] = target.getHealth();
                    target.clearFire();
                    witch.castNow(PiglinWitch.Spell.RING);
                })
                .thenWaitUntil(() -> h.assertTrue(target.getHealth() < hp[0] && target.getRemainingFireTicks() > 0,
                        "the soul ring burns what stands on the ground"))
                // the hex
                .thenExecute(() -> witch.castNow(PiglinWitch.Spell.HEX))
                .thenWaitUntil(() -> h.assertTrue(target.hasEffect(WWEffects.HEXED) && target.hasEffect(MobEffects.MOVEMENT_SLOWDOWN)
                        && target.getEffect(WWEffects.HEXED).getDuration() > PiglinWitch.HEXED_TICKS - 60, "Hexed for 30 s, and Slowness"))
                // the potion barrage
                .thenExecute(() -> witch.castNow(PiglinWitch.Spell.BARRAGE))
                .thenWaitUntil(() -> h.assertFalse(h.getLevel().getEntitiesOfClass(ThrownPotion.class, h.getBounds().inflate(20)).isEmpty(),
                        "potions fly"))
                // the summons: brutes and a Soul Bull out of the bones
                .thenWaitUntil(() -> h.assertTrue(witch.castSpell() == PiglinWitch.Spell.NONE, "the barrage ends"))
                .thenExecute(() -> witch.castNow(PiglinWitch.Spell.SUMMON))
                .thenWaitUntil(() -> {
                    AABB box = h.getBounds().inflate(20);
                    h.assertTrue(h.getLevel().getEntitiesOfClass(PiglinBrute.class, box, b -> WitchCrew.sameCrew(b, witch)).size() >= 2,
                            "two brutes answer her call");
                    h.assertTrue(h.getLevel().getEntitiesOfClass(SoulBull.class, box, b -> WitchCrew.sameCrew(b, witch)).size() == 1,
                            "a Soul Bull rises from the bones");
                })
                // the blink
                .thenExecute(() -> {
                    at[0] = witch.position();
                    witch.castNow(PiglinWitch.Spell.BLINK);
                })
                .thenWaitUntil(() -> h.assertTrue(witch.position().distanceTo(at[0]) >= 4, "she blinks away"))
                // her one healing (the summons sent off first, so nothing else is going on)
                .thenExecute(() -> {
                    for (Entity e : h.getLevel().getEntities((Entity) null, h.getBounds().inflate(20),
                            e -> e instanceof PiglinBrute || e instanceof SoulBull || e instanceof HexBolt || e instanceof ThrownPotion)) {
                        e.discard();
                    }
                    target.setHealth(target.getMaxHealth());
                })
                .thenWaitUntil(() -> h.assertTrue(witch.castSpell() == PiglinWitch.Spell.NONE && !witch.isDrinking(), "her blink is done"))
                .thenExecute(() -> {
                    witch.provoke(target);
                    h.assertTrue(witch.isFighting(), "still fighting");
                    witch.setHealth(witch.getMaxHealth() * 0.2f);
                })
                .thenWaitUntil(() -> h.assertTrue(witch.healedThisFight() && witch.getHealth() > witch.getMaxHealth() * 0.4f,
                        "she drinks her healing when low: healed " + witch.healedThisFight() + ", health " + witch.getHealth()
                                + ", casting " + witch.castSpell() + ", drinking " + witch.isDrinking() + ", fighting " + witch.isFighting()
                                + ", alive " + witch.isAlive() + ", entity-ticking " + level.isPositionEntityTicking(witch.blockPosition())))
                .thenExecute(() -> {
                    ItemStack book = witch.spellbook(h.getLevel());
                    h.assertTrue(book.is(WWItems.HEXED_BOOK) && dev.lowpix.winterworks.hex.Hexing.stored(book).size() >= 2,
                            "her spellbook is a hexed book: " + book);
                })
                .thenExecute(() -> {
                    cleanup(h, 24);
                    force(level, area, false);
                })
                .thenSucceed();
    }

    // ------------------------------------------------------------------------------------------ brutes and the elixirs

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_brute", timeoutTicks = 300)
    public void brutesTakeAndDrinkCursedElixir(GameTestHelper h) {
        floor(h, 2);
        PiglinBrute brute = h.spawn(EntityType.PIGLIN_BRUTE, new BlockPos(1, 1, 4));
        brute.setImmuneToZombification(true);
        h.spawnItem(WWItems.CURSED_ELIXIR, 6.5f, 1.2f, 4.5f);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(brute.getOffhandItem().is(WWItems.CURSED_ELIXIR), "a brute goes for Cursed Elixir and admires it"))
                .thenWaitUntil(() -> h.assertTrue(brute.getOffhandItem().isEmpty() && brute.hasAttached(NetherFeature.GILDING)
                        && brute.hasEffect(WWEffects.GOLDEN), "... then drinks it, and the gilding starts"))
                .thenExecute(() -> cleanup(h, 6))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_greed", timeoutTicks = 400)
    public void brutesFightOverAnElixirOfGreed(GameTestHelper h) {
        floor(h, 2);
        PiglinBrute brute = h.spawn(EntityType.PIGLIN_BRUTE, new BlockPos(2, 1, 4));
        Piglin piglin = h.spawn(EntityType.PIGLIN, new BlockPos(6, 1, 4));
        brute.setImmuneToZombification(true);
        piglin.setImmuneToZombification(true);
        piglin.setHealth(2f);
        h.spawnItem(WWItems.ELIXIR_OF_GREED, 4.5f, 1.2f, 6.5f);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(brute.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET).orElse(null) == piglin,
                        "the brute fights for the Elixir of Greed"))
                .thenWaitUntil(() -> h.assertFalse(piglin.isAlive(), "... to the death"))
                .thenWaitUntil(() -> {
                    h.assertTrue(items(h, WWItems.ELIXIR_OF_GREED, 8) == 0, "the brute takes it");
                    h.assertTrue(brute.hasEffect(MobEffects.DAMAGE_BOOST), "... and drinks it");
                })
                .thenExecute(() -> cleanup(h, 6))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_gild", timeoutTicks = 200)
    public void cursedElixirGildsThenConverts(GameTestHelper h) {
        floor(h, 2);
        Piglin piglin = h.spawn(EntityType.PIGLIN, new BlockPos(2, 1, 2));
        PiglinBrute brute = h.spawn(EntityType.PIGLIN_BRUTE, new BlockPos(6, 1, 6));
        brute.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_AXE));
        PiglinGreed.makeGolden(piglin);
        PiglinGreed.makeGolden(brute);
        h.assertTrue(piglin.hasAttached(NetherFeature.GILDING) && PiglinGreed.gilding(piglin) < 0.1f, "drinking starts the gilding at once");
        h.assertTrue(PiglinGreed.isGolden(piglin) && !piglin.isConverting(), "golden, and immune to zombification meanwhile");
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(PiglinGreed.gilding(piglin) >= 0.05f, "the gold spreads"))
                .thenExecute(() -> {
                    PiglinGreed.setGilding(piglin, PiglinGreed.GILD_TICKS - 20, false);
                    PiglinGreed.setGilding(brute, PiglinGreed.GILD_TICKS - 20, false);
                })
                .thenWaitUntil(() -> {
                    h.assertTrue(piglin.isRemoved() && brute.isRemoved(), "fully gilded, they turn into Golden Piglins");
                    List<GoldenPiglin> golden = h.getLevel().getEntitiesOfClass(GoldenPiglin.class, h.getBounds().inflate(8));
                    h.assertTrue(golden.size() == 2, "two Golden Piglins, " + golden.size());
                    // they wander while gilding, so tell them apart by kind, not by where they started
                    List<GoldenPiglin> brutes = golden.stream().filter(GoldenPiglin::isBrute).toList();
                    h.assertTrue(brutes.size() == 1, "one golden brute, " + brutes.size());
                    GoldenPiglin fromBrute = brutes.get(0);
                    GoldenPiglin fromPiglin = golden.stream().filter(g -> g != fromBrute).findFirst().orElseThrow();
                    h.assertTrue(fromBrute.isBrute() && fromBrute.getScale() > 1.1f && fromBrute.getMainHandItem().is(Items.GOLDEN_AXE),
                            "a brute becomes a bigger golden brute with a gilded axe");
                    h.assertFalse(fromPiglin.isBrute(), "a piglin a plain Golden Piglin");
                })
                .thenExecute(() -> cleanup(h, 8))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void goldenPiglinsAreOneInFifteen(GameTestHelper h) {
        h.assertTrue(GoldenPiglin.RARITY == 15, "1 in 15");
        RandomSource r = RandomSource.create(9L);
        int n = 0;
        for (int i = 0; i < 15000; i++) {
            n += GoldenPiglin.rollsGolden(MobSpawnType.NATURAL, r) ? 1 : 0;
        }
        h.assertTrue(n > 850 && n < 1150, "about 1000 in 15000, " + n);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ hoglin jockeys

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_jockey", timeoutTicks = 600)
    public void hoglinJockeysSpawnAndRideIntoFights(GameTestHelper h) {
        floor(h, 8);
        ServerLevel level = h.getLevel();
        // biome lookups are fuzzy (they may read the 4-block cell next door, the one below included): fill well round the ground
        BlockPos a = h.absolutePos(new BlockPos(-8, 0, -8)), b = h.absolutePos(new BlockPos(16, 12, 16));
        BlockPos lo = a.atY(Math.max(level.getMinBuildHeight(), a.getY() - 8));
        BoundingBox area = BoundingBox.fromCorners(lo, b);
        force(level, area, true);   // fillbiome does nothing while any chunk in its box is still loading
        Hoglin[] hog = new Hoglin[1];
        IronGolem[] foe = new IronGolem[1];
        double[] start = new double[1];
        float[] hp = new float[1];
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(entityTicking(level, area), "the test ground loads"))
                .thenExecute(() -> naturalJockeys(h, level, lo, b))
                // a jockey of our own, and a foe for its rider
                .thenExecute(() -> {
                    hog[0] = h.spawn(EntityType.HOGLIN, new BlockPos(1, 1, 1));
                    hog[0].setImmuneToZombification(true);   // the test world is the Overworld
                    Piglin rider = HoglinJockeys.mount(level, hog[0]);
                    level.addFreshEntity(rider);
                    rider.setImmuneToZombification(true);
                    rider.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_SWORD));
                    h.assertTrue(hog[0].getControllingPassenger() == rider, "the rider steers");
                    foe[0] = dummy(h, 7, 7);
                    start[0] = hog[0].distanceTo(foe[0]);
                    hp[0] = foe[0].getHealth();
                    WitchCrew.anger(rider, foe[0]);
                })
                .thenWaitUntil(() -> {
                    h.assertTrue(hog[0].distanceTo(foe[0]) < start[0] - 2, "the rider rides its hoglin into the fight");
                    Piglin rider = HoglinJockeys.rider(hog[0]);
                    h.assertTrue(foe[0].getHealth() < hp[0], "... and they hit: distance " + String.format("%.1f", hog[0].distanceTo(foe[0]))
                            + ", rider " + (rider == null ? "none" : rider.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET).map(t -> t == foe[0])
                            + " " + rider.getBrain().getActiveNonCoreActivity() + " " + rider.getMainHandItem()));
                })
                .thenExecute(() -> {
                    cleanup(h, 30);
                    force(level, area, false);
                })
                .thenSucceed();
    }

    /** Hoglins spawned naturally on crimson-forest ground: piglins climb on some of them. */
    private static void naturalJockeys(GameTestHelper h, ServerLevel level, BlockPos a, BlockPos b) {
        level.getServer().getCommands().performPrefixedCommand(level.getServer().createCommandSourceStack().withSuppressedOutput()
                .withLevel(level), String.format("fillbiome %d %d %d %d %d %d minecraft:crimson_forest", a.getX(), a.getY(), a.getZ(),
                b.getX(), b.getY(), b.getZ()));
        h.assertTrue(level.getBiome(h.absolutePos(new BlockPos(4, 1, 4))).is(Biomes.CRIMSON_FOREST), "the test ground is a crimson forest");
        float chance = HoglinJockeys.chance(level, h.absolutePos(new BlockPos(4, 1, 4)));
        h.assertTrue(chance == HoglinJockeys.CRIMSON_CHANCE, "the crimson forest's jockey chance, " + chance);
        int jockeys = 0, adults = 0;
        for (int i = 0; i < 160; i++) {   // ~130 adults at 15%: none at all would be a 1-in-a-billion run
            BlockPos at = h.absolutePos(new BlockPos(1 + i % 7, 1, 1 + (i / 7) % 7));
            Hoglin hog = EntityType.HOGLIN.spawn(level, at, MobSpawnType.NATURAL);
            if (hog == null) {
                continue;
            }
            if (!hog.isBaby() && HoglinJockeys.chance(level, hog.blockPosition()) > 0f) {
                adults++;
            }
            Piglin rider = HoglinJockeys.rider(hog);
            if (rider != null) {
                jockeys++;
                h.assertTrue(!hog.isBaby() && rider.isAdult() && !hog.canBeHunted(), "an adult piglin on an adult hoglin");
                rider.discard();
            }
            hog.discard();
        }
        h.assertTrue(jockeys >= 1, "piglins ride some of the hoglins spawned in a crimson forest: " + jockeys + " of " + adults + " adults");
        cleanup(h, 30);
    }

    // ------------------------------------------------------------------------------------------ the Withered Commander

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_fortress", timeoutTicks = 800)
    public void commanderSpawnsOnceInAFortress(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos far = h.absolutePos(BlockPos.ZERO).offset(-2200, 0, 2200);
        NetherFortressPieces.StartPiece start = new NetherFortressPieces.StartPiece(RandomSource.create(3L), far.getX(), far.getZ());
        BoundingBox box = start.getBoundingBox();
        AABB around = AABB.of(box).inflate(4);
        force(level, box, true);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(entityTicking(level, box), "the crossing's chunks load"))
                .thenExecute(() -> buildCrossing(level, start, box))
                .thenWaitUntil(() -> h.assertTrue(!level.getEntitiesOfClass(WitheredCommander.class, around).isEmpty(),
                        "a Withered Commander on the crossing"))
                .thenExecute(() -> checkCommander(h, level, box, around))
                .thenSucceed();
    }

    /** Places the crossing chunk by chunk, as worldgen does (twice: the commander comes once all the same). */
    private static void buildCrossing(ServerLevel level, NetherFortressPieces.StartPiece start, BoundingBox box) {
        ChunkGenerator gen = level.getChunkSource().getGenerator();
        for (int pass = 0; pass < 2; pass++) {
            for (int cx = box.minX() >> 4; cx <= box.maxX() >> 4; cx++) {
                for (int cz = box.minZ() >> 4; cz <= box.maxZ() >> 4; cz++) {
                    ChunkPos chunk = new ChunkPos(cx, cz);
                    BoundingBox chunkBox = new BoundingBox(chunk.getMinBlockX(), level.getMinBuildHeight(), chunk.getMinBlockZ(),
                            chunk.getMaxBlockX(), level.getMaxBuildHeight() - 1, chunk.getMaxBlockZ());
                    start.postProcess(level, level.structureManager(), gen, level.getRandom(), chunkBox, chunk, box.getCenter());
                }
            }
        }
    }

    private static void checkCommander(GameTestHelper h, ServerLevel level, BoundingBox box, AABB around) {
        List<WitheredCommander> found = level.getEntitiesOfClass(WitheredCommander.class, around);
        h.assertTrue(found.size() == 1, "one Withered Commander per fortress, " + found.size());
        WitheredCommander c = found.get(0);
        h.assertTrue(c.getVehicle() instanceof SoulBull bull && !bull.isArmored(), "riding an unarmoured Soul Bull");
        h.assertTrue(c.isPersistenceRequired() && c.getMainHandItem().is(WWItems.NETHERITE_SPEAR), "persistent, with its netherite spear");
        h.assertTrue(c.getMaxHealth() == 150f && c.getAttributeValue(Attributes.ARMOR) >= 12, "150 health, armour 12");
        h.assertTrue(level.getBlockState(c.getVehicle().blockPosition().below()).is(Blocks.NETHER_BRICKS), "on the bridge crossing");
        for (Entity e : level.getEntities((Entity) null, around, e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        force(level, box, false);
    }

    private static WitheredCommander mountedCommander(GameTestHelper h) {
        SoulBull bull = SoulBull.createPenBull(h.getLevel(), h.absolutePos(new BlockPos(4, 1, 4)).getX() + 0.5,
                h.absolutePos(new BlockPos(4, 1, 4)).getY(), h.absolutePos(new BlockPos(4, 1, 4)).getZ() + 0.5, 0f, false);
        h.getLevel().addFreshEntity(bull);
        WitheredCommander c = h.spawn(WWEntities.WITHERED_COMMANDER, new BlockPos(4, 1, 4));
        c.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(WWItems.NETHERITE_SPEAR));
        c.startRiding(bull, true);
        return c;
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_foot", timeoutTicks = 100)
    public void commanderFightsOnFootWhenItsBullDies(GameTestHelper h) {
        floor(h, 4);
        WitheredCommander c = mountedCommander(h);
        SoulBull bull = (SoulBull) c.getVehicle();
        double speed = c.getAttributeValue(Attributes.MOVEMENT_SPEED);
        h.startSequence()
                .thenIdle(5)
                .thenExecute(() -> {
                    h.assertTrue(c.isPassenger() && !c.isOnFoot(), "mounted");
                    bull.kill();
                })
                .thenWaitUntil(() -> {
                    h.assertTrue(!c.isPassenger() && c.isOnFoot(), "its bull dead, it fights on on foot");
                    h.assertTrue(c.getAttributeValue(Attributes.MOVEMENT_SPEED) > speed * 1.2, "faster on foot");
                    h.assertTrue(c.isAlive(), "still standing");
                })
                .thenExecute(() -> cleanup(h, 8))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_drops", timeoutTicks = 120)
    public void commanderDropsAncientDebrisAndXp(GameTestHelper h) {
        floor(h, 4);
        WitheredCommander c = h.spawn(WWEntities.WITHERED_COMMANDER, new BlockPos(4, 1, 4));
        ServerPlayer p = survivor(h, 4.5, 48.5, false);   // far off: it mustn't pick up the drops or the XP
        p.setInvulnerable(true);
        c.hurt(h.getLevel().damageSources().playerAttack(p), 5000f);
        h.succeedWhen(() -> {
            int debris = items(h, Items.ANCIENT_DEBRIS, 6);
            h.assertTrue(debris >= 1 && debris <= 3, "1-3 Ancient Debris, " + debris);
            h.assertTrue(items(h, WWItems.WITHER_BONE, 6) >= 2, "wither bones");
            int xp = 0;
            for (ExperienceOrb orb : h.getLevel().getEntitiesOfClass(ExperienceOrb.class, h.getBounds().inflate(6))) {
                xp += orb.getValue();
            }
            h.assertTrue(xp >= WitheredCommander.XP, "150 XP, " + xp);
            cleanup(h, 8, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH + "_lunge", timeoutTicks = 120)
    public void commanderLungeWithers(GameTestHelper h) {
        floor(h, 4);
        WitheredCommander c = h.spawn(WWEntities.WITHERED_COMMANDER, new BlockPos(4, 1, 4));
        c.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(WWItems.NETHERITE_SPEAR));
        IronGolem foe = dummy(h, 4, 7);
        float hp = foe.getHealth();
        c.setTarget(foe);
        c.lookAt(foe, 360f, 360f);
        c.startLunge(foe);
        h.succeedWhen(() -> {
            h.assertTrue(foe.getHealth() < hp, "the lunge reaches 3 blocks out");
            h.assertTrue(foe.hasEffect(MobEffects.WITHER) && foe.getEffect(MobEffects.WITHER).getAmplifier() == 1, "Wither II");
            cleanup(h, 8);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void netheriteSpearReachesFurther(GameTestHelper h) {
        ItemStack spear = new ItemStack(WWItems.NETHERITE_SPEAR);
        double[] reach = {0}, damage = {0};
        spear.getOrDefault(net.minecraft.core.component.DataComponents.ATTRIBUTE_MODIFIERS,
                net.minecraft.world.item.component.ItemAttributeModifiers.EMPTY).forEach(EquipmentSlot.MAINHAND, (attr, mod) -> {
                    if (attr.is(Attributes.ENTITY_INTERACTION_RANGE)) {
                        reach[0] += mod.amount();
                    } else if (attr.is(Attributes.ATTACK_DAMAGE)) {
                        damage[0] += mod.amount();
                    }
                });
        h.assertTrue(reach[0] >= 1.5, "the spear reaches further, +" + reach[0]);
        h.assertTrue(damage[0] >= 9, "... and hits hard, +" + damage[0]);
        h.assertTrue(spear.isDamageableItem() && spear.getMaxDamage() == 2031, "netherite durability");
        h.succeed();
    }
}
