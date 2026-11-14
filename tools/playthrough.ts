// One narrated run: npx tsx tools/playthrough.ts <class> <career|free> [seed]
import { CLASS_IDS, mulberry32, type ClassId } from '../src/sim';
import { canLearn, skillsFor } from '../src/data/skills';
import {
  ODDS, acceptEncounter, buyItem, buyProsthetic, buyTier, declineEncounter, encounterSpec, estimateOdds, hireTrainer, learnSkill, level, newGame, openBout,
  playerSpec, repair, rest, runBout, scout, score, settleBout, spendPoint, stats, train, trainerCost, useItem, waitDay, type Save,
} from '../src/game/state';

ODDS.samples = 16;
const cls = (process.argv[2] ?? 'dimachaerus') as ClassId;
const mode = (process.argv[3] ?? 'career') as 'career' | 'free';
const seed = Number(process.argv[4] ?? 7);
if (!CLASS_IDS.includes(cls)) throw new Error('unknown class');
const KEYS = ['str', 'strL', 'agi', 'vit', 'end', 'tec', 'str', 'vit'] as const;
const rng = mulberry32(seed * 31 + 5);
const s: Save = newGame('Tester', cls, mode === 'career' ? 'hard' : 'normal', { str: 3, strL: 2, vit: 3, agi: 2, tec: 2 }, mode, seed, 10);
const inj = () => Object.entries(s.injuries).map(([z, t]) => `${z}:${t}`).join(',') || '-';
const out: string[] = [];
let guard = 0, yieldsWon = 0, yieldsLost = 0, deaths = 0, bossFights = 0;
while (s.alive && guard++ < 300 && s.fights < 70) {
  if (s.bedridden > 0) { waitDay(s); continue; }
  if (s.encounter && !s.encounter.accepted) {
    const o = estimateOdds(playerSpec(s), encounterSpec(s.encounter), 24);
    if (o >= 0.4) {
      acceptEncounter(s); bossFights++;
      const b = openBout(s); const r = runBout(b); const t = settleBout(s, b, r);
      out.push(`  BOSS ${b.enemy.name} (${(o * 100) | 0}%): ${r.winner === 0 ? 'WON' : 'LOST'} by ${r.method}. ${t.text.join(' ')}`);
      continue;
    }
    declineEncounter(s); out.push(`  declined ${s.encounter?.name ?? 'a challenger'}`);
  }
  while (s.unspent > 0) spendPoint(s, KEYS[Math.floor(rng() * KEYS.length)]);
  const { tree, common } = skillsFor(cls);
  for (const sk of [...tree, ...common]) if (!canLearn(s.skills, s.skillPoints, sk.id, cls)) learnSkill(s, sk.id);
  for (let ge = 0; s.energy > 0 && ge < 8; ge++) {
    if (Object.keys(s.injuries).length && s.gold >= 12 && rng() < 0.7) { rest(s); continue; }
    train(s, KEYS[(s.fights + s.energy) % KEYS.length], rng);
  }
  for (const z of ['legL', 'legR', 'armW', 'armS'] as const) if (s.injuries[z] === 'maimed' && !s.prosthetics[z] && s.gold >= 140) buyProsthetic(s, z);
  if (s.gold > 140) { buyTier(s, 'armor'); buyTier(s, 'weapon'); }
  if (s.gold > trainerCost(s) + 80) hireTrainer(s);
  if (s.gear.weapon < 60 || Math.min(s.gear.armor.torso, s.gear.armor.head) < 55) repair(s, 'all');
  if (!(s.inv ?? []).includes('salve') && s.gold > 90) buyItem(s, 'salve');
  if (!(s.inv ?? []).includes('draught') && s.gold > 90) buyItem(s, 'draught');
  for (let i = (s.inv ?? []).length - 1; i >= 0; i--) if (s.inv![i] === 'salve' && Object.keys(s.injuries).length) useItem(s, i);
  const cands = scout(s);
  const ladder = cands.find((c) => !c.bout.spar), spar = cands.find((c) => c.bout.spar);
  const pick = mode === 'career' && ladder && spar ? (ladder.odds >= 0.45 ? ladder : spar) : cands.find((c) => c.odds >= 0.55 && c.pick === 2) ?? cands.find((c) => c.odds >= 0.55 && c.pick === 1) ?? cands.reduce((a, b) => (b.odds > a.odds ? b : a));
  if (pick.odds < 0.3 && s.gold >= 30 && guard % 3 !== 0) { waitDay(s); continue; }
  if (pick.odds < 0.65) { const di = (s.inv ?? []).indexOf('draught'); if (di >= 0) useItem(s, di); }
  const st = stats(s);
  const b = openBout(s, pick.pick);
  const r = runBout(b);
  settleBout(s, b, r);
  const won = r.winner === 0;
  if (r.method === 'yield') { if (won) yieldsWon++; else yieldsLost++; }
  if (!s.alive) deaths++;
  out.push(`d${String(s.day).padStart(2)} f${String(s.fights).padStart(2)} Lv${level(s)} ${b.enemy.name.slice(0, 22).padEnd(22)} odds ${String((pick.odds * 100) | 0).padStart(3)}% ${won ? 'WIN ' : 'LOSS'} ${r.method.padEnd(5)} ${(r.ticks / 20).toFixed(0).padStart(3)}s gold ${String(s.gold).padStart(4)} R${st.str}/L${st.strL} agi${st.agi} vit${st.vit} spi${st.spi} inj[${inj()}] bag[${(s.inv ?? []).join(',')}]${s.alive ? '' : '  ** DIED **'}`);
  if (s.career?.champion) { out.push('  CHAMPION!'); break; }
  waitDay(s);
}
console.log(`${cls} ${mode} seed ${seed}`);
console.log(out.join('\n'));
console.log(`result: ${s.alive ? 'alive' : 'dead'} fights ${s.fights} wins ${s.wins} score ${score(s)} yieldsWon ${yieldsWon} yieldsLost ${yieldsLost} bossFights ${bossFights} deaths ${deaths} skills ${s.skills.length}`);
