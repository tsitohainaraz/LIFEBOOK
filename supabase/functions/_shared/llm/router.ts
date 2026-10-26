// Choix du fournisseur et secours : Anthropic (premium + clé), puis NVIDIA, Groq et OpenRouter, dans cet ordre.
import { makeAnthropic } from './anthropic.ts';
import { makeGroq } from './groq.ts';
import { makeNvidia } from './nvidia.ts';
import { makeOpenRouter } from './openrouter.ts';
import { LlmError, type ChatRequest, type ChatResult, type LlmProvider } from './types.ts';

export interface LlmEnv {
  NVIDIA_API_KEY?: string;
  NVIDIA_MODEL?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_FREE_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

export function providersFor(env: LlmEnv, premium: boolean): LlmProvider[] {
  const list: LlmProvider[] = [];
  if (premium && env.ANTHROPIC_API_KEY) list.push(makeAnthropic({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }));
  if (env.NVIDIA_API_KEY) list.push(makeNvidia(env.NVIDIA_API_KEY, env.NVIDIA_MODEL));
  if (env.GROQ_API_KEY) list.push(makeGroq(env.GROQ_API_KEY));
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_FREE_MODEL) list.push(makeOpenRouter(env.OPENROUTER_API_KEY, env.OPENROUTER_FREE_MODEL));
  return list;
}

/**
 * Essaie les fournisseurs dans l'ordre. Toute erreur d'un fournisseur (limite, panne, clé refusée, requête rejetée)
 * fait passer au suivant ; seule l'erreur du dernier est renvoyée. Les autres erreurs (bug du code) remontent tout de suite.
 */
export async function chatWithFallback(providers: LlmProvider[], req: ChatRequest): Promise<ChatResult> {
  if (!providers.length) throw new LlmError("Aucun fournisseur d'IA configuré.", 'router', 503);
  const errors: string[] = [];
  for (const p of providers) {
    try {
      return await p.chat(req);
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      errors.push(e.message);
      if (p === providers[providers.length - 1]) {
        throw new LlmError(errors.join(' | '), e.provider, e.status);
      }
    }
  }
  throw new LlmError('Tous les fournisseurs ont échoué.', 'router', 503);
}
