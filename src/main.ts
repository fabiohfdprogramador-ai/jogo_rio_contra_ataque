// Ponto de entrada: cria o renderizador, os menus e alterna entre o menu
// (com uma partida de demonstração entre IAs ao fundo) e as partidas.
import { GAME_TITLE, TICK_RATE } from './config/game';
import { GameSession, type SessionHost } from './core/session';
import { latestSlot, loadFromSlot, SaveError, type SaveSlot } from './game/save';
import { Simulation } from './game/simulation';
import type { FactionId, MatchConfig, World } from './game/types';
import { createWorld } from './game/world';
import { GameRenderer } from './render/renderer';
import { h } from './ui/dom';
import { Menus } from './ui/menus';
import { loadSettings, qualityFor, saveSettings, type UserSettings } from './ui/settings';

class App implements SessionHost {
  readonly renderer: GameRenderer;
  settings: UserSettings;
  readonly uiRoot = document.getElementById('ui')!;
  readonly overlayCanvas = document.getElementById('overlay') as HTMLCanvasElement;
  private session: GameSession | null = null;
  private demo: { sim: Simulation; acc: number } | null = null;
  private menus: Menus;
  private last = performance.now();

  constructor() {
    document.title = GAME_TITLE;
    this.settings = loadSettings();
    this.renderer = new GameRenderer(document.getElementById('viewport')!, qualityFor(this.settings.quality));
    window.addEventListener('resize', () => this.renderer.resize());
    this.menus = new Menus(this.uiRoot, {
      newGame: (config) => this.startWorld(createWorld(config)),
      quickMatch: () => this.quickMatch(),
      continueGame: () => {
        const slot = latestSlot();
        if (slot) this.loadSlot(slot);
      },
      loadSlot: (slot) => this.loadSlot(slot as SaveSlot),
      settings: this.settings,
      saveSettings: (s) => this.applySettings(s),
    });

    const params = new URLSearchParams(location.search);
    if (params.has('quick')) this.quickMatch((params.get('quick') as FactionId) || undefined);
    else this.exitToMenu();
    requestAnimationFrame(this.loop);
    // Acesso para depuração no console durante o desenvolvimento.
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
  }

  get currentSession(): GameSession | null {
    return this.session;
  }

  private applySettings(s: UserSettings) {
    Object.assign(this.settings, s);
    saveSettings(this.settings);
    this.renderer.setQuality(qualityFor(this.settings.quality));
  }

  /** Modo de teste: partida pequena contra uma IA, sem passar pelos menus. */
  quickMatch(faction: FactionId = 'policia') {
    const valid: FactionId[] = ['policia', 'milicia', 'bandido'];
    const f = valid.includes(faction) ? faction : 'policia';
    const enemy = valid.find((x) => x !== f)!;
    const config: MatchConfig = {
      seed: (Math.random() * 1e9) >>> 0,
      mapSize: 'pequeno',
      players: [
        { faction: f, isAI: false, difficulty: 'normal', name: 'Você' },
        { faction: enemy, isAI: true, difficulty: 'normal', name: 'IA 1' },
      ],
      startingResources: 'normal',
      victory: { domination: true, dominationRatio: 0.75, dominationSeconds: 90, timeLimitMinutes: 0 },
      fogOfWar: true,
    };
    this.startWorld(createWorld(config));
  }

  private loadSlot(slot: SaveSlot) {
    try {
      this.startWorld(loadFromSlot(slot));
    } catch (err) {
      this.showError(err instanceof SaveError ? err.message : 'Não foi possível carregar a partida.');
    }
  }

  private showError(msg: string) {
    const box = h(
      'div',
      { class: 'modal-backdrop' },
      h('div', { class: 'dialog narrow' }, h('h2', {}, 'Erro'), h('p', {}, msg), h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: () => box.remove() }, 'OK'))),
    );
    this.uiRoot.append(box);
  }

  startWorld(world: World) {
    this.session?.destroy();
    this.session = null;
    this.demo = null;
    this.menus.hide();
    const humanId = Math.max(0, world.players.findIndex((p) => !p.isAI));
    this.session = new GameSession(this, world, humanId);
  }

  exitToMenu() {
    this.session?.destroy();
    this.session = null;
    this.startDemo();
    this.menus.show('main');
  }

  openSettings(onClose: () => void) {
    const backdrop = h('div', { class: 'modal-backdrop', style: { zIndex: '60' } });
    backdrop.append(
      this.menus.settingsDialog(() => {
        backdrop.remove();
        onClose();
      }),
    );
    this.uiRoot.append(backdrop);
  }

  /** Partida entre três IAs exibida atrás do menu principal. */
  private startDemo() {
    const config: MatchConfig = {
      seed: (Math.random() * 1e9) >>> 0,
      mapSize: 'medio',
      players: [
        { faction: 'policia', isAI: true, difficulty: 'dificil', name: 'IA 1' },
        { faction: 'milicia', isAI: true, difficulty: 'dificil', name: 'IA 2' },
        { faction: 'bandido', isAI: true, difficulty: 'dificil', name: 'IA 3' },
      ],
      startingResources: 'alto',
      victory: { domination: false, dominationRatio: 1, dominationSeconds: 999, timeLimitMinutes: 0 },
      fogOfWar: false,
    };
    const world = createWorld(config);
    this.demo = { sim: new Simulation(world), acc: 0 };
    this.renderer.setWorld(world, 0);
    this.renderer.cam.centerOn(world.map.width / 2, world.map.height / 2);
    this.renderer.cam.distance = 58;
  }

  private loop = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.session) {
      this.session.frame(dt);
    } else if (this.demo) {
      const d = this.demo;
      d.acc += dt;
      while (d.acc >= 1 / TICK_RATE) {
        this.renderer.handleEvents(d.sim.step());
        d.acc -= 1 / TICK_RATE;
      }
      if (d.sim.world.tick % 3 === 0) this.renderer.updateFog();
      this.renderer.cam.rotate(dt * 0.04);
      this.renderer.render(dt, d.acc * TICK_RATE, new Set());
      if (d.sim.world.status === 'ended' || d.sim.world.tick > TICK_RATE * 60 * 25) this.startDemo();
    }
    requestAnimationFrame(this.loop);
  };
}

new App();
