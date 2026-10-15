// Interface da partida: barra de recursos, objetivos, painel de seleção,
// cartão de comandos, minimapa, notificações e janelas (pausa, salvar, fim).
import { BUILDINGS, getBuildingDef } from '../config/buildings';
import { FACTIONS } from '../config/factions';
import { ECONOMY, MAX_POP, TICK_RATE } from '../config/game';
import { SECTOR_TYPES } from '../config/sectors';
import { getTechDef } from '../config/techs';
import { getUnitDef } from '../config/units';
import type { GameSession } from '../core/session';
import { buildableList, checkAvailability, rebuildTypeFor } from '../game/buildings/placement';
import { isResearching } from '../game/commands';
import { sectorAt } from '../game/map/mapgen';
import { SaveError, listSlots, loadFromSlot, saveToSlot, type SaveSlot } from '../game/save';
import { sectorCount } from '../game/territories/territory';
import type { Building, Cost, GameEvent, Player, Unit } from '../game/types';
import { isVisibleTo } from '../game/units/behavior';
import { computeScore } from '../game/victory';
import { canAfford, createWorld, powerFactor } from '../game/world';
import { playSound, type SoundName } from './audio';
import { clear, escapeHtml, h } from './dom';
import { buildingIcon, formatTime, hexCss, unitIcon } from './icons';
import { Minimap } from './minimap';

interface CmdButton {
  label: string;
  glyph: { label: string; color: string };
  key?: string;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  tip: { title: string; cost?: Cost; time?: number; desc?: string; reason?: string; hint?: string };
  onClick: () => void;
}

const ORDER_LABEL: Record<string, string> = {
  idle: 'Aguardando ordens',
  move: 'Em deslocamento',
  attack: 'Atacando',
  hold: 'Defendendo posição',
  patrol: 'Patrulhando',
  follow: 'Seguindo',
  repair: 'Reparando / construindo',
};

export class Hud {
  private root: HTMLElement;
  private topbar: HTMLElement;
  private objectives: HTMLElement;
  private notifications: HTMLElement;
  private modeHint: HTMLElement;
  private pausedBanner: HTMLElement;
  private selPanel: HTMLElement;
  private cmdPanel: HTMLElement;
  private tooltip: HTMLElement;
  private minimap: Minimap;
  private modals: HTMLElement[] = [];
  private cmdSignature = '';
  private dirty = true;
  private tTop = 0;
  private tObj = 0;
  private tSel = 0;
  private lastAttackToast = -1e9;
  private lastErrorToast = 0;
  private lastDominationPlayer: number | null = null;
  private placementReason = '';
  buildMenuOpen = false;

  constructor(private s: GameSession) {
    this.root = h('div', { class: 'hud' });
    this.topbar = h('div', { class: 'topbar' });
    this.objectives = h('div', { class: 'objectives' });
    this.notifications = h('div', { class: 'notifications' });
    this.modeHint = h('div', { class: 'mode-hint', style: { display: 'none' } });
    this.pausedBanner = h('div', { class: 'paused-banner', style: { display: 'none' } }, 'Pausado');
    this.selPanel = h('div', { class: 'panel-box' });
    this.cmdPanel = h('div', { class: 'panel-box commands' });
    this.tooltip = h('div', { class: 'tooltip', style: { display: 'none' } });
    this.minimap = new Minimap(s);
    const bottom = h(
      'div',
      { class: 'bottombar' },
      h('div', { class: 'minimap-wrap' }, this.minimap.canvas),
      this.selPanel,
      this.cmdPanel,
    );
    this.root.append(this.topbar, this.objectives, this.notifications, this.modeHint, this.pausedBanner, bottom, this.tooltip);
    // Contêiner sem captura de clique, mas com elementos interativos.
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.pointerEvents = 'none';
    for (const el of [this.topbar, this.objectives, bottom, this.notifications]) el.style.pointerEvents = 'auto';
    this.notifications.style.pointerEvents = 'none';
    s.host.uiRoot.append(this.root);
  }

  get modalOpen(): boolean {
    return this.modals.length > 0;
  }

  invalidate() {
    this.dirty = true;
    this.tSel = 0;
  }

  sound(name: SoundName) {
    playSound(name);
  }

  destroy() {
    this.minimap.destroy();
    for (const m of this.modals) m.remove();
    this.modals = [];
    this.root.remove();
  }

  // ---------- Atualização ----------

  update(dt: number) {
    this.tTop -= dt;
    this.tObj -= dt;
    this.tSel -= dt;
    if (this.tTop <= 0) {
      this.tTop = 0.2;
      this.renderTopbar();
    }
    if (this.tObj <= 0) {
      this.tObj = 0.5;
      this.renderObjectives();
    }
    if (this.tSel <= 0 || this.dirty) {
      this.tSel = 0.2;
      this.renderSelection();
      this.renderCommands();
      this.dirty = false;
    }
    this.minimap.update(dt);
    this.renderModeHint();
    this.pausedBanner.style.display = this.s.paused && !this.modalOpen ? '' : 'none';
    // Ponto de reunião da construção selecionada
    const b = this.singleOwnBuilding();
    this.s.renderer.setRallyMarker(b && b.rallyX !== null && b.rallyY !== null ? { x: b.rallyX, y: b.rallyY } : null);
  }

  private get player(): Player {
    return this.s.world.players[this.s.humanId];
  }

  private renderTopbar() {
    const p = this.player;
    const r = p.resources;
    const inc = p.incomePerMin;
    const fd = FACTIONS[p.faction];
    const lowPower = p.energyDemand > p.energySupply;
    const popFull = p.popUsed >= p.popCap;
    const res = (ico: string, color: string, val: string, rate: string, title: string, warn = false) =>
      h(
        'div',
        { class: `res${warn ? ' warn' : ''}`, title },
        h('div', { class: 'ico', style: { background: color } }, ico),
        h('div', {}, h('div', { class: 'val' }, val), h('div', { class: 'rate' }, rate)),
      );
    clear(this.topbar);
    this.topbar.append(
      h('div', { class: 'faction-badge', style: { background: hexCss(p.color) } }, fd.name),
      res('$', 'var(--money)', fmt(r.money), `+${Math.round(inc.money)}/min`, 'Dinheiro: contratar unidades, construir e pesquisar'),
      res('M', 'var(--materials)', fmt(r.materials), `+${Math.round(inc.materials)}/min`, 'Materiais: construção, reparo e reconstrução'),
      res('C', 'var(--fuel)', fmt(r.fuel), `+${Math.round(inc.fuel)}/min`, 'Combustível: veículos e operações logísticas'),
      res(
        'E',
        'var(--energy)',
        `${p.energyDemand}/${p.energySupply}`,
        lowPower ? 'Energia insuficiente!' : 'consumo / geração',
        'Energia: falta de energia reduz produção, pesquisa e defesas pela metade',
        lowPower,
      ),
      res('P', 'var(--pop)', `${p.popUsed}/${p.popCap}`, popFull ? 'Limite atingido' : `máx. ${MAX_POP}`, 'População: limite de unidades', popFull),
      h('div', { class: 'spacer' }),
      h('div', { class: 'clock' }, formatTime(this.s.world.tick, TICK_RATE)),
      h(
        'button',
        {
          class: 'btn small',
          title: 'Velocidade da partida',
          onClick: () => {
            this.s.speed = this.s.speed >= 2 ? 1 : this.s.speed + 0.5;
            this.tTop = 0;
          },
        },
        `${this.s.speed}x`,
      ),
      h('button', { class: 'btn small', onClick: () => this.s.input.centerOnBase(), title: 'Centralizar na base (Espaço)' }, 'Base'),
      h('button', { class: 'btn small', onClick: () => this.openPauseMenu(), title: 'Menu (Esc)' }, 'Menu'),
    );
  }

  private renderObjectives() {
    const { world } = this.s;
    const v = world.config.victory;
    const total = world.sectors.length;
    clear(this.objectives);
    this.objectives.append(h('h5', {}, 'Objetivos'));
    this.objectives.append(h('div', { class: 'row' }, '• Elimine as bases principais adversárias'));
    if (v.domination) {
      const need = Math.ceil(total * v.dominationRatio);
      this.objectives.append(
        h('div', { class: 'row' }, `• Controle ${need} de ${total} setores por ${v.dominationSeconds} s`),
      );
    }
    if (v.timeLimitMinutes > 0) {
      const left = Math.max(0, v.timeLimitMinutes * 60 * TICK_RATE - world.tick);
      this.objectives.append(h('div', { class: 'row' }, `• Maior pontuação ao fim do tempo (${formatTime(left, TICK_RATE)})`));
    }
    this.objectives.append(h('h5', { style: { marginTop: '10px' } }, 'Territórios'));
    for (const p of world.players) {
      const n = sectorCount(world, p.id);
      this.objectives.append(
        h(
          'div',
          { class: `row${p.alive ? '' : ' dead'}` },
          h('div', { class: 'dot', style: { background: hexCss(p.color) } }),
          h('div', { style: { width: '84px' } }, `${FACTIONS[p.faction].name}${p.id === this.s.humanId ? ' (você)' : ''}`),
          h('div', { class: 'bar' }, h('i', { style: { width: `${(n / total) * 100}%`, background: hexCss(p.color) } })),
          h('div', { style: { width: '22px', textAlign: 'right' } }, String(n)),
        ),
      );
    }
    const dom = world.domination;
    if (v.domination && dom.player !== null) {
      const left = Math.ceil((v.dominationSeconds * TICK_RATE - dom.ticks) / TICK_RATE);
      const who = dom.player === this.s.humanId ? 'Você vence' : `${FACTIONS[world.players[dom.player].faction].name} vence`;
      this.objectives.append(h('div', { class: 'alert' }, `${who} por domínio em ${left} s`));
    }
    if (dom.player !== this.lastDominationPlayer) {
      if (dom.player !== null && dom.player !== this.s.humanId) {
        this.toast(`${FACTIONS[world.players[dom.player].faction].name} está dominando a cidade! Retome territórios.`, 'warn');
        this.sound('alert');
      } else if (dom.player === this.s.humanId) {
        this.toast('Você domina a cidade! Mantenha os territórios para vencer.', 'good');
      }
      this.lastDominationPlayer = dom.player;
    }
  }

  private renderModeHint() {
    const m = this.s.mode;
    let text = '';
    switch (m.type) {
      case 'place':
        text = `Posicionar ${getBuildingDef(m.buildingType).name} — clique para construir, Shift mantém, botão direito cancela`;
        if (this.placementReason) text += ` · ${this.placementReason}`;
        break;
      case 'attackMove':
        text = 'Ataque em movimento: clique no destino (atacam o que encontrarem)';
        break;
      case 'patrol':
        text = 'Patrulha: clique no ponto final';
        break;
      case 'repair':
        text = 'Reparar: clique em uma construção sua';
        break;
      case 'follow':
        text = 'Seguir: clique em uma unidade';
        break;
      case 'rally':
        text = 'Ponto de reunião: clique no destino das novas unidades';
        break;
    }
    this.modeHint.style.display = text ? '' : 'none';
    if (this.modeHint.textContent !== text) this.modeHint.textContent = text;
  }

  setPlacementReason(r: string) {
    this.placementReason = r;
  }

  // ---------- Seleção ----------

  private selectedEntities(): { units: Unit[]; buildings: Building[]; ruinId: number | null } {
    const units: Unit[] = [];
    const buildings: Building[] = [];
    let ruinId: number | null = null;
    for (const id of this.s.selection) {
      const u = this.s.world.units.get(id);
      if (u) units.push(u);
      const b = this.s.world.buildings.get(id);
      if (b) buildings.push(b);
      if (this.s.world.ruins.has(id)) ruinId = id;
    }
    return { units, buildings, ruinId };
  }

  private singleOwnBuilding(): Building | null {
    if (this.s.selection.size !== 1) return null;
    const b = this.s.world.buildings.get([...this.s.selection][0]);
    return b && b.owner === this.s.humanId ? b : null;
  }

  private renderSelection() {
    const { world, humanId } = this.s;
    const { units, buildings, ruinId } = this.selectedEntities();
    const el = this.selPanel;
    clear(el);

    if (units.length === 1) {
      el.append(this.unitInfo(units[0]));
      return;
    }
    if (units.length > 1) {
      const counts = new Map<string, number>();
      for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
      el.append(
        h('div', { class: 'sel-title' }, `${units.length} unidades selecionadas`),
        h('div', { class: 'sel-sub' }, [...counts.entries()].map(([t, n]) => `${n}× ${getUnitDef(t).name}`).join(' · ')),
      );
      const grid = h('div', { class: 'multi-grid' });
      for (const u of units.slice(0, 60)) {
        const ic = unitIcon(u.type);
        const cell = h(
          'div',
          {
            class: 'multi-cell',
            style: { background: ic.color },
            title: getUnitDef(u.type).name,
            onMousedown: (e: MouseEvent) => {
              if (e.shiftKey) {
                this.s.selection.delete(u.id);
                this.invalidate();
              } else this.s.select([u.id]);
            },
          },
          ic.label,
          h('i', { style: { width: `${(u.hp / u.maxHp) * 34}px`, background: hpColor(u.hp / u.maxHp) } }),
        );
        grid.append(cell);
      }
      el.append(grid);
      return;
    }
    if (buildings.length === 1) {
      el.append(this.buildingInfo(buildings[0]));
      return;
    }
    if (ruinId !== null) {
      const r = world.ruins.get(ruinId)!;
      const former = getBuildingDef(r.formerType);
      const s = sectorAt(world.map, r.tx, r.ty);
      const own = s >= 0 && world.sectors[s].owner === humanId;
      el.append(
        h(
          'div',
          { class: 'sel-head' },
          h('div', { class: 'portrait', style: { background: '#4a4642' } }, 'RU'),
          h(
            'div',
            {},
            h('div', { class: 'sel-title' }, `Ruína — ${former.name}`),
            h('div', { class: 'sel-sub' }, own ? 'No seu território: pode ser reconstruída' : 'Conquiste este território para reconstruir'),
          ),
        ),
        h('div', { class: 'desc' }, `A reconstrução custa ${Math.round(ECONOMY.rebuildCostMult * 100)}% do valor normal e leva ${Math.round(ECONOMY.rebuildTimeMult * 100)}% do tempo.`),
      );
      return;
    }
    if (this.s.selectedSector !== null) {
      el.append(this.sectorInfo(this.s.selectedSector));
      return;
    }
    el.append(
      h('div', { class: 'sel-title' }, 'Nenhuma seleção'),
      h(
        'div',
        { class: 'desc', html: [
          'Clique ou arraste para selecionar unidades. Botão direito move ou ataca.',
          'Clique no terreno para ver informações do território.',
          '<b>B</b> constrói · <b>F</b> ataque em movimento · <b>G</b> guarda · <b>X</b> parar · <b>P</b> patrulha · <b>V</b> recuar',
          '<b>WASD</b> câmera · <b>Q/E</b> girar · roda do mouse: zoom · <b>Espaço</b> volta à base · <b>Ctrl+1..9</b> grupos',
        ].join('<br>') },
      ),
    );
  }

  private unitInfo(u: Unit): HTMLElement {
    const def = getUnitDef(u.type);
    const owner = this.s.world.players[u.owner];
    const ic = unitIcon(u.type);
    const mods = owner.mods;
    const stats = [
      def.attack ? ['Dano', `${Math.round(def.attack.damage * mods.damage)}`] : null,
      def.attack ? ['Alcance', `${def.attack.range}`] : null,
      def.heal ? ['Cura', `${def.heal.amount}/s`] : null,
      ['Velocidade', (def.speed * mods.unitSpeed).toFixed(1)],
      ['Blindagem', `${Math.round(def.armor * 100)}%`],
      ['Visão', `${Math.round(def.sight * mods.vision)}`],
    ].filter(Boolean) as string[][];
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'sel-head' },
        h('div', { class: 'portrait', style: { background: ic.color, borderColor: hexCss(owner.color) } }, ic.label),
        h(
          'div',
          { style: { flex: '1' } },
          h('div', { class: 'sel-title' }, def.name),
          h('div', { class: 'sel-sub' }, `${FACTIONS[owner.faction].name} · ${def.category === 'vehicle' ? 'Veículo' : 'Infantaria'} · ${ORDER_LABEL[u.order.type]}`),
          h('div', { class: 'hpbar' }, h('i', { style: { width: `${(u.hp / u.maxHp) * 100}%`, background: hpColor(u.hp / u.maxHp) } })),
          h('div', { class: 'sel-sub' }, `Vida ${Math.ceil(u.hp)} / ${u.maxHp}`),
        ),
      ),
      h('div', { class: 'stats' }, stats.map(([k, v]) => h('span', {}, `${k} `, h('b', {}, v)))),
      h('div', { class: 'desc' }, def.description),
    );
  }

  private buildingInfo(b: Building): HTMLElement {
    const def = getBuildingDef(b.type);
    const owner = this.s.world.players[b.owner];
    const ic = buildingIcon(b.type);
    const own = b.owner === this.s.humanId;
    const status = b.demolishTicks > 0 ? 'Em demolição' : !b.built ? `Em obra — ${Math.floor(b.progress * 100)}%` : 'Operacional';
    const extras: string[] = [];
    if (def.energy > 0) extras.push(`Gera ${def.energy} de energia`);
    if (def.energy < 0) extras.push(`Consome ${-def.energy} de energia`);
    if (def.pop) extras.push(`+${def.pop} população`);
    if (def.income) extras.push(`Renda: ${costText(def.income)}/min`);
    if (def.attack) extras.push(`Defesa: dano ${def.attack.damage}, alcance ${def.attack.range}`);
    const wrap = h(
      'div',
      {},
      h(
        'div',
        { class: 'sel-head' },
        h('div', { class: 'portrait', style: { background: ic.color, borderColor: hexCss(owner.color) } }, ic.label),
        h(
          'div',
          { style: { flex: '1' } },
          h('div', { class: 'sel-title' }, def.name),
          h('div', { class: 'sel-sub' }, `${FACTIONS[owner.faction].name} · ${status}`),
          h('div', { class: 'hpbar' }, h('i', { style: { width: `${(b.hp / b.maxHp) * 100}%`, background: hpColor(b.hp / b.maxHp) } })),
          h('div', { class: 'sel-sub' }, `Vida ${Math.ceil(b.hp)} / ${b.maxHp}`),
        ),
      ),
    );
    if (!b.built) wrap.append(h('div', { class: 'progress-line' }, h('i', { style: { width: `${b.progress * 100}%` } })));
    wrap.append(h('div', { class: 'stats' }, extras.map((e) => h('span', {}, e))));
    if (own && b.built) {
      const p = this.player;
      if (b.queue.length) {
        const q = h('div', { class: 'queue' });
        b.queue.forEach((item, i) => {
          const uic = unitIcon(item.unitType);
          q.append(
            h(
              'div',
              {
                class: 'q',
                style: { background: uic.color },
                title: `${getUnitDef(item.unitType).name} — clique para cancelar`,
                onMousedown: () => this.s.issue({ type: 'cancelTrain', player: this.s.humanId, buildingId: b.id, index: i }),
              },
              uic.label,
              i === 0 ? h('i', { style: { width: `${(1 - item.remaining / item.total) * 100}%` } }) : null,
            ),
          );
        });
        const head = b.queue[0];
        q.append(h('span', { class: 'sel-sub' }, ` ${Math.ceil(head.remaining / TICK_RATE / powerFactor(p, ECONOMY.lowPowerFactor))} s`));
        wrap.append(q);
        if (p.popUsed + getUnitDef(head.unitType).pop > p.popCap) {
          wrap.append(h('div', { class: 'warn-text' }, 'Produção parada: limite de população. Construa logística.'));
        }
      }
      if (b.research) {
        const t = getTechDef(b.research.techId);
        wrap.append(
          h('div', { class: 'sel-sub', style: { marginTop: '6px' } }, `Pesquisando: ${t.name}`),
          h('div', { class: 'progress-line' }, h('i', { style: { width: `${(1 - b.research.remaining / b.research.total) * 100}%` } })),
        );
      }
      if (powerFactor(p, ECONOMY.lowPowerFactor) < 1 && (def.trains || def.researches || def.attack)) {
        wrap.append(h('div', { class: 'warn-text' }, 'Energia insuficiente: funcionando a 50%.'));
      }
    }
    if (!b.queue.length && !b.research) wrap.append(h('div', { class: 'desc' }, def.description));
    return wrap;
  }

  private sectorInfo(id: number): HTMLElement {
    const { world, humanId } = this.s;
    const sec = world.map.sectors[id];
    const st = world.sectors[id];
    const type = SECTOR_TYPES[sec.type];
    const owner = st.owner === null ? null : world.players[st.owner];
    let state = owner ? `Controlado por ${FACTIONS[owner.faction].name}` : 'Neutro';
    if (st.contested) state = 'Em disputa';
    else if (st.owner === null && st.progress > 0 && st.captureTeam !== null) {
      state = `Sendo capturado por ${FACTIONS[world.players[st.captureTeam].faction].name} (${Math.floor(st.progress)}%)`;
    } else if (owner && st.progress < 100) state += ` (controle ${Math.floor(st.progress)}%)`;
    const unitsBy = new Map<number, number>();
    for (const u of world.units.values()) {
      if (sectorAt(world.map, u.x, u.y) !== id) continue;
      if (u.owner !== humanId && !isVisibleTo(world, humanId, u)) continue;
      unitsBy.set(u.owner, (unitsBy.get(u.owner) ?? 0) + 1);
    }
    const buildingsBy = new Map<number, number>();
    for (const b of world.buildings.values()) {
      if (sectorAt(world.map, b.tx, b.ty) !== id) continue;
      if (b.owner !== humanId && !isVisibleTo(world, humanId, b)) continue;
      buildingsBy.set(b.owner, (buildingsBy.get(b.owner) ?? 0) + 1);
    }
    const list = (m: Map<number, number>) =>
      m.size ? [...m.entries()].map(([pid, n]) => `${FACTIONS[world.players[pid].faction].name}: ${n}`).join(' · ') : 'nenhuma visível';
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'sel-head' },
        h('div', { class: 'portrait', style: { background: owner ? hexCss(owner.color) : '#5a6470' } }, 'TR'),
        h(
          'div',
          {},
          h('div', { class: 'sel-title' }, sec.name),
          h('div', { class: 'sel-sub' }, `${type.name} · ${state}`),
        ),
      ),
      h(
        'div',
        { class: 'stats' },
        h('span', {}, 'Renda ', h('b', {}, `${costText(type.income)}/min`)),
        type.energy ? h('span', {}, 'Energia ', h('b', {}, `+${type.energy}`)) : null,
        type.revealsSector ? h('span', {}, h('b', {}, 'Revela o setor')) : null,
      ),
      h('div', { class: 'stats' }, h('span', {}, 'Unidades: ', h('b', {}, list(unitsBy)))),
      h('div', { class: 'stats' }, h('span', {}, 'Estruturas: ', h('b', {}, list(buildingsBy)))),
      h('div', { class: 'desc' }, `${type.description} Para conquistar, mantenha unidades de combate no ponto de controle sem inimigos por perto.`),
    );
  }

  // ---------- Cartão de comandos ----------

  private commandButtons(): CmdButton[] {
    const { world, humanId } = this.s;
    const p = this.player;
    const { units, buildings, ruinId } = this.selectedEntities();
    const own = units.filter((u) => u.owner === humanId);
    const out: CmdButton[] = [];

    if (this.buildMenuOpen) {
      for (const { def, availability } of buildableList(world, humanId)) {
        out.push({
          label: def.name,
          glyph: buildingIcon(def.id),
          disabled: !availability.ok,
          active: this.s.mode.type === 'place' && this.s.mode.buildingType === def.id,
          tip: { title: def.name, cost: def.cost, time: def.buildTime / p.mods.buildSpeed, desc: def.description, reason: availability.reason },
          onClick: () => {
            if (!availability.ok) {
              this.toast(availability.reason, 'bad');
              this.sound('error');
              return;
            }
            this.s.setMode({ type: 'place', buildingType: def.id });
            this.s.input.updateGhost();
          },
        });
      }
      out.push({ label: 'Voltar', glyph: { label: '←', color: '#444c56' }, key: 'Esc', tip: { title: 'Fechar menu de construção' }, onClick: () => this.closeBuildMenu() });
      return out;
    }

    if (own.length) {
      const ids = own.map((u) => u.id);
      const repairers = own.some((u) => getUnitDef(u.type).canRepair);
      out.push(
        { label: 'Atacar', glyph: { label: 'AT', color: '#8f3b3b' }, key: 'F', active: this.s.mode.type === 'attackMove', tip: { title: 'Ataque em movimento', desc: 'Move até o destino atacando inimigos no caminho. Botão direito sobre um inimigo ataca diretamente.' }, onClick: () => this.s.setMode({ type: 'attackMove' }) },
        { label: 'Parar', glyph: { label: 'PA', color: '#55606e' }, key: 'X', tip: { title: 'Parar', desc: 'Cancela as ordens atuais.' }, onClick: () => this.s.issue({ type: 'stop', player: humanId, unitIds: ids }) },
        { label: 'Guarda', glyph: { label: 'GU', color: '#3d6fa8' }, key: 'G', tip: { title: 'Defender posição', desc: 'Mantém a posição e ataca apenas inimigos ao alcance.' }, onClick: () => this.s.issue({ type: 'hold', player: humanId, unitIds: ids }) },
        { label: 'Patrulhar', glyph: { label: 'PT', color: '#2c8fb3' }, key: 'P', active: this.s.mode.type === 'patrol', tip: { title: 'Patrulhar', desc: 'Vai e volta entre a posição atual e o ponto escolhido, atacando inimigos.' }, onClick: () => this.s.setMode({ type: 'patrol' }) },
        { label: 'Seguir', glyph: { label: 'SG', color: '#4f7f4a' }, active: this.s.mode.type === 'follow', tip: { title: 'Seguir', desc: 'Acompanha outra unidade.' }, onClick: () => this.s.setMode({ type: 'follow' }) },
        { label: 'Recuar', glyph: { label: 'RC', color: '#8a6a3a' }, key: 'V', tip: { title: 'Recuar', desc: 'Retorna à base principal.' }, onClick: () => this.s.issue({ type: 'retreat', player: humanId, unitIds: ids }) },
      );
      if (repairers) {
        out.push({ label: 'Reparar', glyph: { label: 'RP', color: '#b08a1c' }, key: 'R', active: this.s.mode.type === 'repair', tip: { title: 'Reparar / ajudar obra', desc: `Engenheiros aceleram obras e reparam estruturas (gasta ${ECONOMY.repairMaterialPerHp} material por ponto de vida).` }, onClick: () => this.s.setMode({ type: 'repair' }) });
      }
      out.push(this.buildButton());
      return out;
    }

    const b = buildings.length === 1 ? buildings[0] : null;
    if (b && b.owner === humanId) {
      const def = getBuildingDef(b.type);
      if (!b.built) {
        out.push({ label: 'Cancelar obra', glyph: { label: '✕', color: '#8f3b3b' }, danger: true, key: 'Del', tip: { title: 'Cancelar obra', desc: 'Remove a obra e devolve todo o custo.' }, onClick: () => this.demolishSelected() });
        return out;
      }
      for (const t of def.trains ?? []) {
        const u = getUnitDef(t);
        let reason = '';
        if (u.requiresTech && !p.techs.includes(u.requiresTech)) reason = `Requer melhoria: ${getTechDef(u.requiresTech).name}`;
        else if (b.queue.length >= 6) reason = 'Fila cheia';
        else if (!canAfford(p.resources, u.cost)) reason = 'Recursos insuficientes';
        out.push({
          label: u.name,
          glyph: unitIcon(t),
          disabled: !!reason,
          tip: { title: u.name, cost: u.cost, time: u.buildTime, desc: u.description, reason, hint: `Vida ${u.hp} · ${u.attack ? `dano ${u.attack.damage} · alcance ${u.attack.range}` : u.heal ? `cura ${u.heal.amount}/s` : 'sem ataque'} · pop ${u.pop}` },
          onClick: () => {
            if (reason) {
              this.toast(reason, 'bad');
              this.sound('error');
              return;
            }
            this.s.issue({ type: 'train', player: humanId, buildingId: b.id, unitType: t });
            this.sound('click');
          },
        });
      }
      for (const techId of def.researches ?? []) {
        const t = getTechDef(techId);
        if (p.techs.includes(techId)) continue;
        let reason = '';
        if (b.research?.techId === techId) reason = 'Em pesquisa';
        else if (isResearching(world, humanId, techId)) reason = 'Em pesquisa em outra construção';
        else if (b.research) reason = 'Outra pesquisa em andamento';
        else if (!canAfford(p.resources, t.cost)) reason = 'Recursos insuficientes';
        out.push({
          label: t.name,
          glyph: { label: '★', color: '#7b4fa6' },
          disabled: !!reason,
          active: b.research?.techId === techId,
          tip: { title: `Melhoria: ${t.name}`, cost: t.cost, time: t.time, desc: t.description, reason },
          onClick: () => {
            if (b.research?.techId === techId) {
              this.s.issue({ type: 'cancelResearch', player: humanId, buildingId: b.id });
              return;
            }
            if (reason) {
              this.toast(reason, 'bad');
              return;
            }
            this.s.issue({ type: 'research', player: humanId, buildingId: b.id, techId });
            this.sound('click');
          },
        });
      }
      if (def.trains) {
        out.push({ label: 'Reunião', glyph: { label: '⚑', color: '#4f7f4a' }, active: this.s.mode.type === 'rally', tip: { title: 'Ponto de reunião', desc: 'Define para onde vão as unidades produzidas (também com o botão direito).' }, onClick: () => this.s.setMode({ type: 'rally', buildingId: b.id }) });
      }
      out.push({
        label: 'Demolir',
        glyph: { label: '✕', color: '#8f3b3b' },
        danger: true,
        key: 'Del',
        disabled: b.demolishTicks > 0,
        tip: { title: 'Demolir', desc: `Remove a estrutura e devolve ${Math.round(ECONOMY.demolishRefund * 100)}% do custo após ${ECONOMY.demolishSeconds} s.` },
        onClick: () => this.demolishSelected(),
      });
      return out;
    }

    if (ruinId !== null) {
      const r = world.ruins.get(ruinId)!;
      const type = rebuildTypeFor(world, humanId, r.role);
      const s = sectorAt(world.map, r.tx, r.ty);
      const ownSector = s >= 0 && world.sectors[s].owner === humanId;
      if (type) {
        const def = getBuildingDef(type);
        const av = checkAvailability(world, humanId, type, ECONOMY.rebuildCostMult);
        const reason = !ownSector ? 'A ruína precisa estar no seu território' : av.ok ? '' : av.reason;
        const cost: Cost = {
          money: Math.round((def.cost.money ?? 0) * ECONOMY.rebuildCostMult),
          materials: Math.round((def.cost.materials ?? 0) * ECONOMY.rebuildCostMult),
          fuel: Math.round((def.cost.fuel ?? 0) * ECONOMY.rebuildCostMult),
        };
        out.push({
          label: `Reconstruir`,
          glyph: buildingIcon(type),
          disabled: !!reason,
          tip: { title: `Reconstruir como ${def.name}`, cost, time: def.buildTime * ECONOMY.rebuildTimeMult, desc: def.description, reason },
          onClick: () => this.s.issue({ type: 'rebuild', player: humanId, ruinId: r.id }),
        });
      }
      out.push({
        label: 'Limpar',
        glyph: { label: '✕', color: '#55606e' },
        disabled: !ownSector,
        tip: { title: 'Limpar escombros', desc: 'Libera o terreno para novas construções.', reason: ownSector ? '' : 'A ruína precisa estar no seu território' },
        onClick: () => this.s.issue({ type: 'demolish', player: humanId, targetId: r.id }),
      });
      return out;
    }

    out.push(this.buildButton());
    return out;
  }

  private buildButton(): CmdButton {
    return {
      label: 'Construir',
      glyph: { label: 'CO', color: '#a0782a' },
      key: 'B',
      tip: { title: 'Menu de construção', desc: 'Construções só podem ser erguidas dentro do seu território.' },
      onClick: () => this.toggleBuildMenu(),
    };
  }

  private renderCommands() {
    const buttons = this.commandButtons();
    const sig = buttons.map((b) => `${b.label}|${b.disabled ? 1 : 0}|${b.active ? 1 : 0}|${b.tip.reason ?? ''}`).join(';') + `#${[...this.s.selection].join(',')}`;
    if (sig === this.cmdSignature) return;
    this.cmdSignature = sig;
    clear(this.cmdPanel);
    for (const b of buttons) {
      const el = h(
        'div',
        { class: `cmd${b.disabled ? ' disabled' : ''}${b.active ? ' active' : ''}${b.danger ? ' danger' : ''}` },
        b.key ? h('span', { class: 'k' }, b.key) : null,
        h('div', { class: 'glyph', style: { background: b.glyph.color } }, b.glyph.label),
        h('div', { class: 'lbl' }, b.label),
      );
      el.addEventListener('click', () => {
        b.onClick();
        this.invalidate();
      });
      el.addEventListener('mouseenter', () => this.showTooltip(b, el));
      el.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
      this.cmdPanel.append(el);
    }
    this.tooltip.style.display = 'none';
  }

  private showTooltip(b: CmdButton, anchor: HTMLElement) {
    const t = b.tip;
    const parts = [`<h6>${escapeHtml(t.title)}</h6>`];
    if (t.cost) parts.push(`<div class="cost">${costHtml(t.cost)}${t.time ? `<span style="color:var(--muted)">⏱ ${Math.round(t.time)} s</span>` : ''}</div>`);
    if (t.desc) parts.push(`<div>${escapeHtml(t.desc)}</div>`);
    if (t.hint) parts.push(`<div class="hint">${escapeHtml(t.hint)}</div>`);
    if (t.reason) parts.push(`<div class="reason">${escapeHtml(t.reason)}</div>`);
    this.tooltip.innerHTML = parts.join('');
    this.tooltip.style.display = '';
    const r = anchor.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
    this.tooltip.style.top = `${Math.max(8, r.top - th - 8)}px`;
  }

  toggleBuildMenu() {
    this.buildMenuOpen = !this.buildMenuOpen;
    if (this.buildMenuOpen) {
      // Mantém unidades selecionadas, mas o cartão mostra as construções.
      this.s.selectedSector = null;
    } else if (this.s.mode.type === 'place') this.s.setMode({ type: 'none' });
    this.invalidate();
  }

  closeBuildMenu() {
    if (!this.buildMenuOpen) return;
    this.buildMenuOpen = false;
    if (this.s.mode.type === 'place') this.s.setMode({ type: 'none' });
    this.invalidate();
  }

  demolishSelected() {
    const b = this.singleOwnBuilding();
    if (b) {
      const def = getBuildingDef(b.type);
      if (def.isBase || def.role === 'hq') {
        this.confirm('Demolir estrutura essencial?', `${def.name} é uma base. Sem bases, sua equipe é derrotada.`, () =>
          this.s.issue({ type: 'demolish', player: this.s.humanId, targetId: b.id }),
        );
      } else if (b.built && (def.trains || def.researches)) {
        this.confirm(`Demolir ${def.name}?`, `Você recupera ${Math.round(ECONOMY.demolishRefund * 100)}% do custo. Filas de produção são reembolsadas.`, () =>
          this.s.issue({ type: 'demolish', player: this.s.humanId, targetId: b.id }),
        );
      } else {
        this.s.issue({ type: 'demolish', player: this.s.humanId, targetId: b.id });
      }
      return;
    }
    const id = [...this.s.selection][0];
    if (id !== undefined && this.s.world.ruins.has(id)) this.s.issue({ type: 'demolish', player: this.s.humanId, targetId: id });
  }

  // ---------- Eventos e notificações ----------

  handleEvents(events: GameEvent[]) {
    const me = this.s.humanId;
    const { world } = this.s;
    for (const e of events) {
      switch (e.type) {
        case 'buildingComplete':
          if (e.owner === me) {
            this.toast(`Construção concluída: ${BUILDINGS[e.buildingType].name}`, 'good');
            this.sound('good');
            this.invalidate();
          }
          break;
        case 'researchComplete':
          if (e.owner === me) {
            this.toast(`Melhoria concluída: ${getTechDef(e.techId).name}`, 'good');
            this.sound('good');
            this.invalidate();
          }
          break;
        case 'unitTrained':
          if (e.owner === me) this.invalidate();
          break;
        case 'sectorCaptured': {
          const name = world.map.sectors[e.sector].name;
          if (e.owner === me) {
            this.toast(`Território conquistado: ${name}`, 'good', () => this.jumpToSector(e.sector));
            this.sound('capture');
          } else {
            this.toast(`${FACTIONS[world.players[e.owner].faction].name} conquistou ${name}`, 'warn', () => this.jumpToSector(e.sector));
          }
          break;
        }
        case 'sectorLost':
          if (e.owner === me) {
            this.toast(`Território perdido: ${world.map.sectors[e.sector].name}`, 'bad', () => this.jumpToSector(e.sector));
            this.sound('lost');
          }
          break;
        case 'underAttack':
          if (e.owner === me && world.tick - this.lastAttackToast > 12 * TICK_RATE) {
            this.lastAttackToast = world.tick;
            const { x, y } = e;
            this.toast('Suas forças estão sob ataque! (clique para ver)', 'bad', () => this.s.renderer.cam.centerOn(x, y));
            this.sound('alert');
          }
          break;
        case 'playerEliminated':
          this.toast(`${FACTIONS[world.players[e.player].faction].name} foi eliminado!`, e.player === me ? 'bad' : 'warn');
          break;
        case 'error':
          if (e.player === me && performance.now() - this.lastErrorToast > 800) {
            this.lastErrorToast = performance.now();
            this.toast(e.message, 'bad');
            this.sound('error');
          }
          break;
      }
    }
  }

  private jumpToSector(id: number) {
    const s = this.s.world.map.sectors[id];
    this.s.renderer.cam.centerOn(s.cx, s.cy);
  }

  toast(msg: string, kind: 'good' | 'bad' | 'warn' | 'info' = 'info', onClick?: () => void) {
    const el = h('div', { class: `toast ${kind}${onClick ? ' clickable' : ''}` }, msg);
    if (onClick) {
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', onClick);
    }
    this.notifications.append(el);
    while (this.notifications.children.length > 5) this.notifications.firstElementChild!.remove();
    setTimeout(() => el.remove(), 4500);
  }

  // ---------- Janelas ----------

  private openModal(content: HTMLElement): HTMLElement {
    const backdrop = h('div', { class: 'modal-backdrop' }, content);
    this.s.host.uiRoot.append(backdrop);
    this.modals.push(backdrop);
    this.tooltip.style.display = 'none';
    return backdrop;
  }

  private closeModal(m: HTMLElement) {
    m.remove();
    this.modals = this.modals.filter((x) => x !== m);
  }

  closeTopModal() {
    const m = this.modals[this.modals.length - 1];
    if (!m) return;
    this.closeModal(m);
    if (!this.modals.length && this.s.world.status === 'running') this.s.setPaused(false);
  }

  confirm(title: string, text: string, onYes: () => void) {
    let m: HTMLElement;
    const dlg = h(
      'div',
      { class: 'dialog narrow' },
      h('h2', {}, title),
      h('p', {}, text),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onClick: () => this.closeModal(m) }, 'Cancelar'),
        h(
          'button',
          {
            class: 'btn primary',
            onClick: () => {
              this.closeModal(m);
              onYes();
            },
          },
          'Confirmar',
        ),
      ),
    );
    m = this.openModal(dlg);
  }

  openPauseMenu() {
    if (this.modalOpen) return;
    const wasEnded = this.s.world.status === 'ended';
    if (!wasEnded) this.s.setPaused(true);
    let m: HTMLElement;
    const close = () => {
      this.closeModal(m);
      if (!wasEnded) this.s.setPaused(false);
    };
    const dlg = h(
      'div',
      { class: 'dialog narrow' },
      h('h2', {}, 'Partida pausada'),
      h('p', {}, `Tempo de jogo ${formatTime(this.s.world.tick, TICK_RATE)}`),
      h(
        'div',
        { class: 'menu-card', style: { width: '100%' } },
        h('button', { class: 'btn primary', onClick: close }, 'Continuar'),
        h('button', { class: 'btn', disabled: wasEnded, onClick: () => this.openSlots('save') }, 'Salvar partida'),
        h('button', { class: 'btn', onClick: () => this.openSlots('load') }, 'Carregar partida'),
        h('button', { class: 'btn', onClick: () => this.s.host.openSettings(() => undefined) }, 'Configurações'),
        h(
          'button',
          {
            class: 'btn',
            onClick: () =>
              this.confirm('Reiniciar partida?', 'O progresso atual será perdido.', () => {
                this.s.host.startWorld(createWorld({ ...this.s.world.config, seed: (this.s.world.config.seed * 31 + 7) >>> 0 }));
              }),
          },
          'Reiniciar partida',
        ),
        h(
          'button',
          {
            class: 'btn danger',
            onClick: () =>
              this.confirm('Sair para o menu?', 'A partida será salva automaticamente em "Continuar partida".', () => {
                this.autosave();
                this.s.host.exitToMenu();
              }),
          },
          'Sair para o menu principal',
        ),
      ),
    );
    m = this.openModal(dlg);
  }

  private openSlots(kind: 'save' | 'load') {
    let m: HTMLElement;
    const slots = listSlots();
    const list = h('div', { class: 'slot-list' });
    const all: SaveSlot[] = kind === 'save' ? ['1', '2', '3'] : ['auto', '1', '2', '3'];
    for (const slot of all) {
      const info = slots.find((x) => x.slot === slot);
      const label = slot === 'auto' ? 'Salvamento automático' : `Espaço ${slot}`;
      const meta = info ? `${info.faction} · ${formatTime(info.tick, TICK_RATE)} · ${new Date(info.savedAt).toLocaleString('pt-BR')}` : 'Vazio';
      list.append(
        h(
          'div',
          { class: 'slot' },
          h('div', {}, h('div', {}, label), h('div', { class: 'meta' }, meta)),
          h(
            'button',
            {
              class: 'btn small primary',
              disabled: kind === 'load' && !info,
              onClick: () => {
                if (kind === 'save') {
                  try {
                    saveToSlot(this.s.world, slot);
                    this.toast(`Partida salva (${label})`, 'good');
                  } catch {
                    this.toast('Não foi possível salvar (armazenamento indisponível)', 'bad');
                  }
                  this.closeModal(m);
                } else {
                  try {
                    const w = loadFromSlot(slot);
                    this.s.host.startWorld(w);
                  } catch (err) {
                    this.toast(err instanceof SaveError ? err.message : 'Falha ao carregar a partida', 'bad');
                  }
                }
              },
            },
            kind === 'save' ? 'Salvar' : 'Carregar',
          ),
        ),
      );
    }
    const dlg = h(
      'div',
      { class: 'dialog narrow' },
      h('h2', {}, kind === 'save' ? 'Salvar partida' : 'Carregar partida'),
      list,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onClick: () => this.closeModal(m) }, 'Voltar')),
    );
    m = this.openModal(dlg);
  }

  autosave() {
    if (this.s.world.status !== 'running') return;
    try {
      saveToSlot(this.s.world, 'auto');
    } catch {
      // Sem armazenamento disponível: ignora silenciosamente.
    }
  }

  showEndScreen() {
    const { world, humanId } = this.s;
    const win = world.winner === humanId;
    const rows = world.players.map((p) =>
      h(
        'tr',
        {},
        h('td', {}, h('span', { style: { color: hexCss(p.color), fontWeight: '700' } }, FACTIONS[p.faction].name), p.id === humanId ? ' (você)' : ' (IA)'),
        h('td', {}, String(sectorCount(world, p.id))),
        h('td', {}, String(p.stats.sectorsCaptured)),
        h('td', {}, String(p.stats.unitsProduced)),
        h('td', {}, String(p.stats.unitsLost)),
        h('td', {}, String(p.stats.kills)),
        h('td', {}, String(p.stats.buildingsBuilt)),
        h('td', {}, String(p.stats.techsResearched)),
        h('td', {}, fmt(p.stats.resourcesSpent)),
        h('td', {}, String(computeScore(world, p.id))),
      ),
    );
    let m: HTMLElement;
    const winnerName = world.winner !== null ? FACTIONS[world.players[world.winner].faction].name : 'Ninguém';
    const dlg = h(
      'div',
      { class: 'dialog' },
      h('h1', { class: `result-title ${win ? 'win' : 'lose'}` }, win ? 'Vitória' : 'Derrota'),
      h('p', {}, `Vencedor: ${winnerName} · ${world.endReason} · Duração ${formatTime(world.tick, TICK_RATE)}`),
      h(
        'table',
        { class: 'stats-table' },
        h(
          'thead',
          {},
          h('tr', {}, ...['Equipe', 'Territórios', 'Conquistas', 'Unidades', 'Perdas', 'Abates', 'Construções', 'Melhorias', 'Recursos gastos', 'Pontuação'].map((t) => h('th', {}, t))),
        ),
        h('tbody', {}, rows),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onClick: () => this.closeModal(m) }, 'Observar o mapa'),
        h('button', { class: 'btn', onClick: () => this.s.host.exitToMenu() }, 'Menu principal'),
        h(
          'button',
          {
            class: 'btn primary',
            onClick: () => this.s.host.startWorld(createWorld({ ...world.config, seed: (Math.random() * 1e9) >>> 0 })),
          },
          'Jogar novamente',
        ),
      ),
    );
    m = this.openModal(dlg);
    this.sound(win ? 'capture' : 'lost');
  }
}

function fmt(n: number): string {
  return Math.floor(n).toLocaleString('pt-BR');
}

function hpColor(f: number): string {
  return f > 0.6 ? 'var(--ok)' : f > 0.3 ? '#f2c230' : 'var(--danger)';
}

function costText(c: Cost): string {
  const parts: string[] = [];
  if (c.money) parts.push(`$${c.money}`);
  if (c.materials) parts.push(`${c.materials} mat.`);
  if (c.fuel) parts.push(`${c.fuel} comb.`);
  return parts.join(' + ') || 'grátis';
}

function costHtml(c: Cost): string {
  const parts: string[] = [];
  if (c.money) parts.push(`<span style="color:var(--money)">$ ${Math.round(c.money)}</span>`);
  if (c.materials) parts.push(`<span style="color:var(--materials)">M ${Math.round(c.materials)}</span>`);
  if (c.fuel) parts.push(`<span style="color:var(--fuel)">C ${Math.round(c.fuel)}</span>`);
  return parts.join('') || '<span>Sem custo</span>';
}
