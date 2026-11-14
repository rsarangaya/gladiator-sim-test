import { CLASSES, makeSpec } from '../data/classes';
import { SKILLS, canLearn, skillsFor, type SkillDef } from '../data/skills';
import {
  MAX_ENERGY, STAT_SHORT, buyItem, dropItem, setHand, useItem, permanentWounds, PROSTHETIC_COST, REST_GOLD, START_POINTS, STAT_KEYS, TIER_COSTS,
  actionRng, hireTrainer, trainerCost, buyProsthetic, buyTier, clearSave, level, loadGame, newGame, openBout, rest, runBout, saveGame,
  settleBout, spendPoint, stats, train, type Bout, type Difficulty, type Save, type Mode,
  learnSkill, CAREER_SIZES, PRELIMS, RARITIES, acceptEncounter, declineEncounter, encounterSpec, estimateOdds, gearCondition, inPrelims, playerSpec, repair, repairCost, scout, waitCost, ladderRank, loadScores, retire, score, waitDay,
} from '../game/state';
import { drawPortrait } from '../render/portrait';
import { INV_SLOTS, ITEMS, ITEM_IDS } from '../data/items';
import { bagHtml } from './bag';
import { EXERCISE_MS, drawExercise, drawGain } from '../render/exercise';
import { IDLE, lookFor, pose } from '../render/rig';
import {
  GROUND_SPOTS, SHOPKEEPER_LOOK, STATIONS, TRAINER_POSE, YARD_SPOTS, drawCharacter, drawGate, drawGrounds, drawShopScene, drawYard, iconCanvas,
  shopkeeperSpec, speech, trainerSpec, type IconKind, type StatKey,
} from '../render/scenes';
import { Splash } from '../render/splash';
import { Viewer } from '../render/viewer';
import { SceneCanvas } from './scene';
import { HELP_HTML, SCOUT_TIP, dismissTip, isSeen, nextTip, resetTips, type Tip } from './tips';
import { CLASS_IDS, ZONES, type ClassId, type FightResult, type Stats, type Zone } from '../sim/types';

const app = document.getElementById('app')!;
let save: Save | null = loadGame();
let msg = '';

const STAT_LABEL: Record<keyof Stats, string> = { str: 'Right arm', strL: 'Left arm', agi: 'Agility', vit: 'Vitality', end: 'Endurance', tec: 'Technique', spi: 'Spirit' };
const STAT_HINT: Record<keyof Stats, string> = {
  str: 'weapon-hand damage', strL: 'shield blocks, second blade, net', agi: 'hit, dodge, speed', vit: 'health', end: 'stamina', tec: 'crits, aim, blocking', spi: 'will to fight on',
};
const ZONE_LABEL: Record<Zone, string> = { head: 'Head', torso: 'Torso', armW: 'Weapon arm', armS: 'Shield arm', legL: 'Left leg', legR: 'Right leg' };

const canvas = document.createElement('canvas');

const viewer = new Viewer(canvas);
const splash = new Splash();
const scene = new SceneCanvas();

function html(strings: string, storm = false) {
  splash.stop();
  scene.stop();
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
  const alloc: Stats = { str: 0, strL: 0, agi: 0, vit: 0, end: 0, tec: 0, spi: 0 };
  const left = () => START_POINTS - STAT_KEYS.reduce((a, k) => a + alloc[k], 0);

  const render = () => {
    const nameVal = (document.getElementById('name') as HTMLInputElement | null)?.value ?? '';
    const c = CLASSES[classId];
    html(`<div class="card"><h2>Create your gladiator</h2>
      <div class="row"><input id="name" placeholder="Name" maxlength="20" value="${nameVal.replace(/"/g, '')}" /></div>
      <div class="grid">${CLASS_IDS.map((id) => `<div class="card pick ${id === classId ? 'sel' : ''}" data-c="${id}">
        <canvas data-pv="${id}" width="76" height="104" style="float:left;margin-right:10px;border-radius:8px;width:76px;height:104px"></canvas><b>${CLASSES[id].label}</b><div class="dim">${CLASSES[id].blurb}</div><div class="pc"><span class="pro">+ ${CLASSES[id].pros}</span><span class="con">- ${CLASSES[id].cons}</span></div><div class="dim">Signature: ${CLASSES[id].signature}</div></div>`).join('')}</div>
      <h2 style="margin-top:12px">Stat points: ${left()} left</h2>
      ${STAT_KEYS.map((k) => `<div class="stat"><b style="width:64px">${STAT_SHORT[k]}</b><span style="width:170px">${STAT_LABEL[k]} <span class="dim">(${STAT_HINT[k]})</span></span>
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
// ---- the town: illustrated yard, shop, training grounds and the coliseum gate ---------------------
const iconHtml = (k: IconKind, sz = 26, cls = '') => `<span class="ic ${cls}" data-ic="${k}" data-sz="${sz}"></span>`;
function fillIcons() {
  document.querySelectorAll<HTMLElement>('[data-ic]').forEach((el) => { if (!el.firstChild) el.appendChild(iconCanvas(el.dataset.ic as IconKind, Number(el.dataset.sz || 26))); });
}

const ZONE_EFFECT: Record<Zone, string> = {
  head: 'worse accuracy, easier to stun', torso: 'less total health', armW: 'weaker hits, slower swings',
  armS: 'weaker blocking', legL: 'slower, easier to hit', legR: 'slower, easier to hit',
};
const TIER_TEXT = {
  bruised: 'starts each fight with 12% less health in that spot. Heals with rest.',
  wounded: 'starts each fight with 35% less health in that spot. Heals with rest.',
  maimed: 'the limb is gone and you start every fight without it. A prosthetic gives back most of it.',
} as const;
function injuryPanel(s: Save) {
  const rows = ZONES.filter((z) => s.injuries[z]).map((z) => {
    const t = s.injuries[z]!;
    const lost = t === 'maimed' && !s.prosthetics[z];
    const perm = t === 'maimed' && permanentWounds(s) ? ' Permanent in this mode.' : '';
    return `<div class="inj ${t}"><b>${ZONE_LABEL[z]}: ${lost ? 'lost' : s.prosthetics[z] && t === 'maimed' ? 'prosthetic' : t}</b> <span class="dim">- ${ZONE_EFFECT[z]}; ${t === 'maimed' && s.prosthetics[z] ? 'prosthetic fitted, starts each fight at about 65%.' : TIER_TEXT[t]}${perm}</span></div>`;
  });
  if (!rows.length) return '';
  const tail = s.mode === 'career' || s.difficulty === 'hard' ? '' : '';
  return `<div class="injpanel"><div class="dim" style="font-size:12px">Injuries. If you stay badly hurt and skip rest, you can catch an infection and be laid up.</div>${rows.join('')}${tail}</div>`;
}

function topBar(s: Save) {
  const bolts = Array.from({ length: MAX_ENERGY }, (_, i) => `<span class="ic ${i < s.energy ? '' : 'off'}" data-ic="bolt" data-sz="22"></span>`).join('');
  return `<div class="topbar"><div class="who"><b>${s.name}</b><span class="dim"> Lv ${level(s)} ${CLASSES[s.classId].label}</span>${s.sick > 0 ? '<span class="tag wounded">Sick</span>' : ''}${s.bedridden > 0 ? '<span class="tag maimed">Bedridden</span>' : ''}</div>
    <div class="day">Day ${s.day}</div><div class="res">${iconHtml('coin', 22)}<b>${s.gold}</b><span class="bolts">${bolts}</span></div></div>`;
}

function chips(s: Save) {
  const st = stats(s);
  return STAT_KEYS.map((k) => `<div class="chip" title="${STAT_LABEL[k]}: ${STAT_HINT[k]}">${iconHtml(k as IconKind, 22)}<b>${st[k]}</b>${s.unspent > 0 ? `<button class="plus" data-sp="${k}" title="Spend a stat point">+</button>` : ''}</div>`).join('');
}

function wireStatButtons(s: Save, refresh: () => void) {
  document.querySelectorAll<HTMLElement>('[data-sp]').forEach((e) => (e.onclick = () => { spendPoint(s, e.dataset.sp as keyof Stats); commit(); refresh(); }));
}

function hub() {
  const s = save!;
  if (!s.alive) return runEnd();
  if (s.pending) return arena(); // an entered fight is binding: reopening resumes the same one
  if (s.encounter && !s.encounter.accepted) return offerScreen(s); // an infamous challenger must be answered first
  const g = gearCondition(s);
  const todo = [s.unspent > 0 ? `${s.unspent} stat point${s.unspent > 1 ? 's' : ''} to spend (tap +)` : '', s.skillPoints > 0 ? `${s.skillPoints} skill point${s.skillPoints > 1 ? 's' : ''}: visit the scroll` : ''].filter(Boolean);
  html(`<div class="town">${topBar(s)}${tipBanner(s)}${newsPanel(s)}${careerPanel(s)}
    <div class="stagewrap" id="stage"></div>
    <div class="chips">${chips(s)}</div>
    ${injuryPanel(s)}
    ${todo.length ? `<div class="big" style="text-align:center">${todo.join(' · ')}</div>` : ''}
    <div class="msg">${msg}</div>
    <div class="icons">
      <button class="ibtn" id="rest" title="Rest: heals bruises and wounds, cures fever (1 energy, ${REST_GOLD}g)">${iconHtml('tent', 22)}<small>Rest</small></button>
      <button class="ibtn" id="gear" title="Equipment: weapon, shield, armor and their condition">${iconHtml('armor', 22)}<small>Gear</small></button>
      <button class="ibtn ${s.skillPoints > 0 ? 'glow' : ''}" id="skills" title="Learn skills">${iconHtml('scroll', 22)}<small>Skills</small></button>
      <button class="ibtn" id="wait" title="Skip to the next day. Costs gold, and rivals keep growing stronger.">${iconHtml('hourglass', 22)}<small>${waitCost(s)}g</small></button>
      <span class="sp"></span>
      <button class="ibtn" id="retire" title="End this run and record your score">${iconHtml('flag', 22)}</button>
      <button class="ibtn" id="menu" title="Main menu">${iconHtml('menu', 22)}</button>
      <button class="ibtn" id="help" title="How to play">${iconHtml('help', 22)}</button>
    </div></div>`);
  document.getElementById('stage')!.appendChild(scene.el);
  fillIcons(); wireTips(); wireStatButtons(s, hub);
  const spec = playerSpec(s);
  const badges = {
    skills: s.skillPoints > 0 ? String(s.skillPoints) : undefined,
    rest: Object.keys(s.injuries).length ? '!' : undefined,
    shop: g.weapon < 70 || g.armor < 70 ? '!' : undefined,
    training: s.energy > 0 && s.bedridden === 0 ? String(s.energy) : undefined,
  };
  scene.spots = YARD_SPOTS;
  scene.draw = (c, t, hover) => { drawYard(c, t, hover, badges); drawCharacter(c, spec, 480, 522, 1.55, { t, injuries: s.injuries, prosthetics: s.prosthetics }); };
  scene.onClick = (id) => {
    if (id === 'coliseum') arena();
    else if (id === 'shop') { shopMsg = ''; shop(); }
    else if (id === 'training') { msg = ''; training(); }
    else if (id === 'rest') { msg = rest(s); commit(); hub(); }
    else if (id === 'skills') { msg = ''; skillsScreen(); }
    else if (id === 'gear') equipment();
  };
  scene.start();
  on('rest', () => { msg = rest(s); commit(); hub(); });
  on('skills', () => { msg = ''; skillsScreen(); });
  on('gear', () => equipment());
  on('wait', () => { msg = waitDay(s); commit(); hub(); });
  on('menu', menu); on('help', showHelp);
  on('retire', () => { if (confirm('Retire this gladiator and record the score?')) { retire(s); commit(); hub(); } });
}

// ---- training grounds ----------------------------------------------------------------------------
function training() {
  const s = save!;
  const canTrain = s.energy > 0 && s.bedridden === 0;
  html(`<div class="town">${topBar(s)}${tipBanner(s)}
    <div class="stagewrap" id="stage"></div>
    <div class="chips">${chips(s)}</div>
    ${injuryPanel(s)}
    <div class="msg">${msg || (canTrain ? 'Pick a station. Each session costs 1 energy.' : 'You are too tired to train. Rest, or wait a day.')}</div>
    <div class="icons"><button class="ibtn" id="back">${iconHtml('ground', 22)}<small>Back to the yard</small></button></div></div>`);
  document.getElementById('stage')!.appendChild(scene.el);
  fillIcons(); wireTips(); wireStatButtons(s, training);
  const spec = playerSpec(s), vals = stats(s);
  const tr = trainerSpec();
  scene.spots = GROUND_SPOTS;
  scene.draw = (c, t, hover) => {
    drawGrounds(c, t, hover, canTrain, vals);
    drawCharacter(c, tr, 267, 540, 0.95, { t, armed: false, pose: TRAINER_POSE, look: SHOPKEEPER_LOOK(tr) });
    drawCharacter(c, spec, 533, 540, 0.95, { t, injuries: s.injuries, prosthetics: s.prosthetics });
    const st = STATIONS.find((x) => x.id === hover);
    if (st) speech(c, `${st.what}: +1 ${st.label} (1 energy)`, Math.min(st.x - 40, 700), 190, 260);
    else if (hover === 'trainer') speech(c, `Hire me: +2 stat points for ${trainerCost(s)} gold.`, 200, 420, 260);
  };
  scene.onClick = (id) => {
    if (id === 'trainer') {
      if (confirm(`Hire the master trainer for ${trainerCost(s)} gold? You get +2 stat points to spend.`)) { msg = hireTrainer(s); commit(); training(); }
      return;
    }
    if (!canTrain) { msg = s.bedridden > 0 ? 'You are bedridden.' : 'You are too tired to train.'; training(); return; }
    startExercise(id as StatKey);
  };
  scene.start();
  on('back', () => { msg = ''; hub(); });
}

/** A very brief exercise scene, then the result, then back to the training grounds. */
function startExercise(stat: StatKey) {
  const s = save!;
  const spec = playerSpec(s);
  const before = stats(s)[stat];
  const t0 = performance.now();
  let result = '', gain = 0, applied = false;
  scene.spots = [];
  scene.draw = (c, t) => {
    const el = performance.now() - t0;
    if (el < EXERCISE_MS) { drawExercise(c, stat, el / EXERCISE_MS, t, spec, { injuries: s.injuries, prosthetics: s.prosthetics }); return; }
    if (!applied) { applied = true; result = train(s, stat, actionRng(s, stat)); gain = stats(s)[stat] - before; msg = result; commit(); }
    drawExercise(c, stat, 0.999, t, spec, { injuries: s.injuries, prosthetics: s.prosthetics });
    const hurt = /strained/.test(result);
    drawGain(c, gain > 0 ? `+${gain} ${STAT_SHORT[stat]}` : 'No gain', hurt ? '#ff6a50' : gain > 1 ? '#ffd24a' : gain > 0 ? '#9be37a' : '#cfc6b0', Math.min(1, (el - EXERCISE_MS) / 1000), stat);
    if (el > EXERCISE_MS + 1050) { scene.draw = () => {}; training(); }
  };
}

// ---- shop ------------------------------------------------------------------------------------------
let shopMsg = '';

// ---- equipment: what you carry, how worn it is --------------------------------------------------
function equipment(back: () => void = hub) {
  const s = save!, spec = playerSpec(s), g = s.gear;
  const bar = (v: number) => `<div class="meter"><i style="width:${Math.max(0, v)}%;background:${v < 25 ? '#c4513a' : v < 50 ? '#d9a441' : '#6aa65a'}"></i></div><span class="pct">${v <= 0 ? 'BROKEN' : Math.round(v) + '%'}</span>`;
  const slot = (ic: IconKind, title: string, sub: string, v: number | null, extra = '') =>
    `<div class="slot">${iconHtml(ic, 40, 'big')}<div class="gd"><b>${title}</b><div class="dim">${sub}</div>${extra}</div>${v === null ? '' : `<div class="cond">${bar(v)}</div>`}</div>`;
  const w = spec.weapon;
  const perks = (list: string[]) => list.length ? `<div class="perk">${list.map((x) => SKILLS[x].name).join(', ')}</div>` : '';
  const zones = ZONES.map((z) => slot('armor', ZONE_LABEL[z], `Armor ${spec.armor[z]}${s.injuries[z] ? ' · ' + s.injuries[z] : ''}${s.prosthetics[z] ? ' · prosthetic' : ''}`, g.armor[z])).join('');
  html(`<div class="town">${topBar(s)}
    <div class="equip">
      <div class="paper"><canvas id="eqpv" width="220" height="330" style="width:220px;height:330px"></canvas><div class="dim" style="text-align:center">${s.name} · Lv ${level(s)} ${CLASSES[s.classId].label}</div></div>
      <div class="slots">
        ${injuryPanel(s)}
        <h3>Weapon hand</h3>
        <div class="hand"><button id="hR" class="${s.lefty ? '' : 'pri'}">Right hand (arm ${stats(s).str})</button><button id="hL" class="${s.lefty ? 'pri' : ''}">Left hand (arm ${stats(s).strL})</button><span class="dim">The weapon uses that arm's strength; the shield or off hand uses the other.</span></div>
        <h3>Bag ${(s.inv ?? []).length}/${INV_SLOTS}</h3>
        ${bagHtml(s, iconHtml)}
        <div class="msg">${msg}</div>
        <h3>Weapon</h3>
        ${slot('sword', `${RARITIES[s.weaponTier]} ${w.name}`, `Damage ${Math.round(w.dmg)} · Reach ${w.reach.toFixed(1)} · Speed ${w.speed.toFixed(2)}${s.loot?.weapon ? ' · ' + s.loot.weapon : ''}`, g.weapon, perks(s.perks.weapon))}
        ${spec.shield ? slot('shield', spec.shield.name, `Blocks ${Math.round(spec.shield.block * 100)}% · Absorbs ${Math.round(spec.shield.absorb * 100)}%`, g.shield) : ''}
        <h3>Armor · ${RARITIES[s.armorTier]}${s.loot?.armor ? ' · ' + s.loot.armor : ''}</h3>
        ${perks(s.perks.armor)}${zones}
      </div>
    </div>
    <div class="icons"><button class="ibtn" id="repairall">${iconHtml('hammer', 22)}<small>Repair all · ${repairCost(s, 'all')}g (shop)</small></button><button class="ibtn" id="back">${iconHtml('ground', 22)}<small>Back</small></button></div></div>`);
  fillIcons();
  document.querySelectorAll<HTMLElement>('[data-use]').forEach((b) => (b.onclick = () => { msg = useItem(s, Number(b.dataset.use)); commit(); equipment(back); }));
  document.querySelectorAll<HTMLElement>('[data-drop]').forEach((b) => (b.onclick = () => { dropItem(s, Number(b.dataset.drop)); commit(); equipment(back); }));
  on('hR', () => { setHand(s, false); commit(); equipment(back); }); on('hL', () => { setHand(s, true); commit(); equipment(back); });
  const cv = document.getElementById('eqpv') as HTMLCanvasElement;
  drawPortrait(cv, spec, { injuries: s.injuries, prosthetics: s.prosthetics });
  on('back', back);
  on('repairall', () => { shopMsg = ''; shop(); });
}

function shop() {
  const s = save!;
  const tierPrice = (kind: 'weapon' | 'armor') => { const t = kind === 'weapon' ? s.weaponTier : s.armorTier; return t >= 2 ? null : TIER_COSTS[kind][t]; };
  const good = (ic: IconKind, title: string, desc: string, price: string, id: string, disabled = false, data = '') =>
    `<div class="good">${iconHtml(ic, 40, 'big')}<div class="gd"><b>${title}</b><div class="dim">${desc}</div></div><button id="${id}" ${data} class="pri" ${disabled ? 'disabled' : ''}>${price}</button></div>`;
  const wp = tierPrice('weapon'), ap = tierPrice('armor');
  const maimed = ZONES.filter((z) => s.injuries[z] === 'maimed');
  const items = [
    good('sword', wp ? `${RARITIES[s.weaponTier + 1]} weapon` : 'Weapon', wp ? `+10% damage${s.weaponTier + 1 >= 2 ? ', with a perk' : ''}` : 'Nothing better in stock', wp ? `${wp}g` : 'Max', 'bw', !wp),
    good('armor', ap ? `${RARITIES[s.armorTier + 1]} armor` : 'Armor', ap ? `+6 armor on every zone${s.armorTier + 1 >= 2 ? ', with a perk' : ''}` : 'Nothing better in stock', ap ? `${ap}g` : 'Max', 'ba', !ap),
    good('hammer', 'Repair weapon', 'Sharpened and balanced again', `${repairCost(s, 'weapon')}g`, 'rpw', !repairCost(s, 'weapon')),
    ...(gearCondition(s).shield !== null ? [good('shield', 'Repair shield', 'Dents hammered out', `${repairCost(s, 'shield')}g`, 'rps', !repairCost(s, 'shield'))] : []),
    good('armor', 'Repair armor', 'Every plate and strap', `${repairCost(s, 'armor')}g`, 'rpa', !repairCost(s, 'armor')),
    good('hammer', 'Repair everything', 'The full overhaul', `${repairCost(s, 'all')}g`, 'rpall', !repairCost(s, 'all')),
    ...ITEM_IDS.map((id) => good(ITEMS[id].icon, ITEMS[id].name, ITEMS[id].desc, `${ITEMS[id].price}g`, 'bi_' + id, (s.inv ?? []).length >= INV_SLOTS)),
    ...maimed.map((z) => good('leg', `${ZONE_LABEL[z]} prosthetic`, 'Halves the lasting damage', s.prosthetics[z] ? 'Fitted' : `${PROSTHETIC_COST}g`, 'pz_' + z, !!s.prosthetics[z])),
  ];
  html(`<div class="town">${topBar(s)}
    <div class="stagewrap" id="stage"></div>
    <div class="goods">${items.join('')}</div>
    ${gearPanel(s)}
    <div class="icons"><button class="ibtn" id="gear">${iconHtml('armor', 22)}<small>My equipment</small></button><button class="ibtn" id="back">${iconHtml('shop', 22)}<small>Leave the shop</small></button></div></div>`);
  document.getElementById('stage')!.appendChild(scene.el);
  fillIcons();
  on('gear', () => equipment(shop));
  const keeper = shopkeeperSpec();
  const line = /^Bought/.test(shopMsg) ? 'A fine choice! May it serve you well.' : /^Repaired/.test(shopMsg) ? 'Good as new, friend.' : /nothing better|best/i.test(shopMsg) ? 'That is the finest I have, I swear it.'
    : /cost|Need|wants/i.test(shopMsg) ? 'Come back when your purse is heavier.' : shopMsg || ['Welcome, gladiator! Steel and leather at fair prices.', 'Looking to survive another day?', 'Mind the sharp end.'][s.day % 3];
  const born = performance.now();
  scene.spots = [];
  scene.draw = (c, t) => {
    const talking = performance.now() - born < 2200;
    drawShopScene(c, t, () => drawCharacter(c, keeper, 480, 560, 3, {
      t, armed: false, look: SHOPKEEPER_LOOK(keeper),
      pose: pose({ lean: 0, wU: talking ? 125 + Math.sin(t * 6) * 18 : 38, wL: talking ? 150 : 70, sU: 38, sL: 70, fU: 8, fL: 2, bU: -8, bL: -2, head: talking ? Math.sin(t * 5) * 3 : 0 }),
    }));
    speech(c, line, 540, 170, 300);
  };
  scene.start();
  const buy = (fn: () => string) => () => { shopMsg = fn(); commit(); shop(); };
  on('bw', buy(() => buyTier(s, 'weapon'))); on('ba', buy(() => buyTier(s, 'armor')));
  on('rpw', buy(() => repair(s, 'weapon'))); on('rps', buy(() => repair(s, 'shield'))); on('rpa', buy(() => repair(s, 'armor'))); on('rpall', buy(() => repair(s, 'all')));
  ITEM_IDS.forEach((id) => on('bi_' + id, buy(() => buyItem(s, id))));
  maimed.forEach((z) => on('pz_' + z, buy(() => buyProsthetic(s, z))));
  on('back', () => { shopMsg = ''; msg = ''; hub(); });
}

// ---- arena: the coliseum gate with the next fights ------------------------------------------------
function readiness(s: Save): string[] {
  const out: string[] = [];
  if (s.unspent > 0) out.push(`${s.unspent} unspent stat point${s.unspent > 1 ? 's' : ''}: spend them with the + buttons`);
  if (s.skillPoints > 0) out.push(`${s.skillPoints} unspent skill point${s.skillPoints > 1 ? 's' : ''}: visit the scroll`);
  if (Object.keys(s.injuries).length) out.push('You are injured: rest in the tent heals bruises and wounds');
  const g = gearCondition(s);
  if (g.weapon < 60 || g.armor < 60 || (g.shield !== null && g.shield < 40)) out.push('Your gear is worn: repair it in the shop');
  if (s.energy > 0 && s.bedridden === 0) out.push(`${s.energy} energy unused: the training grounds make you stronger`);
  if (s.gold >= trainerCost(s)) out.push(`You can afford the master trainer (${trainerCost(s)}g, +2 stat points)`);
  return out;
}

/** Look over the next fight(s) at the gate. Nothing is saved until you press Fight. */
function scoutScreen(s: Save) {
  const cands = scout(s);
  const free = cands.length > 1 && s.mode === 'free';
  const ladder = cands.find((c) => !c.bout.spar) ?? cands[0];
  const spar = cands.find((c) => c.bout.spar);
  const weakest = Math.max(...cands.map((c) => c.odds));
  const risky = free ? weakest < 0.55 : ladder.odds < 0.4;
  const checklist = readiness(s);
  let sel = Math.max(0, cands.findIndex((c) => c.pick === 1));
  const warn = risky
    ? `<div class="warn"><b>⚠ You look outmatched${free ? ': even the weakest opponent is risky.' : ` (${Math.round(ladder.odds * 100)}% to win).`}</b>
      ${spar ? ' A sparring match is much safer.' : ''} Strengthen yourself first:${checklist.length ? `<ul>${checklist.map((x) => `<li>${x}</li>`).join('')}</ul>` : ' you are as prepared as you can be right now, so consider a safer option.'}</div>`
    : '';
  const foe = (c: (typeof cands)[number], i: number) => {
    const e = c.bout.enemy;
    return `<div class="foe ${i === sel ? 'sel' : ''}" data-foe="${i}">
      <canvas class="pv" data-foe-pv="${i}" width="84" height="112"></canvas>
      <div class="fd"><b>${e.name}</b>${cands.length > 1 ? `<div class="gold">${c.bout.label}</div>` : ''}
        <div class="dim">${iconHtml('sword', 16)} ${e.weapon.name}${e.shield ? ' + ' + e.shield.name : ''} · Lv ${e.level}${e.skills?.length ? ` · ${e.skills.length} skills` : ''}${c.bout.reward !== 1 ? ` · gold x${c.bout.reward}` : ''}</div>
        <div class="odds">${oddsInfo(c.odds)}<div class="bar"><i style="width:${Math.round(c.odds * 100)}%;background:${c.odds >= 0.7 ? '#6aa65a' : c.odds >= 0.45 ? '#d9c25a' : c.odds >= 0.25 ? '#e08a3a' : '#e04030'}"></i></div></div></div>
      <button class="pri" data-pick="${c.pick}">Fight</button></div>`;
  };
  html(`<div class="town">${topBar(s)}
    <div class="stagewrap" id="stage"></div>
    ${tipBanner(s, isSeen(SCOUT_TIP.id) ? null : SCOUT_TIP)}
    ${warn}
    <div class="foes">${cands.map(foe).join('')}</div>
    ${gearWarn(s)}
    <div class="icons"><button class="ibtn" id="back">${iconHtml('coliseum', 22)}<small>${risky ? 'Go back and prepare' : 'Back to the yard'}</small></button></div></div>`);
  document.getElementById('stage')!.appendChild(scene.el);
  fillIcons(); wireTips();
  cands.forEach((c, i) => { const cv = document.querySelector<HTMLCanvasElement>(`[data-foe-pv="${i}"]`); if (cv) drawPortrait(cv, c.bout.enemy); });
  const me = playerSpec(s);
  const drawStage = () => {
    scene.draw = (c, t) => {
      const cand = cands[sel], e = cand.bout.enemy;
      drawGate(c, t);
      drawCharacter(c, me, 290, 524, 1.9, { t, injuries: s.injuries, prosthetics: s.prosthetics, pose: { ...IDLE, lean: 6, wU: 70, wL: 84 } });
      drawCharacter(c, e, 670, 524, 1.9, { t, flip: true, look: lookFor(e, 1), pose: { ...IDLE, lean: 6, wU: 70, wL: 84 } });
      c.textAlign = 'center'; c.font = 'bold 26px system-ui'; c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = '#1d1511';
      const plate = (txt: string, x: number, col: string) => { c.strokeText(txt, x, 64); c.fillStyle = col; c.fillText(txt, x, 64); };
      plate(me.name, 250, '#f1e6d0'); plate(e.name, 710, '#ffb0a0');
      c.font = 'bold 46px system-ui'; c.strokeText('VS', 480, 300); c.fillStyle = '#ffd24a'; c.fillText('VS', 480, 300);
      const pct = Math.round(cand.odds * 100);
      c.lineWidth = 12; c.strokeStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.arc(480, 200, 46, 0, 7); c.stroke();
      c.strokeStyle = cand.odds >= 0.7 ? '#6aa65a' : cand.odds >= 0.45 ? '#d9c25a' : cand.odds >= 0.25 ? '#e08a3a' : '#e04030';
      c.beginPath(); c.arc(480, 200, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cand.odds); c.stroke();
      c.font = 'bold 30px system-ui'; c.lineWidth = 5; c.strokeStyle = '#1d1511'; c.strokeText(`${pct}%`, 480, 211); c.fillStyle = '#fff'; c.fillText(`${pct}%`, 480, 211);
    };
  };
  drawStage();
  scene.start();
  const select = (i: number) => { sel = i; document.querySelectorAll('.foe').forEach((el, k) => el.classList.toggle('sel', k === i)); };
  document.querySelectorAll<HTMLElement>('[data-foe]').forEach((e) => (e.onclick = () => select(Number(e.dataset.foe))));
  document.querySelectorAll<HTMLElement>('[data-pick]').forEach((e) => (e.onclick = (ev) => {
    ev.stopPropagation();
    const c = cands.find((x) => x.pick === Number(e.dataset.pick))!;
    if (c.odds < 0.25 && !confirm(`Deadly odds (${Math.round(c.odds * 100)}% to win). You could die in this fight. Fight anyway?`)) return;
    bout = openBout(s, c.pick); commit(); watch();
  }));
  on('back', hub);
}

() => ''
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
  const label = inPrelims(c) ? 'Qualifiers' : 'Rankings';
  return `<div class="card ranks" style="margin:10px 0;background:#241b14">${head}${rows ? `<details class="rk"><summary class="ibtn">${label}</summary><div style="max-height:250px;overflow:auto;margin-top:6px">${rows}</div></details>` : ''}</div>`;
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
