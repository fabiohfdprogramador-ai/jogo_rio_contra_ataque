import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/config/game';
import { applyDamage } from '../src/game/combat/damage';
import { Simulation } from '../src/game/simulation';
import { createWorld, spawnUnit } from '../src/game/world';
import { findValidSpot, makeConfig } from './helpers';

describe('condições de vitória e derrota', () => {
  it('destruir a base principal elimina o adversário e encerra a partida', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'], ai: [false, false] }));
    const sim = new Simulation(world);
    const enemyHq = [...world.buildings.values()].find((b) => b.owner === 1)!;
    const attacker = spawnUnit(world, 0, 'pol_patrulha', 1, 1);
    applyDamage(world, attacker, enemyHq, enemyHq.hp + 1);
    for (let i = 0; i < TICK_RATE + 1; i++) sim.step();
    expect(world.players[1].alive).toBe(false);
    expect(world.status).toBe('ended');
    expect(world.winner).toBe(0);
    // Unidades e territórios do eliminado são removidos
    expect([...world.units.values()].some((u) => u.owner === 1)).toBe(false);
    expect(world.sectors.some((s) => s.owner === 1)).toBe(false);
  });

  it('jogador humano derrotado encerra a partida com derrota', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia', 'bandido'], ai: [false, true, true] }));
    const sim = new Simulation(world);
    const myHq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    const attacker = spawnUnit(world, 1, 'mil_defesa', 30, 30);
    applyDamage(world, attacker, myHq, myHq.hp + 1);
    for (let i = 0; i < TICK_RATE + 1; i++) sim.step();
    expect(world.status).toBe('ended');
    expect(world.winner).not.toBe(0);
  });

  it('bandido sobrevive à perda da base se tiver um posto avançado (conta como base)', () => {
    const world = createWorld(makeConfig({ factions: ['bandido', 'milicia'], ai: [false, false] }));
    const sim = new Simulation(world);
    const hq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    // Posto avançado em outro ponto do território inicial
    world.players[0].resources = { money: 9999, materials: 9999, fuel: 9999 };
    const spot = findValidSpot(world, 0, 'ban_posto');
    sim.queue({ type: 'build', player: 0, buildingType: 'ban_posto', tx: spot.tx, ty: spot.ty });
    sim.step();
    expect([...world.buildings.values()].some((b) => b.owner === 0 && b.type === 'ban_posto')).toBe(true);
    const attacker = spawnUnit(world, 1, 'mil_defesa', 30, 30);
    applyDamage(world, attacker, hq, hq.hp + 1);
    for (let i = 0; i < TICK_RATE + 1; i++) sim.step();
    expect(world.players[0].alive).toBe(true);
    expect(world.status).toBe('running');
    // Sem nenhuma base, a equipe é eliminada
    const milWorld = createWorld(makeConfig({ factions: ['milicia', 'policia'], ai: [false, false] }));
    const milSim = new Simulation(milWorld);
    const milHq = [...milWorld.buildings.values()].find((b) => b.owner === 0)!;
    applyDamage(milWorld, spawnUnit(milWorld, 1, 'pol_patrulha', 30, 30), milHq, milHq.hp + 1);
    for (let i = 0; i < TICK_RATE + 1; i++) milSim.step();
    expect(milWorld.players[0].alive).toBe(false);
  });

  it('domínio territorial por tempo garante a vitória', () => {
    const world = createWorld(makeConfig({ factions: ['policia', 'milicia'], ai: [false, false] }));
    const sim = new Simulation(world);
    const need = Math.ceil(world.sectors.length * world.config.victory.dominationRatio);
    let n = world.sectors.filter((s) => s.owner === 0).length;
    for (const s of world.sectors) {
      if (n >= need) break;
      if (s.owner === null) {
        s.owner = 0;
        s.progress = 100;
        n++;
      }
    }
    const seconds = world.config.victory.dominationSeconds;
    for (let i = 0; i < (seconds - 5) * TICK_RATE; i++) sim.step();
    expect(world.status).toBe('running');
    for (let i = 0; i < 10 * TICK_RATE; i++) sim.step();
    expect(world.status).toBe('ended');
    expect(world.winner).toBe(0);
    expect(world.endReason).toMatch(/Domínio/);
  });

  it('limite de tempo encerra pela maior pontuação', () => {
    const cfg = makeConfig({ factions: ['policia', 'milicia'], ai: [false, false], domination: false });
    cfg.victory.timeLimitMinutes = 1;
    const world = createWorld(cfg);
    const sim = new Simulation(world);
    const free = world.sectors.findIndex((s) => s.owner === null);
    world.sectors[free].owner = 1;
    for (let i = 0; i < 61 * TICK_RATE; i++) sim.step();
    expect(world.status).toBe('ended');
    expect(world.winner).toBe(1);
  });
});
