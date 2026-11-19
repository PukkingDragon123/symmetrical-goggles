// (stub, replaced below)
import type { Game } from '../game';
export class ForgeStation { active = false; standAt(): void {} enter(): boolean { return false; } exit(): void {} debug(): Record<string, unknown> { return {}; } }
export async function installForge(_g: Game): Promise<ForgeStation | null> { return null; }
