// Controle territorial: captura de setores pelos pontos de controle.
//
// Regras:
//  - Apenas unidades com `canCapture` dentro do raio do ponto de controle contam.
//  - Se só uma equipe está presente, ela avança a captura; com mais de uma, o setor fica em disputa.
//  - Um setor com dono precisa primeiro ser neutralizado (progresso até 0) e depois capturado (até 100).
//  - Um setor que contém a base principal (QG) do dono não pode ser capturado enquanto ela existir.
import { getBuildingDef } from '../../config/buildings';
import { CAPTURE, TICK_RATE } from '../../config/game';
import { getUnitDef } from '../../config/units';
import { sectorAt } from '../map/mapgen';
import type { World } from '../types';
import type { SpatialHash } from '../units/spatial';
import { emit, recomputeDerived } from '../world';

export function sectorHasProtectedHQ(world: World, sectorId: number, owner: number | null): boolean {
  if (owner === null) return false;
  for (const b of world.buildings.values()) {
    if (b.owner !== owner || getBuildingDef(b.type).role !== 'hq') continue;
    if (sectorAt(world.map, b.tx, b.ty) === sectorId) return true;
  }
  return false;
}

export function updateTerritories(world: World, hash: SpatialHash) {
  let changed = false;
  world.map.sectors.forEach((sec, i) => {
    const state = world.sectors[i];
    const counts = new Map<number, number>();
    hash.query(sec.cx, sec.cy, CAPTURE.radius, (u) => {
      if (!getUnitDef(u.type).canCapture) return;
      counts.set(u.owner, (counts.get(u.owner) ?? 0) + 1);
    });
    state.contested = counts.size > 1;
    if (counts.size !== 1) return;
    const [team, n] = [...counts.entries()][0];
    const player = world.players[team];
    const rate =
      ((CAPTURE.baseRate * (1 + CAPTURE.perExtraUnit * (Math.min(n, CAPTURE.maxUnitsCounted) - 1))) * player.mods.captureSpeed) /
      TICK_RATE;

    if (state.owner === team) {
      state.progress = Math.min(100, state.progress + rate);
      state.captureTeam = team;
      return;
    }
    if (state.owner !== null) {
      if (sectorHasProtectedHQ(world, i, state.owner)) return;
      state.progress -= rate;
      if (state.progress <= 0) {
        const previous = state.owner;
        state.owner = null;
        state.progress = 0;
        state.captureTeam = team;
        emit(world, { type: 'sectorLost', sector: i, owner: previous });
        changed = true;
      }
      return;
    }
    // Setor neutro
    if (state.captureTeam !== team) {
      // Outra equipe havia iniciado a captura: o progresso dela é revertido primeiro.
      state.progress -= rate;
      if (state.progress <= 0) {
        state.progress = 0;
        state.captureTeam = team;
      }
      return;
    }
    state.progress += rate;
    if (state.progress >= 100) {
      state.progress = 100;
      state.owner = team;
      player.stats.sectorsCaptured++;
      emit(world, { type: 'sectorCaptured', sector: i, owner: team, previous: null });
      changed = true;
    }
  });
  if (changed) recomputeDerived(world);
}

export function sectorCount(world: World, player: number): number {
  let n = 0;
  for (const s of world.sectors) if (s.owner === player) n++;
  return n;
}
