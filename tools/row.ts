import { CLASS_IDS, makeSpec, simulateFight, type ClassId } from '../src/sim';
const [cls, lv = '1', n = '300'] = process.argv.slice(2);
const out: string[] = []; let tot = 0;
for (const o of CLASS_IDS) {
  if (o === cls) continue;
  let w = 0;
  for (let i = 0; i < +n; i++) {
    const swap = i % 2 === 1, seed = (i * 2654435761 + 12345) >>> 0;
    const a = makeSpec(cls as ClassId, +lv), b = makeSpec(o, +lv);
    const r = swap ? simulateFight(b, a, seed, { log: false }) : simulateFight(a, b, seed, { log: false });
    const side = swap ? 1 : 0;
    w += r.winner === null ? 0.5 : r.winner === side ? 1 : 0;
  }
  tot += w / +n; out.push(`${o.slice(0, 5)} ${Math.round((100 * w) / +n)}`);
}
console.log(`${cls} L${lv}: ${out.join(' | ')} | avg ${Math.round((100 * tot) / 5)}`);
