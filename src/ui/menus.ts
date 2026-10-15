// Telas fora da partida: menu principal, configuração da partida, carregar,
// configurações e créditos.
import { AI_PROFILES } from '../config/ai';
import { FACTION_IDS, FACTIONS } from '../config/factions';
import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION, MAP_SIZES, STARTING_RESOURCES, TICK_RATE } from '../config/game';
import { listSlots } from '../game/save';
import type { Difficulty, FactionId, MapSize, MatchConfig, StartingResources } from '../game/types';
import { clear, h } from './dom';
import { formatTime } from './icons';
import type { QualityPreset, UserSettings } from './settings';

export interface MenuActions {
  newGame(config: MatchConfig): void;
  quickMatch(): void;
  continueGame(): void;
  loadSlot(slot: string): void;
  settings: UserSettings;
  saveSettings(s: UserSettings): void;
}

type Screen = 'main' | 'setup' | 'load' | 'settings' | 'credits';

export class Menus {
  private el: HTMLElement;
  constructor(
    private root: HTMLElement,
    private actions: MenuActions,
  ) {
    this.el = h('div', { class: 'screen' });
  }

  show(screen: Screen = 'main') {
    clear(this.el);
    this.el.className = `screen${screen === 'main' ? ' menu-main' : ''}`;
    if (!this.el.isConnected) this.root.append(this.el);
    switch (screen) {
      case 'main':
        this.el.append(this.main());
        break;
      case 'setup':
        this.el.append(this.setup());
        break;
      case 'load':
        this.el.append(this.load());
        break;
      case 'settings':
        this.el.append(this.settingsDialog(() => this.show('main')));
        break;
      case 'credits':
        this.el.append(this.credits());
        break;
    }
  }

  hide() {
    this.el.remove();
  }

  private main(): HTMLElement {
    const hasSave = listSlots().length > 0;
    const [first, ...rest] = GAME_TITLE.split(' ');
    return h(
      'div',
      { class: 'menu-card' },
      h('h1', { class: 'game-title' }, first, ' ', h('span', {}, rest.join(' '))),
      h('div', { class: 'game-sub' }, GAME_SUBTITLE),
      h('button', { class: 'btn primary', onClick: () => this.show('setup') }, 'Jogar'),
      h('button', { class: 'btn', disabled: !hasSave, onClick: () => this.actions.continueGame() }, 'Continuar partida'),
      h('button', { class: 'btn', onClick: () => this.actions.quickMatch() }, 'Partida rápida (modo de teste)'),
      h('button', { class: 'btn', onClick: () => this.show('load') }, 'Carregar partida'),
      h('button', { class: 'btn', onClick: () => this.show('settings') }, 'Configurações'),
      h('button', { class: 'btn', onClick: () => this.show('credits') }, 'Créditos'),
      h('div', { class: 'hint' }, `Versão ${GAME_VERSION} · Cidade e organizações fictícias.`),
    );
  }

  private setup(): HTMLElement {
    let mode: 'single' | 'three' = 'single';
    let faction: FactionId = 'policia';
    const opponents: { faction: FactionId; difficulty: Difficulty }[] = [{ faction: 'milicia', difficulty: 'normal' }];
    let mapSize: MapSize = 'pequeno';
    let resources: StartingResources = 'normal';
    let domination = true;
    let ratio = 0.75;
    let timeLimit = 0;
    let fog = true;
    let start = 0;

    const body = h('div', {});
    const render = () => {
      clear(body);
      // Modos
      body.append(
        h(
          'div',
          { class: 'mode-tabs' },
          h('button', { class: `btn${mode === 'single' ? ' active' : ''}`, onClick: () => { mode = 'single'; if (opponents.length > 2) opponents.length = 2; render(); } }, 'Um jogador'),
          h('button', { class: `btn${mode === 'three' ? ' active' : ''}`, onClick: () => { mode = 'three'; syncThree(); mapSize = 'medio'; render(); } }, 'Três equipes'),
          h('button', { class: 'btn', disabled: true, title: 'Arquitetura preparada; ainda não disponível' }, 'Um contra um online (em breve)'),
        ),
      );
      body.append(h('h3', {}, 'Escolha sua equipe'));
      const grid = h('div', { class: 'faction-grid' });
      for (const id of FACTION_IDS) {
        const f = FACTIONS[id];
        grid.append(
          h(
            'div',
            {
              class: `faction-card${faction === id ? ' selected' : ''}`,
              style: { '--fc': f.colorCss } as unknown as Record<string, string>,
              onClick: () => {
                faction = id;
                if (mode === 'three') syncThree();
                else if (opponents.some((o) => o.faction === id) && opponents.length === 1) {
                  opponents[0].faction = FACTION_IDS.find((x) => x !== id)!;
                }
                render();
              },
            },
            h('h4', { style: { color: f.colorCss } }, f.name),
            h('div', { class: 'tag' }, f.tagline),
            h('ul', {}, ...f.strengths.map((s) => h('li', { class: 'plus' }, s)), ...f.weaknesses.map((s) => h('li', { class: 'minus' }, s))),
          ),
        );
      }
      // Variável CSS da cor da equipe
      grid.querySelectorAll<HTMLElement>('.faction-card').forEach((el, i) => el.style.setProperty('--fc', FACTIONS[FACTION_IDS[i]].colorCss));
      body.append(grid);

      body.append(h('h3', {}, 'Adversários (IA)'));
      opponents.forEach((o, i) => {
        body.append(
          h(
            'div',
            { class: 'opponent-row' },
            field('Equipe', select(FACTION_IDS.map((f) => [f, FACTIONS[f].name]), o.faction, (v) => { o.faction = v as FactionId; render(); }, mode === 'three')),
            field('Dificuldade', select((['facil', 'normal', 'dificil'] as Difficulty[]).map((d) => [d, AI_PROFILES[d].label]), o.difficulty, (v) => { o.difficulty = v as Difficulty; })),
            mode === 'single' && opponents.length > 1
              ? h('button', { class: 'btn small', onClick: () => { opponents.splice(i, 1); render(); } }, 'Remover')
              : null,
          ),
        );
      });
      if (mode === 'single' && opponents.length < 2) {
        body.append(
          h('button', { class: 'btn small', onClick: () => { opponents.push({ faction: FACTION_IDS.find((f) => f !== faction && !opponents.some((o) => o.faction === f)) ?? 'bandido', difficulty: 'normal' }); render(); } }, '+ Adicionar adversário'),
        );
      }

      body.append(h('h3', {}, 'Partida'));
      body.append(
        h(
          'div',
          { class: 'form-grid' },
          field('Tamanho do mapa', select(Object.entries(MAP_SIZES).map(([k, v]) => [k, v.label]), mapSize, (v) => (mapSize = v as MapSize))),
          field('Recursos iniciais', select(Object.entries(STARTING_RESOURCES).map(([k, v]) => [k, v.label]), resources, (v) => (resources = v as StartingResources))),
          field('Posição inicial', select([['0', 'Noroeste'], ['1', 'Sudeste'], ['2', 'Nordeste']], String(start), (v) => (start = Number(v)))),
          field('Limite de tempo', select([['0', 'Sem limite'], ['20', '20 minutos'], ['30', '30 minutos'], ['45', '45 minutos']], String(timeLimit), (v) => (timeLimit = Number(v)))),
          field('Vitória por domínio', select([['0', 'Desativada'], ['0.6', '60% dos setores'], ['0.75', '75% dos setores'], ['0.9', '90% dos setores']], domination ? String(ratio) : '0', (v) => {
            domination = v !== '0';
            if (domination) ratio = Number(v);
          })),
          field('Névoa de guerra', checkbox('Mapa inexplorado começa oculto', fog, (v) => (fog = v))),
        ),
      );
      body.append(h('p', { class: 'note' }, 'Destruir as bases principais adversárias sempre vence a partida. O domínio exige manter os setores por 90 segundos.'));
    };
    const syncThree = () => {
      const others = FACTION_IDS.filter((f) => f !== faction);
      const diff = opponents[0]?.difficulty ?? 'normal';
      opponents.length = 0;
      for (const f of others) opponents.push({ faction: f, difficulty: diff });
    };
    render();

    return h(
      'div',
      { class: 'dialog' },
      h('h2', {}, 'Nova partida'),
      h('p', {}, 'Escolha sua equipe, os adversários e as regras. Cada equipe tem unidades, construções e regras próprias.'),
      body,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onClick: () => this.show('main') }, 'Voltar'),
        h(
          'button',
          {
            class: 'btn primary',
            onClick: () => {
              const total = 1 + opponents.length;
              // Distribui as demais posições iniciais entre os adversários.
              const freeStarts = [0, 1, 2].filter((s) => s !== start);
              const config: MatchConfig = {
                seed: (Math.random() * 1e9) >>> 0,
                mapSize,
                players: [
                  { faction, isAI: false, difficulty: 'normal', name: 'Você', start },
                  ...opponents.slice(0, total - 1).map((o, i) => ({
                    faction: o.faction,
                    isAI: true,
                    difficulty: o.difficulty,
                    name: `IA ${i + 1}`,
                    start: freeStarts[i],
                  })),
                ],
                startingResources: resources,
                victory: { domination, dominationRatio: ratio, dominationSeconds: 90, timeLimitMinutes: timeLimit },
                fogOfWar: fog,
              };
              this.actions.newGame(config);
            },
          },
          'Iniciar partida',
        ),
      ),
    );
  }

  private load(): HTMLElement {
    const slots = listSlots();
    const list = h('div', { class: 'slot-list' });
    if (!slots.length) list.append(h('p', {}, 'Nenhuma partida salva.'));
    for (const s of slots) {
      list.append(
        h(
          'div',
          { class: 'slot' },
          h(
            'div',
            {},
            h('div', {}, s.slot === 'auto' ? 'Salvamento automático' : `Espaço ${s.slot}`),
            h('div', { class: 'meta' }, `${s.faction} · ${formatTime(s.tick, TICK_RATE)} · ${new Date(s.savedAt).toLocaleString('pt-BR')}`),
          ),
          h('button', { class: 'btn small primary', onClick: () => this.actions.loadSlot(s.slot) }, 'Carregar'),
        ),
      );
    }
    return h(
      'div',
      { class: 'dialog narrow' },
      h('h2', {}, 'Carregar partida'),
      list,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: () => this.show('main') }, 'Voltar')),
    );
  }

  /** Também usado dentro da partida (menu de pausa). */
  settingsDialog(onClose: () => void): HTMLElement {
    const s = { ...this.actions.settings };
    return h(
      'div',
      { class: 'dialog narrow' },
      h('h2', {}, 'Configurações'),
      h(
        'div',
        { class: 'form-grid', style: { gridTemplateColumns: '1fr' } },
        field('Qualidade gráfica', select([['alta', 'Alta (sombras, alta resolução)'], ['media', 'Média'], ['baixa', 'Baixa (sem sombras e efeitos)']], s.quality, (v) => (s.quality = v as QualityPreset))),
        field('Velocidade da câmera', select([['0.6', 'Lenta'], ['1', 'Normal'], ['1.5', 'Rápida'], ['2', 'Muito rápida']], String(s.cameraSpeed), (v) => (s.cameraSpeed = Number(v)))),
        field('Barras de vida', select([['danificadas', 'Somente selecionadas ou danificadas'], ['sempre', 'Sempre']], s.healthBars, (v) => (s.healthBars = v as UserSettings['healthBars']))),
        field('Câmera', checkbox('Mover ao encostar o cursor na borda da tela', s.edgeScroll, (v) => (s.edgeScroll = v))),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onClick: onClose }, 'Cancelar'),
        h(
          'button',
          {
            class: 'btn primary',
            onClick: () => {
              this.actions.saveSettings(s);
              onClose();
            },
          },
          'Salvar',
        ),
      ),
    );
  }

  private credits(): HTMLElement {
    return h(
      'div',
      { class: 'dialog narrow' },
      h('h2', {}, 'Créditos'),
      h('p', {}, `${GAME_TITLE} — protótipo jogável (v${GAME_VERSION}).`),
      h('p', {}, 'Design, programação, IA e gráficos provisórios gerados proceduralmente. Tecnologias: TypeScript, Vite, Three.js e Vitest.'),
      h('p', {}, 'Cenário, territórios, personagens e organizações são fictícios, inspirados apenas na arquitetura e geografia urbanas do Rio de Janeiro. Mecânicas inspiradas no gênero RTS em geral.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: () => this.show('main') }, 'Voltar')),
    );
  }
}

function field(label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'field' }, h('label', {}, label), control);
}

function select(options: string[][], value: string, onChange: (v: string) => void, disabled = false): HTMLSelectElement {
  const el = h('select', { disabled }, ...options.map(([v, l]) => h('option', { value: v }, l)));
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check' }, input, label);
}
