// Tipos centrais da simulação. A simulação é composta apenas por dados simples
// (serializáveis em JSON), o que facilita salvamento e, no futuro, multiplayer.

export type FactionId = 'policia' | 'milicia' | 'bandido';
export type Difficulty = 'facil' | 'normal' | 'dificil';
export type MapSize = 'pequeno' | 'medio';
export type StartingResources = 'baixo' | 'normal' | 'alto';

export interface Resources {
  money: number;
  materials: number;
  fuel: number;
}
export type ResourceKey = keyof Resources;
export type Cost = Partial<Resources>;

export type UnitCategory = 'infantry' | 'vehicle';
export type BuildingRole =
  | 'hq'
  | 'barracks'
  | 'garage'
  | 'power'
  | 'logistics'
  | 'research'
  | 'defense'
  | 'outpost';

export type UnitModel =
  | 'soldier'
  | 'heavy'
  | 'scout'
  | 'engineer'
  | 'medic'
  | 'car'
  | 'suv'
  | 'armored'
  | 'moto'
  | 'pickup'
  | 'utility';

export interface AttackDef {
  range: number; // em tiles
  damage: number;
  cooldown: number; // segundos
}

export interface HealDef {
  amount: number; // pontos por segundo
  radius: number;
  targets: UnitCategory | 'all';
}

export interface UnitDef {
  id: string;
  faction: FactionId;
  name: string;
  description: string;
  category: UnitCategory;
  model: UnitModel;
  hp: number;
  speed: number; // tiles por segundo
  armor: number; // 0..0.9 — fração de dano absorvida
  sight: number;
  pop: number;
  cost: Cost;
  buildTime: number; // segundos
  attack?: AttackDef;
  heal?: HealDef;
  canRepair?: boolean;
  canCapture: boolean;
  buildingDamageMult?: number;
  requiresTech?: string;
}

export interface BuildingDef {
  id: string;
  faction: FactionId;
  name: string;
  description: string;
  role: BuildingRole;
  size: number; // tiles (quadrado)
  hp: number;
  armor: number;
  cost: Cost;
  buildTime: number;
  buildable: boolean;
  energy: number; // positivo = gera, negativo = consome
  pop: number;
  income?: Cost; // por minuto
  trains?: string[];
  researches?: string[];
  attack?: AttackDef;
  regenAura?: { amount: number; radius: number };
  sight: number;
  isBase?: boolean;
  limit?: number;
  requires?: string[]; // outras construções necessárias (concluídas)
  requiresTech?: string;
  radar?: boolean; // revela unidades inimigas em territórios próprios
}

export interface Mods {
  income: number;
  buildSpeed: number;
  buildingHp: number;
  infantryHp: number;
  vehicleHp: number;
  unitSpeed: number;
  vision: number;
  damage: number;
  captureSpeed: number;
  popBonus: number;
}

export interface TechDef {
  id: string;
  faction: FactionId;
  name: string;
  description: string;
  cost: Cost;
  time: number;
  effects: Partial<Mods>;
  unlocks?: string[];
}

export interface FactionRules {
  /** Redução de dano recebido por unidades dentro do próprio território. */
  homeDefenseReduction: number;
  /** Multiplicador de renda para territórios conectados à base principal. */
  connectedIncomeMult: number;
  /** Multiplicador de renda para territórios isolados da base principal. */
  isolatedIncomeMult: number;
  /** Multiplicador de dano quando a unidade está fora do território próprio. */
  outsideDamageMult: number;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  tagline: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  color: number;
  colorCss: string;
  roles: Partial<Record<BuildingRole, string>>;
  startingUnits: string[];
  baseMods: Mods;
  rules: FactionRules;
}

// ---------- Mapa ----------

export enum Tile {
  Road = 0,
  Lot = 1,
  Park = 2,
  Water = 3,
  Sand = 4,
  Bridge = 5,
}

export type SectorType = 'residencial' | 'comercial' | 'industrial' | 'porto' | 'energia' | 'elevado';

export type DecorStyle = 'casa' | 'predio' | 'torre' | 'galpao' | 'morro';

export interface DecorBuilding {
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
  color: number;
  style: DecorStyle;
}

export interface SectorStatic {
  id: number;
  name: string;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  x1: number; // exclusivo
  y1: number; // exclusivo
  cx: number; // ponto de controle (coordenadas de mundo)
  cy: number;
  type: SectorType;
}

export interface SectorState {
  owner: number | null;
  /** Equipe que está acumulando progresso de captura. */
  captureTeam: number | null;
  /** 0..100 — controle do dono atual (ou da equipe capturando, se neutro). */
  progress: number;
  contested: boolean;
}

export interface MapData {
  width: number;
  height: number;
  sectorSize: number;
  sectorsX: number;
  sectorsY: number;
  tiles: Uint8Array;
  /** 1 = obstáculo estático (água, edifícios do cenário). */
  blocked: Uint8Array;
  /** 1 = árvore (não permite construção). */
  trees: Uint8Array;
  decor: DecorBuilding[];
  sectors: SectorStatic[];
  starts: { sector: number; hqX: number; hqY: number }[];
}

// ---------- Entidades ----------

export type Order =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number; attackMove: boolean }
  | { type: 'attack'; targetId: number }
  | { type: 'hold'; x: number; y: number }
  | { type: 'patrol'; ax: number; ay: number; bx: number; by: number; toB: boolean }
  | { type: 'follow'; targetId: number }
  | { type: 'repair'; targetId: number };

export interface Unit {
  id: number;
  kind: 'unit';
  type: string;
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  facing: number;
  order: Order;
  /** Alvo atual de combate (pode ser automático). */
  targetId: number | null;
  /** Posição de referência para não perseguir alvos longe demais quando ocioso. */
  anchorX: number;
  anchorY: number;
  path: { x: number; y: number }[] | null;
  pathIdx: number;
  pathGoalX: number;
  pathGoalY: number;
  repathTicks: number;
  stuckTicks: number;
  cooldown: number; // ticks
  lastAttackTick: number;
  attackedBy: number | null;
}

export interface QueueItem {
  unitType: string;
  remaining: number; // ticks
  total: number;
}

export interface Building {
  id: number;
  kind: 'building';
  type: string;
  owner: number;
  tx: number;
  ty: number;
  size: number;
  hp: number;
  maxHp: number;
  built: boolean;
  progress: number; // 0..1
  buildTotalTicks: number;
  queue: QueueItem[];
  research: { techId: string; remaining: number; total: number } | null;
  rallyX: number | null;
  rallyY: number | null;
  cooldown: number;
  targetId: number | null;
  demolishTicks: number; // >0 = em demolição
}

export interface Ruin {
  id: number;
  kind: 'ruin';
  tx: number;
  ty: number;
  size: number;
  role: BuildingRole;
  formerType: string;
}

export type Entity = Unit | Building | Ruin;

// ---------- Jogadores e partida ----------

export interface PlayerStats {
  unitsProduced: number;
  unitsLost: number;
  kills: number;
  buildingsBuilt: number;
  buildingsLost: number;
  resourcesSpent: number;
  sectorsCaptured: number;
  techsResearched: number;
}

export interface Player {
  id: number;
  name: string;
  faction: FactionId;
  color: number;
  isAI: boolean;
  difficulty: Difficulty;
  resources: Resources;
  mods: Mods;
  techs: string[];
  alive: boolean;
  eliminatedAt: number | null;
  stats: PlayerStats;
  // Valores derivados (recalculados a cada tick)
  energySupply: number;
  energyDemand: number;
  popUsed: number;
  popCap: number;
  incomePerMin: Resources;
}

export type VictoryMode = 'conquista' | 'dominacao' | 'tempo';

export interface MatchConfig {
  seed: number;
  mapSize: MapSize;
  players: {
    faction: FactionId;
    isAI: boolean;
    difficulty: Difficulty;
    name: string;
    /** Posição inicial (0..2). Se omitida, usa a ordem dos jogadores. */
    start?: number;
  }[];
  startingResources: StartingResources;
  victory: {
    /** Eliminar as bases adversárias sempre é condição de vitória. */
    domination: boolean;
    dominationRatio: number; // 0..1
    dominationSeconds: number;
    timeLimitMinutes: number; // 0 = sem limite
  };
  fogOfWar: boolean;
}

export type GameEvent =
  | { type: 'shot'; from: number; to: number; x0: number; y0: number; x1: number; y1: number; heavy: boolean }
  | { type: 'death'; id: number; x: number; y: number; vehicle: boolean }
  | { type: 'buildingDestroyed'; id: number; owner: number; x: number; y: number; size: number }
  | { type: 'buildingComplete'; id: number; owner: number; buildingType: string }
  | { type: 'unitTrained'; id: number; owner: number; unitType: string }
  | { type: 'researchComplete'; owner: number; techId: string }
  | { type: 'sectorCaptured'; sector: number; owner: number; previous: number | null }
  | { type: 'sectorLost'; sector: number; owner: number }
  | { type: 'underAttack'; owner: number; x: number; y: number }
  | { type: 'playerEliminated'; player: number }
  | { type: 'error'; player: number; message: string }
  | { type: 'gameOver'; winner: number | null; reason: string };

export interface AIMemory {
  nextThink: number;
  attackGroup: number[];
  attackTarget: number | null; // setor
  attackStartStrength: number;
  expandGroup: number[];
  expandTarget: number | null; // setor
  scoutId: number | null;
  scoutQueue: number[]; // setores a visitar
  defending: boolean;
  lastAttackTick: number;
}

export interface DominationState {
  player: number | null;
  ticks: number;
}

export interface World {
  config: MatchConfig;
  tick: number;
  nextId: number;
  rngState: number;
  map: MapData;
  sectors: SectorState[];
  players: Player[];
  units: Map<number, Unit>;
  buildings: Map<number, Building>;
  ruins: Map<number, Ruin>;
  /** Ocupação dinâmica (id da construção + 1 em cada tile). */
  occupancy: Int32Array;
  visibility: Uint8Array[]; // por jogador: 0 = desconhecido, 1 = explorado, 2 = visível
  events: GameEvent[];
  domination: DominationState;
  ai: Record<number, AIMemory>;
  status: 'running' | 'ended';
  winner: number | null;
  endReason: string;
}
