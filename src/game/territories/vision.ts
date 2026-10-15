// Visão e exploração (névoa de guerra).
// Estados por tile: 0 = desconhecido, 1 = explorado sem visão atual, 2 = visível.
import { getBuildingDef } from '../../config/buildings';
import { SECTOR_TYPES } from '../../config/sectors';
import { getUnitDef } from '../../config/units';
import type { World } from '../types';

export function updateVision(world: World) {
  const { width, height } = world.map;
  const fog = world.config.fogOfWar;
  world.players.forEach((p, pid) => {
    const vis = world.visibility[pid];
    if (!fog) {
      vis.fill(2);
      return;
    }
    // Rebaixa o que estava visível para "explorado".
    for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;

    const stamp = (cx: number, cy: number, r: number) => {
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(width - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(height - 1, Math.ceil(cy + r));
      const r2 = r * r;
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          if (dx * dx + dy * dy <= r2) vis[y * width + x] = 2;
        }
      }
    };
    const stampSector = (i: number) => {
      const s = world.map.sectors[i];
      for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) vis[y * width + x] = 2;
    };

    for (const u of world.units.values()) {
      if (u.owner !== pid || u.hp <= 0) continue;
      stamp(u.x, u.y, getUnitDef(u.type).sight * p.mods.vision);
    }
    let radar = false;
    for (const b of world.buildings.values()) {
      if (b.owner !== pid) continue;
      const def = getBuildingDef(b.type);
      stamp(b.tx + b.size / 2, b.ty + b.size / 2, (b.built ? def.sight : 3) * p.mods.vision);
      if (b.built && def.radar) radar = true;
    }
    world.sectors.forEach((s, i) => {
      if (s.owner !== pid) return;
      // Ponto de controle sempre visível para o dono; posições elevadas e radar revelam o setor.
      const sec = world.map.sectors[i];
      if (radar || SECTOR_TYPES[sec.type].revealsSector) stampSector(i);
      else stamp(sec.cx, sec.cy, 5);
    });
  });
}

