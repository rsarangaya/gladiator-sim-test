import type { ActionId } from '../sim/types';

export interface ActionDef {
  id: ActionId;
  startup: number;   // ticks before active
  active: number;    // ticks active (one hit roll per active tick for attacks)
  recovery: number;  // ticks after
  stamina: number;
  attack: boolean;
  dmgMult: number;
  reach?: number;          // override weapon reach
  bypassBlock?: boolean;
  armorPierce?: number;    // 0..1 fraction of armor ignored
  effect?: 'stagger' | 'snare' | 'counter';
  cooldown?: number;       // ticks
  weaponSpeed?: boolean;   // startup/recovery scale with weapon.speed
}

// All numbers live here so tuning never touches logic. 20 ticks = 1 second.
export const ACTIONS: Record<ActionId, ActionDef> = {
  light:   { id: 'light',   startup: 4,  active: 1, recovery: 5,  stamina: 5,  attack: true,  dmgMult: 1.0, weaponSpeed: true },
  heavy:   { id: 'heavy',   startup: 8,  active: 1, recovery: 11, stamina: 12, attack: true,  dmgMult: 1.9, weaponSpeed: true },
  block:   { id: 'block',   startup: 1,  active: 8, recovery: 3,  stamina: 2,  attack: false, dmgMult: 0 },
  dodge:   { id: 'dodge',   startup: 0,  active: 4, recovery: 5,  stamina: 9,  attack: false, dmgMult: 0 },
  advance: { id: 'advance', startup: 0,  active: 2, recovery: 0,  stamina: 0,  attack: false, dmgMult: 0 },
  retreat: { id: 'retreat', startup: 0,  active: 2, recovery: 0,  stamina: 0,  attack: false, dmgMult: 0 },
  rest:    { id: 'rest',    startup: 0,  active: 0, recovery: 4,  stamina: 0,  attack: false, dmgMult: 0 },
  // class signatures
  bash:    { id: 'bash',    startup: 5,  active: 1, recovery: 9,  stamina: 11, attack: true,  dmgMult: 0.6, reach: 4,  effect: 'stagger', cooldown: 70 },
  hook:    { id: 'hook',    startup: 6,  active: 1, recovery: 8,  stamina: 10, attack: true,  dmgMult: 1.3, bypassBlock: true, cooldown: 50, weaponSpeed: true },
  wall:    { id: 'wall',    startup: 0,  active: 10, recovery: 5, stamina: 8,  attack: false, dmgMult: 1.6, effect: 'counter', cooldown: 80 },
  net:     { id: 'net',     startup: 7,  active: 1, recovery: 9,  stamina: 9,  attack: true,  dmgMult: 0.1, reach: 14, effect: 'snare', cooldown: 100 },
  whirl:   { id: 'whirl',   startup: 7,  active: 3, recovery: 13, stamina: 20, attack: true,  dmgMult: 0.85, cooldown: 60, weaponSpeed: true },
  cleave:  { id: 'cleave',  startup: 10, active: 1, recovery: 14, stamina: 18, attack: true,  dmgMult: 2.5, armorPierce: 0.3, cooldown: 80, weaponSpeed: true },
};

export const ZONE_DMG_MULT = { head: 1.4, torso: 1.0, armW: 0.9, armS: 0.9, legL: 0.9, legR: 0.9 } as const;

export const TUNING = {
  arenaWidth: 60,
  startPos: [20, 40] as [number, number],
  minGap: 3.5,
  crowdHit: 0.05,          // long weapons used inside their closeMin distance: hit chance penalty
  crowdDmg: 0.9,           // ...and damage multiplier
  moveBase: 0.9,           // units per move-tick at 0 agi
  moveAgi: 0.012,
  netSnareTicks: 80,
  snareMoveMult: 0.3,
  stunTicks: 10,
  staggerTicks: 12,
  bleedTicks: 100,
  bleedPerSec: 1.6,
  critBase: 0.04,
  critPerTec: 0.0012,
  critMult: 1.7,
  limbSpill: 0.12,          // share of limb damage that also reaches the torso
  disabledSpill: 0.5,
  hitBase: 0.8,
  hitMin: 0.2,
  hitMax: 0.95,
  yieldAt: { aggressive: 0.04, balanced: 0.05, defensive: 0.07 },
  yieldAtPlayer: { aggressive: 0.08, balanced: 0.1, defensive: 0.13 },
  yieldChancePlayer: 0.07,
  yieldChance: 0.016,       // per decision once below the threshold (low = fights end in death more often)
  staminaRegen: 0.2,       // per tick base
  staminaRegenEnd: 0.008,  // per tick per Endurance point
  damageScale: 0.42,       // global pacing knob: lower = longer fights
  formSigma: 0.12,         // per-fight lognormal form factor (variance / upsets)
};
