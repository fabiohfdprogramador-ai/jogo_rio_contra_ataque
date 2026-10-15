// Consultas sobre a grade de navegação: obstáculos estáticos (cenário) e
// dinâmicos (construções dos jogadores).
import { Tile } from '../types';
import type { MapData, World } from '../types';

export function inBounds(map: MapData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isWalkable(world: World, x: number, y: number): boolean {
  const { map } = world;
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  return map.blocked[i] === 0 && world.occupancy[i] === 0;
}

/** Tiles onde é possível erguer construções (sem considerar território). */
export function isBuildableTile(world: World, x: number, y: number): boolean {
  const { map } = world;
  if (!inBounds(map, x, y)) return false;
  const i = y * map.width + x;
  const t = map.tiles[i];
  if (t !== Tile.Lot && t !== Tile.Park && t !== Tile.Sand) return false;
  return map.blocked[i] === 0 && map.trees[i] === 0 && world.occupancy[i] === 0;
}

/** Encontra o tile caminhável mais próximo (busca em anéis). */
export function nearestWalkable(world: World, x: number, y: number, maxRadius = 20): { x: number; y: number } | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (isWalkable(world, tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxRadius; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!isWalkable(world, nx, ny)) continue;
        const d = (nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: nx, y: ny };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Verifica linha de visada "caminhável" entre dois pontos (usada para suavizar rotas). */
export function walkableLine(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist / 0.25);
  // Verifica também um pequeno deslocamento lateral para evitar raspar quinas.
  const nx = dist > 0 ? (-dy / dist) * 0.3 : 0;
  const ny = dist > 0 ? (dx / dist) * 0.3 : 0;
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    if (!isWalkable(world, Math.floor(px), Math.floor(py))) return false;
    if (!isWalkable(world, Math.floor(px + nx), Math.floor(py + ny))) return false;
    if (!isWalkable(world, Math.floor(px - nx), Math.floor(py - ny))) return false;
  }
  return true;
}
