import { describe, expect, it } from 'vitest';
import { getBuildingDef } from '../src/config/buildings';
import { ECONOMY, STARTING_RESOURCES, TICK_RATE } from '../src/config/game';
import { applyCommand } from '../src/game/commands';
import { Simulation } from '../src/game/simulation';
import { addBuilding, canAfford, createWorld, recomputeDerived, refund, spend } from '../src/game/world';
import { findValidSpot, makeConfig } from './helpers';

describe('economia', () => {
  it('começa com os recursos configurados', () => {
    const world = createWorld(makeConfig());
    expect(world.players[0].resources.money).toBe(STARTING_RESOURCES.normal.money);
    expect(world.players[0].resources.materials).toBe(STARTING_RESOURCES.normal.materials);
  });

  it('gasta e devolve recursos corretamente', () => {
    const world = createWorld(makeConfig());
    const p = world.players[0];
    p.resources = { money: 100, materials: 50, fuel: 0 };
    expect(canAfford(p.resources, { money: 100, materials: 50 })).toBe(true);
    expect(canAfford(p.resources, { money: 101 })).toBe(false);
    expect(spend(p, { money: 101 })).toBe(false);
    expect(p.resources.money).toBe(100);
    expect(spend(p, { money: 60, materials: 20 })).toBe(true);
    expect(p.resources).toEqual({ money: 40, materials: 30, fuel: 0 });
    refund(p, { money: 60, materials: 20 });
    expect(p.resources).toEqual({ money: 100, materials: 50, fuel: 0 });
  });

  it('gera renda contínua a partir de territórios e da base', () => {
    const world = createWorld(makeConfig({ fog: false }));
    const sim = new Simulation(world);
    const before = world.players[0].resources.money;
    for (let i = 0; i < 60 * TICK_RATE; i++) sim.step();
    const income = world.players[0].incomePerMin.money;
    expect(income).toBeGreaterThan(0);
    // O jogador 0 é humano e não gasta: após 1 minuto, acumula ~1 minuto de renda.
    expect(world.players[0].resources.money - before).toBeGreaterThan(income * 0.9);
  });

  it('desconta o custo da construção e rejeita sem recursos', () => {
    const world = createWorld(makeConfig());
    const p = world.players[0];
    const spot = findValidSpot(world, 0, 'pol_delegacia');
    const cost = getBuildingDef('pol_delegacia').cost;
    const money0 = p.resources.money;
    expect(applyCommand(world, { type: 'build', player: 0, buildingType: 'pol_delegacia', tx: spot.tx, ty: spot.ty }).ok).toBe(true);
    expect(p.resources.money).toBe(money0 - cost.money!);

    p.resources = { money: 0, materials: 0, fuel: 0 };
    const spot2 = findValidSpot(world, 0, 'pol_subestacao');
    const r = applyCommand(world, { type: 'build', player: 0, buildingType: 'pol_subestacao', tx: spot2.tx, ty: spot2.ty });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Falta/);
  });

  it('cancelar obra devolve tudo; demolir construção pronta devolve parte e libera o terreno', () => {
    const world = createWorld(makeConfig());
    const sim = new Simulation(world);
    const p = world.players[0];
    const spot = findValidSpot(world, 0, 'pol_subestacao');
    const money0 = p.resources.money;
    applyCommand(world, { type: 'build', player: 0, buildingType: 'pol_subestacao', tx: spot.tx, ty: spot.ty });
    const b = [...world.buildings.values()].find((x) => x.type === 'pol_subestacao')!;
    applyCommand(world, { type: 'demolish', player: 0, targetId: b.id });
    expect(world.buildings.has(b.id)).toBe(false);
    expect(p.resources.money).toBe(money0);

    applyCommand(world, { type: 'build', player: 0, buildingType: 'pol_subestacao', tx: spot.tx, ty: spot.ty });
    const b2 = [...world.buildings.values()].find((x) => x.type === 'pol_subestacao')!;
    b2.built = true;
    b2.progress = 1;
    const m1 = p.resources.money;
    applyCommand(world, { type: 'demolish', player: 0, targetId: b2.id });
    for (let i = 0; i < ECONOMY.demolishSeconds * TICK_RATE + 1; i++) sim.step();
    expect(world.buildings.has(b2.id)).toBe(false);
    const refundValue = Math.round(getBuildingDef('pol_subestacao').cost.money! * ECONOMY.demolishRefund);
    expect(p.resources.money - m1).toBeGreaterThanOrEqual(refundValue);
    expect(world.occupancy[spot.ty * world.map.width + spot.tx]).toBe(0);
  });

  it('falta de energia reduz a produção pela metade', () => {
    const progressIn10Ticks = (extraConsumers: number) => {
      const world = createWorld(makeConfig({ fog: false }));
      const sim = new Simulation(world);
      const spot = findValidSpot(world, 0, 'pol_delegacia');
      const b = addBuilding(world, 0, 'pol_delegacia', spot.tx, spot.ty, true);
      for (let i = 0; i < extraConsumers; i++) {
        const s = findValidSpot(world, 0, 'pol_bloqueio');
        addBuilding(world, 0, 'pol_bloqueio', s.tx, s.ty, true);
      }
      recomputeDerived(world);
      applyCommand(world, { type: 'train', player: 0, buildingId: b.id, unitType: 'pol_patrulha' });
      const total = b.queue[0].total;
      for (let i = 0; i < 10; i++) sim.step();
      return { done: total - b.queue[0].remaining, lowPower: world.players[0].energyDemand > world.players[0].energySupply };
    };
    const normal = progressIn10Ticks(0);
    const low = progressIn10Ticks(3);
    expect(normal.lowPower).toBe(false);
    expect(low.lowPower).toBe(true);
    expect(low.done).toBeCloseTo(normal.done * ECONOMY.lowPowerFactor, 5);
  });
});
