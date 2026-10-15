// Remoção de entidades destruídas, eliminação de jogadores e condições de vitória.
import { getBuildingDef } from '../config/buildings';
import { SCORE, TICK_RATE } from '../config/game';
import { getUnitDef } from '../config/units';
import { sectorCount } from './territories/territory';
import type { World } from './types';
import { emit, entityPos, recomputeDerived, removeBuilding } from './world';

export function cleanupDead(world: World) {
  let dirty = false;
  for (const u of [...world.units.values()]) {
    if (u.hp > 0) continue;
    world.units.delete(u.id);
    world.players[u.owner].stats.unitsLost++;
    emit(world, { type: 'death', id: u.id, x: u.x, y: u.y, vehicle: getUnitDef(u.type).category === 'vehicle' });
    dirty = true;
  }
  for (const b of [...world.buildings.values()]) {
    if (b.hp > 0) continue;
    const p = entityPos(b);
    removeBuilding(world, b, true);
    world.players[b.owner].stats.buildingsLost++;
    emit(world, { type: 'buildingDestroyed', id: b.id, owner: b.owner, x: p.x, y: p.y, size: b.size });
    dirty = true;
  }
  if (dirty) recomputeDerived(world);
}

export function computeScore(world: World, pid: number): number {
  const p = world.players[pid];
  let buildings = 0;
  let units = 0;
  for (const b of world.buildings.values()) if (b.owner === pid && b.built) buildings++;
  for (const u of world.units.values()) if (u.owner === pid) units++;
  return Math.round(
    sectorCount(world, pid) * SCORE.perSector + buildings * SCORE.perBuilding + units * SCORE.perUnit + p.stats.kills * SCORE.perKill,
  );
}

function hasBase(world: World, pid: number): boolean {
  for (const b of world.buildings.values()) if (b.owner === pid && getBuildingDef(b.type).isBase) return true;
  return false;
}

export function eliminatePlayer(world: World, pid: number) {
  const p = world.players[pid];
  if (!p.alive) return;
  p.alive = false;
  p.eliminatedAt = world.tick;
  for (const u of [...world.units.values()]) if (u.owner === pid) world.units.delete(u.id);
  for (const b of [...world.buildings.values()]) if (b.owner === pid) removeBuilding(world, b, true);
  for (const s of world.sectors) {
    if (s.owner === pid) {
      s.owner = null;
      s.progress = 0;
      s.captureTeam = null;
    }
  }
  emit(world, { type: 'playerEliminated', player: pid });
  recomputeDerived(world);
}

export function endGame(world: World, winner: number | null, reason: string) {
  if (world.status === 'ended') return;
  world.status = 'ended';
  world.winner = winner;
  world.endReason = reason;
  emit(world, { type: 'gameOver', winner, reason });
}

export function updateVictory(world: World) {
  if (world.status !== 'running' || world.tick % TICK_RATE !== 0) return;
  const v = world.config.victory;

  for (const p of world.players) if (p.alive && !hasBase(world, p.id)) eliminatePlayer(world, p.id);

  const alive = world.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    endGame(world, alive[0]?.id ?? null, 'Bases adversárias eliminadas');
    return;
  }
  const humans = world.players.filter((p) => !p.isAI);
  if (humans.length > 0 && humans.every((p) => !p.alive)) {
    const best = alive.reduce((a, b) => (computeScore(world, a.id) >= computeScore(world, b.id) ? a : b));
    endGame(world, best.id, 'Sua base foi destruída');
    return;
  }

  if (v.domination) {
    const total = world.sectors.length;
    let leader: number | null = null;
    for (const p of alive) if (sectorCount(world, p.id) / total >= v.dominationRatio) leader = p.id;
    if (leader === null) {
      world.domination = { player: null, ticks: 0 };
    } else if (world.domination.player === leader) {
      world.domination.ticks += TICK_RATE;
      if (world.domination.ticks >= v.dominationSeconds * TICK_RATE) {
        endGame(world, leader, 'Domínio territorial');
        return;
      }
    } else {
      world.domination = { player: leader, ticks: 0 };
    }
  }

  if (v.timeLimitMinutes > 0 && world.tick >= v.timeLimitMinutes * 60 * TICK_RATE) {
    const best = alive.reduce((a, b) => (computeScore(world, a.id) >= computeScore(world, b.id) ? a : b));
    endGame(world, best.id, 'Tempo esgotado — maior pontuação');
  }
}
