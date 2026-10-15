// Atributos das unidades das três equipes. Ajuste o balanceamento aqui.
import type { UnitDef } from '../game/types';

const list: UnitDef[] = [
  // ---------------- POLÍCIA ----------------
  {
    id: 'pol_eng', faction: 'policia', name: 'Equipe de Engenharia', model: 'engineer', category: 'infantry',
    description: 'Acelera construções e repara estruturas. Não combate.',
    hp: 70, speed: 2.2, armor: 0.05, sight: 7, pop: 1, cost: { money: 50 }, buildTime: 10,
    canRepair: true, canCapture: false,
  },
  {
    id: 'pol_patrulha', faction: 'policia', name: 'Agente de Patrulha', model: 'soldier', category: 'infantry',
    description: 'Unidade básica, versátil e barata.',
    hp: 115, speed: 2.4, armor: 0.15, sight: 8, pop: 1, cost: { money: 62 }, buildTime: 11,
    attack: { range: 5, damage: 11, cooldown: 1.0 }, canCapture: true,
  },
  {
    id: 'pol_intervencao', faction: 'policia', name: 'Equipe de Intervenção', model: 'heavy', category: 'infantry',
    description: 'Infantaria pesada, resistente e com alto dano a curta distância.',
    hp: 165, speed: 2.0, armor: 0.3, sight: 8, pop: 1, cost: { money: 120, materials: 15 }, buildTime: 18,
    attack: { range: 4.5, damage: 18, cooldown: 1.2 }, canCapture: true,
  },
  {
    id: 'pol_recon', faction: 'policia', name: 'Unidade de Reconhecimento', model: 'scout', category: 'infantry',
    description: 'Rápida e com grande alcance de visão.',
    hp: 70, speed: 3.3, armor: 0.05, sight: 13, pop: 1, cost: { money: 55 }, buildTime: 10,
    attack: { range: 6, damage: 6, cooldown: 1.0 }, canCapture: true,
  },
  {
    id: 'pol_suporte', faction: 'policia', name: 'Unidade de Suporte', model: 'medic', category: 'infantry',
    description: 'Recupera a vida da infantaria próxima.',
    hp: 80, speed: 2.3, armor: 0.1, sight: 8, pop: 1, cost: { money: 90 }, buildTime: 15,
    heal: { amount: 7, radius: 4, targets: 'infantry' }, canCapture: false,
  },
  {
    id: 'pol_viatura', faction: 'policia', name: 'Veículo de Patrulha', model: 'car', category: 'vehicle',
    description: 'Veículo rápido para resposta e captura.',
    hp: 250, speed: 4.6, armor: 0.35, sight: 10, pop: 2, cost: { money: 135, fuel: 20 }, buildTime: 18,
    attack: { range: 5.5, damage: 11, cooldown: 0.8 }, canCapture: true,
  },
  {
    id: 'pol_suv', faction: 'policia', name: 'SUV Operacional', model: 'suv', category: 'vehicle',
    description: 'Veículo resistente com bom poder de fogo.',
    hp: 330, speed: 4.0, armor: 0.4, sight: 9, pop: 2, cost: { money: 220, materials: 20, fuel: 30 }, buildTime: 25,
    attack: { range: 6, damage: 18, cooldown: 1.1 }, canCapture: true,
  },
  {
    id: 'pol_blindado', faction: 'policia', name: 'Blindado Tático', model: 'armored', category: 'vehicle',
    description: 'Blindado fictício. Lento, muito resistente, eficaz contra estruturas.',
    hp: 680, speed: 2.6, armor: 0.55, sight: 9, pop: 3, cost: { money: 380, materials: 60, fuel: 50 }, buildTime: 35,
    attack: { range: 6.5, damage: 34, cooldown: 1.6 }, buildingDamageMult: 1.6, canCapture: true,
    requiresTech: 'pol_t_blindagem',
  },

  // ---------------- MILÍCIA ----------------
  {
    id: 'mil_eng', faction: 'milicia', name: 'Equipe de Engenharia', model: 'engineer', category: 'infantry',
    description: 'Acelera construções e repara estruturas. Não combate.',
    hp: 75, speed: 2.2, armor: 0.05, sight: 7, pop: 1, cost: { money: 50 }, buildTime: 10,
    canRepair: true, canCapture: false,
  },
  {
    id: 'mil_defesa', faction: 'milicia', name: 'Unidade de Defesa', model: 'heavy', category: 'infantry',
    description: 'Infantaria resistente, ideal para segurar territórios.',
    hp: 130, speed: 2.1, armor: 0.25, sight: 8, pop: 1, cost: { money: 85 }, buildTime: 13,
    attack: { range: 5, damage: 11, cooldown: 1.0 }, canCapture: true,
  },
  {
    id: 'mil_recon', faction: 'milicia', name: 'Unidade de Reconhecimento', model: 'scout', category: 'infantry',
    description: 'Rápida e com grande alcance de visão.',
    hp: 75, speed: 3.2, armor: 0.05, sight: 12, pop: 1, cost: { money: 55 }, buildTime: 10,
    attack: { range: 6, damage: 6, cooldown: 1.0 }, canCapture: true,
  },
  {
    id: 'mil_suporte', faction: 'milicia', name: 'Unidade de Suporte', model: 'medic', category: 'infantry',
    description: 'Recupera a vida da infantaria próxima.',
    hp: 85, speed: 2.2, armor: 0.1, sight: 8, pop: 1, cost: { money: 90 }, buildTime: 15,
    heal: { amount: 6, radius: 4, targets: 'infantry' }, canCapture: false,
  },
  {
    id: 'mil_utilitario', faction: 'milicia', name: 'Veículo Utilitário', model: 'utility', category: 'vehicle',
    description: 'Veículo de patrulha territorial.',
    hp: 260, speed: 4.2, armor: 0.35, sight: 9, pop: 2, cost: { money: 150, fuel: 20 }, buildTime: 20,
    attack: { range: 5.5, damage: 12, cooldown: 0.9 }, canCapture: true,
  },
  {
    id: 'mil_caminhonete', faction: 'milicia', name: 'Caminhonete', model: 'pickup', category: 'vehicle',
    description: 'Caminhonete reforçada, bom equilíbrio entre força e mobilidade.',
    hp: 350, speed: 3.8, armor: 0.4, sight: 9, pop: 2, cost: { money: 230, materials: 20, fuel: 30 }, buildTime: 25,
    attack: { range: 6, damage: 19, cooldown: 1.1 }, canCapture: true,
  },
  {
    id: 'mil_blindado', faction: 'milicia', name: 'Blindado Improvisado', model: 'armored', category: 'vehicle',
    description: 'Blindado fictício pesado. Lento e muito resistente.',
    hp: 720, speed: 2.4, armor: 0.55, sight: 9, pop: 3, cost: { money: 400, materials: 70, fuel: 50 }, buildTime: 36,
    attack: { range: 6.5, damage: 34, cooldown: 1.6 }, buildingDamageMult: 1.6, canCapture: true,
    requiresTech: 'mil_t_blindagem',
  },
  {
    id: 'mil_manutencao', faction: 'milicia', name: 'Unidade de Manutenção', model: 'utility', category: 'vehicle',
    description: 'Veículo que repara estruturas e recupera veículos próximos.',
    hp: 260, speed: 3.6, armor: 0.35, sight: 8, pop: 2, cost: { money: 140, materials: 30, fuel: 15 }, buildTime: 20,
    heal: { amount: 9, radius: 4, targets: 'vehicle' }, canRepair: true, canCapture: false,
  },

  // ---------------- BANDIDO ----------------
  {
    id: 'ban_eng', faction: 'bandido', name: 'Unidade de Engenharia', model: 'engineer', category: 'infantry',
    description: 'Ágil, acelera construções e repara estruturas. Não combate.',
    hp: 60, speed: 2.7, armor: 0.0, sight: 7, pop: 1, cost: { money: 40 }, buildTime: 8,
    canRepair: true, canCapture: false,
  },
  {
    id: 'ban_leve', faction: 'bandido', name: 'Unidade Leve', model: 'soldier', category: 'infantry',
    description: 'Barata e rápida. Forte em grupos e em ataques rápidos.',
    hp: 85, speed: 2.9, armor: 0.05, sight: 8, pop: 1, cost: { money: 60 }, buildTime: 10,
    attack: { range: 5, damage: 11, cooldown: 0.9 }, canCapture: true,
  },
  {
    id: 'ban_recon', faction: 'bandido', name: 'Unidade de Reconhecimento', model: 'scout', category: 'infantry',
    description: 'Muito rápida e com grande alcance de visão.',
    hp: 60, speed: 3.7, armor: 0.0, sight: 13, pop: 1, cost: { money: 45 }, buildTime: 8,
    attack: { range: 6, damage: 6, cooldown: 1.0 }, canCapture: true,
  },
  {
    id: 'ban_suporte', faction: 'bandido', name: 'Equipe de Suporte', model: 'medic', category: 'infantry',
    description: 'Recupera a vida da infantaria próxima.',
    hp: 70, speed: 2.8, armor: 0.0, sight: 8, pop: 1, cost: { money: 80 }, buildTime: 13,
    heal: { amount: 6, radius: 4, targets: 'infantry' }, canCapture: false,
  },
  {
    id: 'ban_moto', faction: 'bandido', name: 'Motocicleta', model: 'moto', category: 'vehicle',
    description: 'Extremamente rápida. Ótima para capturar e reposicionar.',
    hp: 140, speed: 6.0, armor: 0.15, sight: 10, pop: 1, cost: { money: 120, fuel: 15 }, buildTime: 14,
    attack: { range: 5, damage: 10, cooldown: 0.7 }, canCapture: true,
  },
  {
    id: 'ban_utilitario', faction: 'bandido', name: 'Veículo Utilitário', model: 'utility', category: 'vehicle',
    description: 'Veículo ágil de apoio.',
    hp: 235, speed: 4.8, armor: 0.3, sight: 9, pop: 2, cost: { money: 140, fuel: 20 }, buildTime: 18,
    attack: { range: 5.5, damage: 12, cooldown: 0.9 }, canCapture: true,
  },
  {
    id: 'ban_caminhonete', faction: 'bandido', name: 'Caminhonete', model: 'pickup', category: 'vehicle',
    description: 'Caminhonete rápida com bom poder de fogo.',
    hp: 310, speed: 4.4, armor: 0.35, sight: 9, pop: 2, cost: { money: 210, materials: 15, fuel: 30 }, buildTime: 22,
    attack: { range: 6, damage: 20, cooldown: 1.1 }, buildingDamageMult: 1.2, canCapture: true,
    requiresTech: 'ban_t_reforco',
  },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(list.map((u) => [u.id, u]));

export function getUnitDef(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unidade desconhecida: ${id}`);
  return def;
}
