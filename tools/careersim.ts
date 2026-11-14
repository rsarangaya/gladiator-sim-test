// A bot plays whole runs (free or career) the way a sensible player would, to check difficulty and pacing.
//   npx tsx tools/careersim.ts <runs per class> <career|free> <ladder size>
import { CLASS_IDS, mulberry32 } from '../src/sim';
import { canLearn, skillsFor } from '../src/data/skills';
import {
  acceptEncounter, buyItem, buyProsthetic, useItem, buyTier, declineEncounter, encounterSpec, estimateOdds, hireTrainer, learnSkill, newGame, openBout,
  ODDS, playerSpec, repair, rest, runBout, scout, score, settleBout, spendPoint, train, trainerCost, waitDay,
} from '../src/game/state';

ODDS.samples = 10;
const BOT_KEYS = ['str', 'strL', 'agi', 'vit', 'end', 'tec', 'str', 'vit'] as const; // a sensible player skips spirit and favours core stats
const N = Number(process.argv[2] ?? 40);
const MODE = (process.argv[3] ?? 'career') as 'career' | 'free';
const SIZE = Number(process.argv[4] ?? 10);
const POLICY = process.argv[5] ?? 'smart'; // 'even' = always fight the even opponent
interface Row { boss: number[]; n: number; champs: number; scores: number[]; days: number[]; odds: number[]; fights: number[]; deaths: number }
const rows: Record<string, Row> = {};
for (const cls of CLASS_IDS) rows[cls] = { boss: [], n: 0, champs: 0, scores: [], days: [], odds: [], fights: [], deaths: 0 };

for (let g = 0; g < N * CLASS_IDS.length; g++) {
  const cls = CLASS_IDS[g % CLASS_IDS.length];
  const rng = mulberry32(g * 7919 + 13);
  const s = newGame('Bot', cls, MODE === 'free' ? 'normal' : 'hard', { str: 3, strL: 2, vit: 3, agi: 2, tec: 2 }, MODE, g + 1, SIZE);
  const r = rows[cls];
  let guard = 0;
  while (s.alive && guard++ < 400 && s.fights < 120) {
    if (s.bedridden > 0) { waitDay(s); continue; }
    if (s.encounter && !s.encounter.accepted) {
      const odds = estimateOdds(playerSpec(s), encounterSpec(s.encounter), 24);
      r.boss.push(odds);
      if (odds >= 0.4) {
        acceptEncounter(s);
        const b = openBout(s); settleBout(s, b, runBout(b));
        continue;
      }
      declineEncounter(s);
    }
    while (s.unspent > 0) spendPoint(s, BOT_KEYS[Math.floor(rng() * BOT_KEYS.length)]);
    const { tree, common } = skillsFor(cls);
    for (const sk of [...tree, ...common]) if (!canLearn(s.skills, s.skillPoints, sk.id, cls)) learnSkill(s, sk.id);
    for (let ge = 0; s.energy > 0 && ge < 8; ge++) {
      if (Object.keys(s.injuries).length && s.gold >= 12 && rng() < 0.7) { rest(s); continue; }
      train(s, BOT_KEYS[(s.fights + s.energy) % BOT_KEYS.length], rng);
    }
    if (s.gold > 140) { buyTier(s, 'armor'); buyTier(s, 'weapon'); }
    if (s.gold > trainerCost(s) + 80) hireTrainer(s);
    if (s.gear.weapon < 60 || Math.min(s.gear.armor.torso, s.gear.armor.head) < 55) repair(s, 'all');
    if (s.gold > 90 && s.fights % 4 === 3) { waitDay(s); for (let ge = 0; s.energy > 0 && ge < 8; ge++) train(s, BOT_KEYS[(s.fights + ge) % BOT_KEYS.length], rng); }
    for (const z of ['legL', 'legR', 'armW', 'armS'] as const) if (s.injuries[z] === 'maimed' && !s.prosthetics[z] && s.gold >= 140) buyProsthetic(s, z);
    // supplies: keep a salve and a draught handy
    if (!(s.inv ?? []).includes('salve') && s.gold > 90) buyItem(s, 'salve');
    if (!(s.inv ?? []).includes('draught') && s.gold > 90) buyItem(s, 'draught');
    for (let i = (s.inv ?? []).length - 1; i >= 0; i--) { const id = s.inv![i]; if (id === 'salve' && Object.keys(s.injuries).length) useItem(s, i); }
    // pick the toughest opponent that still looks winnable, else the safest
    const cands = scout(s);
    const pick = cands.find((c) => c.odds >= 0.55 && c.pick === 2) ?? cands.find((c) => c.odds >= 0.55 && c.pick === 1)
      ?? cands.reduce((a, b) => (b.odds > a.odds ? b : a));
    const forced = POLICY === 'even' ? cands.find((c) => c.pick === 1) : undefined;
    // too risky: spend another day training first (every third time, just fight)
    if (!forced && pick.odds < 0.3 && s.gold >= 30 && guard % 3 !== 0) { waitDay(s); continue; }
    const ladderC = cands.find((c) => !c.bout.spar), sparC = cands.find((c) => c.bout.spar);
    const careerPick = MODE === "career" && ladderC && sparC ? (ladderC.odds >= 0.45 ? ladderC : sparC) : undefined;
    const chosen = forced ?? careerPick ?? pick;
    r.odds.push(chosen.odds);
    if (chosen.odds < 0.65) { const di = (s.inv ?? []).indexOf('draught'); if (di >= 0) useItem(s, di); }
    const b = openBout(s, chosen.pick);
    settleBout(s, b, runBout(b));
  }
  r.n++; r.scores.push(score(s)); r.days.push(s.day); r.fights.push(s.fights);
  if (s.career?.champion) r.champs++;
  if (!s.alive) r.deaths++;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
console.log(`${MODE} bot${MODE === 'career' ? ` (top ${SIZE})` : ''}, ${N} runs per class (sensible-player policy)`);
for (const cls of CLASS_IDS) {
  const r = rows[cls];
  const sorted = [...r.scores].sort((a, b) => a - b);
  console.log(`${cls.padEnd(12)} ${MODE === 'career' ? `champion ${String(Math.round((100 * r.champs) / r.n)).padStart(3)}%  ` : ''}avg score ${avg(r.scores).toFixed(1).padStart(5)}  median ${sorted[sorted.length >> 1]}  days ${avg(r.days).toFixed(0).padStart(3)}  fights ${avg(r.fights).toFixed(0).padStart(3)}  odds ${(100 * avg(r.odds)).toFixed(0)}%  boss odds ${(100 * avg(r.boss)).toFixed(0)}% (n=${r.boss.length})  died ${Math.round((100 * r.deaths) / r.n)}%`);
}
