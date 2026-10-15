// Regras de posicionamento e disponibilidade de construções.
import { BUILDINGS, getBuildingDef } from '../../config/buildings';
import { ECONOMY } from '../../config/game';
import { isBuildableTile, isWalkable } from '../map/grid';
import { sectorAt } from '../map/mapgen';
import type { BuildingDef, World } from '../types';
import { canAfford, countBuildings, hasBuilt, missingResources } from '../world';

export interface PlacementResult {
  ok: boolean;
  reason: string;
  /** Validade de cada tile do terreno ocupado (para o indicador visual). */
  tiles: boolean[];
}

export interface Availability {
  ok: boolean;
  reason: string;
}

/** Verifica requisitos que não dependem do local (tecnologia, limite, recursos). */
export function checkAvailability(world: World, playerId: number, type: string, costMult = 1): Availability {
  const def = BUILDINGS[type];
  const player = world.players[playerId];
  if (!def) return { ok: false, reason: 'Construção inválida' };
  if (def.faction !== player.faction) return { ok: false, reason: 'Indisponível para esta equipe' };
  if (!def.buildable) return { ok: false, reason: 'Não pode ser construída' };
  for (const req of def.requires ?? []) {
    if (!hasBuilt(world, playerId, req)) return { ok: false, reason: `Requer ${getBuildingDef(req).name}` };
  }
  if (def.requiresTech && !player.techs.includes(def.requiresTech)) return { ok: false, reason: 'Requer melhoria' };
  if (def.limit !== undefined && countBuildings(world, playerId, type) >= def.limit) {
    return { ok: false, reason: `Limite de ${def.limit}` };
  }
  if (!canAfford(player.resources, def.cost, costMult)) {
    return { ok: false, reason: `Falta ${missingResources(player.resources, def.cost, costMult).join(', ')}` };
  }
  return { ok: true, reason: '' };
}

/** Verifica se a construção pode ser posicionada em (tx, ty). */
export function checkPlacement(
  world: World,
  playerId: number,
  type: string,
  tx: number,
  ty: number,
  opts: { ignoreRuinId?: number; costMult?: number; skipAvailability?: boolean } = {},
): PlacementResult {
  const def = getBuildingDef(type);
  const tiles: boolean[] = [];
  let reason = '';
  if (!opts.skipAvailability) {
    const av = checkAvailability(world, playerId, type, opts.costMult ?? 1);
    if (!av.ok) reason = av.reason;
  }
  let tilesOk = true;
  let territoryOk = true;
  for (let y = ty; y < ty + def.size; y++) {
    for (let x = tx; x < tx + def.size; x++) {
      let ok = isBuildableTile(world, x, y) && !ruinAt(world, x, y, opts.ignoreRuinId);
      const s = sectorAt(world.map, x, y);
      if (s < 0 || world.sectors[s].owner !== playerId) {
        ok = false;
        territoryOk = false;
      }
      if (!ok) tilesOk = false;
      tiles.push(ok);
    }
  }
  if (!reason && !territoryOk) reason = 'Fora do seu território';
  if (!reason && !tilesOk) reason = 'Local obstruído';
  if (!reason && !marginFree(world, def, tx, ty)) reason = 'Muito perto de outra construção';
  if (!reason && !hasAccess(world, def, tx, ty)) reason = 'Sem acesso a vias';
  return { ok: reason === '', reason, tiles };
}

function ruinAt(world: World, x: number, y: number, ignore?: number): boolean {
  for (const r of world.ruins.values()) {
    if (r.id === ignore) continue;
    if (x >= r.tx && x < r.tx + r.size && y >= r.ty && y < r.ty + r.size) return true;
  }
  return false;
}

/** Exige um tile livre entre construções para que as unidades possam circular. */
function marginFree(world: World, def: BuildingDef, tx: number, ty: number): boolean {
  const { width, height } = world.map;
  for (let y = ty - 1; y <= ty + def.size; y++) {
    for (let x = tx - 1; x <= tx + def.size; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (world.occupancy[y * width + x] !== 0) return false;
    }
  }
  return true;
}

/** Pelo menos alguns tiles caminháveis em volta (saída das unidades produzidas). */
function hasAccess(world: World, def: BuildingDef, tx: number, ty: number): boolean {
  let free = 0;
  for (let i = -1; i <= def.size; i++) {
    if (isWalkable(world, tx + i, ty - 1)) free++;
    if (isWalkable(world, tx + i, ty + def.size)) free++;
    if (isWalkable(world, tx - 1, ty + i)) free++;
    if (isWalkable(world, tx + def.size, ty + i)) free++;
  }
  return free >= 3;
}

export function rebuildCostMult(): number {
  return ECONOMY.rebuildCostMult;
}

/** Construções que a equipe pode erguer (para o menu de construção). */
export function buildableList(world: World, playerId: number): { def: BuildingDef; availability: Availability }[] {
  const faction = world.players[playerId].faction;
  return Object.values(BUILDINGS)
    .filter((d) => d.faction === faction && d.buildable)
    .map((def) => ({ def, availability: checkAvailability(world, playerId, def.id) }));
}

/** Construção equivalente da equipe para reconstruir sobre uma ruína. */
export function rebuildTypeFor(world: World, playerId: number, role: string): string | null {
  const faction = world.players[playerId].faction;
  const def = Object.values(BUILDINGS).find((d) => d.faction === faction && d.role === role && d.buildable);
  return def ? def.id : null;
}
