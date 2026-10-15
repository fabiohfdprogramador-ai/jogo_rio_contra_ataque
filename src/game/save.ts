// Salvamento e carregamento de partidas (JSON). O mapa estático é regenerado
// a partir da semente; apenas o estado dinâmico é gravado.
import { BUILDINGS } from '../config/buildings';
import { FACTIONS } from '../config/factions';
import { TECHS } from '../config/techs';
import { UNITS } from '../config/units';
import { generateMap } from './map/mapgen';
import type { AIMemory, Building, MatchConfig, Player, Ruin, SectorState, Unit, World } from './types';
import { recomputeDerived, setOccupancy } from './world';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: string;
  config: MatchConfig;
  tick: number;
  nextId: number;
  rngState: number;
  sectors: SectorState[];
  players: Player[];
  units: Unit[];
  buildings: Building[];
  ruins: Ruin[];
  explored: string[];
  domination: World['domination'];
  ai: Record<number, AIMemory>;
  status: World['status'];
  winner: number | null;
  endReason: string;
}

export class SaveError extends Error {}

export function serializeWorld(world: World): SaveData {
  return JSON.parse(
    JSON.stringify({
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      config: world.config,
      tick: world.tick,
      nextId: world.nextId,
      rngState: world.rngState,
      sectors: world.sectors,
      players: world.players,
      units: [...world.units.values()],
      buildings: [...world.buildings.values()],
      ruins: [...world.ruins.values()],
      explored: world.visibility.map(encodeExplored),
      domination: world.domination,
      ai: world.ai,
      status: world.status,
      winner: world.winner,
      endReason: world.endReason,
    }),
  );
}

function encodeExplored(vis: Uint8Array): string {
  // Bitset (1 bit por tile) em base64.
  const bytes = new Uint8Array(Math.ceil(vis.length / 8));
  for (let i = 0; i < vis.length; i++) if (vis[i] > 0) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function decodeExplored(str: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  const bin = atob(str);
  for (let i = 0; i < length; i++) {
    const byte = bin.charCodeAt(i >> 3);
    if (byte & (1 << (i & 7))) out[i] = 1;
  }
  return out;
}

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new SaveError(`Arquivo de salvamento inválido: ${msg}`);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function deserializeWorld(raw: unknown): World {
  check(raw && typeof raw === 'object', 'formato desconhecido');
  const data = raw as SaveData;
  check(data.version === SAVE_VERSION, `versão ${String(data.version)} não suportada`);
  check(data.config && Array.isArray(data.config.players), 'configuração ausente');
  check(data.config.mapSize === 'pequeno' || data.config.mapSize === 'medio', 'tamanho de mapa inválido');
  check(isNum(data.config.seed), 'semente inválida');
  check(Array.isArray(data.players) && data.players.length === data.config.players.length, 'jogadores inválidos');
  check(Array.isArray(data.units) && Array.isArray(data.buildings) && Array.isArray(data.ruins), 'entidades ausentes');
  check(isNum(data.tick) && isNum(data.nextId), 'tempo inválido');

  const map = generateMap(data.config.mapSize, data.config.seed);
  check(Array.isArray(data.sectors) && data.sectors.length === map.sectors.length, 'setores inválidos');
  const nPlayers = data.players.length;
  for (const p of data.players) {
    check(FACTIONS[p.faction], `equipe desconhecida ${p.faction}`);
    check(isNum(p.resources?.money) && isNum(p.resources?.materials) && isNum(p.resources?.fuel), 'recursos inválidos');
    check(Array.isArray(p.techs) && p.techs.every((t) => TECHS[t]), 'melhorias inválidas');
  }
  for (const s of data.sectors) check(s.owner === null || (isNum(s.owner) && s.owner < nPlayers), 'dono de setor inválido');

  const world: World = {
    config: data.config,
    tick: data.tick,
    nextId: data.nextId,
    rngState: data.rngState | 0,
    map,
    sectors: data.sectors,
    players: data.players,
    units: new Map(),
    buildings: new Map(),
    ruins: new Map(),
    occupancy: new Int32Array(map.width * map.height),
    visibility: [],
    events: [],
    domination: data.domination ?? { player: null, ticks: 0 },
    ai: data.ai ?? {},
    status: data.status === 'ended' ? 'ended' : 'running',
    winner: data.winner ?? null,
    endReason: data.endReason ?? '',
  };
  for (const u of data.units) {
    check(UNITS[u.type], `unidade desconhecida ${u.type}`);
    check(isNum(u.x) && isNum(u.y) && isNum(u.hp) && u.owner >= 0 && u.owner < nPlayers, 'unidade corrompida');
    check(u.x >= 0 && u.y >= 0 && u.x < map.width && u.y < map.height, 'unidade fora do mapa');
    world.units.set(u.id, u);
  }
  for (const b of data.buildings) {
    check(BUILDINGS[b.type], `construção desconhecida ${b.type}`);
    check(isNum(b.tx) && isNum(b.ty) && b.owner >= 0 && b.owner < nPlayers, 'construção corrompida');
    check(b.tx >= 0 && b.ty >= 0 && b.tx + b.size <= map.width && b.ty + b.size <= map.height, 'construção fora do mapa');
    world.buildings.set(b.id, b);
    setOccupancy(world, b, b.id + 1);
  }
  for (const r of data.ruins) world.ruins.set(r.id, r);
  for (let i = 0; i < nPlayers; i++) {
    const enc = data.explored?.[i];
    world.visibility.push(typeof enc === 'string' ? decodeExplored(enc, map.width * map.height) : new Uint8Array(map.width * map.height));
  }
  recomputeDerived(world);
  return world;
}

// ---------- Armazenamento local (navegador) ----------

export const SAVE_SLOTS = ['auto', '1', '2', '3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];
const KEY = (slot: SaveSlot) => `rio-em-conquista:save:${slot}`;

export interface SlotInfo {
  slot: SaveSlot;
  savedAt: string;
  tick: number;
  faction: string;
}

export function saveToSlot(world: World, slot: SaveSlot) {
  localStorage.setItem(KEY(slot), JSON.stringify(serializeWorld(world)));
}

export function loadFromSlot(slot: SaveSlot): World {
  const raw = localStorage.getItem(KEY(slot));
  if (!raw) throw new SaveError('Nenhuma partida salva neste espaço');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SaveError('Arquivo de salvamento corrompido');
  }
  return deserializeWorld(parsed);
}

export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const slot of SAVE_SLOTS) {
    try {
      const raw = localStorage.getItem(KEY(slot));
      if (!raw) continue;
      const d = JSON.parse(raw) as SaveData;
      const human = d.players.find((p) => !p.isAI) ?? d.players[0];
      out.push({ slot, savedAt: d.savedAt, tick: d.tick, faction: FACTIONS[human.faction]?.name ?? '?' });
    } catch {
      // Espaço com dados inválidos é ignorado na listagem.
    }
  }
  return out;
}

export function latestSlot(): SaveSlot | null {
  const slots = listSlots().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return slots[0]?.slot ?? null;
}
