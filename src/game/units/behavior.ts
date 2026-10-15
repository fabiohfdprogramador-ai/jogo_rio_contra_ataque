// Comportamento das unidades a cada tick: execução das ordens, deslocamento,
// combate, reparo, cura e separação entre unidades.
import { getBuildingDef } from '../../config/buildings';
import { COMBAT, ECONOMY, TICK_RATE } from '../../config/game';
import { getUnitDef } from '../../config/units';
import { fire } from '../combat/damage';
import { isWalkable } from '../map/grid';
import { findPath } from '../pathfinding/astar';
import type { Building, Entity, Unit, UnitDef, World } from '../types';
import { distToEntity, entityPos, getEntity } from '../world';
import { NO_GOAL, setOrder } from './orders';
import type { SpatialHash } from './spatial';

type MoveResult = 'moving' | 'arrived' | 'failed';

export function isVisibleTo(world: World, player: number, e: Entity): boolean {
  if (!world.config.fogOfWar) return true;
  const vis = world.visibility[player];
  const { width } = world.map;
  if (e.kind === 'unit') return vis[Math.floor(e.y) * width + Math.floor(e.x)] === 2;
  // Construções: visíveis se qualquer tile estiver visível.
  for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (vis[y * width + x] === 2) return true;
  return false;
}

function isValidTarget(e: Entity | undefined, owner: number): e is Unit | Building {
  return !!e && e.kind !== 'ruin' && e.owner !== owner && e.hp > 0;
}

/** Procura o inimigo mais relevante dentro do raio. */
export function acquireTarget(world: World, hash: SpatialHash, x: number, y: number, owner: number, radius: number, preferId: number | null): Unit | Building | null {
  if (preferId !== null) {
    const pref = getEntity(world, preferId);
    if (isValidTarget(pref, owner) && distToEntity(x, y, pref) <= radius) return pref;
  }
  let best: Unit | Building | null = null;
  let bestScore = Infinity;
  hash.query(x, y, radius, (u, d) => {
    if (u.owner === owner) return;
    const armed = getUnitDef(u.type).attack ? 0 : 2.5;
    const score = d + armed;
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  });
  if (best) return best;
  for (const b of world.buildings.values()) {
    if (b.owner === owner || b.hp <= 0) continue;
    const d = distToEntity(x, y, b);
    if (d > radius) continue;
    const score = d + (getBuildingDef(b.type).attack ? 0 : 3);
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function followPath(world: World, u: Unit, speed: number): boolean {
  let remaining = speed;
  while (remaining > 0 && u.path && u.pathIdx < u.path.length) {
    const wp = u.path[u.pathIdx];
    const dx = wp.x - u.x;
    const dy = wp.y - u.y;
    const d = Math.hypot(dx, dy);
    let nx: number;
    let ny: number;
    if (d <= remaining) {
      nx = wp.x;
      ny = wp.y;
      remaining -= d;
      u.pathIdx++;
    } else {
      nx = u.x + (dx / d) * remaining;
      ny = u.y + (dy / d) * remaining;
      remaining = 0;
    }
    if (!isWalkable(world, Math.floor(nx), Math.floor(ny))) {
      // Caminho obstruído (ex.: nova construção): força recálculo.
      u.path = null;
      u.pathGoalX = NO_GOAL;
      return false;
    }
    if (d > 0.001) u.facing = Math.atan2(dy, dx);
    u.x = nx;
    u.y = ny;
  }
  if (u.path && u.pathIdx >= u.path.length) {
    u.path = null;
    return true;
  }
  return false;
}

function moveTo(world: World, u: Unit, x: number, y: number, speed: number): MoveResult {
  if (u.repathTicks > 0) u.repathTicks--;
  const goalMoved = Math.hypot(u.pathGoalX - x, u.pathGoalY - y) > 0.75;
  if (goalMoved && (u.repathTicks === 0 || !u.path)) {
    u.pathGoalX = x;
    u.pathGoalY = y;
    u.path = findPath(world, u.x, u.y, x, y);
    u.pathIdx = 0;
    u.repathTicks = 8;
    if (!u.path) return 'failed';
  }
  if (!u.path) return 'arrived';
  // Preso por muito tempo perto do destino: considera que chegou.
  if (u.stuckTicks > 15) {
    u.stuckTicks = 0;
    if (Math.hypot(u.x - x, u.y - y) < 2.5) {
      u.path = null;
      return 'arrived';
    }
    u.pathGoalX = NO_GOAL;
    u.repathTicks = 0;
    return 'moving';
  }
  return followPath(world, u, speed) ? 'arrived' : 'moving';
}

function engage(world: World, u: Unit, def: UnitDef, target: Unit | Building, speed: number, allowMove: boolean): void {
  const atk = def.attack!;
  const d = distToEntity(u.x, u.y, target);
  if (d <= atk.range) {
    u.path = null;
    u.pathGoalX = NO_GOAL;
    const p = entityPos(target);
    u.facing = Math.atan2(p.y - u.y, p.x - u.x);
    if (u.cooldown <= 0) {
      fire(world, u, target, def.category === 'vehicle' && atk.damage >= 25);
      u.cooldown = Math.max(1, Math.round(atk.cooldown * TICK_RATE));
    }
  } else if (allowMove) {
    const p = entityPos(target);
    moveTo(world, u, p.x, p.y, speed);
  }
}

export function updateUnits(world: World, hash: SpatialHash) {
  for (const u of world.units.values()) {
    if (u.hp <= 0) continue;
    const def = getUnitDef(u.type);
    const player = world.players[u.owner];
    const speed = (def.speed * player.mods.unitSpeed) / TICK_RATE;

    // Detecção de travamento (comparando com a posição do tick anterior).
    const moved = Math.hypot(u.x - u.px, u.y - u.py);
    if (u.path && moved < speed * 0.3) u.stuckTicks++;
    else u.stuckTicks = 0;
    u.px = u.x;
    u.py = u.y;
    if (u.cooldown > 0) u.cooldown--;

    updateUnit(world, hash, u, def, speed);
  }
  separate(world, hash);
  applyHealing(world, hash);
}

function updateUnit(world: World, hash: SpatialHash, u: Unit, def: UnitDef, speed: number) {
  const sight = def.sight * world.players[u.owner].mods.vision;
  const canAttack = !!def.attack;
  let target = getEntity(world, u.targetId);
  if (!isValidTarget(target, u.owner)) {
    u.targetId = null;
    target = undefined;
  }
  const scan = (world.tick + u.id) % 4 === 0;
  const retaliate = u.attackedBy !== null && world.tick - u.lastAttackTick < COMBAT.retaliateMemory ? u.attackedBy : null;
  const order = u.order;

  switch (order.type) {
    case 'idle': {
      if (canAttack) {
        if (!target && (scan || retaliate !== null)) {
          target = acquireTarget(world, hash, u.x, u.y, u.owner, sight, retaliate) ?? undefined;
          u.targetId = target?.id ?? null;
        }
        if (target) {
          const p = entityPos(target);
          if (Math.hypot(p.x - u.anchorX, p.y - u.anchorY) > COMBAT.idleLeash + def.attack!.range) {
            u.targetId = null;
          } else {
            engage(world, u, def, target, speed, true);
            return;
          }
        }
      } else if (def.canRepair && scan) {
        autoRepair(world, u);
        if (u.order.type !== 'idle') return;
      }
      if (Math.hypot(u.x - u.anchorX, u.y - u.anchorY) > 1.5) moveTo(world, u, u.anchorX, u.anchorY, speed);
      else u.path = null;
      return;
    }
    case 'move': {
      if (order.attackMove && canAttack) {
        if (!target && scan) {
          target = acquireTarget(world, hash, u.x, u.y, u.owner, sight, null) ?? undefined;
          u.targetId = target?.id ?? null;
        }
        if (target) {
          engage(world, u, def, target, speed, true);
          return;
        }
      }
      const r = moveTo(world, u, order.x, order.y, speed);
      if (r !== 'moving') {
        setOrder(u, { type: 'idle' });
        u.anchorX = u.x;
        u.anchorY = u.y;
      }
      return;
    }
    case 'attack': {
      const t = getEntity(world, order.targetId);
      if (!isValidTarget(t, u.owner) || !isVisibleTo(world, u.owner, t) || !canAttack) {
        setOrder(u, { type: 'idle' });
        u.anchorX = u.x;
        u.anchorY = u.y;
        return;
      }
      u.targetId = t.id;
      engage(world, u, def, t, speed, true);
      return;
    }
    case 'hold': {
      if (!canAttack) return;
      if (!target || distToEntity(u.x, u.y, target) > def.attack!.range) {
        target = scan || retaliate !== null ? acquireTarget(world, hash, u.x, u.y, u.owner, def.attack!.range, retaliate) ?? undefined : undefined;
        u.targetId = target?.id ?? null;
      }
      if (target) engage(world, u, def, target, speed, false);
      return;
    }
    case 'patrol': {
      if (canAttack) {
        if (!target && scan) {
          target = acquireTarget(world, hash, u.x, u.y, u.owner, sight, null) ?? undefined;
          u.targetId = target?.id ?? null;
        }
        if (target) {
          engage(world, u, def, target, speed, true);
          return;
        }
      }
      const tx = order.toB ? order.bx : order.ax;
      const ty = order.toB ? order.by : order.ay;
      if (moveTo(world, u, tx, ty, speed) !== 'moving') {
        order.toB = !order.toB;
        u.pathGoalX = NO_GOAL;
      }
      return;
    }
    case 'follow': {
      const t = world.units.get(order.targetId);
      if (!t || t.hp <= 0) {
        setOrder(u, { type: 'idle' });
        u.anchorX = u.x;
        u.anchorY = u.y;
        return;
      }
      if (Math.hypot(t.x - u.x, t.y - u.y) > 2.5) moveTo(world, u, t.x, t.y, speed);
      else u.path = null;
      return;
    }
    case 'repair': {
      const b = world.buildings.get(order.targetId);
      if (!b || b.owner !== u.owner || (b.built && b.hp >= b.maxHp)) {
        setOrder(u, { type: 'idle' });
        u.anchorX = u.x;
        u.anchorY = u.y;
        return;
      }
      if (distToEntity(u.x, u.y, b) > 1.3) {
        const c = entityPos(b);
        moveTo(world, u, c.x, c.y, speed);
        return;
      }
      u.path = null;
      // Obras em andamento são aceleradas pelo sistema de construção.
      if (b.built) {
        const player = world.players[u.owner];
        const hp = ECONOMY.repairHpPerSecond / TICK_RATE;
        const cost = hp * ECONOMY.repairMaterialPerHp;
        if (player.resources.materials < cost) {
          setOrder(u, { type: 'idle' });
          return;
        }
        player.resources.materials -= cost;
        b.hp = Math.min(b.maxHp, b.hp + hp);
      }
      return;
    }
  }
}

/** Engenheiros ociosos procuram obras ou estruturas danificadas por perto. */
function autoRepair(world: World, u: Unit) {
  let best: Building | null = null;
  let bestD = 9;
  for (const b of world.buildings.values()) {
    if (b.owner !== u.owner) continue;
    if (b.built && b.hp >= b.maxHp) continue;
    const d = distToEntity(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (best) setOrder(u, { type: 'repair', targetId: best.id });
}

function radiusOf(u: Unit): number {
  return getUnitDef(u.type).category === 'vehicle' ? 0.45 : 0.28;
}

/** Empurra unidades sobrepostas para evitar que ocupem o mesmo ponto. */
function separate(world: World, hash: SpatialHash) {
  for (const u of world.units.values()) {
    if (u.hp <= 0) continue;
    const ru = radiusOf(u);
    hash.query(u.x, u.y, 1.0, (o, d) => {
      if (o.id <= u.id) return;
      const min = ru + radiusOf(o);
      if (d >= min) return;
      let dx = o.x - u.x;
      let dy = o.y - u.y;
      if (d < 0.0001) {
        // Desempate determinístico
        dx = ((u.id * 7) % 5) - 2 || 1;
        dy = ((o.id * 3) % 5) - 2 || 1;
      }
      const len = Math.hypot(dx, dy);
      const push = ((min - d) / 2) * 0.5;
      const px = (dx / len) * push;
      const py = (dy / len) * push;
      // Unidades paradas cedem mais espaço para as que estão em movimento.
      const uw = u.path ? 0.3 : 1;
      const ow = o.path ? 0.3 : 1;
      tryShift(world, u, -px * uw, -py * uw);
      tryShift(world, o, px * ow, py * ow);
    });
  }
}

function tryShift(world: World, u: Unit, dx: number, dy: number) {
  const nx = u.x + dx;
  const ny = u.y + dy;
  if (isWalkable(world, Math.floor(nx), Math.floor(ny))) {
    u.x = nx;
    u.y = ny;
  }
}

function applyHealing(world: World, hash: SpatialHash) {
  for (const u of world.units.values()) {
    if (u.hp <= 0) continue;
    const def = getUnitDef(u.type);
    if (!def.heal) continue;
    let best: Unit | null = null;
    let bestMissing = 0.5;
    hash.query(u.x, u.y, def.heal.radius, (o) => {
      if (o.owner !== u.owner || o.id === u.id) return;
      const cat = getUnitDef(o.type).category;
      if (def.heal!.targets !== 'all' && cat !== def.heal!.targets) return;
      const missing = o.maxHp - o.hp;
      if (missing > bestMissing) {
        bestMissing = missing;
        best = o;
      }
    });
    if (best) {
      const b = best as Unit;
      b.hp = Math.min(b.maxHp, b.hp + def.heal.amount / TICK_RATE);
    }
  }
  // Aura de regeneração de construções (ex.: posto avançado da milícia).
  for (const b of world.buildings.values()) {
    if (!b.built) continue;
    const aura = getBuildingDef(b.type).regenAura;
    if (!aura) continue;
    const c = entityPos(b);
    hash.query(c.x, c.y, aura.radius, (o) => {
      if (o.owner === b.owner && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + aura.amount / TICK_RATE);
    });
  }
}
