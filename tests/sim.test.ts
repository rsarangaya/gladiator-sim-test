import { describe, expect, it } from 'vitest';
import { CLASS_IDS, makeSpec, simulateFight, ZONES } from '../src/sim';

describe('determinism', () => {
  it('same seed + fighters gives an identical event log', () => {
    const a = simulateFight(makeSpec('thraex'), makeSpec('brute'), 42);
    const b = simulateFight(makeSpec('thraex'), makeSpec('brute'), 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('different seeds diverge', () => {
    const a = simulateFight(makeSpec('thraex'), makeSpec('brute'), 1);
    const b = simulateFight(makeSpec('thraex'), makeSpec('brute'), 2);
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
  });
  it('logging does not change the outcome', () => {
    const a = simulateFight(makeSpec('retiarius'), makeSpec('murmillo'), 7, { log: true });
    const b = simulateFight(makeSpec('retiarius'), makeSpec('murmillo'), 7, { log: false });
    expect([a.winner, a.method, a.ticks]).toEqual([b.winner, b.method, b.ticks]);
  });
});

describe('invariants', () => {
  it('every fight terminates, hp never negative, ticks advance', () => {
    for (const x of CLASS_IDS) for (const y of CLASS_IDS) for (let s = 0; s < 20; s++) {
      const r = simulateFight(makeSpec(x), makeSpec(y), s * 7919 + 3, { log: false });
      expect(r.ticks).toBeGreaterThan(0);
      expect(['death', 'yield', 'cap']).toContain(r.method);
      for (const side of [0, 1] as const) for (const z of ZONES) expect(r.finalHp[side][z]).toBeGreaterThanOrEqual(0);
    }
  });
  it('a death means torso or head hit zero', () => {
    for (let s = 0; s < 200; s++) {
      const r = simulateFight(makeSpec('brute'), makeSpec('dimachaerus'), s, { log: false });
      if (r.method !== 'death') continue;
      const dead = [0, 1].filter((i) => r.finalHp[i as 0 | 1].torso <= 0 || r.finalHp[i as 0 | 1].head <= 0);
      expect(dead.length).toBeGreaterThan(0);
    }
  });
});

describe('resolution', () => {
  it('higher level beats lower level most of the time', () => {
    let w = 0;
    for (let s = 0; s < 100; s++) {
      const r = simulateFight(makeSpec('thraex', 5), makeSpec('thraex', 1), s, { log: false });
      if (r.winner === 0) w++;
    }
    expect(w).toBeGreaterThan(80);
  });
  it('heavy armor reduces damage taken per second', () => {
    const naked = makeSpec('murmillo');
    for (const z of ZONES) naked.armor[z] = 0;
    let armored = 0, bare = 0;
    for (let s = 0; s < 150; s++) {
      { const r = simulateFight(makeSpec('brute'), makeSpec('murmillo'), s, { log: false }); armored += r.damageDealt[0] / r.ticks; }
      { const r = simulateFight(makeSpec('brute'), naked, s, { log: false }); bare += r.damageDealt[0] / r.ticks; }
    }
    expect(bare).toBeGreaterThan(armored);
  });
});
