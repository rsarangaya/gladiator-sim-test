// How much does each skill / perk move the win rate? Target: +2 to +8 points per skill.
import { CLASS_IDS, makeSpec, simulateFight, type ClassId } from '../src/sim';
import { SKILLS } from '../src/data/skills';

const N = Number(process.argv[2] ?? 60);
const LEVEL = Number(process.argv[3] ?? 4);

function winRate(cls: ClassId, skills: string[]): number {
  let w = 0, n = 0;
  for (const o of CLASS_IDS) {
    if (o === cls) continue;
    for (let i = 0; i < N; i++) {
      const a = { ...makeSpec(cls, LEVEL), skills }, b = makeSpec(o, LEVEL);
      const flip = i % 2 === 1, seed = (i * 2654435761 + 99) >>> 0;
      const r = flip ? simulateFight(b, a, seed, { log: false }) : simulateFight(a, b, seed, { log: false });
      w += r.winner === null ? 0.5 : r.winner === (flip ? 1 : 0) ? 1 : 0; n++;
    }
  }
  return w / n;
}
const chain = (id: string): string[] => { const s = SKILLS[id]; return s.req ? [...chain(s.req), id] : [id]; };

const baseCache: Record<string, number> = {};
const base = (cls: ClassId, skills: string[]) => { const k = cls + skills.join(); return (baseCache[k] ??= winRate(cls, skills)); };

const rows: string[] = [];
for (const s of Object.values(SKILLS)) {
  const classes: ClassId[] = s.kind === 'class' ? [s.cls!] : CLASS_IDS;
  let d = 0;
  for (const c of classes) {
    const prereq = s.req ? chain(s.req) : [];
    d += winRate(c, [...prereq, s.id]) - base(c, prereq);
  }
  rows.push(`${s.kind.padEnd(6)} ${s.id.padEnd(11)} ${(100 * d / classes.length >= 0 ? '+' : '') + (100 * d / classes.length).toFixed(1)} pts   ${s.name}`);
}
console.log(`skill audit: ${N} fights per opponent, level ${LEVEL}\n` + rows.join('\n'));
