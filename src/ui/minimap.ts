// Minimapa: territórios, construções, unidades visíveis, névoa e área da câmera.
// Clique esquerdo move a câmera; clique direito envia as unidades selecionadas.
import type { GameSession } from '../core/session';
import { isVisibleTo } from '../game/units/behavior';
import { hexCss } from './icons';

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogImg: ImageData;
  private timer = 0;
  private dragging = false;

  constructor(private s: GameSession) {
    const { map } = s.world;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 392;
    this.canvas.height = 360;
    this.ctx = this.canvas.getContext('2d')!;
    // Fundo: o mesmo desenho do chão, reduzido.
    this.base = document.createElement('canvas');
    this.base.width = map.width * 4;
    this.base.height = map.height * 4;
    this.base.getContext('2d')!.drawImage(s.renderer.city.groundCanvas, 0, 0, this.base.width, this.base.height);
    this.fog = document.createElement('canvas');
    this.fog.width = map.width;
    this.fog.height = map.height;
    this.fogCtx = this.fog.getContext('2d')!;
    this.fogImg = this.fogCtx.createImageData(map.width, map.height);

    this.canvas.addEventListener('mousedown', this.onDown);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy() {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }

  private toWorld(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const { map } = this.s.world;
    return { x: ((e.clientX - r.left) / r.width) * map.width, y: ((e.clientY - r.top) / r.height) * map.height };
  }

  private onDown = (e: MouseEvent) => {
    e.preventDefault();
    const p = this.toWorld(e);
    if (e.button === 2) {
      const ids = this.s.input.ownSelectedUnits().map((u) => u.id);
      if (ids.length) {
        this.s.issue({ type: 'move', player: this.s.humanId, unitIds: ids, x: p.x, y: p.y });
        this.s.renderer.effects.marker(p.x, p.y, 0x5cff8a);
      }
      return;
    }
    this.dragging = true;
    this.s.renderer.cam.centerOn(p.x, p.y);
  };

  private onMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    const p = this.toWorld(e);
    this.s.renderer.cam.centerOn(p.x, p.y);
  };

  private onUp = () => {
    this.dragging = false;
  };

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    this.draw();
  }

  draw() {
    const { world, humanId, renderer } = this.s;
    const { map } = world;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sx = W / map.width;
    const sy = H / map.height;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0, W, H);

    // Territórios
    world.sectors.forEach((st, i) => {
      const s = map.sectors[i];
      if (st.owner !== null) {
        ctx.fillStyle = hexCss(world.players[st.owner].color) + '40';
        ctx.fillRect(s.x0 * sx, s.y0 * sy, (s.x1 - s.x0) * sx, (s.y1 - s.y0) * sy);
        ctx.strokeStyle = hexCss(world.players[st.owner].color) + 'c0';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x0 * sx + 1, s.y0 * sy + 1, (s.x1 - s.x0) * sx - 2, (s.y1 - s.y0) * sy - 2);
      }
      ctx.fillStyle = st.contested ? '#ffd040' : st.owner === null ? '#ffffff' : hexCss(world.players[st.owner].color);
      ctx.beginPath();
      ctx.arc(s.cx * sx, s.cy * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Névoa
    if (world.config.fogOfWar) {
      const vis = world.visibility[humanId];
      const d = this.fogImg.data;
      for (let i = 0; i < vis.length; i++) {
        d[i * 4 + 3] = vis[i] === 2 ? 0 : vis[i] === 1 ? 120 : 235;
      }
      this.fogCtx.putImageData(this.fogImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fog, 0, 0, W, H);
    }

    // Construções
    for (const b of world.buildings.values()) {
      const own = b.owner === humanId;
      if (!own && !isVisibleTo(world, humanId, b) && !this.explored(b.tx, b.ty)) continue;
      ctx.fillStyle = hexCss(world.players[b.owner].color);
      ctx.fillRect(b.tx * sx, b.ty * sy, b.size * sx, b.size * sy);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.tx * sx + 0.5, b.ty * sy + 0.5, b.size * sx - 1, b.size * sy - 1);
    }
    // Unidades
    for (const u of world.units.values()) {
      if (u.owner !== humanId && !isVisibleTo(world, humanId, u)) continue;
      ctx.fillStyle = this.s.selection.has(u.id) ? '#ffffff' : hexCss(world.players[u.owner].color);
      ctx.fillRect(u.x * sx - 2, u.y * sy - 2, 4, 4);
    }
    // Área da câmera
    const corners = renderer.viewCorners();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach((c, i) => {
      const x = Math.max(-5, Math.min(W + 5, c.x * sx));
      const y = Math.max(-5, Math.min(H + 5, c.y * sy));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private explored(x: number, y: number): boolean {
    if (!this.s.world.config.fogOfWar) return true;
    return this.s.world.visibility[this.s.humanId][y * this.s.world.map.width + x] > 0;
  }
}
