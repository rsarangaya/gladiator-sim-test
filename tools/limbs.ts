import { makeSpec, simulateFight, ZONES } from '../src/sim';
const m: Record<string, number> = {}; let n = 0;
for (let i = 0; i < 400; i++) { const r = simulateFight(makeSpec('brute'), makeSpec('hoplomachus'), i, { log: false }); n++;
  for (const side of [0, 1] as const) for (const z of ZONES) { const f = 1 - r.finalHp[side][z] / r.maxHp[side][z]; const k = z + (f >= 1 ? ':0' : f > 0.6 ? ':>60%' : f > 0.3 ? ':>30%' : ':low'); m[k] = (m[k] ?? 0) + 1; } }
console.log(Object.entries(m).sort().map(([k, v]) => `${k}=${(v / n / 2).toFixed(2)}`).join(' '));
