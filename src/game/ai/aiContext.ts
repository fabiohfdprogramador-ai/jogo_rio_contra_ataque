// Informações que a IA reúne a cada decisão. A IA só "vê" o que o jogador
// também veria: suas entidades, inimigos visíveis e a posse pública dos setores.
import { getBuildingDef } from '../../config/buildings';
import { AI_PROFILES, type AIProfile } from '../../config/ai';
import { FACTIONS } from '../../config/factions';
import { getUnitDef } from '../../config/units';
import { sectorAt } from '../map/mapgen';
import type { AIMemory, Building, FactionDef, Player, Unit, World } from '../types';
import { isVisibleTo } from '../units/behavior';

export interface AIContext {
  world: World;
  player: Player;
  faction: FactionDef;
  profile: AIProfile;
  mem: AIMemory;
  units: Unit[];
  combat: Unit[];
  engineers: Unit[];
  buildings: Building[];
  hq: Building | null;
  visibleEnemies: Unit[];
  /** Dinheiro reservado para a próxima construção (a produção respeita a reserva). */
  reserve: number;
  issue: (cmd: import('../commands').Command) => void;
}

export function createMemory(): AIMemory {
  return {
    nextThink: 0,
    attackGroup: [],
    attackTarget: null,
    attackStartStrength: 0,
    expandGroup: [],
    expandTarget: null,
    scoutId: null,
    scoutQueue: [],
    defending: false,
    lastAttackTick: 0,
  };
}

export function buildContext(world: World, pid: number, issue: AIContext['issue']): AIContext {
  const player = world.players[pid];
  const mem = (world.ai[pid] ??= createMemory());
  const units: Unit[] = [];
  const combat: Unit[] = [];
  const engineers: Unit[] = [];
  const visibleEnemies: Unit[] = [];
  for (const u of world.units.values()) {
    if (u.owner === pid) {
      units.push(u);
      const def = getUnitDef(u.type);
      if (def.canRepair && !def.attack) engineers.push(u);
      else if (def.attack) combat.push(u);
    } else if (isVisibleTo(world, pid, u)) {
      visibleEnemies.push(u);
    }
  }
  const buildings: Building[] = [];
  let hq: Building | null = null;
  for (const b of world.buildings.values()) {
    if (b.owner !== pid) continue;
    buildings.push(b);
    if (getBuildingDef(b.type).role === 'hq') hq = b;
  }
  return {
    world,
    player,
    faction: FACTIONS[player.faction],
    profile: AI_PROFILES[player.difficulty],
    mem,
    units,
    combat,
    engineers,
    buildings,
    hq,
    visibleEnemies,
    reserve: 0,
    issue,
  };
}

/** Força estimada de um conjunto de unidades (vida × dano por segundo). */
export function strengthOf(units: Unit[]): number {
  let s = 0;
  for (const u of units) {
    const def = getUnitDef(u.type);
    const dps = def.attack ? def.attack.damage / def.attack.cooldown : 1;
    s += Math.sqrt(u.hp * dps * (1 + def.armor));
  }
  return s;
}

export function baseAnchor(ctx: AIContext): { x: number; y: number } {
  const b = ctx.hq ?? ctx.buildings.find((x) => getBuildingDef(x.type).isBase) ?? ctx.buildings[0];
  if (!b) return { x: ctx.world.map.width / 2, y: ctx.world.map.height / 2 };
  return { x: b.tx + b.size / 2, y: b.ty + b.size / 2 };
}

export function ownedSectors(ctx: AIContext): number[] {
  const out: number[] = [];
  ctx.world.sectors.forEach((s, i) => {
    if (s.owner === ctx.player.id) out.push(i);
  });
  return out;
}

export function enemiesInOwnTerritory(ctx: AIContext): Unit[] {
  return ctx.visibleEnemies.filter((u) => {
    const s = sectorAt(ctx.world.map, u.x, u.y);
    return s >= 0 && ctx.world.sectors[s].owner === ctx.player.id;
  });
}
