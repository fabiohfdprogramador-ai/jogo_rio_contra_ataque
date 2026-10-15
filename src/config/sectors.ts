// Tipos de setor territorial e o que cada um gera para quem o controla.
import type { Cost, SectorType } from '../game/types';

export interface SectorTypeDef {
  name: string;
  description: string;
  income: Cost; // por minuto
  energy: number;
  /** Revela todo o setor para o dono (posição elevada). */
  revealsSector: boolean;
}

export const SECTOR_TYPES: Record<SectorType, SectorTypeDef> = {
  residencial: {
    name: 'Residencial',
    description: 'Bairro de casas e prédios baixos. Renda estável.',
    income: { money: 65, materials: 10 },
    energy: 0,
    revealsSector: false,
  },
  comercial: {
    name: 'Comercial',
    description: 'Centro de comércio e escritórios. Muito dinheiro.',
    income: { money: 115 },
    energy: 0,
    revealsSector: false,
  },
  industrial: {
    name: 'Industrial',
    description: 'Galpões e fábricas. Gera materiais de construção.',
    income: { money: 30, materials: 45 },
    energy: 0,
    revealsSector: false,
  },
  porto: {
    name: 'Portuário',
    description: 'Cais e terminais. Gera combustível e algum dinheiro.',
    income: { money: 40, fuel: 25 },
    energy: 0,
    revealsSector: false,
  },
  energia: {
    name: 'Instalação de Energia',
    description: 'Subestação regional. Fornece energia ao dono.',
    income: { money: 30 },
    energy: 20,
    revealsSector: false,
  },
  elevado: {
    name: 'Posição Elevada',
    description: 'Morro com vista ampla. Revela o setor inteiro ao dono.',
    income: { money: 50, materials: 10 },
    energy: 0,
    revealsSector: true,
  },
};

/** Nomes fictícios dos setores (inspirados na geografia carioca, sem referência direta). */
export const SECTOR_NAMES = [
  'Costa Azul',
  'Morro do Horizonte',
  'Centro Novo',
  'Jardim Imperial',
  'Parque da Baía',
  'Vila Central',
  'Distrito Industrial',
  'Alto da Serra',
  'Bairro das Palmeiras',
  'Porto Novo',
  'Ladeira do Sol',
  'Enseada Verde',
  'Largo das Gaivotas',
  'Recanto do Mar',
  'Pedra Branca Nova',
  'Vila Aurora',
];
