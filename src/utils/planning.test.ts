import { describe, it } from 'vitest';
import { cases } from '../../supabase/functions/_shared/planning/cases.ts';

// Mêmes cas que les tests Deno (une seule source).
describe('planification (freeSlots, scheduler, planOps, insights)', () => {
  for (const c of cases) it(c.name, c.run);
});
