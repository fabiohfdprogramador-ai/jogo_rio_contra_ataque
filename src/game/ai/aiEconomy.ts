// IA — economia: construções, engenheiros, produção de unidades e pesquisas.
import { getBuildingDef } from '../../config/buildings';
import { MAX_POP } from '../../config/game';
import { getTechDef } from '../../config/techs';
import { getUnitDef } from '../../config/units';
import { checkAvailability, checkPlacement } from '../buildings/placement';
import { isResearching } from '../commands';
import { sectorAt } from '../map/mapgen';
import { nextRandom } from '../rng';
import type { Building, BuildingRole } from '../types';
import { canAfford } from '../world';
import { type AIContext, baseAnchor, ownedSectors } from './aiContext';

function roleType(ctx: AIContext, role: BuildingRole): string | null {
  return ctx.faction.roles[role] ?? null;
}

function countRole(ctx: AIContext, role: BuildingRole): number {
  const type = roleType(ctx, role);
  if (!type) return 0;
  return ctx.buildings.filter((b) => b.type === type).length;
}

/** Decide qual construção erguer a seguir e onde. */
export function manageConstruction(ctx: AIContext) {
  const { player, profile } = ctx;
  assignEngineers(ctx);

  const inProgress = ctx.buildings.filter((b) => !b.built).length;
  if (inProgress >= profile.maxConcurrentBuilds) return;

  const candidates: BuildingRole[] = [];
  // Base perdida (apenas equipes que podem reconstruí-la).
  if (!ctx.hq) candidates.push('hq');
  // Energia insuficiente para o que já existe ou está em obra.
  let pendingDemand = 0;
  for (const b of ctx.buildings) if (!b.built) pendingDemand += Math.max(0, -getBuildingDef(b.type).energy);
  if (player.energyDemand + pendingDemand + 4 > player.energySupply) candidates.push('power');
  // População perto do limite.
  if (player.popUsed >= player.popCap - 3 && player.popCap < MAX_POP) candidates.push('logistics', 'outpost');

  const order = profile.buildOrder;
  const seen = new Map<BuildingRole, number>();
  for (const role of order) {
    const need = (seen.get(role) ?? 0) + 1;
    seen.set(role, need);
    if (countRole(ctx, role) < need) candidates.push(role);
  }
  // Depois da ordem básica, reforça defesas e logística quando sobra dinheiro.
  if (player.resources.money > 900) candidates.push('defense', 'logistics', 'garage');

  for (const role of candidates) {
    const type = roleType(ctx, role);
    if (!type) continue;
    const av = checkAvailability(ctx.world, player.id, type);
    if (!av.ok) {
      // Falta de recursos: reserva o dinheiro e espera juntar em vez de pular para algo mais barato.
      if (av.reason.startsWith('Falta')) {
        ctx.reserve = getBuildingDef(type).cost.money ?? 0;
        return;
      }
      continue;
    }
    if (tryRebuildRuin(ctx, role)) return;
    const spot = findSpot(ctx, type, role);
    if (!spot) continue;
    ctx.issue({ type: 'build', player: player.id, buildingType: type, tx: spot.x, ty: spot.y });
    return;
  }
}

function tryRebuildRuin(ctx: AIContext, role: BuildingRole): boolean {
  for (const r of ctx.world.ruins.values()) {
    if (r.role !== role) continue;
    const s = sectorAt(ctx.world.map, r.tx, r.ty);
    if (s < 0 || ctx.world.sectors[s].owner !== ctx.player.id) continue;
    const type = roleType(ctx, role)!;
    const res = checkPlacement(ctx.world, ctx.player.id, type, r.tx, r.ty, { ignoreRuinId: r.id, costMult: 0.6 });
    if (res.ok) {
      ctx.issue({ type: 'rebuild', player: ctx.player.id, ruinId: r.id });
      return true;
    }
  }
  return false;
}

/** Busca em espiral um local válido próximo à base (defesas vão para a frente). */
export function findSpot(ctx: AIContext, type: string, role: BuildingRole): { x: number; y: number } | null {
  const def = getBuildingDef(type);
  let anchor = baseAnchor(ctx);
  const owned = ownedSectors(ctx);
  if (role === 'defense' || role === 'outpost') {
    // Ponto de controle de um setor próprio de fronteira, escolhido de forma determinística.
    const frontier = owned.filter((i) => i !== sectorAt(ctx.world.map, anchor.x, anchor.y));
    if (frontier.length) {
      const pick = frontier[Math.floor(nextRandom(ctx.world) * frontier.length)];
      const s = ctx.world.map.sectors[pick];
      anchor = { x: s.cx, y: s.cy };
    }
  }
  if (role === 'hq' && owned.length) {
    const s = ctx.world.map.sectors[owned[0]];
    anchor = { x: s.cx, y: s.cy };
  }
  const ax = Math.floor(anchor.x - def.size / 2);
  const ay = Math.floor(anchor.y - def.size / 2);
  for (let r = 0; r <= 26; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = ax + dx;
        const ty = ay + dy;
        if (checkPlacement(ctx.world, ctx.player.id, type, tx, ty, { skipAvailability: true }).ok) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

/** Engenheiros ajudam obras e reparam estruturas danificadas. */
function assignEngineers(ctx: AIContext) {
  const jobs: Building[] = ctx.buildings
    .filter((b) => !b.built || b.hp < b.maxHp * 0.7)
    .sort((a, b) => Number(a.built) - Number(b.built));
  if (!jobs.length) return;
  for (const e of ctx.engineers) {
    if (e.order.type !== 'idle') continue;
    const job = jobs[0];
    ctx.issue({ type: 'repair', player: ctx.player.id, unitIds: [e.id], targetId: job.id });
  }
}

/** Mantém engenheiros e um exército com composição variada. */
export function manageProduction(ctx: AIContext) {
  const { player, profile, world } = ctx;
  const producers = ctx.buildings.filter((b) => b.built && b.demolishTicks === 0 && getBuildingDef(b.type).trains);
  let queuedPop = 0;
  for (const b of producers) for (const q of b.queue) queuedPop += getUnitDef(q.unitType).pop;
  const popRoom = player.popCap - player.popUsed - queuedPop;

  // Engenheiros
  const engQueued = producers.reduce((n, b) => n + b.queue.filter((q) => getUnitDef(q.unitType).canRepair && !getUnitDef(q.unitType).attack).length, 0);
  if (ctx.engineers.length + engQueued < profile.engineers && popRoom > 0) {
    const src = producers.find((b) => getBuildingDef(b.type).trains!.some((t) => getUnitDef(t).canRepair && !getUnitDef(t).attack));
    if (src) {
      const t = getBuildingDef(src.type).trains!.find((x) => getUnitDef(x).canRepair && !getUnitDef(x).attack)!;
      if (canAfford(player.resources, getUnitDef(t).cost)) {
        ctx.issue({ type: 'train', player: player.id, buildingId: src.id, unitType: t });
        return;
      }
    }
  }

  // Unidades de combate
  let room = popRoom;
  for (const b of producers) {
    if (b.queue.length >= 2 || room <= 0) continue;
    const def = getBuildingDef(b.type);
    if (def.role === 'hq') continue;
    const options = def.trains!.filter((t) => {
      const u = getUnitDef(t);
      if (u.requiresTech && !player.techs.includes(u.requiresTech)) return false;
      if (u.canRepair && !u.attack && !u.heal) return false; // engenheiros já tratados acima
      return true;
    });
    if (!options.length) continue;
    const choice = pickUnit(ctx, options);
    const cost = getUnitDef(choice).cost;
    // Com poucas unidades, a defesa tem prioridade sobre a reserva para construções.
    const reserve = ctx.combat.length < 4 ? profile.moneyReserve : Math.max(profile.moneyReserve, ctx.reserve);
    if (player.resources.money - (cost.money ?? 0) < reserve) continue;
    if (!canAfford(player.resources, cost)) continue;
    ctx.issue({ type: 'train', player: player.id, buildingId: b.id, unitType: choice });
    room -= getUnitDef(choice).pop;
  }

  // Pontos de reunião na frente da base
  const anchor = baseAnchor(ctx);
  const cx = world.map.width / 2;
  const cy = world.map.height / 2;
  const d = Math.hypot(cx - anchor.x, cy - anchor.y) || 1;
  const rx = anchor.x + ((cx - anchor.x) / d) * 7;
  const ry = anchor.y + ((cy - anchor.y) / d) * 7;
  for (const b of producers) {
    if (b.rallyX === null) ctx.issue({ type: 'rally', player: player.id, buildingId: b.id, x: rx, y: ry });
  }
}

function pickUnit(ctx: AIContext, options: string[]): string {
  const supports = ctx.units.filter((u) => getUnitDef(u.type).heal).length;
  const scouts = ctx.units.filter((u) => getUnitDef(u.type).model === 'scout').length;
  const weights = options.map((t) => {
    const u = getUnitDef(t);
    if (u.heal) return supports < Math.max(1, ctx.combat.length / 6) ? 1.2 : 0.05;
    if (u.model === 'scout') return scouts < 1 ? 1.5 : 0.25;
    // Unidades mais fortes recebem peso maior conforme a partida avança.
    const minutes = ctx.world.tick / 600;
    const power = (u.attack!.damage / u.attack!.cooldown) * u.hp;
    return 1 + Math.min(2, minutes / 6) * Math.log10(power / 500 + 1);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = nextRandom(ctx.world) * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

export function manageResearch(ctx: AIContext) {
  if (!ctx.profile.researches) return;
  const { player } = ctx;
  for (const b of ctx.buildings) {
    if (!b.built || b.research) continue;
    const list = getBuildingDef(b.type).researches;
    if (!list) continue;
    for (const techId of list) {
      if (player.techs.includes(techId) || isResearching(ctx.world, player.id, techId)) continue;
      const cost = getTechDef(techId).cost;
      if (player.resources.money < (cost.money ?? 0) + 200 || !canAfford(player.resources, cost)) continue;
      ctx.issue({ type: 'research', player: player.id, buildingId: b.id, techId });
      return;
    }
  }
}
