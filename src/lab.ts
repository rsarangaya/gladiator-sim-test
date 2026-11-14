import { CLASSES, makeSpec } from './data/classes';
import { Viewer } from './render/viewer';
import { CLASS_IDS, ZONES, simulateFight, type ClassId, type FightResult, type FighterSpec, type Zone } from './sim';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const selA = $<HTMLSelectElement>('a'), selB = $<HTMLSelectElement>('b'), selL = $<HTMLSelectElement>('lvl');
for (const s of [selA, selB]) for (const id of CLASS_IDS) s.add(new Option(`${CLASSES[id].label}`, id));
selB.value = 'brute';
for (let l = 1; l <= 10; l++) selL.add(new Option(String(l), String(l)));

const viewer = new Viewer($<HTMLCanvasElement>('c'));
let specs: [FighterSpec, FighterSpec];
let result: FightResult;
const seedEl = $('seed');
const ticker = $('ticker');

function hud(i: 0 | 1) {
  const el = $(`h${i}`);
  const hp = viewer.hpNow[i], mx = viewer.maxHp[i], t = viewer.tiersNow[i];
  const pct = (z: Zone) => Math.max(0, (100 * hp[z]) / mx[z]);
  el.innerHTML = `<div class="name">${specs[i].name} <small style="color:#a8977c">${specs[i].weapon.name}${specs[i].shield ? ' + ' + specs[i].shield!.name : ''}</small></div>
    <div class="meter"><i style="width:${pct('torso')}%"></i></div>
    <div class="meter" style="height:6px"><i style="width:${pct('head')}%;background:#c4a24a"></i></div>
    <div class="zones">${ZONES.map((z) => `<span class="${t[z]}">${z.replace('armW', 'W-arm').replace('armS', 'S-arm').replace('legL', 'L-leg').replace('legR', 'R-leg')}</span>`).join('')}</div>`;
}
viewer.onHud = () => { if (specs) { hud(0); hud(1); } };
viewer.onLog = (line, cls = '') => {
  const d = document.createElement('div');
  d.textContent = line; if (cls) d.className = cls;
  ticker.appendChild(d); ticker.scrollTop = ticker.scrollHeight;
};
viewer.onEnd = () => {
  const w = result.winner;
  const how = result.method === 'death' ? 'by death' : result.method === 'yield' ? 'by yield' : 'on time';
  $('res').textContent = w === null ? 'Draw.' : `${specs[w].name} wins ${how} in ${(result.ticks / 20).toFixed(1)}s.`;
  const inj = result.injuries.flatMap((l, s) => l.filter((x) => x.tier !== 'bruised').map((x) => `${specs[s as 0 | 1].name}: ${x.tier} ${x.zone}`));
  if (inj.length) viewer.onLog('Injuries — ' + inj.join('; '), 'dim');
};

function run(seed: number) {
  const lvl = Number(selL.value);
  specs = [makeSpec(selA.value as ClassId, lvl, CLASSES[selA.value as ClassId].label + ' A'), makeSpec(selB.value as ClassId, lvl, CLASSES[selB.value as ClassId].label + ' B')];
  if (selA.value === selB.value) { specs[0].name = CLASSES[selA.value as ClassId].label + ' (blue)'; specs[1].name = CLASSES[selB.value as ClassId].label + ' (red)'; }
  result = simulateFight(specs[0], specs[1], seed);
  seedEl.textContent = String(seed);
  ticker.innerHTML = ''; $('res').textContent = '';
  viewer.load(result, specs);
}

$('fight').onclick = () => run((Math.random() * 2 ** 32) >>> 0);
$('replay').onclick = () => run(Number(seedEl.textContent));
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
  b.onclick = () => {
    viewer.speed = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  };
});
run(1234);
