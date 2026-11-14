export type Zone = 'head' | 'torso' | 'armW' | 'armS' | 'legL' | 'legR';
export const ZONES: Zone[] = ['head', 'torso', 'armW', 'armS', 'legL', 'legR'];

export type ClassId = 'murmillo' | 'thraex' | 'hoplomachus' | 'retiarius' | 'dimachaerus' | 'brute';
export const CLASS_IDS: ClassId[] = ['murmillo', 'thraex', 'hoplomachus', 'retiarius', 'dimachaerus', 'brute'];

export type ActionId =
  | 'light' | 'heavy' | 'block' | 'dodge' | 'advance' | 'retreat' | 'rest'
  | 'bash' | 'hook' | 'wall' | 'net' | 'whirl' | 'cleave';

/** str = weapon-arm strength, strL = off-arm strength (shield, second blade, net) */
export interface Stats { str: number; strL: number; agi: number; vit: number; end: number; tec: number; spi: number }

export interface WeaponDef {
  name: string;
  dmg: number;       // base damage per hit
  reach: number;     // arena units
  closeMin?: number; // long weapons are awkward inside this distance (less accurate, weaker)
  speed: number;     // multiplier on startup/recovery (>1 = slower)
  edged: boolean;    // can cause bleeding
  dual?: boolean;    // light attack lands two hits
  twoHanded?: boolean;
}
export interface ShieldDef { name: string; absorb: number; block: number }
export type ArmorSet = Record<Zone, number>;

export type Personality = 'aggressive' | 'balanced' | 'defensive';

export interface FighterSpec {
  name: string;
  classId: ClassId;
  level: number;
  stats: Stats;
  weapon: WeaponDef;
  shield?: ShieldDef;
  armor: ArmorSet;
  personality: Personality;
  /** zone penalties carried in from previous fights (permanent injuries) */
  carriedHpLoss?: Partial<Record<Zone, number>>;
  /** limbs lost in earlier fights (no prosthetic): they start the fight already gone */
  missing?: Partial<Record<Zone, boolean>>;
  /** an infamous challenger: drawn bigger, with a blood-red name and a darkened sky */
  human?: boolean;  // the player's fighter (yields earlier than opponents)
  boss?: boolean;
  /** learned skills and gear perk ids; compiled into combat modifiers (see data/skills.ts) */
  skills?: string[];
}

export type ZoneTier = 'ok' | 'hurt' | 'crippled' | 'disabled';
export type EventResult =
  | 'start' | 'hit' | 'crit' | 'blocked' | 'dodged' | 'whiff' | 'countered'
  | 'move' | 'stunned' | 'snared' | 'bleed' | 'yield' | 'death' | 'cap' | 'disarmed';

export interface ZoneChange { zone: Zone; hp: number; tier: ZoneTier }

/** The single source of truth for rendering, play-by-play and replays. */
export interface FightEvent {
  tick: number;
  actor: 0 | 1;
  action?: ActionId;
  targetZone?: Zone;     // zone on the OTHER fighter (or the actor for bleed)
  result: EventResult;
  damage?: number;
  zoneStateChanges?: ZoneChange[];
  statuses?: string[];
  x?: [number, number];  // positions snapshot for start/move events
  hp?: [Record<Zone, number>, Record<Zone, number>]; // zone hp snapshot after hits / at the end
}

export type EndMethod = 'death' | 'yield' | 'cap';

export type InjuryTier = 'bruised' | 'wounded' | 'maimed';
export interface Injury { zone: Zone; tier: InjuryTier }

export interface FightResult {
  seed: number;
  winner: 0 | 1 | null;
  method: EndMethod;
  ticks: number;
  events: FightEvent[];
  finalHp: [Record<Zone, number>, Record<Zone, number>];
  maxHp: [Record<Zone, number>, Record<Zone, number>];
  damageDealt: [number, number];
  injuries: [Injury[], Injury[]];
  /** per-tick x positions, only when log is enabled */
  track?: Array<[number, number]>;
}

export const TICKS_PER_SEC = 20;
export const TIME_CAP_TICKS = 180 * TICKS_PER_SEC;
