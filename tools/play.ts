// Interactive play harness: one save file, commands separated by ';'.
//   npx tsx tools/play.ts <savefile> "new knight career 5; status; train str; scout"
// Commands: new <class> <career|free> <seed> | status | skills | learn <id> | spend <stat> [n] | train <stat> [n] | rest | wait
//           shop | buy weapon|armor|<item> | repair all|weapon|armor|shield | prosthetic <zone> | trainer | use <idx> | hand L|R
//           scout | fight [pick] | accept | decline | spar
import fs from 'node:fs';
import { CLASS_IDS, type ClassId } from '../src/sim';
import { SKILLS, canLearn, skillsFor } from '../src/data/skills';
import { ITEMS, ITEM_IDS, type ItemId } from '../src/data/items';
import {
  ODDS, RARITIES, actionRng, STAT_KEYS, TIER_COSTS, acceptEncounter, buyItem, buyProsthetic, buyTier, declineEncounter, encounterSpec, estimateOdds, gearCondition,
  hireTrainer, inPrelims, ladderRank, learnSkill, level, newGame, openBout, playerSpec, repair, repairCost, rest, runBout, scout, score, setHand, settleBout,
  spendPoint, stats, train, trainerCost, useItem, waitCost, waitDay, type Save,
} from '../src/game/state';
import type { Stats, Zone } from '../src/sim/types';

ODDS.samples = 30;
const file = process.argv[2];
const cmds = (process.argv[3] ?? 'status').split(';').map((c) => c.trim()).filter(Boolean);
let s: Save | null = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Save) : null;
const save = () => { if (s) fs.writeFileSync(file, JSON.stringify(s)); };
const out = (t: string) => console.log(t);
const inj = (x: Save) => Object.entries(x.injuries).map(([z, t]) => `${z}:${t}${t === 'maimed' && x.prosthetics[z as Zone] ? '(prosth)' : ''}`).join(' ') || 'none';
const ZN: Record<string, Zone> = { head: 'head', torso: 'torso', armw: 'armW', arms: 'armS', legl: 'legL', legr: 'legR' };

function status(x: Save) {
  const st = stats(x), g = gearCondition(x), c = x.career;
  out(`== ${x.name} the ${x.classId} Lv${level(x)} | day ${x.day} | gold ${x.gold} | energy ${x.energy}${x.sick ? ' SICK' : ''}${x.bedridden ? ' BEDRIDDEN' : ''} | fights ${x.fights} wins ${x.wins} | ${x.alive ? 'alive' : 'DEAD'}`);
  out(`stats R${st.str} L${st.strL} agi${st.agi} vit${st.vit} end${st.end} tec${st.tec} spi${st.spi} | unspent ${x.unspent} | skill pts ${x.skillPoints} | skills [${x.skills.join(',')}] | hand ${x.lefty ? 'left' : 'right'}`);
  out(`gear wpn ${Math.round(g.weapon)}% (${RARITIES[x.weaponTier]}) shield ${g.shield === null ? '-' : Math.round(g.shield) + '%'} armor ${Math.round(g.armor)}% (${RARITIES[x.armorTier]}) | injuries: ${inj(x)} | bag [${(x.inv ?? []).join(',')}]${x.draught ? ' draught on' : ''}`);
  if (c) out(inPrelims(c) ? `career: UNRANKED, qualifiers ${c.prelimWins}/${c.prelim.length}` : c.champion ? `career: CHAMPION, defenses ${c.defenses}` : `career: Top ${c.size}, rank ${ladderRank(x)} (beaten ${c.beaten})`);
  if (x.news.length) out(`news: ${x.news.join(' | ')}`);
  if (x.encounter && !x.encounter.accepted) { const e = x.encounter; out(`!! CHALLENGE: ${e.name} (${e.classId}) odds ${(estimateOdds(playerSpec(x), encounterSpec(e), 40) * 100) | 0}% - accept or decline`); }
}

for (const cmd of cmds) {
  const [op, ...a] = cmd.split(/\s+/);
  if (op === 'new') {
    const cls = a[0] as ClassId; if (!CLASS_IDS.includes(cls)) { out('unknown class ' + cls); continue; }
    const alloc: Partial<Stats> = {};
    for (const p of a.slice(3)) { const [k, v] = p.split('='); (alloc as Record<string, number>)[k] = Number(v); }
    s = newGame('Tester', cls, a[1] === 'career' ? 'hard' : 'normal', alloc, a[1] as 'career' | 'free', Number(a[2] ?? 1), 10);
    out('new game started'); status(s); continue;
  }
  if (!s) { out('no save'); break; }
  if (!s.alive && op !== 'status') { out('(run is over)'); continue; }
  switch (op) {
    case 'status': status(s); break;
    case 'skills': {
      const { tree, common } = skillsFor(s.classId);
      for (const sk of [...tree, ...common]) out(`${s.skills.includes(sk.id) ? '[x]' : canLearn(s.skills, s.skillPoints, sk.id, s.classId) ? '[-]' : '[ ]'} ${sk.id} (${sk.cost}) ${sk.name}: ${sk.desc}`);
      break;
    }
    case 'learn': out(learnSkill(s, a[0])); break;
    case 'spend': { const n = Number(a[1] ?? 1); let k = 0; for (let i = 0; i < n; i++) if (spendPoint(s, a[0] as keyof Stats)) k++; out(`spent ${k} on ${a[0]}`); break; }
    case 'train': { const n = Number(a[1] ?? 1); for (let i = 0; i < n; i++) out(train(s, a[0] as keyof Stats, actionRng(s, a[0] + i + s.energy + s.day))); break; }
    case 'rest': out(rest(s)); break;
    case 'wait': out(waitDay(s) + ` (cost ${waitCost(s)})`); status(s); break;
    case 'shop': {
      out(`weapon upgrade: ${s.weaponTier >= 2 ? 'max' : RARITIES[s.weaponTier + 1] + ' ' + TIER_COSTS.weapon[s.weaponTier] + 'g'} | armor upgrade: ${s.armorTier >= 2 ? 'max' : RARITIES[s.armorTier + 1] + ' ' + TIER_COSTS.armor[s.armorTier] + 'g'}`);
      out(`repair all ${repairCost(s, 'all')}g (weapon ${repairCost(s, 'weapon')}, shield ${repairCost(s, 'shield')}, armor ${repairCost(s, 'armor')}) | trainer ${trainerCost(s)}g`);
      out('items: ' + ITEM_IDS.map((i) => `${i} ${ITEMS[i].price}g (${ITEMS[i].desc})`).join(' | '));
      break;
    }
    case 'buy': out(a[0] === 'weapon' || a[0] === 'armor' ? buyTier(s, a[0]) : buyItem(s, a[0] as ItemId)); break;
    case 'repair': out(repair(s, a[0] as 'all' | 'weapon' | 'armor' | 'shield')); break;
    case 'prosthetic': out(buyProsthetic(s, ZN[a[0].toLowerCase()] ?? (a[0] as Zone))); break;
    case 'trainer': out(hireTrainer(s)); break;
    case 'use': out(useItem(s, Number(a[0]))); break;
    case 'hand': setHand(s, a[0].toUpperCase() === 'L'); out('hand ' + (s.lefty ? 'left' : 'right')); break;
    case 'scout': {
      for (const c of scout(s)) {
        const e = c.bout.enemy;
        out(`pick ${c.pick}: ${c.bout.label} | ${e.name} (${e.classId} Lv${e.level}) ${e.weapon.name}${e.shield ? '+' + e.shield.name : ''} spi${e.stats.spi} R${e.stats.str}/L${e.stats.strL} agi${e.stats.agi} vit${e.stats.vit} skills ${e.skills?.length ?? 0} | odds ${(c.odds * 100) | 0}% reward x${c.bout.reward}`);
      }
      break;
    }
    case 'accept': acceptEncounter(s); out('accepted the challenge'); break;
    case 'decline': out(declineEncounter(s)); break;
    case 'spar': case 'fight': {
      if (s.encounter && !s.encounter.accepted) { out('answer the challenge first (accept/decline)'); break; }
      const pick = op === 'spar' ? 0 : a[0] !== undefined ? Number(a[0]) : undefined;
      const b = openBout(s, pick);
      const r = runBout(b);
      const o = settleBout(s, b, r);
      const n = (z: number) => r.events.filter((e) => e.actor === z && (e.result === 'hit' || e.result === 'crit')).length;
      out(`FIGHT vs ${b.enemy.name} (${b.enemy.classId}): ${o.won ? 'WIN' : 'LOSS'} by ${r.method} in ${(r.ticks / 20).toFixed(0)}s | hits you ${n(0)} them ${n(1)} | dmg ${r.damageDealt.map((x) => x.toFixed(0)).join('/')}`);
      out(o.text.join(' '));
      status(s);
      break;
    }
    default: out('? ' + op);
  }
}
void STAT_KEYS; void SKILLS; void score;
save();
