// Cálculo e aplicação de dano.
import { getBuildingDef } from '../../config/buildings';
import { FACTIONS } from '../../config/factions';
import { COMBAT } from '../../config/game';
import { getUnitDef } from '../../config/units';
import { sectorAt } from '../map/mapgen';
import type { Building, Unit, World } from '../types';
import { emit, entityPos } from '../world';

export type Attacker = Unit | Building;

/** Dano final de um ataque, considerando modificadores, blindagem e regras da equipe. */
export function computeDamage(world: World, attacker: Attacker, target: Unit | Building): number {
  const atkPlayer = world.players[attacker.owner];
  const tgtPlayer = world.players[target.owner];
  let base: number;
  let buildingMult = 1;
  if (attacker.kind === 'unit') {
    const def = getUnitDef(attacker.type);
    base = def.attack?.damage ?? 0;
    buildingMult = def.buildingDamageMult ?? 1;
    // Bandido: dano reduzido fora do próprio território.
    const s = sectorAt(world.map, attacker.x, attacker.y);
    const inOwn = s >= 0 && world.sectors[s].owner === attacker.owner;
    if (!inOwn) base *= FACTIONS[atkPlayer.faction].rules.outsideDamageMult;
  } else {
    base = getBuildingDef(attacker.type).attack?.damage ?? 0;
  }
  base *= atkPlayer.mods.damage;

  let armor: number;
  if (target.kind === 'unit') {
    armor = getUnitDef(target.type).armor;
    // Polícia: menos dano dentro do próprio território.
    const s = sectorAt(world.map, target.x, target.y);
    if (s >= 0 && world.sectors[s].owner === target.owner) {
      base *= 1 - FACTIONS[tgtPlayer.faction].rules.homeDefenseReduction;
    }
  } else {
    armor = getBuildingDef(target.type).armor;
    base *= buildingMult;
  }
  return Math.max(COMBAT.minDamage, base * (1 - armor));
}

export function applyDamage(world: World, attacker: Attacker, target: Unit | Building, amount: number) {
  if (target.hp <= 0) return;
  target.hp -= amount;
  if (target.kind === 'unit') {
    target.attackedBy = attacker.id;
    if (world.tick - target.lastAttackTick > 50) {
      const p = entityPos(target);
      emit(world, { type: 'underAttack', owner: target.owner, x: p.x, y: p.y });
    }
    target.lastAttackTick = world.tick;
  } else {
    if (world.tick % 30 === 0) {
      const p = entityPos(target);
      emit(world, { type: 'underAttack', owner: target.owner, x: p.x, y: p.y });
    }
  }
  if (target.hp <= 0) {
    target.hp = 0;
    world.players[attacker.owner].stats.kills++;
  }
}

/** Executa um disparo: aplica dano e registra o efeito visual. */
export function fire(world: World, attacker: Attacker, target: Unit | Building, heavy: boolean) {
  const dmg = computeDamage(world, attacker, target);
  const from = entityPos(attacker);
  const to = entityPos(target);
  emit(world, { type: 'shot', from: attacker.id, to: target.id, x0: from.x, y0: from.y, x1: to.x, y1: to.y, heavy });
  applyDamage(world, attacker, target, dmg);
}
