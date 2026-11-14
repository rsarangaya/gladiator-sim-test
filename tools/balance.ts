import { CLASS_IDS, simulateFight, makeSpec, type ClassId } from '../src/sim';

const N = Number(process.argv[2] ?? 1000);
const LEVEL = Number(process.argv[3] ?? 1);

interface Agg { w: number; l: number; d: number; ticks: number; death: number; yield: number; cap: number; maims: number; fights: number }
const pad = (s: string | number, n: number) => String(s).padStart(n);
const pct = (x: number) => (100 * x).toFixed(0) + '%';

const t0 = Date.now();
const grid: Record<string, Agg> = {};
const total: Record<string, { w: number; n: number }> = {};
CLASS_IDS.forEach((c) => (total[c] = { w: 0, n: 0 }));

for (const a of CLASS_IDS) {
  for (const b of CLASS_IDS) {
    if (a === b) continue;
    const g: Agg = { w: 0, l: 0, d: 0, ticks: 0, death: 0, yield: 0, cap: 0, maims: 0, fights: 0 };
    for (let i = 0; i < N; i++) {
      // alternate starting sides so position never biases the result
      const seed = (i * 2654435761 + 12345) >>> 0;
      const swap = i % 2 === 1;
      const specA = makeSpec(a, LEVEL), specB = makeSpec(b, LEVEL);
      const r = swap ? simulateFight(specB, specA, seed, { log: false }) : simulateFight(specA, specB, seed, { log: false });
      const aSide = swap ? 1 : 0;
      if (r.winner === null) g.d++; else if (r.winner === aSide) g.w++; else g.l++;
      g.ticks += r.ticks;
      g[r.method]++;
      g.maims += r.injuries[0].concat(r.injuries[1]).filter((x) => x.tier === 'maimed').length;
      g.fights++;
    }
    grid[a + '|' + b] = g;
    total[a].w += g.w + g.d / 2; total[a].n += g.fights;
  }
}

console.log(`\nBalance: ${N} fights/matchup, level ${LEVEL}, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
console.log('Win rate (row beats column):');
console.log(pad('', 13) + CLASS_IDS.map((c) => pad(c.slice(0, 8), 10)).join('') + pad('AVG', 8));
for (const a of CLASS_IDS) {
  let line = pad(a.slice(0, 12), 13);
  for (const b of CLASS_IDS) line += pad(a === b ? '-' : pct((grid[a + '|' + b].w + grid[a + '|' + b].d / 2) / N), 10);
  line += pad(pct(total[a].w / total[a].n), 8);
  console.log(line);
}

let T = 0, F = 0, D = 0, Y = 0, C = 0, M = 0;
for (const k in grid) { const g = grid[k]; T += g.ticks; F += g.fights; D += g.death; Y += g.yield; C += g.cap; M += g.maims; }
console.log(`\nAvg fight length: ${(T / F / 20).toFixed(1)}s   death ${pct(D / F)}  yield ${pct(Y / F)}  time-cap ${pct(C / F)}   maims/fight ${(M / F).toFixed(2)}`);

console.log('\nPer-matchup length (s) / death%:');
for (const a of CLASS_IDS) {
  let line = pad(a.slice(0, 12), 13);
  for (const b of CLASS_IDS) {
    const g = grid[a + '|' + b];
    line += pad(a === b ? '-' : `${(g.ticks / g.fights / 20).toFixed(0)}/${pct(g.death / g.fights)}`, 10);
  }
  console.log(line);
}
let worst = 0, worstPair = '';
for (const k in grid) { const [a, b] = k.split('|') as [ClassId, ClassId]; const wr = (grid[k].w + grid[k].d / 2) / N; if (Math.abs(wr - 0.5) > worst) { worst = Math.abs(wr - 0.5); worstPair = `${a} vs ${b} ${pct(wr)}`; } }
console.log(`\nMost lopsided matchup: ${worstPair}  (target: within 65/35)`);
