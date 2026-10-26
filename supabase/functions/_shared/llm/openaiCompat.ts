// Fournisseur compatible avec l'API Chat Completions d'OpenAI (utilisé pour Groq et OpenRouter).
import { toOpenAITools } from './tools.ts';
import { LlmError, parseArgs, type ChatRequest, type ChatResult, type LlmMessage, type LlmProvider } from './types.ts';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface OpenAICompatOptions {
  name: string;
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  /** Champs propres au fournisseur ajoutés au corps de la requête (ex. NVIDIA : réflexion désactivée). */
  extraBody?: Record<string, unknown>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

type OAMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toOpenAIMessages(system: string, messages: LlmMessage[]): OAMessage[] {
  const out: OAMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) }
          : {}),
      });
    } else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

interface OAResponse {
  model?: string;
  choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function parseOpenAIResponse(json: OAResponse, provider: string, model: string): ChatResult {
  const msg = json.choices?.[0]?.message;
  return {
    text: msg?.content ?? '',
    toolCalls: (msg?.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${i}`, name: c.function.name, arguments: parseArgs(c.function.arguments) })),
    usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
    provider,
    model: json.model ?? model,
  };
}

export function makeOpenAICompatProvider(o: OpenAICompatOptions): LlmProvider {
  const doFetch: FetchLike = o.fetchImpl ?? ((u, i) => fetch(u, i));
  return {
    name: o.name,
    model: o.model,
    async chat(req: ChatRequest): Promise<ChatResult> {
      const body = {
        model: o.model,
        messages: toOpenAIMessages(req.system, req.messages),
        ...(req.tools?.length ? { tools: toOpenAITools(req.tools), tool_choice: 'auto' } : {}),
        max_tokens: req.maxTokens ?? 1200,
        temperature: req.temperature ?? 0.4,
        ...(o.extraBody ?? {}),
      };
      const send = async (payload: typeof body): Promise<Response> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 45_000);
        try {
          return await doFetch(o.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}`, ...(o.extraHeaders ?? {}) },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
        } catch (e) {
          throw new LlmError(`Réseau indisponible (${o.name}) : ${e instanceof Error ? e.message : String(e)}`, o.name);
        } finally {
          clearTimeout(timer);
        }
      };
      let res = await send(body);
      let detail = '';
      if (!res.ok) {
        detail = (await res.text().catch(() => '')).slice(0, 300);
        // Appel d'outil mal formé par le modèle (fréquent avec Llama sur Groq) : un seul nouvel essai, plus déterministe.
        if (res.status === 400 && /tool_use_failed|failed_generation/.test(detail)) {
          res = await send({ ...body, temperature: 0 });
          if (!res.ok) detail = (await res.text().catch(() => '')).slice(0, 300);
        }
      }
      if (!res.ok) throw new LlmError(`${o.name} a répondu ${res.status} : ${detail}`, o.name, res.status);
      return parseOpenAIResponse((await res.json()) as OAResponse, o.name, o.model);
    },
  };
}
