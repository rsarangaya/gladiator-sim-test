import { describe, expect, it } from 'vitest';
import { inPrelims, newGame, openBout, runBout, scout, settleBout, type Save } from '../src/game/state';

const ranked = () => {
  const s = newGame('p', 'thraex', 'normal', { str: 4, agi: 4, tec: 4 }, 'career', 21, 10);
  s.career!.prelimWins = s.career!.prelim.length;
  s.fights = 5;
  return s;
};
const fight = (s: Save, pick: number, winner: 0 | 1) => {
  const b = openBout(s, pick);
  return { b, out: settleBout(s, b, { ...runBout(b), winner, method: 'yield' }) };
};

describe('sparring (breaks rematch loops)', () => {
  it('career offers the ladder fight plus a safer sparring match, but not during qualifiers', () => {
    const q = newGame('p', 'thraex', 'normal', {}, 'career', 22);
    expect(inPrelims(q.career!)).toBe(true);
    expect(scout(q)).toHaveLength(1);
    const s = ranked();
    const c = scout(s);
    expect(c).toHaveLength(2);
    expect(c[0].bout.spar).toBeFalsy();
    expect(c[1].bout.spar).toBe(true);
    expect(c[1].bout.reward).toBeLessThan(1);
    expect(c[1].odds).toBeGreaterThanOrEqual(c[0].odds);
  });

  it('winning a sparring match pays and grants xp but never moves the ranking', () => {
    const s = ranked();
    const gold = s.gold, xp = s.xp;
    const { out } = fight(s, 0, 0);
    expect(out.text.join(' ')).toMatch(/practice/);
    expect(s.career!.beaten).toBe(0);
    expect(s.xp).toBe(xp + 1);
    expect(s.gold).toBeGreaterThan(gold);
  });

  it('losing a sparring match as champion does not cost the title', () => {
    const s = ranked();
    s.career!.beaten = 10; s.career!.champion = true;
    fight(s, 0, 1);
    expect(s.alive).toBe(true);
    expect(s.career!.champion).toBe(true);
  });

  it('free mode keeps its three-way choice', () => {
    const s = newGame('p', 'thraex', 'normal', {}, 'free', 23); s.tutorialDone = true; s.fights = 4;
    expect(scout(s)).toHaveLength(3);
  });
});
