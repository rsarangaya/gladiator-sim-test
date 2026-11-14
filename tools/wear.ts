import { CLASS_IDS } from '../src/sim';
import { gearCondition, newGame, prepareBout, runBout, settleBout } from '../src/game/state';
// How fast does gear wear? Fight repeatedly with no repairs and report condition.
for (const cls of CLASS_IDS) {
  const avg = { w: [0, 0, 0, 0], a: [0, 0, 0, 0], s: [0, 0, 0, 0] }; const N = 40; const marks = [1, 3, 6, 10];
  for (let g = 0; g < N; g++) {
    const s = newGame('p', cls, 'normal', { str: 4, vit: 4, agi: 2, tec: 2 }, 'free', g);
    s.tutorialDone = true;
    for (let f = 1; f <= 10; f++) {
      s.alive = true; s.injuries = {};
      const b = prepareBout(s, g * 131 + f); settleBout(s, b, runBout(b));
      const i = marks.indexOf(f);
      if (i >= 0) { const c = gearCondition(s); avg.w[i] += c.weapon; avg.a[i] += c.armor; avg.s[i] += c.shield ?? 0; }
    }
  }
  const fmt = (a: number[]) => a.map((v) => Math.round(v / N)).join('/');
  console.log(`${cls.padEnd(12)} weapon ${fmt(avg.w)}  armor ${fmt(avg.a)}  shield ${fmt(avg.s)}   (after fights 1/3/6/10)`);
}
