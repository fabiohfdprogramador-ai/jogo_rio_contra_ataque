// Comandos: a ÚNICA forma de jogadores (humanos, IA ou rede) alterarem a simulação.
// Cada comando é validado aqui — inclusive a posse das entidades — o que permite
// que um servidor autoritativo use exatamente as mesmas regras.
import { getBuildingDef } from '../config/buildings';
import { ECONOMY, TICK_RATE } from '../config/game';
import { getTechDef } from '../config/techs';
import { getUnitDef } from '../config/units';
import { checkPlacement, rebuildTypeFor } from './buildings/placement';
import { sectorAt } from './map/mapgen';
import type { Unit, World } from './types';
import { issueGroupMove, setOrder } from './units/orders';
import { addBuilding, buildingCenter, canAfford, emit, getEntity, missingResources, refund, removeBuilding, spend } from './world';

export type Command =
  | { type: 'move'; player: number; unitIds: number[]; x: number; y: number; attackMove?: boolean }
  | { type: 'attack'; player: number; unitIds: number[]; targetId: number }
  | { type: 'stop'; player: number; unitIds: number[] }
  | { type: 'hold'; player: number; unitIds: number[] }
  | { type: 'patrol'; player: number; unitIds: number[]; x: number; y: number }
  | { type: 'follow'; player: number; unitIds: number[]; targetId: number }
  | { type: 'repair'; player: number; unitIds: number[]; targetId: number }
  | { type: 'retreat'; player: number; unitIds: number[] }
  | { type: 'build'; player: number; buildingType: string; tx: number; ty: number }
  | { type: 'rebuild'; player: number; ruinId: number }
  | { type: 'demolish'; player: number; targetId: number }
  | { type: 'train'; player: number; buildingId: number; unitType: string }
  | { type: 'cancelTrain'; player: number; buildingId: number; index: number }
  | { type: 'research'; player: number; buildingId: number; techId: string }
  | { type: 'cancelResearch'; player: number; buildingId: number }
  | { type: 'rally'; player: number; buildingId: number; x: number; y: number };

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

const MAX_QUEUE = 6;

function ownUnits(world: World, player: number, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) {
    const u = world.units.get(id);
    if (u && u.owner === player && u.hp > 0) out.push(u);
  }
  return out;
}

function fail(world: World, player: number, reason: string): CommandResult {
  emit(world, { type: 'error', player, message: reason });
  return { ok: false, reason };
}

export function applyCommand(world: World, cmd: Command): CommandResult {
  const player = world.players[cmd.player];
  if (!player || !player.alive || world.status !== 'running') return { ok: false, reason: 'Jogador inválido' };

  switch (cmd.type) {
    case 'move': {
      const units = ownUnits(world, cmd.player, cmd.unitIds);
      if (!units.length || !Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return { ok: false };
      issueGroupMove(world, units, cmd.x, cmd.y, !!cmd.attackMove);
      return { ok: true };
    }
    case 'attack': {
      const target = getEntity(world, cmd.targetId);
      if (!target || target.kind === 'ruin' || target.owner === cmd.player) return { ok: false };
      for (const u of ownUnits(world, cmd.player, cmd.unitIds)) {
        if (getUnitDef(u.type).attack) setOrder(u, { type: 'attack', targetId: target.id });
      }
      return { ok: true };
    }
    case 'stop':
      for (const u of ownUnits(world, cmd.player, cmd.unitIds)) {
        setOrder(u, { type: 'idle' });
        u.targetId = null;
      }
      return { ok: true };
    case 'hold':
      for (const u of ownUnits(world, cmd.player, cmd.unitIds)) setOrder(u, { type: 'hold', x: u.x, y: u.y });
      return { ok: true };
    case 'patrol':
      for (const u of ownUnits(world, cmd.player, cmd.unitIds)) {
        setOrder(u, { type: 'patrol', ax: u.x, ay: u.y, bx: cmd.x, by: cmd.y, toB: true });
      }
      return { ok: true };
    case 'follow': {
      const target = getEntity(world, cmd.targetId);
      if (!target || target.kind !== 'unit') return { ok: false };
      for (const u of ownUnits(world, cmd.player, cmd.unitIds)) if (u.id !== target.id) setOrder(u, { type: 'follow', targetId: target.id });
      return { ok: true };
    }
    case 'repair': {
      const target = world.buildings.get(cmd.targetId);
      if (!target || target.owner !== cmd.player) return { ok: false };
      let any = false;
      for (const u of ownUnits(world, cmd.player, cmd.unitIds)) {
        if (getUnitDef(u.type).canRepair) {
          setOrder(u, { type: 'repair', targetId: target.id });
          any = true;
        }
      }
      return any ? { ok: true } : fail(world, cmd.player, 'Nenhuma unidade selecionada pode reparar');
    }
    case 'retreat': {
      const units = ownUnits(world, cmd.player, cmd.unitIds);
      const base = findRetreatPoint(world, cmd.player);
      if (!units.length || !base) return { ok: false };
      issueGroupMove(world, units, base.x, base.y, false);
      return { ok: true };
    }
    case 'build': {
      const res = checkPlacement(world, cmd.player, cmd.buildingType, cmd.tx, cmd.ty);
      if (!res.ok) return fail(world, cmd.player, res.reason);
      const def = getBuildingDef(cmd.buildingType);
      spend(player, def.cost);
      const b = addBuilding(world, cmd.player, cmd.buildingType, cmd.tx, cmd.ty, false);
      sendIdleEngineers(world, cmd.player, b.id);
      return { ok: true };
    }
    case 'rebuild': {
      const ruin = world.ruins.get(cmd.ruinId);
      if (!ruin) return { ok: false };
      const s = sectorAt(world.map, ruin.tx, ruin.ty);
      if (s < 0 || world.sectors[s].owner !== cmd.player) return fail(world, cmd.player, 'A ruína precisa estar no seu território');
      const type = rebuildTypeFor(world, cmd.player, ruin.role);
      if (!type) return fail(world, cmd.player, 'Sua equipe não tem construção equivalente');
      const res = checkPlacement(world, cmd.player, type, ruin.tx, ruin.ty, {
        ignoreRuinId: ruin.id,
        costMult: ECONOMY.rebuildCostMult,
      });
      if (!res.ok) return fail(world, cmd.player, res.reason);
      spend(player, getBuildingDef(type).cost, ECONOMY.rebuildCostMult);
      world.ruins.delete(ruin.id);
      const b = addBuilding(world, cmd.player, type, ruin.tx, ruin.ty, false, ECONOMY.rebuildTimeMult);
      sendIdleEngineers(world, cmd.player, b.id);
      return { ok: true };
    }
    case 'demolish': {
      const ruin = world.ruins.get(cmd.targetId);
      if (ruin) {
        const s = sectorAt(world.map, ruin.tx, ruin.ty);
        if (s < 0 || world.sectors[s].owner !== cmd.player) return fail(world, cmd.player, 'A ruína precisa estar no seu território');
        world.ruins.delete(ruin.id);
        return { ok: true };
      }
      const b = world.buildings.get(cmd.targetId);
      if (!b || b.owner !== cmd.player) return { ok: false };
      if (b.demolishTicks > 0) return { ok: false };
      const def = getBuildingDef(b.type);
      if (!b.built) {
        // Cancelar uma obra devolve o custo integral.
        refund(player, def.cost);
        for (const q of b.queue) refund(player, getUnitDef(q.unitType).cost);
        removeBuilding(world, b, false);
        return { ok: true };
      }
      b.demolishTicks = Math.round(ECONOMY.demolishSeconds * TICK_RATE);
      return { ok: true };
    }
    case 'train': {
      const b = world.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player || !b.built || b.demolishTicks > 0) return { ok: false };
      const def = getBuildingDef(b.type);
      if (!def.trains?.includes(cmd.unitType)) return { ok: false };
      const udef = getUnitDef(cmd.unitType);
      if (udef.requiresTech && !player.techs.includes(udef.requiresTech)) return fail(world, cmd.player, 'Requer melhoria');
      if (b.queue.length >= MAX_QUEUE) return fail(world, cmd.player, 'Fila de produção cheia');
      if (!canAfford(player.resources, udef.cost)) {
        return fail(world, cmd.player, `Falta ${missingResources(player.resources, udef.cost).join(', ')}`);
      }
      spend(player, udef.cost);
      const total = Math.round(udef.buildTime * TICK_RATE);
      b.queue.push({ unitType: cmd.unitType, remaining: total, total });
      return { ok: true };
    }
    case 'cancelTrain': {
      const b = world.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player) return { ok: false };
      const item = b.queue[cmd.index];
      if (!item) return { ok: false };
      b.queue.splice(cmd.index, 1);
      refund(player, getUnitDef(item.unitType).cost);
      return { ok: true };
    }
    case 'research': {
      const b = world.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player || !b.built) return { ok: false };
      const def = getBuildingDef(b.type);
      if (!def.researches?.includes(cmd.techId)) return { ok: false };
      if (player.techs.includes(cmd.techId)) return fail(world, cmd.player, 'Melhoria já pesquisada');
      if (isResearching(world, cmd.player, cmd.techId)) return fail(world, cmd.player, 'Melhoria já em pesquisa');
      if (b.research) return fail(world, cmd.player, 'Já existe uma pesquisa em andamento');
      const tech = getTechDef(cmd.techId);
      if (!canAfford(player.resources, tech.cost)) {
        return fail(world, cmd.player, `Falta ${missingResources(player.resources, tech.cost).join(', ')}`);
      }
      spend(player, tech.cost);
      const total = Math.round(tech.time * TICK_RATE);
      b.research = { techId: cmd.techId, remaining: total, total };
      return { ok: true };
    }
    case 'cancelResearch': {
      const b = world.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player || !b.research) return { ok: false };
      refund(player, getTechDef(b.research.techId).cost);
      b.research = null;
      return { ok: true };
    }
    case 'rally': {
      const b = world.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player) return { ok: false };
      b.rallyX = cmd.x;
      b.rallyY = cmd.y;
      return { ok: true };
    }
  }
}

export function isResearching(world: World, player: number, techId: string): boolean {
  for (const b of world.buildings.values()) if (b.owner === player && b.research?.techId === techId) return true;
  return false;
}

export function findRetreatPoint(world: World, player: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  for (const b of world.buildings.values()) {
    if (b.owner !== player) continue;
    const def = getBuildingDef(b.type);
    if (def.role === 'hq') {
      const c = buildingCenter(b);
      return { x: c.x, y: b.ty + b.size + 1.5 };
    }
    if (def.isBase && !best) {
      const c = buildingCenter(b);
      best = { x: c.x, y: b.ty + b.size + 1.5 };
    }
  }
  return best;
}

/** Engenheiros ociosos próximos ajudam automaticamente em novas obras. */
function sendIdleEngineers(world: World, player: number, buildingId: number) {
  const b = world.buildings.get(buildingId)!;
  const c = buildingCenter(b);
  let sent = 0;
  for (const u of world.units.values()) {
    if (sent >= 2) break;
    if (u.owner !== player || u.order.type !== 'idle') continue;
    if (!getUnitDef(u.type).canRepair) continue;
    if (Math.hypot(u.x - c.x, u.y - c.y) > 18) continue;
    setOrder(u, { type: 'repair', targetId: buildingId });
    sent++;
  }
}
