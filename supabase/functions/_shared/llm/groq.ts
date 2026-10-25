// Groq : fournisseur principal (API compatible OpenAI).
import { makeOpenAICompatProvider, type FetchLike } from './openaiCompat.ts';
import type { LlmProvider } from './types.ts';

export const GROQ_MODEL = 'llama-3.3-70b-versatile';

export function makeGroq(apiKey: string, fetchImpl?: FetchLike): LlmProvider {
  return makeOpenAICompatProvider({
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey,
    model: GROQ_MODEL,
    fetchImpl,
  });
}
