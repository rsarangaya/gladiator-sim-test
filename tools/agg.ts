import { makeSpec, simulateFight, type ClassId } from '../src/sim';
const [a, b, n = '300'] = process.argv.slice(2);
let d = [0, 0], w = [0, 0], t = 0, torso = [0, 0], acts: Record<string, number> = {};
for (let i = 0; i < +n; i++) {
  const r = simulateFight(makeSpec(a as ClassId), makeSpec(b as ClassId), i * 977 + 1);
  d[0] += r.damageDealt[0]; d[1] += r.damageDealt[1];
  if (r.winner !== null) w[r.winner]++;
  t += r.ticks;
  torso[0] += r.finalHp[0].torso / r.maxHp[0].torso; torso[1] += r.finalHp[1].torso / r.maxHp[1].torso;
  for (const e of r.events) { if (e.result === 'start') acts[`${e.actor}${e.action}`] = (acts[`${e.actor}${e.action}`] ?? 0) + 1; }
}
console.log({ dmgPerFight: d.map((x) => +(x / +n).toFixed(1)), wins: w, secs: +(t / +n / 20).toFixed(1), torsoLeft: torso.map((x) => +(x / +n).toFixed(2)) });
console.log(Object.entries(acts).map(([k, v]) => `${k}:${(v / +n).toFixed(1)}`).join(' '));
