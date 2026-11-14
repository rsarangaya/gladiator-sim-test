import { describe, expect, it } from 'vitest';
import {
  buyTier, gearCondition, newGame, playerSpec, prepareBout, repair, repairCost, runBout, settleBout, wearMod,
} from '../src/game/state';
import { ZONES } from '../src/sim';

const fight = (s: ReturnType<typeof newGame>, seed: number) => {
  const b = prepareBout(s, seed);
  const r = runBout(b);
  return settleBout(s, b, r);
};

describe('gear wear', () => {
  it('starts at full durability and fights wear it down', () => {
    const s = newGame('p', 'murmillo', 'normal');
    expect(s.gear.weapon).toBe(100);
    for (let i = 0; i < 4; i++) { s.alive = true; fight(s, i + 1); }
    expect(s.gear.weapon).toBeLessThan(100);
    expect(s.gear.shield).toBeLessThan(100);
    expect(ZONES.some((z) => s.gear.armor[z] < 100)).toBe(true);
  });

  it('wears more where you are hit and never below zero', () => {
    const s = newGame('p', 'thraex', 'normal');
    for (let i = 0; i < 60; i++) { s.alive = true; fight(s, i + 7); }
    for (const z of ZONES) expect(s.gear.armor[z]).toBeGreaterThanOrEqual(0);
    expect(s.gear.weapon).toBeGreaterThanOrEqual(0);
    const g = gearCondition(s);
    expect(g.weapon).toBe(s.gear.weapon);
  });

  it('worn gear is weaker and broken gear is unusable', () => {
    const s = newGame('p', 'murmillo', 'normal');
    const fresh = playerSpec(s);
    s.gear.weapon = 20; s.gear.armor.torso = 20; s.gear.shield = 20;
    const worn = playerSpec(s);
    expect(worn.weapon.dmg).toBeLessThan(fresh.weapon.dmg);
    expect(worn.armor.torso).toBeLessThan(fresh.armor.torso);
    expect(worn.shield!.absorb).toBeLessThan(fresh.shield!.absorb);
    s.gear.weapon = 0; s.gear.shield = 0; s.gear.armor.torso = 0;
    const broken = playerSpec(s);
    expect(broken.weapon.name).toBe('Bare Hands');
    expect(broken.shield).toBeUndefined();
    expect(broken.armor.torso).toBe(0);
    expect(wearMod(100)).toBe(1);
    expect(wearMod(0)).toBeCloseTo(0.6);
  });

  it('repairs cost gold and restore durability; upgrades arrive in perfect condition', () => {
    const s = newGame('p', 'murmillo', 'normal');
    s.gear.weapon = 40; s.gear.shield = 60; s.gear.armor.head = 50;
    const all = repairCost(s, 'all');
    expect(all).toBeGreaterThan(0);
    s.gold = all - 1;
    expect(repair(s, 'all')).toMatch(/cost/);
    expect(s.gear.weapon).toBe(40);
    s.gold = all + 5;
    expect(repair(s, 'all')).toMatch(/Repaired/);
    expect(s.gear.weapon).toBe(100);
    expect(s.gear.armor.head).toBe(100);
    expect(s.gold).toBe(5);
    s.gear.weapon = 10; s.gold = 500;
    buyTier(s, 'weapon');
    expect(s.gear.weapon).toBe(100);
  });

  it('classes without a shield have no shield condition', () => {
    const s = newGame('p', 'brute', 'normal');
    expect(gearCondition(s).shield).toBeNull();
    expect(repairCost(s, 'shield')).toBe(0);
  });
});
