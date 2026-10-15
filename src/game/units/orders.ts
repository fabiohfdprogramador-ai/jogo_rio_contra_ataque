// Emissão de ordens para unidades (incluindo formação para movimentos em grupo).
import { isWalkable } from '../map/grid';
import type { Order, Unit, World } from '../types';

/** Valor sentinela que força o recálculo de rota no próximo tick. */
export const NO_GOAL = -99999;

export function setOrder(u: Unit, order: Order) {
  u.order = order;
  u.path = null;
  u.pathGoalX = NO_GOAL;
  u.pathGoalY = NO_GOAL;
  u.repathTicks = 0;
  u.stuckTicks = 0;
  if (order.type !== 'attack') u.targetId = null;
}

/**
 * Distribui as unidades em posições próximas ao destino, sem que todas
 * disputem exatamente o mesmo ponto.
 */
export function formationSlots(world: World, x: number, y: number, count: number): { x: number; y: number }[] {
  if (count === 1) return [{ x, y }];
  const slots: { x: number; y: number; d: number }[] = [];
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const radius = Math.ceil(Math.sqrt(count)) + 3;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (!isWalkable(world, tx, ty)) continue;
      slots.push({ x: tx + 0.5, y: ty + 0.5, d: dx * dx + dy * dy });
    }
  }
  slots.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const out = slots.slice(0, count).map((s) => ({ x: s.x, y: s.y }));
  while (out.length < count) out.push({ x, y });
  return out;
}

export function issueGroupMove(world: World, units: Unit[], x: number, y: number, attackMove: boolean) {
  const slots = formationSlots(world, x, y, units.length);
  // Unidades mais próximas do destino pegam as posições centrais.
  const sorted = [...units].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id - b.id);
  sorted.forEach((u, i) => setOrder(u, { type: 'move', x: slots[i].x, y: slots[i].y, attackMove }));
}
