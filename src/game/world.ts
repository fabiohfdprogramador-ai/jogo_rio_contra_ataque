// Criação do mundo e operações básicas sobre entidades.
import { getBuildingDef } from '../config/buildings';
import { ALT_COLORS, DEFAULT_MODS, FACTIONS } from '../config/factions';
import { MAX_POP, STARTING_RESOURCES, TICK_RATE } from '../config/game';
import { SECTOR_TYPES } from '../config/sectors';
import { getTechDef } from '../config/techs';
import { getUnitDef } from '../config/units';
import { nearestWalkable } from './map/grid';
import { generateMap, sectorAt } from './map/mapgen';
import type { Building, Cost, Entity, MatchConfig, Mods, Player, Resources, Ruin, Unit, World } from './types';

export function createWorld(config: MatchConfig): World {
  const map = generateMap(config.mapSize, config.seed);
  const world: World = {
    config,
    tick: 0,
    nextId: 1,
    rngState: config.seed ^ 0x5bd1e995,
    map,
    sectors: map.sectors.map(() => ({ owner: null, captureTeam: null, progress: 0, contested: false })),
    players: [],
    units: new Map(),
    buildings: new Map(),
    ruins: new Map(),
    occupancy: new Int32Array(map.width * map.height),
    visibility: [],
    events: [],
    domination: { player: null, ticks: 0 },
    ai: {},
    status: 'running',
    winner: null,
    endReason: '',
  };

  const usedFactions = new Set<string>();
  config.players.forEach((pc, i) => {
    const faction = FACTIONS[pc.faction];
    const color = usedFactions.has(pc.faction) ? ALT_COLORS[i % ALT_COLORS.length] : faction.color;
    usedFactions.add(pc.faction);
    const start = STARTING_RESOURCES[config.startingResources];
    const player: Player = {
      id: i,
      name: pc.name,
      faction: pc.faction,
      color,
      isAI: pc.isAI,
      difficulty: pc.difficulty,
      resources: { money: start.money, materials: start.materials, fuel: start.fuel },
      mods: { ...faction.baseMods },
      techs: [],
      alive: true,
      eliminatedAt: null,
      stats: {
        unitsProduced: 0,
        unitsLost: 0,
        kills: 0,
        buildingsBuilt: 0,
        buildingsLost: 0,
        resourcesSpent: 0,
        sectorsCaptured: 0,
        techsResearched: 0,
      },
      energySupply: 0,
      energyDemand: 0,
      popUsed: 0,
      popCap: 0,
      incomePerMin: { money: 0, materials: 0, fuel: 0 },
    };
    world.players.push(player);
    world.visibility.push(new Uint8Array(map.width * map.height));

    // Base inicial, setor inicial e unidades
    const start0 = map.starts[pc.start ?? i];
    const hqType = faction.roles.hq!;
    const hq = addBuilding(world, i, hqType, start0.hqX, start0.hqY, true);
    world.sectors[start0.sector] = { owner: i, captureTeam: i, progress: 100, contested: false };
    const hqDef = getBuildingDef(hqType);
    const cx = hq.tx + hqDef.size / 2;
    const cy = hq.ty + hqDef.size + 1.5;
    faction.startingUnits.forEach((ut, k) => {
      spawnUnit(world, i, ut, cx - 2 + (k % 4) * 1.2, cy + Math.floor(k / 4) * 1.2);
    });
  });
  recomputeDerived(world);
  return world;
}

export function allocId(world: World): number {
  return world.nextId++;
}

export function getEntity(world: World, id: number | null): Entity | undefined {
  if (id === null) return undefined;
  return world.units.get(id) ?? world.buildings.get(id) ?? world.ruins.get(id);
}

export function unitMaxHp(def: { hp: number; category: string }, mods: Mods): number {
  return Math.round(def.hp * (def.category === 'vehicle' ? mods.vehicleHp : mods.infantryHp));
}

export function spawnUnit(world: World, owner: number, type: string, x: number, y: number): Unit {
  const def = getUnitDef(type);
  const player = world.players[owner];
  const spot = nearestWalkable(world, x, y, 10) ?? { x: Math.floor(x), y: Math.floor(y) };
  const fx = Math.floor(x) === spot.x && Math.floor(y) === spot.y ? x : spot.x + 0.5;
  const fy = Math.floor(x) === spot.x && Math.floor(y) === spot.y ? y : spot.y + 0.5;
  const maxHp = unitMaxHp(def, player.mods);
  const unit: Unit = {
    id: allocId(world),
    kind: 'unit',
    type,
    owner,
    x: fx,
    y: fy,
    px: fx,
    py: fy,
    hp: maxHp,
    maxHp,
    facing: 0,
    order: { type: 'idle' },
    targetId: null,
    anchorX: fx,
    anchorY: fy,
    path: null,
    pathIdx: 0,
    pathGoalX: fx,
    pathGoalY: fy,
    repathTicks: 0,
    stuckTicks: 0,
    cooldown: 0,
    lastAttackTick: -1000,
    attackedBy: null,
  };
  world.units.set(unit.id, unit);
  return unit;
}

export function addBuilding(world: World, owner: number, type: string, tx: number, ty: number, complete: boolean, timeMult = 1): Building {
  const def = getBuildingDef(type);
  const player = world.players[owner];
  const maxHp = Math.round(def.hp * player.mods.buildingHp);
  const b: Building = {
    id: allocId(world),
    kind: 'building',
    type,
    owner,
    tx,
    ty,
    size: def.size,
    hp: complete ? maxHp : Math.max(1, Math.round(maxHp * 0.1)),
    maxHp,
    built: complete,
    progress: complete ? 1 : 0,
    buildTotalTicks: Math.max(1, Math.round(def.buildTime * timeMult * TICK_RATE)),
    queue: [],
    research: null,
    rallyX: null,
    rallyY: null,
    cooldown: 0,
    targetId: null,
    demolishTicks: 0,
  };
  world.buildings.set(b.id, b);
  setOccupancy(world, b, b.id + 1);
  // Unidades que estejam no terreno são empurradas para fora.
  for (const u of world.units.values()) {
    if (u.x >= tx && u.x < tx + def.size && u.y >= ty && u.y < ty + def.size) {
      const spot = nearestWalkable(world, u.x, u.y, 8);
      if (spot) {
        u.x = u.px = spot.x + 0.5;
        u.y = u.py = spot.y + 0.5;
        u.path = null;
      }
    }
  }
  return b;
}

export function setOccupancy(world: World, b: { tx: number; ty: number; size: number }, value: number) {
  const { width } = world.map;
  for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) world.occupancy[y * width + x] = value;
}

export function removeBuilding(world: World, b: Building, leaveRuin: boolean): Ruin | null {
  world.buildings.delete(b.id);
  setOccupancy(world, b, 0);
  if (!leaveRuin) return null;
  const def = getBuildingDef(b.type);
  const ruin: Ruin = { id: allocId(world), kind: 'ruin', tx: b.tx, ty: b.ty, size: b.size, role: def.role, formerType: b.type };
  world.ruins.set(ruin.id, ruin);
  return ruin;
}

export function buildingCenter(b: { tx: number; ty: number; size: number }): { x: number; y: number } {
  return { x: b.tx + b.size / 2, y: b.ty + b.size / 2 };
}

export function entityPos(e: Entity): { x: number; y: number } {
  return e.kind === 'unit' ? { x: e.x, y: e.y } : buildingCenter(e);
}

/** Distância de um ponto até a borda de uma entidade (para alcance de ataque). */
export function distToEntity(x: number, y: number, e: Entity): number {
  if (e.kind === 'unit') return Math.hypot(e.x - x, e.y - y);
  const cx = Math.max(e.tx, Math.min(x, e.tx + e.size));
  const cy = Math.max(e.ty, Math.min(y, e.ty + e.size));
  return Math.hypot(cx - x, cy - y);
}

// ---------- Recursos ----------

export function canAfford(res: Resources, cost: Cost, mult = 1): boolean {
  return (
    res.money >= Math.round((cost.money ?? 0) * mult) &&
    res.materials >= Math.round((cost.materials ?? 0) * mult) &&
    res.fuel >= Math.round((cost.fuel ?? 0) * mult)
  );
}

export function spend(player: Player, cost: Cost, mult = 1): boolean {
  if (!canAfford(player.resources, cost, mult)) return false;
  const m = Math.round((cost.money ?? 0) * mult);
  const mat = Math.round((cost.materials ?? 0) * mult);
  const f = Math.round((cost.fuel ?? 0) * mult);
  player.resources.money -= m;
  player.resources.materials -= mat;
  player.resources.fuel -= f;
  player.stats.resourcesSpent += m + mat + f;
  return true;
}

export function refund(player: Player, cost: Cost, mult = 1) {
  const m = Math.round((cost.money ?? 0) * mult);
  const mat = Math.round((cost.materials ?? 0) * mult);
  const f = Math.round((cost.fuel ?? 0) * mult);
  player.resources.money += m;
  player.resources.materials += mat;
  player.resources.fuel += f;
  player.stats.resourcesSpent = Math.max(0, player.stats.resourcesSpent - (m + mat + f));
}

export function missingResources(res: Resources, cost: Cost, mult = 1): string[] {
  const out: string[] = [];
  if (res.money < Math.round((cost.money ?? 0) * mult)) out.push('dinheiro');
  if (res.materials < Math.round((cost.materials ?? 0) * mult)) out.push('materiais');
  if (res.fuel < Math.round((cost.fuel ?? 0) * mult)) out.push('combustível');
  return out;
}

// ---------- Modificadores e valores derivados ----------

export function recomputeMods(world: World, player: Player) {
  const base = FACTIONS[player.faction].baseMods;
  const mods: Mods = { ...DEFAULT_MODS, ...base };
  for (const techId of player.techs) {
    const t = getTechDef(techId);
    for (const [k, v] of Object.entries(t.effects) as [keyof Mods, number][]) mods[k] += v;
  }
  const old = player.mods;
  player.mods = mods;
  // Ajusta a vida das entidades existentes proporcionalmente.
  for (const u of world.units.values()) {
    if (u.owner !== player.id) continue;
    const def = getUnitDef(u.type);
    const newMax = unitMaxHp(def, mods);
    if (newMax !== u.maxHp) {
      u.hp = (u.hp / u.maxHp) * newMax;
      u.maxHp = newMax;
    }
  }
  if (old.buildingHp !== mods.buildingHp) {
    for (const b of world.buildings.values()) {
      if (b.owner !== player.id) continue;
      const newMax = Math.round(getBuildingDef(b.type).hp * mods.buildingHp);
      b.hp = (b.hp / b.maxHp) * newMax;
      b.maxHp = newMax;
    }
  }
}

/** Recalcula energia e população de todos os jogadores. */
export function recomputeDerived(world: World) {
  for (const p of world.players) {
    p.energySupply = 0;
    p.energyDemand = 0;
    p.popUsed = 0;
    p.popCap = p.mods.popBonus;
  }
  for (const b of world.buildings.values()) {
    if (!b.built) continue;
    const p = world.players[b.owner];
    const def = getBuildingDef(b.type);
    if (def.energy > 0) p.energySupply += def.energy;
    else p.energyDemand -= def.energy;
    p.popCap += def.pop;
  }
  for (const u of world.units.values()) world.players[u.owner].popUsed += getUnitDef(u.type).pop;
  for (let i = 0; i < world.sectors.length; i++) {
    const owner = world.sectors[i].owner;
    if (owner === null) continue;
    world.players[owner].energySupply += SECTOR_TYPES[world.map.sectors[i].type].energy;
  }
  for (const p of world.players) p.popCap = Math.min(MAX_POP, p.popCap);
}

export function powerFactor(p: Player, lowPowerFactor: number): number {
  return p.energyDemand > p.energySupply ? lowPowerFactor : 1;
}

export function ownerOfTile(world: World, x: number, y: number): number | null {
  const s = sectorAt(world.map, x, y);
  return s < 0 ? null : world.sectors[s].owner;
}

export function countBuildings(world: World, owner: number, type: string, includeUnbuilt = true): number {
  let n = 0;
  for (const b of world.buildings.values()) if (b.owner === owner && b.type === type && (includeUnbuilt || b.built)) n++;
  return n;
}

export function hasBuilt(world: World, owner: number, type: string): boolean {
  for (const b of world.buildings.values()) if (b.owner === owner && b.type === type && b.built) return true;
  return false;
}

export function emit(world: World, ev: World['events'][number]) {
  world.events.push(ev);
}
