# Gladiator Sim — Build Handoff

Status: planning is done, nothing is built yet. Start at Milestone 1.

## 1. One-line pitch
A 2D fantasy gladiator game. The player creates a character, spends stat and skill points, buys gear, trains, and fights in an arena. **The combat is a simulation, not player-controlled.** The player's decisions are all about building the character. The sim and its animation are the core product.

Inspiration: the Vigged MMA fight sim (vigged.com/mma/fight-sim), which sims fights with play-by-play. We are making our own original game. Do not copy its assets, text, or branding. Use only original fictional names and designs.

## 2. Locked decisions
- **Platform:** web first (TypeScript). Native .exe later only if it grows too big (wrap with Tauri or Electron). Keep the code portable.
- **Visuals:** 2D side-view. All art is generated in code (vector or procedural), with no external assets. Stylized, flat-shaded with outlines. No gore.
- **Setting:** fantasy gladiators.
- **Fight ending:** a fight ends when a fighter dies or yields. There is no KO/TKO/submission logic, no rounds, and no judges' scorecards. A time cap exists as a safety net (more accumulated damage wins).
- **Training:** a very quick animation (2–3 seconds), then a stat gain screen.
- **Friend PvP** (turn-based, round by round) comes last.
- **All 6 classes ship at launch.**

## 3. Tech stack
- TypeScript, Vite, Phaser (Canvas/WebGL 2D) for the viewer.
- The sim is a **pure TypeScript module with no rendering or DOM imports**. It takes two fighters and a seed, and returns an event log. The viewer only plays the log back.
- **Deterministic:** a seeded RNG (e.g. mulberry32), so the same inputs produce the same fight. This enables replays, tests, and later PvP verification.
- Saves in localStorage at first. A backend (leaderboard, PvP) is a later milestone.
- Tests with Vitest. The sim must be testable headless and fast (thousands of fights per second ideally).

Suggested layout:
```
/src/sim        pure sim: types, rng, fighter, ai, resolve, injuries, classes
/src/data       classes, skills, items, enemy generation tables
/src/game       progression, economy, modes, save, leaderboard
/src/render     Phaser scenes, rig, animation, effects, HUD
/src/ui         screens: creator, hub, training, shop, arena, results
/tools          balance scripts (run N fights, print stats)
```

## 4. The simulation

### 4.1 Time and structure
- Fixed tick, 20 ticks per second. No frame-rate dependence.
- One continuous fight. Each tick, a fighter is idle, moving, or committed to an action.
- Actions have startup, active, and recovery frames (like a fighting game), so animation can follow the data.

### 4.2 Fighter state
- Position (x on a 1D line is enough for v1), facing, current action and frame counter.
- Stamina, status effects (bleed, stun, snared), and a guard state.
- Six body zones: head, torso, left arm, right arm, left leg, right leg. Each has its own health, armor slot, and injury tier (see section 5).

### 4.3 Actions
Light attack, heavy attack, block, dodge, advance, retreat, plus class and skill actions. Every attack targets a zone (high, mid, or low maps to head, torso, or legs; arms are reached by specific skills or mid attacks).

### 4.4 Resolution (starting formulas, tune in M1)
- Hit chance from attacker Agility and Technique against defender Agility, with stamina and limb-penalty modifiers.
- Damage from Strength, weapon, and zone multiplier, minus armor mitigation.
- Crit chance from Technique.
- Block reduces damage by shield strength and costs stamina. Dodge needs working legs.
- Deep hits can cause bleed (damage over time).
- Death when the torso or head reaches 0, or on bleed-out. A fighter may yield below a health threshold depending on AI personality.

### 4.5 AI brain
Weights actions by range, stamina, health, status, and a personality (aggressive, defensive, balanced), with some noise for variety. Zone targeting is weighted by personality and Technique. Enemies use the same system as players.

### 4.6 Output
An event log: `{tick, actor, action, targetZone, result, damage, zoneStateChanges, statuses}`. This log is the single source of truth for rendering, play-by-play text, and replays.

## 5. Limb and injury system
Zones and effects:
- **Head:** stun/daze chance and an accuracy penalty. At 0 it's death.
- **Torso:** the main life pool. At 0 it's death.
- **Weapon arm:** damage and attack speed drop. When disabled, the weapon is dropped.
- **Shield arm:** block strength drops. When disabled, no blocking.
- **Legs:** movement and dodge drop. When disabled, the fighter is hobbled and cannot dodge. Both legs disabled means down and likely to yield.

Injury tiers (applied after a fight from the final zone damage):
- **Bruised:** heals with rest in every mode.
- **Wounded:** a stat penalty on that zone until healed.
- **Maimed:** only when a zone was destroyed; lowered by armor on that zone. Permanent in permanent-injury modes.

Healing: rest costs energy and gold, so it becomes a third day-phase choice alongside training and shopping.

Prosthetics: a shop item per limb, in rarity tiers. They restore part of the lost function, never all of it. Class impact differs (a Retiarius can still use the net one-handed; a Dimachaerus loses a blade).

Permanence rules:
- **Free mode, Normal:** all injuries heal with rest.
- **Free mode, Hard:** injuries are permanent.
- **Career mode (including title defenses):** always permanent.
- Enemies in permanent modes can be maimed too.

## 6. Stats, skills, classes

### 6.1 Stats
Strength, Agility, Vitality, Endurance, Technique. They map straight to sim numbers (damage, speed and hit chance, health, stamina, targeting precision and crits). Cap at 100 with diminishing returns near the top.

### 6.2 Skills
Skill points buy skills from per-class trees (passives and actives). Skills unlock or modify actions and zone targeting (e.g. Hamstring Slash goes for legs).

### 6.3 Classes (all six at launch)
Classes only set starting stats, gear, and skill access. Any stat or skill can still be bought later.
- **Murmillo (tank):** sword and large shield, high Vitality and armor. Signature: Shield Bash (staggers).
- **Thraex (balanced skirmisher):** curved blade and small shield, strong Agility and Technique. Signature: Hook Strike (bypasses blocks).
- **Hoplomachus (reach):** spear and shield, controls range. Signature: Spear Wall (punishes close-in attackers).
- **Retiarius (control):** net and trident, light armor. Signature: Net Throw (snares legs).
- **Dimachaerus (glass cannon):** dual blades, no shield, highest damage and speed. Signature: Whirlwind.
- **Brute (power):** two-handed weapon, slow heavy hits. Signature: Cleave.

### 6.4 Gear
Weapon, shield, and armor per zone, with a few rarity tiers. Gear changes stats and can unlock skills.

## 7. Game loop
1. Create a character (name, look, class).
2. Spend starting stat points and skill points; equip basic gear.
3. **Tutorial fight:** a guaranteed win (bias the RNG or scale the enemy) to show off the sim.
4. Receive gold and energy.
5. **Day phase:** spend energy on training (stat gain), resting (healing), or spend gold in the shop.
6. Go to the arena when out of energy or by choice, then fight.
7. Win or lose: wins give gold, XP, and rank progress. Next day begins, energy refills, repeat.

## 8. Modes
- **Free mode:** the loop continues until death. Enemies scale per fight. Score = fights survived (plus gold). Difficulty select: Normal (injuries heal) or Hard (permanent injuries).
- **Career mode:** climb a ranked ladder of named gladiators to the champion. After winning the title, defend it against challengers; the score is the number of defenses. Losing the title ends the run. Injuries are always permanent.
- **Leaderboard:** per-mode high scores. Local at first, global later.
- **Friends mode (last):** turn-based. Each round both players secretly pick an action (attack, guard, skill, item) and the sim animates the result. Async or live via a share link or room code, using the same sim engine with simultaneous-choice rules.

## 9. Screens
1. Character creator, point allocation, and basic gear.
2. Tutorial fight.
3. Hub (day screen): gold, energy, rank, and buttons for Train, Rest, Shop, and Arena.
4. Training: pick a stat, a 2–3 second animation, then the stat gain.
5. Shop: gear and prosthetics, with equip.
6. Arena: pick a fight, watch it live with a speed toggle (pause, 1x, 2x, instant), then the result and rewards.
7. Run end and leaderboard.

## 10. Art and animation (all generated in code)
- One parametric humanoid rig made of shapes (head, torso, upper and lower limbs). Skin, hair, armor pieces, and weapons are swappable layers, so creation and gear show automatically.
- Keyframed pose tables instead of drawn frames. About 10–12 clips: idle, walk, light attack, heavy attack, block, dodge, hit-react, knockdown or death, victory, and a training clip, plus per-weapon variants.
- **Visuals always match injury state**, stylized with no gore: bandages, a limp, a dangling arm, a dropped weapon, a missing limb with a bandaged stump, and visible prosthetics. One-armed and hobbled pose variants are built as variants of the base clips.
- Game feel: hit-stop, small screen shake, impact flashes, dust, and floating damage numbers.
- HUD: health and stamina bars plus a body diagram showing each zone's condition. An optional play-by-play ticker built from the event log.
- Environment: a procedural sand arena, crowd silhouettes, and a hub screen.

## 11. Milestones
1. **M1 — Headless sim.** Types, RNG, fighter, six zones, injury tiers, six classes, AI, and an event log. A balance tool runs N fights and prints win rates by class matchup, fight length, death and maim rates, and stat sensitivity. Tune until no class dominates and fights run a sensible length. Unit tests for determinism and resolution.
2. **M2 — Viewer.** The rig, a core animation set, effects, HUD, and playback of the event log (speed control). Near-final visuals, not placeholders.
3. **M3 — Character and loop.** Creator, points, gear, the tutorial fight, the hub (train, rest, shop, arena), and saving.
4. **M4 — Modes.** Free mode (with the difficulty select), career mode with ladder and defenses, and the local leaderboard.
5. **M5 — Polish.** Balance pass, remaining animation variants, audio, and UX.
6. **M6 — Online.** Backend, global leaderboard, and friend PvP.

## 12. M1 acceptance criteria
- `npm test` passes, including a determinism test (same seed and fighters give an identical event log).
- A balance script simulates at least 10,000 fights per class matchup and outputs a table.
- No class beats another by more than roughly 65/35 at equal level and gear, unless deliberately intended.
- Average fight length is within a target band (suggested 20–60 seconds of sim time), and the time cap is rarely hit.
- Maim rates are plausible: low per fight, but meaningful over a long permanent-injury run (run a long-run simulation to check).

## 13. Notes
- Keep rendering out of the sim, always.
- Keep numbers in data tables (classes, skills, items, enemy scaling), not buried in logic, so tuning is easy.
- Original names and designs only. No real-world brands, licensed characters, or copied text.
- Start with M1 and show a tuned balance report before building any visuals.
