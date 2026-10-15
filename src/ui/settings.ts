// Configurações do jogador (gráficos, câmera), salvas no navegador.
import type { RenderQuality } from '../render/renderer';

export type QualityPreset = 'baixa' | 'media' | 'alta';

export interface UserSettings {
  quality: QualityPreset;
  edgeScroll: boolean;
  cameraSpeed: number; // 0.5..2
  healthBars: 'sempre' | 'danificadas';
}

const KEY = 'rio-em-conquista:settings';

export const DEFAULT_SETTINGS: UserSettings = {
  quality: 'alta',
  edgeScroll: true,
  cameraSpeed: 1,
  healthBars: 'danificadas',
};

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: UserSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Armazenamento indisponível: as configurações valem apenas para esta sessão.
  }
}

export function qualityFor(preset: QualityPreset): RenderQuality {
  switch (preset) {
    case 'baixa':
      return { shadows: false, pixelRatio: 1, effects: false };
    case 'media':
      return { shadows: true, pixelRatio: 1, effects: true };
    default:
      return { shadows: true, pixelRatio: 2, effects: true };
  }
}
