import { describe, expect, it } from 'vitest';
import { NEUTRAL, SKILLS, canLearn, compileMods, enemySkills, nameKey, skillsFor } from '../src/data/skills';
import { hireTrainer, learnSkill, newGame, trainerCost, pickPerks, playerSpec, prepareBout, runBout, settleBout } from '../src/game/state';
import { CLASS_IDS, makeSpec, mulberry32, simulateFight } from '../src/sim';

describe('skills', () => {
  it('start neutral, and each skill changes something', () => {
    expect(compileMods([])).toEqual(NEUTRAL);
    for (const s of Object.values(SKILLS)) expect(compileMods([s.id])).not.toEqual(NEUTRAL);
  });

  it('every class has three class skills that chain, plus the common list', () => {
    for (const c of CLASS_IDS) {
      const { common, tree } = skillsFor(c);
      expect(tree).toHaveLength(3);
      expect(tree[1].req).toBe(tree[0].id);
      expect(tree[2].req).toBe(tree[1].id);
      expect(common.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('learning needs points, the prerequisite, and the right class', () => {
    expect(canLearn([], 5, 'bashm', 'murmillo')).toMatch(/Requires/);
    expect(canLearn([], 0, 'tough', 'thraex')).toMatch(/Needs/);
    expect(canLearn([], 5, 'bulwark', 'thraex')).toMatch(/another class/);
    expect(canLearn(['tough'], 5, 'tough', 'thraex')).toMatch(/Already/);
    expect(canLearn([], 5, 'tough', 'thraex')).toBeNull();
    const s = newGame('p', 'murmillo', 'normal');
    expect(s.skillPoints).toBe(2);
    expect(learnSkill(s, 'bulwark')).toMatch(/Learned/);
    expect(s.skillPoints).toBe(1);
    expect(learnSkill(s, 'riposte')).toMatch(/Requires|Needs/);
    expect(s.skills).toEqual(['bulwark']);
  });

  it('level-ups award a skill point', () => {
    const s = newGame('p', 'brute', 'normal', {}, 'free', 4); s.xp = 2; s.tutorialDone = true;
    const b = prepareBout(s, 1);
    const before = s.skillPoints;
    settleBout(s, b, { ...runBout(b), winner: 0, method: 'yield' });
    expect(s.xp).toBe(3);
    expect(s.skillPoints).toBe(before + 1);
  });

  it('opponents know more skills the stronger they are, deterministically, always legally', () => {
    const k = nameKey('Vorrax the Flayer');
    expect(enemySkills('brute', 60, k)).toEqual([]);
    const mid = enemySkills('thraex', 110, k), high = enemySkills('thraex', 170, k), boss = enemySkills('thraex', 170, k, true);
    expect(high.length).toBeGreaterThan(mid.length);
    expect(boss.length).toBeGreaterThan(high.length);
    expect(enemySkills('thraex', 170, k)).toEqual(high);
    for (const list of [mid, high, boss]) list.forEach((id, i) => { const req = SKILLS[id].req; if (req) expect(list.indexOf(req)).toBeLessThan(i); });
  });

  it('the player spec carries learned skills and gear perks; broken weapons lose their perks', () => {
    const s = newGame('p', 'thraex', 'normal');
    s.skills = ['edge']; s.perks = { weapon: ['keen'], armor: ['thorned'] };
    expect(playerSpec(s).skills).toEqual(['edge', 'keen', 'thorned']);
    s.gear.weapon = 0;
    expect(playerSpec(s).skills).toEqual(['edge', 'thorned']);
    expect(pickPerks('weapon', 3, mulberry32(1))).toHaveLength(3);
    expect(new Set(pickPerks('armor', 3, mulberry32(2))).size).toBe(3);
  });
});

describe('master trainer', () => {
  it('sells stat points for gold at a rising price', () => {
    const s = newGame('p', 'brute', 'normal');
    s.gold = 1000; const u = s.unspent; const first = trainerCost(s);
    expect(hireTrainer(s)).toMatch(/stat points/);
    expect(s.unspent).toBe(u + 2);
    expect(s.gold).toBe(1000 - first);
    expect(trainerCost(s)).toBeGreaterThan(first);
    s.gold = 1;
    expect(hireTrainer(s)).toMatch(/wants/);
  });
});

describe('skills in combat', () => {
  const winRate = (skills: string[], n = 120) => {
    let w = 0;
    for (let i = 0; i < n; i++) {
      const a = { ...makeSpec('thraex', 4), skills }, b = makeSpec('murmillo', 4);
      const r = i % 2 ? simulateFight(b, a, i * 977 + 3, { log: false }) : simulateFight(a, b, i * 977 + 3, { log: false });
      w += r.winner === null ? 0.5 : r.winner === (i % 2 ? 1 : 0) ? 1 : 0;
    }
    return w / n;
  };

  it('damage and durability skills raise the win rate', () => {
    expect(winRate(['edge', 'tough', 'eye', 'lungs'])).toBeGreaterThan(winRate([]) + 0.05);
  });

  it('thorns reflect damage, leech heals, hamstring slows, riposte counters', () => {
    const count = (skills: string[], pred: (e: { result: string; statuses?: string[] }) => boolean) => {
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const a = { ...makeSpec('murmillo', 4), skills }, b = makeSpec('hoplomachus', 4);
        n += simulateFight(a, b, i + 1).events.filter(pred).length;
      }
      return n;
    };
    expect(count(['eye', 'hamstring'], (e) => !!e.statuses?.includes('slow'))).toBeGreaterThan(0);
    expect(count(['bulwark', 'bashm', 'riposte'], (e) => e.result === 'countered')).toBeGreaterThan(0);
    const a = { ...makeSpec('thraex', 4), skills: ['vampiric'] }, b = makeSpec('thraex', 4);
    let healed = 0;
    for (let i = 0; i < 30; i++) { const r = simulateFight(a, b, i + 7, { log: false }); healed += r.finalHp[0].torso / r.maxHp[0].torso; }
    expect(healed).toBeGreaterThan(0);
  });
});
