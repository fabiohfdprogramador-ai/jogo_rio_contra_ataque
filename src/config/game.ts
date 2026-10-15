// Parâmetros gerais da partida. Todos os números de balanceamento ficam em src/config.
import type { MapSize, Resources, StartingResources } from '../game/types';

export const GAME_TITLE = 'Rio em Conquista';
export const GAME_SUBTITLE = 'Estratégia urbana em tempo real';
export const GAME_VERSION = '0.1.0';

/** Ticks de simulação por segundo (passo fixo). */
export const TICK_RATE = 10;

export const MAX_POP = 120;

export const MAP_SIZES: Record<MapSize, { sectorsX: number; sectorsY: number; label: string }> = {
  pequeno: { sectorsX: 3, sectorsY: 3, label: 'Pequeno (9 setores)' },
  medio: { sectorsX: 4, sectorsY: 4, label: 'Médio (16 setores)' },
};

/** Tamanho de cada setor em tiles. Um setor contém 2x2 quarteirões de 12 tiles. */
export const SECTOR_SIZE = 24;
export const BLOCK_SIZE = 12;
export const ROAD_WIDTH = 2;

export const STARTING_RESOURCES: Record<StartingResources, Resources & { label: string }> = {
  baixo: { money: 350, materials: 200, fuel: 50, label: 'Baixo' },
  normal: { money: 650, materials: 350, fuel: 120, label: 'Normal' },
  alto: { money: 1400, materials: 800, fuel: 300, label: 'Alto' },
};

export const CAPTURE = {
  /** Raio (tiles) ao redor do ponto de controle em que unidades contam para a captura. */
  radius: 4,
  /** Pontos de progresso por segundo com uma unidade. */
  baseRate: 5,
  /** Bônus por unidade adicional (limitado). */
  perExtraUnit: 0.25,
  maxUnitsCounted: 6,
};

export const COMBAT = {
  minDamage: 1,
  /** Distância máxima que uma unidade ociosa persegue um alvo a partir de sua posição. */
  idleLeash: 10,
  /** Ticks que uma unidade lembra quem a atacou. */
  retaliateMemory: 30,
};

export const ECONOMY = {
  /** Fração do custo devolvida ao demolir uma estrutura concluída. */
  demolishRefund: 0.25,
  demolishSeconds: 3,
  /** Custo e tempo de reconstrução sobre ruínas (relativo ao custo normal). */
  rebuildCostMult: 0.6,
  rebuildTimeMult: 0.6,
  /** Materiais gastos por ponto de vida reparado. */
  repairMaterialPerHp: 0.08,
  repairHpPerSecond: 18,
  /** Fator de produção quando falta energia. */
  lowPowerFactor: 0.5,
  /** Bônus de velocidade de construção por engenheiro ajudando (máx. 3). */
  engineerAssistBonus: 0.5,
  maxAssistingEngineers: 3,
};

export const VISION = {
  updateEveryTicks: 3,
};

export const SCORE = {
  perSector: 100,
  perBuilding: 15,
  perUnit: 5,
  perKill: 8,
};
