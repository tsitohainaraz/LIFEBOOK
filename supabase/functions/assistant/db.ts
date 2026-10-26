// Accès aux données avec le client Supabase de l'utilisateur (jeton de l'en-tête Authorization) : la RLS s'applique.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';
import type { ProposedAction } from '../_shared/assistant/actions.ts';
import type { AiContextKind, AssistantDb, MessageLog, Quota } from '../_shared/assistant/handler.ts';
import type { InsightAggregates } from '../_shared/planning/insights.ts';

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseDb(sb: SupabaseClient, userId: string): AssistantDb {
  return {
    async quota() {
      const rows = must(await sb.rpc('ai_quota')) as Quota[] | null;
      return rows?.[0] ?? null;
    },
    async takeQuota() {
      return must(await sb.rpc('ai_take_quota')) === true;
    },
    async profile() {
      return must(
        await sb
          .from('profiles')
          .select('first_name, birth_date, status, status_detail, faith, faith_detail, sleep_hours, work_hours, retire_age, timezone, health_consent_at')
          .eq('id', userId)
          .maybeSingle(),
      );
    },
    async settings() {
      const row = must(await sb.from('ai_settings').select('auto_apply, use_health').eq('user_id', userId).maybeSingle());
      return row ?? { auto_apply: false, use_health: true };
    },
    async tasks(from, to) {
      const rows = must(
        await sb
          .from('tasks')
          .select('id, title, category, date, start_time, end_time, done_at, goal_id, is_priority, postponed_count')
          .gte('date', from)
          .lte('date', to)
          .order('date')
          .limit(500),
      ) as {
        id: string;
        title: string;
        category: string;
        date: string;
        start_time: string | null;
        end_time: string | null;
        done_at: string | null;
        goal_id: string | null;
        is_priority: boolean;
        postponed_count: number;
      }[];
      return rows.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        date: t.date,
        start: hm(t.start_time),
        end: hm(t.end_time),
        done: !!t.done_at,
        goal_id: t.goal_id,
        is_priority: t.is_priority,
        postponed_count: t.postponed_count,
      }));
    },
    async goals() {
      const rows = must(
        await sb
          .from('goals')
          .select('id, title, domain, level, deadline, target_age, done_at, goal_steps(title, due_date, done_at)')
          .is('done_at', null)
          .order('deadline', { ascending: true, nullsFirst: false })
          .limit(30),
      ) as {
        id: string;
        title: string;
        domain: string;
        level: string;
        deadline: string | null;
        target_age: number | null;
        done_at: string | null;
        goal_steps: { title: string; due_date: string | null; done_at: string | null }[];
      }[];
      return rows.map((g) => ({
        id: g.id,
        title: g.title,
        domain: g.domain,
        level: g.level,
        deadline: g.deadline,
        target_age: g.target_age,
        done: !!g.done_at,
        steps: (g.goal_steps ?? []).slice(0, 8).map((s) => ({ title: s.title, due_date: s.due_date, done: !!s.done_at })),
      }));
    },
    async lifePlan() {
      const row = must(await sb.from('life_plan').select('mission, values').eq('user_id', userId).maybeSingle()) as { mission: string | null; values: string[] } | null;
      return row ? { mission: row.mission, values: row.values ?? [] } : null;
    },
    async insights(days) {
      const res = await sb.rpc('get_insights', { days });
      return res.error ? null : (res.data as InsightAggregates);
    },
    async memories() {
      return must(await sb.from('ai_memory').select('kind, text').order('created_at', { ascending: false }).limit(30)) ?? [];
    },
    async health() {
      // Lecture seulement si les données existent (consentement santé côté application).
      const [hp, log, fam] = await Promise.all([
        sb.from('health_profiles').select('systolic, diastolic, conditions, diabetes').eq('user_id', userId).maybeSingle(),
        sb.from('health_logs').select('systolic, diastolic').not('systolic', 'is', null).order('logged_at', { ascending: false }).limit(1).maybeSingle(),
        sb.from('family_history').select('disease, answer').eq('answer', 'oui'),
      ]);
      if (!hp.data && !log.data && !(fam.data ?? []).length) return null;
      return {
        systolic: log.data?.systolic ?? hp.data?.systolic ?? null,
        diastolic: log.data?.diastolic ?? hp.data?.diastolic ?? null,
        conditions: hp.data?.conditions ?? [],
        diabetes: hp.data?.diabetes ?? null,
        familyYes: (fam.data ?? []).map((f: { disease: string }) => f.disease),
      };
    },
    async history(conversationId, limit) {
      const rows = must(
        await sb.from('ai_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit),
      ) as { role: 'user' | 'assistant'; content: string }[];
      return rows.reverse().filter((r) => r.content);
    },
    async ensureConversation(id: string | null, context: AiContextKind, title: string) {
      if (id) {
        const row = must(await sb.from('ai_conversations').select('id').eq('id', id).maybeSingle());
        if (row) {
          await sb.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
          return id;
        }
      }
      const row = must(await sb.from('ai_conversations').insert({ user_id: userId, context, title: title.slice(0, 120) || 'Nouvelle conversation' }).select('id').single()) as { id: string };
      return row.id;
    },
    async insertMessage(m: MessageLog) {
      const row = must(await sb.from('ai_messages').insert({ ...m, user_id: userId, proposed_actions: m.proposed_actions ?? [] }).select('id').single()) as { id: string };
      return row.id;
    },
    async insertActions(messageId: string, actions: ProposedAction[]) {
      const rows = must(
        await sb
          .from('ai_actions')
          .insert(actions.map((a, index) => ({ user_id: userId, message_id: messageId, action_type: a.type, payload: { ...a, index }, inverse: a.type === 'task_ops' ? a.inverse : null })))
          .select('id'),
      ) as { id: string }[];
      return rows.map((r) => r.id);
    },
  };
}
