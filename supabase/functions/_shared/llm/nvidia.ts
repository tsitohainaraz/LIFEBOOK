// NVIDIA (build.nvidia.com) : fournisseur principal quand NVIDIA_API_KEY existe (API compatible OpenAI).
import { makeOpenAICompatProvider, type FetchLike } from './openaiCompat.ts';
import type { LlmProvider } from './types.ts';

export const NVIDIA_DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

export function makeNvidia(apiKey: string, model?: string, fetchImpl?: FetchLike): LlmProvider {
  return makeOpenAICompatProvider({
    name: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    apiKey,
    model: model || NVIDIA_DEFAULT_MODEL,
    // Pas de « réflexion » avant la réponse : plus rapide, et l'assistante répond en 5 phrases au plus.
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
    // Grand modèle : on lui laisse un peu plus de temps avant de passer au secours.
    timeoutMs: 60_000,
    fetchImpl,
  });
}
