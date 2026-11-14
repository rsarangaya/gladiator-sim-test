# ROMEO ULTIMATE FIGHTING AUTOCHESS THING AK'S A BITCH BOY

Fantasy gladiator sim. See HANDOFF.md for the design, REFERENCE_FIGHT_SIM_ANALYSIS.md for the sim reference.

```
npm run dev       # viewer at http://localhost:5173
npm test          # determinism + invariants + resolution tests
npm run balance -- 1000 1     # N fights per matchup, level
npx tsx tools/inspect.ts brute thraex 3   # one fight's action/outcome summary
```

- `src/sim` pure deterministic sim (no DOM). `src/data` all tuning numbers. `src/render` viewer.
- `src/game/state.ts` progression (creator, training, rest, shop, prosthetics, enemies, injuries, save). `src/ui/app.ts` screens. `/lab.html` is the standalone sim viewer.
- Modes: Free (Normal: all injuries heal; Hard: maims permanent) and Career (10-rank ladder, then title defenses, maims permanent, losing the title ends the run). Local leaderboard per mode. `npx tsx tools/careersim.ts 60 career` runs bot careers to check difficulty.
- Fight choice: before each fight you see a scouting report with win odds. Free mode lets you pick a weaker, even or stronger opponent (tougher pays more gold); career fights are fixed. Rivals grow stronger the longer a run lasts (they train too), so waiting days to grind has diminishing value. The shop sells gear up to Rare; Epic and Legendary only drop from infamous challengers.
- Skills: 2 skill points at the start, +1 per level-up. Each class has a 3-skill chain plus 10 common skills (data/skills.ts). Rare and better gear carries perks, which use the same modifier system. Opponents learn skills too (bosses a few more than you). `npx tsx tools/skillaudit.ts` shows how much each skill moves the win rate (target +2 to +8 points).
- Play-by-play (render/commentary.ts), first-time tips and a How to play page (ui/tips.ts), phone layout (CSS media query plus an HUD that scales up on narrow screens), and a master trainer in the shop that turns late-game gold into stat points.
- `npx tsx tools/careersim.ts <runs per class> <career|free> <ladder size> [even]` plays full runs with a sensible-player bot and prints difficulty (score, days, odds, boss odds, deaths).
- Outmatched warning: the scouting screen warns (with a checklist of unspent points, injuries, worn gear, unused energy) when your odds are poor, and asks for confirmation below 25%. Career also offers a sparring match (weaker foe, half gold, no effect on ranking or title) so a hard ladder fight never traps you in a rematch loop.
- Roguelike saves (all modes): one autosave slot, Continue resumes exactly where you left off. Entering the arena saves the fight (seed + opponent) and removes Back, so closing or reloading resumes the same fight and cannot reroll it; training rolls come from the save state; New game on a living run asks to forfeit and records it as retired.
- Random events (about 1 day in 5): windfalls, sponsor repairs, fever (less energy until you rest), rumors that make the next opponent weaker or stronger, gear tampering, and infection when badly injured (laid up 2 days, ranking drops). Training can cause minor injuries.
- Infamous challengers (about 14% of days after a few fights, never while unranked): a bloody-named elite with a dark storm sky. Accept or decline; declining drops your ranking by 1-2 (free mode: costs gold). Winning drops loot whose rarity (Common to Legendary) rises with your ranking. Boss fights never change ladder progress.
- Gear wear: weapon, shield and each armor zone have durability (wear comes from the fight log: hits landed, blocks, and where you are hit). Below 40% gear fades toward 60% strength; at 0 it is unusable. Repair in the shop. `npx tsx tools/wear.ts` shows wear rates.
- Status: M1 sim done; M3 loop playable (free mode, local save). Rough viewer art. Not built: career mode, leaderboard, skills, audio, online.
- Balance (npm run balance -- 400 <level>; npx tsx tools/row.ts <class> <level>): class averages 47-57% at L1, 45-57% at L5, 47-61% at L10. Worst pairs: Dimachaerus vs Murmillo (~67/33), Retiarius vs Brute at L10 (~75/25), Retiarius vs Dimachaerus (~65/35). Level scaling is half proportional, half uniform (scaleStats) so class gaps don't widen with level.
- Town UI: the hub is an illustrated yard with your character; click the Coliseum (scouting gate with next fights and odds), Shop (shopkeeper and wares), Training grounds (trainer and five stations; each stat plays its own short animation: weight press, sprint, log squats, jump rope, sword forms) or the tent/lectern for rest and skills. Scenes live in render/scenes.ts and render/exercise.ts.
- Fight animation is smoothed per fighter (viewer.ts), and the AI uses weapon reach: long weapons keep the gap and poke, short ones close in.
- Spirit (SPI): a sixth, trainable stat (train it at the brazier). It adds no fighting power; it controls the will to fight on. High spirit lowers both the hp threshold and the chance of yielding, low spirit makes a fighter quit while still healthy. Opponents have spirit too (they yield in roughly 15% of fights).
- Long weapons (spear, trident) are awkward inside their close range (`closeMin`): -5% hit chance and -10% damage, and they swing slower, so they want to keep the gap. Class averages after the pass: 45-55% at L1, L3 and L8.
- Arms have separate strength: R-ARM (weapon hand: damage) and L-ARM (off hand: shield block and absorb, shield bash, net snare time, the second dual blade; two-handed axes use the average). Set the weapon hand in the Gear screen (it swaps which arm's strength the weapon uses). Legs follow agility. Both arms train at their own stations.
- Bag: 5 slots for supplies (salve, whetstone, patch kit, stamina tonic, spirit draught), bought in the shop or found as loot/gifts; used from the Gear screen. `npx tsx tools/playthrough.ts <class> <career|free> [seed]` prints a narrated bot run.
- Lost limbs (maimed, no prosthetic) start every fight missing; a prosthetic gives back most of it. Injuries and their effects are listed on the home, training and Gear screens.
- Stakes: about 6 in 10 losses are deaths (the player's spirit never buys extra mercy; high spirit only makes you fight on). A surviving loss in career drops you a rank, or back to a qualifier from the bottom of the ladder.
