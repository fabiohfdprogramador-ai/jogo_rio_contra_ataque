import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/config/game';
import { Simulation } from '../src/game/simulation';
import { sectorCount } from '../src/game/territories/territory';
import type { Difficulty, FactionId } from '../src/game/types';
import { createWorld } from '../src/game/world';
import { makeConfig, stateHash } from './helpers';

function run(factions: FactionId[], difficulty: Difficulty, minutes: number, seed = 7) {
  const world = createWorld(makeConfig({ factions, ai: factions.map(() => true), difficulty, seed }));
  const sim = new Simulation(world);
  for (let i = 0; i < minutes * 60 * TICK_RATE && world.status === 'running'; i++) sim.step();
  return world;
}

describe('inteligência artificial', () => {
  for (const faction of ['policia', 'milicia', 'bandido'] as FactionId[]) {
    it(`IA (${faction}) constrói, produz unidades e expande`, () => {
      const enemy: FactionId = faction === 'policia' ? 'milicia' : 'policia';
      const world = run([faction, enemy], 'normal', 4);
      const p = world.players[0];
      const buildings = [...world.buildings.values()].filter((b) => b.owner === 0);
      expect(buildings.length).toBeGreaterThanOrEqual(3);
      expect(p.stats.unitsProduced).toBeGreaterThanOrEqual(3);
      expect(sectorCount(world, 0) + p.stats.sectorsCaptured).toBeGreaterThanOrEqual(2);
    });
  }

  it('dificuldades produzem economias diferentes (fácil < difícil)', () => {
    const easy = run(['policia', 'milicia'], 'facil', 6);
    const hard = run(['policia', 'milicia'], 'dificil', 6);
    const spent = (w: ReturnType<typeof run>) => w.players.reduce((a, p) => a + p.stats.resourcesSpent, 0);
    expect(spent(hard)).toBeGreaterThan(spent(easy));
  });

  it('a IA ataca e uma partida entre IAs termina com vencedor', () => {
    const world = run(['policia', 'bandido'], 'dificil', 40, 3);
    expect(world.players.some((p) => p.stats.kills > 0)).toBe(true);
    expect(world.status).toBe('ended');
    expect(world.winner).not.toBeNull();
  });

  it('a simulação é determinística (base para multiplayer por comandos)', () => {
    const a = run(['policia', 'milicia', 'bandido'], 'normal', 5, 99);
    const b = run(['policia', 'milicia', 'bandido'], 'normal', 5, 99);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});
