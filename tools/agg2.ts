import { makeSpec, simulateFight, type ClassId } from '../src/sim';
const [a, b, n = '300'] = process.argv.slice(2);
const c: Record<string, number> = {};
let dmg = [0, 0];
for (let i = 0; i < +n; i++) {
  const r = simulateFight(makeSpec(a as ClassId), makeSpec(b as ClassId), i * 977 + 1);
  for (const e of r.events) if (e.result !== 'start' && e.action) { const k = `${e.actor}:${e.action}:${e.result}`; c[k] = (c[k] ?? 0) + 1; if (e.damage) dmg[e.actor] += e.damage; }
}
console.log(Object.entries(c).sort().map(([k, v]) => `${k}=${(v / +n).toFixed(1)}`).join('\n'), dmg.map((x) => x / +n));
