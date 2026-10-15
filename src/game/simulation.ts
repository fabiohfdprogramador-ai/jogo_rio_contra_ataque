// Simulação em passo fixo. Ordem dos sistemas em cada tick:
// comandos → economia → construções/produção → unidades → limpeza → territórios
// → visão → IA → vitória.
//
// A simulação não conhece renderização nem interface. Comandos enfileirados são
// aplicados no início do tick seguinte — o mesmo modelo usado por RTS com
// sincronização de comandos (lockstep) em rede.
import { VISION } from '../config/game';
import { updateAI } from './ai/aiController';
import { updateBuildings } from './buildings/buildingSystem';
import { type Command, applyCommand } from './commands';
import { updateEconomy } from './economy/economy';
import { updateTerritories } from './territories/territory';
import { updateVision } from './territories/vision';
import type { GameEvent, World } from './types';
import { updateUnits } from './units/behavior';
import { SpatialHash } from './units/spatial';
import { cleanupDead, updateVictory } from './victory';

export class Simulation {
  readonly hash = new SpatialHash();
  private pending: Command[] = [];

  constructor(public world: World) {
    this.hash.rebuild(world);
    updateVision(world);
  }

  /** Enfileira um comando para o próximo tick. */
  queue(cmd: Command) {
    this.pending.push(cmd);
  }

  /** Avança um tick e devolve os eventos gerados. */
  step(): GameEvent[] {
    const world = this.world;
    world.events = [];
    if (world.status !== 'running') return world.events;

    const cmds = this.pending;
    this.pending = [];
    for (const c of cmds) applyCommand(world, c);

    updateEconomy(world);
    this.hash.rebuild(world);
    updateBuildings(world, this.hash);
    updateUnits(world, this.hash);
    cleanupDead(world);
    this.hash.rebuild(world);
    updateTerritories(world, this.hash);
    if (world.tick % VISION.updateEveryTicks === 0) updateVision(world);
    updateAI(world, (c) => this.queue(c));
    updateVictory(world);
    world.tick++;
    return world.events;
  }
}
