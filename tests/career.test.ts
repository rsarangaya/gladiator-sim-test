import { describe, expect, it } from 'vitest';
import {
  CAREER_SIZES, PRELIMS, WAIT_COST, inPrelims, ladderBudgets, ladderRank, newGame, prepareBout, rest, runBout, score,
  settleBout, waitDay, type Save,
} from '../src/game/state';

const career = (size = 10) => newGame('Tester', 'thraex', 'normal', { str: 4, agi: 4, tec: 4 }, 'career', 99, size);
function play(s: Save, seed: number, winner: 0 | 1, method: 'yield' | 'death' = 'yield') {
  const b = prepareBout(s, seed);
  const r = { ...runBout(b), winner, method };
  return { b, out: settleBout(s, b, r) };
}
const qualify = (s: Save) => { let i = 0; while (inPrelims(s.career!)) play(s, 900 + i++, 0); };

describe('career mode', () => {
  it('offers top 10, 15 and 20 ladders with rising strength', () => {
    for (const size of CAREER_SIZES) {
      const s = career(size);
      expect(s.career!.size).toBe(size);
      expect(s.career!.ladder).toHaveLength(size);
      const budgets = s.career!.ladder.map((o) => o.budget);
      expect([...budgets].sort((a, b) => a - b)).toEqual(budgets);
      expect(budgets).toEqual(ladderBudgets(size));
      const names = [...s.career!.prelim, ...s.career!.ladder].map((o) => o.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('the player starts unranked and must win qualifiers first', () => {
    for (const size of CAREER_SIZES) {
      const s = career(size);
      expect(s.career!.prelim).toHaveLength(PRELIMS[size]);
      expect(inPrelims(s.career!)).toBe(true);
      const first = prepareBout(s, 1);
      expect(first.label).toMatch(/Qualifier 1 of/);
      expect(first.enemy.name).toBe(s.career!.prelim[0].name);
      // qualifiers are weaker than the first ranked fighter
      expect(s.career!.prelim[s.career!.prelim.length - 1].budget).toBeLessThanOrEqual(s.career!.ladder[0].budget);
    }
  });

  it('losing a qualifier does not progress, winning all of them opens the ladder at the bottom rank', () => {
    const s = career(15);
    play(s, 1, 1);
    expect(s.career!.prelimWins).toBe(0);
    qualify(s);
    expect(inPrelims(s.career!)).toBe(false);
    expect(s.career!.beaten).toBe(0);
    expect(score(s)).toBe(0);
    expect(ladderRank(s)).toBe(15);
    expect(prepareBout(s, 5).label).toMatch(/rank 15/);
  });

  it('fights the ladder in order and becomes champion after beating every rank', () => {
    const s = career(10);
    qualify(s);
    for (let i = 0; i < 10; i++) {
      expect(prepareBout(s, i + 1).enemy.name).toBe(s.career!.ladder[i].name);
      play(s, i + 1, 0);
    }
    expect(s.career!.champion).toBe(true);
    expect(score(s)).toBe(10);
  });

  it('a bigger field takes more wins to reach the top', () => {
    const s = career(20);
    qualify(s);
    for (let i = 0; i < 19; i++) play(s, 50 + i, 0);
    expect(s.career!.champion).toBe(false);
    play(s, 99, 0);
    expect(s.career!.champion).toBe(true);
    expect(score(s)).toBe(20);
  });

  it('losing a ladder fight drops you a rank', () => {
    const s = career();
    qualify(s);
    play(s, 20, 0); play(s, 21, 0); play(s, 22, 0);
    expect(s.career!.beaten).toBe(3);
    const { out } = play(s, 23, 1);
    expect(out.text.join(' ')).toMatch(/slip back/);
    expect(s.career!.beaten).toBe(2);
  });

  it('a loss on the ladder is survivable, a loss as champion ends the run', () => {
    const s = career();
    qualify(s);
    play(s, 1, 1);
    expect(s.alive).toBe(true);
    expect(s.career!.beaten).toBe(0);
    expect(inPrelims(s.career!)).toBe(true); // falling off the bottom sends you back to a qualifier
    qualify(s);
    for (let i = 0; i < 10; i++) play(s, 10 + i, 0);
    play(s, 50, 0);
    expect(s.career!.defenses).toBe(1);
    expect(score(s)).toBe(11);
    const { out } = play(s, 51, 1);
    expect(out.won).toBe(false);
    expect(s.alive).toBe(false);
  });

  it('death ends the run at any stage', () => {
    const s = career();
    play(s, 3, 1, 'death');
    expect(s.alive).toBe(false);
  });

  it('maims are permanent in career but bruises and wounds heal', () => {
    const s = career();
    s.injuries.legL = 'maimed'; s.injuries.armS = 'bruised'; s.injuries.head = 'wounded'; s.gold = 100;
    rest(s);
    expect(s.injuries.legL).toBe('maimed');
    expect(s.injuries.armS).toBeUndefined();
    expect(s.injuries.head).toBeUndefined();
  });

  it('waiting a day costs gold and refills energy', () => {
    const s = career();
    s.energy = 0; s.gold = WAIT_COST;
    waitDay(s);
    expect(s.energy).toBe(3);
    expect(s.gold).toBe(0);
    expect(waitDay(s)).toMatch(/costs/);
  });
});
