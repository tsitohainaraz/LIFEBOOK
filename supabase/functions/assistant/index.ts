// Edge Function `assistant` : planification avec l'IA (Groq, secours OpenRouter, Anthropic pour le premium).
// Les clés restent côté serveur (Deno.env.get) ; le client Supabase utilise le jeton de l'utilisateur.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleAssistant, type AssistantRequest } from '../_shared/assistant/handler.ts';
import { providersFor } from '../_shared/llm/router.ts';
import { supabaseDb } from './db.ts';

const MODES = ['chat', 'guided_parse', 'explain_plan', 'adjust_plan', 'replan_rest_of_day'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Non connecté.' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await sb.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (userError || !userData.user) return json({ error: 'Session expirée.' }, 401);

  let body: AssistantRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requête invalide.' }, 400);
  }
  if (!body || !MODES.includes(body.mode)) return json({ error: 'Mode inconnu.' }, 400);

  const db = supabaseDb(sb, userData.user.id);
  const quota = await db.quota().catch(() => null);
  const providers = providersFor(
    {
      NVIDIA_API_KEY: Deno.env.get('NVIDIA_API_KEY'),
      NVIDIA_MODEL: Deno.env.get('NVIDIA_MODEL'),
      GROQ_API_KEY: Deno.env.get('GROQ_API_KEY'),
      OPENROUTER_API_KEY: Deno.env.get('OPENROUTER_API_KEY'),
      OPENROUTER_FREE_MODEL: Deno.env.get('OPENROUTER_FREE_MODEL'),
      ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'),
      ANTHROPIC_MODEL: Deno.env.get('ANTHROPIC_MODEL'),
    },
    quota?.plan === 'premium',
  );

  try {
    return json(await handleAssistant(body, { db, providers, nowMs: () => Date.now() }));
  } catch (e) {
    console.error('assistant', e instanceof Error ? e.message : e);
    return json({ error: "L'assistante a rencontré un problème. Réessaie dans un instant." }, 500);
  }
});
