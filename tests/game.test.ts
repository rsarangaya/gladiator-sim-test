import { describe, expect, it } from 'vitest';
import { buyTier, carriedLoss, newGame, prepareBout, rest, runBout, settleBout, spendPoint, stats, train } from '../src/game/state';
import { mulberry32 } from '../src/sim';

describe('game loop', () => {
  it('creation caps allocation at the starting points', () => {
    const s = newGame('x', 'brute', 'normal', { str: 8, agi: 8 });
    expect(s.unspent + Object.values(s.added).reduce((a, b) => a + b, 0)).toBe(12);
  });

  it('tutorial fight is winnable almost always', () => {
    let wins = 0;
    for (let i = 0; i < 100; i++) {
      const s = newGame('p', 'thraex', 'normal', { str: 3, agi: 3, vit: 3, tec: 3 });
      const b = prepareBout(s, i * 7919 + 1);
      if (runBout(b).winner === 0) wins++;
    }
    expect(wins).toBeGreaterThan(80);
  });

  it('training costs energy and rest heals maims on normal but not hard', () => {
    const s = newGame('p', 'murmillo', 'normal');
    const before = stats(s).str;
    expect(train(s, 'str', mulberry32(1))).toMatch(/Training/);
    expect(stats(s).str).toBeGreaterThan(before);
    expect(s.energy).toBe(2);
    s.injuries.legL = 'maimed'; s.gold = 100;
    rest(s);
    expect(s.injuries.legL).toBeUndefined();
    const h = newGame('p', 'murmillo', 'hard');
    h.injuries.legL = 'maimed'; h.gold = 100;
    rest(h);
    expect(h.injuries.legL).toBe('maimed');
  });

  it('injuries reduce next fight hp; shop and points work', () => {
    const s = newGame('p', 'brute', 'normal');
    s.injuries.armW = 'maimed';
    expect(carriedLoss(s).armW).toBeGreaterThan(0);
    s.gold = 500;
    expect(buyTier(s, 'armor')).toMatch(/Bought/);
    s.unspent = 1;
    expect(spendPoint(s, 'vit')).toBe(true);
    expect(spendPoint(s, 'vit')).toBe(false);
  });

  it('a won bout pays out and refills energy; a lost-by-death bout ends the run', () => {
    const s = newGame('p', 'brute', 'normal');
    const b = prepareBout(s, 5);
    const r = runBout(b);
    const fake = { ...r, winner: 0 as const, method: 'death' as const };
    settleBout(s, b, fake);
    expect(s.wins).toBe(1);
    expect(s.energy).toBe(3);
    const dead = { ...r, winner: 1 as const, method: 'death' as const };
    settleBout(s, b, dead);
    expect(s.alive).toBe(false);
  });
});
