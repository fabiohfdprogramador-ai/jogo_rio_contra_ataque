// Renda contínua: territórios, construções econômicas e regras das equipes.
import { AI_PROFILES } from '../../config/ai';
import { getBuildingDef } from '../../config/buildings';
import { FACTIONS } from '../../config/factions';
import { TICK_RATE } from '../../config/game';
import { SECTOR_TYPES } from '../../config/sectors';
import { sectorAt, sectorNeighbors } from '../map/mapgen';
import type { Player, Resources, World } from '../types';

/** Setores do jogador conectados (por vizinhança) a um setor com base própria. */
export function connectedSectors(world: World, playerId: number): Set<number> {
  const roots: number[] = [];
  for (const b of world.buildings.values()) {
    if (b.owner !== playerId || !b.built) continue;
    if (!getBuildingDef(b.type).isBase) continue;
    const s = sectorAt(world.map, b.tx, b.ty);
    if (s >= 0 && world.sectors[s].owner === playerId) roots.push(s);
  }
  const seen = new Set<number>(roots);
  const stack = [...roots];
  while (stack.length) {
    const s = stack.pop()!;
    for (const n of sectorNeighbors(world.map, s)) {
      if (!seen.has(n) && world.sectors[n].owner === playerId) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

/** Renda por minuto de um jogador (usada pela simulação e exibida na interface). */
export function computeIncome(world: World, player: Player): Resources {
  const out: Resources = { money: 0, materials: 0, fuel: 0 };
  const rules = FACTIONS[player.faction].rules;
  const connected = rules.connectedIncomeMult !== 1 || rules.isolatedIncomeMult !== 1 ? connectedSectors(world, player.id) : null;
  world.sectors.forEach((s, i) => {
    if (s.owner !== player.id) return;
    const inc = SECTOR_TYPES[world.map.sectors[i].type].income;
    let mult = 1;
    if (connected) mult = connected.has(i) ? rules.connectedIncomeMult : rules.isolatedIncomeMult;
    out.money += (inc.money ?? 0) * mult;
    out.materials += (inc.materials ?? 0) * mult;
    out.fuel += (inc.fuel ?? 0) * mult;
  });
  for (const b of world.buildings.values()) {
    if (b.owner !== player.id || !b.built) continue;
    const inc = getBuildingDef(b.type).income;
    if (!inc) continue;
    out.money += inc.money ?? 0;
    out.materials += inc.materials ?? 0;
    out.fuel += inc.fuel ?? 0;
  }
  let mult = player.mods.income;
  if (player.isAI) mult *= AI_PROFILES[player.difficulty].incomeMult;
  out.money *= mult;
  out.materials *= mult;
  out.fuel *= mult;
  return out;
}

export function updateEconomy(world: World) {
  // A renda é recalculada uma vez por segundo e aplicada em todos os ticks.
  if (world.tick % TICK_RATE === 0) {
    for (const p of world.players) if (p.alive) p.incomePerMin = computeIncome(world, p);
  }
  const perTick = 1 / (60 * TICK_RATE);
  for (const p of world.players) {
    if (!p.alive) continue;
    p.resources.money += p.incomePerMin.money * perTick;
    p.resources.materials += p.incomePerMin.materials * perTick;
    p.resources.fuel += p.incomePerMin.fuel * perTick;
  }
}
