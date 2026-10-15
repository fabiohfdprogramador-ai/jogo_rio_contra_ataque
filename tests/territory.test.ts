import { describe, expect, it } from 'vitest';
import { CAPTURE, TICK_RATE } from '../src/config/game';
import { applyCommand } from '../src/game/commands';
import { Simulation } from '../src/game/simulation';
import { computeIncome } from '../src/game/economy/economy';
import { createWorld, spawnUnit } from '../src/game/world';
import { makeConfig } from './helpers';

function setup(factions: ('policia' | 'milicia' | 'bandido')[] = ['policia', 'milicia']) {
  const world = createWorld(makeConfig({ factions, ai: factions.map(() => false), fog: false }));
  return { world, sim: new Simulation(world) };
}

describe('conquista territorial', () => {
  it('captura setor neutro com unidades no ponto de controle e atualiza a renda', () => {
    const { world, sim } = setup();
    const id = world.sectors.findIndex((s) => s.owner === null);
    const sec = world.map.sectors[id];
    const income0 = computeIncome(world, world.players[0]).money;
    spawnUnit(world, 0, 'pol_patrulha', sec.cx, sec.cy);
    spawnUnit(world, 0, 'pol_patrulha', sec.cx + 0.5, sec.cy);
    const seconds = 100 / (CAPTURE.baseRate * (1 + CAPTURE.perExtraUnit));
    for (let i = 0; i < (seconds + 1) * TICK_RATE; i++) sim.step();
    expect(world.sectors[id].owner).toBe(0);
    expect(world.players[0].stats.sectorsCaptured).toBe(1);
    expect(computeIncome(world, world.players[0]).money).toBeGreaterThan(income0);
  });

  it('não conquista apenas clicando: sem unidades não há progresso', () => {
    const { world, sim } = setup();
    const id = world.sectors.findIndex((s) => s.owner === null);
    for (let i = 0; i < 30 * TICK_RATE; i++) sim.step();
    expect(world.sectors[id].owner).toBeNull();
    expect(world.sectors[id].progress).toBe(0);
  });

  it('engenheiros não capturam', () => {
    const { world, sim } = setup();
    const id = world.sectors.findIndex((s) => s.owner === null);
    const sec = world.map.sectors[id];
    spawnUnit(world, 0, 'pol_eng', sec.cx, sec.cy);
    for (let i = 0; i < 30 * TICK_RATE; i++) sim.step();
    expect(world.sectors[id].owner).toBeNull();
  });

  it('setor fica em disputa quando duas equipes estão presentes', () => {
    const { world, sim } = setup();
    const id = world.sectors.findIndex((s) => s.owner === null);
    const sec = world.map.sectors[id];
    // Unidades que não atacam, para que permaneçam vivas
    const a = spawnUnit(world, 0, 'pol_patrulha', sec.cx, sec.cy);
    const b = spawnUnit(world, 1, 'mil_defesa', sec.cx + 1, sec.cy);
    applyCommand(world, { type: 'hold', player: 0, unitIds: [a.id] });
    sim.step();
    expect(world.sectors[id].contested).toBe(true);
    expect(world.sectors[id].progress).toBe(0);
    void b;
  });

  it('a conquista é reversível: território inimigo é neutralizado e depois capturado', () => {
    const { world, sim } = setup(['policia', 'milicia', 'bandido']);
    const id = world.sectors.findIndex((s) => s.owner === null);
    world.sectors[id] = { owner: 1, captureTeam: 1, progress: 100, contested: false };
    const sec = world.map.sectors[id];
    for (let k = 0; k < 4; k++) spawnUnit(world, 0, 'pol_patrulha', sec.cx + (k % 2), sec.cy + Math.floor(k / 2));
    let neutralized = false;
    for (let i = 0; i < 60 * TICK_RATE && world.sectors[id].owner !== 0; i++) {
      sim.step();
      if (world.sectors[id].owner === null) neutralized = true;
    }
    expect(neutralized).toBe(true);
    expect(world.sectors[id].owner).toBe(0);
  });

  it('setor com a base principal do dono não pode ser capturado', () => {
    const { world, sim } = setup();
    const start = world.map.starts[1].sector;
    const sec = world.map.sectors[start];
    for (let k = 0; k < 4; k++) {
      const u = spawnUnit(world, 0, 'pol_patrulha', sec.cx + (k % 2), sec.cy + Math.floor(k / 2));
      applyCommand(world, { type: 'hold', player: 0, unitIds: [u.id] });
    }
    // Remove as unidades da milícia para que não haja disputa
    for (const u of [...world.units.values()]) if (u.owner === 1) world.units.delete(u.id);
    for (let i = 0; i < 20 * TICK_RATE; i++) sim.step();
    expect(world.sectors[start].owner).toBe(1);
  });
});
