// Parâmetros da inteligência artificial por dificuldade.
// A IA usa as mesmas regras do jogador; os modificadores abaixo são explícitos.
import type { BuildingRole, Difficulty } from '../game/types';

export interface AIProfile {
  label: string;
  /** Intervalo entre decisões estratégicas (ticks). */
  thinkInterval: number;
  /** Multiplicador de renda (modificador explícito de dificuldade). */
  incomeMult: number;
  maxConcurrentBuilds: number;
  engineers: number;
  /** Número mínimo de unidades de combate para iniciar um ataque. */
  attackMinUnits: number;
  /** Momento mínimo (segundos) do primeiro ataque. */
  firstAttackAfter: number;
  /** Tamanho do grupo enviado para expandir. */
  expandSquad: number;
  /** Força relativa mínima (nossa / inimiga estimada) para atacar. */
  attackAdvantage: number;
  /** Recua quando a força do grupo cai abaixo desta fração. */
  retreatThreshold: number;
  canRetreat: boolean;
  focusFire: boolean;
  /** Reserva de dinheiro mantida antes de produzir unidades extras. */
  moneyReserve: number;
  researches: boolean;
  /** Ordem de prioridade das construções. */
  buildOrder: BuildingRole[];
}

const fullOrder: BuildingRole[] = [
  'barracks',
  'power',
  'logistics',
  'garage',
  'power',
  'defense',
  'research',
  'logistics',
  'outpost',
  'barracks',
  'power',
  'defense',
  'garage',
  'logistics',
  'defense',
];

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  facil: {
    label: 'Fácil',
    thinkInterval: 40,
    incomeMult: 0.8,
    maxConcurrentBuilds: 1,
    engineers: 1,
    attackMinUnits: 10,
    firstAttackAfter: 540,
    expandSquad: 2,
    attackAdvantage: 1.6,
    retreatThreshold: 0,
    canRetreat: false,
    focusFire: false,
    moneyReserve: 150,
    researches: false,
    buildOrder: fullOrder.slice(0, 9),
  },
  normal: {
    label: 'Normal',
    thinkInterval: 20,
    incomeMult: 1,
    maxConcurrentBuilds: 1,
    engineers: 2,
    attackMinUnits: 9,
    firstAttackAfter: 330,
    expandSquad: 3,
    attackAdvantage: 1.25,
    retreatThreshold: 0.3,
    canRetreat: true,
    focusFire: false,
    moneyReserve: 80,
    researches: true,
    buildOrder: fullOrder,
  },
  dificil: {
    label: 'Difícil',
    thinkInterval: 10,
    incomeMult: 1.1,
    maxConcurrentBuilds: 2,
    engineers: 3,
    attackMinUnits: 8,
    firstAttackAfter: 210,
    expandSquad: 3,
    attackAdvantage: 1.05,
    retreatThreshold: 0.4,
    canRetreat: true,
    focusFire: true,
    moneyReserve: 0,
    researches: true,
    buildOrder: fullOrder,
  },
};
