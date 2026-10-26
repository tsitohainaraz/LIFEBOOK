// Appel de l'Edge Function `assistant` (le jeton de session est envoyé automatiquement).
import { supabase } from '../../lib/supabase';
import type { AiContext } from '../../types/database';
import type { PlanOp, PlanTask } from '../../utils/planOps';
import type { ToPlace } from '../../utils/scheduler';
import type { StoredAction } from './assistantUtils';

export type AssistantMode = 'chat' | 'guided_parse' | 'explain_plan' | 'adjust_plan' | 'replan_rest_of_day';

export interface AssistantRequest {
  mode: AssistantMode;
  conversation_id?: string | null;
  context?: AiContext;
  message?: string;
  date?: string;
  energy?: 'fatigue' | 'normal' | 'top';
  answers?: { question: string; answer: string }[];
  plan?: { id?: string; title: string; category?: string; start: string; end: string; goal_id?: string | null }[];
  non_places?: string[];
}

export interface AssistantResponse {
  conversation_id?: string;
  message_id?: string;
  reply: string;
  proposed_actions: StoredAction[];
  crisis: boolean;
  quota_exceeded: boolean;
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

export class AssistantError extends Error {}

export async function callAssistant(body: AssistantRequest): Promise<AssistantResponse> {
  const { data, error } = await supabase.functions.invoke<AssistantResponse>('assistant', { body });
  if (error || !data) {
    let message = "L'assistante est indisponible pour le moment. Réessaie dans un instant.";
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j.error) message = j.error;
      } catch {
        /* message par défaut */
      }
    }
    throw new AssistantError(message);
  }
  return data;
}
