// Grade espacial uniforme para consultas de vizinhança (alvos, separação, cura).
import type { Unit, World } from '../types';

const CELL = 4;

export class SpatialHash {
  private cols = 0;
  private rows = 0;
  private cells: Unit[][] = [];

  rebuild(world: World) {
    this.cols = Math.ceil(world.map.width / CELL);
    this.rows = Math.ceil(world.map.height / CELL);
    const n = this.cols * this.rows;
    if (this.cells.length !== n) this.cells = Array.from({ length: n }, () => []);
    else for (const c of this.cells) c.length = 0;
    for (const u of world.units.values()) {
      if (u.hp <= 0) continue;
      const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(u.x / CELL)));
      const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(u.y / CELL)));
      this.cells[cy * this.cols + cx].push(u);
    }
  }

  /** Chama fn para cada unidade cujo centro está a até `radius` de (x, y). */
  query(x: number, y: number, radius: number, fn: (u: Unit, dist: number) => void) {
    const x0 = Math.max(0, Math.floor((x - radius) / CELL));
    const x1 = Math.min(this.cols - 1, Math.floor((x + radius) / CELL));
    const y0 = Math.max(0, Math.floor((y - radius) / CELL));
    const y1 = Math.min(this.rows - 1, Math.floor((y + radius) / CELL));
    const r2 = radius * radius;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const u of this.cells[cy * this.cols + cx]) {
          const dx = u.x - x;
          const dy = u.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && u.hp > 0) fn(u, Math.sqrt(d2));
        }
      }
    }
  }
}
