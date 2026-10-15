// Camada 2D sobre o 3D: barras de vida, progresso de obras e retângulo de seleção.
import { getUnitDef } from '../config/units';
import type { GameSession } from '../core/session';
import { isVisibleTo } from '../game/units/behavior';

export class Overlay {
  private ctx: CanvasRenderingContext2D;
  dragRect: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private s: GameSession,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw() {
    this.resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    const { world, humanId, selection, renderer } = this.s;
    const always = this.s.host.settings.healthBars === 'sempre';

    for (const u of world.units.values()) {
      const sel = selection.has(u.id);
      if (!sel && !always && u.hp >= u.maxHp) continue;
      if (u.owner !== humanId && !isVisibleTo(world, humanId, u)) continue;
      const vehicle = getUnitDef(u.type).category === 'vehicle';
      const p = renderer.worldToScreen(u.x, u.y, vehicle ? 1.3 : 1.25);
      if (!p.visible) continue;
      const w = vehicle ? 30 : 22;
      this.bar(p.x - w / 2, p.y - 6, w, 4, u.hp / u.maxHp, u.owner === humanId ? null : '#ff5a5a');
    }
    for (const b of world.buildings.values()) {
      const sel = selection.has(b.id);
      if (!sel && !always && b.hp >= b.maxHp && b.built) continue;
      if (b.owner !== humanId && !isVisibleTo(world, humanId, b)) continue;
      const p = renderer.worldToScreen(b.tx + b.size / 2, b.ty + b.size / 2, 2.8);
      if (!p.visible) continue;
      const w = 18 + b.size * 12;
      this.bar(p.x - w / 2, p.y - 8, w, 5, b.hp / b.maxHp, b.owner === humanId ? null : '#ff5a5a');
      if (!b.built) this.bar(p.x - w / 2, p.y - 1, w, 4, b.progress, '#f2b630');
      else if (sel && b.queue.length) this.bar(p.x - w / 2, p.y - 1, w, 3, 1 - b.queue[0].remaining / b.queue[0].total, '#5fc8ff');
    }

    if (this.dragRect) {
      const { x0, y0, x1, y1 } = this.dragRect;
      ctx.fillStyle = 'rgba(92, 255, 138, 0.10)';
      ctx.strokeStyle = 'rgba(92, 255, 138, 0.9)';
      ctx.lineWidth = 1;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, color: string | null) {
    const ctx = this.ctx;
    const f = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color ?? (f > 0.6 ? '#4fd67a' : f > 0.3 ? '#f2c230' : '#ef4b4b');
    ctx.fillRect(x, y, w * f, h);
  }
}
