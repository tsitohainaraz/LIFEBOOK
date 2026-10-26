// Tests Deno de la fonction `assistant` : base de données en mémoire et fournisseur d'IA simulé.
import type { ChatRequest, ChatResult, LlmProvider } from '../llm/types.ts';
import { LlmError } from '../llm/types.ts';
import type { ProposedAction } from './actions.ts';
import { buildContext, RefMap, zonedNow, type ProfileLite } from './context.ts';
import { CRISIS_REPLY, detectDistress } from './crisis.ts';
import { extractJsonArray, handleAssistant, MAX_TOOL_ROUNDS, QUOTA_MESSAGE, type AssistantDb, type MessageLog } from './handler.ts';

function eq(a: unknown, b: unknown, msg = '') {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}\n attendu : ${y}\n obtenu  : ${x}`);
}
function ok(v: unknown, msg = 'assertion') {
  if (!v) throw new Error(msg);
}

// Lundi 26 octobre 2026, 08:00 à Antananarivo (UTC+3).
const NOW = Date.UTC(2026, 9, 26, 5, 0);
const T_BANK = '11111111-1111-1111-1111-111111111111';
const T_LATE = '22222222-2222-2222-2222-222222222222';
const G_ID = '33333333-3333-3333-3333-333333333333';

const profile: ProfileLite & { last_name: string; email: string } = {
  first_name: 'Hery',
  last_name: 'Rakotoarisoa',
  email: 'hery@example.com',
  birth_date: '1996-11-02',
  status: 'travailleur',
  status_detail: null,
  faith: 'chretien',
  faith_detail: null,
  sleep_hours: 8,
  work_hours: 40,
  retire_age: 60,
  timezone: 'Indian/Antananarivo',
  health_consent_at: '2026-01-01T00:00:00Z',
};

function fakeDb(opts: { remaining?: number } = {}) {
  let remaining = opts.remaining ?? 30;
  const messages: MessageLog[] = [];
  const actions: ProposedAction[] = [];
  let taken = 0;
  const tasks = [
    { id: T_BANK, title: 'Banque', category: 'autre', date: '2026-10-26', start: '10:00', end: '11:00', done: false, goal_id: null, is_priority: false, postponed_count: 0 },
    { id: T_LATE, title: 'Rapport', category: 'travail', date: '2026-10-26', start: '07:00', end: '07:45', done: false, goal_id: null, is_priority: true, postponed_count: 3 },
  ];
  const db: AssistantDb = {
    quota: () => Promise.resolve({ plan: 'free', daily_limit: 30, used: 30 - remaining, remaining }),
    takeQuota: () => {
      if (remaining <= 0) return Promise.resolve(false);
      remaining--;
      taken++;
      return Promise.resolve(true);
    },
    profile: () => Promise.resolve(profile),
    settings: () => Promise.resolve({ auto_apply: false, use_health: true }),
    tasks: (from, to) => Promise.resolve(tasks.filter((t) => t.date >= from && t.date <= to)),
    goals: () =>
      Promise.resolve([{ id: G_ID, title: 'Courir un semi-marathon', domain: 'sport', level: 'year', deadline: '2027-03-01', target_age: null, done: false, steps: [] }]),
    lifePlan: () => Promise.resolve({ mission: 'Servir ma famille', values: ['Foi', 'Santé'] }),
    insights: () => Promise.resolve(null),
    memories: () => Promise.resolve([{ kind: 'preference', text: 'Préfère le sport le matin' }]),
    health: () => Promise.resolve({ systolic: 135, diastolic: 80, conditions: [], diabetes: 'non', familyYes: ['avc'] }),
    history: () => Promise.resolve([]),
    ensureConversation: (id) => Promise.resolve(id ?? 'conv-1'),
    insertMessage: (m) => {
      messages.push(m);
      return Promise.resolve(`msg-${messages.length}`);
    },
    insertActions: (_id, list) => {
      actions.push(...list);
      return Promise.resolve(list.map((_, i) => `act-${actions.length - list.length + i + 1}`));
    },
  };
  return { db, messages, actions, taken: () => taken };
}

type Step = (req: ChatRequest) => Partial<ChatResult> | Error;
function scripted(steps: Step[]): LlmProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    name: 'groq',
    model: 'llama-3.3-70b-versatile',
    requests,
    chat(req) {
      requests.push(structuredClone(req));
      const step = steps.shift();
      const r = step ? step(req) : { text: 'Fin.' };
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve({ text: '', toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, provider: 'groq', model: 'llama-3.3-70b-versatile', ...r });
    },
  };
}

const call = (name: string, args: Record<string, unknown>, id = name) => ({ id, name, arguments: args });

Deno.test('Détresse : expressions en français et en malgache', () => {
  ok(detectDistress("J'ai envie d'en finir"));
  ok(detectDistress('je veux mourir, je n’en peux plus'));
  ok(detectDistress('Tsy te hiaina intsony aho'));
  ok(detectDistress('Te ho faty aho'));
  ok(!detectDistress('Planifie ma journée de demain'));
  ok(!detectDistress('Je meurs de faim, place le déjeuner'));
});

Deno.test('Heure locale calculée dans le fuseau du profil', () => {
  eq(zonedNow('Indian/Antananarivo', NOW), { date: '2026-10-26', time: '08:00', minutes: 480, timezone: 'Indian/Antananarivo' });
  eq(zonedNow('Fuseau/Inconnu', NOW).timezone, 'Indian/Antananarivo');
});

Deno.test('Contexte : prénom, calendrier, santé résumée ; jamais nom, e-mail ni mesures', () => {
  const refs = new RefMap();
  const text = buildContext(
    {
      profile,
      now: zonedNow(profile.timezone, NOW),
      tasks: [{ id: T_BANK, title: 'Banque', category: 'autre', date: '2026-10-26', start: '10:00', end: '11:00' }],
      goals: [],
      lifePlan: null,
      aggregates: null,
      memories: [],
      health: { systolic: 135, diastolic: 80, conditions: [], diabetes: null, familyYes: ['avc'] },
      useHealth: true,
    },
    refs,
  );
  ok(text.includes('Prénom : Hery ; âge : 29 ans'));
  ok(text.includes("aujourd'hui, lun. 26 oct. 2026 = 2026-10-26"));
  ok(text.includes('demain, mar. 27 oct. 2026 = 2026-10-27'));
  ok(text.includes('il est 08:00, fuseau Indian/Antananarivo'));
  ok(text.includes('- 10:00–11:00 Banque (autre) [t1]'));
  ok(text.includes('tension à surveiller'));
  ok(text.includes("antécédent familial d'AVC"));
  ok(text.includes('chrétienne'));
  ok(!text.includes('Rakotoarisoa'), 'jamais le nom de famille');
  ok(!text.includes('example.com'), "jamais l'e-mail");
  ok(!text.includes('135'), 'jamais de mesure brute');
  eq(refs.resolve('t1'), T_BANK);
});

Deno.test('Contexte : santé absente sans use_health ; croyance « rien » jamais mentionnée', () => {
  const text = buildContext(
    { profile: { ...profile, faith: 'rien' }, now: zonedNow(profile.timezone, NOW), tasks: [], goals: [], lifePlan: null, aggregates: null, memories: [], health: null, useHealth: false },
    new RefMap(),
  );
  ok(!text.includes('Santé'));
  ok(!text.includes('Croyance'));
});

Deno.test('Chat : outil de lecture puis proposition validée (ids courts traduits)', async () => {
  const f = fakeDb();
  const provider = scripted([
    () => ({ toolCalls: [call('get_free_slots', { from_date: '2026-10-27', to_date: '2026-10-27', min_duration_min: 60 })] }),
    (req) => {
      const toolMsg = req.messages[req.messages.length - 1];
      ok(toolMsg.role === 'tool' && toolMsg.content.includes('mar. 27 oct. 2026'), 'résultat de get_free_slots renvoyé au modèle');
      return { toolCalls: [call('create_task', { title: 'Courir', category: 'sport', date: '2026-10-27', start: '06:30', end: '07:30', goal_id: 'g1' }), call('move_task', { task_id: 't2', start: '16:00', end: '17:00' })] };
    },
    () => ({ text: 'Je te propose 1 h de course demain matin et la banque à 16 h.' }),
  ]);
  const res = await handleAssistant({ mode: 'chat', message: 'Trouve-moi 1 h pour le sport et décale la banque à 16 h' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  eq(res.reply, 'Je te propose 1 h de course demain matin et la banque à 16 h.');
  eq(res.proposed_actions.length, 2);
  const [create, move] = res.proposed_actions;
  ok(create.type === 'task_ops' && create.label === 'Ajouter : Courir · mar. 27 oct. 2026 · 06:30 – 07:30', create.label);
  ok(create.type === 'task_ops' && create.ops[0].op === 'create' && create.ops[0].task.goal_id === G_ID, 'g1 traduit');
  ok(move.type === 'task_ops' && move.label === 'Déplacer : Banque → 16:00');
  ok(move.type === 'task_ops' && move.ops[0].op === 'move' && move.ops[0].id === T_BANK, 't2 (Banque, après le Rapport de 07:00) traduit');
  ok(move.type === 'task_ops' && move.inverse[0].op === 'move' && move.inverse[0].start === '10:00', 'inverse');
  eq(res.proposed_actions[0].id, 'act-1');
  eq(f.taken(), 1, 'un seul message compté malgré 3 appels au modèle');
  eq(f.messages.map((m) => m.role), ['user', 'assistant']);
  eq(f.messages[1].provider, 'groq');
  eq(f.messages[1].input_tokens, 30);
  eq(f.actions.length, 2);
  ok(provider.requests[0].system.includes("Tu es l'assistante de planification de LifeBook."));
});

Deno.test('Chat : chevauchement, date hors calendrier et horaire passé refusés', async () => {
  const f = fakeDb();
  let feedback = '';
  const provider = scripted([
    () => ({
      toolCalls: [
        call('create_task', { title: 'Lire', category: 'etudes', date: '2026-10-26', start: '10:30', end: '11:30' }, 'a'),
        call('create_task', { title: 'Voyage', category: 'autre', date: '2026-12-25', start: '10:00', end: '11:00' }, 'b'),
        call('create_task', { title: 'Tôt', category: 'autre', date: '2026-10-26', start: '07:30', end: '07:50' }, 'c'),
        call('create_task', { title: 'Nuit', category: 'repos', date: '2026-10-27', start: '23:30', end: '23:50' }, 'd'),
      ],
    }),
    (req) => {
      feedback = req.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('\n');
      return { text: 'Ces créneaux ne sont pas libres.' };
    },
  ]);
  const res = await handleAssistant({ mode: 'chat', message: 'Ajoute des choses' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  eq(res.proposed_actions.length, 0);
  ok(feedback.includes('chevauche « Banque »'), feedback);
  ok(feedback.includes('hors du calendrier'), feedback);
  ok(feedback.includes('déjà passé'), feedback);
  ok(feedback.includes('empiète sur le sommeil'), feedback);
  eq(res.errors?.length, 4);
});

Deno.test(`Chat : au plus ${MAX_TOOL_ROUNDS} tours d'outils`, async () => {
  const f = fakeDb();
  const steps: Step[] = Array.from({ length: 10 }, () => () => ({ toolCalls: [call('get_goals', {})] }));
  const provider = scripted(steps);
  await handleAssistant({ mode: 'chat', message: 'Mes objectifs ?' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  eq(provider.requests.length, MAX_TOOL_ROUNDS + 1);
  ok(provider.requests[MAX_TOOL_ROUNDS].tools === undefined, 'dernier appel sans outils');
});

Deno.test('Chat : quota atteint → message prévu, aucun appel au modèle', async () => {
  const f = fakeDb({ remaining: 0 });
  const provider = scripted([]);
  const res = await handleAssistant({ mode: 'chat', message: 'Planifie ma journée' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  eq(res.reply, QUOTA_MESSAGE);
  ok(res.quota_exceeded);
  eq(provider.requests.length, 0);
});

Deno.test('Chat : détresse détectée avant l’appel → réponse chaleureuse, aucune action, quota intact', async () => {
  const f = fakeDb();
  const provider = scripted([]);
  const res = await handleAssistant({ mode: 'chat', message: "Je n'ai plus envie de vivre" }, { db: f.db, providers: [provider], nowMs: () => NOW });
  ok(res.crisis);
  eq(res.reply, CRISIS_REPLY);
  eq(res.proposed_actions, []);
  eq(provider.requests.length, 0);
  eq(f.taken(), 0);
});

Deno.test('Chat : drapeau crisis du modèle → actions retirées', async () => {
  const f = fakeDb();
  const provider = scripted([
    () => ({ toolCalls: [call('create_task', { title: 'Marcher', category: 'sport', date: '2026-10-27', start: '07:00', end: '07:30' }), call('signal_crisis', {})] }),
  ]);
  const res = await handleAssistant({ mode: 'chat', message: 'Tout est trop lourd' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  ok(res.crisis);
  eq(res.reply, CRISIS_REPLY);
  eq(res.proposed_actions, []);
});

Deno.test('Chat : Groq indisponible → OpenRouter répond', async () => {
  const f = fakeDb();
  const groq = scripted([() => new LlmError('429', 'groq', 429)]);
  const openrouter = { ...scripted([() => ({ text: 'Réponse du secours.', provider: 'openrouter', model: 'gratuit' })]), name: 'openrouter' };
  const res = await handleAssistant({ mode: 'chat', message: 'Bonjour' }, { db: f.db, providers: [groq, openrouter], nowMs: () => NOW });
  eq(res.reply, 'Réponse du secours.');
  eq(res.provider, 'openrouter');
});

Deno.test('plan_day : le planificateur place les éléments dans les créneaux libres', async () => {
  const f = fakeDb();
  const provider = scripted([
    () => ({
      toolCalls: [
        call('plan_day', {
          date: '2026-10-27',
          energy: 'normal',
          items: [
            { title: 'Préparer la réunion', category: 'travail', duration_min: 60, priority: 'must' },
            { title: 'Dentiste', category: 'sante', duration_min: 30, priority: 'must', fixed_time: '14:00' },
          ],
        }),
      ],
    }),
    () => ({ text: 'Voici ta journée.' }),
  ]);
  const res = await handleAssistant({ mode: 'chat', message: 'Planifie ma journée de demain' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  const a = res.proposed_actions[0];
  ok(a && a.type === 'task_ops' && a.tool === 'plan_day', 'action plan_day');
  ok(a.type === 'task_ops' && a.details.some((d) => d.startsWith('Ajouter : Dentiste · mar. 27 oct. 2026 · 14:00 – 14:30')), JSON.stringify(a));
  ok(a.type === 'task_ops' && a.ops.length >= 2);
});

Deno.test('guided_parse : JSON strict, un seul nouvel essai', async () => {
  const f = fakeDb();
  const provider = scripted([
    () => ({ text: 'Voici : pas de JSON' }),
    () => ({ text: '```json\n[{"title":"Appeler maman","category":"famille","duration_min":33,"priority":"must"},{"title":"Dentiste","category":"inconnue","duration_min":30,"priority":"must","fixed_time":"14:00","goal_id":"g1"},{"category":"autre"}]\n```' }),
  ]);
  const res = await handleAssistant(
    { mode: 'guided_parse', date: '2026-10-27', answers: [{ question: 'Qu’est-ce qui doit absolument être fait ?', answer: 'appeler maman, dentiste à 14 h' }] },
    { db: f.db, providers: [provider], nowMs: () => NOW },
  );
  eq(provider.requests.length, 2);
  eq(res.items, [
    { title: 'Appeler maman', category: 'famille', duration_min: 35, priority: 'must', fixed_time: null, goal_id: null },
    { title: 'Dentiste', category: 'autre', duration_min: 30, priority: 'must', fixed_time: '14:00', goal_id: G_ID },
  ]);
  eq(f.taken(), 1);
});

Deno.test('guided_parse : deux réponses invalides → ai=false (le parcours continue sans IA)', async () => {
  const f = fakeDb();
  const provider = scripted([() => ({ text: 'non' }), () => ({ text: 'toujours non' })]);
  const res = await handleAssistant({ mode: 'guided_parse', answers: [{ question: 'q', answer: 'r' }] }, { db: f.db, providers: [provider], nowMs: () => NOW });
  eq(res.ai, false);
  eq(res.items, []);
});

Deno.test('explain_plan : quota atteint → explication sans IA', async () => {
  const f = fakeDb({ remaining: 0 });
  const res = await handleAssistant(
    { mode: 'explain_plan', plan: [{ title: 'Courir', start: '06:30', end: '07:00' }], non_places: ['Lire'] },
    { db: f.db, providers: [scripted([])], nowMs: () => NOW },
  );
  eq(res.ai, false);
  eq(res.reply, "J'ai placé 1 élément dans tes créneaux libres, les plus importants d'abord. Sans place : Lire.");
});

Deno.test('adjust_plan : « décale la banque à 16 h » → opération vérifiée sur le programme proposé', async () => {
  const f = fakeDb();
  const provider = scripted([
    (req) => {
      const m = req.messages[0];
      ok(m.role === 'user' && m.content.includes('Banque au guichet'), 'programme envoyé');
      const ref = /Banque au guichet \(autre\) \[(t\d+)\]/.exec(m.role === 'user' ? m.content : '')![1];
      return { toolCalls: [call('move_task', { task_id: ref, start: '16:00', end: '16:30' })] };
    },
    () => ({ text: 'La banque passe à 16 h.' }),
  ]);
  const res = await handleAssistant(
    {
      mode: 'adjust_plan',
      date: '2026-10-27',
      message: 'décale la banque à 16 h',
      plan: [
        { id: 'p1', title: 'Banque au guichet', category: 'autre', start: '09:00', end: '09:30' },
        { id: 'p2', title: 'Courir', category: 'sport', start: '06:30', end: '07:00' },
      ],
    },
    { db: f.db, providers: [provider], nowMs: () => NOW },
  );
  eq(res.ops, [{ op: 'move', id: 'p1', date: '2026-10-27', start: '16:00', end: '16:30' }]);
  eq(res.tasks?.find((t) => t.id === 'p1')?.start, '16:00');
});

Deno.test('replan_rest_of_day : la tâche en retard est replacée après maintenant', async () => {
  const f = fakeDb();
  const provider = scripted([() => ({ text: 'Je décale le rapport juste après maintenant.' })]);
  const res = await handleAssistant({ mode: 'replan_rest_of_day' }, { db: f.db, providers: [provider], nowMs: () => NOW });
  const moveLate = res.ops?.find((o) => o.op === 'move' && o.id === T_LATE);
  ok(moveLate && moveLate.op === 'move' && moveLate.start >= '08:05', JSON.stringify(res.ops));
  eq(res.reply, 'Je décale le rapport juste après maintenant.');
  eq(res.proposed_actions.length, 1);
  ok(res.proposed_actions[0].type === 'task_ops' && res.proposed_actions[0].inverse.some((o) => o.op === 'move' && o.id === T_LATE && o.start === '07:00'), 'inverse vers 07:00');
});

Deno.test('extractJsonArray : tolère un bloc de code, refuse le reste', () => {
  eq(extractJsonArray('```json\n[1,2]\n```'), [1, 2]);
  eq(extractJsonArray('{"a":1}'), null);
  eq(extractJsonArray('[1,'), null);
});

Deno.test('replan_rest_of_day : ce qui ne rentre plus passe à demain', async () => {
  const { replanRestOfDay } = await import('./handler.ts');
  const t = (id: string, start: string, end: string) => ({ id, title: id, category: 'travail', date: '2026-10-26', start, end, done: false, postponed_count: 0 });
  const r = replanRestOfDay(
    {
      tasks: [t('A', '19:00', '20:00'), t('B', '20:30', '21:30')],
      now: { date: '2026-10-26', time: '21:00', minutes: 21 * 60, timezone: 'Indian/Antananarivo' },
      sleep: { wake: '06:30', bed: '22:30' },
      calendarDates: ['2026-10-26', '2026-10-27'],
    },
    [],
    false,
  );
  const today = r.ops.filter((o) => o.op === 'move' && o.date === '2026-10-26');
  const tomorrow = r.ops.filter((o) => o.op === 'move' && o.date === '2026-10-27');
  eq(today.length, 1);
  eq(tomorrow.length, 1);
  eq(r.tomorrow.length, 1);
  eq(r.stillUnplaced.length, 0);
});
