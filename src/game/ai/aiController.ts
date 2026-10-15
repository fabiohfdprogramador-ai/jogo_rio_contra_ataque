// Ponto de entrada da IA: decisões estratégicas em intervalos (não a cada tick),
// separadas do comportamento individual das unidades (src/game/units/behavior.ts).
import { AI_PROFILES } from '../../config/ai';
import type { Command } from '../commands';
import type { World } from '../types';
import { buildContext, createMemory } from './aiContext';
import { manageConstruction, manageProduction, manageResearch } from './aiEconomy';
import { manageMilitary } from './aiMilitary';

export function updateAI(world: World, issue: (cmd: Command) => void) {
  for (const p of world.players) {
    if (!p.isAI || !p.alive) continue;
    const mem = (world.ai[p.id] ??= createMemory());
    if (world.tick < mem.nextThink) continue;
    // Escalonamento: cada IA pensa em um tick diferente.
    mem.nextThink = world.tick + AI_PROFILES[p.difficulty].thinkInterval + (p.id % 3);
    const ctx = buildContext(world, p.id, issue);
    manageConstruction(ctx);
    manageProduction(ctx);
    manageResearch(ctx);
    manageMilitary(ctx);
  }
}
