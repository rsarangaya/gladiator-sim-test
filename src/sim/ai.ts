import { ACTIONS, TUNING } from '../data/actions';
import { actionDuration, anyLegDisabled, canBlock, legsDown, reachOf, type Runtime } from './fighter';
import { clamp, weighted, type Rng } from './rng';
import type { ActionId, ClassId, Zone } from './types';

export const SIGNATURE: Record<ClassId, ActionId> = {
  murmillo: 'bash', thraex: 'hook', hoplomachus: 'wall',
  retiarius: 'net', dimachaerus: 'whirl', brute: 'cleave',
};

export type Decision =
  | { kind: 'yield' }
  | { kind: 'act'; id: ActionId; target: Zone };

const PERSONALITY = {
  aggressive: { aggr: 1.5, def: 0.6 },
  balanced:   { aggr: 1.0, def: 1.0 },
  defensive:  { aggr: 0.7, def: 1.5 },
};

export function pickTarget(self: Runtime, opp: Runtime, r: Rng): Zone {
  const p = self.spec.personality;
  const tec = self.spec.stats.tec;
  const w: Partial<Record<Zone, number>> = {
    torso: 36,
    head: 16 + (p === 'aggressive' ? 8 : 0) + tec * 0.15,
    armW: opp.hp.armW > 0 ? 14 + tec * 0.1 : 0,
    armS: opp.hp.armS > 0 && opp.spec.shield ? 9 : 0,
    legL: opp.hp.legL > 0 ? 12 + tec * 0.1 : 0,
    legR: opp.hp.legR > 0 ? 12 + tec * 0.1 : 0,
  };
  return weighted(r, w) ?? 'torso';
}

export function decide(self: Runtime, opp: Runtime, r: Rng): Decision {
  const P = PERSONALITY[self.spec.personality];
  const dist = Math.abs(opp.x - self.x);
  const weapon = self.weapon;
  const reach = weapon.reach + self.mods.reach;
  const stamFrac = self.stam / self.maxStam;
  const torsoFrac = self.hp.torso / self.max.torso;

  // --- yield ---------------------------------------------------------------
  const hum = !!self.spec.human; // the player's gladiator knows when to quit; opponents fight on much longer
  const sm = Math.max(0.1, Math.min(hum ? 1 : 1.8, 1.6 - self.spec.stats.spi * 0.06)); // the player's low spirit never buys extra mercy // spirit: high = rarely quits, low = quits while still healthy
  const yieldAt = (hum ? TUNING.yieldAtPlayer : TUNING.yieldAt)[self.spec.personality] * sm;
  const yc = (hum ? TUNING.yieldChancePlayer : TUNING.yieldChance) * sm;
  if (torsoFrac < yieldAt && r() < yc) return { kind: 'yield' };
  if (legsDown(self) && r() < yc) return { kind: 'yield' };
  // yield when one more big hit could be fatal (scales with the opponent's damage, so it holds at every level)
  const burst = opp.weapon.dmg * (0.5 + opp.spec.stats.str / 100) * TUNING.damageScale * 2.2;
  const danger = self.hp.torso < burst * 1.2 || self.hp.head < burst * 1.5;
  if (danger && r() < yc * (self.spec.personality === 'aggressive' ? 0.4 : 0.6)) return { kind: 'yield' };

  // --- threat read -----------------------------------------------------------
  let threat = false;
  if (opp.act && opp.act.attack) {
    const d = actionDuration(opp, opp.act);
    const remaining = d.startup + d.active - opp.frame;
    if (remaining > 0 && dist <= reachOf(opp, opp.act) + 2) {
      const react = clamp(0.3 + self.spec.stats.tec / 200, 0.3, 0.75) * (remaining <= 2 ? 0.45 : 1);
      threat = r() < react;
    }
  }

  const inReach = dist <= reach;
  const sig = SIGNATURE[self.spec.classId];
  const sigDef = ACTIONS[sig];
  const ready = (id: ActionId) => (self.cd[id] ?? 0) <= 0 && self.stam >= ACTIONS[id].stamina;

  const w: Partial<Record<ActionId, number>> = {};
  const canAfford = (id: ActionId) => self.stam >= ACTIONS[id].stamina + 3;

  if (inReach) {
    w.light = canAfford('light') ? 32 * P.aggr : 0;
    w.heavy = canAfford('heavy') && stamFrac > 0.35 ? 13 * P.aggr : 0;
  } else {
    w.advance = 46 * P.aggr;
  }

  // distance control: long weapons keep their range, everyone backs off when tired
  const atEdge = self.x < 5 || self.x > TUNING.arenaWidth - 5;
  // Reach: a longer weapon is an advantage only if you use it. Hold the gap, poke at maximum range, and back off when closed on.
  const oppReach = opp.weapon.reach + opp.mods.reach;
  const adv = reach - oppReach;
  if (adv >= 1.2 && !atEdge) {
    if (dist < oppReach + 0.6) { w.retreat = 30; w.heavy = 0; if (w.light) w.light *= 0.6; }
    else if (inReach) { if (w.light) w.light *= 1.3; if (w.heavy) w.heavy *= 0.5; }
  } else if (reach >= 8 && dist < reach * 0.55 && !atEdge) w.retreat = 10 * P.def + 4;
  // a short weapon must close the distance fast, because trading at long range only helps the other side
  if (adv <= -1.2 && !inReach) w.advance = 60 * P.aggr;
  if (stamFrac < 0.25 && !atEdge) w.retreat = (w.retreat ?? 0) + 6;

  if (threat) {
    if (canBlock(self) && canAfford('block')) w.block = 70 * P.def;
    if (!anyLegDisabled(self) && canAfford('dodge')) w.dodge = 36 * (0.6 + self.spec.stats.agi / 60);
  } else if (inReach && canBlock(self)) {
    w.block = 6 * P.def;
  }

  w.rest = stamFrac < 0.2 ? 40 : stamFrac < 0.35 ? 12 : 1;

  // signature action rules
  const sigReach = sigDef.reach ?? reach;
  if (ready(sig)) {
    if (sig === 'wall') {
      if (threat || (dist > reach - 2 && dist <= reach + 4)) w.wall = 34;
    } else if (sig === 'net') {
      if (dist > 5 && dist <= sigReach && opp.snare <= 0) w.net = 55;
    } else if (dist <= sigReach) {
      w[sig] = (sig === 'cleave' ? 22 : 24) * P.aggr;
    }
  }

  const id = weighted(r, w) ?? 'rest';
  const target: Zone = pickTarget(self, opp, r);
  return { kind: 'act', id, target };
}
