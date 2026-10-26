// Tests Deno des adaptateurs d'IA, avec des fournisseurs simulés (aucun appel réseau).
import { makeAnthropic, toAnthropicMessages, type AnthropicClientLike } from './anthropic.ts';
import { makeGroq } from './groq.ts';
import { makeOpenRouter } from './openrouter.ts';
import { chatWithFallback, providersFor } from './router.ts';
import { ALL_TOOLS, toAnthropicTools, toOpenAITools } from './tools.ts';
import { LlmError, type LlmMessage } from './types.ts';
import { buildSystemPrompt } from './prompts.ts';

function eq(a: unknown, b: unknown, msg = '') {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}\n attendu : ${y}\n obtenu  : ${x}`);
}
function ok(v: unknown, msg = 'assertion') {
  if (!v) throw new Error(msg);
}

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

Deno.test('outils : convertis aux formats OpenAI et Anthropic', () => {
  const oa = toOpenAITools(ALL_TOOLS);
  const an = toAnthropicTools(ALL_TOOLS);
  eq(oa.length, ALL_TOOLS.length);
  eq(oa[0].type, 'function');
  eq(oa[0].function.name, 'get_free_slots');
  eq(an[0].name, 'get_free_slots');
  eq((an[0].input_schema as { type: string }).type, 'object');
});

Deno.test('Groq : requête compatible OpenAI et lecture des appels d’outils', async () => {
  let sent: Record<string, unknown> = {};
  let url = '';
  let auth = '';
  const groq = makeGroq('cle-test', async (u, init) => {
    url = u;
    auth = (init.headers as Record<string, string>).Authorization;
    sent = JSON.parse(String(init.body));
    return okResponse({
      model: 'llama-3.3-70b-versatile',
      choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'get_free_slots', arguments: '{"from_date":"2026-10-27","to_date":"2026-10-27","min_duration_min":60}' } }] } }],
      usage: { prompt_tokens: 120, completion_tokens: 20 },
    });
  });
  const res = await groq.chat({ system: 'sys', messages: [{ role: 'user', content: 'Bonjour' }], tools: ALL_TOOLS });
  eq(url, 'https://api.groq.com/openai/v1/chat/completions');
  eq(auth, 'Bearer cle-test');
  eq(sent.model, 'llama-3.3-70b-versatile');
  eq((sent.messages as { role: string }[])[0].role, 'system');
  eq(res.toolCalls[0].name, 'get_free_slots');
  eq(res.toolCalls[0].arguments.min_duration_min, 60);
  eq(res.usage, { inputTokens: 120, outputTokens: 20 });
  eq(res.provider, 'groq');
});

Deno.test('Secours : Groq 429 → OpenRouter avec OPENROUTER_FREE_MODEL', async () => {
  const groq = makeGroq('g', async () => new Response('trop de requêtes', { status: 429 }));
  let model = '';
  const openrouter = makeOpenRouter('o', 'modele/gratuit:free', async (_u, init) => {
    model = JSON.parse(String(init.body)).model;
    return okResponse({ choices: [{ message: { content: 'Salut' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
  });
  const res = await chatWithFallback([groq, openrouter], { system: 's', messages: [{ role: 'user', content: 'x' }] });
  eq(res.provider, 'openrouter');
  eq(model, 'modele/gratuit:free');
  eq(res.text, 'Salut');
});

Deno.test('Secours : Groq 503 ou réseau coupé → OpenRouter ; 400 → pas de secours', async () => {
  const or = makeOpenRouter('o', 'm', async () => okResponse({ choices: [{ message: { content: 'ok' } }] }));
  const g503 = makeGroq('g', async () => new Response('', { status: 503 }));
  eq((await chatWithFallback([g503, or], { system: 's', messages: [] })).provider, 'openrouter');
  const gNet = makeGroq('g', () => Promise.reject(new TypeError('connexion refusée')));
  eq((await chatWithFallback([gNet, or], { system: 's', messages: [] })).provider, 'openrouter');
  const g400 = makeGroq('g', async () => new Response('mauvaise requête', { status: 400 }));
  let thrown: unknown;
  try {
    await chatWithFallback([g400, or], { system: 's', messages: [] });
  } catch (e) {
    thrown = e;
  }
  ok(thrown instanceof LlmError && thrown.status === 400, '400 doit être renvoyé sans secours');
});

Deno.test('Groq : appel d’outil mal formé (400 tool_use_failed) → un nouvel essai', async () => {
  const temps: number[] = [];
  const groq = makeGroq('g', async (_u, init) => {
    const b = JSON.parse(String(init.body));
    temps.push(b.temperature);
    return temps.length === 1
      ? new Response('{"error":{"code":"tool_use_failed","message":"Failed to call a function"}}', { status: 400 })
      : okResponse({ choices: [{ message: { content: 'Ça marche' } }] });
  });
  const res = await groq.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: ALL_TOOLS });
  eq(res.text, 'Ça marche');
  eq(temps, [0.4, 0]);
});

Deno.test('Routage : Anthropic seulement si premium ET clé présente', () => {
  const env = { GROQ_API_KEY: 'g', OPENROUTER_API_KEY: 'o', OPENROUTER_FREE_MODEL: 'm' };
  eq(providersFor(env, true).map((p) => p.name), ['groq', 'openrouter']);
  eq(providersFor({ ...env, ANTHROPIC_API_KEY: 'a' }, false).map((p) => p.name), ['groq', 'openrouter']);
  const premium = providersFor({ ...env, ANTHROPIC_API_KEY: 'a' }, true);
  eq(premium.map((p) => p.name), ['anthropic', 'groq', 'openrouter']);
  eq(premium[0].model, 'claude-opus-5-5');
  eq(providersFor({ ...env, ANTHROPIC_API_KEY: 'a', ANTHROPIC_MODEL: 'claude-sonnet-5-5' }, true)[0].model, 'claude-sonnet-5-5');
});

function mockAnthropic(responses: unknown[]): { client: AnthropicClientLike; calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    client: {
      beta: {
        messages: {
          create: (params) => {
            calls.push(params);
            const r = responses.shift();
            return r instanceof Error ? Promise.reject(r) : Promise.resolve(r as never);
          },
        },
      },
    },
  };
}

Deno.test('Anthropic (simulé) : paramètres, outils, réflexion conservée, refus', async () => {
  const thinking = { type: 'thinking', thinking: '...', signature: 'sig' };
  const m = mockAnthropic([
    {
      model: 'claude-opus-5-5',
      content: [thinking, { type: 'text', text: 'Je regarde.' }, { type: 'tool_use', id: 'toolu_1', name: 'get_goals', input: {} }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 300, output_tokens: 40 },
    },
    { model: 'claude-opus-5-5', content: [], stop_reason: 'refusal', usage: { input_tokens: 10, output_tokens: 0 } },
  ]);
  const p = makeAnthropic({ apiKey: 'a', client: m.client });
  const r1 = await p.chat({ system: 'sys', messages: [{ role: 'user', content: 'Mes objectifs ?' }], tools: ALL_TOOLS, temperature: 0.4 });
  const params = m.calls[0];
  eq(params.model, 'claude-opus-5-5');
  eq(params.system, 'sys');
  ok(!('temperature' in params), 'pas de temperature');
  ok(!('thinking' in params), 'réflexion adaptative par défaut');
  eq(params.output_config, { effort: 'medium' });
  eq(params.tool_choice, { type: 'auto' });
  eq(params.fallbacks, 'default');
  eq(params.betas, ['server-side-fallback-2026-07-01']);
  eq(r1.toolCalls, [{ id: 'toolu_1', name: 'get_goals', arguments: {} }]);
  eq(r1.text, 'Je regarde.');
  eq(r1.provider, 'anthropic');

  // Tour suivant : les blocs bruts (réflexion comprise) sont renvoyés tels quels, résultats d'outils groupés.
  const history: LlmMessage[] = [
    { role: 'user', content: 'Mes objectifs ?' },
    { role: 'assistant', content: r1.text, toolCalls: r1.toolCalls, raw: r1.raw, rawProvider: 'anthropic' },
    { role: 'tool', toolCallId: 'toolu_1', name: 'get_goals', content: 'Aucun objectif.' },
  ];
  const r2 = await p.chat({ system: 'sys', messages: history, tools: ALL_TOOLS });
  const sentMsgs = m.calls[1].messages as { role: string; content: unknown }[];
  eq((sentMsgs[1].content as unknown[])[0], thinking);
  eq(sentMsgs[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Aucun objectif.' }] });
  ok(r2.refusal === true, 'refus détecté');
});

Deno.test('Anthropic : plusieurs résultats d’outils dans un seul message', () => {
  const msgs = toAnthropicMessages([
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'get_goals', arguments: {} }, { id: 'b', name: 'get_tasks', arguments: {} }] },
    { role: 'tool', toolCallId: 'a', name: 'get_goals', content: '1' },
    { role: 'tool', toolCallId: 'b', name: 'get_tasks', content: '2', isError: true },
  ]);
  eq(msgs.length, 2);
  eq((msgs[1].content as unknown[]).length, 2);
});

Deno.test('Anthropic : erreur 529 → LlmError réessayable', async () => {
  const err = Object.assign(new Error('surchargé'), { status: 529 });
  const m = mockAnthropic([err]);
  let thrown: unknown;
  try {
    await makeAnthropic({ apiKey: 'a', client: m.client }).chat({ system: 's', messages: [] });
  } catch (e) {
    thrown = e;
  }
  ok(thrown instanceof LlmError && thrown.retryable, 'réessayable');
});

Deno.test('Message système : règles en français et contexte', () => {
  const s = buildSystemPrompt('CONTEXTE', 'chat');
  ok(s.startsWith("Tu es l'assistante de planification de LifeBook."));
  ok(s.includes("n'invente jamais d'horaire"));
  ok(s.includes('5 phrases maximum'));
  ok(s.includes('jamais de diagnostic'));
  ok(s.endsWith('CONTEXTE'));
  ok(buildSystemPrompt('C', 'guided_parse').includes('UNIQUEMENT par un tableau JSON'));
  const life = buildSystemPrompt('C', 'chat', 'life');
  ok(life.includes('Planifier ma vie') && life.includes('level = life') && life.includes('add_goal_steps'));
  ok(!buildSystemPrompt('C', 'chat', 'home').includes('Planifier ma vie'));
});
