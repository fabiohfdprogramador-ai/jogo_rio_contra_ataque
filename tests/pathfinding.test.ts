import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/game/commands';
import { isWalkable } from '../src/game/map/grid';
import { generateMap } from '../src/game/map/mapgen';
import { findPath } from '../src/game/pathfinding/astar';
import { Simulation } from '../src/game/simulation';
import { Tile } from '../src/game/types';
import { createWorld, spawnUnit } from '../src/game/world';
import { makeConfig } from './helpers';

describe('mapa e navegação', () => {
  it('gera o mesmo mapa para a mesma semente, com 9 ou 16 setores', () => {
    const a = generateMap('pequeno', 42);
    const b = generateMap('pequeno', 42);
    expect(a.sectors.length).toBe(9);
    expect(generateMap('medio', 42).sectors.length).toBe(16);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.decor).toEqual(b.decor);
    // Pontos de controle ficam em ruas (caminháveis)
    for (const s of a.sectors) expect(a.blocked[Math.floor(s.cy) * a.width + Math.floor(s.cx)]).toBe(0);
  });

  it('todas as bases e pontos de controle são alcançáveis a partir da primeira base', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia', 'bandido'], mapSize: 'medio' }));
    const hq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    const sx = hq.tx + hq.size / 2;
    const sy = hq.ty + hq.size + 1.5;
    for (const s of world.map.sectors) {
      const path = findPath(world, sx, sy, s.cx, s.cy);
      expect(path).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.hypot(end.x - s.cx, end.y - s.cy)).toBeLessThan(1.5);
    }
  });

  it('o caminho só passa por tiles caminháveis e contorna a água pelas pontes', () => {
    const world = createWorld(makeConfig());
    const top = world.map.sectors[0];
    const bottom = world.map.sectors[world.map.sectors.length - 1];
    const path = findPath(world, top.cx, top.cy, bottom.cx, bottom.cy)!;
    expect(path).not.toBeNull();
    let x = top.cx;
    let y = top.cy;
    let crossedBridge = false;
    for (const p of path) {
      const steps = Math.ceil(Math.hypot(p.x - x, p.y - y) / 0.2);
      for (let i = 0; i <= steps; i++) {
        const px = x + ((p.x - x) * i) / steps;
        const py = y + ((p.y - y) * i) / steps;
        expect(isWalkable(world, Math.floor(px), Math.floor(py))).toBe(true);
        if (world.map.tiles[Math.floor(py) * world.map.width + Math.floor(px)] === Tile.Bridge) crossedBridge = true;
      }
      x = p.x;
      y = p.y;
    }
    expect(crossedBridge).toBe(true);
  });

  it('unidades em grupo chegam ao destino sem ficar presas no mesmo ponto', () => {
    const world = createWorld(makeConfig({ ai: [false, false], fog: false }));
    const sim = new Simulation(world);
    const hq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(spawnUnit(world, 0, 'pol_patrulha', hq.tx + 1 + (i % 3), hq.ty + hq.size + 1 + Math.floor(i / 3)).id);
    const target = world.map.sectors[4];
    applyCommand(world, { type: 'move', player: 0, unitIds: ids, x: target.cx, y: target.cy });
    for (let i = 0; i < 60 * 10; i++) sim.step();
    const units = ids.map((id) => world.units.get(id)!);
    for (const u of units) {
      expect(Math.hypot(u.x - target.cx, u.y - target.cy)).toBeLessThan(4);
      expect(u.order.type).toBe('idle');
    }
    // Não estão empilhadas
    for (let i = 0; i < units.length; i++)
      for (let j = i + 1; j < units.length; j++) expect(Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y)).toBeGreaterThan(0.2);
  });
});
