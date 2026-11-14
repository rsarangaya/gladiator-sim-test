import { chance, type Rng } from './rng';
import type { Injury, Zone } from './types';
import type { Runtime } from './fighter';

const LIMBS: Zone[] = ['armW', 'armS', 'legL', 'legR'];

/**
 * Post-fight injury tiers from final zone damage.
 *  bruised: heals with rest (any mode)
 *  wounded: stat penalty until healed
 *  maimed : zone was destroyed; armor on that zone lowers the chance
 */
export function rollInjuries(f: Runtime, rng: Rng): Injury[] {
  const out: Injury[] = [];
  for (const z of [...LIMBS, 'head', 'torso'] as Zone[]) {
    const lost = 1 - f.hp[z] / f.max[z];
    if (f.hp[z] <= 0 && LIMBS.includes(z)) {
      const armor = f.spec.armor[z];
      const pMaim = 0.75 * (100 / (100 + armor * 2.5));
      out.push({ zone: z, tier: chance(rng, pMaim) ? 'maimed' : 'wounded' });
    } else if (lost > 0.6) out.push({ zone: z, tier: 'wounded' });
    else if (lost > 0.3) out.push({ zone: z, tier: 'bruised' });
  }
  return out;
}
