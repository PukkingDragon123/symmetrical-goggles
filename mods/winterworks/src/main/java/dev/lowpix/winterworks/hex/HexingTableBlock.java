package dev.lowpix.winterworks.hex;

import com.mojang.serialization.MapCodec;
import dev.lowpix.winterworks.registry.WWBlocks;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/**
 * The Hexing Table (docs/HEXES_UPDATE.md section 2): hexes enchanted books with souls from a Soul Tank within 3
 * blocks and Soul Elixir. A floating hexed book and soul flames (client.hex.HexingTableRenderer).
 */
public class HexingTableBlock extends BaseEntityBlock {
    public static final MapCodec<HexingTableBlock> CODEC = simpleCodec(HexingTableBlock::new);
    private static final VoxelShape SHAPE = Block.box(0, 0, 0, 16, 12, 16);

    public HexingTableBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends BaseEntityBlock> codec() {
        return CODEC;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return new HexingTableBlockEntity(pos, state);
    }

    @Override
    protected RenderShape getRenderShape(BlockState state) {
        return RenderShape.ENTITYBLOCK_ANIMATED;   // drawn by HexingTableRenderer
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext ctx) {
        return SHAPE;
    }

    @Override
    protected boolean useShapeForLightOcclusion(BlockState state) {
        return true;
    }

    @Nullable
    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return level.isClientSide ? createTickerHelper(type, WWBlocks.HEXING_TABLE_BE, HexingTableBlockEntity::bookAnimationTick) : null;
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        if (!level.isClientSide) {
            player.openMenu(state.getMenuProvider(level, pos));
            if (HexingTableMenu.findTanks(level, pos).isEmpty()) {
                player.displayClientMessage(Component.translatable("container.winterworks.hexing_table.no_tank")
                        .withStyle(ChatFormatting.DARK_AQUA), true);
            }
        }
        return InteractionResult.sidedSuccess(level.isClientSide);
    }

    @Nullable
    @Override
    protected MenuProvider getMenuProvider(BlockState state, Level level, BlockPos pos) {
        return new SimpleMenuProvider((id, inventory, player) -> new HexingTableMenu(id, inventory, ContainerLevelAccess.create(level, pos)),
                Component.translatable("container.winterworks.hexing_table"));
    }

    /** Soul flames round the book; glyphs stream from each Soul Tank in reach to the table, like bookshelves'. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        double x = pos.getX() + 0.5, y = pos.getY() + 1.1, z = pos.getZ() + 0.5;
        if (random.nextInt(3) == 0) {
            double a = random.nextDouble() * Math.PI * 2;
            level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, x + Math.cos(a) * 0.42, pos.getY() + 0.8, z + Math.sin(a) * 0.42,
                    0, 0.01 + random.nextDouble() * 0.01, 0);
        }
        if (random.nextInt(5) == 0) {
            level.addParticle(ParticleTypes.SOUL, x + (random.nextDouble() - 0.5) * 0.5, y + 0.3, z + (random.nextDouble() - 0.5) * 0.5,
                    0, 0.01, 0);
        }
        for (BlockPos tank : HexingTableMenu.findTankPositions(level, pos)) {
            if (random.nextInt(8) == 0) {
                level.addParticle(ParticleTypes.ENCHANT, x, y + 0.6, z,
                        tank.getX() - pos.getX() + random.nextFloat() - 0.5, tank.getY() - pos.getY() - random.nextFloat() + 0.5,
                        tank.getZ() - pos.getZ() + random.nextFloat() - 0.5);
            }
        }
    }
}
