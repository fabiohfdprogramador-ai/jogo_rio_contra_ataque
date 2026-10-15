// Árvore tecnológica. Cada melhoria altera modificadores reais ou libera unidades.
import type { TechDef } from '../game/types';

const list: TechDef[] = [
  // POLÍCIA
  {
    id: 'pol_t_logistica', faction: 'policia', name: 'Logística Integrada',
    description: '+20% de renda de todas as fontes.',
    cost: { money: 250, materials: 100 }, time: 45, effects: { income: 0.2 },
  },
  {
    id: 'pol_t_blindagem', faction: 'policia', name: 'Programa de Blindados',
    description: 'Libera o Blindado Tático e dá +10% de vida aos veículos.',
    cost: { money: 300, materials: 150, fuel: 40 }, time: 60, effects: { vehicleHp: 0.1 }, unlocks: ['pol_blindado'],
  },
  {
    id: 'pol_t_coletes', faction: 'policia', name: 'Equipamento de Proteção',
    description: '+20% de vida para a infantaria.',
    cost: { money: 200, materials: 80 }, time: 40, effects: { infantryHp: 0.2 },
  },
  {
    id: 'pol_t_radio', faction: 'policia', name: 'Rede de Rádio',
    description: '+20% de alcance de visão e +10% de velocidade de captura.',
    cost: { money: 180, materials: 40 }, time: 35, effects: { vision: 0.2, captureSpeed: 0.1 },
  },
  {
    id: 'pol_t_engenharia', faction: 'policia', name: 'Engenharia Rápida',
    description: 'Construções 30% mais rápidas e +10 de população.',
    cost: { money: 200, materials: 120 }, time: 40, effects: { buildSpeed: 0.3, popBonus: 10 },
  },

  // MILÍCIA
  {
    id: 'mil_t_fortificacao', faction: 'milicia', name: 'Fortificação',
    description: '+25% de vida para todas as estruturas.',
    cost: { money: 220, materials: 160 }, time: 45, effects: { buildingHp: 0.25 },
  },
  {
    id: 'mil_t_blindagem', faction: 'milicia', name: 'Oficina de Blindagem',
    description: 'Libera o Blindado Improvisado e dá +10% de vida aos veículos.',
    cost: { money: 300, materials: 160, fuel: 40 }, time: 60, effects: { vehicleHp: 0.1 }, unlocks: ['mil_blindado'],
  },
  {
    id: 'mil_t_territorio', faction: 'milicia', name: 'Controle Territorial',
    description: '+15% de renda e +25% de velocidade de captura.',
    cost: { money: 240, materials: 100 }, time: 45, effects: { income: 0.15, captureSpeed: 0.25 },
  },
  {
    id: 'mil_t_treino', faction: 'milicia', name: 'Treinamento Avançado',
    description: '+15% de vida da infantaria e +10% de dano.',
    cost: { money: 230, materials: 90 }, time: 45, effects: { infantryHp: 0.15, damage: 0.1 },
  },

  // BANDIDO
  {
    id: 'ban_t_motores', faction: 'bandido', name: 'Motores Preparados',
    description: '+12% de velocidade para todas as unidades.',
    cost: { money: 200, materials: 60, fuel: 30 }, time: 40, effects: { unitSpeed: 0.12 },
  },
  {
    id: 'ban_t_rede', faction: 'bandido', name: 'Rede de Contatos',
    description: '+20% de renda e +15% de alcance de visão.',
    cost: { money: 230, materials: 80 }, time: 45, effects: { income: 0.2, vision: 0.15 },
  },
  {
    id: 'ban_t_improviso', faction: 'bandido', name: 'Construção Improvisada',
    description: 'Construções 40% mais rápidas e +10 de população.',
    cost: { money: 180, materials: 100 }, time: 35, effects: { buildSpeed: 0.4, popBonus: 10 },
  },
  {
    id: 'ban_t_reforco', faction: 'bandido', name: 'Reforço Leve',
    description: 'Libera a Caminhonete, +15% de vida para unidades e +10% de dano.',
    cost: { money: 260, materials: 120, fuel: 30 }, time: 50,
    effects: { infantryHp: 0.15, vehicleHp: 0.15, damage: 0.1 }, unlocks: ['ban_caminhonete'],
  },
];

export const TECHS: Record<string, TechDef> = Object.fromEntries(list.map((t) => [t.id, t]));

export function getTechDef(id: string): TechDef {
  const def = TECHS[id];
  if (!def) throw new Error(`Melhoria desconhecida: ${id}`);
  return def;
}
