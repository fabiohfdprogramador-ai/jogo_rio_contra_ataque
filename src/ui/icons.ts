// Ícones da interface: siglas sobre cores por categoria (provisórios e consistentes).
import { BUILDINGS } from '../config/buildings';
import { UNITS } from '../config/units';
import type { BuildingRole, UnitModel } from '../game/types';

const ROLE_COLOR: Record<BuildingRole, string> = {
  hq: '#a0782a',
  barracks: '#3d6fa8',
  garage: '#5a5f8f',
  power: '#2c8fb3',
  logistics: '#8a6a3a',
  research: '#7b4fa6',
  defense: '#8f3b3b',
  outpost: '#4f7f4a',
};

const MODEL_COLOR: Partial<Record<UnitModel, string>> = {
  engineer: '#b08a1c',
  medic: '#2f8f6f',
  scout: '#3f7f9f',
};

export function abbreviation(name: string): string {
  const words = name
    .replace(/[^\p{L}\s-]/gu, '')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 || /^[A-ZÀ-Ú]/.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function unitIcon(type: string): { label: string; color: string } {
  const def = UNITS[type];
  return {
    label: abbreviation(def.name),
    color: MODEL_COLOR[def.model] ?? (def.category === 'vehicle' ? '#55606e' : '#4a6077'),
  };
}

export function buildingIcon(type: string): { label: string; color: string } {
  const def = BUILDINGS[type];
  return { label: abbreviation(def.name), color: ROLE_COLOR[def.role] };
}

export function hexCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function formatTime(ticks: number, tickRate: number): string {
  const total = Math.floor(ticks / tickRate);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
