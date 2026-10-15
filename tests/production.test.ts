import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/config/game';
import { getUnitDef } from '../src/config/units';
import { applyCommand } from '../src/game/commands';
import { Simulation } from '../src/game/simulation';
import { addBuilding, createWorld, recomputeDerived } from '../src/game/world';
import { findValidSpot, makeConfig } from './helpers';

function setup() {
  const world = createWorld(makeConfig({ fog: false }));
  const spot = findValidSpot(world, 0, 'pol_delegacia');
  const b = addBuilding(world, 0, 'pol_delegacia', spot.tx, spot.ty, true);
  recomputeDerived(world);
  return { world, sim: new Simulation(world), b };
}

const ownUnits = (world: ReturnType<typeof createWorld>) => [...world.units.values()].filter((u) => u.owner === 0);

describe('produção de unidades', () => {
  it('produz a unidade após o tempo configurado e cobra o custo', () => {
    const { world, sim, b } = setup();
    const p = world.players[0];
    const def = getUnitDef('pol_patrulha');
    const before = ownUnits(world).length;
    const money0 = p.resources.money;
    expect(applyCommand(world, { type: 'train', player: 0, buildingId: b.id, unitType: 'pol_patrulha' }).ok).toBe(true);
    expect(p.resources.money).toBe(money0 - def.cost.money!);
    for (let i = 0; i < def.buildTime * TICK_RATE - 2; i++) sim.step();
    expect(ownUnits(world).length).toBe(before);
    for (let i = 0; i < 4; i++) sim.step();
    expect(ownUnits(world).length).toBe(before + 1);
    expect(p.stats.unitsProduced).toBe(1);
  });

  it('a unidade nasce em posição caminhável perto da construção e segue o ponto de reunião', () => {
    const { world, sim, b } = setup();
    applyCommand(world, { type: 'rally', player: 0, buildingId: b.id, x: b.tx + 1.5, y: b.ty + b.size + 4 });
    applyCommand(world, { type: 'train', player: 0, buildingId: b.id, unitType: 'pol_recon' });
    for (let i = 0; i < getUnitDef('pol_recon').buildTime * TICK_RATE + 2; i++) sim.step();
    const u = ownUnits(world).find((x) => x.type === 'pol_recon' && x.order.type === 'move');
    expect(u).toBeDefined();
    expect(Math.hypot(u!.x - (b.tx + 1.5), u!.y - (b.ty + 1.5))).toBeLessThan(6);
  });

  it('cancelar item da fila devolve o custo', () => {
    const { world, b } = setup();
    const p = world.players[0];
    const money0 = p.resources.money;
    applyCommand(world, { type: 'train', player: 0, buildingId: b.id, unitType: 'pol_patrulha' });
    applyCommand(world, { type: 'cancelTrain', player: 0, buildingId: b.id, index: 0 });
    expect(b.queue.length).toBe(0);
    expect(p.resources.money).toBe(money0);
  });

  it('pausa a produção no limite de população', () => {
    const { world, sim, b } = setup();
    const p = world.players[0];
    p.resources.money = 100000;
    const room = p.popCap - p.popUsed;
    for (let i = 0; i < 6; i++) applyCommand(world, { type: 'train', player: 0, buildingId: b.id, unitType: 'pol_patrulha' });
    for (let i = 0; i < 6 * 12 * TICK_RATE; i++) sim.step();
    expect(p.popUsed).toBeLessThanOrEqual(p.popCap);
    expect(b.queue.length).toBe(Math.max(0, 6 - room));
  });

  it('bloqueia unidades que exigem melhoria e comandos de outro jogador', () => {
    const { world, b } = setup();
    const garageSpot = findValidSpot(world, 0, 'pol_garagem');
    const g = addBuilding(world, 0, 'pol_garagem', garageSpot.tx, garageSpot.ty, true);
    world.players[0].resources = { money: 9999, materials: 9999, fuel: 9999 };
    expect(applyCommand(world, { type: 'train', player: 0, buildingId: g.id, unitType: 'pol_blindado' }).ok).toBe(false);
    world.players[0].techs.push('pol_t_blindagem');
    expect(applyCommand(world, { type: 'train', player: 0, buildingId: g.id, unitType: 'pol_blindado' }).ok).toBe(true);
    expect(applyCommand(world, { type: 'train', player: 1, buildingId: b.id, unitType: 'pol_patrulha' }).ok).toBe(false);
  });

  it('pesquisa aplica o efeito da melhoria', () => {
    const world = createWorld(makeConfig({ fog: false }));
    const sim = new Simulation(world);
    const spot = findValidSpot(world, 0, 'pol_comunicacao');
    const r = addBuilding(world, 0, 'pol_comunicacao', spot.tx, spot.ty, true);
    recomputeDerived(world);
    world.players[0].resources = { money: 9999, materials: 9999, fuel: 9999 };
    const unit = [...world.units.values()].find((u) => u.owner === 0 && u.type === 'pol_patrulha')!;
    const hp0 = unit.maxHp;
    expect(applyCommand(world, { type: 'research', player: 0, buildingId: r.id, techId: 'pol_t_coletes' }).ok).toBe(true);
    for (let i = 0; i < 45 * TICK_RATE; i++) sim.step();
    expect(world.players[0].techs).toContain('pol_t_coletes');
    expect(unit.maxHp).toBeGreaterThan(hp0);
  });
});
