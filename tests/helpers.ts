import { getBuildingDef } from '../src/config/buildings';
import { checkPlacement } from '../src/game/buildings/placement';
import type { Difficulty, FactionId, MatchConfig, World } from '../src/game/types';

export function makeConfig(
  opts: {
    factions?: FactionId[];
    ai?: boolean[];
    difficulty?: Difficulty;
    seed?: number;
    mapSize?: 'pequeno' | 'medio';
    fog?: boolean;
    domination?: boolean;
  } = {},
): MatchConfig {
  const factions = opts.factions ?? ['policia', 'bandido'];
  return {
    seed: opts.seed ?? 12345,
    mapSize: opts.mapSize ?? 'pequeno',
    players: factions.map((f, i) => ({
      faction: f,
      isAI: opts.ai?.[i] ?? i > 0,
      difficulty: opts.difficulty ?? 'normal',
      name: `Jogador ${i + 1}`,
    })),
    startingResources: 'normal',
    victory: { domination: opts.domination ?? true, dominationRatio: 0.75, dominationSeconds: 90, timeLimitMinutes: 0 },
    fogOfWar: opts.fog ?? true,
  };
}

/** Primeiro local válido para uma construção no território do jogador. */
export function findValidSpot(world: World, player: number, type: string): { tx: number; ty: number } {
  const size = getBuildingDef(type).size;
  for (let ty = 0; ty < world.map.height - size; ty++) {
    for (let tx = 0; tx < world.map.width - size; tx++) {
      if (checkPlacement(world, player, type, tx, ty, { skipAvailability: true }).ok) return { tx, ty };
    }
  }
  throw new Error('Nenhum local válido encontrado');
}

/** Resumo do estado, usado para verificar determinismo e salvamento. */
export function stateHash(world: World): string {
  const parts: string[] = [String(world.tick)];
  for (const u of world.units.values()) parts.push(`${u.id}:${u.x.toFixed(4)},${u.y.toFixed(4)},${u.hp.toFixed(3)}`);
  for (const b of world.buildings.values()) parts.push(`${b.id}:${b.hp.toFixed(3)},${b.progress.toFixed(4)}`);
  for (const p of world.players) parts.push(`${p.resources.money.toFixed(3)},${p.resources.materials.toFixed(3)}`);
  parts.push(world.sectors.map((s) => `${s.owner}/${s.progress.toFixed(3)}`).join(';'));
  return parts.join('|');
}
