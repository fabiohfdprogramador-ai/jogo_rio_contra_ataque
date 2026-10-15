import { describe, expect, it } from 'vitest';
import { checkAvailability, checkPlacement } from '../src/game/buildings/placement';
import { applyCommand } from '../src/game/commands';
import { addBuilding, createWorld, recomputeDerived } from '../src/game/world';
import { findValidSpot, makeConfig } from './helpers';

describe('posicionamento de construções', () => {
  it('aceita local livre no próprio território', () => {
    const world = createWorld(makeConfig());
    const spot = findValidSpot(world, 0, 'pol_delegacia');
    expect(checkPlacement(world, 0, 'pol_delegacia', spot.tx, spot.ty).ok).toBe(true);
  });

  it('rejeita fora do território', () => {
    const world = createWorld(makeConfig());
    const s = world.map.sectors.find((x) => world.sectors[x.id].owner === null)!;
    const res = checkPlacement(world, 0, 'pol_subestacao', s.x0 + 4, s.y0 + 4);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Fora do seu território');
  });

  it('rejeita sobre outra construção e exige espaçamento mínimo', () => {
    const world = createWorld(makeConfig());
    const hq = [...world.buildings.values()].find((b) => b.owner === 0)!;
    expect(checkPlacement(world, 0, 'pol_subestacao', hq.tx, hq.ty).ok).toBe(false);
    expect(checkPlacement(world, 0, 'pol_subestacao', hq.tx + hq.size, hq.ty).ok).toBe(false);
  });

  it('rejeita sobre ruas', () => {
    const world = createWorld(makeConfig());
    // A malha urbana começa com rua em (0, 0).
    const res = checkPlacement(world, 0, 'pol_subestacao', 0, 0);
    expect(res.ok).toBe(false);
    expect(res.tiles[0]).toBe(false);
  });

  it('respeita requisitos de construção, limite e equipe', () => {
    const world = createWorld(makeConfig());
    const av = checkAvailability(world, 0, 'pol_garagem');
    expect(av.ok).toBe(false);
    expect(av.reason).toMatch(/Requer Delegacia/);
    expect(checkAvailability(world, 0, 'mil_garagem').ok).toBe(false);
    expect(checkAvailability(world, 0, 'pol_base').ok).toBe(false);
    // Após a delegacia ficar pronta, a garagem é liberada.
    const spot = findValidSpot(world, 0, 'pol_delegacia');
    addBuilding(world, 0, 'pol_delegacia', spot.tx, spot.ty, true);
    recomputeDerived(world);
    expect(checkAvailability(world, 0, 'pol_garagem').ok).toBe(true);
  });

  it('o servidor de regras valida a posse: jogador não constrói em território alheio', () => {
    const world = createWorld(makeConfig());
    const enemyHq = [...world.buildings.values()].find((b) => b.owner === 1)!;
    const r = applyCommand(world, { type: 'build', player: 0, buildingType: 'pol_subestacao', tx: enemyHq.tx + 6, ty: enemyHq.ty });
    expect(r.ok).toBe(false);
  });
});
