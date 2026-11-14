import { makeSpec, simulateFight, type ClassId } from '../src/sim';
const [a, b, seed = '1'] = process.argv.slice(2);
const r = simulateFight(makeSpec(a as ClassId), makeSpec(b as ClassId), Number(seed));
const stat: Record<string, Record<string, number>> = { 0: {}, 1: {} };
const dmg = [0, 0];
for (const e of r.events) {
  const k = `${e.action ?? '-'}:${e.result}`;
  stat[e.actor][k] = (stat[e.actor][k] ?? 0) + 1;
  if (e.damage && e.result !== 'countered') dmg[e.actor] += e.damage;
}
console.log(`${a} vs ${b}  winner=${r.winner} ${r.method} ${(r.ticks / 20).toFixed(1)}s dmg=${dmg.map((x) => x.toFixed(0))}`);
console.log(JSON.stringify(stat, null, 1));
console.log('hp end', r.finalHp.map((h) => Object.values(h).map((x) => x.toFixed(0)).join(',')));
