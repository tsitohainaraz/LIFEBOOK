// OpenRouter : secours gratuit, utilisé si Groq renvoie 429 ou 5xx.
import { makeOpenAICompatProvider, type FetchLike } from './openaiCompat.ts';
import type { LlmProvider } from './types.ts';

export function makeOpenRouter(apiKey: string, model: string, fetchImpl?: FetchLike): LlmProvider {
  return makeOpenAICompatProvider({
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    model,
    extraHeaders: { 'HTTP-Referer': 'https://lifebook-rust.vercel.app', 'X-Title': 'LifeBook' },
    fetchImpl,
  });
}
