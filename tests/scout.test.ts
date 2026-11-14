import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENTS, boutSeed, estimateOdds, newDay, newGame, openBout, rest, scout } from '../src/game/state';

describe('scouting and choice', () => {
  it('free mode offers three opponents once the tutorial is done, tougher ones pay more and have worse odds', () => {
    const s = newGame('p', 'thraex', 'normal', { str: 4, vit: 4, tec: 4 }, 'free', 3);
    expect(scout(s)).toHaveLength(1); // tutorial: no choice
    s.tutorialDone = true; s.fights = 5;
    const c = scout(s);
    expect(c).toHaveLength(3);
    expect(c[0].bout.reward).toBeLessThan(c[1].bout.reward);
    expect(c[2].bout.reward).toBeGreaterThan(c[1].bout.reward);
    expect(c[0].odds).toBeGreaterThan(c[2].odds);
    for (const x of c) { expect(x.odds).toBeGreaterThanOrEqual(0); expect(x.odds).toBeLessThanOrEqual(1); }
  });

  it('career and boss fights have a single scouted opponent', () => {
    const s = newGame('p', 'thraex', 'normal', {}, 'career', 4);
    expect(scout(s)).toHaveLength(1);
  });

  it('scouting is stable: same state shows the same opponents and odds', () => {
    const s = newGame('p', 'murmillo', 'normal', {}, 'free', 9); s.tutorialDone = true; s.fights = 4;
    const a = scout(s), b = scout(JSON.parse(JSON.stringify(s)));
    expect(a.map((x) => x.bout.enemy.name)).toEqual(b.map((x) => x.bout.enemy.name));
    expect(a.map((x) => x.odds)).toEqual(b.map((x) => x.odds));
    expect(estimateOdds(a[1].bout.player, a[1].bout.enemy)).toBe(a[1].odds);
  });

  it('the fight seed depends only on the run and fight number, not on gold or training', () => {
    const s = newGame('p', 'brute', 'normal', {}, 'free', 11);
    const seed = boutSeed(s);
    s.gold += 500; s.added.str += 3; s.energy = 0;
    expect(boutSeed(s)).toBe(seed);
    s.fights++;
    expect(boutSeed(s)).not.toBe(seed);
  });

  it('the chosen pick is saved with the fight', () => {
    const s = newGame('p', 'brute', 'normal', {}, 'free', 12); s.tutorialDone = true;
    const b = openBout(s, 2);
    expect(s.pending!.pick).toBe(2);
    expect(openBout(s, 0).enemy.name).toBe(b.enemy.name); // later calls cannot change a committed pick
  });
});

describe('infection needs neglect', () => {
  beforeAll(() => { EVENTS.enabled = true; });
  afterAll(() => { EVENTS.enabled = false; });
  it('resting every day prevents infection even when badly hurt', () => {
    const s = newGame('p', 'brute', 'normal', {}, 'career', 5);
    s.career!.prelimWins = s.career!.prelim.length;
    for (let i = 0; i < 120; i++) {
      s.injuries = { torso: 'wounded', head: 'wounded', legL: 'wounded', armW: 'maimed' };
      s.energy = 3; s.gold = 100; rest(s);
      newDay(s);
      expect(s.bedridden).toBe(0);
    }
  });
});
