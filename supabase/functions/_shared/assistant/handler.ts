// Cœur de la fonction `assistant`, indépendant de Supabase (accès aux données injecté) : testé avec Deno.
import type { InsightAggregates } from '../planning/insights.ts';
import { computeInsights } from '../planning/insights.ts';
import { getFreeSlots, sleepFromHours } from '../planning/freeSlots.ts';
import { applyOps, describeOp, type PlanOp, type PlanTask } from '../planning/planOps.ts';
import { proposeDayPlan, type Energy, type ToPlace } from '../planning/scheduler.ts';
import { addDays, calendar, frenchDate, isValidDate, toHHMM, toMin } from '../planning/time.ts';
import { chatWithFallback } from '../llm/router.ts';
import { buildSystemPrompt, type PromptMode } from '../llm/prompts.ts';
import { ALL_TOOLS, READ_TOOL_NAMES, WRITE_TOOLS } from '../llm/tools.ts';
import type { ChatResult, LlmMessage, LlmProvider, ToolSpec } from '../llm/types.ts';
import { sanitizeItem, validateWriteTool, type ProposedAction, type ValidationState } from './actions.ts';
import {
  buildContext,
  goalLine,
  healthGuard,
  RefMap,
  taskLine,
  zonedNow,
  type ContextTask,
  type GoalLite,
  type HealthLite,
  type LocalNow,
  type ProfileLite,
} from './context.ts';
import { CRISIS_REPLY, detectDistress } from './crisis.ts';

export const QUOTA_MESSAGE = "Tu as atteint la limite de l'assistante pour aujourd'hui. Elle revient demain.";
export const UNAVAILABLE_MESSAGE = "L'assistante est indisponible pour le moment. Réessaie dans un instant.";
export const MAX_TOOL_ROUNDS = 4;
const HISTORY_LIMIT = 12;

export type AiContextKind = 'home' | 'day' | 'week' | 'life' | 'guided';

export interface Quota {
  plan: string;
  daily_limit: number;
  used: number;
  remaining: number;
}

export interface MessageLog {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  proposed_actions?: ProposedAction[];
  provider?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms?: number | null;
}

/** Accès aux données (client Supabase avec le jeton de l'utilisateur : la RLS s'applique). */
export interface AssistantDb {
  quota(): Promise<Quota | null>;
  takeQuota(): Promise<boolean>;
  profile(): Promise<ProfileLite | null>;
  settings(): Promise<{ auto_apply: boolean; use_health: boolean }>;
  tasks(from: string, to: string): Promise<(ContextTask & { postponed_count: number })[]>;
  goals(): Promise<GoalLite[]>;
  lifePlan(): Promise<{ mission: string | null; values: string[] } | null>;
  insights(days: number): Promise<InsightAggregates | null>;
  memories(): Promise<{ kind: string; text: string }[]>;
  health(): Promise<HealthLite | null>;
  history(conversationId: string, limit: number): Promise<{ role: 'user' | 'assistant'; content: string }[]>;
  ensureConversation(id: string | null, context: AiContextKind, title: string): Promise<string>;
  insertMessage(m: MessageLog): Promise<string>;
  insertActions(messageId: string, actions: ProposedAction[]): Promise<string[]>;
}

export interface Deps {
  db: AssistantDb;
  providers: LlmProvider[];
  nowMs: () => number;
}

export interface AssistantRequest {
  mode: PromptMode;
  conversation_id?: string | null;
  context?: AiContextKind;
  message?: string;
  date?: string;
  energy?: Energy;
  answers?: { question: string; answer: string }[];
  plan?: { title: string; category?: string; start: string; end: string; id?: string; goal_id?: string | null }[];
  non_places?: string[];
}

export interface AssistantResponse {
  conversation_id?: string;
  message_id?: string;
  reply: string;
  proposed_actions: (ProposedAction & { id?: string })[];
  crisis: boolean;
  quota_exceeded: boolean;
  /** false : réponse construite sans IA (quota atteint ou fournisseurs indisponibles). */
  ai: boolean;
  remaining: number | null;
  provider?: string;
  model?: string;
  items?: ToPlace[];
  ops?: PlanOp[];
  tasks?: PlanTask[];
  tomorrow?: ToPlace[];
  errors?: string[];
}

interface Loaded {
  profile: ProfileLite;
  now: LocalNow;
  calendarDates: string[];
  tasks: (ContextTask & { postponed_count: number })[];
  goals: GoalLite[];
  aggregates: InsightAggregates | null;
  health: HealthLite | null;
  refs: RefMap;
  context: string;
  sleep: ReturnType<typeof sleepFromHours>;
}

async function load(db: AssistantDb, nowMs: number): Promise<Loaded> {
  const profile = await db.profile();
  if (!profile) throw new Error('Profil introuvable.');
  const now = zonedNow(profile.timezone, nowMs);
  const cal = calendar(now.date, 14).map((c) => c.date);
  const [tasks, goals, lifePlan, aggregates, memories, health, settings] = await Promise.all([
    db.tasks(now.date, cal[cal.length - 1]),
    db.goals(),
    db.lifePlan(),
    db.insights(28),
    db.memories(),
    db.health(),
    db.settings(),
  ]);
  const refs = new RefMap();
  const context = buildContext({ profile, now, tasks, goals, lifePlan, aggregates, memories, health, useHealth: settings.use_health }, refs);
  return { profile, now, calendarDates: cal, tasks, goals, aggregates, health, refs, context, sleep: sleepFromHours(Number(profile.sleep_hours) || 8) };
}

function validationState(l: Loaded): ValidationState {
  const ins = l.aggregates ? computeInsights(l.aggregates) : null;
  return {
    tasks: l.tasks.map((t) => ({ ...t })),
    refs: l.refs,
    allowedDates: l.calendarDates,
    sleep: l.sleep,
    now: { date: l.now.date, minutes: l.now.minutes },
    goalIds: new Set(l.goals.map((g) => g.id)),
    bestRanges: ins?.bestRanges ?? [],
    sportWeekMin: ins?.sportWeekMin ?? 0,
    healthGuard: healthGuard(l.health),
  };
}

/** Outils de lecture, exécutés ici. */
async function runReadTool(name: string, args: Record<string, unknown>, l: Loaded, db: AssistantDb): Promise<string> {
  const clampRange = () => {
    const from = isValidDate(args.from_date) && l.calendarDates.includes(String(args.from_date)) ? String(args.from_date) : l.now.date;
    const toRaw = isValidDate(args.to_date) ? String(args.to_date) : from;
    const last = l.calendarDates[l.calendarDates.length - 1];
    return { from, to: toRaw < from ? from : toRaw > last ? last : toRaw };
  };
  switch (name) {
    case 'get_free_slots': {
      const { from, to } = clampRange();
      const min = Math.max(5, Math.min(600, Number(args.min_duration_min) || 30));
      const timed = l.tasks.filter((t) => t.start && t.end).map((t) => ({ date: t.date, start: t.start!, end: t.end!, done: t.done }));
      const slots = getFreeSlots(timed, [], l.sleep, null, from, to, min, { date: l.now.date, minutes: l.now.minutes });
      if (!slots.length) return `Aucun créneau libre d'au moins ${min} min entre ${frenchDate(from)} et ${frenchDate(to)}.`;
      return slots
        .slice(0, 40)
        .map((s) => `- ${frenchDate(s.date)} (${s.date}) : ${s.start} – ${s.end} (${s.minutes} min)`)
        .join('\n');
    }
    case 'get_tasks': {
      const { from, to } = clampRange();
      const list = l.tasks.filter((t) => t.date >= from && t.date <= to);
      if (!list.length) return 'Aucune tâche sur cette période.';
      const out: string[] = [];
      for (const date of [...new Set(list.map((t) => t.date))].sort()) {
        out.push(`${frenchDate(date)} (${date}) :`);
        for (const t of list.filter((x) => x.date === date).sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'))) out.push(taskLine(t, l.refs));
      }
      return out.join('\n');
    }
    case 'get_goals':
      return l.goals.length ? l.goals.map((g) => goalLine(g, l.refs)).join('\n') : 'Aucun objectif.';
    case 'get_history': {
      const days = Math.max(1, Math.min(60, Number(args.days) || 7));
      const from = addDays(l.now.date, -days);
      const past = (await db.tasks(from, addDays(l.now.date, -1))) ?? [];
      const done = past.filter((t) => t.done).length;
      const notDone = past.length - done;
      const postponed = past.filter((t) => (t.postponed_count ?? 0) > 0).sort((a, b) => (b.postponed_count ?? 0) - (a.postponed_count ?? 0));
      const lines = [`Sur les ${days} derniers jours : ${past.length} tâches, ${done} faites, ${notDone} non faites (abandonnées), ${postponed.length} reportées au moins une fois.`];
      if (postponed.length) lines.push(`Les plus reportées : ${postponed.slice(0, 5).map((t) => `${t.title} (${t.postponed_count} fois)`).join(', ')}.`);
      return lines.join('\n');
    }
  }
  return 'Outil inconnu.';
}

interface LoopResult {
  text: string;
  actions: ProposedAction[];
  crisis: boolean;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errors: string[];
}

/** Boucle d'outils : au plus 4 tours ; les outils d'écriture deviennent des actions proposées validées. */
async function toolLoop(deps: Deps, system: string, messages: LlmMessage[], tools: ToolSpec[], l: Loaded, state: ValidationState): Promise<LoopResult> {
  const actions: ProposedAction[] = [];
  const errors: string[] = [];
  let crisis = false;
  let inputTokens = 0;
  let outputTokens = 0;
  const started = deps.nowMs();
  let last: ChatResult | null = null;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await chatWithFallback(deps.providers, { system, messages, tools: round < MAX_TOOL_ROUNDS ? tools : undefined, maxTokens: 1200, temperature: 0.4 });
    last = res;
    inputTokens += res.usage.inputTokens;
    outputTokens += res.usage.outputTokens;
    if (res.refusal || !res.toolCalls.length) break;
    messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls, raw: res.raw, rawProvider: res.provider });
    for (const call of res.toolCalls) {
      let content: string;
      let isError = false;
      if (call.name === 'signal_crisis') {
        crisis = true;
        content = 'Noté.';
      } else if (READ_TOOL_NAMES.has(call.name)) {
        content = await runReadTool(call.name, call.arguments, l, deps.db);
      } else {
        const v = validateWriteTool(call.name, call.arguments, state);
        if (v.ok) {
          actions.push(v.action);
          content = `Proposition enregistrée (l'utilisateur doit valider) : ${v.summary}`;
        } else {
          errors.push(v.error);
          content = `Refusé : ${v.error} Corrige et propose à nouveau, ou explique-le à l'utilisateur.`;
          isError = true;
        }
      }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content, isError });
    }
    if (crisis) break;
  }
  return {
    text: (last?.text ?? '').trim(),
    actions: crisis ? [] : actions,
    crisis,
    provider: last?.provider ?? '',
    model: last?.model ?? '',
    inputTokens,
    outputTokens,
    latencyMs: deps.nowMs() - started,
    errors,
  };
}

function baseResponse(reply: string, extra: Partial<AssistantResponse> = {}): AssistantResponse {
  return { reply, proposed_actions: [], crisis: false, quota_exceeded: false, ai: true, remaining: null, ...extra };
}

async function persist(
  db: AssistantDb,
  conversationId: string,
  userText: string,
  out: { text: string; actions: ProposedAction[]; provider?: string; model?: string; inputTokens?: number; outputTokens?: number; latencyMs?: number },
): Promise<{ messageId: string; actionIds: string[] }> {
  await db.insertMessage({ conversation_id: conversationId, role: 'user', content: userText.slice(0, 12000) });
  const messageId = await db.insertMessage({
    conversation_id: conversationId,
    role: 'assistant',
    content: out.text.slice(0, 12000),
    proposed_actions: out.actions,
    provider: out.provider ?? null,
    model: out.model ?? null,
    input_tokens: out.inputTokens ?? null,
    output_tokens: out.outputTokens ?? null,
    latency_ms: out.latencyMs ?? null,
  });
  const actionIds = out.actions.length ? await db.insertActions(messageId, out.actions) : [];
  return { messageId, actionIds };
}

const withIds = (actions: ProposedAction[], ids: string[]) => actions.map((a, i) => ({ ...a, id: ids[i] }));

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function chatMode(req: AssistantRequest, deps: Deps): Promise<AssistantResponse> {
  const { db } = deps;
  const text = (req.message ?? '').trim().slice(0, 4000);
  if (!text) return baseResponse('Écris ta demande, je m’occupe du reste.', { ai: false });
  const context = req.context ?? 'home';
  const conversationId = await db.ensureConversation(req.conversation_id ?? null, context, text.slice(0, 60));

  // Détresse : vérifiée avant tout appel, ne consomme pas le quota.
  if (detectDistress(text)) {
    const { messageId } = await persist(db, conversationId, text, { text: CRISIS_REPLY, actions: [], provider: 'lifebook', model: 'detection' });
    return baseResponse(CRISIS_REPLY, { conversation_id: conversationId, message_id: messageId, crisis: true, ai: false });
  }

  if (!(await db.takeQuota())) {
    return baseResponse(QUOTA_MESSAGE, { conversation_id: conversationId, quota_exceeded: true, ai: false, remaining: 0 });
  }

  const l = await load(db, deps.nowMs());
  const history = await db.history(conversationId, HISTORY_LIMIT);
  const messages: LlmMessage[] = [...history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage), { role: 'user', content: text }];
  const state = validationState(l);
  let out: LoopResult;
  try {
    out = await toolLoop(deps, buildSystemPrompt(l.context, 'chat', context), messages, ALL_TOOLS, l, state);
  } catch {
    return baseResponse(UNAVAILABLE_MESSAGE, { conversation_id: conversationId, ai: false, remaining: (await db.quota())?.remaining ?? null });
  }
  const reply = out.crisis ? CRISIS_REPLY : out.text || (out.actions.length ? 'Voici ce que je te propose.' : 'Je n’ai pas compris, peux-tu reformuler ?');
  const { messageId, actionIds } = await persist(db, conversationId, text, { ...out, text: reply });
  return baseResponse(reply, {
    conversation_id: conversationId,
    message_id: messageId,
    proposed_actions: withIds(out.actions, actionIds),
    crisis: out.crisis,
    remaining: (await db.quota())?.remaining ?? null,
    provider: out.provider,
    model: out.model,
    errors: out.errors.length ? out.errors : undefined,
  });
}

/** Extrait un tableau JSON d'une réponse (tolère un bloc ```json). */
export function extractJsonArray(text: string): unknown[] | null {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function guidedParseMode(req: AssistantRequest, deps: Deps): Promise<AssistantResponse> {
  const { db } = deps;
  const answers = (req.answers ?? []).filter((a) => a && typeof a.answer === 'string' && a.answer.trim()).slice(0, 12);
  if (!answers.length) return baseResponse('', { items: [], ai: false });
  if (!(await db.takeQuota())) return baseResponse(QUOTA_MESSAGE, { quota_exceeded: true, ai: false, remaining: 0, items: [] });
  const l = await load(db, deps.nowMs());
  const date = req.date && l.calendarDates.includes(req.date) ? req.date : l.calendarDates[1];
  const userText =
    `Journée à planifier : ${frenchDate(date)} (${date}).\n` + answers.map((a) => `Question : ${a.question.slice(0, 300)}\nRéponse : ${a.answer.slice(0, 1500)}`).join('\n\n');
  const system = buildSystemPrompt(l.context, 'guided_parse');
  const messages: LlmMessage[] = [{ role: 'user', content: userText }];
  const state = { refs: l.refs, goalIds: new Set(l.goals.map((g) => g.id)) };
  const started = deps.nowMs();
  let tokens = { i: 0, o: 0 };
  let res: ChatResult | null = null;
  let items: ToPlace[] | null = null;
  try {
    for (let attempt = 0; attempt < 2 && !items; attempt++) {
      res = await chatWithFallback(deps.providers, { system, messages, maxTokens: 1200, temperature: 0.1 });
      tokens = { i: tokens.i + res.usage.inputTokens, o: tokens.o + res.usage.outputTokens };
      const arr = extractJsonArray(res.text);
      if (arr) items = arr.map((x) => sanitizeItem(x, state)).filter((x): x is ToPlace => x !== null);
      else {
        messages.push({ role: 'assistant', content: res.text });
        messages.push({ role: 'user', content: "Ta réponse n'était pas un tableau JSON valide. Réponds uniquement par le tableau JSON demandé." });
      }
    }
  } catch {
    return baseResponse(UNAVAILABLE_MESSAGE, { ai: false, items: [] });
  }
  if (!items) return baseResponse('', { ai: false, items: [], errors: ['JSON invalide après un nouvel essai.'] });
  const conversationId = await db.ensureConversation(req.conversation_id ?? null, 'guided', `Planification du ${frenchDate(date)}`);
  const summary = items.map((i) => `${i.title} (${i.duration_min} min${i.fixed_time ? ` à ${i.fixed_time}` : ''})`).join(', ');
  await persist(db, conversationId, userText, {
    text: summary || 'Rien à placer.',
    actions: [],
    provider: res?.provider,
    model: res?.model,
    inputTokens: tokens.i,
    outputTokens: tokens.o,
    latencyMs: deps.nowMs() - started,
  });
  return baseResponse('', { conversation_id: conversationId, items, provider: res?.provider, model: res?.model, remaining: (await db.quota())?.remaining ?? null });
}

/** Explication sans IA, si le quota est atteint ou les fournisseurs indisponibles. */
export function fallbackExplanation(placed: number, nonPlaces: string[]): string {
  const base = placed ? `J'ai placé ${placed} élément${placed > 1 ? 's' : ''} dans tes créneaux libres, les plus importants d'abord.` : "Je n'ai rien pu placer dans tes créneaux libres.";
  return nonPlaces.length ? `${base} Sans place : ${nonPlaces.join(', ')}.` : base;
}

async function explainPlanMode(req: AssistantRequest, deps: Deps): Promise<AssistantResponse> {
  const { db } = deps;
  const plan = (req.plan ?? []).slice(0, 40);
  const nonPlaces = (req.non_places ?? []).slice(0, 20);
  const fallback = fallbackExplanation(plan.length, nonPlaces);
  if (!(await db.takeQuota())) return baseResponse(fallback, { quota_exceeded: true, ai: false, remaining: 0 });
  const l = await load(db, deps.nowMs());
  const date = req.date && l.calendarDates.includes(req.date) ? req.date : l.calendarDates[1];
  const userText = [
    `Programme proposé pour ${frenchDate(date)}, énergie : ${req.energy ?? 'normal'} :`,
    ...plan.map((p) => `- ${p.start}–${p.end} ${p.title}`),
    nonPlaces.length ? `Sans place : ${nonPlaces.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const started = deps.nowMs();
  let res: ChatResult;
  try {
    res = await chatWithFallback(deps.providers, { system: buildSystemPrompt(l.context, 'explain_plan'), messages: [{ role: 'user', content: userText }], maxTokens: 400, temperature: 0.5 });
  } catch {
    return baseResponse(fallback, { ai: false });
  }
  const reply = res.text.trim() || fallback;
  const conversationId = await db.ensureConversation(req.conversation_id ?? null, 'guided', `Planification du ${frenchDate(date)}`);
  const { messageId } = await persist(db, conversationId, userText, {
    text: reply,
    actions: [],
    provider: res.provider,
    model: res.model,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
    latencyMs: deps.nowMs() - started,
  });
  return baseResponse(reply, { conversation_id: conversationId, message_id: messageId, provider: res.provider, model: res.model, remaining: (await db.quota())?.remaining ?? null });
}

const ADJUST_TOOLS = WRITE_TOOLS.filter((t) => ['create_task', 'move_task', 'resize_task', 'delete_task'].includes(t.name));

async function adjustPlanMode(req: AssistantRequest, deps: Deps): Promise<AssistantResponse> {
  const { db } = deps;
  const instruction = (req.message ?? '').trim().slice(0, 1000);
  if (!instruction) return baseResponse('Dis-moi ce que tu veux changer.', { ai: false, ops: [] });
  if (detectDistress(instruction)) return baseResponse(CRISIS_REPLY, { crisis: true, ai: false, ops: [] });
  if (!(await db.takeQuota())) return baseResponse(QUOTA_MESSAGE, { quota_exceeded: true, ai: false, remaining: 0, ops: [] });
  const l = await load(db, deps.nowMs());
  const date = req.date && l.calendarDates.includes(req.date) ? req.date : l.calendarDates[1];
  // Programme proposé (pas encore enregistré) + tâches déjà prévues ce jour-là.
  const proposed: PlanTask[] = (req.plan ?? []).slice(0, 40).map((p, i) => ({
    id: p.id || `p${i + 1}`,
    title: String(p.title).slice(0, 200),
    category: p.category ?? 'autre',
    date,
    start: p.start,
    end: p.end,
    goal_id: p.goal_id ?? null,
  }));
  const state = validationState(l);
  state.tasks = [...state.tasks, ...proposed];
  state.allowedDates = [date];
  const userText = [
    `Programme proposé pour ${frenchDate(date)} (${date}) :`,
    ...proposed.map((t) => taskLine(t, l.refs)),
    `Demande : ${instruction}`,
  ].join('\n');
  const started = deps.nowMs();
  let out: LoopResult;
  try {
    out = await toolLoop(deps, buildSystemPrompt(l.context, 'adjust_plan'), [{ role: 'user', content: userText }], ADJUST_TOOLS, l, state);
  } catch {
    return baseResponse(UNAVAILABLE_MESSAGE, { ai: false, ops: [] });
  }
  const ops = out.actions.flatMap((a) => (a.type === 'task_ops' ? a.ops : []));
  const ids = new Set(proposed.map((p) => p.id));
  const tasks = state.tasks.filter((t) => t.date === date && (ids.has(t.id) || t.id.startsWith('new-')));
  const reply = out.crisis ? CRISIS_REPLY : out.text || (ops.length ? 'C’est ajusté.' : 'Je n’ai pas pu appliquer ce changement.');
  const conversationId = await db.ensureConversation(req.conversation_id ?? null, 'guided', `Planification du ${frenchDate(date)}`);
  await persist(db, conversationId, userText, { ...out, text: reply, actions: [], latencyMs: deps.nowMs() - started });
  return baseResponse(reply, {
    conversation_id: conversationId,
    ops: out.crisis ? [] : ops,
    tasks,
    crisis: out.crisis,
    provider: out.provider,
    model: out.model,
    errors: out.errors.length ? out.errors : undefined,
    remaining: (await db.quota())?.remaining ?? null,
  });
}

/** Réorganisation déterministe du reste de la journée ; l'IA ne fait qu'expliquer. */
export function replanRestOfDay(l: Pick<Loaded, 'tasks' | 'now' | 'sleep' | 'calendarDates'>, bestRanges: string[], guard: boolean) {
  const today = l.now.date;
  const tomorrow = l.calendarDates[1];
  const start = Math.ceil((l.now.minutes + 5) / 5) * 5;
  const todays = l.tasks.filter((t) => t.date === today && t.start && t.end);
  // À replacer : toutes les tâches non faites (en retard ou à venir) ; les tâches faites restent où elles sont.
  const keep = todays.filter((t) => t.done);
  const items: ToPlace[] = todays.filter((t) => !t.done).map((t) => ({
    key: t.id,
    title: t.title,
    category: t.category,
    duration_min: toMin(t.end!) - toMin(t.start!),
    priority: t.is_priority ? 'must' : 'should',
    goal_id: t.goal_id ?? null,
  }));
  const plan = proposeDayPlan(
    today,
    items,
    keep.map((t) => ({ date: t.date, start: t.start!, end: t.end! })),
    { bestRanges: bestRanges as never, sportWeekMin: 999 },
    { sleep: l.sleep, startMin: start, healthGuard: guard },
    'normal',
  );
  const ops: PlanOp[] = [];
  const seen = new Set<string>();
  for (const p of plan.placed) {
    const id = p.key.split('#')[0];
    const original = todays.find((t) => t.id === id);
    if (!original) continue;
    if (!seen.has(id)) {
      seen.add(id);
      if (original.start?.slice(0, 5) !== p.start || original.end?.slice(0, 5) !== p.end) ops.push({ op: 'move', id, date: today, start: p.start, end: p.end });
    } else {
      ops.push({ op: 'create', ref: `new-${crypto.randomUUID().slice(0, 8)}`, task: { title: p.title, category: p.category, date: today, start: p.start, end: p.end, goal_id: p.goal_id } });
    }
  }
  // Ce qui ne rentre plus : proposé pour demain (avec la même durée).
  const placedIds = new Set(plan.placed.map((p) => p.key.split('#')[0]));
  const left = items.filter((i) => !placedIds.has(i.key!));
  const tomorrowPlan = left.length
    ? proposeDayPlan(
        tomorrow,
        left.map((i) => ({ ...i, priority: 'should' as const })),
        l.tasks.filter((t) => t.date === tomorrow && t.start && t.end).map((t) => ({ date: t.date, start: t.start!, end: t.end! })),
        { bestRanges: bestRanges as never, sportWeekMin: 999 },
        { sleep: l.sleep },
        'normal',
      )
    : null;
  const movedTomorrow = new Set<string>();
  for (const p of tomorrowPlan?.placed ?? []) {
    const id = p.key.split('#')[0];
    if (!movedTomorrow.has(id)) {
      movedTomorrow.add(id);
      ops.push({ op: 'move', id, date: tomorrow, start: p.start, end: p.end });
    } else ops.push({ op: 'create', ref: `new-${crypto.randomUUID().slice(0, 8)}`, task: { title: p.title, category: p.category, date: tomorrow, start: p.start, end: p.end, goal_id: p.goal_id } });
  }
  return { ops, tomorrow: left, stillUnplaced: left.filter((i) => !movedTomorrow.has(i.key!)) };
}

async function replanMode(req: AssistantRequest, deps: Deps): Promise<AssistantResponse> {
  const { db } = deps;
  const l = await load(db, deps.nowMs());
  const ins = l.aggregates ? computeInsights(l.aggregates) : null;
  const r = replanRestOfDay(l, ins?.bestRanges ?? [], healthGuard(l.health));
  // Vérification : les tâches déplacées sont d'abord « retirées » de la frise (sinon deux échanges de place se gêneraient).
  const moved = new Map(r.ops.flatMap((op) => (op.op === 'move' ? [[op.id, l.tasks.find((t) => t.id === op.id)!] as const] : [])));
  const parked = l.tasks.map((t) => (moved.has(t.id) ? { ...t, start: null, end: null } : t));
  const applied = applyOps(parked, r.ops, { sleep: l.sleep, allowedDates: l.calendarDates.slice(0, 2) });
  const check = {
    ok: applied.ok,
    errors: applied.errors,
    inverse: applied.inverse.map((op) => {
      const orig = op.op === 'move' ? moved.get(op.id) : undefined;
      return orig && op.op === 'move' ? { ...op, date: orig.date, start: orig.start ?? op.start, end: orig.end ?? op.end } : op;
    }),
  };
  const details = r.ops.map((op) => describeOp(op, l.tasks));
  const action: ProposedAction = {
    type: 'task_ops',
    tool: 'replan_rest_of_day',
    label: details.length ? `Fin de journée réorganisée : ${details.length} changement${details.length > 1 ? 's' : ''}` : 'Rien à réorganiser',
    details: [...details, ...r.stillUnplaced.map((i) => `Sans place : ${i.title}`)],
    date: l.now.date,
    ops: check.ok ? r.ops : [],
    inverse: check.inverse,
  };
  const fallback = !r.ops.length
    ? 'Ta fin de journée tient déjà dans tes créneaux libres.'
    : `Je décale ${r.ops.length} tâche${r.ops.length > 1 ? 's' : ''} à partir de ${toHHMM(Math.ceil((l.now.minutes + 5) / 5) * 5)}${r.tomorrow.length ? ` ; ${r.tomorrow.map((i) => i.title).join(', ')} passe à demain` : ''}.`;
  const actions = r.ops.length && check.ok ? [action] : [];
  let reply = fallback;
  let meta: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number; latencyMs?: number } = {};
  let ai = false;
  if (r.ops.length && (await db.takeQuota())) {
    const started = deps.nowMs();
    try {
      const res = await chatWithFallback(deps.providers, {
        system: buildSystemPrompt(l.context, 'replan_rest_of_day'),
        messages: [{ role: 'user', content: `Il est ${l.now.time}. Changements :\n${details.join('\n')}` }],
        maxTokens: 300,
        temperature: 0.5,
      });
      reply = res.text.trim() || fallback;
      meta = { provider: res.provider, model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, latencyMs: deps.nowMs() - started };
      ai = true;
    } catch {
      /* explication sans IA */
    }
  }
  const conversationId = await db.ensureConversation(req.conversation_id ?? null, 'day', 'Réorganisation de la journée');
  const { messageId, actionIds } = await persist(db, conversationId, 'Réorganise le reste de ma journée.', { text: reply, actions, ...meta });
  return baseResponse(reply, {
    conversation_id: conversationId,
    message_id: messageId,
    proposed_actions: withIds(actions, actionIds),
    ops: actions.length ? r.ops : [],
    tomorrow: r.tomorrow,
    ai,
    provider: meta.provider,
    model: meta.model,
    remaining: (await db.quota())?.remaining ?? null,
    errors: check.ok ? undefined : check.errors,
  });
}

export async function handleAssistant(req: AssistantRequest, deps: Deps): Promise<AssistantResponse> {
  switch (req.mode) {
    case 'chat':
      return chatMode(req, deps);
    case 'guided_parse':
      return guidedParseMode(req, deps);
    case 'explain_plan':
      return explainPlanMode(req, deps);
    case 'adjust_plan':
      return adjustPlanMode(req, deps);
    case 'replan_rest_of_day':
      return replanMode(req, deps);
    default:
      throw new Error('Mode inconnu.');
  }
}
