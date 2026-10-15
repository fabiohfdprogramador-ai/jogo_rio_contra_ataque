// IA — decisões militares: defesa, exploração, expansão, ataque e recuo.
import { getBuildingDef } from '../../config/buildings';
import { TICK_RATE } from '../../config/game';
import { SECTOR_TYPES } from '../../config/sectors';
import { getUnitDef } from '../../config/units';
import { sectorAt, sectorNeighbors } from '../map/mapgen';
import { sectorHasProtectedHQ } from '../territories/territory';
import type { Unit } from '../types';
import { type AIContext, baseAnchor, enemiesInOwnTerritory, ownedSectors, strengthOf } from './aiContext';

function alive(ctx: AIContext, ids: number[]): Unit[] {
  const out: Unit[] = [];
  for (const id of ids) {
    const u = ctx.world.units.get(id);
    if (u && u.hp > 0) out.push(u);
  }
  return out;
}

function ids(units: Unit[]): number[] {
  return units.map((u) => u.id);
}

function centroid(units: { x: number; y: number }[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const u of units) {
    x += u.x;
    y += u.y;
  }
  return { x: x / units.length, y: y / units.length };
}

export function manageMilitary(ctx: AIContext) {
  const { mem, world, player, profile } = ctx;
  const attackGroup = alive(ctx, mem.attackGroup);
  const expandGroup = alive(ctx, mem.expandGroup);
  mem.attackGroup = ids(attackGroup);
  mem.expandGroup = ids(expandGroup);
  if (mem.scoutId !== null && !world.units.get(mem.scoutId)) mem.scoutId = null;

  const busy = new Set<number>([...mem.attackGroup, ...mem.expandGroup]);
  if (mem.scoutId !== null) busy.add(mem.scoutId);
  const home = ctx.combat.filter((u) => !busy.has(u.id));

  // 1. Defesa da base
  const threats = enemiesInOwnTerritory(ctx).filter((e) =>
    ctx.buildings.some((b) => Math.hypot(b.tx + b.size / 2 - e.x, b.ty + b.size / 2 - e.y) < 16),
  );
  if (threats.length) {
    mem.defending = true;
    const threatStrength = strengthOf(threats);
    const defenders = [...home];
    // Ameaça grande: chama de volta o grupo de ataque.
    if (threatStrength > strengthOf(home) && attackGroup.length) {
      defenders.push(...attackGroup);
      mem.attackGroup = [];
      mem.attackTarget = null;
    }
    if (defenders.length) {
      if (profile.focusFire) {
        const weakest = threats.reduce((a, b) => (a.hp < b.hp ? a : b));
        ctx.issue({ type: 'attack', player: player.id, unitIds: ids(defenders), targetId: weakest.id });
      } else {
        const c = centroid(threats);
        ctx.issue({ type: 'move', player: player.id, unitIds: ids(defenders), x: c.x, y: c.y, attackMove: true });
      }
    }
  } else if (mem.defending) {
    mem.defending = false;
    const rally = rallyPoint(ctx);
    const idle = home.filter((u) => u.order.type === 'idle');
    if (idle.length) ctx.issue({ type: 'move', player: player.id, unitIds: ids(idle), x: rally.x, y: rally.y, attackMove: true });
  }

  manageScout(ctx, home);
  manageExpansion(ctx, home.filter((u) => u.id !== mem.scoutId), threats.length > 0);
  manageAttack(ctx, home.filter((u) => u.id !== mem.scoutId && !mem.expandGroup.includes(u.id)), threats.length > 0);

  // Unidades ociosas espalhadas voltam ao ponto de reunião.
  if (world.tick % (TICK_RATE * 10) < profile.thinkInterval) {
    const rally = rallyPoint(ctx);
    const stray = home.filter(
      (u) => u.order.type === 'idle' && !mem.expandGroup.includes(u.id) && u.id !== mem.scoutId && Math.hypot(u.x - rally.x, u.y - rally.y) > 12,
    );
    if (stray.length && !mem.defending) {
      ctx.issue({ type: 'move', player: player.id, unitIds: ids(stray), x: rally.x, y: rally.y, attackMove: true });
    }
  }
}

function rallyPoint(ctx: AIContext): { x: number; y: number } {
  const a = baseAnchor(ctx);
  const cx = ctx.world.map.width / 2;
  const cy = ctx.world.map.height / 2;
  const d = Math.hypot(cx - a.x, cy - a.y) || 1;
  return { x: a.x + ((cx - a.x) / d) * 7, y: a.y + ((cy - a.y) / d) * 7 };
}

/** No início, uma unidade rápida visita os pontos de controle para explorar o mapa. */
function manageScout(ctx: AIContext, home: Unit[]) {
  const { mem, world, player } = ctx;
  if (world.tick > 240 * TICK_RATE && mem.scoutId === null) return;
  if (mem.scoutId === null) {
    const fast = home.filter((u) => getUnitDef(u.type).model === 'scout' || getUnitDef(u.type).model === 'moto');
    if (!fast.length) return;
    mem.scoutId = fast[0].id;
    const a = baseAnchor(ctx);
    mem.scoutQueue = world.map.sectors
      .filter((s) => world.sectors[s.id].owner !== player.id)
      .sort((x, y) => Math.hypot(x.cx - a.x, x.cy - a.y) - Math.hypot(y.cx - a.x, y.cy - a.y))
      .map((s) => s.id);
  }
  const scout = world.units.get(mem.scoutId!);
  if (!scout) {
    mem.scoutId = null;
    return;
  }
  if (scout.order.type === 'idle') {
    const next = mem.scoutQueue.shift();
    if (next === undefined) {
      mem.scoutId = null; // exploração concluída: volta a ser unidade comum
      return;
    }
    const s = world.map.sectors[next];
    ctx.issue({ type: 'move', player: player.id, unitIds: [scout.id], x: s.cx, y: s.cy, attackMove: false });
  }
}

/** Valor de um setor para a IA (renda + proximidade da base). */
function sectorValue(ctx: AIContext, id: number): number {
  const s = ctx.world.map.sectors[id];
  const inc = SECTOR_TYPES[s.type].income;
  const a = baseAnchor(ctx);
  const value = (inc.money ?? 0) + (inc.materials ?? 0) * 1.2 + (inc.fuel ?? 0) * 1.3 + SECTOR_TYPES[s.type].energy * 3;
  return value - Math.hypot(s.cx - a.x, s.cy - a.y) * 1.5;
}

function manageExpansion(ctx: AIContext, available: Unit[], underThreat: boolean) {
  const { mem, world, player, profile } = ctx;
  if (mem.expandTarget !== null) {
    const st = world.sectors[mem.expandTarget];
    const group = alive(ctx, mem.expandGroup);
    if (st.owner === player.id || group.length === 0) {
      // Concluído (ou grupo perdido): libera as unidades.
      mem.expandTarget = null;
      mem.expandGroup = [];
    } else {
      // Mantém o grupo no ponto de controle.
      const s = world.map.sectors[mem.expandTarget];
      const away = group.filter((u) => u.order.type === 'idle' && Math.hypot(u.x - s.cx, u.y - s.cy) > 3.5);
      if (away.length) ctx.issue({ type: 'move', player: player.id, unitIds: ids(away), x: s.cx, y: s.cy, attackMove: true });
      return;
    }
  }
  if (underThreat) return;

  // Setores vizinhos ao território próprio, neutros (ou inimigos sem QG quando não há neutros).
  const owned = ownedSectors(ctx);
  const frontier = new Set<number>();
  for (const s of owned) for (const n of sectorNeighbors(world.map, s)) if (world.sectors[n].owner !== player.id) frontier.add(n);
  const capturers = available.filter((u) => getUnitDef(u.type).canCapture && u.order.type === 'idle');
  if (capturers.length < profile.expandSquad) return;
  // Neutros primeiro; depois setores inimigos vizinhos pouco defendidos (sem QG).
  let candidates = [...frontier].filter((i) => world.sectors[i].owner === null);
  let squadSize = profile.expandSquad;
  if (!candidates.length) {
    candidates = [...frontier].filter((i) => {
      const st = world.sectors[i];
      if (st.owner === null || sectorHasProtectedHQ(world, i, st.owner)) return false;
      const s = world.map.sectors[i];
      const defenders = ctx.visibleEnemies.filter((e) => Math.hypot(e.x - s.cx, e.y - s.cy) < 10);
      return strengthOf(defenders) * profile.attackAdvantage < strengthOf(capturers);
    });
    squadSize = Math.max(profile.expandSquad, Math.ceil(capturers.length * 0.6));
  }
  if (!candidates.length) return;
  candidates = candidates.sort((a, b) => sectorValue(ctx, b) - sectorValue(ctx, a));
  const target = candidates[0];
  const s = world.map.sectors[target];
  const group = capturers
    .sort((a, b) => Math.hypot(a.x - s.cx, a.y - s.cy) - Math.hypot(b.x - s.cx, b.y - s.cy))
    .slice(0, squadSize);
  mem.expandTarget = target;
  mem.expandGroup = ids(group);
  ctx.issue({ type: 'move', player: player.id, unitIds: mem.expandGroup, x: s.cx, y: s.cy, attackMove: true });
}

function pickAttackTarget(ctx: AIContext, from: { x: number; y: number }): number | null {
  const { world, player } = ctx;
  let best: number | null = null;
  let bestScore = Infinity;
  world.sectors.forEach((st, i) => {
    if (st.owner === null || st.owner === player.id) return;
    const s = world.map.sectors[i];
    // Setores com QG ficam por último: exigem destruir a base.
    const penalty = sectorHasProtectedHQ(world, i, st.owner) ? 30 : 0;
    const score = Math.hypot(s.cx - from.x, s.cy - from.y) + penalty;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function attackPointFor(ctx: AIContext, sector: number): { x: number; y: number } {
  const { world } = ctx;
  const st = world.sectors[sector];
  const s = world.map.sectors[sector];
  if (st.owner !== null && sectorHasProtectedHQ(world, sector, st.owner)) {
    for (const b of world.buildings.values()) {
      if (b.owner === st.owner && getBuildingDef(b.type).role === 'hq' && sectorAt(world.map, b.tx, b.ty) === sector) {
        return { x: b.tx + b.size / 2, y: b.ty + b.size + 1 };
      }
    }
  }
  return { x: s.cx, y: s.cy };
}

function manageAttack(ctx: AIContext, available: Unit[], underThreat: boolean) {
  const { mem, world, player, profile } = ctx;
  const group = alive(ctx, mem.attackGroup);

  if (mem.attackTarget !== null) {
    if (!group.length) {
      mem.attackTarget = null;
      mem.attackGroup = [];
      return;
    }
    const strength = strengthOf(group);
    const c = centroid(group);
    const nearbyEnemies = ctx.visibleEnemies.filter((e) => Math.hypot(e.x - c.x, e.y - c.y) < 12);
    // Recuo quando o grupo foi muito desgastado e está em desvantagem local.
    if (
      profile.canRetreat &&
      strength < mem.attackStartStrength * profile.retreatThreshold &&
      strengthOf(nearbyEnemies) > strength
    ) {
      ctx.issue({ type: 'retreat', player: player.id, unitIds: mem.attackGroup });
      mem.attackTarget = null;
      mem.attackGroup = [];
      mem.lastAttackTick = world.tick;
      return;
    }
    const st = world.sectors[mem.attackTarget];
    if (st.owner === player.id) {
      // Setor conquistado: avança para o próximo alvo.
      const next = pickAttackTarget(ctx, c);
      if (next === null) {
        mem.attackTarget = null;
        mem.attackGroup = [];
        return;
      }
      mem.attackTarget = next;
    }
    // Reforços (dificuldades maiores enviam unidades novas para o grupo).
    if (profile.focusFire && !underThreat) {
      const fresh = available.filter((u) => u.order.type === 'idle' && getUnitDef(u.type).canCapture);
      if (fresh.length >= 3) {
        mem.attackGroup.push(...ids(fresh));
        const p = attackPointFor(ctx, mem.attackTarget);
        ctx.issue({ type: 'move', player: player.id, unitIds: ids(fresh), x: p.x, y: p.y, attackMove: true });
      }
    }
    const p = attackPointFor(ctx, mem.attackTarget);
    const idle = group.filter((u) => u.order.type === 'idle' && Math.hypot(u.x - p.x, u.y - p.y) > 3);
    if (idle.length) ctx.issue({ type: 'move', player: player.id, unitIds: ids(idle), x: p.x, y: p.y, attackMove: true });
    return;
  }

  if (underThreat) return;
  // Um adversário perto da vitória por domínio força um contra-ataque imediato.
  const emergency = world.domination.player !== null && world.domination.player !== player.id;
  const fighters = available.filter((u) => getUnitDef(u.type).canCapture || getUnitDef(u.type).heal);
  const armed = fighters.filter((u) => getUnitDef(u.type).attack).length;
  if (!emergency) {
    if (world.tick < profile.firstAttackAfter * TICK_RATE) return;
    if (world.tick - mem.lastAttackTick < 45 * TICK_RATE) return;
    if (armed < profile.attackMinUnits) return;
  } else if (armed < 3) {
    return;
  }

  const target = pickAttackTarget(ctx, baseAnchor(ctx));
  if (target === null) return;
  // Estima a força inimiga pelo que é visível perto do alvo (ou pelo tamanho do alvo).
  const s = world.map.sectors[target];
  const knownNear = ctx.visibleEnemies.filter((e) => Math.hypot(e.x - s.cx, e.y - s.cy) < 16);
  const estimate = Math.max(strengthOf(knownNear), strengthOf(fighters) * 0.5);
  if (!emergency && strengthOf(fighters) < estimate * profile.attackAdvantage) return;

  // Mantém alguns defensores em casa.
  const keep = profile.canRetreat ? 2 : 0;
  const sorted = [...fighters].sort((a, b) => a.id - b.id);
  const squad = sorted.slice(0, Math.max(profile.attackMinUnits, sorted.length - keep));
  mem.attackGroup = ids(squad);
  mem.attackTarget = target;
  mem.attackStartStrength = strengthOf(squad);
  mem.lastAttackTick = world.tick;
  const p = attackPointFor(ctx, target);
  ctx.issue({ type: 'move', player: player.id, unitIds: mem.attackGroup, x: p.x, y: p.y, attackMove: true });
}
