import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EVENTS, acceptEncounter, declineEncounter, dropRank, inPrelims, injurySeverity, ladderBudgets, newDay, newGame, prepareBout,
  rest, rollTier, runBout, settleBout, totalPoints, train, type Save,
} from '../src/game/state';
import { mulberry32 } from '../src/sim';

beforeAll(() => { EVENTS.enabled = true; });
afterAll(() => { EVENTS.enabled = false; });

const career = (size = 10) => {
  const s = newGame('T', 'thraex', 'normal', { str: 4, agi: 4, tec: 4 }, 'career', 77, size);
  s.career!.prelimWins = s.career!.prelim.length; // skip qualifiers
  return s;
};
/** advance days until a condition holds (days differ, so each roll uses a different random stream) */
function until(s: Save, cond: (s: Save) => boolean, max = 400) {
  for (let i = 0; i < max && !cond(s); i++) { s.fights = Math.max(s.fights, 5); newDay(s); }
  return cond(s);
}

describe('rank drops', () => {
  it('career: slips down the ladder, champions lose the title, free mode loses gold', () => {
    const s = career();
    s.career!.beaten = 5;
    expect(dropRank(s, 2)).toMatch(/rank 7/);
    expect(s.career!.beaten).toBe(3);
    s.career!.beaten = 10; s.career!.champion = true;
    expect(dropRank(s, 1)).toMatch(/stripped/);
    expect(s.career!.champion).toBe(false);
    expect(s.career!.beaten).toBe(9);
    s.career!.beaten = 0;
    dropRank(s, 2);
    expect(s.career!.beaten).toBe(0); // never below the bottom
    const f = newGame('F', 'brute', 'normal'); f.gold = 200;
    expect(dropRank(f, 1)).toMatch(/gold/);
    expect(f.gold).toBeLessThan(200);
  });
});

describe('random events', () => {
  it('badly injured fighters can collapse with infection: laid up, ranking drops, then recover', () => {
    const s = career();
    s.career!.beaten = 4;
    s.injuries = { torso: 'wounded', head: 'wounded', legL: 'wounded' };
    expect(injurySeverity(s)).toBeGreaterThanOrEqual(4);
    expect(until(s, (x) => x.bedridden > 0)).toBe(true);
    expect(s.energy).toBe(0);
    expect(s.career!.beaten).toBeLessThan(4);
    newDay(s); newDay(s);
    expect(s.bedridden).toBe(0);
    expect(s.energy).toBeGreaterThan(0);
    expect(s.injuries.torso).toBeUndefined(); // bed rest healed the wounds
  });

  it('healthy fighters never get infections, and sickness costs energy until rest cures it', () => {
    const s = career();
    for (let i = 0; i < 150; i++) { s.fights = 5; newDay(s); expect(s.bedridden).toBe(0); if (s.sick > 0) break; }
    expect(until(s, (x) => x.sick > 0)).toBe(true);
    expect(s.energy).toBeLessThan(3);
    s.gold = 100; s.energy = 2;
    rest(s);
    expect(s.sick).toBe(0);
  });

  it('events happen on a minority of days, not every day', () => {
    const s = career();
    let withNews = 0;
    for (let i = 0; i < 200; i++) { s.fights = 5; delete s.encounter; newDay(s); if (s.news.length) withNews++; }
    expect(withNews).toBeGreaterThan(10);
    expect(withNews).toBeLessThan(110);
  });

  it('training can cause a minor injury now and then', () => {
    const s = newGame('T', 'brute', 'normal');
    let hurt = 0;
    for (let i = 0; i < 300; i++) { s.energy = 3; s.injuries = {}; train(s, 'str', mulberry32(i + 1)); if (Object.keys(s.injuries).length) hurt++; }
    expect(hurt).toBeGreaterThan(5);
    expect(hurt).toBeLessThan(60);
  });
});

describe('infamous challengers', () => {
  it('appear after a few fights, never while unranked, and are stronger than the next rival', () => {
    const q = newGame('Q', 'thraex', 'normal', {}, 'career', 5);
    for (let i = 0; i < 100; i++) { q.fights = 9; newDay(q); }
    expect(q.encounter).toBeUndefined(); // still in the qualifiers
    const s = career();
    expect(until(s, (x) => !!x.encounter)).toBe(true);
    const e = s.encounter!;
    expect(e.budget).toBeGreaterThan(totalPoints(s));
    expect(inPrelims(s.career!)).toBe(false);
  });

  it('accepting makes the next bout the boss; winning drops loot and leaves ladder progress alone', () => {
    const s = career();
    until(s, (x) => !!x.encounter);
    const name = s.encounter!.name;
    const beaten = s.career!.beaten;
    acceptEncounter(s);
    const b = prepareBout(s, 11);
    expect(b.enemy.boss).toBe(true);
    expect(b.enemy.name).toBe(name);
    expect(b.label).toMatch(/Infamous/);
    const out = settleBout(s, b, { ...runBout(b), winner: 0, method: 'yield' });
    expect(out.text.join(' ')).toMatch(/Loot|Spoils/);
    expect(s.encounter?.accepted ?? false).toBe(false); // that challenge is over (a new one may arrive later)
    expect(s.career!.beaten).toBe(beaten);
  });

  it('losing to a boss does not end a champions reign', () => {
    const s = career();
    s.career!.beaten = 10; s.career!.champion = true;
    until(s, (x) => !!x.encounter);
    acceptEncounter(s);
    const b = prepareBout(s, 12);
    settleBout(s, b, { ...runBout(b), winner: 1, method: 'yield' });
    expect(s.alive).toBe(true);
    expect(s.career!.champion).toBe(true);
  });

  it('declining costs 1 or 2 ranks in career and gold in free mode', () => {
    const s = career();
    s.career!.beaten = 6;
    until(s, (x) => !!x.encounter);
    const before = s.career!.beaten;
    const text = declineEncounter(s);
    expect(text).toMatch(/refuse/);
    expect(before - s.career!.beaten).toBeGreaterThanOrEqual(1);
    expect(before - s.career!.beaten).toBeLessThanOrEqual(2);
    expect(s.encounter).toBeUndefined();
    const f = newGame('F', 'brute', 'normal'); f.gold = 300;
    until(f, (x) => !!x.encounter);
    const g = f.gold;
    declineEncounter(f);
    expect(f.gold).toBeLessThan(g);
  });
});

describe('loot rarity', () => {
  it('rises with ranking progress', () => {
    const avg = (beaten: number) => {
      const s = career(); s.career!.beaten = beaten;
      let sum = 0; const N = 400; const rng = mulberry32(3);
      for (let i = 0; i < N; i++) sum += rollTier(s, rng, true);
      return sum / N;
    };
    const low = avg(0), mid = avg(5), high = avg(9);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(ladderBudgets(10)).toHaveLength(10);
  });
});
