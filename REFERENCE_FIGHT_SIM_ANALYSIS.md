# Reference: how the Vigged MMA fight sim works (and what to take for Coliseum)

Source: vigged.com/mma/fight-sim — read from its public client bundles (`mmaVera`, `words`, `draw`, `FightReplay`) plus the site's own "How the sim works" text. This is a **design reference only**. Do not copy its text, names, strings or art (HANDOFF.md §1, §13). Everything below is re-described in my own words.

## 1. The core insight: it is NOT a tick sim

Vigged does not simulate a fight moment to moment. It is a **decide-the-outcome-first, then narrate** engine:

1. **Outcome draw.** From a rating model it computes a 6-way probability table: {fighter A, fighter B} × {KO, submission, decision}. One seeded draw picks the winner and the method.
2. **Round timing.** If it is a finish, the round and time are drawn from empirical per-round finish tables (finishes cluster in early rounds). Bigger/stronger side shifts the finish time earlier.
3. **Per-round stat lines.** Each round's numbers (strikes landed, takedowns, control seconds, knockdowns, sub attempts, damage) are sampled from Poisson/normal draws parameterized by both fighters' per-minute stats. The finish round is *forced* to include the stats that justify the finish (e.g. a ground-and-pound finish adds a takedown + control time).
4. **Judges.** Three judges score each completed round from a weighted "round margin" plus per-judge noise (10-9, or 10-8 when dominant).
5. **Rejection sampling.** If the cards do not agree with the pre-drawn winner, **re-roll all rounds** (up to ~200 tries, then force-flip cards). So the story always matches the odds.
6. **Narration.** A separate seeded RNG turns the round stat lines into timestamped text events, which the replay viewer animates.

Result: results are statistically faithful and the play-by-play always agrees with the result. Cost: the fight has no real internal causality (a hurt fighter is a *narrative* outcome, not an emergent one).

## 2. Pieces worth stealing

| Piece | How it works | Why it's good |
|---|---|---|
| Seeded RNG | 8-hex-char seed → hash → small PRNG; a *second* RNG (seeded from the first) drives narration only | Same seed = identical fight/replay; changing flavor text never changes the result |
| Stat→count sampling | Poisson for event counts (`pois(rate * minutes * matchup_factor)`), normal noise for lognormal "form" factor per fighter per fight | Natural variance, tiny code |
| Matchup factor | `sqrt(attacker_output × defender_allowed)` — geometric mean of offense vs defense | Both sides matter, no runaway values |
| Per-fight "form" noise | `exp(0.28·N(0,1))` multiplier per fighter | Upsets happen organically |
| Escalation when the fight drags | If no decision is reached, round multipliers drift up per retry | Guarantees convergence |
| Damage accumulator | Hit counts by zone weighted (head 0.9, body 0.5, leg 0.35) + knockdown bonus; displayed as `100·(1−e^(−x/60))` so it saturates to 100 | Smooth damage bar, never overflows, KO threshold = 100 |
| Narrative thresholds | Damage crossing fixed tiers (e.g. 25/50/75) triggers "hurt / swelling / cut" lines, once per tier, avoiding repeats | Escalating drama without per-tick logic |
| Anti-repeat text picking | Picks the least-used variant of each line template across the fight | Play-by-play never feels repetitive |
| Event → animation | Viewer parses each event's type (takedown, stuffed, sub try, knockdown, gnp, hurt, finish) and drives a pose/state machine | Replay is a pure function of the log |
| Violence/quality score | Per-finish score from method weight + pre-finish damage | Cheap "fight rating" for leaderboards |

## 3. What NOT to copy

- Outcome-first design contradicts our HANDOFF §4: *the sim is the product* and must be a real fixed-tick simulation (20 ticks/s, startup/active/recovery, zones, stamina). A hybrid is not what the handoff asks for.
- Its data is real fighter stats (VERA ratings). We have none; we derive everything from the 5 character stats + gear + class.
- No limb/injury model exists there — ours (6 zones, tiers) is the original part.

## 4. Recommended mapping for Coliseum

**Keep our tick sim as the engine of truth**, and borrow Vigged's *wrapper* ideas on top:

1. **Seed discipline** — two RNG streams: `simRng` (combat resolution) and `flavorRng` (text/animation variants). Seeds are 32-bit; print them in the event log. Lets us tune text without invalidating replays/PvP verification.
2. **Poisson-style variance** — replace flat hit/miss rolls with a per-fighter, per-fight lognormal "form" multiplier (≈0.15–0.28 σ) on attack rate and damage. Gives believable upsets while keeping 65/35 balance targets measurable.
3. **Geometric-mean matchup** — hit chance / damage uses `offense × (1 / defense)` ratios clamped (Vigged clamps ratios to roughly 0.3–2.5) so stat gaps can't produce 0% or 100%.
4. **Saturating damage meter** — each zone and the overall "punishment" value use `100·(1−e^(−x/k))` for UI bars and for the yield threshold. Yield decision = punishment crossing a personality-dependent tier.
5. **Tiered drama beats** — one-shot narration/animation triggers when a zone or total damage crosses tiers (bruise → wound → maim). Matches HANDOFF injury tiers directly.
6. **Anti-repeat play-by-play** — least-used-variant selection per template; seed a separate RNG.
7. **Time-cap fairness** — Vigged's escalate-until-resolved loop maps to our time cap: after N seconds, apply rising fatigue/bleed pressure so fights resolve before the cap ("more accumulated damage wins" as the last resort).
8. **Headless balance tool** — Vigged has a "Sim 10,000" button that shows outcome distributions. M1's balance script should output the same shape: win%, finish method (death / yield / cap), mean fight length, per matchup.
9. **Event log shape** — keep `{tick, actor, action, zone, result, damage, zoneStateChanges, statuses}`; the viewer reads only this (Vigged's viewer does the same with its text events).
10. **Replay controls** — Live / Fast / Skip-to-end maps to our pause/1x/2x/instant toggle.

## 5. Optional "quick-sim" mode (idea, not in handoff)

For career mode ladders with many background fights (NPC vs NPC), a Vigged-style outcome-first quick sim is a cheap fit: draw winner from a rating function, narrate a short result. Never for the player's own fights.

## 6. Suggested next step

Start M1 exactly as the handoff says (pure TS sim, fixed tick, zones, six classes, AI, event log, balance tool), applying items 1–4 and 7–9 above from day one. I haven't written any code yet — say go and I'll scaffold `/src/sim` and the Vitest determinism test.
