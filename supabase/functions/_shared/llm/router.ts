// Choix du fournisseur et secours : Anthropic (premium + clé), sinon Groq, puis OpenRouter si Groq renvoie 429 ou 5xx.
import { makeAnthropic } from './anthropic.ts';
import { makeGroq } from './groq.ts';
import { makeOpenRouter } from './openrouter.ts';
import { LlmError, type ChatRequest, type ChatResult, type LlmProvider } from './types.ts';

export interface LlmEnv {
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_FREE_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

export function providersFor(env: LlmEnv, premium: boolean): LlmProvider[] {
  const list: LlmProvider[] = [];
  if (premium && env.ANTHROPIC_API_KEY) list.push(makeAnthropic({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }));
  if (env.GROQ_API_KEY) list.push(makeGroq(env.GROQ_API_KEY));
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_FREE_MODEL) list.push(makeOpenRouter(env.OPENROUTER_API_KEY, env.OPENROUTER_FREE_MODEL));
  return list;
}

/** Essaie les fournisseurs dans l'ordre ; passe au suivant seulement sur 429, 5xx ou erreur réseau. */
export async function chatWithFallback(providers: LlmProvider[], req: ChatRequest): Promise<ChatResult> {
  if (!providers.length) throw new LlmError("Aucun fournisseur d'IA configuré.", 'router', 503);
  let last: unknown;
  for (const p of providers) {
    try {
      return await p.chat(req);
    } catch (e) {
      last = e;
      if (!(e instanceof LlmError) || !e.retryable) throw e;
    }
  }
  throw last instanceof Error ? last : new LlmError('Tous les fournisseurs ont échoué.', 'router', 503);
}
