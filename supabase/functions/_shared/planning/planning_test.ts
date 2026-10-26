// Tests Deno : deno test supabase/functions/
import { cases } from './cases.ts';

for (const c of cases) Deno.test(c.name, c.run);
