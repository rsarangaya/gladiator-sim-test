import { CLASSES, makeSpec } from '../data/classes';
import { SKILLS, canLearn, skillsFor, type SkillDef } from '../data/skills';
import {
  MAX_ENERGY, PROSTHETIC_COST, REST_GOLD, START_POINTS, STAT_KEYS, TIER_COSTS,
  actionRng, hireTrainer, trainerCost, buyProsthetic, buyTier, clearSave, level, loadGame, newGame, openBout, rest, runBout, saveGame,
  settleBout, spendPoint, stats, train, type Bout, type Difficulty, type Save, type Mode,
  learnSkill, CAREER_SIZES, PRELIMS, RARITIES, acceptEncounter, arenaLabel, declineEncounter, encounterSpec, estimateOdds, gearCondition, inPrelims, playerSpec, repair, repairCost, scout, waitCost, ladderRank, loadScores, retire, score, waitDay,
} from '../game/state';
import { drawPortrait } from '../render/portrait';
import { Splash } from '../render/splash';
import { Viewer } from '../render/viewer';
import { HELP_HTML, SCOUT_TIP, dismissTip, isSeen, nextTip, resetTips, type Tip } from './tips';
import { CLASS_IDS, ZONES, type ClassId, type FightResult, type Stats, type Zone } from '../sim/types';

const app = document.getElementById('app')!;
let save: Save | null = loadGame();
let msg = '';

const STAT_LABEL: Record<keyof Stats, string> = { str: 'Strength', agi: 'Agility', vit: 'Vitality', end: 'Endurance', tec: 'Technique' };
const STAT_HINT: Record<keyof Stats, string> = {
  str: 'damage', agi: 'hit, dodge, speed', vit: 'health', end: 'stamina', tec: 'crits, aim, blocking',
};
const ZONE_LABEL: Record<Zone, string> = { head: 'Head', torso: 'Torso', armW: 'Weapon arm', armS: 'Shield arm', legL: 'Left leg', legR: 'Right leg' };

const canvas = document.createElement('canvas');

const viewer = new Viewer(canvas);
const splash = new Splash();

function html(strings: string, storm = false) {
  splash.stop();
  const h1 = document.querySelector('h1') as HTMLElement | null;
  if (h1) h1.style.display = '';
  app.innerHTML = strings; document.body.classList.toggle('storm', storm); }
function on(id: string, fn: () => void) { const el = document.getElementById(id); if (el) el.onclick = fn; }
function commit() { if (save) saveGame(save); }

// ---- menu ----------------------------------------------------------------------------
function menu() {
  html(`<div id="splash"></div><div class="card" style="margin-top:10px"><h2>Welcome, gladiator</h2>
    <p class="dim">Build a fighter. The arena fights are simulated, so every choice happens before the sand.</p>
    <p class="dim">Roguelike rules: one autosave. Continue picks up exactly where you left off; you cannot reload to undo a bad fight.</p>
    <div class="row">
      ${save && save.alive ? '<button class="pri" id="cont">Continue</button>' : ''}
      <button id="new" class="${save && save.alive ? '' : 'pri'}">New game</button>
      <button id="helpmenu" title="How to play" style="margin-left:auto">How to play</button><a href="lab.html" style="color:#a8977c">sim lab</a>
    </div>
    ${save ? `<p class="dim">Saved: ${save.name} the ${CLASSES[save.classId].label}, ${save.wins} wins${save.alive ? '' : ' (fallen)'} · best ${save.best}</p>` : ''}</div>`);
  splash.reroll();
  document.getElementById('splash')!.appendChild(splash.el);
  (document.querySelector('h1') as HTMLElement).style.display = 'none'; // the cover art carries the title
  splash.start();
  app.insertAdjacentHTML('beforeend', leaderboardHtml());
  on('cont', hub); on('helpmenu', showHelp);
  on('new', () => {
    if (save && save.alive) {
      if (!confirm('Starting a new game abandons your current run. It will be recorded as retired. Continue?')) return;
      retire(save); commit();
    }
    create();
  });
}

// ---- creator -------------------------------------------------------------------------
function create() {
  let classId: ClassId = 'thraex';
  let diff: Difficulty = 'normal';
  let mode: Mode = 'free';
  let size = 10;
  const alloc: Stats = { str: 0, agi: 0, vit: 0, end: 0, tec: 0 };
  const left = () => START_POINTS - STAT_KEYS.reduce((a, k) => a + alloc[k], 0);

  const render = () => {
    const nameVal = (document.getElementById('name') as HTMLInputElement | null)?.value ?? '';
    const c = CLASSES[classId];
    html(`<div class="card"><h2>Create your gladiator</h2>
      <div class="row"><input id="name" placeholder="Name" maxlength="20" value="${nameVal.replace(/"/g, '')}" /></div>
      <div class="grid">${CLASS_IDS.map((id) => `<div class="card pick ${id === classId ? 'sel' : ''}" data-c="${id}">
        <canvas data-pv="${id}" width="76" height="104" style="float:left;margin-right:10px;border-radius:8px;width:76px;height:104px"></canvas><b>${CLASSES[id].label}</b><div class="dim">${CLASSES[id].blurb}</div><div class="dim">Signature: ${CLASSES[id].signature}</div></div>`).join('')}</div>
      <h2 style="margin-top:12px">Stat points: ${left()} left</h2>
      ${STAT_KEYS.map((k) => `<div class="stat"><b>${k.toUpperCase()}</b><span style="width:170px">${STAT_LABEL[k]} <span class="dim">(${STAT_HINT[k]})</span></span>
        <button data-m="${k}">−</button><span style="width:30px;text-align:center">${c.base[k] + alloc[k]}</span><button data-p="${k}">+</button></div>`).join('')}
      <div class="row"><label>Mode:</label>
        <button data-mode="free-normal" class="${mode === 'free' && diff === 'normal' ? 'on' : ''}">Free · Normal (all injuries heal)</button>
        <button data-mode="free-hard" class="${mode === 'free' && diff === 'hard' ? 'on' : ''}">Free · Hard (maims are permanent)</button>
        <button data-mode="career" class="${mode === 'career' ? 'on' : ''}">Career (ladder to champion, permanent maims)</button></div>
      ${mode === 'career' ? `<div class="row"><label>Ranked field:</label>${CAREER_SIZES.map((n) => `<button data-size="${n}" class="${size === n ? 'on' : ''}">Top ${n}</button>`).join('')}<span class="dim">You start unranked and must win ${PRELIMS[size]} qualifier fights before the ladder opens.</span></div>` : ''}
      <div class="row"><button id="back">Back</button><button class="pri" id="go">Enter the arena</button></div></div>`);
    document.querySelectorAll<HTMLCanvasElement>('canvas[data-pv]').forEach((cv) => drawPortrait(cv, makeSpec(cv.dataset.pv as ClassId, 1, cv.dataset.pv)));
    document.querySelectorAll<HTMLElement>('[data-c]').forEach((e) => (e.onclick = () => { classId = e.dataset.c as ClassId; render(); }));
    document.querySelectorAll<HTMLElement>('[data-p]').forEach((e) => (e.onclick = () => { if (left() > 0) { alloc[e.dataset.p as keyof Stats]++; render(); } }));
    document.querySelectorAll<HTMLElement>('[data-m]').forEach((e) => (e.onclick = () => { const k = e.dataset.m as keyof Stats; if (alloc[k] > 0) { alloc[k]--; render(); } }));
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach((e) => (e.onclick = () => {
      const v = e.dataset.mode!;
      mode = v === 'career' ? 'career' : 'free';
      diff = v === 'free-normal' ? 'normal' : 'hard';
      render();
    }));
    document.querySelectorAll<HTMLElement>('[data-size]').forEach((e) => (e.onclick = () => { size = Number(e.dataset.size); render(); }));
    on('back', menu);
    on('go', () => {
      const n = (document.getElementById('name') as HTMLInputElement).value;
      save = newGame(n, classId, diff, alloc, mode, (Math.random() * 2 ** 32) >>> 0, size);
      msg = mode === 'career' ? 'You start unranked: win the qualifiers to enter the ladder, then climb to champion. Train and spend your points first.' : 'Your first fight is a gentle one. Spend any unspent points, then step onto the sand.';
      commit(); hub();
    });
  };
  render();
}

// ---- hub -----------------------------------------------------------------------------
function statsPanel(s: Save) {
  const st = stats(s);
  return STAT_KEYS.map((k) => `<div class="stat"><b title="${STAT_LABEL[k]}: ${STAT_HINT[k]}">${k.toUpperCase()}</b><div class="meter"><i style="width:${Math.min(100, st[k])}%"></i></div><span style="width:28px;text-align:right">${st[k]}</span>
    ${s.unspent > 0 ? `<button data-sp="${k}">+</button>` : ''}</div>`).join('');
}
function injuryTags(s: Save) {
  const t = ZONES.filter((z) => s.injuries[z]).map((z) => `<span class="tag ${s.injuries[z]}">${ZONE_LABEL[z]}: ${s.injuries[z]}${s.prosthetics[z] ? ' (prosthetic)' : ''}</span>`);
  return t.length ? t.join('') : '<span class="dim">No injuries</span>';
}

function hub() {
  const s = save!;
  if (!s.alive) return runEnd();
  if (s.pending) return arena(); // an entered fight is binding: reopening resumes the same one
  if (s.encounter && !s.encounter.accepted) return offerScreen(s); // an infamous challenger must be answered first
  html(`<div class="card"><canvas id="portrait" width="170" height="230" style="float:right;margin:0 0 8px 14px;border-radius:10px;border:2px solid #4a3b2c;width:170px;height:230px"></canvas>
    <h2>${s.name} the ${CLASSES[s.classId].label} <span class="dim">· Level ${level(s)}</span></h2>
    <div class="row"><span class="big">Day ${s.day}</span><span>Gold: <b>${s.gold}</b></span><span>Energy: <b>${'●'.repeat(s.energy)}${'○'.repeat(MAX_ENERGY - s.energy)}</b></span><span>Wins: ${s.wins}</span>${s.sick > 0 ? '<span class="tag wounded">Sick</span>' : ''}${s.bedridden > 0 ? '<span class="tag maimed">Bedridden</span>' : ''}<span class="dim">Best: ${s.best}</span></div>
    ${s.unspent > 0 ? `<div class="big">${s.unspent} unspent stat point${s.unspent > 1 ? 's' : ''} — click + to spend</div>` : ''}
    ${s.skillPoints > 0 ? `<div class="big">${s.skillPoints} skill point${s.skillPoints > 1 ? 's' : ''} to spend. Open Skills.</div>` : ''}
    ${statsPanel(s)}
    <div style="margin-top:6px">${injuryTags(s)}</div>
    ${gearPanel(s)}
    ${tipBanner(s)}
    ${newsPanel(s)}
    ${careerPanel(s)}
    <div class="msg">${msg}</div>
    <div class="row">
      <span class="dim">Train (1 energy):</span>
      ${STAT_KEYS.map((k) => `<button data-t="${k}" title="Train ${STAT_LABEL[k]}: ${STAT_HINT[k]} (1 energy)" ${s.energy < 1 ? 'disabled' : ''}>${k.toUpperCase()}</button>`).join('')}
    </div>
    <div class="row">
      <button id="rest" title="Heals bruises and wounds and cures fever. Costs 1 energy and gold." ${s.energy < 1 || s.gold < REST_GOLD ? 'disabled' : ''}>Rest (1 energy, ${REST_GOLD}g)</button>
      <button id="shop" title="Repairs, upgrades and prosthetics">Shop</button>
      <button id="skills" class="${s.skillPoints > 0 ? 'glow' : ''}" title="Learn passive skills with skill points">Skills${s.skillPoints > 0 ? ` (${s.skillPoints})` : ''}</button>
      <button class="pri" id="arena" ${s.bedridden > 0 ? 'disabled' : ''}>${arenaLabel(s)}</button>
      <button id="wait" title="Skip to the next day to train more. Costs gold, and rivals keep growing stronger.">Wait a day (${waitCost(s)}g)</button>
      <button id="retire" style="margin-left:auto" title="End this run and record your score">Retire</button><button id="menu">Menu</button><button id="help" title="How to play">?</button>
    </div></div>`);
  document.querySelectorAll<HTMLElement>('[data-sp]').forEach((e) => (e.onclick = () => { spendPoint(s, e.dataset.sp as keyof Stats); commit(); hub(); }));
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => (e.onclick = () => trainAnim(e.dataset.t as keyof Stats)));
  on('rest', () => { msg = rest(s); commit(); hub(); });
  on('shop', shop); on('arena', arena); on('menu', menu); on('skills', () => { msg = ''; skillsScreen(); }); on('help', showHelp);
  wireTips();
  on('wait', () => { msg = waitDay(s); commit(); hub(); });
  const pc = document.getElementById('portrait') as HTMLCanvasElement | null;
  if (pc) drawPortrait(pc, playerSpec(s), { injuries: s.injuries, prosthetics: s.prosthetics });
  on('retire', () => { if (confirm('Retire this gladiator and record the score?')) { retire(s); commit(); hub(); } });
}

function trainAnim(k: keyof Stats) {
  const s = save!;
  if (s.energy < 1) return;
  html(`<div class="card"><div class="train">Training ${STAT_LABEL[k]}…</div></div>`);
  setTimeout(() => { msg = train(s, k, actionRng(s, k)); commit(); hub(); }, 1800);
}

// ---- shop ----------------------------------------------------------------------------
function shop() {
  const s = save!;
  const tier = (kind: 'weapon' | 'armor') => {
    const t = kind === 'weapon' ? s.weaponTier : s.armorTier;
    return t >= 2 ? 'Max in shop' : `${TIER_COSTS[kind][t]}g`;
  };
  const maimed = ZONES.filter((z) => s.injuries[z] === 'maimed');
  html(`<div class="card"><h2>Shop <span class="dim">· Gold: ${s.gold}</span></h2>
    <div class="msg">${msg}</div>
    <div class="row"><button id="bw">Sharpen weapon (+10% damage) — tier ${s.weaponTier}/2 — ${tier('weapon')}</button></div>
    <div class="row"><button id="ba">Better armor (+6 all zones) — tier ${s.armorTier}/2 — ${tier('armor')}</button></div>
    <h2 style="margin-top:12px">Master trainer</h2>
    <div class="row"><button id="trainer" title="Turn gold into stat points">Hire a master trainer — ${trainerCost(s)}g (+2 stat points)</button></div>
    <h2 style="margin-top:12px">Repairs</h2>
    ${gearPanel(s)}
    <div class="row">
      <button id="rpw" ${repairCost(s, 'weapon') ? '' : 'disabled'}>Weapon — ${repairCost(s, 'weapon')}g</button>
      ${s.classId && gearCondition(s).shield !== null ? `<button id="rps" ${repairCost(s, 'shield') ? '' : 'disabled'}>Shield — ${repairCost(s, 'shield')}g</button>` : ''}
      <button id="rpa" ${repairCost(s, 'armor') ? '' : 'disabled'}>Armor — ${repairCost(s, 'armor')}g</button>
      <button id="rpall" ${repairCost(s, 'all') ? '' : 'disabled'}>Repair all — ${repairCost(s, 'all')}g</button>
    </div>
    <h2 style="margin-top:12px">Prosthetics</h2>
    ${maimed.length ? maimed.map((z) => `<div class="row"><button data-pz="${z}" ${s.prosthetics[z] ? 'disabled' : ''}>${ZONE_LABEL[z]} prosthetic — ${PROSTHETIC_COST}g</button><span class="dim">halves the lasting damage</span></div>`).join('') : '<p class="dim">No maimed limbs.</p>'}
    <div class="row"><button id="back">Back</button></div></div>`);
  on('trainer', () => { msg = hireTrainer(s); commit(); shop(); });
  on('rpw', () => { msg = repair(s, 'weapon'); commit(); shop(); });
  on('rps', () => { msg = repair(s, 'shield'); commit(); shop(); });
  on('rpa', () => { msg = repair(s, 'armor'); commit(); shop(); });
  on('rpall', () => { msg = repair(s, 'all'); commit(); shop(); });
  on('bw', () => { msg = buyTier(s, 'weapon'); commit(); shop(); });
  on('ba', () => { msg = buyTier(s, 'armor'); commit(); shop(); });
  document.querySelectorAll<HTMLElement>('[data-pz]').forEach((e) => (e.onclick = () => { msg = buyProsthetic(s, e.dataset.pz as Zone); commit(); shop(); }));
  on('back', () => { msg = ''; hub(); });
}

// ---- arena ---------------------------------------------------------------------------
let bout: Bout | null = null;
let result: FightResult | null = null;

function arena() {
  const s = save!;
  if (s.pending) { bout = openBout(s, s.pending.pick); return fightCard(); } // binding: resume the same fight
  scoutScreen(s);
}

function oddsInfo(p: number) {
  const pc = Math.round(p * 100);
  const [label, color] = p >= 0.7 ? ['Favored', '#6aa65a'] : p >= 0.45 ? ['Even', '#d9c25a'] : p >= 0.25 ? ['Risky', '#e08a3a'] : ['Deadly', '#e04030'];
  return `<span style="color:${color};font-weight:600">${label} · ${pc}% to win</span>`;
}

/** Look over the opponent(s) before committing. Nothing is saved until you press Fight. */
function readiness(s: Save): string[] {
  const out: string[] = [];
  if (s.unspent > 0) out.push(`${s.unspent} unspent stat point${s.unspent > 1 ? 's' : ''}: spend them with the + buttons`);
  if (s.skillPoints > 0) out.push(`${s.skillPoints} unspent skill point${s.skillPoints > 1 ? 's' : ''}: open Skills`);
  if (Object.keys(s.injuries).length) out.push('You are injured: Rest heals bruises and wounds');
  const g = gearCondition(s);
  if (g.weapon < 60 || g.armor < 60 || (g.shield !== null && g.shield < 40)) out.push('Your gear is worn: repair it in the Shop');
  if (s.energy > 0 && s.bedridden === 0) out.push(`${s.energy} energy unused: training makes you stronger`);
  if (s.gold >= trainerCost(s)) out.push(`You can afford a master trainer (${trainerCost(s)}g, +2 stat points)`);
  return out;
}

/** Look over the opponent(s) before committing. Nothing is saved until you press Fight. */
function scoutScreen(s: Save) {
  const cands = scout(s);
  const free = cands.length > 1 && s.mode === 'free';
  const ladder = cands.find((c) => !c.bout.spar) ?? cands[0];
  const spar = cands.find((c) => c.bout.spar);
  const weakest = Math.max(...cands.map((c) => c.odds));
  // warn when the player looks too weak for what is on offer
  const risky = free ? weakest < 0.55 : ladder.odds < 0.4;
  const checklist = readiness(s);
  const warn = risky
    ? `<div class="warn"><b>⚠ You look outmatched${free ? ': even the weakest opponent is risky.' : ` (${Math.round(ladder.odds * 100)}% to win).`}</b>
      ${spar ? ' A sparring match is much safer.' : ''} Strengthen yourself first:${checklist.length ? `<ul>${checklist.map((x) => `<li>${x}</li>`).join('')}</ul>` : ' you are as prepared as you can be right now, so consider a safer option.'}</div>`
    : '';
  html(`<div class="card"><h2>${free ? 'Choose your opponent' : ladder.bout.label}</h2>
    ${tipBanner(s, isSeen(SCOUT_TIP.id) ? null : SCOUT_TIP)}
    <p class="dim">${free ? 'Tougher fights pay more gold. ' : ''}Win odds are a scouting estimate from practice bouts, not a promise.</p>
    ${warn}
    ${cands.map((c) => { const e = c.bout.enemy; return `<div class="card" style="margin:8px 0;background:#241b14"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><b>${e.name}</b>${!free && cands.length > 1 ? `<div style="color:#d9c25a">${c.bout.label}</div>` : ''}<div class="dim">${e.weapon.name}${e.shield ? ' + ' + e.shield.name : ''} · Lv ${e.level}${c.bout.reward !== 1 ? ` · gold x${c.bout.reward}` : ''}</div></div>
      <div>${oddsInfo(c.odds)}</div><button class="pri" data-pick="${c.pick}">Fight</button></div></div>`; }).join('')}
    ${gearWarn(s)}
    <div class="row"><button id="back">${risky ? 'Go back and prepare' : 'Back'}</button></div></div>`);
  wireTips();
  document.querySelectorAll<HTMLElement>('[data-pick]').forEach((e) => (e.onclick = () => {
    const c = cands.find((x) => x.pick === Number(e.dataset.pick))!;
    if (c.odds < 0.25 && !confirm(`Deadly odds (${Math.round(c.odds * 100)}% to win). You could die in this fight. Fight anyway?`)) return;
    bout = openBout(s, c.pick); commit(); watch();
  }));
  on('back', hub);
}

/** The fight is saved: closing or reloading returns here with the same opponent. */
function fightCard() {
  const s = save!, b = bout!, e = b.enemy;
  html(`<div class="card"><h2>${b.label}</h2>${e.boss ? `<div class="boss">☠ ${e.name} ☠</div><div class="dim">A notorious killer. Win and you will take something worth having.</div>` : ''}
    <p>Opponent: <b>${e.name}</b> <span class="dim">— ${e.weapon.name}${e.shield ? ' + ' + e.shield.name : ''}</span></p>
    ${gearWarn(s)}
    <p class="dim">The fight is under way. There is no turning back.</p>
    <div class="row"><button class="pri" id="fight">Fight</button></div></div>`, !!e.boss);
  on('fight', watch);
}

function watch() {
  const s = save!, b = bout!;
  result = runBout(b);
  html(`<div id="stage"></div>
    <div class="row">
      <button data-sp="0">❚❚</button><button data-sp="1" class="on">1x</button><button data-sp="2">2x</button><button data-sp="4">4x</button><button data-sp="999">Skip</button></div>
    <div class="msg" id="res"></div><div id="ticker"></div><div class="row" id="after"></div>`, !!b.enemy.boss);
  document.getElementById('stage')!.appendChild(canvas);
  const names = [b.player, b.enemy];
  const hud = (i: 0 | 1) => {
    const el = document.getElementById(`h${i}`); if (!el) return;
    const hp = viewer.hpNow[i], mx = viewer.maxHp[i], t = viewer.tiersNow[i];
    const p = (z: Zone) => Math.max(0, (100 * hp[z]) / mx[z]);
    el.innerHTML = `<b>${names[i].name}</b><div class="meter2"><i style="width:${p('torso')}%"></i></div>
      <div class="meter2" style="height:6px"><i style="width:${p('head')}%;background:#c4a24a"></i></div>
      <div class="zones">${ZONES.map((z) => `<span class="${t[z]}">${z.replace('armW', 'W-arm').replace('armS', 'S-arm').replace('legL', 'L-leg').replace('legR', 'R-leg')}</span>`).join('')}</div>`;
  };
  viewer.speed = 1;
  viewer.load(result, [b.player, b.enemy]);
  viewer.onHud = () => { hud(0); hud(1); };
  viewer.onLog = (line, cls = '') => {
    const t = document.getElementById('ticker'); if (!t) return;
    const d = document.createElement('div'); d.textContent = line; if (cls) d.className = cls;
    t.appendChild(d); t.scrollTop = t.scrollHeight;
  };
  viewer.onEnd = () => {
    const out = settleBout(s, b, result!);
    commit();
    const r = document.getElementById('res'); const a = document.getElementById('after');
    if (r) r.textContent = out.text.join(' ');
    if (a) { a.innerHTML = `<button class="pri" id="done">${s.alive ? 'Back to the hub' : 'See results'}</button>`; on('done', () => { msg = out.text.join(' '); hub(); }); }
  };
  hud(0); hud(1);
  document.querySelectorAll<HTMLElement>('[data-sp]').forEach((e) => (e.onclick = () => {
    viewer.speed = Number(e.dataset.sp);
    document.querySelectorAll('[data-sp]').forEach((x) => x.classList.remove('on')); e.classList.add('on');
  }));
}

// ---- run end -------------------------------------------------------------------------
function runEnd() {
  const s = save!;
  html(`<div class="card"><h2>Your run has ended</h2>
    ${endText(s)}
    <p class="dim">Best this save: ${s.best}</p>
    <div class="row"><button class="pri" id="again">New gladiator</button></div></div>`);
  app.insertAdjacentHTML('beforeend', leaderboardHtml());
  on('again', () => { clearSave(); save = null; create(); });
}

function careerPanel(s: Save) {
  const c = s.career;
  if (s.mode !== 'career' || !c) return '';
  let head: string, rows = '';
  if (inPrelims(c)) {
    head = `<div class="big">Unranked · win ${c.prelim.length - c.prelimWins} more qualifier${c.prelim.length - c.prelimWins === 1 ? '' : 's'} to enter the Top ${c.size}</div>`;
    rows = c.prelim.map((o, i) => `<div class="stat" style="${i === c.prelimWins ? 'color:#ffd24a;font-weight:600' : i < c.prelimWins ? 'opacity:.5' : ''}">
      <b style="width:46px">Q${i + 1}</b><span style="flex:1">${o.name} <span class="dim">· ${CLASSES[o.classId].label}</span></span>
      <span>${i < c.prelimWins ? 'won ✓' : i === c.prelimWins ? 'NEXT' : ''}</span></div>`).join('');
  } else if (c.champion) {
    head = `<div class="big">CHAMPION · ${c.defenses} title defense${c.defenses === 1 ? '' : 's'}. Lose once and your reign ends.</div>`;
  } else {
    head = `<div class="big">Top ${c.size} ladder · currently rank ${ladderRank(s)}</div>`;
    rows = [...c.ladder].map((o, i) => ({ o, i })).reverse().map(({ o, i }) => {
      const rk = c.size - i, done = i < c.beaten, next = i === c.beaten;
      return `<div class="stat" style="${next ? 'color:#ffd24a;font-weight:600' : done ? 'opacity:.5' : ''}">
        <b style="width:46px">#${rk}${rk === 1 ? ' 👑' : ''}</b><span style="flex:1">${o.name} <span class="dim">· ${CLASSES[o.classId].label}</span></span>
        <span>${done ? 'defeated ✓' : next ? 'NEXT' : ''}</span></div>`;
    }).join('');
  }
  return `<div class="card" style="margin:10px 0;background:#241b14">${head}${rows ? `<div style="max-height:250px;overflow:auto;margin-top:6px">${rows}</div>` : ''}</div>`;
}

function endText(s: Save) {
  const base = `${s.name} the ${CLASSES[s.classId].label}`;
  if (s.mode === 'career' && s.career) {
    const c = s.career;
    if (inPrelims(c)) return `<p>${base} never made it out of the qualifiers (${s.fights} fights). Score: <b>0</b></p>`;
    return c.champion
      ? `<p>${base} reigned as champion of the Top ${c.size} with <b>${c.defenses}</b> title defense${c.defenses === 1 ? '' : 's'} (${s.fights} fights). Score: <b>${score(s)}</b></p>`
      : `<p>${base} climbed to rank ${ladderRank(s)} of the Top ${c.size} (${c.beaten} of ${c.size} rivals beaten, ${s.fights} fights). Score: <b>${score(s)}</b></p>`;
  }
  return `<p>${base} ended the run with <b>${s.wins}</b> victories (${s.fights} fights). Score: <b>${score(s)}</b></p>`;
}

function leaderboardHtml() {
  const rows = loadScores();
  const sections: [string, string][] = [['career-10', 'Career · Top 10'], ['career-15', 'Career · Top 15'], ['career-20', 'Career · Top 20'], ['free-normal', 'Free · Normal'], ['free-hard', 'Free · Hard']];
  const body = sections.map(([key, label]) => {
    const top = rows.filter((r) => r.mode === key).slice(0, 5);
    return `<div class="card" style="flex:1;min-width:230px"><b>${label}</b>${top.length ? top.map((r, i) =>
      `<div class="stat"><span style="width:20px">${i + 1}.</span><span style="flex:1">${r.name} <span class="dim">${CLASSES[r.classId].label}</span></span><b>${r.score}</b></div>`).join('') : '<div class="dim">No runs yet</div>'}</div>`;
  }).join('');
  return `<div class="card" style="margin-top:10px"><h2>Leaderboard</h2><div class="row" style="align-items:stretch">${body}</div></div>`;
}

function gearPanel(s: Save) {
  const g = gearCondition(s);
  const bar = (label: string, v: number) => `<div class="stat"><b style="width:150px">${label}</b><div class="meter"><i style="width:${Math.max(0, v)}%;background:${v < 25 ? '#c4513a' : v < 50 ? '#d9a441' : '#6aa65a'}"></i></div><span style="width:56px;text-align:right">${v <= 0 ? 'BROKEN' : Math.round(v) + '%'}</span></div>`;
  return `<div style="margin:6px 0"><div class="dim" style="font-size:12px">Gear condition</div>${bar(`Weapon (${RARITIES[s.weaponTier]})`, g.weapon)}${g.shield === null ? '' : bar('Shield', g.shield)}${bar(`Armor (${RARITIES[s.armorTier]})`, g.armor)}${[s.loot?.weapon, s.loot?.armor].filter(Boolean).length ? `<div class="dim" style="font-size:12px">${[s.loot?.weapon, s.loot?.armor].filter(Boolean).join(' · ')}</div>` : ''}${perkLine(s)}${g.worn.length ? `<div class="dim" style="font-size:12px">Worn: ${g.worn.join(', ')}</div>` : ''}</div>`;
}

function gearWarn(s: Save) {
  const g = gearCondition(s), bits: string[] = [];
  if (g.weapon <= 0) bits.push('your weapon is broken, you will fight bare-handed');
  else if (g.weapon < 25) bits.push('your weapon is nearly broken');
  if (g.shield !== null && g.shield <= 0) bits.push('your shield is broken');
  if (s.gear.armor.torso <= 0 || s.gear.armor.head <= 0) bits.push('your armor is broken in vital spots');
  return bits.length ? `<p style="color:#ff8a6a">Warning: ${bits.join('; ')}. Repair in the shop first.</p>` : '';
}

function newsPanel(s: Save) {
  if (!s.news.length) return '';
  return `<div class="card" style="margin:8px 0;background:#241b14"><div class="dim" style="font-size:12px">Overnight</div>${s.news.map((n) => `<div>${n}</div>`).join('')}</div>`;
}

function offerScreen(s: Save) {
  const e = s.encounter!;
  const career = s.mode === 'career' && s.career && !inPrelims(s.career);
  html(`<div class="card" style="border:2px solid #7a0d12;background:#1c0a0c">
    <div class="dim">A notorious gladiator has come for you...</div>
    <div class="boss">☠ ${e.name} ☠</div>
    <p class="dim">${CLASSES[e.classId].label}, far stronger than anyone you have faced. Winning earns rare equipment (the higher you stand, the better it is).</p>
    <p>Scouting estimate: ${oddsInfo(estimateOdds(playerSpec(s), encounterSpec(e)))}</p>
    ${estimateOdds(playerSpec(s), encounterSpec(e)) < 0.25 ? '<div class="warn"><b>⚠ You are badly outmatched.</b> Accepting is likely to get you killed. Declining costs ranking, so train up before the next challenger if you can.</div>' : ''}
    <p style="color:#ff8a6a">Declining is safe, but costs you: ${career ? 'your ranking drops by 1 or 2 places.' : 'gold and reputation.'}</p>
    <div class="row"><button class="pri" id="acc">Accept the challenge</button><button id="dec">Decline</button></div></div>`, true);
  on('acc', () => { acceptEncounter(s); bout = openBout(s); commit(); fightCard(); });
  on('dec', () => { msg = declineEncounter(s); commit(); hub(); });
}

// ---- skills screen ---------------------------------------------------------------------------
function skillsScreen() {
  const s = save!;
  const { common, tree } = skillsFor(s.classId);
  const row = (sk: SkillDef) => {
    const owned = s.skills.includes(sk.id);
    const err = owned ? null : canLearn(s.skills, s.skillPoints, sk.id, s.classId);
    const req = sk.req ? ` <span class="dim">· needs ${SKILLS[sk.req].name}</span>` : '';
    return `<div class="skill ${owned ? 'owned' : ''}"><div style="flex:1;min-width:180px"><b>${sk.name}</b> <span class="dim">· ${sk.cost} pt${sk.cost > 1 ? 's' : ''}</span>${req}<div class="dim">${sk.desc}</div></div>
      ${owned ? '<span class="tag">Learned</span>' : `<button data-learn="${sk.id}" ${err ? 'disabled' : ''} title="${err ?? 'Learn this skill'}">Learn</button>`}</div>`;
  };
  const perks = [...s.perks.weapon, ...s.perks.armor];
  html(`<div class="card"><h2>Skills <span class="dim">· ${s.skillPoints} point${s.skillPoints === 1 ? '' : 's'} to spend</span></h2>
    <div class="msg">${msg}</div>
    <h2 style="margin-top:8px">${CLASSES[s.classId].label} tree</h2>${tree.map(row).join('')}
    <h2 style="margin-top:12px">Common</h2>${common.map(row).join('')}
    ${perks.length ? `<h2 style="margin-top:12px">Gear perks</h2>${perks.map((p) => `<div class="skill owned"><div><b>${SKILLS[p].name}</b><div class="dim">${SKILLS[p].desc}</div></div></div>`).join('')}` : ''}
    <div class="row"><button id="back">Back</button></div></div>`);
  document.querySelectorAll<HTMLElement>('[data-learn]').forEach((e) => (e.onclick = () => { msg = learnSkill(s, e.dataset.learn!); commit(); skillsScreen(); }));
  on('back', () => { msg = ''; hub(); });
}

function perkLine(s: Save) {
  const p = [...s.perks.weapon, ...s.perks.armor];
  return p.length ? `<div class="dim" style="font-size:12px">Perks: ${p.map((x) => SKILLS[x].name).join(', ')}</div>` : '';
}

function tipBanner(s: Save, tip: Tip | null = nextTip(s)) {
  return tip ? `<div class="tip"><span>💡 ${tip.text}</span><button data-tip="${tip.id}">Got it</button></div>` : '';
}
function wireTips() {
  document.querySelectorAll<HTMLElement>('[data-tip]').forEach((e) => (e.onclick = () => { dismissTip(e.dataset.tip!); e.closest('.tip')?.remove(); }));
}

function showHelp() {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="sheet">${HELP_HTML}<div class="row"><button class="pri" id="closehelp">Close</button><button id="resettips" title="Show the first-time tips again">Reset tips</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector('#closehelp')!.addEventListener('click', () => o.remove());
  o.querySelector('#resettips')!.addEventListener('click', () => { resetTips(); o.remove(); if (save && save.alive) hub(); });
  o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
}

menu();
