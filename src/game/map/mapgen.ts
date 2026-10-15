// Geração procedural do mapa urbano fictício inspirado no Rio de Janeiro:
// malha de ruas, canal com pontes, orla com praia, bairros com estilos distintos.
import { BLOCK_SIZE, MAP_SIZES, ROAD_WIDTH, SECTOR_SIZE } from '../../config/game';
import { SECTOR_NAMES } from '../../config/sectors';
import { Rng } from '../rng';
import { Tile } from '../types';
import type { DecorBuilding, DecorStyle, MapData, MapSize, SectorStatic, SectorType } from '../types';

const PASTEL = [0xeadbc8, 0xf2c9a0, 0xd8e3ea, 0xcfdcab, 0xf4e3a6, 0xe3bcb6, 0xbcd2e3, 0xf3efe7, 0xd9c7e6];
const MORRO = [0xe8735f, 0xf4c542, 0x6fb1e3, 0x8ed081, 0xf29ac0, 0xd9a066, 0xb5653f, 0xf0efe9];
const INDUSTRIAL = [0x9aa3ab, 0xb7b2a6, 0x8c96a0, 0xc2b8a3];
const TOWER = [0xc6d4e1, 0x9fb5c9, 0xdfe6ee, 0xb9c4cf, 0x8ea4b8];

export const START_SECTOR_COORDS = (sx: number, sy: number): [number, number][] => [
  [0, 0],
  [sx - 1, sy - 1],
  [sx - 1, 0],
];

export function generateMap(size: MapSize, seed: number): MapData {
  const { sectorsX, sectorsY } = MAP_SIZES[size];
  const width = sectorsX * SECTOR_SIZE;
  const height = sectorsY * SECTOR_SIZE;
  const rng = new Rng(seed);
  const tiles = new Uint8Array(width * height);
  const blocked = new Uint8Array(width * height);
  const trees = new Uint8Array(width * height);
  const idx = (x: number, y: number) => y * width + x;

  // 1. Ruas e lotes
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const road = x % BLOCK_SIZE < ROAD_WIDTH || y % BLOCK_SIZE < ROAD_WIDTH;
      tiles[idx(x, y)] = road ? Tile.Road : Tile.Lot;
    }
  }

  // 2. Canal com pontes na divisa entre setores
  const canalY = Math.floor(sectorsY / 2) * SECTOR_SIZE;
  const bridgeCols: number[] = [];
  for (let k = 0; k < sectorsX; k++) if (k % 2 === 0 || k === sectorsX - 1) bridgeCols.push(k);
  for (let y = canalY - 2; y <= canalY + 1; y++) {
    for (let x = 0; x < width; x++) {
      const isBridge = bridgeCols.some((k) => x >= k * SECTOR_SIZE + 11 && x <= k * SECTOR_SIZE + 14);
      tiles[idx(x, y)] = isBridge ? Tile.Bridge : Tile.Water;
    }
  }

  // 3. Orla: praia e mar ao sul
  for (let y = height - 5; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles[idx(x, y)] = y >= height - 3 ? Tile.Water : Tile.Sand;
    }
  }

  // 4. Setores
  const startCoords = START_SECTOR_COORDS(sectorsX, sectorsY);
  const isStart = (sx: number, sy: number) => startCoords.some(([a, b]) => a === sx && b === sy);
  const sectors: SectorStatic[] = [];
  const names = rng.shuffle([...SECTOR_NAMES]);
  const pool: SectorType[] = rng.shuffle([
    'industrial',
    'energia',
    'elevado',
    'comercial',
    'elevado',
    'industrial',
    'residencial',
    'energia',
    'comercial',
    'residencial',
    'industrial',
    'elevado',
    'comercial',
  ]);
  for (let sy = 0; sy < sectorsY; sy++) {
    for (let sx = 0; sx < sectorsX; sx++) {
      let type: SectorType;
      const centerX = (sectorsX - 1) / 2;
      const centerY = (sectorsY - 1) / 2;
      if (isStart(sx, sy)) type = 'residencial';
      else if (sy === sectorsY - 1) type = 'porto';
      else if (Math.abs(sx - centerX) < 1 && Math.abs(sy - centerY) < 1) type = 'comercial';
      else type = pool.pop() ?? 'residencial';
      const x0 = sx * SECTOR_SIZE;
      const y0 = sy * SECTOR_SIZE;
      sectors.push({
        id: sectors.length,
        name: names[sectors.length % names.length],
        sx,
        sy,
        x0,
        y0,
        x1: x0 + SECTOR_SIZE,
        y1: y0 + SECTOR_SIZE,
        cx: x0 + BLOCK_SIZE + ROAD_WIDTH / 2,
        cy: y0 + BLOCK_SIZE + ROAD_WIDTH / 2,
        type,
      });
    }
  }

  // 5. Posições iniciais (quarteirão do setor mais próximo do canto do mapa)
  const starts: MapData['starts'] = [];
  for (const [sx, sy] of startCoords) {
    const sector = sectors.find((s) => s.sx === sx && s.sy === sy)!;
    const cornerX = sx === 0 ? 0 : width;
    const cornerY = sy === 0 ? 0 : height;
    const blocks: { bx: number; by: number; d: number }[] = [];
    for (let by = sector.y0; by < sector.y1; by += BLOCK_SIZE) {
      for (let bx = sector.x0; bx < sector.x1; bx += BLOCK_SIZE) {
        blocks.push({ bx, by, d: Math.hypot(bx + 6 - cornerX, by + 6 - cornerY) });
      }
    }
    blocks.sort((a, b) => a.d - b.d);
    let chosen = blocks[0];
    for (const b of blocks) {
      let ok = true;
      for (let y = b.by + 4; y < b.by + 10 && ok; y++)
        for (let x = b.bx + 4; x < b.bx + 10 && ok; x++) if (tiles[idx(x, y)] !== Tile.Lot) ok = false;
      if (ok) {
        chosen = b;
        break;
      }
    }
    starts.push({ sector: sector.id, hqX: chosen.bx + 5, hqY: chosen.by + 5 });
  }

  // 6. Edificações do cenário por quarteirão
  const decor: DecorBuilding[] = [];
  const decorMask = new Uint8Array(width * height);
  const blocksX = width / BLOCK_SIZE;
  const blocksY = height / BLOCK_SIZE;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const ix0 = bx * BLOCK_SIZE + ROAD_WIDTH;
      const iy0 = by * BLOCK_SIZE + ROAD_WIDTH;
      const ix1 = (bx + 1) * BLOCK_SIZE; // exclusivo
      const iy1 = (by + 1) * BLOCK_SIZE;
      const sector = sectors[Math.floor(iy0 / SECTOR_SIZE) * sectorsX + Math.floor(ix0 / SECTOR_SIZE)];
      const startSector = starts.some((s) => s.sector === sector.id);
      const hqBlock = starts.some((s) => s.hqX >= ix0 && s.hqX < ix1 && s.hqY >= iy0 && s.hqY < iy1);
      if (hqBlock) continue;

      // Parques e praças
      if (!startSector && rng.next() < 0.14) {
        for (let y = iy0; y < iy1; y++)
          for (let x = ix0; x < ix1; x++) {
            if (tiles[idx(x, y)] !== Tile.Lot) continue;
            tiles[idx(x, y)] = Tile.Park;
            if (rng.next() < 0.22) trees[idx(x, y)] = 1;
          }
        continue;
      }

      const coverage = startSector ? 0.12 : coverageFor(sector.type);
      const area = (ix1 - ix0) * (iy1 - iy0);
      let covered = 0;
      for (let attempt = 0; attempt < 70 && covered < area * coverage; attempt++) {
        const spec = decorSpec(sector.type, rng);
        const x = rng.int(ix0, ix1 - spec.w);
        const y = rng.int(iy0, iy1 - spec.h);
        if (!canPlaceDecor(x, y, spec.w, spec.h)) continue;
        for (let yy = y; yy < y + spec.h; yy++)
          for (let xx = x; xx < x + spec.w; xx++) {
            decorMask[idx(xx, yy)] = 1;
            blocked[idx(xx, yy)] = 1;
          }
        decor.push({ x, y, w: spec.w, h: spec.h, height: spec.height, color: spec.color, style: spec.style });
        covered += spec.w * spec.h;
      }
      // Árvores esparsas nas calçadas internas
      for (let n = 0; n < 3; n++) {
        const x = rng.int(ix0, ix1 - 1);
        const y = rng.int(iy0, iy1 - 1);
        if (tiles[idx(x, y)] === Tile.Lot && !decorMask[idx(x, y)] && !startSector) trees[idx(x, y)] = 1;
      }
    }
  }

  function canPlaceDecor(x: number, y: number, w: number, h: number): boolean {
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) return false;
        if (decorMask[idx(xx, yy)]) return false;
        const inside = xx >= x && xx < x + w && yy >= y && yy < y + h;
        if (inside && tiles[idx(xx, yy)] !== Tile.Lot) return false;
      }
    }
    return true;
  }

  for (let i = 0; i < tiles.length; i++) if (tiles[i] === Tile.Water) blocked[i] = 1;

  return { width, height, sectorSize: SECTOR_SIZE, sectorsX, sectorsY, tiles, blocked, trees, decor, sectors, starts };
}

function coverageFor(type: SectorType): number {
  switch (type) {
    case 'comercial':
      return 0.42;
    case 'industrial':
      return 0.38;
    case 'elevado':
      return 0.5;
    case 'porto':
      return 0.3;
    case 'energia':
      return 0.28;
    default:
      return 0.32;
  }
}

function decorSpec(type: SectorType, rng: Rng): { w: number; h: number; height: number; color: number; style: DecorStyle } {
  const r = rng.next();
  switch (type) {
    case 'comercial':
      if (r < 0.6) {
        const s = rng.int(3, 4);
        return { w: s, h: s, height: 7 + rng.next() * 9, color: rng.pick(TOWER), style: 'torre' };
      }
      return { w: 3, h: rng.int(2, 3), height: 3 + rng.next() * 3, color: rng.pick(PASTEL), style: 'predio' };
    case 'industrial':
    case 'porto':
    case 'energia':
      if (r < 0.7) {
        return { w: rng.int(3, 5), h: rng.int(3, 4), height: 1.6 + rng.next() * 1.4, color: rng.pick(INDUSTRIAL), style: 'galpao' };
      }
      return { w: 2, h: 2, height: 2.5 + rng.next() * 2, color: rng.pick(PASTEL), style: 'predio' };
    case 'elevado':
      return { w: rng.int(1, 2), h: rng.int(1, 2), height: 0.9 + rng.next() * 1.8, color: rng.pick(MORRO), style: 'morro' };
    default:
      if (r < 0.65) {
        return { w: 2, h: rng.int(2, 3), height: 1.2 + rng.next() * 1.2, color: rng.pick(PASTEL), style: 'casa' };
      }
      return { w: 3, h: 3, height: 3 + rng.next() * 4, color: rng.pick(PASTEL), style: 'predio' };
  }
}

export function sectorAt(map: MapData, x: number, y: number): number {
  const sx = Math.floor(x / map.sectorSize);
  const sy = Math.floor(y / map.sectorSize);
  if (sx < 0 || sy < 0 || sx >= map.sectorsX || sy >= map.sectorsY) return -1;
  return sy * map.sectorsX + sx;
}

export function sectorNeighbors(map: MapData, id: number): number[] {
  const s = map.sectors[id];
  const out: number[] = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    const nx = s.sx + dx;
    const ny = s.sy + dy;
    if (nx >= 0 && ny >= 0 && nx < map.sectorsX && ny < map.sectorsY) out.push(ny * map.sectorsX + nx);
  }
  return out;
}
