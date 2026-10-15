import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/config/game';
import { SaveError, deserializeWorld, serializeWorld } from '../src/game/save';
import { Simulation } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { makeConfig, stateHash } from './helpers';

function playedWorld() {
  const world = createWorld(makeConfig({ factions: ['policia', 'milicia', 'bandido'], ai: [true, true, true], mapSize: 'medio' }));
  const sim = new Simulation(world);
  for (let i = 0; i < 4 * 60 * TICK_RATE; i++) sim.step();
  return world;
}

describe('salvamento e carregamento', () => {
  it('restaura o estado da partida de forma consistente', () => {
    const world = playedWorld();
    const data = JSON.parse(JSON.stringify(serializeWorld(world)));
    const loaded = deserializeWorld(data);
    expect(stateHash(loaded)).toBe(stateHash(world));
    expect(loaded.players.map((p) => p.techs)).toEqual(world.players.map((p) => p.techs));
    expect([...loaded.buildings.values()].map((b) => b.queue)).toEqual([...world.buildings.values()].map((b) => b.queue));
    expect(loaded.ai).toEqual(world.ai);
    // A ocupação do terreno é reconstruída a partir das construções
    expect(Array.from(loaded.occupancy)).toEqual(Array.from(world.occupancy));
    // O que foi explorado continua explorado
    for (let p = 0; p < world.players.length; p++) {
      for (let i = 0; i < world.visibility[p].length; i++) {
        expect(loaded.visibility[p][i] > 0).toBe(world.visibility[p][i] > 0);
      }
    }
  });

  it('a partida carregada continua exatamente como a original', () => {
    const world = playedWorld();
    const loaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(world))));
    const a = new Simulation(world);
    const b = new Simulation(loaded);
    for (let i = 0; i < 60 * TICK_RATE; i++) {
      a.step();
      b.step();
    }
    expect(stateHash(loaded)).toBe(stateHash(world));
  });

  it('rejeita arquivos inválidos sem travar', () => {
    expect(() => deserializeWorld(null)).toThrow(SaveError);
    expect(() => deserializeWorld({ version: 999 })).toThrow(SaveError);
    const world = createWorld(makeConfig());
    const data = serializeWorld(world);
    const broken = JSON.parse(JSON.stringify(data));
    broken.units[0].type = 'unidade_inexistente';
    expect(() => deserializeWorld(broken)).toThrow(/unidade desconhecida/);
    const broken2 = JSON.parse(JSON.stringify(data));
    broken2.players[0].resources.money = 'muito';
    expect(() => deserializeWorld(broken2)).toThrow(SaveError);
  });
});
