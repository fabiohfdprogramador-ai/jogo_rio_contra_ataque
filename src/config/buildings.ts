// Estruturas das três equipes. Ajuste o balanceamento aqui.
import type { BuildingDef } from '../game/types';

const list: BuildingDef[] = [
  // ---------------- POLÍCIA ----------------
  {
    id: 'pol_base', faction: 'policia', role: 'hq', name: 'Base Operacional',
    description: 'Centro da operação. Treina engenheiros e gera renda. Se for destruída, a equipe é derrotada.',
    size: 4, hp: 2400, armor: 0.3, cost: {}, buildTime: 0, buildable: false, energy: 10, pop: 15,
    income: { money: 90, materials: 25, fuel: 8 }, trains: ['pol_eng'], sight: 11,
    attack: { range: 7, damage: 8, cooldown: 1.0 }, isBase: true, limit: 1,
  },
  {
    id: 'pol_delegacia', faction: 'policia', role: 'barracks', name: 'Delegacia',
    description: 'Treina agentes de patrulha, intervenção, reconhecimento e suporte.',
    size: 3, hp: 1100, armor: 0.25, cost: { money: 200, materials: 130 }, buildTime: 32, buildable: true,
    energy: -4, pop: 0, trains: ['pol_patrulha', 'pol_intervencao', 'pol_recon', 'pol_suporte'], sight: 8,
  },
  {
    id: 'pol_garagem', faction: 'policia', role: 'garage', name: 'Garagem',
    description: 'Produz viaturas, SUVs e blindados.',
    size: 4, hp: 1300, armor: 0.3, cost: { money: 280, materials: 170 }, buildTime: 50, buildable: true,
    energy: -6, pop: 0, trains: ['pol_viatura', 'pol_suv', 'pol_blindado'], sight: 8, requires: ['pol_delegacia'],
  },
  {
    id: 'pol_subestacao', faction: 'policia', role: 'power', name: 'Subestação',
    description: 'Gera energia para as instalações.',
    size: 2, hp: 550, armor: 0.2, cost: { money: 130, materials: 90 }, buildTime: 28, buildable: true,
    energy: 20, pop: 0, sight: 6,
  },
  {
    id: 'pol_logistica', faction: 'policia', role: 'logistics', name: 'Centro Logístico',
    description: 'Aumenta a renda e a capacidade de população.',
    size: 3, hp: 900, armor: 0.2, cost: { money: 220, materials: 110 }, buildTime: 40, buildable: true,
    energy: -2, pop: 12, income: { money: 65, materials: 20, fuel: 8 }, sight: 7,
  },
  {
    id: 'pol_comunicacao', faction: 'policia', role: 'research', name: 'Centro de Comunicação',
    description: 'Pesquisa melhorias e ativa o radar: revela inimigos dentro dos seus territórios.',
    size: 3, hp: 800, armor: 0.2, cost: { money: 250, materials: 130 }, buildTime: 45, buildable: true,
    energy: -5, pop: 0, sight: 14, requires: ['pol_delegacia'], radar: true,
    researches: ['pol_t_logistica', 'pol_t_blindagem', 'pol_t_coletes', 'pol_t_radio', 'pol_t_engenharia'],
  },
  {
    id: 'pol_bloqueio', faction: 'policia', role: 'defense', name: 'Posto de Bloqueio',
    description: 'Ponto fortificado que dispara contra inimigos próximos.',
    size: 2, hp: 950, armor: 0.4, cost: { money: 160, materials: 130 }, buildTime: 32, buildable: true,
    energy: -3, pop: 0, sight: 9, attack: { range: 7.5, damage: 14, cooldown: 1.0 },
  },

  // ---------------- MILÍCIA ----------------
  {
    id: 'mil_qg', faction: 'milicia', role: 'hq', name: 'Quartel-General',
    description: 'Centro de comando. Treina engenheiros e gera renda. Se for destruído, a equipe é derrotada.',
    size: 4, hp: 2600, armor: 0.3, cost: {}, buildTime: 0, buildable: false, energy: 10, pop: 15,
    income: { money: 90, materials: 25, fuel: 8 }, trains: ['mil_eng'], sight: 11,
    attack: { range: 7, damage: 9, cooldown: 1.0 }, isBase: true, limit: 1,
  },
  {
    id: 'mil_treinamento', faction: 'milicia', role: 'barracks', name: 'Centro de Treinamento',
    description: 'Treina unidades de defesa, reconhecimento e suporte.',
    size: 3, hp: 1150, armor: 0.25, cost: { money: 190, materials: 120 }, buildTime: 32, buildable: true,
    energy: -4, pop: 0, trains: ['mil_defesa', 'mil_recon', 'mil_suporte'], sight: 8,
  },
  {
    id: 'mil_garagem', faction: 'milicia', role: 'garage', name: 'Garagem',
    description: 'Produz utilitários, caminhonetes, blindados e unidades de manutenção.',
    size: 4, hp: 1300, armor: 0.3, cost: { money: 260, materials: 160 }, buildTime: 45, buildable: true,
    energy: -6, pop: 0, trains: ['mil_utilitario', 'mil_caminhonete', 'mil_blindado', 'mil_manutencao'], sight: 8,
    requires: ['mil_treinamento'],
  },
  {
    id: 'mil_subestacao', faction: 'milicia', role: 'power', name: 'Subestação',
    description: 'Gera energia para as instalações.',
    size: 2, hp: 600, armor: 0.2, cost: { money: 120, materials: 85 }, buildTime: 25, buildable: true,
    energy: 20, pop: 0, sight: 6,
  },
  {
    id: 'mil_deposito', faction: 'milicia', role: 'logistics', name: 'Depósito',
    description: 'Aumenta a renda e a capacidade de população.',
    size: 3, hp: 950, armor: 0.2, cost: { money: 200, materials: 100 }, buildTime: 35, buildable: true,
    energy: -2, pop: 12, income: { money: 60, materials: 25, fuel: 8 }, sight: 7,
  },
  {
    id: 'mil_suporte_inst', faction: 'milicia', role: 'research', name: 'Instalação de Suporte',
    description: 'Pesquisa melhorias de fortificação, blindagem e controle territorial.',
    size: 3, hp: 850, armor: 0.2, cost: { money: 230, materials: 120 }, buildTime: 40, buildable: true,
    energy: -5, pop: 0, sight: 8, requires: ['mil_treinamento'],
    researches: ['mil_t_fortificacao', 'mil_t_blindagem', 'mil_t_territorio', 'mil_t_treino'],
  },
  {
    id: 'mil_defensiva', faction: 'milicia', role: 'defense', name: 'Estrutura Defensiva',
    description: 'Fortificação robusta com bom alcance.',
    size: 2, hp: 1300, armor: 0.45, cost: { money: 170, materials: 140 }, buildTime: 28, buildable: true,
    energy: -3, pop: 0, sight: 9, attack: { range: 8, damage: 16, cooldown: 1.0 },
  },
  {
    id: 'mil_posto', faction: 'milicia', role: 'outpost', name: 'Posto Avançado',
    description: 'Construção rápida. Amplia a população e regenera unidades aliadas próximas.',
    size: 2, hp: 650, armor: 0.3, cost: { money: 120, materials: 80 }, buildTime: 12, buildable: true,
    energy: 0, pop: 6, sight: 10, attack: { range: 6, damage: 6, cooldown: 1.0 },
    regenAura: { amount: 2.5, radius: 6 },
  },

  // ---------------- BANDIDO ----------------
  {
    id: 'ban_base', faction: 'bandido', role: 'hq', name: 'Base Principal',
    description: 'Base compacta. Treina engenheiros e gera renda. Pode ser reconstruída a partir de um posto avançado.',
    size: 3, hp: 1900, armor: 0.25, cost: { money: 500, materials: 300 }, buildTime: 60, buildable: true,
    energy: 10, pop: 15, income: { money: 90, materials: 25, fuel: 8 }, trains: ['ban_eng'], sight: 10,
    attack: { range: 6.5, damage: 8, cooldown: 1.0 }, isBase: true, limit: 1,
  },
  {
    id: 'ban_esconderijo', faction: 'bandido', role: 'barracks', name: 'Esconderijo',
    description: 'Treina unidades leves, reconhecimento e suporte.',
    size: 3, hp: 800, armor: 0.15, cost: { money: 150, materials: 80 }, buildTime: 24, buildable: true,
    energy: -3, pop: 0, trains: ['ban_leve', 'ban_recon', 'ban_suporte'], sight: 8,
  },
  {
    id: 'ban_garagem', faction: 'bandido', role: 'garage', name: 'Garagem',
    description: 'Produz motocicletas, utilitários e caminhonetes.',
    size: 3, hp: 950, armor: 0.2, cost: { money: 220, materials: 120 }, buildTime: 36, buildable: true,
    energy: -5, pop: 0, trains: ['ban_moto', 'ban_utilitario', 'ban_caminhonete'], sight: 8,
    requires: ['ban_esconderijo'],
  },
  {
    id: 'ban_subestacao', faction: 'bandido', role: 'power', name: 'Gerador',
    description: 'Gera energia para as instalações.',
    size: 2, hp: 450, armor: 0.15, cost: { money: 110, materials: 70 }, buildTime: 22, buildable: true,
    energy: 18, pop: 0, sight: 6,
  },
  {
    id: 'ban_deposito', faction: 'bandido', role: 'logistics', name: 'Depósito',
    description: 'Aumenta a renda e a capacidade de população.',
    size: 3, hp: 700, armor: 0.15, cost: { money: 180, materials: 90 }, buildTime: 30, buildable: true,
    energy: -2, pop: 12, income: { money: 65, materials: 15, fuel: 10 }, sight: 7,
  },
  {
    id: 'ban_oficina', faction: 'bandido', role: 'research', name: 'Oficina',
    description: 'Pesquisa melhorias de mobilidade, economia e reforço.',
    size: 3, hp: 700, armor: 0.15, cost: { money: 200, materials: 100 }, buildTime: 34, buildable: true,
    energy: -4, pop: 0, sight: 8, requires: ['ban_esconderijo'],
    researches: ['ban_t_motores', 'ban_t_rede', 'ban_t_improviso', 'ban_t_reforco'],
  },
  {
    id: 'ban_posto', faction: 'bandido', role: 'outpost', name: 'Posto Avançado',
    description: 'Base secundária barata. Treina engenheiros e unidades leves e conta como base.',
    size: 2, hp: 550, armor: 0.2, cost: { money: 110, materials: 60 }, buildTime: 16, buildable: true,
    energy: 0, pop: 6, sight: 9, trains: ['ban_eng', 'ban_leve'], attack: { range: 6, damage: 7, cooldown: 1.0 },
    isBase: true,
  },
];

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(list.map((b) => [b.id, b]));

export function getBuildingDef(id: string): BuildingDef {
  const def = BUILDINGS[id];
  if (!def) throw new Error(`Construção desconhecida: ${id}`);
  return def;
}
