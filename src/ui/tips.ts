// First-time guidance: contextual tips (shown one at a time, dismissible) and a "How to play" page.
import { inPrelims, type Save } from '../game/state';

export interface Tip { id: string; text: string }

const KEY = 'coliseum.tips.v1';
const seen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
export const dismissTip = (id: string) => { try { localStorage.setItem(KEY, JSON.stringify([...new Set([...seen(), id])])); } catch { /* no storage */ } };
export const resetTips = () => { try { localStorage.removeItem(KEY); } catch { /* no storage */ } };

const TIPS: { id: string; when: (s: Save) => boolean; text: string }[] = [
  { id: 'rules', when: (s) => s.fights === 0, text: 'Roguelike rules: one autosave, and every action is permanent. Once you step onto the sand the fight is locked in. Death ends the run, so build carefully.' },
  { id: 'energy', when: (s) => s.fights === 0 && s.energy === 3, text: 'Each day you get 3 energy. Training (+1 stat) and Rest (heals injuries) cost 1 energy each. Fighting ends the day and refills your energy.' },
  { id: 'stats', when: (s) => s.unspent > 0, text: 'Spend stat points with the + buttons. STR = damage, AGI = hit chance and dodging, VIT = health, END = stamina, TEC = crits, aim and blocking.' },
  { id: 'skills', when: (s) => s.skillPoints > 0, text: 'You have skill points. Open Skills to learn passive upgrades. Class skills unlock in order, and common skills help every build.' },
  { id: 'career', when: (s) => s.mode === 'career' && !!s.career && inPrelims(s.career), text: 'Career: win the qualifier fights to enter the ranked ladder, then climb to champion. Losing a ladder fight is survivable; dying is not.' },
  { id: 'injury', when: (s) => Object.keys(s.injuries).length > 0, text: 'You are hurt. Rest heals bruises and wounds (1 energy and a little gold). Maimed limbs are permanent in Hard and Career; a prosthetic softens them.' },
  { id: 'gear', when: (s) => s.gear.weapon < 55 || Math.min(s.gear.armor.torso, s.gear.armor.head) < 50, text: 'Gear wears out with use. Below 40% condition it weakens, and at 0% it breaks. Repair it in the Shop.' },
  { id: 'spar', when: (s) => s.mode === 'career' && !!s.career && !inPrelims(s.career) && s.fights >= 4, text: 'Stuck on a ladder fight? Sparring matches pay less but cannot hurt your ranking. Use them to gain levels, gold and skill points, then try the ladder again.' },
  { id: 'wait', when: (s) => s.day >= 4 && s.fights >= 3, text: 'You can wait a day at camp to train more, but it costs gold and rivals keep getting stronger the longer a run lasts.' },
];

export function nextTip(s: Save): Tip | null {
  const done = seen();
  const t = TIPS.find((x) => !done.includes(x.id) && x.when(s));
  return t ? { id: t.id, text: t.text } : null;
}

export const SCOUT_TIP: Tip = { id: 'scout', text: 'Win odds come from practice bouts against that exact opponent. Train, rest, repair and learn skills to improve them. In Free mode, tougher opponents pay more gold.' };
export const isSeen = (id: string) => seen().includes(id);

export const HELP_HTML = `
<h2>How to play</h2>
<p><b>The goal.</b> Build a gladiator and fight in the arena. Fights are simulated, so every decision happens before the sand: stats, skills, gear, training and who you choose to fight.</p>
<p><b>Your day.</b> You have 3 energy. Train a stat (+1, sometimes +2), rest to heal injuries and cure fever, shop for repairs and upgrades, then fight. Fighting ends the day. You can also wait a day at camp, but it costs gold and rivals keep growing stronger.</p>
<p><b>Stats.</b> STR damage, AGI hit and dodge, VIT health, END stamina, TEC crits, aim and blocking. Level-ups (every 3 wins) give stat points and a skill point.</p>
<p><b>Skills.</b> Passive upgrades. Each class has a three-skill tree that unlocks in order, plus common skills for everyone. There are no respecs.</p>
<p><b>Injuries.</b> Hits leave bruises and wounds that Rest can heal. A destroyed limb is maimed: it heals in Free Normal, and is permanent in Free Hard and Career (a prosthetic halves the loss). Badly hurt fighters who never rest can collapse with infection.</p>
<p><b>Gear.</b> Weapons and armor wear out. Below 40% they weaken, at 0% they break. Repair in the shop. Rare gear carries a perk; Epic and Legendary gear with stronger perks only drops from infamous challengers.</p>
<p><b>Fights.</b> You always get a scouting report with win odds, and a warning (with a checklist of what to fix) when you look outmatched. In Career you can also take a safe sparring match. In Free mode you choose a weaker, even or stronger opponent (tougher pays more). Once you press Fight it is saved; closing the page does not help. Fights end by death or yield, and a yield means you live.</p>
<p><b>Infamous challengers.</b> Elite fighters with a blood-red name sometimes challenge you. Accept for a shot at rare loot, or decline and lose 1-2 ranks (gold in Free mode).</p>
<p><b>Modes.</b> Free: survive as long as you can. Career: win qualifiers, climb a Top 10, 15 or 20 ladder to champion, then defend the title. Lose it and the run is over. Each mode has its own leaderboard.</p>
`;
