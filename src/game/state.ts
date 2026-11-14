// Game progression: pure logic, no DOM. UI calls these and re-renders.
import { CLASSES, SHIELDS, WEAPONS, scaleStats } from '../data/classes';
import { PERKS, SKILLS, canLearn, enemySkills, nameKey } from '../data/skills';
import { mulberry32 } from '../sim/rng';
import { zoneMax } from '../sim/fighter';
import { simulateFight } from '../sim/sim';
import { CLASS_IDS, ZONES, type ClassId, type FightResult, type FighterSpec, type Injury, type InjuryTier, type Personality, type Stats, type Zone } from '../sim/types';

export type Difficulty = 'normal' | 'hard';
export const STAT_KEYS: (keyof Stats)[] = ['str', 'agi', 'vit', 'end', 'tec', 'spi'];
/** Spirit does not add fighting power, so it is left out of power budgets. */
export const POWER_KEYS: (keyof Stats)[] = ['str', 'agi', 'vit', 'end', 'tec'];
export const MAX_ENERGY = 3;
export const START_POINTS = 12;

export type Mode = 'free' | 'career';

export interface LadderOpp { name: string; classId: ClassId; budget: number; personality: Personality; tier: number }
export interface Career {
  ladder: LadderOpp[]; beaten: number; champion: boolean; defenses: number;
  size: number;            // how many ranked fighters (top 10, 15 or 20)
  prelim: LadderOpp[];     // unranked qualifier opponents, fought before the ladder
  prelimWins: number;
}
export const inPrelims = (c: Career) => c.prelimWins < c.prelim.length;

export const CAREER_SIZES = [10, 15, 20];
/** Unranked qualifier fights to win before the ladder opens. */
export const PRELIMS: Record<number, number> = { 10: 2, 15: 3, 20: 4 };
/** Budgets climb from the weakest ranked fighter to the champion; bigger fields climb more gently but end higher. */
export function ladderBudgets(size: number): number[] {
  const top = 174 + (size - 10) * 2;
  return Array.from({ length: size }, (_, i) => Math.round(68 + ((top - 68) * i) / (size - 1)));
}
export const WAIT_COST = 8;
/** Rivals train too: opponents grow stronger the longer a run lasts. */
export const rivalDrift = (s: { day: number }) => Math.min(1.6, 1 + 0.007 * (s.day - 1));
export const waitCost = (s: { day: number; bedridden?: number }) => (s.bedridden ? 0 : WAIT_COST + Math.floor(s.day / 2));

export interface Save {
  v: 1;
  name: string;
  classId: ClassId;
  difficulty: Difficulty;
  added: Stats;                     // points invested on top of class base
  unspent: number;
  gold: number;
  energy: number;
  day: number;
  wins: number;
  fights: number;
  xp: number;
  weaponTier: number;               // 0..3
  armorTier: number;                // 0..3
  injuries: Partial<Record<Zone, InjuryTier>>;
  prosthetics: Partial<Record<Zone, boolean>>;
  tutorialDone: boolean;
  alive: boolean;
  best: number;
  mode: Mode;
  career?: Career;
  recorded?: boolean;
  gear: Gear;
  /** A fight that has been entered but not finished. It is saved with its seed, so closing or reloading can never reroll or avoid it. */
  pending?: { seed: number; pick: number };
  news: string[];                 // what happened overnight (shown in the hub)
  sick: number;                   // days of fever left (one less energy)
  bedridden: number;              // days laid up by infection (no actions)
  oppMod?: number;                // rumor about the next opponent (strength multiplier)
  encounter?: Encounter;          // an infamous challenger waiting for an answer
  loot?: { weapon?: string; armor?: string };
  skills: string[];               // learned skill ids
  skillPoints: number;
  perks: { weapon: string[]; armor: string[] };  // perks rolled on the equipped weapon and armor
  trainerBuys: number;            // times you hired the master trainer
  lastEncounter?: number;         // day the last challenger appeared
  runSeed: number;                // fixes every fight seed for this run, so actions cannot reroll a fight
  neglect: number;                // consecutive days ended badly hurt without resting
  restedToday?: boolean;
}

export const TIER_COSTS = { weapon: [70, 160], armor: [60, 140] };
/** The shop sells up to Rare (tier 2). Epic and Legendary gear only drops from infamous challengers. */
export const SHOP_MAX_TIER = 2;
export const REST_GOLD = 12;
export const PROSTHETIC_COST = 140;

export function newGame(name: string, classId: ClassId, difficulty: Difficulty, alloc: Partial<Stats> = {}, mode: Mode = 'free', seed = 1, size = 10): Save {
  const added: Stats = { str: 0, agi: 0, vit: 0, end: 0, tec: 0, spi: 0 };
  let spent = 0;
  for (const k of STAT_KEYS) {
    const v = Math.max(0, Math.floor(alloc[k] ?? 0));
    if (spent + v <= START_POINTS) { added[k] = v; spent += v; }
  }
  return {
    v: 1, name: name.trim() || 'Nameless', classId, difficulty, added, unspent: START_POINTS - spent,
    gold: 40, energy: MAX_ENERGY, day: 1, wins: 0, fights: 0, xp: 0,
    weaponTier: 0, armorTier: 0, injuries: {}, prosthetics: {}, tutorialDone: mode === 'career', alive: true, best: 0,
    mode, career: mode === 'career' ? makeCareer(mulberry32(seed), size) : undefined, gear: freshGear(), news: [], sick: 0, bedridden: 0, runSeed: Math.imul(seed + 1, 2654435761) >>> 0, neglect: 0, skills: [], skillPoints: 2, perks: { weapon: [], armor: [] }, trainerBuys: 0,
  };
}

export const level = (s: Save) => 1 + Math.floor(s.xp / 3);
export const stats = (s: Save): Stats => {
  const b = CLASSES[s.classId].base;
  return { str: b.str + s.added.str, agi: b.agi + s.added.agi, vit: b.vit + s.added.vit, end: b.end + s.added.end, tec: b.tec + s.added.tec, spi: b.spi + s.added.spi };
};
export const totalPoints = (s: Save) => POWER_KEYS.reduce((a, k) => a + stats(s)[k], 0);

export function spendPoint(s: Save, k: keyof Stats): boolean {
  if (s.unspent <= 0 || stats(s)[k] >= 100) return false;
  s.added[k]++; s.unspent--;
  return true;
}

/** Maimed limbs without a prosthetic are simply gone. */
export function missingLimbs(s: Save): Partial<Record<Zone, boolean>> {
  const out: Partial<Record<Zone, boolean>> = {};
  for (const z of ['armW', 'armS', 'legL', 'legR'] as Zone[]) if (s.injuries[z] === 'maimed' && !s.prosthetics[z]) out[z] = true;
  return out;
}

const LOSS = { bruised: 0.12, wounded: 0.35, maimed: 0.7 } as const;

/** HP missing at the start of the next fight, from injuries not yet healed. */
export function carriedLoss(s: Save): Partial<Record<Zone, number>> {
  const max = zoneMax(stats(s).vit);
  const out: Partial<Record<Zone, number>> = {};
  for (const z of ZONES) {
    const t = s.injuries[z];
    if (!t) continue;
    let f = LOSS[t];
    if (t === 'maimed' && s.prosthetics[z]) f *= 0.5;
    out[z] = max[z] * f;
  }
  return out;
}

export function playerSpec(s: Save): FighterSpec {
  const c = CLASSES[s.classId];
  const g = s.gear;
  // worn gear performs worse; at 0 durability it is unusable (bare hands, no shield, no armor on that zone)
  const w = g.weapon <= 0 ? { ...WEAPONS.fists } : { ...WEAPONS[c.weapon] };
  if (g.weapon > 0) w.dmg *= (1 + 0.1 * s.weaponTier) * wearMod(g.weapon);
  const base = c.shield ? SHIELDS[c.shield] : undefined;
  const shield = base && g.shield > 0 ? { ...base, absorb: base.absorb * wearMod(g.shield), block: base.block * wearMod(g.shield) } : undefined;
  const armor = { ...c.armor };
  for (const z of ZONES) armor[z] = g.armor[z] <= 0 ? 0 : (armor[z] + 6 * s.armorTier) * wearMod(g.armor[z]);
  return {
    name: s.name, human: true, classId: s.classId, level: level(s), stats: stats(s), weapon: w, shield, armor,
    personality: c.personality, carriedHpLoss: carriedLoss(s), missing: missingLimbs(s),
    skills: [...s.skills, ...(g.weapon > 0 ? s.perks.weapon : []), ...s.perks.armor],
  };
}

const NAMES = ['Aurelio', 'Brasidas', 'Cato', 'Drusus', 'Eryx', 'Fabian', 'Gaius', 'Hektor', 'Ignis', 'Kallias', 'Lucan', 'Marek', 'Nero', 'Orsus', 'Pyrrhus', 'Quintus', 'Rufus', 'Sextus', 'Tarkus', 'Varro'];

/** Career and Hard mode: maimed limbs are permanent (prosthetics only soften them). Bruises and wounds always heal with rest. */
export const permanentWounds = (s: Save) => s.mode === 'career' || s.difficulty === 'hard';

function specFromBudget(classId: ClassId, budget: number, tier: number, name: string, personality?: Personality, skillN?: number): FighterSpec {
  const c = CLASSES[classId];
  const baseTotal = POWER_KEYS.reduce((a, k) => a + c.base[k], 0);
  const w = { ...WEAPONS[c.weapon] };
  w.dmg *= 1 + 0.1 * tier;
  const armor = { ...c.armor };
  for (const z of ZONES) armor[z] += 6 * tier;
  return {
    name, classId, level: 1 + Math.floor(budget / 40), stats: scaleStats(c.base, budget / baseTotal), weapon: w,
    shield: c.shield ? SHIELDS[c.shield] : undefined, armor, personality: personality ?? c.personality,
    skills: enemySkills(classId, budget, nameKey(name), false, skillN),
  };
}

/** Free-mode enemy power follows the player's point total so the ladder scales with whatever you invest in. */
export function makeEnemy(s: Save, rng: () => number, tutorial = false, pickScale = 1, pickIdx = 1): FighterSpec {
  const classId = CLASS_IDS[Math.floor(rng() * CLASS_IDS.length)];
  const scale = tutorial ? 0.62 : Math.min(1.2, 0.82 + 0.01 * s.fights) * pickScale; // free-mode foes track your strength
  const name = `${NAMES[Math.floor(rng() * NAMES.length)]} the ${CLASSES[classId].label}`;
  return specFromBudget(classId, totalPoints(s) * scale * (s.oppMod ?? 1), Math.min(1, Math.floor(s.fights / 10)), name, undefined, tutorial ? 0 : Math.max(0, s.skills.length + pickIdx - 1));
}

// ---- career ----------------------------------------------------------------------
const EPITHETS = ['the Hammer', 'Ironhide', 'the Viper', 'Bonecrusher', 'the Ghost', 'Redhand', 'the Butcher', 'Stormcaller', 'the Wall', 'Sandwolf', 'the Reaper', 'Dawnbreaker'];
const PERSONALITIES: Personality[] = ['aggressive', 'balanced', 'defensive'];

export function makeCareer(rng: () => number, size: number): Career {
  const prelimCount = PRELIMS[size] ?? 2;
  const pairs: string[] = [];
  for (const n of NAMES) for (const e of EPITHETS) pairs.push(`${n} ${e}`);
  pairs.sort(() => rng() - 0.5);
  const make = (budget: number, i: number, tier: number): LadderOpp => ({
    name: pairs[i], classId: CLASS_IDS[Math.floor(rng() * CLASS_IDS.length)], budget,
    personality: PERSONALITIES[Math.floor(rng() * 3)], tier,
  });
  const prelim = Array.from({ length: prelimCount }, (_, i) => make(Math.round(58 + (8 * i) / Math.max(1, prelimCount - 1)), i, 0));
  const ladder = ladderBudgets(size).map((b, i) => make(b, prelimCount + i, Math.min(3, Math.floor((i * 4) / size))));
  return { ladder, beaten: 0, champion: false, defenses: 0, size, prelim, prelimWins: 0 };
}

export const ladderSpec = (o: LadderOpp, mod = 1) => specFromBudget(o.classId, o.budget * mod, o.tier, o.name, o.personality);
export const ladderRank = (s: Save) => (s.career ? s.career.size - s.career.beaten : 0);

function challenger(c: Career, rng: () => number): FighterSpec {
  const classId = CLASS_IDS[Math.floor(rng() * CLASS_IDS.length)];
  const name = `${NAMES[Math.floor(rng() * NAMES.length)]} ${EPITHETS[Math.floor(rng() * EPITHETS.length)]}`;
  return specFromBudget(classId, ladderBudgets(c.size)[c.size - 1] + 8 * (c.defenses + 1), 3, name, PERSONALITIES[Math.floor(rng() * 3)]);
}

export function arenaLabel(s: Save): string {
  const c = s.career;
  if (s.mode === 'career' && c) {
    if (inPrelims(c)) return `Qualifier ${c.prelimWins + 1} of ${c.prelim.length}`;
    return c.champion ? `Defend the title (#${c.defenses + 1})` : `Challenge rank ${ladderRank(s)}`;
  }
  return s.tutorialDone ? 'Enter the arena' : 'Tutorial fight';
}

export const score = (s: Save) => (s.mode === 'career' ? (s.career?.beaten ?? 0) + (s.career?.defenses ?? 0) : s.wins);

// ---- day actions ----------------------------------------------------------------
export function train(s: Save, k: keyof Stats, rng: () => number): string {
  if (s.energy < 1) return 'No energy left today.';
  if (stats(s)[k] >= 100) return 'That stat is maxed.';
  s.energy--;
  // past 40 a stat only improves about half the time (diminishing returns)
  if (stats(s)[k] >= 40 && rng() < 0.5) return `Training: no progress today (${k.toUpperCase()} is already high).`;
  const gain = rng() < 0.25 ? 2 : 1;
  s.added[k] += gain;
  let result = `Training: +${gain} ${k.toUpperCase()}${gain === 2 ? ' (great session!)' : ''}`;
  if (rng() < 0.07) { // a training mishap
    const z = (['armW', 'armS', 'legL', 'legR'] as Zone[])[Math.floor(rng() * 4)];
    const tier: InjuryTier = rng() < 0.3 ? 'wounded' : 'bruised';
    if (rank(tier) > rank(s.injuries[z])) s.injuries[z] = tier;
    result += ` But you strained your ${z === 'armW' ? 'weapon arm' : z === 'armS' ? 'shield arm' : z === 'legL' ? 'left leg' : 'right leg'} (${tier}).`;
  }
  return result;
}

/** Rest heals bruised and wounded zones everywhere; maimed zones heal only in Free Normal. */
export function rest(s: Save): string {
  if (s.energy < 1) return 'No energy left today.';
  if (s.gold < REST_GOLD) return `Rest costs ${REST_GOLD} gold.`;
  s.energy--; s.gold -= REST_GOLD;
  s.sick = 0; s.restedToday = true;
  let healed = 0;
  for (const z of ZONES) {
    const t = s.injuries[z];
        if (t === 'bruised' || t === 'wounded' || (t === 'maimed' && !permanentWounds(s))) { delete s.injuries[z]; healed++; }
  }
  return healed ? `You rest. ${healed} injur${healed > 1 ? 'ies' : 'y'} healed.` : 'You rest. Nothing could be healed.';
}

export function buyTier(s: Save, kind: 'weapon' | 'armor'): string {
  const key = kind === 'weapon' ? 'weaponTier' : 'armorTier';
  const tier = s[key];
  if (tier >= SHOP_MAX_TIER) return 'The shop has nothing better.';
  const cost = TIER_COSTS[kind][tier];
  if (s.gold < cost) return `Need ${cost} gold.`;
  s.gold -= cost; s[key]++;
  if (kind === 'weapon') s.gear.weapon = 100; else for (const z of ZONES) s.gear.armor[z] = 100; // a new piece arrives in perfect condition
  if (s.loot) delete s.loot[kind];
  s.perks[kind] = s[key] >= 2 ? pickPerks(kind, 1, actionRng(s, 'shop' + kind)) : []; // Rare gear carries one perk
  const pk = s.perks[kind].map((p) => SKILLS[p].name).join(', ');
  return `Bought a ${RARITIES[s[key]]} ${kind} upgrade${pk ? ` with the ${pk} perk` : ''}.`;
}

export function buyProsthetic(s: Save, z: Zone): string {
  if (s.injuries[z] !== 'maimed') return 'Nothing to replace there.';
  if (s.prosthetics[z]) return 'Already fitted.';
  if (s.gold < PROSTHETIC_COST) return `Need ${PROSTHETIC_COST} gold.`;
  s.gold -= PROSTHETIC_COST; s.prosthetics[z] = true;
  return 'Prosthetic fitted. Part of the lost function returns.';
}

// ---- arena ------------------------------------------------------------------------
export interface Bout { player: FighterSpec; enemy: FighterSpec; seed: number; tutorial: boolean; label: string; reward: number; pick: number; spar?: boolean }

/** Step onto the sand: the fight (seed, opponent) is fixed and saved from this moment. Reopening returns the same fight. */
export const boutSeed = (s: Save) => (s.runSeed ^ Math.imul(s.fights + 1, 0x9e3779b1)) >>> 0;

export function openBout(s: Save, pick = 1): Bout {
  if (!s.pending) s.pending = { seed: boutSeed(s), pick };
  return prepareBout(s, s.pending.seed, s.pending.pick);
}

/** Random numbers for day actions come from the save state itself, so reloading cannot reroll a training result. */
export function actionRng(s: Save, salt: string): () => number {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619) >>> 0; };
  for (const ch of salt) mix(ch.charCodeAt(0));
  for (const k of STAT_KEYS) mix(s.added[k]);
  mix(s.day); mix(s.energy); mix(s.fights); mix(s.gold); mix(s.xp); mix(s.runSeed);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  const r = mulberry32(h >>> 0);
  r(); r(); r(); // warm up
  return r;
}

/** Free mode lets you pick how tough an opponent to face; tougher fights pay more. */
export const PICKS = [
  { label: 'Weaker', scale: 0.85, reward: 0.75 },
  { label: 'Even', scale: 1, reward: 1 },
  { label: 'Stronger', scale: 1.12, reward: 1.3 },
];

export function prepareBout(s: Save, seed: number, pick = 1): Bout {
  const rng = mulberry32((seed ^ 0xa5a5 ^ Math.imul(pick + 1, 0x2545f491)) >>> 0);
  const player = playerSpec(s);
  const base = { seed, tutorial: false, reward: 1, pick };
  if (s.encounter?.accepted) return { ...base, player, enemy: encounterSpec(s.encounter), label: 'Infamous challenger' };
  if (s.mode === 'career' && s.career) {
    const c = s.career;
    // Sparring: a safe, weaker bout that pays little but cannot hurt your ranking. It breaks rematch loops.
    if (pick === 0 && !inPrelims(c)) return { ...base, player, enemy: makeEnemy(s, rng, false, 0.8, 0), reward: 0.5, spar: true, label: 'Sparring match (no effect on your ranking)' };
    if (inPrelims(c)) return { ...base, player, enemy: ladderSpec(c.prelim[c.prelimWins], (s.oppMod ?? 1) * rivalDrift(s)), label: `Qualifier ${c.prelimWins + 1} of ${c.prelim.length}` };
    if (!c.champion) return { ...base, player, enemy: ladderSpec(c.ladder[c.beaten], (s.oppMod ?? 1) * rivalDrift(s)), label: `Ladder fight: rank ${ladderRank(s)}` };
    return { ...base, player, enemy: challenger(c, rng), label: `Title defense #${c.defenses + 1}` };
  }
  const tutorial = !s.tutorialDone;
  const p = tutorial ? PICKS[1] : (PICKS[pick] ?? PICKS[1]);
  return { ...base, player, enemy: makeEnemy(s, rng, tutorial, p.scale, pick), tutorial, reward: p.reward, label: tutorial ? 'Tutorial fight' : `Arena: ${p.label.toLowerCase()} opponent` };
}

/** Scouting estimate: win chance from practice bouts (fixed seeds, so it is the same every time you look). */
const oddsCache = new Map<string, number>();
const specKey = (f: FighterSpec) => `${f.name}|${JSON.stringify(f.stats)}|${f.weapon.dmg.toFixed(2)}|${f.weapon.name}|${JSON.stringify(f.armor)}|${f.shield?.absorb.toFixed(3)}|${JSON.stringify(f.carriedHpLoss ?? {})}|${JSON.stringify(f.missing ?? {})}`;
export const ODDS = { samples: 40 }; // practice bouts per scouting estimate (tools lower this for speed)
export function estimateOdds(player: FighterSpec, enemy: FighterSpec, n = ODDS.samples): number {
  const key = `${specKey(player)}>${specKey(enemy)}`;
  const hit = oddsCache.get(key);
  if (hit !== undefined) return hit;
  let w = 0;
  for (let i = 0; i < n; i++) {
    const seed = 0x5eed0000 + i * 7919, flip = i % 2 === 1;
    const r = flip ? simulateFight(enemy, player, seed, { log: false }) : simulateFight(player, enemy, seed, { log: false });
    w += r.winner === null ? 0.5 : r.winner === (flip ? 1 : 0) ? 1 : 0;
  }
  if (oddsCache.size > 200) oddsCache.clear();
  oddsCache.set(key, w / n);
  return w / n;
}

export interface Candidate { pick: number; bout: Bout; odds: number }
export function scout(s: Save): Candidate[] {
  const seed = boutSeed(s);
  const choose = s.mode === 'free' && s.tutorialDone && !s.encounter?.accepted;
  const career = s.mode === 'career' && !!s.career && !inPrelims(s.career) && !s.encounter?.accepted;
  return (choose ? [0, 1, 2] : career ? [1, 0] : [1]).map((pick) => { const bout = prepareBout(s, seed, pick); return { pick, bout, odds: estimateOdds(bout.player, bout.enemy) }; });
}

const rank = (a: InjuryTier | undefined) => (a === 'maimed' ? 3 : a === 'wounded' ? 2 : a === 'bruised' ? 1 : 0);

export interface Outcome { won: boolean; text: string[] }

export function settleBout(s: Save, b: Bout, r: FightResult): Outcome {
  const text: string[] = [];
  delete s.pending;
  const won = r.winner === 0;
  const c = s.career;
  const special = !!s.encounter?.accepted;
  const spar = !!b.spar;
  s.fights++;
  for (const inj of r.injuries[0] as Injury[]) {
    if (rank(inj.tier) > rank(s.injuries[inj.zone])) s.injuries[inj.zone] = inj.tier;
    const zn = ({ head: 'head', torso: 'torso', armW: 'weapon arm', armS: 'shield arm', legL: 'left leg', legR: 'right leg' } as Record<Zone, string>)[inj.zone];
    text.push(inj.tier === 'maimed' ? `Your ${zn} was maimed: it is gone until you get a prosthetic${permanentWounds(s) ? ' (permanent in this mode)' : ' or heal it'}.` : inj.tier === 'wounded' ? `Your ${zn} is wounded. Rest to heal it.` : `Your ${zn} is bruised.`);
  }
  if (r.method === 'death' && r.winner === 1) {
    s.alive = false;
    text.push('You died in the arena.');
  } else if (won) {
    s.wins++; s.xp++;
    let gold = 30 + Math.round(24 * Math.sqrt(s.wins)) + (b.tutorial ? 20 : 0);
    if (c) gold = 40 + 14 * (c.beaten + 1) + 10 * c.defenses;
    if (special) gold *= 2;
    gold = Math.round(gold * b.reward);
    s.gold += gold;
    text.push(`Victory! +${gold} gold, +1 XP.`);
    if (s.xp % 3 === 0) { s.unspent += 4; s.skillPoints++; text.push('Level up! +4 stat points and +1 skill point.'); }
    if (special) {
      grantLoot(s, s.encounter!.name, mulberry32(b.seed ^ 0x1007), text);
    } else if (spar) {
      text.push('Good practice. Your ranking is unchanged.');
    } else if (c && inPrelims(c)) {
      c.prelimWins++;
      text.push(inPrelims(c) ? `Qualifier won (${c.prelimWins} of ${c.prelim.length}).` : `Qualifiers complete. You enter the ladder at rank ${c.size}.`);
    } else if (c && !c.champion) {
      c.beaten++;
      text.push(`Rank ${c.size - c.beaten + 1} defeated.`);
      if (c.beaten >= c.size) { c.champion = true; text.push('You are the CHAMPION! Defend the title for as long as you can.'); }
    } else if (c) {
      c.defenses++;
      text.push(`Title defended (${c.defenses}).`);
    }
  } else {
    const purse = Math.max(10, Math.round(0.4 * (30 + 24 * Math.sqrt(s.wins + 1)) * b.reward)); // a loss still pays, so one bad run of fights is not a death spiral
    s.gold += purse;
    text.push(r.method === 'yield' ? `You yielded and live to fight on. +${purse} gold.` : `Defeated, but alive. +${purse} gold.`);
    if (c?.champion && !special && !spar) { s.alive = false; text.push('You lost the title. Your reign is over.'); }
  }
  applyWear(s, r, text);
  if (special) delete s.encounter;
  delete s.oppMod;
  if (s.alive) { s.tutorialDone = true; newDay(s); }
  s.best = Math.max(s.best, score(s));
  if (!s.alive) recordScore(s);
  return { won, text };
}

/** Skip to the next day to train and heal before fighting. */
export function waitDay(s: Save): string {
  const cost = waitCost(s);
  if (s.gold < cost) return `Training camp costs ${cost} gold per day.`;
  s.gold -= cost; newDay(s);
  return s.bedridden > 0 ? 'You stay in bed.' : 'A day passes at camp.';
}

export function retire(s: Save) {
  s.alive = false;
  s.best = Math.max(s.best, score(s));
  recordScore(s);
}

// ---- random events, infamous challengers, loot ----------------------------------------
export const RARITIES = ['Common', 'Fine', 'Rare', 'Epic', 'Legendary'];
export const MAX_TIER = 4;
/** Tests switch random events off so day-to-day state stays deterministic. */
export const EVENTS = { enabled: true };

export interface Encounter { name: string; classId: ClassId; budget: number; tier: number; skillN: number; accepted: boolean }

const BOSS_FIRST = ['Plougherous', 'Vorrax', 'Maleficus', 'Gorgonus', 'Ashkar', 'Thulgar', 'Morbius', 'Dreadmoor', 'Cruentus', 'Sanguinar', 'Grimwald', 'Ixion'];
const BOSS_TITLES = ['the Murderer', 'the Butcher', 'the Flayer', 'the Merciless', 'Skullsplitter', 'the Widowmaker', 'the Red Dawn', 'the Ender', 'Bonegrinder', 'the Bloodletter', 'the Unburied', 'Deathbringer'];

/** How badly hurt the player is. Wounds on the head or torso count extra. */
export function injurySeverity(s: Save): number {
  let v = 0;
  for (const z of ZONES) {
    const t = s.injuries[z];
    if (!t) continue;
    v += t === 'bruised' ? 0.5 : t === 'wounded' ? 1.5 : s.prosthetics[z] ? 1.5 : 2.5;
    if ((z === 'torso' || z === 'head') && t !== 'bruised') v += 1.5;
  }
  return v;
}

/** Career: slide down the ladder (champions lose the title). Free mode has no ladder, so it costs gold. */
export function dropRank(s: Save, n: number): string {
  const c = s.career;
  if (s.mode === 'career' && c && !inPrelims(c)) {
    const wasChampion = c.champion;
    if (wasChampion) { c.champion = false; c.beaten = Math.max(0, c.size - n); }
    else c.beaten = Math.max(0, c.beaten - n);
    return wasChampion
      ? `You are stripped of the title and must beat rank ${ladderRank(s)} again.`
      : `You slip back to the challenge for rank ${ladderRank(s)}.`;
  }
  const paid = Math.min(s.gold, Math.max(20, Math.round(s.gold * 0.25)));
  s.gold -= paid;
  return `Your reputation suffers: -${paid} gold.`;
}

function recoverFromBed(s: Save) {
  for (const z of ZONES) { const t = s.injuries[z]; if (t === 'bruised' || t === 'wounded') delete s.injuries[z]; }
}

/** Start a new day: refresh energy (sickness and bed rest reduce it) and roll the day's random event. */
export function newDay(s: Save) {
  s.day++;
  s.news = [];
  s.neglect = injurySeverity(s) >= 4 && !s.restedToday ? s.neglect + 1 : 0;
  s.restedToday = false;
  if (s.sick > 0) s.sick--;
  if (s.bedridden > 0) {
    s.bedridden--;
    if (s.bedridden === 0) { recoverFromBed(s); s.news.push('You are back on your feet; long rest healed your wounds.'); }
  }
  s.energy = s.bedridden > 0 ? 0 : MAX_ENERGY - (s.sick > 0 ? 1 : 0);
  if (s.bedridden > 0) { s.news.push('You are bedridden with fever. There is nothing to do but wait.'); return; }
  if (EVENTS.enabled) rollEvent(s);
}

function rollEvent(s: Save) {
  const rng = actionRng(s, 'event');
  // badly hurt and still fighting on: wounds fester, you miss bouts, your ranking suffers
  if (s.neglect >= 2 && injurySeverity(s) >= 4 && rng() < 0.3) {
    s.bedridden = 2; s.energy = 0;
    s.news.push('Your untreated wounds fester. You collapse with infection and are laid up for two days.');
    s.news.push(`${dropRank(s, 1)} (missed bouts)`);
    return;
  }
  if (rng() < 0.2) {
    const roll = rng() * 100;
    if (roll < 28) {
      const g = 15 + Math.floor(rng() * 40);
      s.gold += g; s.news.push(`A patron tosses you a purse: +${g} gold.`);
    } else if (roll < 44) {
      if (s.gear.weapon < 100) s.gear.weapon = 100; else for (const z of ZONES) s.gear.armor[z] = Math.min(100, s.gear.armor[z] + 25);
      s.news.push('A sponsoring smith tunes up your gear for free.');
    } else if (roll < 58) {
      if (s.sick === 0) { s.sick = 2; s.energy = Math.max(0, s.energy - 1); s.news.push('You catch a fever: one less energy for two days. Resting cures it.'); }
    } else if (roll < 72) {
      s.oppMod = 0.88; s.news.push('Rumor: your next opponent took a bad fall in training.');
    } else if (roll < 82) {
      s.oppMod = 1.1; s.news.push('Rumor: your next opponent has been training twice as hard.');
    } else if (roll < 92) {
      if (rng() < 0.5) s.gear.weapon = Math.max(1, s.gear.weapon - 20);
      else { const z = ZONES[Math.floor(rng() * ZONES.length)]; s.gear.armor[z] = Math.max(1, s.gear.armor[z] - 25); }
      s.news.push('A rival tampered with your gear overnight.');
    } else {
      const g = 40 + Math.floor(rng() * 60);
      s.gold += g; s.news.push(`The crowd has taken to you. A noble sends a gift of ${g} gold.`);
    }
  }
  maybeEncounter(s, rng);
}

// ---- infamous challengers ---------------------------------------------------------------------
function maybeEncounter(s: Save, rng: () => number) {
  if (s.encounter) return;
  const c = s.career;
  const eligible = s.fights >= 3 && (!c || !inPrelims(c));
  if (!eligible || s.day - (s.lastEncounter ?? -99) < 10 || rng() > 0.1) return;
  s.encounter = makeEncounter(s, rng);
  s.lastEncounter = s.day;
  s.news.push(`${s.encounter.name} has issued a challenge!`);
}

/** An infamous challenger is built relative to YOU (a little stronger, two more skills), so the odds stay winnable with preparation. */
function makeEncounter(s: Save, rng: () => number): Encounter {
  const name = `${BOSS_FIRST[Math.floor(rng() * BOSS_FIRST.length)]} ${BOSS_TITLES[Math.floor(rng() * BOSS_TITLES.length)]}`;
  return { name, classId: CLASS_IDS[Math.floor(rng() * CLASS_IDS.length)], budget: Math.round(totalPoints(s) * 1.04 + 4), tier: 1, skillN: s.skills.length + 1, accepted: false };
}

export const encounterSpec = (e: Encounter): FighterSpec => ({ ...specFromBudget(e.classId, e.budget, e.tier, e.name, 'aggressive'), boss: true, skills: enemySkills(e.classId, e.budget, nameKey(e.name), true, e.skillN) });

export function acceptEncounter(s: Save) { if (s.encounter) s.encounter.accepted = true; }

export function declineEncounter(s: Save): string {
  const e = s.encounter;
  if (!e) return '';
  const rng = actionRng(s, 'decline');
  delete s.encounter;
  return `You refuse ${e.name}. ${dropRank(s, rng() < 0.6 ? 1 : 2)}`;
}

/** Random perks for a piece of gear, no duplicates. */
export function pickPerks(slot: 'weapon' | 'armor', n: number, rng: () => number): string[] {
  const pool = [...PERKS[slot]];
  const out: string[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/** Gold has a use late in a run: a master trainer sells stat points at a rising price. */
export const trainerCost = (s: { trainerBuys: number }) => 90 + 14 * s.trainerBuys;
export function hireTrainer(s: Save): string {
  const cost = trainerCost(s);
  if (s.gold < cost) return `The trainer wants ${cost} gold.`;
  s.gold -= cost; s.trainerBuys++; s.unspent += 2;
  return 'A master trainer drills you hard: +2 stat points to spend.';
}

export function learnSkill(s: Save, id: string): string {
  const err = canLearn(s.skills, s.skillPoints, id, s.classId);
  if (err) return err;
  s.skillPoints -= SKILLS[id].cost;
  s.skills.push(id);
  return `Learned ${SKILLS[id].name}.`;
}

// ---- loot ---------------------------------------------------------------------------------------
const progress = (s: Save) => (s.career ? (s.career.champion ? 1 : Math.min(1, s.career.beaten / s.career.size)) : Math.min(1, s.wins / 30));

/** The higher you stand in the rankings, the better the rarity; infamous challengers always drop above your standing. */
export function rollTier(s: Save, rng: () => number, boss: boolean): number {
  const center = Math.min(MAX_TIER, progress(s) * MAX_TIER + (boss ? 0.8 : 0));
  const w = [0, 1, 2, 3, 4].map((t) => Math.exp(-((t - center) ** 2) / 1.1));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let t = 0; t <= MAX_TIER; t++) { x -= w[t]; if (x <= 0) return t; }
  return MAX_TIER;
}

function grantLoot(s: Save, bossName: string, rng: () => number, text: string[]) {
  const tier = rollTier(s, rng, true);
  const slot: 'weapon' | 'armor' = s.weaponTier < s.armorTier ? 'weapon' : s.armorTier < s.weaponTier ? 'armor' : rng() < 0.5 ? 'weapon' : 'armor';
  const cur = slot === 'weapon' ? s.weaponTier : s.armorTier;
  const first = bossName.split(' ')[0];
  const label = slot === 'weapon' ? `${RARITIES[tier]} ${WEAPONS[CLASSES[s.classId].weapon].name} of ${first}` : `${RARITIES[tier]} Armor of ${first}`;
  if (tier > cur) {
    if (slot === 'weapon') { s.weaponTier = tier; s.gear.weapon = 100; } else { s.armorTier = tier; for (const z of ZONES) s.gear.armor[z] = 100; }
    (s.loot ??= {})[slot] = label;
    s.perks[slot] = pickPerks(slot, [0, 0, 1, 2, 3][tier], rng);
    const pk = s.perks[slot].map((p) => SKILLS[p].name).join(', ');
    text.push(`Loot: ${label}${pk ? ` (${pk})` : ''}, equipped!`);
  } else {
    const gold = 50 * (tier + 1);
    s.gold += gold;
    text.push(`Spoils: ${label} is no better than your gear. You sell it for ${gold} gold.`);
  }
}

// ---- gear wear ----------------------------------------------------------------------
/** Durability 0-100 per item. Armor wears per zone, where you actually get hit. */
export interface Gear { weapon: number; shield: number; armor: Record<Zone, number> }
export const freshGear = (): Gear => ({ weapon: 100, shield: 100, armor: { head: 100, torso: 100, armW: 100, armS: 100, legL: 100, legR: 100 } });
export const WEAR = { weapon: 0.6, bash: 1.5, shieldBlock: 1.3, shieldDmg: 0.3, armorPerDmg: 0.75 };
export const REPAIR = { weapon: 0.5, shield: 0.35, armor: 0.2 };   // gold per missing durability point
/** Full strength above 60% durability, fading to 55% strength as it nears breaking. */
export const wearMod = (d: number) => (d >= 60 ? 1 : 0.55 + 0.45 * (d / 60));

const ZONE_LABEL: Record<Zone, string> = { head: 'head', torso: 'torso', armW: 'weapon-arm', armS: 'shield-arm', legL: 'left-leg', legR: 'right-leg' };
const MELEE = new Set(['light', 'heavy', 'hook', 'whirl', 'cleave']);

function applyWear(s: Save, r: FightResult, text: string[]) {
  const g = s.gear;
  const before = { weapon: g.weapon, shield: g.shield, armor: { ...g.armor } };
  for (const e of r.events) {
    if (e.actor === 0) {
      if (!e.action || !['hit', 'crit', 'blocked'].includes(e.result)) continue;
      if (e.action === 'bash') g.shield = Math.max(0, g.shield - WEAR.bash);
      else if (MELEE.has(e.action)) g.weapon = Math.max(0, g.weapon - WEAR.weapon);
    } else if (e.targetZone && e.damage) {
      if (e.result === 'blocked') g.shield = Math.max(0, g.shield - (WEAR.shieldBlock + e.damage * WEAR.shieldDmg));
      else if (e.result === 'hit' || e.result === 'crit') g.armor[e.targetZone] = Math.max(0, g.armor[e.targetZone] - e.damage * WEAR.armorPerDmg);
    }
  }
  const note = (was: number, now: number, what: string) => {
    if (was > 0 && now <= 0) text.push(`Your ${what} broke!`);
    else if (was >= 30 && now < 30) text.push(`Your ${what} is badly worn.`);
  };
  note(before.weapon, g.weapon, 'weapon');
  if (CLASSES[s.classId].shield) note(before.shield, g.shield, 'shield');
  for (const z of ZONES) note(before.armor[z], g.armor[z], `${ZONE_LABEL[z]} armor`);
}

export interface GearView { weapon: number; shield: number | null; armor: number; worn: string[] }
export function gearCondition(s: Save): GearView {
  const g = s.gear;
  return {
    weapon: g.weapon,
    shield: CLASSES[s.classId].shield ? g.shield : null,
    armor: ZONES.reduce((a, z) => a + g.armor[z], 0) / ZONES.length,
    worn: ZONES.filter((z) => g.armor[z] < 40).map((z) => `${ZONE_LABEL[z]} ${g.armor[z] <= 0 ? 'broken' : Math.round(g.armor[z]) + '%'}`),
  };
}

export type RepairKind = 'weapon' | 'shield' | 'armor' | 'all';
export function repairCost(s: Save, kind: RepairKind): number {
  const g = s.gear;
  const c = {
    weapon: Math.ceil((100 - g.weapon) * REPAIR.weapon),
    shield: CLASSES[s.classId].shield ? Math.ceil((100 - g.shield) * REPAIR.shield) : 0,
    armor: Math.ceil(ZONES.reduce((a, z) => a + 100 - g.armor[z], 0) * REPAIR.armor),
  };
  return kind === 'all' ? c.weapon + c.shield + c.armor : c[kind];
}
export function repair(s: Save, kind: RepairKind): string {
  const cost = repairCost(s, kind);
  if (cost <= 0) return 'Nothing to repair.';
  if (s.gold < cost) return `Repairs cost ${cost} gold.`;
  s.gold -= cost;
  if (kind === 'weapon' || kind === 'all') s.gear.weapon = 100;
  if (kind === 'shield' || kind === 'all') s.gear.shield = 100;
  if (kind === 'armor' || kind === 'all') for (const z of ZONES) s.gear.armor[z] = 100;
  return `Repaired for ${cost} gold.`;
}

// ---- local leaderboard -----------------------------------------------------------------
export interface ScoreRow { mode: string; name: string; classId: ClassId; score: number; date: number }
const SCORE_KEY = 'coliseum.scores.v1';
export const modeKey = (s: Save) => (s.mode === 'career' ? `career-${s.career?.size ?? 10}` : `free-${s.difficulty}`);
export function loadScores(): ScoreRow[] {
  try { const t = localStorage.getItem(SCORE_KEY); return t ? (JSON.parse(t) as ScoreRow[]) : []; } catch { return []; }
}
export function recordScore(s: Save) {
  if (s.recorded) return;
  s.recorded = true;
  try {
    const rows = loadScores();
    rows.push({ mode: modeKey(s), name: s.name, classId: s.classId, score: score(s), date: Date.now() });
    rows.sort((a, b) => b.score - a.score);
    localStorage.setItem(SCORE_KEY, JSON.stringify(rows.slice(0, 60)));
  } catch { /* no storage (tests, private mode) */ }
}

export const runBout = (b: Bout): FightResult => simulateFight(b.player, b.enemy, b.seed);

// ---- persistence ---------------------------------------------------------------------
const KEY = 'coliseum.save.v1';
export const saveGame = (s: Save) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
export function loadGame(): Save | null {
  try {
    const t = localStorage.getItem(KEY);
    const s = t ? (JSON.parse(t) as Save) : null;
    if (s && s.v === 1) {
      s.mode ??= 'free';
      s.gear ??= freshGear();
      s.added.spi ??= 0;
      s.news ??= []; s.sick ??= 0; s.bedridden ??= 0; s.runSeed ??= 1; s.neglect ??= 0; s.skills ??= []; s.skillPoints ??= 0; s.trainerBuys ??= 0; s.perks ??= { weapon: [], armor: [] };
      if (s.career && !s.career.prelim) { s.career.prelim = []; s.career.prelimWins = 0; s.career.size ??= s.career.ladder.length; }
      return s;
    }
    return null;
  } catch { return null; }
}
export const clearSave = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
