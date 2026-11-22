package dev.lowpix.winterworks.test;

import dev.lowpix.winterworks.mixin.AbstractPiglinAccessor;
import dev.lowpix.winterworks.nether.GoldenPiglin;
import dev.lowpix.winterworks.nether.HexFortress;
import dev.lowpix.winterworks.nether.HexFortressPiece;
import dev.lowpix.winterworks.nether.NetherFeature;
import dev.lowpix.winterworks.nether.PiglinGreed;
import dev.lowpix.winterworks.nether.PiglinWitch;
import dev.lowpix.winterworks.registry.WWBlocks;
import dev.lowpix.winterworks.registry.WWEffects;
import dev.lowpix.winterworks.registry.WWEntities;
import dev.lowpix.winterworks.registry.WWItems;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.FabricGameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.memory.MemoryModuleType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.monster.ZombifiedPiglin;
import net.minecraft.world.entity.monster.piglin.Piglin;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.Structure;
import net.minecraft.world.level.levelgen.structure.StructureStart;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the nether part of Hexes &amp; Havoc (docs/HEXES_UPDATE.md sections 1, 6, 7 and 8). ./gradlew runGametest
 * The mob tests run in their own batch and remove their mobs (and mock players) at the end; the fortress tests build
 * far from the test grid.
 */
public class NetherTests implements FabricGameTest {
    private static final String BATCH = "winterworks_nether";

    private static void floor(GameTestHelper h) {
        for (int x = 0; x < 9; x++) {
            for (int z = 0; z < 9; z++) {
                h.setBlock(new BlockPos(x, 0, z), Blocks.STONE);
            }
        }
    }

    private static ServerPlayer player(GameTestHelper h, double x, double z, ItemStack inHand) {
        ServerPlayer p = h.makeMockServerPlayerInLevel();   // creative: what it hands over is not used up
        p.moveTo(h.absoluteVec(new Vec3(x, 1, z)));
        p.setItemInHand(InteractionHand.MAIN_HAND, inHand);
        return p;
    }

    private static Piglin piglin(GameTestHelper h, int x, int z) {
        Piglin p = h.spawn(EntityType.PIGLIN, new BlockPos(x, 1, z));
        p.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.GOLDEN_SWORD));
        return p;
    }

    /** Removes the test's mobs and items (and mock players), so nothing wanders into another test. */
    private static void cleanup(GameTestHelper h, ServerPlayer... players) {
        for (Entity e : h.getLevel().getEntities((Entity) null, h.getBounds().inflate(2), e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        for (ServerPlayer p : players) {
            h.getLevel().getServer().getPlayerList().remove(p);
        }
    }

    private static int itemCount(GameTestHelper h, Item item, double radius) {
        AABB box = new AABB(h.absolutePos(new BlockPos(4, 1, 4))).inflate(radius);
        int n = 0;
        for (ItemEntity it : h.getLevel().getEntitiesOfClass(ItemEntity.class, box, it -> it.isAlive() && it.getItem().is(item))) {
            n += it.getItem().getCount();
        }
        return n;
    }

    // ------------------------------------------------------------------------------------------ the Piglin Witch

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void witchRefusesUntilGivenElixirOfGreed(GameTestHelper h) {
        floor(h);
        PiglinWitch witch = h.spawn(WWEntities.PIGLIN_WITCH, new BlockPos(4, 1, 4));
        ServerPlayer p = player(h, 4.5, 6.5, ItemStack.EMPTY);
        p.interactOn(witch, InteractionHand.MAIN_HAND);
        h.assertFalse(witch.tradesOpen(), "her trades should be shut");
        h.assertTrue(witch.getTradingPlayer() == null, "she should refuse to trade before the Elixir of Greed");
        h.assertFalse(p.containerMenu instanceof MerchantMenu, "no merchant screen should open");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLD_INGOT));
        p.interactOn(witch, InteractionHand.MAIN_HAND);
        h.assertTrue(witch.getTradingPlayer() == null, "gold alone shouldn't open her trades");
        p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(WWItems.ELIXIR_OF_GREED));
        p.interactOn(witch, InteractionHand.MAIN_HAND);
        h.assertTrue(witch.isDrinking() && witch.getMainHandItem().is(WWItems.ELIXIR_OF_GREED), "she should drink the Elixir of Greed");
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(witch.tradesOpen(), "her trades should open once she has drunk it"))
                .thenExecute(() -> {
                    p.moveTo(witch.getX(), witch.getY(), witch.getZ() + 1.5);
                    p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
                    p.interactOn(witch, InteractionHand.MAIN_HAND);
                    h.assertTrue(witch.getTradingPlayer() == p, "she should trade now");
                    h.assertTrue(p.containerMenu instanceof MerchantMenu, "the merchant screen should be open");
                    h.assertTrue(witch.isTradingSynced(), "the trade loop should be flagged for the client");
                    p.closeContainer();
                    witch.setTradingPlayer(null);
                    // her trades stay open for good: saved and loaded
                    CompoundTag tag = new CompoundTag();
                    witch.saveWithoutId(tag);
                    PiglinWitch copy = WWEntities.PIGLIN_WITCH.create(h.getLevel());
                    copy.load(tag);
                    h.assertTrue(copy.tradesOpen(), "open trades should be saved");
                    h.assertTrue(copy.requiresCustomPersistence(), "she should never despawn");
                })
                .thenExecute(() -> cleanup(h, p))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void witchSellsTheHexCore(GameTestHelper h) {
        floor(h);
        PiglinWitch witch = h.spawn(WWEntities.PIGLIN_WITCH, new BlockPos(4, 1, 4));
        MerchantOffer core = null;
        for (MerchantOffer o : witch.getOffers()) {
            if (o.getResult().is(WWItems.HEX_CORE)) {
                core = o;
            }
        }
        h.assertTrue(core != null, "one of her offers should be the Hex Core");
        h.assertTrue(core.getBaseCostA().is(Items.GOLD_BLOCK) && core.getBaseCostA().getCount() == 3, "the Hex Core costs 3 gold blocks");
        h.assertTrue(core.getCostB().is(WWItems.SOUL_ELIXIR) && core.getCostB().getCount() == 16, "... and 16 Soul Elixir");
        boolean paysForSouls = witch.getOffers().stream().anyMatch(o -> o.getBaseCostA().is(WWItems.SOUL_ELIXIR)
                && o.getResult().is(Items.GOLD_INGOT));
        h.assertTrue(paysForSouls, "she should pay gold for Soul Elixir");
        for (Item i : new Item[]{WWItems.ELIXIR_BOTTLE, Items.SOUL_SAND, Items.NETHER_WART, Items.GHAST_TEAR, Items.CRYING_OBSIDIAN}) {
            h.assertTrue(witch.getOffers().stream().anyMatch(o -> o.getResult().is(i)), "she should sell " + i);
        }
        cleanup(h);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ the Golden Piglin

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void goldenPiglinDropsGoldBlocks(GameTestHelper h) {
        floor(h);
        GoldenPiglin golden = h.spawn(WWEntities.GOLDEN_PIGLIN, new BlockPos(4, 1, 4));
        h.assertFalse(golden.isConverting(), "solid gold doesn't zombify");
        h.assertTrue(golden.getAttributeBaseValue(net.minecraft.world.entity.ai.attributes.Attributes.MOVEMENT_SPEED) == 0.06,
                "it should be extremely slow");
        golden.kill();
        h.succeedWhen(() -> {
            int n = itemCount(h, Items.GOLD_BLOCK, 4);
            h.assertTrue(n >= 2 && n <= 4, "a Golden Piglin should drop 2-4 gold blocks, dropped " + n);
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 200)
    public void piglinsAttackGoldenPiglins(GameTestHelper h) {
        floor(h);
        Piglin piglin = piglin(h, 1, 4);
        piglin.setImmuneToZombification(true);
        GoldenPiglin golden = h.spawn(WWEntities.GOLDEN_PIGLIN, new BlockPos(6, 1, 4));
        h.succeedWhen(() -> {
            h.assertTrue(piglin.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET).orElse(null) == golden,
                    "a Piglin should go for the Golden Piglin's gold");
            h.assertTrue(golden.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET).isEmpty(), "the Golden Piglin shouldn't start fights");
            cleanup(h);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH)
    public void goldenPiglinsBarterFromTheirOwnTable(GameTestHelper h) {
        floor(h);
        GoldenPiglin golden = h.spawn(WWEntities.GOLDEN_PIGLIN, new BlockPos(4, 1, 4));
        var table = h.getLevel().getServer().reloadableRegistries().getLootTable(NetherFeature.GOLDEN_BARTER);
        h.assertTrue(table != net.minecraft.world.level.storage.loot.LootTable.EMPTY, "the golden piglin bartering table should load");
        List<ItemStack> loot = GoldenPiglin.barterLoot(golden);
        h.assertFalse(loot.isEmpty(), "a barter should give something");
        cleanup(h);
        h.succeed();
    }

    // ------------------------------------------------------------------------------------------ piglins and elixirs

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 60)
    public void cursedElixirMakesAPiglinGoldenForGood(GameTestHelper h) {
        floor(h);
        Piglin fed = piglin(h, 2, 2);
        Piglin plain = piglin(h, 6, 6);
        ServerPlayer p = player(h, 2.5, 3.5, new ItemStack(WWItems.CURSED_ELIXIR));
        PiglinGreed.feedCursed(p, InteractionHand.MAIN_HAND, fed);   // what using it on a piglin does
        h.assertTrue(fed.hasEffect(WWEffects.GOLDEN), "the fed Piglin should get `golden`");
        h.assertTrue(fed.getEffect(WWEffects.GOLDEN).isInfiniteDuration(), "`golden` is permanent");
        h.assertTrue(PiglinGreed.isGolden(fed), "the golden flag (synced to clients for the shimmer) should be set");
        h.assertFalse(fed.isConverting(), "a golden Piglin is immune to zombification");
        h.assertTrue(plain.isConverting(), "a plain Piglin out of the Nether is zombifying");
        // simulate the overworld timer: both have been out of the Nether for almost 15 seconds
        ((AbstractPiglinAccessor) fed).winterworks$setTimeInOverworld(295);
        ((AbstractPiglinAccessor) plain).winterworks$setTimeInOverworld(295);
        Vec3 plainAt = plain.position();
        h.succeedWhen(() -> {
            h.assertTrue(plain.isRemoved(), "the plain Piglin should have zombified");
            h.assertFalse(h.getLevel().getEntitiesOfClass(ZombifiedPiglin.class, new AABB(plainAt, plainAt).inflate(2)).isEmpty(),
                    "... into a Zombified Piglin");
            h.assertTrue(fed.isAlive() && !fed.isRemoved(), "the golden Piglin should still be a Piglin");
            h.assertTrue(((AbstractPiglinAccessor) fed).winterworks$timeInOverworld() == 0, "its zombification timer should stay at 0");
            cleanup(h, p);
        });
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 400)
    public void piglinsAdmireAndDrinkDroppedCursedElixir(GameTestHelper h) {
        floor(h);
        Piglin piglin = piglin(h, 1, 4);
        h.onEachTick(() -> ((AbstractPiglinAccessor) piglin).winterworks$setTimeInOverworld(0));   // keep it from zombifying meanwhile
        h.spawnItem(WWItems.CURSED_ELIXIR, 5.5f, 1.2f, 4.5f);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(piglin.getOffhandItem().is(WWItems.CURSED_ELIXIR),
                        "a Piglin should walk to Cursed Elixir and admire it like gold"))
                .thenWaitUntil(() -> h.assertTrue(piglin.hasEffect(WWEffects.GOLDEN) && piglin.getOffhandItem().isEmpty(),
                        "... and then drink it"))
                .thenExecute(() -> cleanup(h))
                .thenSucceed();
    }

    @GameTest(template = EMPTY_STRUCTURE, batch = BATCH, timeoutTicks = 400)
    public void piglinsFightOverADroppedElixirOfGreed(GameTestHelper h) {
        floor(h);
        Piglin a = piglin(h, 2, 4);
        Piglin b = piglin(h, 6, 4);
        a.setImmuneToZombification(true);
        b.setImmuneToZombification(true);
        b.setHealth(2f);
        h.spawnItem(WWItems.ELIXIR_OF_GREED, 4.5f, 1.2f, 6.5f);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(a.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET).orElse(null) == b
                        || b.getBrain().getMemory(MemoryModuleType.ATTACK_TARGET).orElse(null) == a, "the Piglins should fight"))
                .thenWaitUntil(() -> h.assertTrue(!a.isAlive() || !b.isAlive(), "... to the death"))
                .thenWaitUntil(() -> {
                    Piglin winner = a.isAlive() ? a : b;
                    h.assertTrue(itemCount(h, WWItems.ELIXIR_OF_GREED, 8) == 0, "the survivor should take the Elixir of Greed");
                    h.assertTrue(winner.hasEffect(MobEffects.DAMAGE_BOOST), "... and drink it");
                    h.assertFalse(winner.getOffhandItem().is(WWItems.ELIXIR_OF_GREED) || winner.getMainHandItem().is(WWItems.ELIXIR_OF_GREED),
                            "... not carry it off");
                })
                .thenExecute(() -> cleanup(h))
                .thenSucceed();
    }

    // ------------------------------------------------------------------------------------------ the Hex Fortress

    private static BlockPos farAway(GameTestHelper h, int dz) {
        return h.absolutePos(BlockPos.ZERO).offset(-1400, 40, -1400 + dz);
    }

    /** Force-loads (or frees) the chunks round a fortress at `origin`: only mobs in entity-ticking chunks can be looked up. */
    private static void force(ServerLevel level, BlockPos origin, boolean on) {
        for (int cx = (origin.getX() - 32) >> 4; cx <= (origin.getX() + 32) >> 4; cx++) {
            for (int cz = (origin.getZ() - 32) >> 4; cz <= (origin.getZ() + 32) >> 4; cz++) {
                level.setChunkForced(cx, cz, on);
            }
        }
    }

    /** Are the chunks round a fortress at `origin` entity-ticking yet (forced chunks take a while on a busy server)? */
    private static boolean entityTicking(ServerLevel level, BlockPos origin) {
        for (int cx = (origin.getX() - 24) >> 4; cx <= (origin.getX() + 24) >> 4; cx++) {
            for (int cz = (origin.getZ() - 24) >> 4; cz <= (origin.getZ() + 24) >> 4; cz++) {
                if (!level.isPositionEntityTicking(new BlockPos(cx << 4, origin.getY(), cz << 4))) {
                    return false;
                }
            }
        }
        return true;
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 800)
    public void hexFortressBuilderPlacesEverything(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = farAway(h, 0);
        force(level, origin, true);
        h.startSequence()
                .thenWaitUntil(() -> h.assertTrue(entityTicking(level, origin), "the fortress's chunks load"))
                .thenExecute(() -> checkBuilder(h, level, origin));
    }

    private void checkBuilder(GameTestHelper h, ServerLevel level, BlockPos origin) {
        BoundingBox box = HexFortress.build(level, origin, Rotation.CLOCKWISE_90, 20261122L);
        int portal = 0, stands = 0, wart = 0, chests = 0, jars = 0, soulFire = 0, cauldrons = 0;
        boolean looted = false;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (int x = box.minX(); x <= box.maxX(); x++) {
            for (int z = box.minZ(); z <= box.maxZ(); z++) {
                for (int y = origin.getY() - 2; y <= box.maxY(); y++) {
                    Block b = level.getBlockState(p.set(x, y, z)).getBlock();
                    if (b == Blocks.NETHER_PORTAL) {
                        portal++;
                    } else if (b == Blocks.BREWING_STAND) {
                        stands++;
                    } else if (b == Blocks.NETHER_WART) {
                        wart++;
                    } else if (b == Blocks.CHEST) {
                        chests++;
                        looted |= level.getBlockEntity(p) instanceof ChestBlockEntity c && NetherFeature.FORTRESS_CHEST.equals(c.getLootTable());
                    } else if (b == WWBlocks.ELIXIR_JAR) {
                        jars++;
                    } else if (b == Blocks.SOUL_FIRE) {
                        soulFire++;
                    } else if (b == Blocks.WATER_CAULDRON || b == Blocks.LAVA_CAULDRON) {
                        cauldrons++;
                    }
                }
            }
        }
        h.assertTrue(portal == 9, "a lit 3x3 Nether Portal, found " + portal + " portal blocks");
        h.assertTrue(stands >= 5, "brewing stands in the brewing rooms and her study, found " + stands);
        h.assertTrue(cauldrons >= 4, "cauldrons in the brewing rooms, found " + cauldrons);
        h.assertTrue(jars >= 5, "Elixir Jars over soul fire, found " + jars);
        h.assertTrue(soulFire >= 15, "soul fire under the jars and in the braziers, found " + soulFire);
        h.assertTrue(wart >= 50, "Nether Wart farms, found " + wart);
        h.assertTrue(chests >= 8, "storeroom and stash chests, found " + chests);
        h.assertTrue(looted, "the chests should hold winterworks:chests/hex_fortress loot");
        AABB all = AABB.of(box).inflate(2);
        int witches = level.getEntitiesOfClass(PiglinWitch.class, all).size();
        int golden = level.getEntitiesOfClass(GoldenPiglin.class, all).size();
        int piglins = level.getEntitiesOfClass(Piglin.class, all, e -> !(e instanceof GoldenPiglin)).size();
        h.assertTrue(witches == 1, "exactly one Piglin Witch per fortress, found " + witches);
        h.assertTrue(golden >= 1, "a Golden Piglin, found " + golden);
        h.assertTrue(piglins >= 3, "a few Piglins, found " + piglins);
        PiglinWitch witch = level.getEntitiesOfClass(PiglinWitch.class, all).get(0);
        h.assertTrue(witch.isPersistenceRequired() && witch.home() != null, "the witch should be persistent and at home");
        for (Entity e : level.getEntities((Entity) null, all, e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        force(level, origin, false);
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void hexFortressPiecesWriteOnlyInsideTheirChunk(GameTestHelper h) {
        ServerLevel level = h.getLevel();
        BlockPos origin = farAway(h, 300);
        List<HexFortressPiece> pieces = HexFortressPiece.layout(origin, Rotation.NONE, 7L);
        // a chunk-sized box (16 x 16, full height) that the courtyard, two halls, a tower and a bridge all reach into
        BlockPos corner = origin.offset(-12, 0, 4);
        ChunkPos chunk = new ChunkPos(corner);
        BoundingBox chunkBox = new BoundingBox(corner.getX(), level.getMinBuildHeight(), corner.getZ(), corner.getX() + 15,
                level.getMaxBuildHeight() - 1, corner.getZ() + 15);
        int touched = 0;
        ChunkGenerator gen = level.getChunkSource().getGenerator();
        for (HexFortressPiece piece : pieces) {
            if (piece.getBoundingBox().intersects(chunkBox)) {
                touched++;
                piece.postProcess(level, level.structureManager(), gen, level.getRandom(), chunkBox, chunk, origin);
            }
        }
        h.assertTrue(touched >= 4, "the chunk should be shared by several pieces, " + touched);
        int inside = 0, outside = 0;
        BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
        for (HexFortressPiece piece : pieces) {
            BoundingBox b = piece.getBoundingBox();
            for (int x = b.minX(); x <= b.maxX(); x++) {
                for (int z = b.minZ(); z <= b.maxZ(); z++) {
                    for (int y = origin.getY() - 1; y <= b.maxY(); y++) {   // above the flat ground
                        if (!level.getBlockState(p.set(x, y, z)).isAir()) {
                            if (chunkBox.isInside(p)) {
                                inside++;
                            } else {
                                outside++;
                            }
                        }
                    }
                }
            }
        }
        h.assertTrue(inside > 100, "the pieces should have built inside the chunk, " + inside);
        h.assertTrue(outside == 0, outside + " blocks were written outside the chunk being decorated");
        for (Entity e : level.getEntities((Entity) null, AABB.of(chunkBox), e -> !(e instanceof ServerPlayer))) {
            e.discard();
        }
        h.succeed();
    }

    @GameTest(template = EMPTY_STRUCTURE, timeoutTicks = 100)
    public void hexFortressGeneratesInTheNether(GameTestHelper h) {
        var server = h.getLevel().getServer();
        var reg = server.registryAccess();
        Structure structure = reg.registryOrThrow(Registries.STRUCTURE).get(NetherFeature.HEX_FORTRESS);
        h.assertTrue(structure != null, "the hex_fortress structure should load");
        h.assertTrue(reg.registryOrThrow(Registries.STRUCTURE_SET).containsKey(NetherFeature.HEX_FORTRESS_SET), "... and its structure set");
        TagKey<Biome> tag = TagKey.create(Registries.BIOME, dev.lowpix.winterworks.Winterworks.id("has_hex_fortress"));
        for (var biome : List.of(Biomes.NETHER_WASTES, Biomes.CRIMSON_FOREST, Biomes.WARPED_FOREST, Biomes.SOUL_SAND_VALLEY, Biomes.BASALT_DELTAS)) {
            h.assertTrue(reg.registryOrThrow(Registries.BIOME).getHolderOrThrow(biome).is(tag), "any Nether biome: " + biome.location());
        }
        ServerLevel nether = server.getLevel(Level.NETHER);
        ChunkGenerator gen = nether.getChunkSource().getGenerator();
        StructureStart start = structure.generate(reg, gen, gen.getBiomeSource(), nether.getChunkSource().randomState(),
                nether.getStructureManager(), nether.getSeed(), new ChunkPos(40, -25), 0, nether, b -> true);
        h.assertTrue(start.isValid(), "a fortress should generate in the Nether");
        h.assertTrue(start.getPieces().size() == 8, "eight pieces, got " + start.getPieces().size());
        BoundingBox box = start.getBoundingBox();
        h.assertTrue(box.getXSpan() >= 36 && box.getXSpan() <= 48 && box.getZSpan() >= 36 && box.getZSpan() <= 48,
                "about 40 x 40, " + box.getXSpan() + " x " + box.getZSpan());
        int floor = start.getPieces().get(0).getBoundingBox().minY() + 2 + 40;
        h.assertTrue(floor > gen.getSeaLevel() && floor <= 100, "on the ground or over the lava, under the roof: y=" + floor);
        h.succeed();
    }
}
