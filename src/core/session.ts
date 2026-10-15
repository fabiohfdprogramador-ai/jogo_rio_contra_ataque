// Sessão de partida: liga simulação, renderização, entrada e interface.
// Mantém o ciclo de jogo com passo fixo de simulação e renderização interpolada.
import { TICK_RATE, VISION } from '../config/game';
import type { Command } from '../game/commands';
import { Simulation } from '../game/simulation';
import type { GameEvent, World } from '../game/types';
import type { GameRenderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { InputController } from '../ui/input';
import { Overlay } from '../ui/overlay';
import type { UserSettings } from '../ui/settings';

export type InteractionMode =
  | { type: 'none' }
  | { type: 'place'; buildingType: string }
  | { type: 'attackMove' }
  | { type: 'patrol' }
  | { type: 'repair' }
  | { type: 'follow' }
  | { type: 'rally'; buildingId: number };

export interface SessionHost {
  renderer: GameRenderer;
  settings: UserSettings;
  uiRoot: HTMLElement;
  overlayCanvas: HTMLCanvasElement;
  /** Volta ao menu principal. */
  exitToMenu(): void;
  /** Inicia uma nova sessão com o mundo informado (reinício ou partida carregada). */
  startWorld(world: World): void;
  openSettings(onClose: () => void): void;
}

const MAX_STEPS_PER_FRAME = 8;

export class GameSession {
  readonly sim: Simulation;
  readonly selection = new Set<number>();
  selectedSector: number | null = null;
  mode: InteractionMode = { type: 'none' };
  paused = false;
  speed = 1;
  readonly controlGroups = new Map<number, number[]>();
  readonly hud: Hud;
  readonly input: InputController;
  readonly overlay: Overlay;
  private acc = 0;
  private autosaveTimer = 0;
  private ended = false;

  constructor(
    readonly host: SessionHost,
    readonly world: World,
    readonly humanId: number,
  ) {
    this.sim = new Simulation(world);
    host.renderer.setWorld(world, humanId);
    this.overlay = new Overlay(host.overlayCanvas, this);
    this.hud = new Hud(this);
    this.input = new InputController(this);
    if (world.status === 'ended') this.handleGameOver();
  }

  get renderer(): GameRenderer {
    return this.host.renderer;
  }

  issue(cmd: Command) {
    this.sim.queue(cmd);
  }

  setMode(mode: InteractionMode) {
    this.mode = mode;
    if (mode.type !== 'place') this.renderer.setGhost(null);
    this.hud.invalidate();
  }

  select(ids: number[], additive = false) {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.selectedSector = null;
    this.hud.closeBuildMenu();
    this.hud.invalidate();
  }

  selectSector(id: number | null) {
    this.selection.clear();
    this.selectedSector = id;
    this.hud.invalidate();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.hud.invalidate();
  }

  frame(dt: number) {
    const clamped = Math.min(dt, 0.25);
    this.input.update(clamped);
    if (!this.paused && this.world.status === 'running') {
      this.acc += clamped * this.speed;
      const step = 1 / TICK_RATE;
      let steps = 0;
      while (this.acc >= step && steps < MAX_STEPS_PER_FRAME) {
        const tickBefore = this.world.tick;
        const events = this.sim.step();
        this.onEvents(events);
        if (tickBefore % VISION.updateEveryTicks === 0) this.renderer.updateFog();
        this.acc -= step;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      this.autosaveTimer += clamped;
      if (this.autosaveTimer > 60) {
        this.autosaveTimer = 0;
        this.hud.autosave();
      }
    }
    // Remove da seleção entidades que deixaram de existir.
    for (const id of this.selection) {
      if (!this.world.units.has(id) && !this.world.buildings.has(id) && !this.world.ruins.has(id)) {
        this.selection.delete(id);
        this.hud.invalidate();
      }
    }
    const alpha = this.paused ? 1 : Math.min(1, this.acc * TICK_RATE);
    this.renderer.render(clamped, alpha, this.selection);
    this.overlay.draw();
    this.hud.update(clamped);
  }

  private onEvents(events: GameEvent[]) {
    if (!events.length) return;
    this.renderer.handleEvents(events);
    this.hud.handleEvents(events);
    for (const e of events) if (e.type === 'gameOver') this.handleGameOver();
  }

  private handleGameOver() {
    if (this.ended) return;
    this.ended = true;
    this.setMode({ type: 'none' });
    this.hud.showEndScreen();
  }

  destroy() {
    this.input.detach();
    this.hud.destroy();
    this.overlay.clear();
    this.renderer.setGhost(null);
    this.renderer.setRallyMarker(null);
  }
}
