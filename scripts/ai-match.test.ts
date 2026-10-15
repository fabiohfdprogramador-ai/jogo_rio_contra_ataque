import { it } from 'vitest';
import { createWorld } from '../src/game/world';
import { Simulation } from '../src/game/simulation';
import { makeConfig } from '../tests/helpers';
import { sectorCount } from '../src/game/territories/territory';
import type { FactionId, Difficulty } from '../src/game/types';

const VERBOSE = !!process.env.VERBOSE;
const pairs: FactionId[][] = process.env.PAIR ? [process.env.PAIR.split(',') as FactionId[]] : [
  ['policia', 'milicia'], ['milicia', 'policia'],
  ['policia', 'bandido'], ['bandido', 'policia'],
  ['milicia', 'bandido'], ['bandido', 'milicia'],
  ['policia', 'milicia', 'bandido'],
];
it('ai match', () => {
  const wins: Record<string, number> = {};
  for (const seed of process.env.SEED ? [Number(process.env.SEED)] : [1, 2, 3, 4, 5, 6]) for (const factions of pairs) {
    const diff: Difficulty = 'normal';
    const world = createWorld(makeConfig({ factions, ai: factions.map(() => true), difficulty: diff, mapSize: factions.length > 2 ? 'medio' : 'pequeno', seed }));
    const sim = new Simulation(world);
    for (let t = 0; t < 600 * 45 && world.status === 'running'; t++) {
      sim.step();
      if (VERBOSE && t % 600 === 0) {
        console.log(`t=${(t / 600).toFixed(1)}m`, world.players.map((p) => `${p.faction}: $${p.resources.money | 0} m${p.resources.materials | 0} f${p.resources.fuel | 0} u${[...world.units.values()].filter((u) => u.owner === p.id).length} b${[...world.buildings.values()].filter((b) => b.owner === p.id).length} s${sectorCount(world, p.id)} pop${p.popUsed}/${p.popCap} k${p.stats.kills} t${p.techs.length}`).join(' | '));
      }
    }
    const w = world.winner !== null ? world.players[world.winner].faction : 'none';
    wins[w] = (wins[w] ?? 0) + 1;
    console.log(`seed ${seed} ${factions.join(' x ')} -> ${w} (${world.endReason}) at ${(world.tick / 600).toFixed(1)}m; ` + world.players.map((p) => `${p.faction} s${sectorCount(world, p.id)} k${p.stats.kills} prod${p.stats.unitsProduced} t${p.techs.length}`).join(', '));
  }
  console.log(wins);
}, 600000);
