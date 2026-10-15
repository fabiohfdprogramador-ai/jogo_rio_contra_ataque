// Entrada do jogador: câmera, seleção (clique e arrasto), ordens com o botão
// direito, modos de comando, posicionamento de construções e atalhos.
import { getBuildingDef } from '../config/buildings';
import { getUnitDef } from '../config/units';
import type { GameSession } from '../core/session';
import { checkPlacement } from '../game/buildings/placement';
import { findRetreatPoint } from '../game/commands';
import { sectorAt } from '../game/map/mapgen';
import type { Unit } from '../game/types';
import { isVisibleTo } from '../game/units/behavior';

const DRAG_THRESHOLD = 6;
const EDGE = 14;

export class InputController {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, inside: false };
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private rotating: { x: number } | null = null;
  private lastClick = { time: 0, id: -1 };
  private el: HTMLElement;
  private lastGroupKey = { key: -1, time: 0 };

  constructor(private s: GameSession) {
    this.el = s.renderer.renderer.domElement;
    this.el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.el.addEventListener('wheel', this.onWheel, { passive: false });
    this.el.addEventListener('contextmenu', this.prevent);
    this.el.addEventListener('mouseleave', this.onLeave);
    this.el.addEventListener('mouseenter', this.onEnter);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    this.el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.prevent);
    this.el.removeEventListener('mouseleave', this.onLeave);
    this.el.removeEventListener('mouseenter', this.onEnter);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private prevent = (e: Event) => e.preventDefault();
  private onLeave = () => (this.mouse.inside = false);
  private onEnter = () => (this.mouse.inside = true);
  private onBlur = () => this.keys.clear();

  /** Movimento contínuo da câmera (teclado e bordas da tela). */
  update(dt: number) {
    const cam = this.s.renderer.cam;
    const speed = 28 * this.s.host.settings.cameraSpeed * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy -= 1;
    if (this.s.host.settings.edgeScroll && this.mouse.inside && !this.dragging && !this.s.hud.modalOpen) {
      const w = this.el.clientWidth;
      const h = this.el.clientHeight;
      if (this.mouse.x < EDGE) dx -= 1;
      if (this.mouse.x > w - EDGE) dx += 1;
      if (this.mouse.y < EDGE) dy += 1;
      if (this.mouse.y > h - EDGE) dy -= 1;
    }
    if (dx || dy) cam.pan(dx * speed, dy * speed);
    if (this.keys.has('KeyQ')) cam.rotate(-1.6 * dt);
    if (this.keys.has('KeyE')) cam.rotate(1.6 * dt);
  }

  private local(e: MouseEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onMouseDown = (e: MouseEvent) => {
    if (this.s.hud.modalOpen) return;
    const p = this.local(e);
    this.mouse = { ...p, inside: true };
    if (e.button === 1) {
      this.rotating = { x: e.clientX };
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      if (this.s.mode.type !== 'none') this.s.setMode({ type: 'none' });
      else this.rightClick(p.x, p.y);
      return;
    }
    if (e.button !== 0) return;
    if (this.s.mode.type !== 'none') {
      this.modeClick(p.x, p.y, e.shiftKey);
      return;
    }
    this.dragStart = p;
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    const p = this.local(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    if (this.rotating) {
      this.s.renderer.cam.rotate((e.clientX - this.rotating.x) * 0.008);
      this.rotating.x = e.clientX;
    }
    if (this.dragStart) {
      if (!this.dragging && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > DRAG_THRESHOLD) this.dragging = true;
      if (this.dragging) this.s.overlay.dragRect = { x0: this.dragStart.x, y0: this.dragStart.y, x1: p.x, y1: p.y };
    }
    if (this.s.mode.type === 'place') this.updateGhost();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 1) this.rotating = null;
    if (e.button !== 0 || !this.dragStart) return;
    const p = this.local(e);
    if (this.dragging) this.boxSelect(this.dragStart.x, this.dragStart.y, p.x, p.y, e.shiftKey);
    else this.clickSelect(p.x, p.y, e.shiftKey);
    this.dragStart = null;
    this.dragging = false;
    this.s.overlay.dragRect = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.s.renderer.cam.zoom(Math.sign(e.deltaY) * 0.1);
  };

  // ---------- Seleção ----------

  /** Unidade mais próxima do cursor (em pixels de tela). */
  private pickUnit(sx: number, sy: number): Unit | null {
    const { world, humanId, renderer } = this.s;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const u of world.units.values()) {
      if (u.owner !== humanId && !isVisibleTo(world, humanId, u)) continue;
      const vehicle = getUnitDef(u.type).category === 'vehicle';
      const p = renderer.worldToScreen(u.x, u.y, 0.45);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - sx, p.y - sy);
      const r = (vehicle ? 26 : 18) * Math.min(1.4, 34 / renderer.cam.distance + 0.4);
      if (d < r && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private pickStructure(sx: number, sy: number): { kind: 'building' | 'ruin'; id: number } | null {
    const hit = this.s.renderer.pickStructure(sx, sy);
    if (!hit) return null;
    if (hit.kind === 'building') {
      const b = this.s.world.buildings.get(hit.id);
      if (!b) return null;
    }
    return hit;
  }

  private clickSelect(sx: number, sy: number, shift: boolean) {
    const { world, humanId } = this.s;
    const unit = this.pickUnit(sx, sy);
    const now = performance.now();
    if (unit) {
      const dbl = now - this.lastClick.time < 350 && this.lastClick.id === unit.id;
      this.lastClick = { time: now, id: unit.id };
      if (dbl && unit.owner === humanId) {
        // Duplo clique: todas as unidades do mesmo tipo visíveis na tela
        const ids = [...world.units.values()]
          .filter((u) => u.owner === humanId && u.type === unit.type && this.onScreen(u.x, u.y))
          .map((u) => u.id);
        this.s.select(ids);
        return;
      }
      if (shift && unit.owner === humanId && [...this.s.selection].every((id) => world.units.get(id)?.owner === humanId)) {
        if (this.s.selection.has(unit.id)) {
          this.s.selection.delete(unit.id);
          this.s.hud.invalidate();
        } else this.s.select([unit.id], true);
        return;
      }
      this.s.select([unit.id]);
      return;
    }
    const st = this.pickStructure(sx, sy);
    if (st) {
      this.s.select([st.id]);
      return;
    }
    const g = this.s.renderer.screenToGround(sx, sy);
    if (!g) return;
    const sector = sectorAt(world.map, g.x, g.y);
    this.s.selectSector(sector >= 0 ? sector : null);
  }

  private onScreen(x: number, y: number): boolean {
    const p = this.s.renderer.worldToScreen(x, y, 0.3);
    return p.visible && p.x >= 0 && p.y >= 0 && p.x <= this.el.clientWidth && p.y <= this.el.clientHeight - 196;
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, shift: boolean) {
    const { world, humanId, renderer } = this.s;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const ids: number[] = [];
    for (const u of world.units.values()) {
      if (u.owner !== humanId) continue;
      const p = renderer.worldToScreen(u.x, u.y, 0.35);
      if (p.visible && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) ids.push(u.id);
    }
    if (ids.length) this.s.select(ids, shift);
    else if (!shift) this.s.select([]);
  }

  // ---------- Ordens ----------

  ownSelectedUnits(): Unit[] {
    const out: Unit[] = [];
    for (const id of this.s.selection) {
      const u = this.s.world.units.get(id);
      if (u && u.owner === this.s.humanId) out.push(u);
    }
    return out;
  }

  private rightClick(sx: number, sy: number) {
    const { world, humanId } = this.s;
    const units = this.ownSelectedUnits();
    const ground = this.s.renderer.screenToGround(sx, sy);
    if (!units.length) {
      // Construção de produção selecionada: define ponto de reunião.
      const bid = [...this.s.selection][0];
      const b = bid !== undefined ? world.buildings.get(bid) : undefined;
      if (b && b.owner === humanId && getBuildingDef(b.type).trains && ground) {
        this.s.issue({ type: 'rally', player: humanId, buildingId: b.id, x: ground.x, y: ground.y });
        this.s.renderer.effects.marker(ground.x, ground.y, 0x5cff8a);
      }
      return;
    }
    const ids = units.map((u) => u.id);
    const target = this.pickUnit(sx, sy);
    if (target && target.owner !== humanId) {
      this.s.issue({ type: 'attack', player: humanId, unitIds: ids, targetId: target.id });
      this.s.renderer.effects.marker(target.x, target.y, 0xff4040);
      return;
    }
    if (target && target.owner === humanId && !this.s.selection.has(target.id)) {
      this.s.issue({ type: 'follow', player: humanId, unitIds: ids, targetId: target.id });
      this.s.renderer.effects.marker(target.x, target.y, 0x5fc8ff);
      return;
    }
    const st = this.pickStructure(sx, sy);
    if (st?.kind === 'building') {
      const b = world.buildings.get(st.id)!;
      if (b.owner !== humanId && isVisibleTo(world, humanId, b)) {
        this.s.issue({ type: 'attack', player: humanId, unitIds: ids, targetId: b.id });
        this.s.renderer.effects.marker(b.tx + b.size / 2, b.ty + b.size / 2, 0xff4040);
        return;
      }
      if (b.owner === humanId && (!b.built || b.hp < b.maxHp)) {
        const repairers = units.filter((u) => getUnitDef(u.type).canRepair);
        if (repairers.length) {
          this.s.issue({ type: 'repair', player: humanId, unitIds: repairers.map((u) => u.id), targetId: b.id });
          this.s.renderer.effects.marker(b.tx + b.size / 2, b.ty + b.size / 2, 0xf2b630);
          const others = units.filter((u) => !getUnitDef(u.type).canRepair);
          if (others.length && ground) this.s.issue({ type: 'move', player: humanId, unitIds: others.map((u) => u.id), x: ground.x, y: ground.y });
          return;
        }
      }
    }
    if (!ground) return;
    this.s.issue({ type: 'move', player: humanId, unitIds: ids, x: ground.x, y: ground.y });
    this.s.renderer.effects.marker(ground.x, ground.y, 0x5cff8a);
  }

  private modeClick(sx: number, sy: number, shift: boolean) {
    const { humanId, world } = this.s;
    const mode = this.s.mode;
    const ground = this.s.renderer.screenToGround(sx, sy);
    const ids = this.ownSelectedUnits().map((u) => u.id);
    switch (mode.type) {
      case 'place': {
        const spot = this.placementSpot(mode.buildingType);
        if (!spot) return;
        const res = checkPlacement(world, humanId, mode.buildingType, spot.tx, spot.ty);
        if (!res.ok) {
          this.s.hud.toast(res.reason, 'bad');
          this.s.hud.sound('error');
          return;
        }
        this.s.issue({ type: 'build', player: humanId, buildingType: mode.buildingType, tx: spot.tx, ty: spot.ty });
        this.s.hud.sound('place');
        if (!shift) this.s.setMode({ type: 'none' });
        return;
      }
      case 'attackMove':
        if (ground && ids.length) {
          const target = this.pickUnit(sx, sy);
          if (target && target.owner !== humanId) this.s.issue({ type: 'attack', player: humanId, unitIds: ids, targetId: target.id });
          else this.s.issue({ type: 'move', player: humanId, unitIds: ids, x: ground.x, y: ground.y, attackMove: true });
          this.s.renderer.effects.marker(ground.x, ground.y, 0xff8040);
        }
        break;
      case 'patrol':
        if (ground && ids.length) {
          this.s.issue({ type: 'patrol', player: humanId, unitIds: ids, x: ground.x, y: ground.y });
          this.s.renderer.effects.marker(ground.x, ground.y, 0x5fc8ff);
        }
        break;
      case 'follow': {
        const target = this.pickUnit(sx, sy);
        if (target) this.s.issue({ type: 'follow', player: humanId, unitIds: ids, targetId: target.id });
        break;
      }
      case 'repair': {
        const st = this.pickStructure(sx, sy);
        if (st?.kind === 'building') this.s.issue({ type: 'repair', player: humanId, unitIds: ids, targetId: st.id });
        else this.s.hud.toast('Clique em uma construção sua', 'bad');
        break;
      }
      case 'rally':
        if (ground) {
          this.s.issue({ type: 'rally', player: humanId, buildingId: mode.buildingId, x: ground.x, y: ground.y });
          this.s.renderer.effects.marker(ground.x, ground.y, 0x5cff8a);
        }
        break;
    }
    if (!shift) this.s.setMode({ type: 'none' });
  }

  placementSpot(type: string): { tx: number; ty: number } | null {
    const g = this.s.renderer.screenToGround(this.mouse.x, this.mouse.y);
    if (!g) return null;
    const size = getBuildingDef(type).size;
    return { tx: Math.round(g.x - size / 2), ty: Math.round(g.y - size / 2) };
  }

  updateGhost() {
    const mode = this.s.mode;
    if (mode.type !== 'place') return;
    const spot = this.placementSpot(mode.buildingType);
    if (!spot) {
      this.s.renderer.setGhost(null);
      return;
    }
    const def = getBuildingDef(mode.buildingType);
    const res = checkPlacement(this.s.world, this.s.humanId, mode.buildingType, spot.tx, spot.ty);
    this.s.renderer.setGhost({ size: def.size, tx: spot.tx, ty: spot.ty, tiles: res.tiles, ok: res.ok, height: 1.6 });
    this.s.hud.setPlacementReason(res.ok ? '' : res.reason);
  }

  // ---------- Teclado ----------

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (this.s.hud.modalOpen) {
      if (e.code === 'Escape') this.s.hud.closeTopModal();
      return;
    }
    this.keys.add(e.code);
    const humanId = this.s.humanId;
    const ids = this.ownSelectedUnits().map((u) => u.id);

    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (e.ctrlKey) {
        e.preventDefault();
        if (ids.length) {
          this.s.controlGroups.set(n, ids);
          this.s.hud.toast(`Grupo ${n} definido (${ids.length} unidades)`, 'good');
        }
      } else {
        const group = (this.s.controlGroups.get(n) ?? []).filter((id) => this.s.world.units.has(id));
        if (group.length) {
          this.s.select(group);
          const now = performance.now();
          if (this.lastGroupKey.key === n && now - this.lastGroupKey.time < 400) {
            const u = this.s.world.units.get(group[0])!;
            this.s.renderer.cam.centerOn(u.x, u.y);
          }
          this.lastGroupKey = { key: n, time: now };
        }
      }
      return;
    }

    switch (e.code) {
      case 'Escape':
        if (this.s.mode.type !== 'none') this.s.setMode({ type: 'none' });
        else if (this.s.hud.buildMenuOpen) this.s.hud.closeBuildMenu();
        else if (this.s.selection.size || this.s.selectedSector !== null) this.s.select([]);
        else this.s.hud.openPauseMenu();
        break;
      case 'Space':
      case 'KeyH':
        e.preventDefault();
        this.centerOnBase();
        break;
      case 'KeyF':
        if (ids.length) this.s.setMode({ type: 'attackMove' });
        break;
      case 'KeyG':
        if (ids.length) this.s.issue({ type: 'hold', player: humanId, unitIds: ids });
        break;
      case 'KeyX':
        if (ids.length) this.s.issue({ type: 'stop', player: humanId, unitIds: ids });
        break;
      case 'KeyP':
        if (ids.length) this.s.setMode({ type: 'patrol' });
        break;
      case 'KeyV':
        if (ids.length) this.s.issue({ type: 'retreat', player: humanId, unitIds: ids });
        break;
      case 'KeyR':
        if (this.ownSelectedUnits().some((u) => getUnitDef(u.type).canRepair)) this.s.setMode({ type: 'repair' });
        break;
      case 'KeyB':
        this.s.hud.toggleBuildMenu();
        break;
      case 'Delete':
        this.s.hud.demolishSelected();
        break;
      case 'F10':
        e.preventDefault();
        this.s.hud.openPauseMenu();
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  centerOnBase() {
    const p = findRetreatPoint(this.s.world, this.s.humanId);
    if (p) this.s.renderer.cam.centerOn(p.x, p.y);
  }
}
