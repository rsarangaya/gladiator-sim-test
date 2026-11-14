import { ACTIONS, TUNING, ZONE_DMG_MULT, type ActionDef } from '../data/actions';
import { decide, type Decision } from './ai';
import {
  accMod, actionDuration, bleedDmgPerTick, blockMod, canBlock, disarm, evaMod, makeRuntime,
  moveSpeed, reachOf, startAction, tierOf, weaponArmMod, type Runtime,
} from './fighter';
import { rollInjuries } from './injuries';
import { chance, clamp, deriveSeed, mulberry32, range } from './rng';
import {
  TIME_CAP_TICKS, ZONES,
  type EndMethod, type FightEvent, type FightResult, type FighterSpec, type Zone, type ZoneChange,
} from './types';

const SIG = new Set(['bash', 'hook', 'wall', 'net', 'whirl', 'cleave']);

export interface SimOptions {
  /** keep the event log + position track (viewer/replay). Off for bulk balance runs. */
  log?: boolean;
}

interface Pending {
  att: Runtime;
  def: Runtime;
  act: ActionDef;
}

export function simulateFight(a: FighterSpec, b: FighterSpec, seed: number, opts: SimOptions = {}): FightResult {
  const log = opts.log ?? true;
  const rng = mulberry32(seed);
  // Separate stream reserved for flavor (text/animation variants) so it never perturbs results.
  void deriveSeed(seed, 1);

  const fs: [Runtime, Runtime] = [makeRuntime(a, 0, rng), makeRuntime(b, 1, rng)];
  const events: FightEvent[] = [];
  const track: Array<[number, number]> = [];
  const emit = (e: FightEvent) => { if (log) events.push(e); };
  const snap = (): FightEvent['hp'] => [{ ...fs[0].hp }, { ...fs[1].hp }];

  let tick = 0;
  let method: EndMethod = 'cap';
  let winner: 0 | 1 | null = null;
  let over = false;

  const finish = (m: EndMethod, w: 0 | 1 | null) => {
    if (over) return;
    over = true; method = m; winner = w;
  };

  // ---- damage application ----------------------------------------------------
  function hurt(def: Runtime, zone: Zone, dmg: number, changes: ZoneChange[]) {
    const before = def.tier[zone];
    if (def.hp[zone] <= 0) {
      // already disabled limb: part of the blow carries into the torso
      def.hp.torso = Math.max(0, def.hp.torso - dmg * TUNING.disabledSpill);
    } else {
      def.hp[zone] = Math.max(0, def.hp[zone] - dmg);
      if (zone !== 'torso' && zone !== 'head') {
        def.hp.torso = Math.max(0, def.hp.torso - dmg * TUNING.limbSpill);
      }
    }
    for (const z of ZONES) {
      const t = tierOf(def.hp[z], def.max[z]);
      if (t !== def.tier[z]) {
        def.tier[z] = t;
        changes.push({ zone: z, hp: Math.round(def.hp[z] * 10) / 10, tier: t });
      }
    }
    if (def.tier[zone] === 'disabled' && before !== 'disabled' && zone === 'armW' && !def.disarmed) disarm(def);
    if (def.hp.torso <= 0 || def.hp.head <= 0) def.dead = true;
  }

  function interrupt(f: Runtime, ticks: number) {
    if (f.grace > 0) return; // no stun-locking
    f.act = null;
    f.frame = 0;
    f.stun = Math.max(f.stun, ticks);
    f.grace = ticks + 16;
  }

  // ---- hit resolution --------------------------------------------------------
  function calcDamage(att: Runtime, def: Runtime, zone: Zone, act: ActionDef, crit: boolean): number {
    const s = att.spec.stats;
    let d = att.weapon.dmg * act.dmgMult * (0.5 + s.str / 100) * ZONE_DMG_MULT[zone];
    d *= range(rng, 0.85, 1.15) * att.form * weaponArmMod(att) * TUNING.damageScale;
    if (att.stam / att.maxStam < 0.3) d *= 0.85;
    if (att.weapon.closeMin && Math.abs(att.x - def.x) < att.weapon.closeMin) d *= TUNING.crowdDmg;
    const m = att.mods;
    d *= m.dmg;
    if (act.id === 'light') d *= m.light; else if (act.id === 'heavy') d *= m.heavy; else if (SIG.has(act.id)) d *= m.sig;
    if (zone === 'head') d *= m.headDmg; else if (zone === 'legL' || zone === 'legR') d *= m.legDmg;
    if (def.hp.torso / def.max.torso < 0.35) d *= 1 + m.execute;
    if (att.hp.torso / att.max.torso < 0.25) d *= 1 + m.lastStand;
    if (crit) d *= TUNING.critMult + m.critMult;
    const armor = def.spec.armor[zone] * def.mods.armor * (1 - Math.min(0.9, (act.armorPierce ?? 0) + m.pierce));
    d *= 100 / (100 + armor * 1.5);
    return Math.max(1, d);
  }

  function resolve(p: Pending) {
    const { att, def, act } = p;
    const dist = Math.abs(att.x - def.x);
    const hits = att.weapon.dual && act.id === 'light' ? 2 : 1;
    for (let h = 0; h < hits && !over; h++) {
      const base: FightEvent = { tick, actor: att.id, action: act.id, result: 'whiff' };
      if (dist > reachOf(att, act)) { emit(base); continue; }

      // dodge i-frames
      if (def.act?.id === 'dodge' && def.frame >= 1 && def.frame <= 3) {
        emit({ ...base, result: 'dodged' }); continue;
      }
      // spear wall: attacker walks into a braced spear
      if (def.act?.id === 'wall' && def.frame < ACTIONS.wall.active && act.effect !== 'snare') {
        const changes: ZoneChange[] = [];
        const dmg = calcDamage(def, att, 'torso', ACTIONS.wall, chance(rng, 0.1));
        hurt(att, 'torso', dmg, changes);
        def.dealt += dmg;
        interrupt(att, TUNING.staggerTicks);
        emit({ tick, actor: def.id, action: 'wall', targetZone: 'torso', result: 'countered', damage: round1(dmg), zoneStateChanges: changes.length ? changes : undefined, hp: log ? snap() : undefined });
        continue;
      }

      // hit roll
      const acc = ((att.spec.stats.agi + att.spec.stats.tec) / 2) * accMod(att);
      const eva = def.spec.stats.agi * 0.9 * evaMod(def) * def.mods.eva * (def.act?.attack ? 0.8 : 1);
      const crowd = att.weapon.closeMin && dist < att.weapon.closeMin ? TUNING.crowdHit : 0;
      const pHit = clamp(TUNING.hitBase + (acc - eva) / 200 + att.mods.hit - crowd, TUNING.hitMin, TUNING.hitMax);
      if (!chance(rng, pHit)) { emit({ ...base, result: 'whiff' }); continue; }

      // zone with precision
      let zone = att.target;
      if (act.id === 'net') zone = 'legL';
      if (zone !== 'torso' && !chance(rng, clamp(0.4 + att.spec.stats.tec * 0.006, 0.4, 0.95))) {
        // imprecise strike: lands on the torso or a random nearby zone
        zone = chance(rng, 0.5) ? 'torso' : ZONES[Math.floor(rng() * ZONES.length)];
      }

      const crit = chance(rng, TUNING.critBase + att.spec.stats.tec * TUNING.critPerTec + att.mods.crit);
      let dmg = calcDamage(att, def, zone, act, crit);
      let result: FightEvent['result'] = crit ? 'crit' : 'hit';

      // block
      const guarding = def.act?.id === 'block' && def.frame >= 1 && def.frame < 9;
      if (guarding && canBlock(def) && !act.bypassBlock) {
        const sh = def.spec.shield!;
        const pBlock = clamp(0.5 + def.spec.stats.tec / 400 + sh.block * 0.2 + def.mods.block, 0.3, 0.88) * blockMod(def);
        if (chance(rng, pBlock)) {
          const absorb = Math.min(0.9, (sh.absorb * blockMod(def) + def.mods.absorb) * (act.id === 'cleave' ? 0.5 : 1));
          const cost = dmg * 0.4;
          if (def.stam >= cost) {
            def.stam -= cost;
            dmg *= 1 - absorb;
            result = 'blocked';
          } else {
            def.stam = 0;
            interrupt(def, TUNING.staggerTicks); // guard broken
          }
        }
      }

      const changes: ZoneChange[] = [];
      const statuses: string[] = [];
      hurt(def, zone, dmg, changes);
      att.dealt += dmg;
      if (att.mods.leech) att.hp.torso = Math.min(att.max.torso, att.hp.torso + dmg * att.mods.leech);
      if (def.mods.thorns && result !== 'blocked') { att.hp.torso = Math.max(0, att.hp.torso - dmg * def.mods.thorns); if (att.hp.torso <= 0) att.dead = true; }

      if (result !== 'blocked') {
        // stun on heavy head blows
        if (zone === 'head' && dmg > def.max.head * 0.3) { interrupt(def, TUNING.stunTicks); statuses.push('stun'); }
        if (act.effect === 'stagger') { interrupt(def, TUNING.staggerTicks + att.mods.bashStun); statuses.push('stagger'); }
        if (act.effect === 'snare') { def.snare = TUNING.netSnareTicks + att.mods.snare; statuses.push('snare'); }
        // Hamstring: leg strikes slow the target
        if (att.mods.legSlow && (zone === 'legL' || zone === 'legR') && def.snare < 40) { def.snare = 40; statuses.push('slow'); }
        // bleeding
        if (att.weapon.edged && act.effect !== 'snare' && dmg >= def.max[zone] * 0.12 && chance(rng, 0.3 + att.mods.bleed)) {
          def.bleed = TUNING.bleedTicks;
          def.bleedStacks = Math.min(2, def.bleedStacks + 1);
          statuses.push('bleed');
        }
      }
      emit({
        tick, actor: att.id, action: act.id, targetZone: zone, result,
        damage: round1(dmg),
        zoneStateChanges: changes.length ? changes : undefined,
        statuses: statuses.length ? statuses : undefined,
        hp: log ? snap() : undefined,
      });
      // Riposte: a blocked blow can be answered with an immediate counter
      if (result === 'blocked' && chance(rng, def.mods.riposte)) {
        const rc: ZoneChange[] = [];
        const cd = calcDamage(def, att, 'torso', ACTIONS.light, false) * 0.8;
        hurt(att, 'torso', cd, rc);
        def.dealt += cd;
        emit({ tick, actor: def.id, action: 'light', targetZone: 'torso', result: 'countered', damage: round1(cd), zoneStateChanges: rc.length ? rc : undefined, hp: log ? snap() : undefined });
      }
    }
  }

  // ---- main loop ---------------------------------------------------------------
  for (tick = 0; tick < TIME_CAP_TICKS && !over; tick++) {
    // 1. statuses, cooldowns, regen
    for (const f of fs) {
      for (const k in f.cd) { const id = k as keyof typeof f.cd; f.cd[id] = (f.cd[id] ?? 0) - 1; }
      if (f.stun > 0) f.stun--;
      if (f.snare > 0) f.snare--;
      if (f.exhaust > 0) f.exhaust--;
      if (f.grace > 0) f.grace--;
      if (f.bleed > 0) {
        f.bleed--;
        const d = bleedDmgPerTick(f);
        f.hp.torso = Math.max(0, f.hp.torso - d);
        if (f.bleed === 0) f.bleedStacks = 0;
        if (f.hp.torso <= 0) f.dead = true;
      }
      const regen = (TUNING.staminaRegen + f.spec.stats.end * TUNING.staminaRegenEnd) * f.mods.regen * (f.act?.attack ? 0.4 : 1);
      f.stam = Math.min(f.maxStam, f.stam + regen);
      if (f.mods.secondWind && !f.windUsed && f.stam / f.maxStam < 0.15) { f.windUsed = true; f.stam = Math.min(f.maxStam, f.stam + f.maxStam * 0.3); }
      if (f.stam <= 0.5 && f.exhaust === 0) f.exhaust = 16;
    }
    if (fs[0].dead || fs[1].dead) { endByDeath(); break; }

    // 2. decisions (both read the same snapshot, then apply)
    const decisions: Array<Decision | null> = fs.map((f, i) =>
      !f.act && f.stun === 0 && f.exhaust === 0 ? decide(f, fs[1 - i], rng) : null);
    for (let i = 0; i < 2; i++) {
      const d = decisions[i];
      const f = fs[i];
      if (!d) continue;
      if (d.kind === 'yield') {
        f.yielded = true;
        emit({ tick, actor: f.id, result: 'yield', hp: log ? snap() : undefined });
        finish('yield', (1 - f.id) as 0 | 1);
        break;
      }
      startAction(f, d.id, d.target);
      emit({ tick, actor: f.id, action: d.id, targetZone: d.target, result: 'start', x: [fs[0].x, fs[1].x] });
    }
    if (over) break;

    // 3. movement (simultaneous)
    const dx: [number, number] = [0, 0];
    for (const f of fs) {
      if (!f.act || f.stun > 0) continue;
      const id = f.act.id;
      if ((id === 'advance' || id === 'retreat' || id === 'dodge') && f.frame < f.act.active) {
        const toward = Math.sign(fs[1 - f.id].x - f.x) || f.dir;
        const sign = id === 'advance' ? toward : -toward;
        const step = id === 'dodge' ? 1.1 * evaMod(f) : moveSpeed(f);
        dx[f.id] = sign * step;
      }
    }
    for (const f of fs) f.x = clamp(f.x + dx[f.id], 0, TUNING.arenaWidth);
    const gap = Math.abs(fs[0].x - fs[1].x);
    if (gap < TUNING.minGap) {
      const push = (TUNING.minGap - gap) / 2;
      const left = fs[0].x <= fs[1].x ? 0 : 1;
      fs[left].x = clamp(fs[left].x - push, 0, TUNING.arenaWidth);
      fs[1 - left].x = clamp(fs[1 - left].x + push, 0, TUNING.arenaWidth);
    }

    // 4. attacks that are active this tick (resolved against a pre-damage snapshot)
    const pend: Pending[] = [];
    for (const f of fs) {
      if (!f.act || !f.act.attack || f.stun > 0) continue;
      const d = actionDuration(f, f.act);
      if (f.frame >= d.startup && f.frame < d.startup + d.active) pend.push({ att: f, def: fs[1 - f.id], act: f.act });
    }
    for (const p of pend) resolve(p);
    if (fs[0].dead || fs[1].dead) { endByDeath(); break; }

    // 5. advance frames
    for (const f of fs) {
      if (!f.act) continue;
      f.frame++;
      const d = actionDuration(f, f.act);
      if (f.frame >= d.startup + d.active + d.recovery) { f.act = null; f.frame = 0; }
    }
    if (log) track.push([round1(fs[0].x), round1(fs[1].x)]);
  }

  function endByDeath() {
    const d0 = fs[0].dead, d1 = fs[1].dead;
    if (d0 && d1) {
      emit({ tick, actor: 0, result: 'death', hp: log ? snap() : undefined });
      emit({ tick, actor: 1, result: 'death', hp: log ? snap() : undefined });
      finish('death', null);
    } else {
      const loser = d0 ? 0 : 1;
      emit({ tick, actor: loser as 0 | 1, result: 'death', hp: log ? snap() : undefined });
      finish('death', (1 - loser) as 0 | 1);
    }
  }

  if (!over) {
    // time cap: more accumulated damage wins
    const w: 0 | 1 | null = fs[0].dealt === fs[1].dealt ? null : fs[0].dealt > fs[1].dealt ? 0 : 1;
    emit({ tick, actor: 0, result: 'cap' });
    finish('cap', w);
  }

  const injuries = [rollInjuries(fs[0], rng), rollInjuries(fs[1], rng)] as FightResult['injuries'];
  const result: FightResult = {
    seed,
    winner,
    method,
    ticks: tick,
    events,
    finalHp: [{ ...fs[0].hp }, { ...fs[1].hp }],
    maxHp: [{ ...fs[0].max }, { ...fs[1].max }],
    damageDealt: [fs[0].dealt, fs[1].dealt],
    injuries,
  };
  if (log) result.track = track;
  return result;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
