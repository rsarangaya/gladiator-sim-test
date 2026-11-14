import type { ArmorSet, ClassId, FighterSpec, Personality, ShieldDef, Stats, WeaponDef } from '../sim/types';

export const WEAPONS: Record<string, WeaponDef> = {
  gladius:    { name: 'Gladius',         dmg: 14.8, reach: 6,   speed: 1.0,  edged: true },
  scimitar:   { name: 'Hooked Scimitar', dmg: 17.4, reach: 5.5, speed: 0.95, edged: true },
  spear:      { name: 'Long Spear',      dmg: 15.6, reach: 10,  speed: 1.15, edged: true, closeMin: 5.5 },
  trident:    { name: 'Trident',         dmg: 18.6, reach: 9,   speed: 1.05, edged: true, closeMin: 5 },
  twinBlades: { name: 'Twin Blades',     dmg: 12.5,  reach: 5,   speed: 0.8,  edged: true, dual: true },
  greataxe:   { name: 'Great Axe',       dmg: 16.4, reach: 7.5, speed: 1.5,  edged: true, twoHanded: true },
  fists:      { name: 'Bare Hands',      dmg: 3,  reach: 3.6,  speed: 0.9,  edged: false },
};

export const SHIELDS: Record<string, ShieldDef> = {
  scutum: { name: 'Large Shield', absorb: 0.5, block: 1.0 },
  parma:  { name: 'Small Shield', absorb: 0.45, block: 0.85 },
  hoplon: { name: 'Round Shield', absorb: 0.55, block: 0.9 },
};

const armor = (head: number, torso: number, arms: number, legs: number): ArmorSet =>
  ({ head, torso, armW: arms, armS: arms, legL: legs, legR: legs });

export interface ClassDef {
  id: ClassId;
  label: string;
  blurb: string;
  pros: string;
  cons: string;
  base: Stats;          // level-1 stats (60 points total)
  weapon: keyof typeof WEAPONS;
  shield?: keyof typeof SHIELDS;
  armor: ArmorSet;
  signature: string;
  personality: Personality;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  murmillo:    { id: 'murmillo', label: 'Knight', blurb: 'Tank. Sword, large shield, heavy armor.',
                 pros: 'Most health and armor. The large shield blocks a lot, and Shield Bash staggers.', cons: 'Slow and easy to outmaneuver. Low agility.',
                 base: { str: 14, agi: 8, vit: 15, end: 12, tec: 11, spi: 12 }, weapon: 'gladius', shield: 'scutum',
                 armor: armor(22, 22, 14, 10), signature: 'Shield Bash', personality: 'defensive' },
  thraex:      { id: 'thraex', label: 'Duelist', blurb: 'Skirmisher. Curved blade, small shield.',
                 pros: 'Fast and accurate. Hook Strike ignores blocks.', cons: 'Light armor and little health.',
                 base: { str: 11, agi: 14, vit: 11, end: 10, tec: 14, spi: 11 }, weapon: 'scimitar', shield: 'parma',
                 armor: armor(18, 18, 10, 6), signature: 'Hook Strike', personality: 'balanced' },
  hoplomachus: { id: 'hoplomachus', label: 'Lancer', blurb: 'Reach. Long spear and round shield.',
                 pros: 'Longest reach. Keeps foes at the tip, and Spear Wall counters rushes.', cons: 'Slow swings, weaker and less accurate up close.',
                 base: { str: 12, agi: 10, vit: 12, end: 12, tec: 14, spi: 12 }, weapon: 'spear', shield: 'hoplon',
                 armor: armor(18, 20, 10, 8), signature: 'Spear Wall', personality: 'balanced' },
  retiarius:   { id: 'retiarius', label: 'Trapper', blurb: 'Control. Trident and net, no shield.',
                 pros: 'Long reach, high agility. Net Throw slows the target.', cons: 'Very light armor, no shield, low spirit (yields early), weak up close.',
                 base: { str: 9, agi: 16, vit: 10, end: 12, tec: 13, spi: 8 }, weapon: 'trident',
                 armor: armor(6, 12, 20, 4), signature: 'Net Throw', personality: 'balanced' },
  dimachaerus: { id: 'dimachaerus', label: 'Assassin', blurb: 'Glass cannon. Twin blades.',
                 pros: 'Two fast hits per attack plus Whirlwind. High strength and agility.', cons: 'Almost no armor. Low health and stamina.',
                 base: { str: 15, agi: 16, vit: 8, end: 8, tec: 13, spi: 9 }, weapon: 'twinBlades',
                 armor: armor(8, 8, 4, 2), signature: 'Whirlwind', personality: 'aggressive' },
  brute:       { id: 'brute', label: 'Bruiser', blurb: 'Power. Two-handed great axe.',
                 pros: 'Biggest hits, and Cleave pierces armor. High strength and health.', cons: 'Slowest swings and lowest agility, easy to dodge. No shield.',
                 base: { str: 17, agi: 6, vit: 14, end: 13, tec: 10, spi: 10 }, weapon: 'greataxe',
                 armor: armor(11, 15, 7, 5), signature: 'Cleave', personality: 'aggressive' },
};

/** Stats scale with level in proportion to the class's starting spread. Cap 100, diminishing near top. */
export function statsAtLevel(base: Stats, level: number): Stats {
  return scaleStats(base, 1 + 0.35 * (level - 1));
}

/** Scale a class spread by a point multiplier k. Half the growth is proportional, half uniform,
 *  so class identity fades gently with level instead of widening the gaps (flat formula constants shrink). */
export function scaleStats(base: Stats, k: number): Stats {
  const total = base.str + base.agi + base.vit + base.end + base.tec;
  const f = (v: number) => {
    const raw = v * (1 + 0.5 * (k - 1)) + 0.5 * (k - 1) * (total / 5);
    return Math.min(100, Math.round(raw > 70 ? 70 + (raw - 70) * 0.5 : raw));
  };
  return { str: f(base.str), agi: f(base.agi), vit: f(base.vit), end: f(base.end), tec: f(base.tec), spi: Math.round(base.spi + 0.8 * (k - 1)) };
}

export function makeSpec(classId: ClassId, level = 1, name?: string, personality?: Personality): FighterSpec {
  const c = CLASSES[classId];
  return {
    name: name ?? c.label,
    classId,
    level,
    stats: statsAtLevel(c.base, level),
    weapon: WEAPONS[c.weapon],
    shield: c.shield ? SHIELDS[c.shield] : undefined,
    armor: { ...c.armor },
    personality: personality ?? c.personality,
  };
}
