// Obras, demolição, produção de unidades, pesquisa e defesas das construções.
import { getBuildingDef } from '../../config/buildings';
import { ECONOMY, TICK_RATE } from '../../config/game';
import { getTechDef } from '../../config/techs';
import { getUnitDef } from '../../config/units';
import { fire } from '../combat/damage';
import { nearestWalkable } from '../map/grid';
import type { Building, World } from '../types';
import { acquireTarget } from '../units/behavior';
import { setOrder } from '../units/orders';
import type { SpatialHash } from '../units/spatial';
import {
  buildingCenter,
  distToEntity,
  emit,
  powerFactor,
  recomputeDerived,
  recomputeMods,
  refund,
  removeBuilding,
  spawnUnit,
} from '../world';

export function updateBuildings(world: World, hash: SpatialHash) {
  // Engenheiros ajudando cada obra
  const assist = new Map<number, number>();
  for (const u of world.units.values()) {
    if (u.order.type !== 'repair' || u.hp <= 0) continue;
    const b = world.buildings.get(u.order.targetId);
    if (!b || b.built) continue;
    if (distToEntity(u.x, u.y, b) <= 1.4) assist.set(b.id, (assist.get(b.id) ?? 0) + 1);
  }

  let derivedDirty = false;
  for (const b of [...world.buildings.values()]) {
    const player = world.players[b.owner];
    const def = getBuildingDef(b.type);

    // Demolição
    if (b.demolishTicks > 0) {
      b.demolishTicks--;
      if (b.demolishTicks === 0) {
        refund(player, def.cost, ECONOMY.demolishRefund);
        for (const q of b.queue) refund(player, getUnitDef(q.unitType).cost);
        if (b.research) refund(player, getTechDef(b.research.techId).cost);
        removeBuilding(world, b, false);
        derivedDirty = true;
      }
      continue;
    }

    // Obra em andamento
    if (!b.built) {
      const helpers = Math.min(ECONOMY.maxAssistingEngineers, assist.get(b.id) ?? 0);
      const rate = (1 / b.buildTotalTicks) * player.mods.buildSpeed * (1 + helpers * ECONOMY.engineerAssistBonus);
      const delta = Math.min(rate, 1 - b.progress);
      b.progress += delta;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * delta);
      if (b.progress >= 0.9999) {
        b.progress = 1;
        b.built = true;
        player.stats.buildingsBuilt++;
        emit(world, { type: 'buildingComplete', id: b.id, owner: b.owner, buildingType: b.type });
        derivedDirty = true;
      }
      continue;
    }

    const pf = powerFactor(player, ECONOMY.lowPowerFactor);

    // Produção de unidades
    if (b.queue.length > 0) {
      const item = b.queue[0];
      const udef = getUnitDef(item.unitType);
      if (player.popUsed + udef.pop <= player.popCap) {
        item.remaining -= pf;
        if (item.remaining <= 0) {
          b.queue.shift();
          spawnFromBuilding(world, b, item.unitType);
          derivedDirty = true;
        }
      }
    }

    // Pesquisa
    if (b.research) {
      b.research.remaining -= pf;
      if (b.research.remaining <= 0) {
        const techId = b.research.techId;
        b.research = null;
        if (!player.techs.includes(techId)) {
          player.techs.push(techId);
          player.stats.techsResearched++;
          recomputeMods(world, player);
          emit(world, { type: 'researchComplete', owner: b.owner, techId });
          derivedDirty = true;
        }
      }
    }

    // Defesa
    if (def.attack) {
      if (b.cooldown > 0) b.cooldown -= pf;
      if (b.cooldown <= 0) {
        const c = buildingCenter(b);
        let target = b.targetId !== null ? world.units.get(b.targetId) : undefined;
        if (!target || target.hp <= 0 || distToEntity(c.x, c.y, target) > def.attack.range + b.size / 2) {
          const found = acquireTarget(world, hash, c.x, c.y, b.owner, def.attack.range + b.size / 2, null);
          target = found && found.kind === 'unit' ? found : undefined;
          b.targetId = target?.id ?? null;
        }
        if (target) {
          fire(world, b, target, false);
          b.cooldown = def.attack.cooldown * TICK_RATE;
        }
      }
    }
  }
  if (derivedDirty) recomputeDerived(world);
}

function spawnFromBuilding(world: World, b: Building, unitType: string) {
  const player = world.players[b.owner];
  const c = buildingCenter(b);
  const exit = nearestWalkable(world, c.x, b.ty + b.size + 0.5, 8) ?? { x: Math.floor(c.x), y: b.ty + b.size };
  const u = spawnUnit(world, b.owner, unitType, exit.x + 0.5, exit.y + 0.5);
  player.stats.unitsProduced++;
  emit(world, { type: 'unitTrained', id: u.id, owner: b.owner, unitType });
  if (b.rallyX !== null && b.rallyY !== null) {
    setOrder(u, { type: 'move', x: b.rallyX, y: b.rallyY, attackMove: true });
  }
}
