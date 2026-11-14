// Play-by-play: turns fight events into varied, readable commentary.
// A separate seeded stream picks the wording, so a replay of the same fight always reads the same.
import { CLASSES } from '../data/classes';
import { deriveSeed, mulberry32 } from '../sim/rng';
import type { FightEvent, FighterSpec, Zone } from '../sim/types';

export interface Line { text: string; cls?: '' | 'big' | 'dim' }

const PART: Record<Zone, string[]> = {
  head: ['head', 'helm', 'jaw'],
  torso: ['ribs', 'chest', 'gut', 'flank'],
  armW: ['sword arm', 'weapon arm', 'wrist'],
  armS: ['shield arm', 'forearm'],
  legL: ['thigh', 'knee', 'calf'],
  legR: ['thigh', 'knee', 'calf'],
};

const VERBS: Record<string, string[]> = {
  spear: ['thrusts into', 'jabs', 'drives the point into', 'skewers'],
  blade: ['slashes', 'cuts', 'carves into', 'rakes', 'chops at'],
  axe: ['hacks', 'cleaves into', 'hammers', 'chops into'],
  fist: ['punches', 'clubs', 'cuffs'],
};
const ACTION_VERB: Record<string, string[]> = {
  bash: ['smashes the shield into', 'bashes'], hook: ['hooks around the guard to hit', 'snakes a hooked cut into'],
  whirl: ['spins and slashes', 'whirls through'], cleave: ['brings a great cleave down on', 'cleaves into'],
  wall: ['impales'], net: ['ensnares'],
};
const START: Record<string, string[]> = {
  heavy: ['winds up a heavy blow', 'rears back for a big swing', 'sets their feet for a crushing strike'],
  dodge: ['darts back out of range', 'dodges back'],
  bash: ['drives forward behind the shield', 'lowers the shield for a bash'],
  hook: ['feints and hooks around the guard', 'loops a hooked cut at the guard'],
  wall: ['braces the spear and sets the wall', 'plants the spear and waits'],
  net: ['whips the net out', 'swings the net overhead'],
  whirl: ['spins up into a whirlwind', 'explodes into a whirl of steel'],
  cleave: ['hauls the great weapon overhead', 'gathers a massive cleave'],
};

const weaponKind = (n: string) => (/spear|trident/i.test(n) ? 'spear' : /axe/i.test(n) ? 'axe' : /bare/i.test(n) ? 'fist' : 'blade');

export class Commentator {
  private rng: () => number;
  private used = new Map<string, number>();
  private warned: [Set<number>, Set<number>] = [new Set(), new Set()];
  private lastEventTick = 0;
  private firstBlood = false;
  private streak: [number, number] = [0, 0];
  private streakSaid: [boolean, boolean] = [false, false];
  private lastTalk = -999;

  constructor(private specs: [FighterSpec, FighterSpec], seed: number, private maxHp: [Record<Zone, number>, Record<Zone, number>]) {
    this.rng = mulberry32(deriveSeed(seed, 1));
  }

  /** Pick a template, preferring ones used least often so lines do not repeat. */
  private pick(key: string, list: string[]): string {
    let best = Infinity; const cands: number[] = [];
    list.forEach((_, i) => { const n = this.used.get(`${key}:${i}`) ?? 0; if (n < best) { best = n; cands.length = 0; } if (n === best) cands.push(i); });
    const i = cands[Math.floor(this.rng() * cands.length)];
    this.used.set(`${key}:${i}`, best + 1);
    return list[i];
  }

  private fill(t: string, v: Record<string, string>) { return t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? ''); }

  intro(): Line[] {
    const [a, b] = this.specs;
    const tag = (s: FighterSpec) => `${s.name} (${CLASSES[s.classId].label})`;
    const lines: Line[] = [{ text: `${tag(a)} faces ${tag(b)}. The crowd settles.`, cls: 'dim' }];
    if (b.boss) lines.push({ text: `${b.name} has killed before. The arena holds its breath.`, cls: 'big' });
    return lines;
  }

  line(e: FightEvent): Line[] {
    const out: Line[] = [];
    const short = (s: string) => s.split(' ')[0];
    const A = short(this.specs[e.actor].name), B = short(this.specs[(1 - e.actor) as 0 | 1].name);
    const vic = (1 - e.actor) as 0 | 1;
    const part = (z?: Zone) => (z ? this.pick(`part:${z}`, PART[z]) : 'body');
    const v = { A, B };
    const say = (text: string, cls: Line['cls'] = '') => { out.push({ text, cls }); this.lastTalk = e.tick; };

    // a quiet stretch deserves a word
    if (e.result === 'start' && e.tick - this.lastEventTick > 80 && e.tick - this.lastTalk > 80 && (e.action === 'advance' || e.action === 'retreat')) {
      say(this.pick('lull', ['The fighters circle, sizing each other up.', 'Both fighters are patient, testing the distance.', 'A tense moment: nobody wants to commit first.']), 'dim');
    }

    switch (e.result) {
      case 'start': {
        const a = e.action ? START[e.action] : undefined;
        if (a) say(`${A} ${this.pick('start:' + e.action, a)}.`, 'dim');
        break;
      }
      case 'hit': case 'crit': case 'blocked': {
        const w = this.specs[e.actor].weapon.name;
        const verbs = (e.action && ACTION_VERB[e.action]) || VERBS[weaponKind(w)];
        const verb = this.pick('verb:' + (e.action ?? weaponKind(w)), verbs);
        const p = part(e.targetZone);
        const dmg = ` (${Math.round(e.damage ?? 0)})`;
        if (e.result === 'blocked') {
          say(this.fill(this.pick('block', ['{B} catches it on the shield.', "{A}'s blow rings off {B}'s shield.", '{B} turtles up behind the shield.', 'The shield takes the worst of it.']), v) + dmg, '');
        } else if (e.result === 'crit') {
          say(this.fill(this.pick('crit', ["{A} lands a CRUSHING blow on {B}'s {p}!", 'Brutal! {A} finds the gap and tears into {B}!', "A vicious strike to {B}'s {p}!"]), { ...v, p }) + dmg, 'big');
          if (this.rng() < 0.45) say(this.pick('roar', ['The crowd roars.', 'The stands erupt.', 'A great shout rolls around the arena.']), 'dim');
        } else {
          say(this.fill(this.pick('hit', ["{A} {verb} {B}'s {p}.", "{A} {verb} {B}'s {p}, a solid hit.", "{A} {verb} {B}'s {p} cleanly."]), { ...v, verb, p }) + dmg, '');
        }
        if (e.result !== 'blocked') {
          if (!this.firstBlood && (e.damage ?? 0) > 0) { this.firstBlood = true; say(`First blood to ${A}!`, 'big'); }
          this.streak[e.actor]++; this.streak[vic] = 0; this.streakSaid[vic] = false;
          if (this.streak[e.actor] >= 3 && !this.streakSaid[e.actor]) { this.streakSaid[e.actor] = true; say(`${A} is on a roll, ${B} cannot answer!`, 'big'); }
          // health thresholds, once each
          if (e.hp) {
            const frac = e.hp[vic].torso / this.maxHp[vic].torso;
            for (const [lvl, text] of [[0.5, `${B} is breathing hard.`], [0.25, `${B} is barely standing.`], [0.1, `${B} is at the end of their strength!`]] as [number, string][]) {
              if (frac <= lvl && !this.warned[vic].has(lvl)) { this.warned[vic].add(lvl); say(text, lvl <= 0.25 ? 'big' : ''); break; }
            }
          }
        }
        for (const s of e.statuses ?? []) {
          if (s === 'stun') say(this.fill(this.pick('stun', ['{B} reels, vision swimming!', '{B} is rocked and staggers!']), v), 'big');
          if (s === 'bleed') say(this.fill(this.pick('bleed', ['{B} is bleeding.', 'Blood runs from {B}’s wound.']), v), '');
          if (s === 'snare') say(this.fill('The net tangles around {B}’s legs!', v), 'big');
          if (s === 'slow') say(this.fill('{B} is hobbled by the leg strike.', v), '');
          if (s === 'stagger') say(this.fill('{B} is staggered!', v), '');
        }
        break;
      }
      case 'dodged':
        say(this.fill(this.pick('dodge', ["{B} slips away from {A}'s strike.", '{B} twists clear.', '{A} swings and {B} is already gone.']), v), 'dim');
        break;
      case 'whiff':
        if (e.action !== 'net' && this.rng() < 0.28) say(this.fill(this.pick('whiff', ['{A} swings at empty air.', '{A} overreaches and misses.', "{B} sidesteps {A}'s clumsy attack."]), v), 'dim');
        break;
      case 'countered':
        this.streak[e.actor] = 0;
        say(e.action === 'wall'
          ? `${A}'s spear wall punishes ${B}! (${Math.round(e.damage ?? 0)})`
          : `${A} answers the block with a vicious counter! (${Math.round(e.damage ?? 0)})`, 'big');
        break;
      case 'yield': say(`${A} raises a hand and yields! The crowd erupts.`, 'big'); break;
      case 'death': say(`${A} falls and does not rise.`, 'big'); break;
      case 'cap': say('Time is called. The judges will decide.', 'big'); break;
      default: break;
    }

    // a limb giving out is worth its own line
    for (const c of e.zoneStateChanges ?? []) {
      if (c.tier === 'disabled' && c.zone !== 'torso' && c.zone !== 'head') {
        const who = B;
        const msg = c.zone === 'armW' ? `${who}'s weapon arm hangs useless!` : c.zone === 'armS' ? `${who}'s shield arm gives out!` : `${who}'s leg buckles!`;
        say(msg, 'big');
      }
    }
    if (e.result !== 'start') this.lastEventTick = e.tick;
    return out;
  }
}
