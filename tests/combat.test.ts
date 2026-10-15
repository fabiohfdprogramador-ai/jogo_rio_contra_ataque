import { describe, expect, it } from 'vitest';
import { getUnitDef } from '../src/config/units';
import { applyDamage, computeDamage } from '../src/game/combat/damage';
import { applyCommand } from '../src/game/commands';
import { Simulation } from '../src/game/simulation';
import { createWorld, spawnUnit } from '../src/game/world';
import { makeConfig } from './helpers';

function neutralPoint(world: ReturnType<typeof createWorld>) {
  const s = world.map.sectors.find((x) => world.sectors[x.id].owner === null)!;
  return { x: s.cx, y: s.cy };
}

describe('combate', () => {
  it('blindagem reduz o dano', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'] }));
    const { x, y } = neutralPoint(world);
    const a = spawnUnit(world, 0, 'pol_patrulha', x, y);
    const soft = spawnUnit(world, 1, 'mil_recon', x + 1, y);
    const hard = spawnUnit(world, 1, 'mil_caminhonete', x + 2, y);
    const base = getUnitDef('pol_patrulha').attack!.damage;
    expect(computeDamage(world, a, soft)).toBeCloseTo(base * (1 - getUnitDef('mil_recon').armor));
    expect(computeDamage(world, a, hard)).toBeLessThan(computeDamage(world, a, soft));
  });

  it('polícia recebe menos dano dentro do próprio território', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'] }));
    const hq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    const attacker = spawnUnit(world, 1, 'mil_defesa', hq.tx - 1, hq.ty + 6);
    const home = spawnUnit(world, 0, 'pol_patrulha', hq.tx, hq.ty + 6);
    const { x, y } = neutralPoint(world);
    const away = spawnUnit(world, 0, 'pol_patrulha', x, y);
    expect(computeDamage(world, attacker, home)).toBeLessThan(computeDamage(world, attacker, away));
  });

  it('bandido causa menos dano fora do próprio território', () => {
    const world = createWorld(makeConfig({ factions: ['bandido', 'milicia'] }));
    const hq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    const target = spawnUnit(world, 1, 'mil_recon', 1, 1);
    const home = spawnUnit(world, 0, 'ban_leve', hq.tx, hq.ty + 5);
    const { x, y } = neutralPoint(world);
    const away = spawnUnit(world, 0, 'ban_leve', x, y);
    expect(computeDamage(world, away, target)).toBeLessThan(computeDamage(world, home, target));
  });

  it('ataque aplica dano, destrói a unidade e contabiliza abates', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'], ai: [false, false], fog: false }));
    const sim = new Simulation(world);
    const { x, y } = neutralPoint(world);
    const a = spawnUnit(world, 0, 'pol_suv', x, y);
    const t = spawnUnit(world, 1, 'mil_recon', x + 3, y);
    applyCommand(world, { type: 'attack', player: 0, unitIds: [a.id], targetId: t.id });
    const hp0 = t.hp;
    let damaged = false;
    for (let i = 0; i < 400 && world.units.has(t.id); i++) {
      sim.step();
      if (t.hp < hp0) damaged = true;
    }
    expect(damaged).toBe(true);
    expect(world.units.has(t.id)).toBe(false);
    expect(world.players[0].stats.kills).toBeGreaterThanOrEqual(1);
    expect(world.players[1].stats.unitsLost).toBeGreaterThanOrEqual(1);
  });

  it('unidade persegue o alvo até entrar no alcance', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'], ai: [false, false], fog: false }));
    const sim = new Simulation(world);
    const { x, y } = neutralPoint(world);
    const a = spawnUnit(world, 0, 'pol_patrulha', x - 8, y);
    const t = spawnUnit(world, 1, 'mil_eng', x + 4, y);
    applyCommand(world, { type: 'attack', player: 0, unitIds: [a.id], targetId: t.id });
    for (let i = 0; i < 80; i++) sim.step();
    if (world.units.has(t.id)) {
      expect(Math.hypot(a.x - t.x, a.y - t.y)).toBeLessThanOrEqual(getUnitDef('pol_patrulha').attack!.range + 0.5);
    }
    expect(t.hp).toBeLessThan(getUnitDef('mil_eng').hp);
  });

  it('unidades ociosas reagem a inimigos próximos', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'], ai: [false, false], fog: false }));
    const sim = new Simulation(world);
    const { x, y } = neutralPoint(world);
    spawnUnit(world, 0, 'pol_patrulha', x, y);
    const enemy = spawnUnit(world, 1, 'mil_eng', x + 4, y);
    for (let i = 0; i < 60; i++) sim.step();
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('construção destruída vira ruína e libera o terreno', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia', 'bandido'], ai: [false, false, false], fog: false }));
    const sim = new Simulation(world);
    const target = [...world.buildings.values()].find((b) => b.owner === 2)!;
    const attacker = spawnUnit(world, 0, 'pol_patrulha', 1, 1);
    applyDamage(world, attacker, target, target.hp + 10);
    sim.step();
    expect(world.buildings.has(target.id)).toBe(false);
    expect([...world.ruins.values()].some((r) => r.tx === target.tx && r.ty === target.ty)).toBe(true);
    expect(world.occupancy[target.ty * world.map.width + target.tx]).toBe(0);
  });
});
