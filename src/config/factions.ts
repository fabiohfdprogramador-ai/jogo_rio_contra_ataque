// Identidade e regras das três equipes jogáveis.
import type { FactionDef, FactionId, Mods } from '../game/types';

export const DEFAULT_MODS: Mods = {
  income: 1,
  buildSpeed: 1,
  buildingHp: 1,
  infantryHp: 1,
  vehicleHp: 1,
  unitSpeed: 1,
  vision: 1,
  damage: 1,
  captureSpeed: 1,
  popBonus: 0,
};

export const FACTIONS: Record<FactionId, FactionDef> = {
  policia: {
    id: 'policia',
    name: 'Polícia',
    tagline: 'Organização, reconhecimento e operações coordenadas.',
    description:
      'Forças organizadas com excelente visão do mapa e defesa sólida dos territórios. Estruturas mais caras e lentas, mas confiáveis.',
    strengths: [
      '+25% de alcance de visão',
      'Unidades recebem 20% menos dano dentro do próprio território',
      'Radar do Centro de Comunicação revela inimigos nos seus territórios',
      'Acesso a blindados',
    ],
    weaknesses: ['Construções mais caras e demoradas', 'Expansão exige planejamento logístico'],
    color: 0x2f7cf6,
    colorCss: '#2f7cf6',
    roles: {
      hq: 'pol_base',
      barracks: 'pol_delegacia',
      garage: 'pol_garagem',
      power: 'pol_subestacao',
      logistics: 'pol_logistica',
      research: 'pol_comunicacao',
      defense: 'pol_bloqueio',
    },
    startingUnits: ['pol_eng', 'pol_eng', 'pol_patrulha', 'pol_patrulha', 'pol_recon'],
    baseMods: { ...DEFAULT_MODS, vision: 1.25 },
    rules: { homeDefenseReduction: 0.2, connectedIncomeMult: 1, isolatedIncomeMult: 1, outsideDamageMult: 1 },
  },
  milicia: {
    id: 'milicia',
    name: 'Milícia',
    tagline: 'Fortificação, presença territorial e expansão estruturada.',
    description:
      'Domina territórios conectados e se fortifica rapidamente. Recebe bônus de renda por manter regiões ligadas à base, mas sofre com regiões isoladas.',
    strengths: [
      'Estruturas com +20% de vida',
      'Territórios conectados ao QG rendem +20%',
      'Postos avançados rápidos que regeneram unidades',
      'Defesas robustas e unidade de manutenção',
    ],
    weaknesses: ['Territórios isolados rendem apenas 50%', 'Perder a conexão com a base derruba a economia'],
    color: 0x2fae5a,
    colorCss: '#2fae5a',
    roles: {
      hq: 'mil_qg',
      barracks: 'mil_treinamento',
      garage: 'mil_garagem',
      power: 'mil_subestacao',
      logistics: 'mil_deposito',
      research: 'mil_suporte_inst',
      defense: 'mil_defensiva',
      outpost: 'mil_posto',
    },
    startingUnits: ['mil_eng', 'mil_eng', 'mil_defesa', 'mil_defesa', 'mil_recon'],
    baseMods: { ...DEFAULT_MODS, buildingHp: 1.2 },
    rules: { homeDefenseReduction: 0, connectedIncomeMult: 1.2, isolatedIncomeMult: 0.5, outsideDamageMult: 1 },
  },
  bandido: {
    id: 'bandido',
    name: 'Bandido',
    tagline: 'Mobilidade, flexibilidade e bases menores.',
    description:
      'Unidades rápidas e baratas, captura acelerada e postos avançados que funcionam como bases secundárias. A base pode ser reconstruída em outra região.',
    strengths: [
      'Unidades mais rápidas e baratas',
      'Captura de territórios 20% mais rápida',
      'Postos avançados baratos que treinam unidades e contam como base',
      'Pode reconstruir a Base Principal',
    ],
    weaknesses: [
      'Estruturas com 20% menos vida',
      'Causa 10% menos dano fora do próprio território',
      'Sem blindados pesados',
    ],
    color: 0xe0452f,
    colorCss: '#e0452f',
    roles: {
      hq: 'ban_base',
      barracks: 'ban_esconderijo',
      garage: 'ban_garagem',
      power: 'ban_subestacao',
      logistics: 'ban_deposito',
      research: 'ban_oficina',
      defense: 'ban_posto',
      outpost: 'ban_posto',
    },
    startingUnits: ['ban_eng', 'ban_eng', 'ban_leve', 'ban_leve', 'ban_moto'],
    baseMods: { ...DEFAULT_MODS, buildingHp: 0.8, captureSpeed: 1.2 },
    rules: { homeDefenseReduction: 0, connectedIncomeMult: 1, isolatedIncomeMult: 1, outsideDamageMult: 0.9 },
  },
};

export const FACTION_IDS: FactionId[] = ['policia', 'milicia', 'bandido'];

/** Cor alternativa quando duas equipes iguais estão na mesma partida. */
export const ALT_COLORS = [0xf2b630, 0xb15cf0, 0x22c2c7];
