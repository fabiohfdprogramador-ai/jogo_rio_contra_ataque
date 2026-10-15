// Busca de caminho A* em grade com 8 direções (sem cortar quinas) e
// suavização da rota por linha de visada.
import { isWalkable, nearestWalkable, walkableLine } from '../map/grid';
import type { World } from '../types';

const SQRT2 = Math.SQRT2;
const MAX_EXPANDED = 25000;

// Buffers reutilizados entre buscas (evita alocação a cada chamada).
let bufSize = 0;
let gScore: Float32Array;
let parent: Int32Array;
let stamp: Uint32Array;
let closedStamp: Uint32Array;
let currentStamp = 1;

function ensureBuffers(n: number) {
  if (bufSize >= n) return;
  bufSize = n;
  gScore = new Float32Array(n);
  parent = new Int32Array(n);
  stamp = new Uint32Array(n);
  closedStamp = new Uint32Array(n);
}

class MinHeap {
  ids: number[] = [];
  f: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, f: number) {
    this.ids.push(id);
    this.f.push(f);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= this.f[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastF = this.f.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.f[0] = lastF;
      let i = 0;
      const n = this.ids.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.f[l] < this.f[m]) m = l;
        if (r < n && this.f[r] < this.f[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * Calcula uma rota de (sx, sy) até (gx, gy) em coordenadas de mundo.
 * Retorna lista de pontos (centros de tiles) ou null se não houver caminho.
 * Se o destino estiver bloqueado, usa o tile livre mais próximo.
 */
export function findPath(world: World, sx: number, sy: number, gx: number, gy: number): { x: number; y: number }[] | null {
  const { width, height } = world.map;
  ensureBuffers(width * height);
  let start = { x: Math.floor(sx), y: Math.floor(sy) };
  if (!isWalkable(world, start.x, start.y)) {
    const alt = nearestWalkable(world, sx, sy, 4);
    if (!alt) return null;
    start = alt;
  }
  const goal = nearestWalkable(world, gx, gy, 12);
  if (!goal) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ x: gx, y: gy }];

  currentStamp++;
  if (currentStamp > 0xfffffff0) {
    stamp.fill(0);
    closedStamp.fill(0);
    currentStamp = 1;
  }
  const startId = start.y * width + start.x;
  const goalId = goal.y * width + goal.x;
  const heap = new MinHeap();
  gScore[startId] = 0;
  parent[startId] = -1;
  stamp[startId] = currentStamp;
  heap.push(startId, octile(start.x, start.y, goal.x, goal.y));

  let expanded = 0;
  let bestId = startId;
  let bestH = Infinity;
  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closedStamp[cur] === currentStamp) continue;
    closedStamp[cur] = currentStamp;
    if (cur === goalId) {
      found = true;
      break;
    }
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const h = octile(cx, cy, goal.x, goal.y);
    if (h < bestH) {
      bestH = h;
      bestId = cur;
    }
    if (++expanded > MAX_EXPANDED) break;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!isWalkable(world, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!isWalkable(world, cx + dx, cy) || !isWalkable(world, cx, cy + dy))) continue;
      const nid = ny * width + nx;
      if (closedStamp[nid] === currentStamp) continue;
      const g = gScore[cur] + cost;
      if (stamp[nid] !== currentStamp || g < gScore[nid]) {
        stamp[nid] = currentStamp;
        gScore[nid] = g;
        parent[nid] = cur;
        heap.push(nid, g + octile(nx, ny, goal.x, goal.y));
      }
    }
  }

  // Se não alcançou o destino, vai até o ponto mais próximo encontrado.
  const endId = found ? goalId : bestId;
  if (endId === startId) return null;
  const tilesPath: { x: number; y: number }[] = [];
  for (let id = endId; id !== -1; id = parent[id]) {
    const x = id % width;
    tilesPath.push({ x: x + 0.5, y: (id - x) / width + 0.5 });
  }
  tilesPath.reverse();
  if (found) {
    // O último ponto é o destino exato quando ele é caminhável.
    const exact = isWalkable(world, Math.floor(gx), Math.floor(gy));
    if (exact) tilesPath[tilesPath.length - 1] = { x: gx, y: gy };
  }
  return smoothPath(world, sx, sy, tilesPath);
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** Remove pontos intermediários quando há linha de visada livre. */
export function smoothPath(world: World, sx: number, sy: number, path: { x: number; y: number }[]): { x: number; y: number }[] {
  if (path.length <= 2) return path;
  const out: { x: number; y: number }[] = [];
  let ax = sx;
  let ay = sy;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    // Procura o ponto mais distante visível (limitado para custo controlado).
    const limit = Math.min(path.length - 1, i + 24);
    j = limit;
    while (j > i && !walkableLine(world, ax, ay, path[j].x, path[j].y)) j--;
    out.push(path[j]);
    ax = path[j].x;
    ay = path[j].y;
    i = j + 1;
  }
  return out;
}
