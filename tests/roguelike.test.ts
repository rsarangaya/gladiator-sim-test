import { describe, expect, it } from 'vitest';
import { actionRng, newGame, openBout, runBout, settleBout, train } from '../src/game/state';

describe('roguelike save rules', () => {
  it('an entered fight is fixed: reopening returns the same seed and opponent', () => {
    const s = newGame('p', 'thraex', 'normal', {}, 'career', 5);
    const a = openBout(s);
    const saved = JSON.parse(JSON.stringify(s)); // what a reload reads back
    const b = openBout(saved);
    expect(b.seed).toBe(a.seed);
    expect(b.enemy.name).toBe(a.enemy.name);
    expect(JSON.stringify(runBout(b))).toBe(JSON.stringify(runBout(a)));
  });

  it('settling a fight clears the pending fight so the next one is new', () => {
    const s = newGame('p', 'thraex', 'normal', {}, 'career', 5);
    const a = openBout(s);
    expect(s.pending).toBeDefined();
    settleBout(s, a, runBout(a));
    expect(s.pending).toBeUndefined();
  });

  it('training results cannot be rerolled by reloading', () => {
    const s = newGame('p', 'murmillo', 'normal');
    const reload = JSON.parse(JSON.stringify(s));
    train(s, 'str', actionRng(s, 'str'));
    train(reload, 'str', actionRng(reload, 'str'));
    expect(reload.added).toEqual(s.added);
    expect(reload.energy).toBe(s.energy);
  });
});
